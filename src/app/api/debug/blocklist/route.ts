import { NextRequest, NextResponse } from 'next/server';
import { domainBlocklist, checkDomainBlocklist } from '@/lib/domain-blocklist';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const domain = searchParams.get('domain');

    switch (action) {
      case 'status':
        // Return cache statistics
        const stats = domainBlocklist.getCacheStats();
        return NextResponse.json({
          status: 'success',
          cache: {
            domainsCount: stats.domainsCount,
            lastUpdated: stats.lastUpdated,
            isValid: stats.isValid,
            ttl: '5 minutes'
          },
          environment: {
            nodeEnv: process.env.NODE_ENV,
            vercel: !!process.env.VERCEL
          }
        });

      case 'refresh':
        // Manually refresh the cache
        console.log('🔄 Manual cache refresh requested');
        await domainBlocklist.refreshCache();
        const newStats = domainBlocklist.getCacheStats();
        return NextResponse.json({
          status: 'success',
          message: 'Cache refreshed successfully',
          cache: {
            domainsCount: newStats.domainsCount,
            lastUpdated: newStats.lastUpdated,
            isValid: newStats.isValid
          }
        });

      case 'check':
        // Check if a specific domain is blocked
        if (!domain) {
          return NextResponse.json(
            { error: 'Domain parameter required for check action' },
            { status: 400 }
          );
        }

        const checkResult = await checkDomainBlocklist(domain);
        return NextResponse.json({
          status: 'success',
          domain: domain,
          isBlocked: checkResult.isBlocked,
          error: checkResult.error || null,
          cache: domainBlocklist.getCacheStats()
        });

      default:
        // Default: return general status
        const defaultStats = domainBlocklist.getCacheStats();
        return NextResponse.json({
          status: 'success',
          blocklist: {
            enabled: true,
            domainsCount: defaultStats.domainsCount,
            lastUpdated: defaultStats.lastUpdated,
            isValid: defaultStats.isValid
          },
          actions: {
            status: '/api/debug/blocklist?action=status',
            refresh: '/api/debug/blocklist?action=refresh',
            check: '/api/debug/blocklist?action=check&domain=example.com'
          },
          instructions: {
            status: 'Get cache statistics',
            refresh: 'Manually refresh the blocklist cache',
            check: 'Check if a specific domain is blocked'
          }
        });
    }

  } catch (error: any) {
    console.error('❌ Blocklist debug error:', error);
    return NextResponse.json({
      status: 'error',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}

// Handle POST for refresh action
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'refresh') {
      console.log('🔄 POST refresh requested');
      await domainBlocklist.refreshCache();
      const stats = domainBlocklist.getCacheStats();
      
      return NextResponse.json({
        status: 'success',
        message: 'Blocklist cache refreshed via POST',
        cache: {
          domainsCount: stats.domainsCount,
          lastUpdated: stats.lastUpdated,
          isValid: stats.isValid
        }
      });
    }

    return NextResponse.json(
      { error: 'Unsupported action. Use action: "refresh"' },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('❌ Blocklist POST error:', error);
    return NextResponse.json({
      status: 'error',
      error: error.message
    }, { status: 500 });
  }
}

// Handle unsupported methods
export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
} 