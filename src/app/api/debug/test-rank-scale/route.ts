import { NextRequest, NextResponse } from 'next/server';
import { DataForSEOClient } from '@/lib/dataforseo-v2';

export async function GET(request: NextRequest) {
  try {
    const client = new DataForSEOClient();
    const testDomain = 'luxcar.com.au';
    
    console.log(`🧪 Testing ${testDomain} with corrected rank_scale...`);
    
    // Get current authority domains with the fixed implementation
    const authorityDomains = await client.getCurrentAuthorityDomains(testDomain);
    
    console.log(`✅ Found ${authorityDomains.length} authority domains after all filtering`);
    
    // Show some sample domains
    const sampleDomains = authorityDomains.slice(0, 10).map(d => ({
      domain: d.domain,
      rank: d.rank,
      spam_score: d.backlinks_spam_score,
      traffic: d.traffic
    }));
    
    const results = {
      testDomain,
      authorityDomainsCount: authorityDomains.length,
      ahrefsReportedCount: 25,
      difference: Math.abs(authorityDomains.length - 25),
      sampleDomains,
      summary: {
        withRankScale: authorityDomains.length,
        improvement: 'Using rank_scale: "one_hundred" for correct 0-100 DR scale'
      }
    };
    
    return NextResponse.json(results, { status: 200 });
    
  } catch (error: any) {
    console.error('Test failed:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
} 