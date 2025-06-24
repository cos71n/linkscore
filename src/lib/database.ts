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
  
  // Add connection pooling parameters for dedicated transaction pooler (paid plan)
  const url = new URL(baseUrl);
  url.searchParams.set('connection_limit', '20'); // Higher limit for paid plan
  url.searchParams.set('pool_timeout', '60'); // Longer timeout for busy periods
  url.searchParams.set('pool_mode', 'transaction'); // Use dedicated transaction pooler
  url.searchParams.set('statement_cache_size', '0'); // Disable statement caching to prevent conflicts
  
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
    await prisma.$queryRaw`SELECT 1`;
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
    await prisma.$queryRaw`SELECT 1`;
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
    const tableCount = await prisma.$queryRaw`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'analyses', 'security_events', 'rate_limits')
    `;
    
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
    const longRunningQueries = await prisma.$queryRaw`
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
    ` as unknown as any[];

    for (const query of longRunningQueries) {
      console.warn(`🚨 Killing long-running query (${query.duration}):`, {
        pid: query.pid,
        query: query.query.substring(0, 100)
      });
      
      try {
        await prisma.$queryRaw`SELECT pg_terminate_backend(${query.pid})`;
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

      console.log(`✅ Cleaned up ${updateResult.count} stuck analyses`);
      
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
    const [connections, activeQueries, databaseSize] = await Promise.all([
      // Active connections
      prisma.$queryRaw`
        SELECT 
          count(*) as total_connections,
          count(*) FILTER (WHERE state = 'active') as active_connections,
          count(*) FILTER (WHERE state = 'idle') as idle_connections
        FROM pg_stat_activity 
        WHERE datname = current_database()
      ` as unknown as any[],
      
      // Long-running queries
      prisma.$queryRaw`
        SELECT 
          count(*) as long_running_queries
        FROM pg_stat_activity 
        WHERE 
          state = 'active' 
          AND query NOT LIKE '%pg_stat_activity%'
          AND NOW() - query_start > INTERVAL '5 minutes'
      ` as unknown as any[],
      
      // Database size
      prisma.$queryRaw`
        SELECT pg_size_pretty(pg_database_size(current_database())) as database_size
      ` as unknown as any[]
    ]);

    return {
      connections: connections[0],
      longRunningQueries: activeQueries[0].long_running_queries,
      databaseSize: databaseSize[0].database_size,
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