import { PrismaClient } from '../generated/prisma';

/**
 * Global Prisma client instance for LinkScore
 * Handles connection pooling and prevents multiple instances in development
 */

declare global {
  // Prevent TypeScript errors for the global prisma variable
  var __prisma: PrismaClient | undefined;
}

// Create connection-limited database URL for Supabase
const getDatabaseUrl = () => {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) return baseUrl;
  
  // Enhanced connection pooling parameters for paid Supabase plan
  const url = new URL(baseUrl);
  
  // Core pooling settings optimized for concurrent users
  url.searchParams.set('connection_limit', '25'); // Higher limit for paid plan (up from 20)
  url.searchParams.set('pool_timeout', '90'); // Increased timeout for high concurrency
  url.searchParams.set('pool_mode', 'transaction'); // Use dedicated transaction pooler (port 6543)
  
  // Statement caching and prepared statement optimization
  url.searchParams.set('statement_cache_size', '0'); // Disable statement caching completely
  url.searchParams.set('prepared_statements', 'false'); // Disable prepared statements in pool
  
  // Connection management for high concurrency
  url.searchParams.set('application_name', 'LinkScore_Production'); // Identify our app in connection logs
  url.searchParams.set('connect_timeout', '30'); // Connection establishment timeout
  url.searchParams.set('idle_timeout', '300'); // 5 minutes idle timeout to recycle connections
  
  // Performance optimizations for paid plan
  url.searchParams.set('max_lifetime', '3600'); // 1 hour max connection lifetime
  url.searchParams.set('pool_pre_ping', 'true'); // Validate connections before use
  
  console.log('🔗 Database URL configured for paid Supabase with high concurrency support');
  
  return url.toString();
};

// Singleton pattern to prevent multiple Prisma instances with connection pooling
const prisma = global.__prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  datasources: {
    db: {
      url: getDatabaseUrl()
    }
  }
});

if (process.env.NODE_ENV === 'development') {
  global.__prisma = prisma;
}

/**
 * Database connection utilities
 */
export { prisma };

/**
 * Test database connectivity
 */
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    console.log('✅ Database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

/**
 * Graceful database disconnection
 */
export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    console.log('🔌 Database disconnected gracefully');
  } catch (error) {
    console.error('❌ Error disconnecting from database:', error);
  }
}

/**
 * Database health check for monitoring
 */
export async function getDatabaseHealth() {
  try {
    const start = Date.now();
    await executeWithTimeout(
      () => prisma.$queryRawUnsafe('SELECT 1'),
      5000,
      'Database health check'
    );
    const responseTime = Date.now() - start;
    
    return {
      status: 'healthy',
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Initialize database connection and validate schema
 */
export async function initializeDatabase(): Promise<void> {
  try {
    console.log('🔄 Initializing database connection...');
    
    // Test connection
    const isConnected = await testDatabaseConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to database');
    }
    
    // Validate that tables exist
    const tableCount = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'analyses', 'security_events', 'rate_limits')
    `);
    
    console.log('📊 Database schema validated');
    console.log('✅ Database initialization complete');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

/**
 * Database resource management and cleanup utilities
 */

/**
 * Execute query with timeout to prevent hanging queries
 */
export async function executeWithTimeout<T>(
  queryFn: () => Promise<T>,
  timeoutMs: number = 30000,
  description: string = 'Database query'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`${description} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([queryFn(), timeoutPromise]);
  } catch (error) {
    console.error(`❌ ${description} failed:`, error);
    throw error;
  }
}

/**
 * Kill long-running database queries (requires elevated privileges)
 */
export async function killLongRunningQueries(maxDurationMinutes: number = 10): Promise<void> {
  try {
    const longRunningQueries = await executeWithTimeout(
      () => prisma.$queryRawUnsafe(`
        SELECT 
          pid,
          query,
          state,
          query_start,
          NOW() - query_start as duration
        FROM pg_stat_activity 
        WHERE 
          state = 'active' 
          AND query NOT LIKE '%pg_stat_activity%'
          AND NOW() - query_start > INTERVAL '${maxDurationMinutes} minutes'
          AND query NOT LIKE '%COMMIT%'
          AND query NOT LIKE '%ROLLBACK%'
      `),
      10000,
      'Find long-running queries'
    ) as any[];

    for (const query of longRunningQueries) {
      console.warn(`🚨 Killing long-running query (${query.duration}):`, {
        pid: query.pid,
        query: query.query.substring(0, 100)
      });
      
              try {
          await executeWithTimeout(
            () => prisma.$queryRawUnsafe(`SELECT pg_terminate_backend(${query.pid})`),
            5000,
            `Kill query ${query.pid}`
          );
        } catch (killError) {
          console.error(`Failed to kill query ${query.pid}:`, killError);
        }
    }

    if (longRunningQueries.length > 0) {
      console.log(`✅ Terminated ${longRunningQueries.length} long-running queries`);
    }
  } catch (error) {
    console.error('❌ Failed to kill long-running queries:', error);
  }
}

/**
 * Clean up stuck/abandoned analyses
 */
export async function cleanupStuckAnalyses(maxAgeMinutes: number = 15): Promise<void> {
  try {
    console.log('🧹 Cleaning up stuck analyses...');
    
    const stuckAnalyses = await executeWithTimeout(
      () => prisma.analysis.findMany({
        where: {
          status: 'processing',
          createdAt: {
            lte: new Date(Date.now() - maxAgeMinutes * 60 * 1000)
          }
        },
        select: { id: true, createdAt: true, user: { select: { domain: true } } }
      }),
      10000,
      'Find stuck analyses'
    );

    if (stuckAnalyses.length > 0) {
      console.log(`🚨 Found ${stuckAnalyses.length} stuck analyses older than ${maxAgeMinutes} minutes`);
      
      // Update stuck analyses to failed status
      const updateResult = await executeWithTimeout(
        () => prisma.analysis.updateMany({
          where: {
            id: { in: stuckAnalyses.map(a => a.id) },
            status: 'processing'
          },
          data: {
            status: 'failed',
            errorMessage: `Analysis timeout - exceeded ${maxAgeMinutes} minute limit`
          }
        }),
        15000,
        'Update stuck analyses'
      );

      console.log(`✅ Cleaned up ${Number(updateResult.count)} stuck analyses`);
      
      // Log the cleanup for monitoring
      for (const analysis of stuckAnalyses) {
        console.log(`📝 Cleaned up stuck analysis: ${analysis.id} for ${analysis.user?.domain} (age: ${Math.round((Date.now() - analysis.createdAt.getTime()) / 60000)} min)`);
      }
    } else {
      console.log('✅ No stuck analyses found');
    }
  } catch (error) {
    console.error('❌ Failed to cleanup stuck analyses:', error);
  }
}

/**
 * Monitor database resource usage
 */
export async function getDatabaseResourceUsage() {
  try {
    // Use executeWithTimeout to add resilience to all queries
    const [connections, activeQueries, databaseSize] = await Promise.all([
      // Active connections
      executeWithTimeout(
        () => prisma.$queryRawUnsafe(`
          SELECT 
            count(*) as total_connections,
            count(*) FILTER (WHERE state = 'active') as active_connections,
            count(*) FILTER (WHERE state = 'idle') as idle_connections
          FROM pg_stat_activity 
          WHERE datname = current_database()
        `),
        5000,
        'Get connection stats'
      ),
      
      // Long-running queries
      executeWithTimeout(
        () => prisma.$queryRawUnsafe(`
          SELECT 
            count(*) as long_running_queries
          FROM pg_stat_activity 
          WHERE 
            state = 'active' 
            AND query NOT LIKE '%pg_stat_activity%'
            AND NOW() - query_start > INTERVAL '5 minutes'
        `),
        5000,
        'Get long-running queries'
      ),
      
      // Database size
      executeWithTimeout(
        () => prisma.$queryRawUnsafe(`
          SELECT pg_size_pretty(pg_database_size(current_database())) as database_size
        `),
        5000,
        'Get database size'
      )
    ]);

    // Type assertion for the results
    const connectionsResult = connections as any[];
    const activeQueriesResult = activeQueries as any[];
    const databaseSizeResult = databaseSize as any[];

    return {
      connections: {
        total_connections: Number(connectionsResult[0].total_connections),
        active_connections: Number(connectionsResult[0].active_connections),
        idle_connections: Number(connectionsResult[0].idle_connections)
      },
      longRunningQueries: Number(activeQueriesResult[0].long_running_queries),
      databaseSize: databaseSizeResult[0].database_size,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Failed to get database resource usage:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Start automatic resource cleanup scheduler
 */
export function startResourceMonitoring(): void {
  if (typeof window !== 'undefined') return; // Only run on server side
  
  console.log('🔄 Starting database resource monitoring...');
  
  // Cleanup stuck analyses every 5 minutes
  setInterval(async () => {
    try {
      await cleanupStuckAnalyses(15); // Clean analyses older than 15 minutes
    } catch (error) {
      console.error('❌ Resource cleanup failed:', error);
    }
  }, 5 * 60 * 1000); // Every 5 minutes

  // Kill long-running queries every 10 minutes
  setInterval(async () => {
    try {
      await killLongRunningQueries(10); // Kill queries running longer than 10 minutes
    } catch (error) {
      console.error('❌ Query cleanup failed:', error);
    }
  }, 10 * 60 * 1000); // Every 10 minutes

  // Log resource usage every 15 minutes
  setInterval(async () => {
    try {
      const usage = await getDatabaseResourceUsage();
      console.log('📊 Database resource usage:', usage);
      
      // Alert if too many connections
      if (usage.connections && usage.connections.total_connections > 15) {
        console.warn('🚨 High database connection usage:', usage.connections);
      }
    } catch (error) {
      console.error('❌ Resource monitoring failed:', error);
    }
  }, 15 * 60 * 1000); // Every 15 minutes
}

/**
 * Warm up database connections for optimal concurrent performance
 * Particularly useful for paid Supabase plans with higher connection limits
 */
export async function warmupConnections(targetConnections: number = 5): Promise<void> {
  try {
    console.log(`🔥 Warming up ${targetConnections} database connections...`);
    
    // Create multiple concurrent connections to pre-populate the pool
    const warmupPromises = Array.from({ length: targetConnections }, async (_, index) => {
      try {
        await executeWithTimeout(
          () => prisma.$queryRawUnsafe(`SELECT ${index + 1} as connection_test`),
          5000,
          `Connection warmup ${index + 1}`
        );
        return true;
      } catch (error) {
        console.warn(`⚠️ Connection warmup ${index + 1} failed:`, error);
        return false;
      }
    });
    
    const results = await Promise.all(warmupPromises);
    const successCount = results.filter(Boolean).length;
    
    console.log(`✅ Connection warmup complete: ${successCount}/${targetConnections} connections established`);
    
    if (successCount < targetConnections * 0.7) {
      console.warn('🚨 Connection warmup below 70% success rate - check database configuration');
    }
    
  } catch (error) {
    console.error('❌ Connection warmup failed:', error);
  }
}

/**
 * Monitor connection pool health for concurrent operations
 */
export async function getConnectionPoolHealth() {
  try {
    const start = Date.now();
    
    // Test connection pool responsiveness
    const connectionTest = await executeWithTimeout(
      () => prisma.$queryRawUnsafe(`
        SELECT 
          current_database() as database_name,
          current_user as user_name,
          version() as server_version,
          NOW() as server_time
      `),
      10000,
      'Connection pool health check'
    );
    
    const responseTime = Date.now() - start;
    
    // Get active connection information
    const connectionStats = await executeWithTimeout(
      () => prisma.$queryRawUnsafe(`
        SELECT 
          application_name,
          state,
          COUNT(*) as connection_count
        FROM pg_stat_activity 
        WHERE datname = current_database()
        GROUP BY application_name, state
        ORDER BY connection_count DESC
      `),
      5000,
      'Connection statistics'
    ) as any[];
    
    return {
      status: 'healthy',
      responseTime: `${responseTime}ms`,
      connectionStats,
      timestamp: new Date().toISOString(),
      recommendations: responseTime > 2000 ? ['Consider connection pool optimization'] : []
    };
    
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      recommendations: ['Check database connectivity', 'Review connection pool settings']
    };
  }
}

// Clean up on process exit
if (typeof process !== 'undefined') {
  process.on('beforeExit', async () => {
    await disconnectDatabase();
  });
  
  process.on('SIGINT', async () => {
    await disconnectDatabase();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await disconnectDatabase();
    process.exit(0);
  });
} 