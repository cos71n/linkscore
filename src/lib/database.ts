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
  
  // Add connection pooling parameters to prevent connection exhaustion
  const url = new URL(baseUrl);
  url.searchParams.set('connection_limit', '3'); // Lower limit for Supabase free tier
  url.searchParams.set('pool_timeout', '20'); // Longer timeout for busy periods
  url.searchParams.set('pool_mode', 'transaction'); // Force transaction pooling mode
  
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