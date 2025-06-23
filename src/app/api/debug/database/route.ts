import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';

export async function GET(request: NextRequest) {
  try {
    // Check if we can connect to database
    await prisma.$queryRaw`SELECT 1`;
    
    // Get database info
    const dbInfo = await prisma.$queryRaw`
      SELECT 
        current_database() as database_name,
        current_user as user_name,
        inet_server_addr() as server_ip,
        version() as version
    ` as any[];
    
    // Count total analyses
    const analysisCount = await prisma.analysis.count();
    
    // Check if specific analysis exists
    const specificAnalysis = await prisma.analysis.findUnique({
      where: { id: 'eb8fc0a5-6ddd-43e8-a5a9-e6f00913e361' },
      select: { id: true, status: true, createdAt: true }
    });
    
    // DEBUG: Check the problematic analysis
    const problematicAnalysis = await prisma.analysis.findUnique({
      where: { id: '693d18a3-820d-4ba4-9ab4-d91d0e2e57bc' },
      select: { 
        id: true, 
        status: true, 
        createdAt: true,
        user: true,
        targetKeywords: true,
        competitors: true
      }
    });
    
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
        totalAnalyses: analysisCount,
        specificAnalysisExists: !!specificAnalysis,
        specificAnalysisData: specificAnalysis
      },
      // DEBUG: Include the problematic analysis data
      problematicAnalysis,
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