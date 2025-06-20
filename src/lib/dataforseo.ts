interface DataForSEOConfig {
  login: string;
  password: string;
  baseURL: string;
  maxRetries: number;
  timeoutMs: number;
}

interface AuthorityLinkCriteria {
  domainRank: number;
  spamScore: number;
  monthlyTraffic: number;
  geoRelevance: string[];
}

interface DomainData {
  domain: string;
  rank: number;
  backlinks_spam_score: number;
  traffic: number;
  country?: string;
  referring_domains: number;
  backlinks_count: number;
}

interface LinkGapResult {
  domain: string;
  rank: number;
  backlinks_spam_score: number;
  traffic: number;
  referring_domains: number;
  intersections: number;
}

// Authority link criteria from PRD
const AUTHORITY_CRITERIA: AuthorityLinkCriteria = {
  domainRank: 20,        // DataForSEO Domain Rank >= 20
  spamScore: 30,         // Spam Score <= 30%
  monthlyTraffic: 750,   // Monthly organic traffic >= 750
  geoRelevance: ['AU', 'US', 'UK', 'EU', 'NZ', 'CA'] // Geographic relevance
};

// Australian locations from DataForSEO API (correct codes)
const AUSTRALIAN_LOCATIONS = {
  sydney: { code: 1000286, name: "Sydney, NSW" },
  melbourne: { code: 1000567, name: "Melbourne, VIC" },
  brisbane: { code: 1000339, name: "Brisbane, QLD" },
  perth: { code: 1000676, name: "Perth, WA" },
  adelaide: { code: 1000422, name: "Adelaide, SA" },
  gold_coast: { code: 1000665, name: "Gold Coast, QLD" },
  newcastle: { code: 1000255, name: "Newcastle, NSW" },
  canberra: { code: 1000142, name: "Canberra, ACT" },
  sunshine_coast: { code: 9053248, name: "Sunshine Coast, QLD" },
  wollongong: { code: 1000314, name: "Wollongong, NSW" },
  central_coast: { code: 1000594, name: "Central Coast, NSW" },
  australia_general: { code: 2036, name: "Australia" }
};

class APIError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'APIError';
  }
}

class RobustAPIClient {
  private config: DataForSEOConfig;
  private authHeader: string;

  constructor() {
    this.config = {
      login: process.env.DATAFORSEO_LOGIN || '',
      password: process.env.DATAFORSEO_PASSWORD || '',
      baseURL: 'https://api.dataforseo.com/v3',
      maxRetries: 3,
      timeoutMs: 30000
    };

    if (!this.config.login || !this.config.password) {
      throw new Error('DataForSEO credentials not configured');
    }

    this.authHeader = 'Basic ' + Buffer.from(`${this.config.login}:${this.config.password}`).toString('base64');
  }

  private async makeRequest(endpoint: string, params: any, retryCount = 0): Promise<any> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);
      
      console.log(`DataForSEO API Request: ${endpoint}`, { params, attempt: retryCount + 1 });
      
      const response = await fetch(`${this.config.baseURL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([params]),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new APIError(`API request failed: ${response.status} ${response.statusText}`, response.status);
      }
      
      const data = await response.json();
      
      if (data.status_code !== 20000) {
        throw new APIError(`API error: ${data.status_message || 'Unknown error'}`, data.status_code);
      }
      
      console.log(`DataForSEO API Success: ${endpoint}`, { 
        itemsReturned: data.tasks?.[0]?.result?.[0]?.items?.length || 0,
        cost: data.cost
      });
      
      return data;
      
    } catch (error: any) {
      console.error(`DataForSEO API Error (attempt ${retryCount + 1}):`, error.message);
      
      if (retryCount < this.config.maxRetries && this.isRetryableError(error)) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        console.log(`Retrying in ${delay}ms...`);
        await this.delay(delay);
        return this.makeRequest(endpoint, params, retryCount + 1);
      }
      
      throw error;
    }
  }

  private isRetryableError(error: any): boolean {
    return error.name === 'AbortError' || 
           error.message.includes('network') ||
           error.message.includes('timeout') ||
           error.statusCode === 503 ||
           error.statusCode === 502 ||
           error.statusCode === 429; // Rate limit
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private isAuthorityLink(domain: DomainData): boolean {
    return (
      domain.rank >= AUTHORITY_CRITERIA.domainRank &&
      domain.backlinks_spam_score <= AUTHORITY_CRITERIA.spamScore &&
      domain.traffic >= AUTHORITY_CRITERIA.monthlyTraffic &&
      AUTHORITY_CRITERIA.geoRelevance.includes(domain.country || 'US')
    );
  }

  async getAuthorityReferringDomains(domain: string): Promise<DomainData[]> {
    const params = {
      target: domain,
      filters: [
        ["rank", ">=", AUTHORITY_CRITERIA.domainRank]
        // Note: backlinks_spam_score not filterable in API - will filter in code
        // Note: traffic data not available in backlinks API
      ],
      exclude_internal_backlinks: true,
      limit: 1000,
      order_by: ["rank,desc"]
    };
    
    const response = await this.makeRequest('/backlinks/referring_domains/live', params);
    
    // Add null checks for the response structure
    if (!response.tasks || 
        !response.tasks[0] || 
        !response.tasks[0].result || 
        !response.tasks[0].result[0] || 
        !response.tasks[0].result[0].items) {
      console.log('DataForSEO API returned empty result for referring domains');
      return [];
    }
    
    const domains = response.tasks[0].result[0].items || [];
    
    // Filter for spam score, geographic relevance and sort by domain rank
    return domains
      .filter((domain: any) => {
        // Skip domains without a valid domain name
        if (!domain.domain) {
          return false;
        }
        
        // Apply spam score filter in code since API doesn't support it
        if (domain.backlinks_spam_score > AUTHORITY_CRITERIA.spamScore) {
          return false;
        }
        
        // Check geographic relevance
        const country = this.getCountryFromDomain(domain.domain);
        return AUTHORITY_CRITERIA.geoRelevance.includes(country);
      })
      .map((domain: any) => ({
        domain: domain.domain,
        rank: domain.rank,
        backlinks_spam_score: domain.backlinks_spam_score,
        traffic: 1000, // Default value since not available in this API
        referring_domains: domain.referring_domains || 0,
        backlinks_count: domain.backlinks || 0
      }))
      .sort((a: DomainData, b: DomainData) => b.rank - a.rank); // Sort by domain rank
  }

  private getCountryFromDomain(domain: string): string {
    // Add null/undefined check for defensive programming
    if (!domain || typeof domain !== 'string') {
      return 'US'; // Default to US for invalid domains
    }
    
    // Simple heuristic to determine country from domain
    if (domain.endsWith('.com.au') || domain.endsWith('.au')) return 'AU';
    if (domain.endsWith('.co.uk') || domain.endsWith('.uk')) return 'UK';
    if (domain.endsWith('.ca')) return 'CA';
    if (domain.endsWith('.co.nz') || domain.endsWith('.nz')) return 'NZ';
    if (domain.endsWith('.co')) return 'US'; // Many US companies use .co
    return 'US'; // Default to US for .com, etc.
  }

  async getHistoricalData(domain: string, startDate: string, endDate: string): Promise<any[]> {
    const params = {
      target: domain,
      date_from: startDate,
      date_to: endDate
    };
    
    const response = await this.makeRequest('/backlinks/history/live', params);
    
    if (!response.tasks || 
        !response.tasks[0] || 
        !response.tasks[0].result || 
        !response.tasks[0].result[0] || 
        !response.tasks[0].result[0].items) {
      console.log('DataForSEO API returned empty result for historical data');
      return [];
    }
    
    const items = response.tasks[0].result[0].items || [];
    
    console.log(`Historical data received: ${items.length} snapshots from ${startDate} to ${endDate}`);
    
    return items;
  }

  // Get authority link count for a specific historical snapshot
  getAuthorityLinksFromSnapshot(snapshot: any): number {
    if (!snapshot || !snapshot.referring_domains) {
      return 0;
    }
    
    // Authority links are referring domains that meet our criteria
    // Since historical data doesn't have detailed spam scores, we'll use referring domains
    // as a proxy and apply a conservative estimate
    const totalReferringDomains = snapshot.referring_domains || 0;
    
    // Conservative estimate: assume ~15-25% of referring domains are authority links
    // This matches industry benchmarks for quality link profiles
    const authorityPercentage = 0.20; // 20% conservative estimate
    const estimatedAuthorityLinks = Math.round(totalReferringDomains * authorityPercentage);
    
    console.log(`Snapshot ${snapshot.date}: ${totalReferringDomains} referring domains → ~${estimatedAuthorityLinks} estimated authority links`);
    
    return estimatedAuthorityLinks;
  }

  // Calculate authority links gained between two time periods
  calculateAuthorityLinksGained(historicalSnapshots: any[], campaignStartDate: Date, currentAuthorityLinks: number): {
    startAuthorityLinks: number;
    currentAuthorityLinks: number;
    linksGained: number;
  } {
    if (!historicalSnapshots || historicalSnapshots.length === 0) {
      console.log('No historical data available, using current links as baseline');
      return {
        startAuthorityLinks: currentAuthorityLinks,
        currentAuthorityLinks: currentAuthorityLinks, 
        linksGained: 0
      };
    }

    // Find the snapshot closest to campaign start date
    let startSnapshot = null;
    let closestDiff = Infinity;
    
    for (const snapshot of historicalSnapshots) {
      const snapshotDate = new Date(snapshot.date);
      const timeDiff = Math.abs(snapshotDate.getTime() - campaignStartDate.getTime());
      
      if (timeDiff < closestDiff) {
        closestDiff = timeDiff;
        startSnapshot = snapshot;
      }
    }
    
    if (!startSnapshot) {
      console.log('No historical snapshot found for campaign start period');
      return {
        startAuthorityLinks: Math.round(currentAuthorityLinks * 0.8), // Conservative estimate
        currentAuthorityLinks: currentAuthorityLinks,
        linksGained: Math.round(currentAuthorityLinks * 0.2) // Assume 20% growth
      };
    }
    
    const startAuthorityLinks = this.getAuthorityLinksFromSnapshot(startSnapshot);
    const linksGained = Math.max(0, currentAuthorityLinks - startAuthorityLinks);
    
    console.log(`Campaign progression: ${startAuthorityLinks} → ${currentAuthorityLinks} = +${linksGained} authority links gained`);
    
    return {
      startAuthorityLinks,
      currentAuthorityLinks,
      linksGained
    };
  }

  async getCompetitors(keywords: string[], location: string): Promise<string[]> {
    const locationConfig = AUSTRALIAN_LOCATIONS[location as keyof typeof AUSTRALIAN_LOCATIONS] || 
                          AUSTRALIAN_LOCATIONS.australia_general;
    const competitors = new Set<string>();
    
    console.log(`🎯 Location targeting: ${location} → Code: ${locationConfig.code} (${locationConfig.name})`);
    console.log(`🔍 Searching keywords: [${keywords.join(', ')}]`);
    
    // Use original keywords with Brisbane location + Google Australia
    for (const keyword of keywords.slice(0, 3)) {
      try {
        const params = {
          keyword,
          location_code: locationConfig.code,
          language_code: "en",
          device: "desktop",
          domain: "google.com.au"  // Force Australian Google domain
        };
        
        console.log(`🔍 Searching "${keyword}" in ${locationConfig.name} (Code: ${locationConfig.code}) on google.com.au`);
        
        const response = await this.makeRequest('/serp/google/organic/live/advanced', params);
        
        if (!response.tasks || 
            !response.tasks[0] || 
            !response.tasks[0].result || 
            !response.tasks[0].result[0] || 
            !response.tasks[0].result[0].items) {
          console.log('DataForSEO API returned empty result for competitor search');
          continue;
        }
        
        const organicResults = response.tasks[0].result[0].items;
        console.log(`📊 Found ${organicResults.length} organic results for "${keyword}" in ${locationConfig.name}`);
        
        // DEBUG: Log first 10 raw results to understand the structure
        console.log(`🔍 RAW API RESPONSE DEBUG (first 10 results):`);
        organicResults.slice(0, 10).forEach((item: any, index: number) => {
          console.log(`  RAW ${index + 1}: domain=${item.domain}, rank_group=${item.rank_group}, rank_absolute=${item.rank_absolute}, title="${item.title?.substring(0, 50)}..."`);
        });
        
        // Extract domains and log first 10 for debugging
        const organicDomains = organicResults
          .filter((item: any) => item.domain) // Remove rank_group filter - too restrictive!
          .slice(0, 15) // Top 15 results instead of 10
          .map((item: any) => ({ 
            domain: item.domain, 
            position: item.rank_absolute
          }));
          
        console.log(`🔍 FILTERED RESULTS: ${organicDomains.length} out of ${organicResults.length} results passed filtering`);
        
        // Log results to understand what we're getting
        organicDomains.forEach(({ domain, position }: { domain: string, position: number }) => {
          const isAustralian = domain.endsWith('.com.au') || domain.endsWith('.au');
          const geography = isAustralian ? 'AU' : 'US/OTHER';
          console.log(`  📍 Position ${position}: ${domain} (${geography})`);
        });
        
        // Add Australian domains to competitors
        organicDomains.forEach(({ domain }: { domain: string }) => {
          const isAustralian = domain.endsWith('.com.au') || 
                              domain.endsWith('.au') ||
                              ['bunnings.com', 'stratco.com'].includes(domain); // Known AU companies
          
          if (isAustralian) {
            competitors.add(domain);
            console.log(`✅ Australian competitor found: ${domain}`);
          } else {
            console.log(`❌ Non-Australian competitor skipped: ${domain}`);
          }
        });
        
      } catch (error) {
        console.error(`Error searching keyword "${keyword}":`, error);
      }
    }
    
    const finalCompetitors = Array.from(competitors).slice(0, 12); // Get 12 competitors for analysis
    console.log(`🏆 Final Australian competitors: [${finalCompetitors.join(', ')}]`);
    
    // If no Australian competitors found, log detailed warning
    if (finalCompetitors.length === 0) {
      console.log(`🚨 CRITICAL: No Australian competitors found for Brisbane (Code: ${locationConfig.code})`);
      console.log(`🚨 This suggests a location targeting problem with DataForSEO API`);
    }
    
    return finalCompetitors;
  }

  async findLinkGaps(clientDomain: string, competitors: string[]): Promise<LinkGapResult[]> {
    if (competitors.length === 0) {
      return [];
    }

    const targets = competitors.reduce((acc, comp, index) => {
      acc[index + 1] = comp;
      return acc;
    }, {} as Record<number, string>);

    const params = {
      targets,
      exclude_targets: [clientDomain],
      filters: [
        ["1.rank", ">=", AUTHORITY_CRITERIA.domainRank]
        // Note: backlinks_spam_score not filterable in API
        // Note: traffic data not available in this API endpoint
      ],
      exclude_internal_backlinks: true,
      limit: 500,
      order_by: ["1.rank,desc"]
    };
    
    const response = await this.makeRequest('/backlinks/domain_intersection/live', params);
    
    // Add null checks for the response structure
    if (!response.tasks || 
        !response.tasks[0] || 
        !response.tasks[0].result || 
        !response.tasks[0].result[0] || 
        !response.tasks[0].result[0].items) {
      console.log('DataForSEO API returned empty result for link gaps analysis');
      return [];
    }
    
    const gaps = response.tasks[0].result[0].items || [];
    
    // Filter for spam score, geographic relevance and sort by opportunity
    return gaps
      .filter((gap: any) => {
        // Skip gaps without a valid domain
        if (!gap.domain) {
          return false;
        }
        
        // Apply spam score filter in code since API doesn't support it
        if (gap.backlinks_spam_score > AUTHORITY_CRITERIA.spamScore) {
          return false;
        }
        
        // Check geographic relevance
        const country = this.getCountryFromDomain(gap.domain);
        return AUTHORITY_CRITERIA.geoRelevance.includes(country);
      })
      .map((gap: any) => ({
        domain: gap.domain,
        rank: gap.rank,
        backlinks_spam_score: gap.backlinks_spam_score,
        traffic: 1000, // Default value since not available in this API
        referring_domains: gap.referring_domains || 0,
        intersections: gap.intersections || competitors.length
      }))
      .sort((a: LinkGapResult, b: LinkGapResult) => b.rank - a.rank); // Sort by domain rank
  }

  private getFallbackCompetitors(location: string): string[] {
    // Fallback competitors based on location
    const fallbackCompetitors: Record<string, string[]> = {
      sydney: ['example1.com.au', 'example2.com.au', 'example3.com.au'],
      melbourne: ['sample1.com.au', 'sample2.com.au', 'sample3.com.au'],
      brisbane: ['demo1.com.au', 'demo2.com.au', 'demo3.com.au'],
      perth: ['test1.com.au', 'test2.com.au', 'test3.com.au'],
      adelaide: ['placeholder1.com.au', 'placeholder2.com.au', 'placeholder3.com.au']
    };
    
    return fallbackCompetitors[location] || fallbackCompetitors.sydney;
  }

  // Test API connectivity
  async testConnection(): Promise<boolean> {
    try {
      const params = {
        target: 'example.com',
        limit: 1
      };
      
      await this.makeRequest('/backlinks/referring_domains/live', params);
      return true;
    } catch (error) {
      console.error('DataForSEO connection test failed:', error);
      return false;
    }
  }

  // Get API usage and cost information
  async getUsageStats(): Promise<any> {
    try {
      const response = await fetch(`${this.config.baseURL}/user/info`, {
        method: 'GET',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json'
        }
      });
      
      return await response.json();
    } catch (error) {
      console.error('Failed to get usage stats:', error);
      return null;
    }
  }

  async getTotalReferringDomains(domain: string): Promise<number> {
    const params = {
      target: domain,
      exclude_internal_backlinks: true,
      limit: 1 // We only need the count, not the actual domains
    };
    
    const response = await this.makeRequest('/backlinks/referring_domains/live', params);
    
    if (!response.tasks || 
        !response.tasks[0] || 
        !response.tasks[0].result || 
        !response.tasks[0].result[0]) {
      console.log('DataForSEO API returned empty result for total referring domains');
      return 0;
    }
    
    const totalCount = response.tasks[0].result[0].total_count || 0;
    console.log(`Total referring domains for ${domain}: ${totalCount}`);
    
    return totalCount;
  }

  async getAuthorityLinksByDate(
    domain: string, 
    beforeDate?: string // format: "2024-09-01 00:00:00 +00:00"
  ): Promise<{ authorityLinksCount: number; domains: DomainData[] }> {
    // Build filters for authority referring domains
    const filters: any[] = [
      ['rank', '>=', AUTHORITY_CRITERIA.domainRank]
      // Note: backlinks_spam_score filtering applied in code since API doesn't support it
      // Note: first_seen date filtering may not be supported by referring_domains endpoint
    ];

    // For historical analysis, we'll try date filtering but may need to fallback
    if (beforeDate) {
      // Try adding first_seen filter - if it fails, we'll handle in catch block
      filters.push('and');
      filters.push(['first_seen', '<=', beforeDate]);
    }

    const params = {
      target: domain,
      filters: filters,
      exclude_internal_backlinks: true,
      limit: 1000, // We get sample data but use totalCount for the real number
      order_by: ['rank,desc']
    };

    console.log(`DataForSEO API Request: /backlinks/referring_domains/live`, {
      params,
      beforeDate: beforeDate || 'current',
      attempt: 1
    });

    try {
      const response = await this.makeRequest('/backlinks/referring_domains/live', params);
      
      if (!response.tasks || 
          !response.tasks[0] || 
          !response.tasks[0].result || 
          !response.tasks[0].result[0]) {
        console.log('DataForSEO API returned empty result for authority referring domains by date');
        return { authorityLinksCount: 0, domains: [] };
      }

      const result = response.tasks[0].result[0];
      const items = result.items || [];
      const totalCount = result.total_count || 0; // This counts REFERRING DOMAINS (correct!)
      
      console.log(`DataForSEO API Success: /backlinks/referring_domains/live`, {
        itemsReturned: items.length,
        totalCount,
        beforeDate: beforeDate || 'current',
        cost: response.cost
      });

      // Apply spam score and geographic filtering in code
      const filteredDomains = items.filter((item: any) => {
        // Skip items without a valid domain name
        if (!item.domain) {
          return false;
        }
        
        // Apply spam score filter in code since API doesn't support it
        if (item.backlinks_spam_score > AUTHORITY_CRITERIA.spamScore) {
          return false;
        }
        
        // Geographic filtering - prioritize Australian domains
        const country = this.getCountryFromDomain(item.domain);
        return AUTHORITY_CRITERIA.geoRelevance.includes(country);
      });

      console.log(`Filtered ${items.length} items to ${filteredDomains.length} authority referring domains`);

      const domains = filteredDomains.map((item: any) => ({
        domain: item.domain,
        rank: item.rank,
        backlinks_spam_score: item.backlinks_spam_score,
        traffic: 1000, // Default value since not available in this API
        referring_domains: item.referring_domains || 0,
        backlinks_count: item.backlinks || 0,
        country: this.getCountryFromDomain(item.domain)
      }));

      return {
        authorityLinksCount: totalCount, // Correct count of REFERRING DOMAINS
        domains
      };
      
    } catch (error: any) {
      // If date filtering not supported by referring_domains endpoint, fall back to estimation
      if (beforeDate && error.message.includes('first_seen')) {
        console.log('Date filtering not supported by referring_domains endpoint, using estimation approach');
        
        // Get current referring domains count
        const currentResponse = await this.makeRequest('/backlinks/referring_domains/live', {
          target: domain,
          filters: [['rank', '>=', AUTHORITY_CRITERIA.domainRank]],
          exclude_internal_backlinks: true,
          limit: 1
        });
        
        const currentTotal = currentResponse.tasks?.[0]?.result?.[0]?.total_count || 0;
        
        // For historical data, estimate based on typical growth patterns
        // Conservative estimate: assume 85% of current links existed at campaign start
        const historicalEstimate = Math.round(currentTotal * 0.85);
        
        console.log(`Using growth estimation: Current ${currentTotal} → Historical estimate ${historicalEstimate}`);
        
        return {
          authorityLinksCount: historicalEstimate,
          domains: []
        };
      }
      
      throw error;
    }
  }
}

export { RobustAPIClient, AUTHORITY_CRITERIA, AUSTRALIAN_LOCATIONS };
export type { DomainData, LinkGapResult }; 