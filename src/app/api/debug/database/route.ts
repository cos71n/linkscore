import { NextRequest, NextResponse } from 'next/server';
import { 
  prisma, 
  testDatabaseConnection, 
  getDatabaseHealth,
  executeWithTimeout,
  killLongRunningQueries,
  cleanupStuckAnalyses,
  getDatabaseResourceUsage
} from '@/lib/database';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    switch (action) {
      case 'health':
        const health = await getDatabaseHealth();
        return NextResponse.json(health);

      case 'resources':
        const resources = await getDatabaseResourceUsage();
        return NextResponse.json(resources);

      case 'cleanup':
        console.log('🧹 Manual cleanup requested...');
        await cleanupStuckAnalyses(15);
        return NextResponse.json({ 
          success: true, 
          message: 'Cleanup completed - check logs for details' 
        });

      case 'kill-queries':
        console.log('🔪 Manual query termination requested...');
        await killLongRunningQueries(10);
        return NextResponse.json({ 
          success: true, 
          message: 'Long-running queries terminated - check logs for details' 
        });

      case 'stuck-analyses':
        const stuckAnalyses = await executeWithTimeout(
          () => prisma.analysis.findMany({
            where: {
              status: 'processing',
              createdAt: {
                lte: new Date(Date.now() - 15 * 60 * 1000) // 15 minutes ago
              }
            },
            select: { 
              id: true, 
              createdAt: true, 
              user: { select: { domain: true } },
              status: true
            },
            orderBy: { createdAt: 'asc' },
            take: 20
          }),
          10000,
          'Find stuck analyses'
        );

        return NextResponse.json({
          count: stuckAnalyses.length,
          analyses: stuckAnalyses.map(a => ({
            id: a.id,
            domain: a.user?.domain,
            status: a.status,
            ageMinutes: Math.round((Date.now() - a.createdAt.getTime()) / 60000),
            createdAt: a.createdAt
          }))
        });

      case 'active-queries':
        const activeQueries = await prisma.$queryRaw`
          SELECT 
            pid,
            query,
            state,
            query_start,
            NOW() - query_start as duration,
            client_addr
          FROM pg_stat_activity 
          WHERE 
            state IN ('active', 'idle in transaction')
            AND query NOT LIKE '%pg_stat_activity%'
            AND datname = current_database()
          ORDER BY query_start ASC
          LIMIT 10
        ` as unknown as any[];

        return NextResponse.json({
          count: activeQueries.length,
          queries: activeQueries.map(q => ({
            pid: q.pid,
            query: q.query.substring(0, 200) + (q.query.length > 200 ? '...' : ''),
            state: q.state,
            duration: q.duration,
            client_addr: q.client_addr
          }))
        });

      default:
        // Default: Return comprehensive database status
        const [healthStatus, resourceUsage, stuckCount] = await Promise.all([
          getDatabaseHealth(),
          getDatabaseResourceUsage(),
          prisma.analysis.count({
            where: {
              status: 'processing',
              createdAt: {
                lte: new Date(Date.now() - 15 * 60 * 1000)
              }
            }
          })
        ]);

        return NextResponse.json({
          health: healthStatus,
          resources: resourceUsage,
          stuckAnalysesCount: stuckCount,
          availableActions: [
            'health - Database health check',
            'resources - Resource usage monitoring', 
            'cleanup - Clean up stuck analyses',
            'kill-queries - Terminate long-running queries',
            'stuck-analyses - List stuck analyses',
            'active-queries - List active database queries'
          ]
        });
    }
  } catch (error) {
    console.error('Database debug endpoint error:', error);
    return NextResponse.json(
      { 
        error: 'Database operation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();

    switch (action) {
      case 'force-cleanup':
        console.log('🚨 Force cleanup requested...');
        await Promise.all([
          cleanupStuckAnalyses(10), // More aggressive cleanup (10 minutes)
          killLongRunningQueries(5)  // Kill queries running longer than 5 minutes
        ]);
        
        return NextResponse.json({ 
          success: true, 
          message: 'Force cleanup completed - check logs for details' 
        });

      case 'emergency-reset':
        console.log('🆘 Emergency database reset requested...');
        
        // Cancel all processing analyses
        const cancelResult = await prisma.analysis.updateMany({
          where: { status: 'processing' },
          data: { 
            status: 'failed',
            errorMessage: 'Emergency reset - all processing analyses cancelled'
          }
        });

        // Kill all long-running queries
        await killLongRunningQueries(1); // Kill anything running longer than 1 minute

        return NextResponse.json({ 
          success: true, 
          message: `Emergency reset completed - cancelled ${cancelResult.count} analyses` 
        });

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Database debug POST error:', error);
    return NextResponse.json(
      { 
        error: 'Database operation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 