/**
 * Domain Blocklist Service
 * Fetches blocked domains from Google Sheets and validates domain access
 */

interface BlocklistCache {
  domains: Set<string>;
  lastUpdated: number;
  ttl: number; // Time to live in milliseconds
}

class DomainBlocklist {
  private cache: BlocklistCache | null = null;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache
  private readonly SHEET_ID = '1zyiCYrIzsvonBOx0RDSJHMN-iEXnni-WRagHtQOOM8U';

  private getSheetCsvUrl(): string {
    return `https://docs.google.com/spreadsheets/d/${this.SHEET_ID}/export?format=csv&gid=0`;
  }

  /**
   * Fetch domains from Google Sheets CSV
   */
  private async fetchBlockedDomains(): Promise<Set<string>> {
    try {
      console.log('🚫 Fetching domain blocklist from Google Sheets...');
      
      const response = await fetch(this.getSheetCsvUrl(), {
        method: 'GET',
        headers: {
          'User-Agent': 'LinkScore-Blocklist/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const csvText = await response.text();
      console.log('📄 CSV data received, parsing domains...');
      
      // Parse CSV and extract domains
      const domains = new Set<string>();
      const lines = csvText.split('\n');
      
      for (const line of lines) {
        const domain = line.trim().toLowerCase();
        
        // Skip empty lines and potential headers
        if (domain && 
            domain !== 'domain' && 
            domain !== 'domains' && 
            !domain.startsWith('#') &&
            this.isValidDomain(domain)) {
          
          // Remove protocols and www if present
          const cleanDomain = this.normalizeDomain(domain);
          domains.add(cleanDomain);
        }
      }

      console.log(`✅ Loaded ${domains.size} blocked domains from sheet`);
      console.log('🚫 Sample domains:', Array.from(domains).slice(0, 3));
      
      return domains;
      
    } catch (error) {
      console.error('❌ Failed to fetch domain blocklist:', error);
      // Return empty set on error to avoid blocking all requests
      return new Set<string>();
    }
  }

  /**
   * Normalize domain for consistent matching
   */
  private normalizeDomain(domain: string): string {
    let normalized = domain.toLowerCase().trim();
    
    // Remove protocol
    normalized = normalized.replace(/^https?:\/\//, '');
    
    // Remove www prefix
    normalized = normalized.replace(/^www\./, '');
    
    // Remove trailing slash and path
    normalized = normalized.split('/')[0];
    
    // Remove port numbers
    normalized = normalized.split(':')[0];
    
    return normalized;
  }

  /**
   * Basic domain validation
   */
  private isValidDomain(domain: string): boolean {
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.([a-zA-Z]{2,}|[a-zA-Z]{2,}\.[a-zA-Z]{2,})$/;
    return domainRegex.test(this.normalizeDomain(domain));
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(): boolean {
    if (!this.cache) return false;
    return (Date.now() - this.cache.lastUpdated) < this.CACHE_TTL;
  }

  /**
   * Get blocked domains with caching
   */
  private async getBlockedDomains(): Promise<Set<string>> {
    // Return cached data if still valid
    if (this.isCacheValid() && this.cache) {
      console.log('📦 Using cached blocklist data');
      return this.cache.domains;
    }

    // Fetch fresh data
    const domains = await this.fetchBlockedDomains();
    
    // Update cache
    this.cache = {
      domains,
      lastUpdated: Date.now(),
      ttl: this.CACHE_TTL
    };

    return domains;
  }

  /**
   * Check if a domain is blocked
   */
  public async isDomainBlocked(domain: string): Promise<boolean> {
    try {
      const normalizedDomain = this.normalizeDomain(domain);
      const blockedDomains = await this.getBlockedDomains();
      
      const isBlocked = blockedDomains.has(normalizedDomain);
      
      if (isBlocked) {
        console.log(`🚫 Domain blocked: ${normalizedDomain}`);
      } else {
        console.log(`✅ Domain allowed: ${normalizedDomain}`);
      }
      
      return isBlocked;
      
    } catch (error) {
      console.error('❌ Error checking domain blocklist:', error);
      // On error, don't block (fail open)
      return false;
    }
  }

  /**
   * Manually refresh the blocklist cache
   */
  public async refreshCache(): Promise<void> {
    console.log('🔄 Manually refreshing domain blocklist cache...');
    this.cache = null;
    await this.getBlockedDomains();
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { domainsCount: number; lastUpdated: Date | null; isValid: boolean } {
    return {
      domainsCount: this.cache?.domains.size || 0,
      lastUpdated: this.cache ? new Date(this.cache.lastUpdated) : null,
      isValid: this.isCacheValid()
    };
  }
}

// Export singleton instance
export const domainBlocklist = new DomainBlocklist();

/**
 * Middleware function for checking domain blocks
 */
export async function checkDomainBlocklist(domain: string): Promise<{ isBlocked: boolean; error?: string }> {
  try {
    const isBlocked = await domainBlocklist.isDomainBlocked(domain);
    
    if (isBlocked) {
      return {
        isBlocked: true,
        error: 'Service temporarily unavailable. Please try again later.'
      };
    }
    
    return { isBlocked: false };
    
  } catch (error) {
    console.error('Domain blocklist check failed:', error);
    // Fail open - don't block on error
    return { isBlocked: false };
  }
} 