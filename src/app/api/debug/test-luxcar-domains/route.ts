import { NextRequest, NextResponse } from 'next/server';

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
    const testDomain = 'luxcar.com.au';
    const results: any = {
      testDomain,
      methods: {}
    };
    
    // Method 1: Using /backlinks/referring_domains/live
    console.log('📋 Method 1: Using /referring_domains endpoint');
    const paramsReferringDomains = {
      target: testDomain,
      include_subdomains: true,
      exclude_internal_backlinks: true,
      limit: 1000,
      order_by: ["rank,desc"]
    };
    
    const responseReferringDomains = await makeDataForSEORequest('/backlinks/referring_domains/live', paramsReferringDomains);
    const referringDomains = responseReferringDomains.tasks[0].result[0].items || [];
    
    // Apply authority filters
    const authorityReferringDomains = referringDomains.filter((item: any) => 
      (item.rank || 0) >= 20 &&
      (item.backlinks_spam_score || 0) <= 30
    );
    
    results.methods.referringDomains = {
      totalDomains: referringDomains.length,
      totalCount: responseReferringDomains.tasks[0].result[0].total_count,
      afterRankSpamFilter: authorityReferringDomains.length,
      sampleDomains: authorityReferringDomains.slice(0, 5).map((d: any) => ({
        domain: d.domain,
        rank: d.rank,
        spam_score: d.backlinks_spam_score
      }))
    };
    
    // Method 2: Using /backlinks/backlinks/live with mode: "one_per_domain"
    console.log('\n📋 Method 2: Using /backlinks with one_per_domain');
    const paramsBacklinks = {
      target: testDomain,
      include_subdomains: true,
      exclude_internal_backlinks: true,
      backlinks_status_type: "live",
      mode: "one_per_domain",
      limit: 1000,
      order_by: ["domain_from_rank,desc"]
    };
    
    const responseBacklinks = await makeDataForSEORequest('/backlinks/backlinks/live', paramsBacklinks);
    const backlinks = responseBacklinks.tasks[0].result[0].items || [];
    
    // Count unique domains and apply filters
    const uniqueDomainsMap = new Map<string, any>();
    backlinks.forEach((item: any) => {
      const domain = item.domain_from;
      if (!uniqueDomainsMap.has(domain) || 
          (item.domain_from_rank || 0) > (uniqueDomainsMap.get(domain).domain_from_rank || 0)) {
        uniqueDomainsMap.set(domain, item);
      }
    });
    
    const authorityBacklinks = Array.from(uniqueDomainsMap.values()).filter((item: any) => 
      (item.domain_from_rank || 0) >= 20 &&
      (item.backlink_spam_score || 0) <= 30
    );
    
    results.methods.backlinksOnePerDomain = {
      totalBacklinks: backlinks.length,
      uniqueDomains: uniqueDomainsMap.size,
      afterRankSpamFilter: authorityBacklinks.length,
      sampleDomains: authorityBacklinks.slice(0, 5).map((d: any) => ({
        domain: d.domain_from,
        rank: d.domain_from_rank,
        spam_score: d.backlink_spam_score
      }))
    };
    
    // Check for www/non-www duplicates in both methods
    const checkWwwDuplicates = (domains: string[]) => {
      const wwwPairs: string[] = [];
      const domainSet = new Set(domains);
      
      for (const domain of domainSet) {
        if (domain.startsWith('www.')) {
          const nonWww = domain.substring(4);
          if (domainSet.has(nonWww)) {
            wwwPairs.push(`${domain} / ${nonWww}`);
          }
        }
      }
      return wwwPairs;
    };
    
    results.wwwDuplicates = {
      inReferringDomains: checkWwwDuplicates(referringDomains.map((d: any) => d.domain)),
      inBacklinks: checkWwwDuplicates(Array.from(uniqueDomainsMap.keys()))
    };
    
    // Compare counts
    results.comparison = {
      referringDomainsMethod: authorityReferringDomains.length,
      backlinksMethod: authorityBacklinks.length,
      difference: Math.abs(authorityReferringDomains.length - authorityBacklinks.length),
      ahrefsReported: 25,
      closerToAhrefs: Math.abs(authorityReferringDomains.length - 25) < Math.abs(authorityBacklinks.length - 25) ? 
        'referring_domains' : 'backlinks_one_per_domain'
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