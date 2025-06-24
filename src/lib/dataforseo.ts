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

// Domain normalization function to handle www/non-www consolidation like Ahrefs
function normalizeDomain(domain: string): string {
  if (!domain || typeof domain !== 'string') {
    return domain;
  }
  
  let normalized = domain.toLowerCase().trim();
  
  // Remove protocol
  normalized = normalized.replace(/^https?:\/\//, '');
  
  // Remove www prefix for consolidation (like Ahrefs "domain including subdomains")
  normalized = normalized.replace(/^www\./, '');
  
  // Remove trailing slash and path
  normalized = normalized.split('/')[0];
  
  // Remove port numbers
  normalized = normalized.split(':')[0];
  
  return normalized;
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

// Competitor blocklist - directory-type domains that should never be selected as competitors
// Using normalized domains (no www prefix) since we normalize before checking blocklist
const COMPETITOR_BLOCKLIST: Set<string> = new Set([
  'localsearch.com.au',
  'yellowpages.com.au',
  'airtasker.com',
  'hipages.com.au',
  'clutch.co',
  'semrush.com',
  'trustpilot.com',
  'productreview.com.au',
  'reddit.com'
]);

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
      maxRetries: 3, // Increased for better reliability
      timeoutMs: 45000 // Increased from 20s to 45s for SERP requests
    };

    if (!this.config.login || !this.config.password) {
      throw new Error('DataForSEO credentials not configured');
    }

    this.authHeader = 'Basic ' + Buffer.from(`${this.config.login}:${this.config.password}`).toString('base64');
    
    // Log initialization (without exposing credentials)
    console.log('DataForSEO Client initialized:', {
      baseURL: this.config.baseURL,
      maxRetries: this.config.maxRetries,
      timeoutMs: this.config.timeoutMs,
      hasCredentials: !!(this.config.login && this.config.password)
    });
  }

  private async makeRequest(endpoint: string, params: any, retryCount = 0): Promise<any> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);
      
      console.log(`DataForSEO API Request: ${endpoint}`, { 
        params: JSON.stringify(params).substring(0, 200) + '...', 
        attempt: retryCount + 1,
        timeout: this.config.timeoutMs 
      });
      
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
      
      console.log(`DataForSEO API Response: ${endpoint}`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error response');
        console.error(`DataForSEO API HTTP Error:`, {
          status: response.status,
          statusText: response.statusText,
          body: errorText.substring(0, 500)
        });
        throw new APIError(`API request failed: ${response.status} ${response.statusText}`, response.status);
      }
      
      const data = await response.json();
      
      console.log(`DataForSEO API Data Structure:`, {
        hasDataProperty: !!data,
        statusCode: data?.status_code,
        statusMessage: data?.status_message,
        hasTasks: !!data?.tasks,
        tasksLength: data?.tasks?.length,
        cost: data?.cost
      });
      
      if (data.status_code !== 20000) {
        console.error(`DataForSEO API Business Logic Error:`, {
          statusCode: data.status_code,
          statusMessage: data.status_message,
          fullResponse: JSON.stringify(data).substring(0, 500)
        });
        throw new APIError(`API error: ${data.status_message || 'Unknown error'}`, data.status_code);
      }
      
      console.log(`DataForSEO API Success: ${endpoint}`, { 
        itemsReturned: data.tasks?.[0]?.result?.[0]?.items?.length || 0,
        cost: data.cost,
        statusCode: data.status_code
      });
      
      return data;
      
    } catch (error: any) {
      console.error(`DataForSEO API Error (attempt ${retryCount + 1}/${this.config.maxRetries + 1}):`, {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack?.substring(0, 500),
        statusCode: error.statusCode,
        endpoint,
        retryCount,
        willRetry: retryCount < this.config.maxRetries && this.isRetryableError(error)
      });
      
      if (retryCount < this.config.maxRetries && this.isRetryableError(error)) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        console.log(`Retrying DataForSEO request in ${delay}ms...`);
        await this.delay(delay);
        return this.makeRequest(endpoint, params, retryCount + 1);
      }
      
      throw error;
    }
  }

  private isRetryableError(error: any): boolean {
    // Network and timeout errors
    if (error.name === 'AbortError' || 
        error.name === 'TimeoutError' ||
        error.message.includes('network') ||
        error.message.includes('timeout') ||
        error.message.includes('ECONNRESET') ||
        error.message.includes('ENOTFOUND') ||
        error.message.includes('ECONNREFUSED')) {
      return true;
    }
    
    // HTTP status codes that should be retried
    if (error.statusCode === 503 ||  // Service Unavailable
        error.statusCode === 502 ||  // Bad Gateway
        error.statusCode === 504 ||  // Gateway Timeout
        error.statusCode === 429 ||  // Rate Limit
        error.statusCode === 500) {  // Internal Server Error
      return true;
    }
    
    // DataForSEO specific error codes that might be temporary
    if (error.statusCode === 40500 ||  // DataForSEO internal error
        error.statusCode === 50000) {   // DataForSEO server error
      return true;
    }
    
    console.log(`Error not retryable:`, {
      name: error.name,
      message: error.message,
      statusCode: error.statusCode
    });
    
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Traffic data cache with 24-hour TTL
  private static trafficCache = new Map<string, { traffic: number; timestamp: number; ttl: number }>();
  private static readonly TRAFFIC_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in ms

  async getBulkTrafficEstimation(domains: string[], bypassCache: boolean = false): Promise<Map<string, number>> {
    const trafficMap = new Map<string, number>();
    const domainsToQuery: string[] = [];
    
    // Check cache first (unless bypassing)
    const shouldBypassCache = bypassCache || process.env.BYPASS_TRAFFIC_CACHE === 'true';
    
    for (const domain of domains) {
      if (!shouldBypassCache) {
        const cached = RobustAPIClient.trafficCache.get(domain);
        if (cached && Date.now() - cached.timestamp < cached.ttl) {
          trafficMap.set(domain, cached.traffic);
          continue;
        }
      }
      domainsToQuery.push(domain);
    }
    
    if (domainsToQuery.length === 0) {
      console.log(`All ${domains.length} domains found in traffic cache`);
      return trafficMap;
    }
    
    console.log(`Querying traffic for ${domainsToQuery.length} domains (${domains.length - domainsToQuery.length} cached)`);
    
    // Process in batches of 1000 (DataForSEO Labs API limit)
    const batchSize = 1000;
    for (let i = 0; i < domainsToQuery.length; i += batchSize) {
      const batch = domainsToQuery.slice(i, i + batchSize);
      
      try {
        const params = {
          targets: batch
        };
        
        console.log(`Fetching traffic data for batch ${Math.floor(i/batchSize) + 1} (${batch.length} domains)`);
        
        const response = await this.makeRequest('/dataforseo_labs/google/bulk_traffic_estimation/live', params);
        
        if (!response.tasks || !response.tasks[0] || !response.tasks[0].result) {
          console.log('DataForSEO Labs API returned empty result for traffic estimation');
          continue;
        }
        
        const result = response.tasks[0].result[0];
        const items = result.items || [];
        
        // Process results and cache them
        for (const item of items) {
          if (item && item.target && item.metrics && item.metrics.organic && typeof item.metrics.organic.etv === 'number') {
            const domain = item.target;
            const monthlyTraffic = Math.round(item.metrics.organic.etv); // Monthly organic traffic
            
            trafficMap.set(domain, monthlyTraffic);
            
            // Cache with 24-hour TTL
            RobustAPIClient.trafficCache.set(domain, {
              traffic: monthlyTraffic,
              timestamp: Date.now(),
              ttl: RobustAPIClient.TRAFFIC_CACHE_TTL
            });
            
            console.log(`Traffic data: ${domain} = ${monthlyTraffic} monthly visits`);
          }
        }
        
        // Cache 0 for any domains that weren't returned in the results
        for (const domain of batch) {
          if (!trafficMap.has(domain)) {
            trafficMap.set(domain, 0);
            RobustAPIClient.trafficCache.set(domain, {
              traffic: 0,
              timestamp: Date.now(),
              ttl: RobustAPIClient.TRAFFIC_CACHE_TTL
            });
          }
        }
        
        // Add delay between batches to respect API rate limits
        if (i + batchSize < domainsToQuery.length) {
          await this.delay(1000); // 1 second delay between batches
        }
        
      } catch (error) {
        console.error(`Failed to fetch traffic data for batch starting at ${i}:`, error);
        
        // Cache 0 traffic for failed domains to avoid repeated failures
        for (const domain of batch) {
          trafficMap.set(domain, 0);
          RobustAPIClient.trafficCache.set(domain, {
            traffic: 0,
            timestamp: Date.now(),
            ttl: RobustAPIClient.TRAFFIC_CACHE_TTL
          });
        }
      }
    }
    
    console.log(`Traffic estimation complete: ${trafficMap.size} domains processed`);
    return trafficMap;
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
      mode: "one_per_domain", // Get one backlink per domain to get domain authority
      // No rank filter at API level - get all referring domains and filter in code
      exclude_internal_backlinks: true,
      limit: 1000,
      order_by: ["domain_from_rank,desc"], // Sort by domain's own rank
      rank_scale: "one_hundred" // Use 0-100 scale to match Ahrefs DR
    };

    const response = await this.makeRequest('/backlinks/backlinks/live', params);
    
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
    
    console.log(`📊 Raw API returned ${domains.length} backlinks for ${domain}`);
    
    // Log first few domains to understand the data structure
    domains.slice(0, 5).forEach((d: any, i: number) => {
      console.log(`  Domain ${i + 1}: ${d.domain_from} - rank: ${d.rank}, domain_from_rank: ${d.domain_from_rank}, spam: ${d.backlink_spam_score}`);
    });
    
    // Extract unique domain names for traffic lookup (normalize to consolidate www/non-www)
    const uniqueNormalizedDomains = new Set<string>();
    const domainMappings = new Map<string, string>(); // normalized -> original
    
    domains.forEach((item: any) => {
      if (item.domain_from) {
        const normalized = normalizeDomain(item.domain_from);
        uniqueNormalizedDomains.add(normalized);
        // Keep track of one original domain per normalized version for API calls
        if (!domainMappings.has(normalized)) {
          domainMappings.set(normalized, item.domain_from);
        }
      }
    });
    
    const domainNames = Array.from(domainMappings.values());
    console.log(`Getting real traffic data for ${domainNames.length} unique domains (consolidated from ${domains.length} raw domains)`);
    
    // Get real traffic data for consolidated domains using DataForSEO Labs API
    const rawTrafficMap = await this.getBulkTrafficEstimation(domainNames, false);
    
    // Create normalized traffic map for lookups
    const trafficMap = new Map<string, number>();
    for (const [normalized, original] of domainMappings.entries()) {
      trafficMap.set(normalized, rawTrafficMap.get(original) || 0);
    }
    
    // Group domains by normalized name to consolidate www/non-www versions
    const domainGroups = new Map<string, any[]>();
    
    domains.forEach((item: any) => {
      if (item.domain_from) {
        const normalized = normalizeDomain(item.domain_from);
        if (!domainGroups.has(normalized)) {
          domainGroups.set(normalized, []);
        }
        domainGroups.get(normalized)!.push(item);
      }
    });
    
    console.log(`Grouped ${domains.length} raw domains into ${domainGroups.size} unique domains (www/non-www consolidated)`);
    
    // Process each domain group and apply filtering
    const filteredDomains = [];
    
    for (const [normalizedDomain, domainItems] of domainGroups.entries()) {
      // Consolidate metrics across www/non-www versions
      const consolidatedDomain = {
        normalized_domain: normalizedDomain,
        original_domain: domainItems[0].domain_from, // Use first version as display name
        rank: Math.max(...domainItems.map(d => d.domain_from_rank || d.rank || 0)), // Use highest rank
        backlinks_spam_score: Math.min(...domainItems.map(d => d.backlink_spam_score || 100)), // Use lowest spam score
        referring_domains: Math.max(...domainItems.map(d => d.referring_domains || 0)), // Use highest referring domains
        backlinks_count: domainItems.reduce((sum, d) => sum + (d.backlinks || 0), 0), // Sum backlinks
        traffic: trafficMap.get(normalizedDomain) || 0,
        variants: domainItems.map(d => d.domain_from) // Track all variants found
      };
      
      // Apply filtering to consolidated domain
      if (consolidatedDomain.backlinks_spam_score > AUTHORITY_CRITERIA.spamScore) {
        continue;
      }
      
      if (consolidatedDomain.rank < AUTHORITY_CRITERIA.domainRank) {
        continue;
      }
      
      if (consolidatedDomain.traffic < AUTHORITY_CRITERIA.monthlyTraffic) {
        continue;
      }
      
      // Log consolidated domains with multiple variants
      if (consolidatedDomain.variants.length > 1) {
        console.log(`🔗 Consolidated domain: ${normalizedDomain} (variants: ${consolidatedDomain.variants.join(', ')}) - rank: ${consolidatedDomain.rank}, traffic: ${consolidatedDomain.traffic}`);
      }
      
      // Log when we find domains with high authority
      if (consolidatedDomain.rank >= AUTHORITY_CRITERIA.domainRank) {
        console.log(`🎯 Found high-authority domain: ${normalizedDomain} (DR: ${consolidatedDomain.rank}, Traffic: ${consolidatedDomain.traffic})`);
      }
      
      filteredDomains.push(consolidatedDomain);
    }
    
    console.log(`Filtered ${domainGroups.size} unique domains to ${filteredDomains.length} authority domains`);
    
    // Map to our DomainData structure and sort by domain rank
    return filteredDomains
      .map((item: any) => ({
        domain: item.normalized_domain, // Use normalized domain for consistency
        rank: item.rank,
        backlinks_spam_score: item.backlinks_spam_score,
        traffic: item.traffic,
        referring_domains: item.referring_domains,
        backlinks_count: item.backlinks_count
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

  private isBlockedCompetitor(domain: string): boolean {
    // Add null/undefined check for defensive programming
    if (!domain || typeof domain !== 'string') {
      return false;
    }
    
    // Normalize domain for consistent blocking (removes www, protocols, etc.)
    const normalizedDomain = normalizeDomain(domain);
    
    // Check if normalized domain is in the blocklist
    return COMPETITOR_BLOCKLIST.has(normalizedDomain);
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

  async getCompetitors(keywords: string[], location: string, excludeDomain?: string): Promise<string[]> {
    const locationConfig = AUSTRALIAN_LOCATIONS[location as keyof typeof AUSTRALIAN_LOCATIONS] || 
                          AUSTRALIAN_LOCATIONS.australia_general;
    const competitors = new Set<string>();
    
    console.log(`🎯 Location targeting: ${location} → Code: ${locationConfig.code} (${locationConfig.name})`);
    console.log(`🔍 Searching keywords: [${keywords.join(', ')}]`);
    
    // Add overall timeout for Vercel (30 seconds max for competitor search)
    const competitorSearchPromise = this.doCompetitorSearch(keywords, locationConfig, competitors, excludeDomain);
    const timeoutPromise = new Promise<string[]>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Competitor search timeout after 30 seconds'));
      }, 30000); // Reduced from 45s to 30s
    });
    
    try {
      return await Promise.race([competitorSearchPromise, timeoutPromise]);
    } catch (error: any) {
      console.error('Competitor search failed:', error.message);
      // Return fallback competitors if search fails (also filter out client domain)
      return this.getFallbackCompetitors(location, excludeDomain);
    }
  }

  private async doCompetitorSearch(keywords: string[], locationConfig: any, competitors: Set<string>, excludeDomain?: string): Promise<string[]> {
    
    // Use original keywords with location + Google Australia
    // Process fewer keywords on Vercel for faster execution
    const keywordsToProcess = keywords.slice(0, 2); // Reduced from 3 to 2 for Vercel
    
    for (const keyword of keywordsToProcess) {
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
        
        // Add Australian domains to competitors (exclude client's own domain and blocked domains)
        organicDomains.forEach(({ domain }: { domain: string }) => {
          const isAustralian = domain.endsWith('.com.au') || 
                              domain.endsWith('.au') ||
                              ['bunnings.com', 'stratco.com'].includes(domain); // Known AU companies
          
          // Normalize domain for consistent comparison (consolidate www/non-www)
          const normalizedDomain = normalizeDomain(domain);
          const normalizedExcludeDomain = excludeDomain ? normalizeDomain(excludeDomain) : null;
          
          // Skip if this is the client's own domain (compare normalized versions)
          if (excludeDomain && normalizedDomain === normalizedExcludeDomain) {
            console.log(`🚫 Skipping client domain: ${domain} (normalized: ${normalizedDomain}) - can't be competitor to itself`);
            return;
          }
          
          // Skip if this is a blocked competitor domain (check normalized version)
          if (this.isBlockedCompetitor(normalizedDomain)) {
            console.log(`🚫 Skipping blocked competitor: ${domain} (normalized: ${normalizedDomain}) - directory-type domain`);
            return;
          }
          
          if (isAustralian) {
            // Add normalized domain to avoid www/non-www duplicates
            competitors.add(normalizedDomain);
            console.log(`✅ Australian competitor found: ${domain} (normalized: ${normalizedDomain})`);
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
      console.log(`🚨 CRITICAL: No Australian competitors found for ${locationConfig.name} (Code: ${locationConfig.code})`);
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
      // No rank filter at API level - get all link gaps and filter in code
      // Note: backlinks_spam_score not filterable in API
      // Note: traffic data not available in this API endpoint
      exclude_internal_backlinks: true,
      limit: 500,
      order_by: ["1.rank,desc"], // API sort by rank for consistency
      rank_scale: "one_hundred" // Use 0-100 scale to match Ahrefs DR
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
    
    // Filter for spam score, geographic relevance, domain authority and sort by opportunity
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
        
        // If domain_from_rank exists and is different from rank, prioritize domain_from_rank
        const domainAuthority = gap.domain_from_rank || gap.rank;
        const linkAuthority = gap.rank; // Authority passed to target
        
        // Log when we find domains with high own authority but low passed authority
        if (gap.domain_from_rank && gap.domain_from_rank !== gap.rank && gap.domain_from_rank >= AUTHORITY_CRITERIA.domainRank) {
          console.log(`🎯 Found high-authority link gap: ${gap.domain} (DR: ${gap.domain_from_rank}, Passes: ${gap.rank})`);
        }
        
        if (domainAuthority < AUTHORITY_CRITERIA.domainRank) {
          return false;
        }
        
        // Check geographic relevance
        const country = this.getCountryFromDomain(gap.domain);
        return AUTHORITY_CRITERIA.geoRelevance.includes(country);
      })
      .map((gap: any) => ({
        domain: gap.domain,
        rank: gap.domain_from_rank || gap.rank, // Use domain's own rank, fallback to passed rank
        backlinks_spam_score: gap.backlinks_spam_score,
        traffic: 1000, // Default value since not available in this API
        referring_domains: gap.referring_domains || 0,
        intersections: gap.intersections || competitors.length
      }))
      .sort((a: LinkGapResult, b: LinkGapResult) => b.rank - a.rank); // Sort by domain rank
  }

  private getFallbackCompetitors(location: string, excludeDomain?: string): string[] {
    console.log(`🔄 Using fallback competitors for ${location} due to search timeout/failure`);
    
    // Smaller, more manageable Australian business competitors as fallback
    // Avoid massive domains like seek.com.au, realestate.com.au that cause timeouts
    // Using normalized domains for consistency
    let fallbackCompetitors = [
      'bunnings.com.au',      // Large but manageable
      'officeworks.com.au',   // Medium-sized retailer
      'jbhifi.com.au',        // Electronics retailer
      'woolworths.com.au',    // Supermarket chain
      'coles.com.au'          // Supermarket chain
    ];
    
    // Filter out client domain if provided (compare normalized versions)
    if (excludeDomain) {
      const normalizedExcludeDomain = normalizeDomain(excludeDomain);
      const originalLength = fallbackCompetitors.length;
      fallbackCompetitors = fallbackCompetitors.filter(domain => {
        const normalizedDomain = normalizeDomain(domain);
        return normalizedDomain !== normalizedExcludeDomain;
      });
      if (fallbackCompetitors.length < originalLength) {
        console.log(`🚫 Filtered out client domain ${excludeDomain} (normalized: ${normalizedExcludeDomain}) from fallback competitors`);
      }
    }
    
    // Filter out blocked competitor domains (using normalized comparison)
    const originalLength = fallbackCompetitors.length;
    fallbackCompetitors = fallbackCompetitors.filter(domain => !this.isBlockedCompetitor(domain));
    if (fallbackCompetitors.length < originalLength) {
      console.log(`🚫 Filtered out ${originalLength - fallbackCompetitors.length} blocked domains from fallback competitors`);
    }
    
    console.log(`🏆 Fallback competitors (manageable sizes): [${fallbackCompetitors.join(', ')}]`);
    return fallbackCompetitors;
  }

  // Test API connectivity
  async testConnection(): Promise<boolean> {
    try {
      const params = {
        target: 'example.com',
        limit: 1,
        rank_scale: "one_hundred" // Use 0-100 scale to match Ahrefs DR
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
      limit: 1, // We only need the count, not the actual domains
      rank_scale: "one_hundred" // Use 0-100 scale to match Ahrefs DR
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
      // No rank filter at API level - get all referring domains and filter in code
      // Note: backlinks_spam_score filtering applied in code since API doesn't support it
      // Note: first_seen date filtering may not be supported by referring_domains endpoint
    ];

    // For historical analysis, we'll try date filtering but may need to fallback
    if (beforeDate) {
      // Try adding first_seen filter - if it fails, we'll handle in catch block
      filters.push(['first_seen', '<=', beforeDate]);
    }

    const params: any = {
      target: domain,
      mode: "one_per_domain", // Get one backlink per domain to get domain authority
      exclude_internal_backlinks: true,
      limit: 1000, // We get sample data but use totalCount for the real number
      order_by: ['domain_from_rank,desc'], // Sort by domain's own rank
      rank_scale: "one_hundred" // Use 0-100 scale to match Ahrefs DR
    };

    // Only add filters if we have any
    if (filters.length > 0) {
      params.filters = filters;
    }

    console.log(`DataForSEO API Request: /backlinks/backlinks/live`, {
      params,
      beforeDate: beforeDate || 'current',
      attempt: 1
    });

    try {
      const response = await this.makeRequest('/backlinks/backlinks/live', params);
      
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
      
      console.log(`DataForSEO API Success: /backlinks/backlinks/live`, {
        itemsReturned: items.length,
        totalCount,
        beforeDate: beforeDate || 'current',
        cost: response.cost
      });

      // Apply spam score, geographic and domain authority filtering in code (but not traffic yet)
      const preFilteredDomains = items.filter((item: any) => {
        // Skip items without a valid domain name
        if (!item.domain_from) {
          return false;
        }
        
        // Apply spam score filter in code since API doesn't support it
        if (item.backlink_spam_score > AUTHORITY_CRITERIA.spamScore) {
          return false;
        }
        
        // If domain_from_rank exists and is different from rank, prioritize domain_from_rank
        const domainAuthority = item.domain_from_rank || item.rank;
        const linkAuthority = item.rank; // Authority passed to target
        
        // Log when we find domains with high own authority but low passed authority
        if (item.domain_from_rank && item.domain_from_rank !== item.rank && item.domain_from_rank >= AUTHORITY_CRITERIA.domainRank) {
          console.log(`🎯 Found high-authority domain: ${item.domain_from} (DR: ${item.domain_from_rank}, Passes: ${item.rank})`);
        }
        
        if (domainAuthority < AUTHORITY_CRITERIA.domainRank) {
          return false;
        }
        
        // Geographic filtering - prioritize Australian domains
        const country = this.getCountryFromDomain(item.domain_from);
        return AUTHORITY_CRITERIA.geoRelevance.includes(country);
      });

      console.log(`Pre-filtered ${items.length} items to ${preFilteredDomains.length} domains (before traffic filtering and consolidation)`);

      // Group domains by normalized name to consolidate www/non-www versions
      const domainGroups = new Map<string, any[]>();
      
      preFilteredDomains.forEach((item: any) => {
        if (item.domain_from) {
          const normalized = normalizeDomain(item.domain_from);
          if (!domainGroups.has(normalized)) {
            domainGroups.set(normalized, []);
          }
          domainGroups.get(normalized)!.push(item);
        }
      });
      
      console.log(`Grouped ${preFilteredDomains.length} pre-filtered domains into ${domainGroups.size} unique domains (www/non-www consolidated)`);

      // Get real traffic data for consolidated domains
      const uniqueNormalizedDomains = Array.from(domainGroups.keys());
      const domainMappings = new Map<string, string>(); // normalized -> original for API calls
      
      for (const [normalizedDomain, domainItems] of domainGroups.entries()) {
        domainMappings.set(normalizedDomain, domainItems[0].domain_from);
      }
      
      const domainNames = Array.from(domainMappings.values());
      const rawTrafficMap = await this.getBulkTrafficEstimation(domainNames, false);
      
      // Create normalized traffic map for lookups
      const trafficMap = new Map<string, number>();
      for (const [normalized, original] of domainMappings.entries()) {
        trafficMap.set(normalized, rawTrafficMap.get(original) || 0);
      }

      // Process each domain group and apply traffic filtering
      const filteredDomains = [];
      
      for (const [normalizedDomain, domainItems] of domainGroups.entries()) {
        // Consolidate metrics across www/non-www versions
        const consolidatedDomain = {
          normalized_domain: normalizedDomain,
          original_domain: domainItems[0].domain_from, // Use first version as display name
          rank: Math.max(...domainItems.map(d => d.domain_from_rank || d.rank || 0)), // Use highest rank
          backlinks_spam_score: Math.min(...domainItems.map(d => d.backlink_spam_score || 100)), // Use lowest spam score
          referring_domains: Math.max(...domainItems.map(d => d.referring_domains || 0)), // Use highest referring domains
          backlinks_count: domainItems.reduce((sum, d) => sum + (d.backlinks || 0), 0), // Sum backlinks
          traffic: trafficMap.get(normalizedDomain) || 0,
          country: this.getCountryFromDomain(domainItems[0].domain_from),
          variants: domainItems.map(d => d.domain_from) // Track all variants found
        };
        
        // Apply traffic filtering to consolidated domain
        if (consolidatedDomain.traffic >= AUTHORITY_CRITERIA.monthlyTraffic) {
          // Log consolidated domains with multiple variants
          if (consolidatedDomain.variants.length > 1) {
            console.log(`🔗 Consolidated historical domain: ${normalizedDomain} (variants: ${consolidatedDomain.variants.join(', ')}) - rank: ${consolidatedDomain.rank}, traffic: ${consolidatedDomain.traffic}`);
          }
          
          filteredDomains.push(consolidatedDomain);
        }
      }

      console.log(`Final filtering: ${domainGroups.size} unique domains → ${filteredDomains.length} authority domains (after traffic >= ${AUTHORITY_CRITERIA.monthlyTraffic})`);

      const domains = filteredDomains.map((item: any) => ({
        domain: item.normalized_domain, // Use normalized domain for consistency
        rank: item.rank,
        backlinks_spam_score: item.backlinks_spam_score,
        traffic: item.traffic,
        referring_domains: item.referring_domains,
        backlinks_count: item.backlinks_count,
        country: item.country
      }));

      return {
        authorityLinksCount: filteredDomains.length, // Count of AUTHORITY domains that passed filtering
        domains
      };
      
    } catch (error: any) {
      // If date filtering not supported by referring_domains endpoint, fall back to estimation
      if (beforeDate && error.message.includes('first_seen')) {
        console.log('Date filtering not supported by referring_domains endpoint, using estimation approach');
        
        // Get current referring domains count
        const currentResponse = await this.makeRequest('/backlinks/backlinks/live', {
          target: domain,
          mode: "one_per_domain", // Get one backlink per domain to get domain authority
          // No rank filter at API level - get all referring domains and filter in code
          exclude_internal_backlinks: true,
          limit: 1,
          rank_scale: "one_hundred" // Use 0-100 scale to match Ahrefs DR
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

export { RobustAPIClient, AUTHORITY_CRITERIA, AUSTRALIAN_LOCATIONS, COMPETITOR_BLOCKLIST };
export type { DomainData, LinkGapResult }; 