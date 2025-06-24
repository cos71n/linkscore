import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    // Check if we can connect to database
    await prisma.$queryRawUnsafe('SELECT 1');
    
    // Get database info
    const dbInfo = await prisma.$queryRawUnsafe(`
      SELECT 
        current_database() as database_name,
        current_user as user_name,
        inet_server_addr() as server_ip,
        version() as version
    `) as any[];
    
    // Count total analyses
    const analysisCount = await prisma.analysis.count();
    
    // Get latest analyses
    const latestAnalyses = await prisma.analysis.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, createdAt: true }
    });
    
    return NextResponse.json({
      status: 'connected',
      database: dbInfo[0],
      stats: {
        totalAnalyses: analysisCount
      },
      latestAnalyses,
      environment: {
        nodeEnv: process.env.NODE_ENV,
        vercel: !!process.env.VERCEL,
        databaseUrl: process.env.DATABASE_URL ? 
          process.env.DATABASE_URL.replace(/postgresql:\/\/[^@]*@/, 'postgresql://***:***@') : 
          'Not set'
      }
    });
    
  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
      error: error.message,
      environment: {
        nodeEnv: process.env.NODE_ENV,
        vercel: !!process.env.VERCEL,
        databaseUrl: process.env.DATABASE_URL ? 'Set' : 'Not set'
      }
    }, { status: 500 });
  }
} 