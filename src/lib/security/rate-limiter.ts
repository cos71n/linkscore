import { prisma } from '../database';
import { RateLimitError } from './validation';
import { logSecurityEvent } from './validation';

/**
 * DatabaseRateLimiter - Layer 2 of LinkScore Security Framework
 * Implements application-level rate limiting with database persistence
 */
export class DatabaseRateLimiter {
  /**
   * Check rate limit for a specific identifier and type
   */
  async checkRateLimit(
    identifier: string,
    limitType: string,
    threshold: number,
    windowMinutes: number
  ): Promise<boolean> {
    const windowEnd = new Date(Date.now() + windowMinutes * 60 * 1000);
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
    
    try {
      // Clean expired records (housekeeping)
      await prisma.rateLimit.deleteMany({
        where: { 
          windowEnd: { lt: new Date() } 
        }
      });
      
      // Get current count for this identifier
      const current = await prisma.rateLimit.findFirst({
        where: {
          identifier,
          limitType,
          createdAt: { gte: windowStart }
        }
      });
      
      // Check if limit exceeded
      if (current && current.requestCount >= threshold) {
        await logSecurityEvent({
          ipAddress: identifier,
          eventType: 'RATE_LIMIT_EXCEEDED',
          severity: 'HIGH',
          details: {
            limitType,
            count: current.requestCount,
            threshold,
            windowMinutes
          },
          blocked: true
        });
        
        throw new RateLimitError(
          `Rate limit exceeded: ${threshold} ${limitType} per ${windowMinutes} minutes`
        );
      }
      
      // Update or create rate limit record
      if (current) {
        await prisma.rateLimit.update({
          where: { id: current.id },
          data: { requestCount: current.requestCount + 1 }
        });
      } else {
        await prisma.rateLimit.create({
          data: {
            identifier,
            limitType,
            requestCount: 1,
            windowEnd
          }
        });
      }
      
      return true;
      
    } catch (error) {
      if (error instanceof RateLimitError) {
        throw error; // Re-throw rate limit errors
      }
      
      // Log database errors but don't fail open
      console.error('Rate limiter database error:', error);
      
      // Fail closed on database errors for security
      throw new RateLimitError('Rate limiting service unavailable');
    }
  }
  
  /**
   * Check all rate limits as specified in PRD
   */
  async checkAllLimits(
    ip: string,
    email: string,
    domain: string
  ): Promise<void> {
    // Check IP-based limit: 3 per hour per IP
    await this.checkRateLimit(ip, 'submission_ip', 3, 60);
    
    // Check email-based limit: 1 per day per email
    await this.checkRateLimit(email, 'submission_email', 1, 1440);
    
    // Check domain-based limit: 1 per day per domain
    await this.checkRateLimit(domain, 'submission_domain', 1, 1440);
  }
  
  /**
   * Check if an identifier is currently rate limited
   */
  async isRateLimited(
    identifier: string,
    limitType: string,
    threshold: number,
    windowMinutes: number
  ): Promise<boolean> {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
    
    const current = await prisma.rateLimit.findFirst({
      where: {
        identifier,
        limitType,
        createdAt: { gte: windowStart }
      }
    });
    
    return current ? current.requestCount >= threshold : false;
  }
  
  /**
   * Get remaining requests for an identifier
   */
  async getRemainingRequests(
    identifier: string,
    limitType: string,
    threshold: number,
    windowMinutes: number
  ): Promise<number> {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
    
    const current = await prisma.rateLimit.findFirst({
      where: {
        identifier,
        limitType,
        createdAt: { gte: windowStart }
      }
    });
    
    if (!current) return threshold;
    
    return Math.max(0, threshold - current.requestCount);
  }
  
  /**
   * Reset rate limit for an identifier (for testing or admin purposes)
   */
  async resetRateLimit(
    identifier: string,
    limitType: string
  ): Promise<void> {
    await prisma.rateLimit.deleteMany({
      where: {
        identifier,
        limitType
      }
    });
  }
  
  /**
   * Get rate limit status for monitoring
   */
  async getRateLimitStatus(identifier: string): Promise<{
    ip: { count: number; remaining: number; resetIn: number };
    email: { count: number; remaining: number; resetIn: number };
    domain: { count: number; remaining: number; resetIn: number };
  }> {
    const now = Date.now();
    
    // Get IP limit status (3 per hour)
    const ipWindow = new Date(now - 60 * 60 * 1000);
    const ipLimit = await prisma.rateLimit.findFirst({
      where: {
        identifier,
        limitType: 'submission_ip',
        createdAt: { gte: ipWindow }
      }
    });
    
    // Get email limit status (1 per day)
    const emailWindow = new Date(now - 24 * 60 * 60 * 1000);
    const emailLimit = await prisma.rateLimit.findFirst({
      where: {
        identifier,
        limitType: 'submission_email',
        createdAt: { gte: emailWindow }
      }
    });
    
    // Get domain limit status (1 per day)
    const domainWindow = new Date(now - 24 * 60 * 60 * 1000);
    const domainLimit = await prisma.rateLimit.findFirst({
      where: {
        identifier,
        limitType: 'submission_domain',
        createdAt: { gte: domainWindow }
      }
    });
    
    return {
      ip: {
        count: ipLimit?.requestCount || 0,
        remaining: Math.max(0, 3 - (ipLimit?.requestCount || 0)),
        resetIn: ipLimit ? Math.max(0, ipLimit.windowEnd.getTime() - now) : 0
      },
      email: {
        count: emailLimit?.requestCount || 0,
        remaining: Math.max(0, 1 - (emailLimit?.requestCount || 0)),
        resetIn: emailLimit ? Math.max(0, emailLimit.windowEnd.getTime() - now) : 0
      },
      domain: {
        count: domainLimit?.requestCount || 0,
        remaining: Math.max(0, 1 - (domainLimit?.requestCount || 0)),
        resetIn: domainLimit ? Math.max(0, domainLimit.windowEnd.getTime() - now) : 0
      }
    };
  }
}

// Export singleton instance
export const rateLimiter = new DatabaseRateLimiter(); 