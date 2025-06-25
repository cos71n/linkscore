import { NextRequest, NextResponse } from 'next/server';

interface TestResult {
  domain: string;
  rank: number;
  firstSeen?: string;
}

async function makeDataForSEORequest(endpoint: string, params: any): Promise<any> {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  
  if (!login || !password) {
    throw new Error('DataForSEO credentials not configured');
  }
  
  const authHeader = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
  const url = `https://api.dataforseo.com/v3${endpoint}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([params])
  });
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  if (data.status_code !== 20000) {
    throw new Error(data.status_message || 'API error');
  }
  
  return data;
}

export async function GET(request: NextRequest) {
  try {
    console.log('🧪 Testing DataForSEO "one_per_domain" mode...\n');
    
    const results: any = {
      testDomain: 'luxcar.com.au',
      tests: {}
    };
    
    // Test 1: With mode: "one_per_domain"
    console.log('📋 Test 1: WITH mode: "one_per_domain"');
    const paramsWithMode = {
      target: results.testDomain,
      include_subdomains: true,
      exclude_internal_backlinks: true,
      backlinks_status_type: "live",
      mode: "one_per_domain",
      limit: 100,
      order_by: ["domain_from_rank,desc"]
    };
    
    const responseWithMode = await makeDataForSEORequest('/backlinks/backlinks/live', paramsWithMode);
    const domainsWithMode = responseWithMode.tasks[0].result[0].items || [];
    
    // Count unique domains
    const domainMapWithMode = new Map<string, number>();
    domainsWithMode.forEach((item: any) => {
      const domain = item.domain_from;
      domainMapWithMode.set(domain, (domainMapWithMode.get(domain) || 0) + 1);
    });
    
    results.tests.withMode = {
      totalBacklinks: domainsWithMode.length,
      uniqueDomains: domainMapWithMode.size,
      ratio: domainsWithMode.length > 0 ? (domainMapWithMode.size / domainsWithMode.length) : 0
    };
    
    // Test 2: Without mode (using mode: "as_is")
    console.log('\n📋 Test 2: WITHOUT mode: "one_per_domain" (using mode: "as_is")');
    const paramsWithoutMode = {
      target: results.testDomain,
      include_subdomains: true,
      exclude_internal_backlinks: true,
      backlinks_status_type: "live",
      mode: "as_is",
      limit: 100,
      order_by: ["domain_from_rank,desc"]
    };
    
    const responseWithoutMode = await makeDataForSEORequest('/backlinks/backlinks/live', paramsWithoutMode);
    const domainsWithoutMode = responseWithoutMode.tasks[0].result[0].items || [];
    
    const domainMapWithoutMode = new Map<string, number>();
    domainsWithoutMode.forEach((item: any) => {
      const domain = item.domain_from;
      domainMapWithoutMode.set(domain, (domainMapWithoutMode.get(domain) || 0) + 1);
    });
    
    results.tests.withoutMode = {
      totalBacklinks: domainsWithoutMode.length,
      uniqueDomains: domainMapWithoutMode.size,
      ratio: domainsWithoutMode.length > 0 ? (domainMapWithoutMode.size / domainsWithoutMode.length) : 0
    };
    
    // Check for www/non-www pairs
    const wwwPairs: string[] = [];
    for (const domain of domainMapWithMode.keys()) {
      if (domain.startsWith('www.')) {
        const nonWww = domain.substring(4);
        if (domainMapWithMode.has(nonWww)) {
          wwwPairs.push(`${domain} and ${nonWww}`);
        }
      }
    }
    
    results.wwwNonWwwPairs = wwwPairs;
    results.hasWwwDuplicates = wwwPairs.length > 0;
    
    // Test 3: Check referring_domains endpoint
    console.log('\n📋 Test 3: Using /referring_domains endpoint');
    const paramsReferringDomains = {
      target: results.testDomain,
      include_subdomains: true,
      exclude_internal_backlinks: true,
      limit: 100,
      order_by: ["rank,desc"]
    };
    
    const responseReferringDomains = await makeDataForSEORequest('/backlinks/referring_domains/live', paramsReferringDomains);
    const referringDomains = responseReferringDomains.tasks[0].result[0].items || [];
    const totalReferringDomains = responseReferringDomains.tasks[0].result[0].total_count || 0;
    
    results.tests.referringDomains = {
      count: referringDomains.length,
      totalCount: totalReferringDomains
    };
    
    // Apply authority filters to see the actual count
    const authorityDomains = domainsWithMode.filter((item: any) => 
      (item.domain_from_rank || 0) >= 20 &&
      (item.backlink_spam_score || 0) <= 30
    );
    
    results.authorityFiltering = {
      beforeFiltering: domainMapWithMode.size,
      afterRankSpamFilter: authorityDomains.length,
      wouldNeedTrafficFilter: true
    };
    
    // Summary
    results.summary = {
      modeConsolidatesBacklinks: results.tests.withMode.ratio === 1,
      modeReducesDuplicates: results.tests.withMode.uniqueDomains < results.tests.withoutMode.uniqueDomains,
      wwwNonWwwConsolidated: !results.hasWwwDuplicates,
      conclusion: results.hasWwwDuplicates ? 
        'mode: "one_per_domain" does NOT consolidate www/non-www variants!' :
        'mode: "one_per_domain" appears to be working correctly'
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