// DataForSEO API Client v2 - Simplified and Correct Implementation
// This replaces the over-engineered dataforseo.ts with proper endpoint usage

interface AuthorityDomain {
  domain: string;
  rank: number;
  backlinks_spam_score: number;
  traffic?: number; // Will be enriched if needed
  backlinks: number;
  referring_pages: number;
  first_seen?: string;
}

interface HistoricalMetrics {
  date: string;
  referring_domains: number;
  referring_main_domains: number;
  backlinks: number;
  // Estimated authority domains based on historical patterns
  estimated_authority_domains: number;
}

interface LinkGap {
  domain: string;
  rank: number;
  backlinks_spam_score: number;
  referring_domains: number;
  intersections: number;
}

// Simple error class for API errors
class DataForSEOError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'DataForSEOError';
  }
}

export class DataForSEOClient {
  private baseURL = 'https://api.dataforseo.com/v3';
  private authHeader: string;
  private totalCost: number = 0;
  
  // Authority criteria - single source of truth
  private readonly AUTHORITY_CRITERIA = {
    minRank: 20,
    maxSpamScore: 30,
    minTraffic: 750  // Original threshold per user's testing showing 35 domains
  };

  constructor() {
    const login = process.env.DATAFORSEO_LOGIN;
    const password = process.env.DATAFORSEO_PASSWORD;
    
    if (!login || !password) {
      throw new Error('DataForSEO credentials not configured');
    }
    
    this.authHeader = 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
  }

  // Get the total cost of all API calls made
  getTotalCost(): number {
    return this.totalCost;
  }

  // Reset the cost counter
  resetCost(): void {
    this.totalCost = 0;
  }

  // Single method for current authority referring domains
  async getCurrentAuthorityDomains(target: string): Promise<AuthorityDomain[]> {
    console.log(`🔍 Getting current authority domains for ${target}`);
    
    // Step 1: Get unique referring domains using backlinks endpoint with one_per_domain mode
    const params = {
      target,
      include_subdomains: true,
      exclude_internal_backlinks: true,
      backlinks_status_type: "live",
      mode: "one_per_domain",
      limit: 1000,
      order_by: ["domain_from_rank,desc"],
      rank_scale: "one_hundred" // Convert to 0-100 scale like Ahrefs DR
    };
    
    const response = await this.makeRequest('/backlinks/backlinks/live', params);
    const allDomains = this.extractDomainsFromResponse(response);
    
    console.log(`📊 Found ${allDomains.length} total referring domains`);
    
    // Step 2: Filter by rank and spam score
    const filteredDomains = allDomains.filter(domain => 
      domain.rank >= this.AUTHORITY_CRITERIA.minRank &&
      domain.backlinks_spam_score <= this.AUTHORITY_CRITERIA.maxSpamScore
    );
    
    console.log(`✅ Found ${filteredDomains.length} domains meeting rank/spam criteria`);
    
    // Step 3: Enrich with traffic data if we have domains
    if (filteredDomains.length > 0) {
      const domainNames = filteredDomains.map(d => d.domain);
      const trafficMap = await this.enrichWithTraffic(domainNames);
      
      // Add traffic data and filter
      const authorityDomains = filteredDomains
        .map(domain => ({
          ...domain,
          traffic: trafficMap.get(domain.domain) || 0
        }))
        .filter(domain => domain.traffic >= this.AUTHORITY_CRITERIA.minTraffic);
      
      console.log(`✅ ${authorityDomains.length} domains meet all authority criteria (including traffic)`);

      // Log domains with traffic for debugging
      console.log(`📊 Traffic distribution for ${filteredDomains.length} rank/spam-filtered domains:`);
      const trafficBuckets = {
        zero: 0,
        under100: 0,
        under500: 0,
        under750: 0,
        under1000: 0,
        over1000: 0
      };
      
      authorityDomains.forEach(domain => {
        if (domain.traffic === 0) trafficBuckets.zero++;
        else if (domain.traffic < 100) trafficBuckets.under100++;
        else if (domain.traffic < 500) trafficBuckets.under500++;
        else if (domain.traffic < 750) trafficBuckets.under750++;
        else if (domain.traffic < 1000) trafficBuckets.under1000++;
        else trafficBuckets.over1000++;
      });
      
      console.log(`   - Zero traffic: ${trafficBuckets.zero} domains`);
      console.log(`   - 1-99 traffic: ${trafficBuckets.under100} domains`);
      console.log(`   - 100-499 traffic: ${trafficBuckets.under500} domains`);
      console.log(`   - 500-749 traffic: ${trafficBuckets.under750} domains`);
      console.log(`   - 750-999 traffic: ${trafficBuckets.under1000} domains`);
      console.log(`   - 1000+ traffic: ${trafficBuckets.over1000} domains`);
      
      const finalDomains = authorityDomains.filter(domain => domain.traffic >= this.AUTHORITY_CRITERIA.minTraffic);
      
      console.log(`✅ ${finalDomains.length} domains meet all authority criteria (traffic >= ${this.AUTHORITY_CRITERIA.minTraffic})`);
      return finalDomains;
    }
    
    return [];
  }

  // Get historical authority domains by filtering current domains by first_seen date
  // NOTE: This approach has a limitation - it only shows domains that still exist today
  // but existed at the historical date. Domains that have been lost since then won't appear.
  async getHistoricalAuthorityDomains(target: string, asOfDate: string): Promise<{
    date: string;
    authority_domains: AuthorityDomain[];
    total_authority_domains: number;
    total_referring_domains: number;
  }> {
    console.log(`📅 Getting authority domains that existed on ${asOfDate} for ${target}`);
    
    const targetDate = new Date(asOfDate);
    
    // Step 1: Get unique referring domains using backlinks endpoint with one_per_domain mode
    const params = {
      target,
      include_subdomains: true,
      exclude_internal_backlinks: true,
      backlinks_status_type: "live", // Current approach only shows domains that still exist
      mode: "one_per_domain",
      limit: 1000, // Maximum allowed by API
      order_by: ["domain_from_rank,desc"],
      rank_scale: "one_hundred" // Convert to 0-100 scale like Ahrefs DR
    };
    
    const response = await this.makeRequest('/backlinks/backlinks/live', params);
    
    if (!response.tasks?.[0]?.result?.[0]?.items) {
      console.log('⚠️ No referring domains found');
      return {
        date: asOfDate,
        authority_domains: [],
        total_authority_domains: 0,
        total_referring_domains: 0
      };
    }
    
    const allDomains = response.tasks[0].result[0].items;
    console.log(`📊 Found ${allDomains.length} total referring domains`);
    
    // Step 2: Filter by first_seen date
    const historicalDomains = allDomains.filter((item: any) => {
      if (!item.first_seen) return false;
      const firstSeenDate = new Date(item.first_seen);
      return firstSeenDate <= targetDate;
    });
    
    console.log(`📅 ${historicalDomains.length} domains existed on ${asOfDate}`);
    
    // Step 3: Filter by authority criteria (rank and spam score)
    const authorityDomains = historicalDomains.filter((item: any) => 
      (item.domain_from_rank || 0) >= this.AUTHORITY_CRITERIA.minRank &&
      (item.backlink_spam_score || 0) <= this.AUTHORITY_CRITERIA.maxSpamScore
    ).map((item: any) => ({
      domain: item.domain_from,
      rank: item.domain_from_rank || 0,
      backlinks_spam_score: item.backlink_spam_score || 0,
      traffic: 0, // Will be enriched
      backlinks: item.backlinks || 0,
      referring_pages: item.referring_pages || 0
    }));
    
    console.log(`🎯 ${authorityDomains.length} domains meet rank/spam criteria`);
    
    // Step 4: Enrich with traffic data
    if (authorityDomains.length > 0) {
      const domainNames = authorityDomains.map((d: AuthorityDomain) => d.domain);
      const trafficMap = await this.enrichWithTraffic(domainNames);
      
      // Add traffic data to domains
      authorityDomains.forEach((d: AuthorityDomain) => {
        d.traffic = trafficMap.get(d.domain) || 0;
      });
      
      const finalDomains = authorityDomains.filter((d: AuthorityDomain) => d.traffic && d.traffic >= this.AUTHORITY_CRITERIA.minTraffic);
      
      console.log(`✅ ${finalDomains.length} historical authority domains after traffic filter`);
      
      return {
        date: asOfDate,
        authority_domains: finalDomains,
        total_authority_domains: finalDomains.length,
        total_referring_domains: historicalDomains.length
      };
    }
    
    return {
      date: asOfDate,
      authority_domains: [],
      total_authority_domains: 0,
      total_referring_domains: historicalDomains.length
    };
  }

  // Simplified historical snapshot for aggregate metrics only
  async getHistoricalSnapshot(target: string, date: string): Promise<HistoricalMetrics> {
    console.log(`📅 Getting historical snapshot for ${target} on ${date}`);
    
    // This endpoint only provides aggregate counts, not actual domains
    // Use getHistoricalAuthorityDomains() if you need the actual list of domains
    
    // Parse the provided date
    const targetDate = new Date(date);
    
    // Create a date range around the target date (1 week before to 1 week after)
    // This increases the chances of getting data
    const dateFrom = new Date(targetDate);
    dateFrom.setDate(dateFrom.getDate() - 7);
    
    const dateTo = new Date(targetDate);
    dateTo.setDate(dateTo.getDate() + 7);
    
    const params = {
      target,
      date_from: this.formatDateForAPI(dateFrom.toISOString().split('T')[0]),
      date_to: this.formatDateForAPI(dateTo.toISOString().split('T')[0]),
      group_range: 'day' // Get daily data for more precision
    };
    
    console.log(`📊 Requesting timeseries data from ${params.date_from} to ${params.date_to}`);
    
    const response = await this.makeRequest('/backlinks/timeseries_summary/live', params);
    
    // Debug logging
    console.log('📊 Timeseries response structure:', JSON.stringify({
      hasResult: !!response.tasks?.[0]?.result?.[0],
      itemsCount: response.tasks?.[0]?.result?.[0]?.items_count || 0,
      totalCount: response.tasks?.[0]?.result?.[0]?.total_count || 0,
      firstItem: response.tasks?.[0]?.result?.[0]?.items?.[0] || null
    }, null, 2));
    
    // Extract metrics from timeseries response
    if (response.tasks?.[0]?.result?.[0]?.items?.length > 0) {
      const items = response.tasks[0].result[0].items;
      
      // Find the item closest to the target date
      let closestItem = items[0];
      let minDiff = Math.abs(new Date(items[0].date).getTime() - targetDate.getTime());
      
      for (const item of items) {
        const diff = Math.abs(new Date(item.date).getTime() - targetDate.getTime());
        if (diff < minDiff) {
          minDiff = diff;
          closestItem = item;
        }
      }
      
      console.log(`📊 Found data for ${closestItem.date} (requested: ${date})`);
      
      // Create the response with estimated authority domains
      const result: HistoricalMetrics = {
        date: closestItem.date,
        referring_domains: closestItem.referring_domains || 0,
        referring_main_domains: closestItem.referring_main_domains || 0,
        backlinks: closestItem.backlinks || 0,
        // ESTIMATED: Based on typical ratio of authority domains to total domains
        // We use 5% as a more realistic estimate (most domains don't meet authority criteria)
        estimated_authority_domains: Math.round((closestItem.referring_domains || 0) * 0.05)
      };
      
      console.log(`✅ Historical data for ${targetDate.toISOString().split('T')[0]}:`);
      console.log(`   - Referring domains: ${result.referring_domains}`);
      console.log(`   - Authority domains: ~${result.estimated_authority_domains} (estimated)`);
      
      return result;
    }
    
    console.log('⚠️ No historical data found for the specified date range');
    
    // Return zeros if no data
    return {
      date: date,
      referring_domains: 0,
      referring_main_domains: 0,
      backlinks: 0,
      estimated_authority_domains: 0
    };
  }

  // Competitor blocklist - directory sites that should never be shown as competitors
  private readonly COMPETITOR_BLOCKLIST = new Set([
    // Directory sites
    'localsearch.com.au',
    'yellowpages.com.au',
    'hipages.com.au',
    'truelocal.com.au',
    'oneflare.com.au',
    'startlocal.com.au',
    'hotfrog.com.au',
    'australiabusinesslisting.com.au',
    'binglocal.com.au',
    'purelocal.com.au',
    'aussieweb.com.au',
    'bark.com',
    'bark.com.au',
    'airtasker.com',
    // Review sites
    'clutch.co',
    'trustpilot.com',
    'productreview.com.au',
    'yelp.com',
    'yelp.com.au',
    // SEO tools
    'semrush.com',
    // Social media
    'reddit.com',
    'facebook.com',
    'instagram.com',
    'linkedin.com',
    'twitter.com',
    'youtube.com',
    // Search engines
    'bing.com',
    'google.com',
    'google.com.au'
  ]);

  // Simple competitor discovery with blocklist
  async findCompetitors(keywords: string[], location: string, targetDomain?: string): Promise<string[]> {
    console.log(`🎯 Finding competitors for keywords: ${keywords.join(', ')}`);
    
    const locationCode = this.getLocationCode(location);
    const competitors = new Set<string>();
    
    // Normalize target domain for comparison
    const normalizedTarget = targetDomain?.toLowerCase().replace(/^www\./, '');
    console.log(`🚫 Excluding target domain: ${normalizedTarget}`);
    
    // Search top 2 keywords only for efficiency
    for (const keyword of keywords.slice(0, 2)) {
      const params = {
        keyword,
        location_code: locationCode,
        language_code: "en",
        device: "desktop",
        domain: "google.com.au"
      };
      
      try {
        const response = await this.makeRequest('/serp/google/organic/live/advanced', params);
        
        if (response.tasks?.[0]?.result?.[0]?.items) {
          const organicResults = response.tasks[0].result[0].items;
          
          // Extract top 10 organic domains
          organicResults
            .slice(0, 10)
            .filter((item: any) => item.domain)
            .forEach((item: any) => {
              const domain = item.domain.toLowerCase();
              
              // Skip if domain is in blocklist
              if (this.COMPETITOR_BLOCKLIST.has(domain)) {
                console.log(`   Skipping blocked domain: ${domain}`);
                return;
              }
              
              // Also check without www prefix
              const domainWithoutWww = domain.replace(/^www\./, '');
              if (this.COMPETITOR_BLOCKLIST.has(domainWithoutWww)) {
                console.log(`   Skipping blocked domain: ${domain}`);
                return;
              }
              
              // Skip if it's the target domain
              if (normalizedTarget && (domain === normalizedTarget || domainWithoutWww === normalizedTarget)) {
                console.log(`   Skipping target domain: ${domain}`);
                return;
              }
              
              // Only include Australian .com.au domains for local competition
              if (domain.endsWith('.com.au')) {
                competitors.add(domain);
                console.log(`   ✓ Added Australian competitor: ${domain}`);
              } else {
                console.log(`   Skipping non-.com.au domain: ${domain}`);
              }
            });
        }
      } catch (error) {
        console.warn(`Failed to search keyword "${keyword}":`, error);
      }
    }
    
    const finalCompetitors = Array.from(competitors).slice(0, 10);
    console.log(`✅ Found ${finalCompetitors.length} Australian competitors (.com.au domains only)`);
    return finalCompetitors;
  }

  // Find link gaps - domains linking to competitors but not to target
  async findLinkGaps(target: string, competitors: string[]): Promise<LinkGap[]> {
    console.log(`🔗 Finding link gaps for ${target} vs ${competitors.length} competitors`);
    
    if (competitors.length === 0) return [];
    
    // Create targets object for domain intersection
    const targets = competitors.reduce((acc, comp, index) => {
      acc[index + 1] = comp;
      return acc;
    }, {} as Record<number, string>);
    
    const params = {
      targets,
      exclude_targets: [target],
      limit: 500,
      order_by: ["rank,desc"],
      rank_scale: "one_hundred" // Convert to 0-100 scale like Ahrefs DR
    };
    
    const response = await this.makeRequest('/backlinks/domain_intersection/live', params);
    
    if (response.tasks?.[0]?.result?.[0]?.items) {
      const allGaps = response.tasks[0].result[0].items;
      
      // Filter by our authority criteria
      const gaps = allGaps
        .filter((item: any) => 
          item.rank >= this.AUTHORITY_CRITERIA.minRank &&
          item.backlinks_spam_score <= this.AUTHORITY_CRITERIA.maxSpamScore
        )
        .map((item: any) => ({
          domain: item.domain,
          rank: item.rank,
          backlinks_spam_score: item.backlinks_spam_score,
          referring_domains: item.referring_domains || 0,
          intersections: item.intersections || competitors.length
        }));
      
      console.log(`✅ Found ${gaps.length} link gap opportunities (filtered from ${allGaps.length} total)`);
      return gaps;
    }
    
    return [];
  }

  // Bulk traffic enrichment - only called when needed
  async enrichWithTraffic(domains: string[]): Promise<Map<string, number>> {
    console.log(`📊 Enriching ${domains.length} domains with traffic data`);
    
    const trafficMap = new Map<string, number>();
    
    // Process in batches of 1000
    const batchSize = 1000;
    for (let i = 0; i < domains.length; i += batchSize) {
      const batch = domains.slice(i, i + batchSize);
      
      const params = {
        targets: batch
      };
      
      try {
        const response = await this.makeRequest('/dataforseo_labs/google/bulk_traffic_estimation/live', params);
        
        if (response.tasks?.[0]?.result?.[0]?.items) {
          console.log(`   Batch ${i / batchSize + 1}: Got traffic data for ${response.tasks[0].result[0].items.length} domains`);
          
          response.tasks[0].result[0].items.forEach((item: any) => {
            if (item.target && item.metrics?.organic?.etv !== undefined) {
              const traffic = Math.round(item.metrics.organic.etv);
              trafficMap.set(item.target, traffic);
              
              // Log high-traffic domains for debugging
              if (traffic >= 750) {
                console.log(`     ✓ ${item.target}: ${traffic} monthly visits`);
              }
            } else {
              console.log(`     ⚠️ No traffic data for ${item.target}`);
            }
          });
        } else {
          console.log(`   ⚠️ No items in traffic response for batch ${i / batchSize + 1}`);
        }
      } catch (error) {
        console.error(`Failed to get traffic for batch ${i / batchSize + 1}:`, error);
        // Set 0 for failed domains
        batch.forEach(domain => trafficMap.set(domain, 0));
      }
    }
    
    console.log(`✅ Traffic data retrieved for ${trafficMap.size} domains`);
    return trafficMap;
  }

  // Simple API request method with minimal retry logic
  private async makeRequest(endpoint: string, params: any): Promise<any> {
    const url = `${this.baseURL}${endpoint}`;
    
    try {
      console.log(`🌐 API Request: ${endpoint}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([params])
      });
      
      if (!response.ok) {
        throw new DataForSEOError(
          `API request failed: ${response.status} ${response.statusText}`,
          response.status
        );
      }
      
      const data = await response.json();
      
      if (data.status_code !== 20000) {
        throw new DataForSEOError(
          data.status_message || 'API error',
          data.status_code
        );
      }
      
      const cost = data.cost || 0;
      this.totalCost += cost;
      console.log(`✅ API Success: ${endpoint} (cost: $${cost})`);
      return data;
      
    } catch (error: any) {
      // Simple retry for network errors only
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        console.log('⚠️ Network error, retrying once...');
        
        // Wait 2 seconds and retry once
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const retryResponse = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': this.authHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([params])
        });
        
        if (!retryResponse.ok) {
          throw new DataForSEOError(
            `API retry failed: ${retryResponse.status} ${retryResponse.statusText}`,
            retryResponse.status
          );
        }
        
        return await retryResponse.json();
      }
      
      throw error;
    }
  }

  // Helper to extract domains from referring domains response
  private extractDomainsFromResponse(response: any): AuthorityDomain[] {
    if (!response.tasks?.[0]?.result?.[0]?.items) {
      console.log('⚠️ No items in response');
      console.log('Response structure:', JSON.stringify(response, null, 2).slice(0, 500));
      return [];
    }
    
    console.log(`📊 Raw response has ${response.tasks[0].result[0].items_count} items, total_count: ${response.tasks[0].result[0].total_count}`);
    
    // Log the first item to see its structure
    if (response.tasks[0].result[0].items.length > 0) {
      console.log('🔍 First item structure:', JSON.stringify(response.tasks[0].result[0].items[0], null, 2));
    }
    
    return response.tasks[0].result[0].items.map((item: any) => ({
      domain: item.domain_from,
      rank: item.domain_from_rank || 0,
      backlinks_spam_score: item.backlink_spam_score || 0,
      backlinks: item.backlinks || 1,
      referring_pages: item.referring_pages || 1,
      first_seen: item.first_seen
    }));
  }

  // Format date for API (ensure correct timezone format)
  private formatDateForAPI(date: string): string {
    const d = new Date(date);
    return d.toISOString().replace('T', ' ').substring(0, 19) + ' +00:00';
  }

  // Get location code for DataForSEO
  private getLocationCode(location: string): number {
    const locationMap: Record<string, number> = {
      sydney: 1000286,
      melbourne: 1000567,
      brisbane: 1000339,
      perth: 1000676,
      adelaide: 1000422,
      gold_coast: 1000665,
      newcastle: 1000255,
      canberra: 1000142,
      sunshine_coast: 9053248,
      wollongong: 1000314,
      central_coast: 1000594,
      australia_general: 2036
    };
    
    return locationMap[location] || 2036; // Default to Australia
  }
}

// Export types for use in other files
export type { AuthorityDomain, HistoricalMetrics, LinkGap }; 