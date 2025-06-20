/**
 * LinkScore Security Framework
 * Implements comprehensive 3-layer security as specified in PRD
 * 
 * Layer 1: Cloudflare (Edge Protection) - Configured separately
 * Layer 2: Database Rate Limiting - Implemented here
 * Layer 3: Input Validation - Implemented here
 */

export * from './validation';
export * from './rate-limiter';
export * from './encryption';

import { rateLimiter } from './rate-limiter';
import { validateAndSanitizeInput, UserInput, logSecurityEvent } from './validation';
import { encryptEmail, hashPhone } from './encryption';
import { prisma } from '../database';

/**
 * Complete security check for user submissions
 * Combines all 3 layers of security
 */
export async function performSecurityCheck(
  userInput: UserInput,
  request: {
    ip: string;
    userAgent?: string;
    cfRay?: string;
    cfBotScore?: number;
  }
): Promise<{
  sanitizedInput: UserInput;
  emailEncrypted: string;
  emailHash: string;
  phoneHash: string | null;
}> {
  try {
    // Layer 2: Rate limiting check
    await rateLimiter.checkAllLimits(
      request.ip,
      userInput.email,
      userInput.domain
    );
    
    // Layer 3: Input validation and sanitization
    const sanitizedInput = await validateAndSanitizeInput(
      userInput,
      request.ip
    );
    
    // Encrypt PII for storage
    const { encrypted: emailEncrypted, hash: emailHash } = encryptEmail(sanitizedInput.email);
    const phoneHash = sanitizedInput.phone ? hashPhone(sanitizedInput.phone) : null;
    
    // Log successful submission
    await logSecurityEvent({
      ipAddress: request.ip,
      eventType: 'SUBMISSION_ACCEPTED',
      severity: 'LOW',
      userAgent: request.userAgent,
      cfRay: request.cfRay,
      cfBotScore: request.cfBotScore,
      details: {
        domain: sanitizedInput.domain,
        location: sanitizedInput.location
      }
    });
    
    return {
      sanitizedInput,
      emailEncrypted,
      emailHash,
      phoneHash
    };
    
  } catch (error) {
    // Log security failures
    await logSecurityEvent({
      ipAddress: request.ip,
      eventType: 'SUBMISSION_BLOCKED',
      severity: 'HIGH',
      userAgent: request.userAgent,
      cfRay: request.cfRay,
      cfBotScore: request.cfBotScore,
      blocked: true,
      details: {
        error: error instanceof Error ? error.message : 'Unknown error',
        domain: userInput.domain?.substring(0, 50) // Truncate for safety
      }
    });
    
    throw error;
  }
}

/**
 * Get client IP address from various headers
 * Prioritizes Cloudflare headers when available
 */
export function getClientIP(headers: any): string {
  // Cloudflare header (most reliable when using CF)
  if (headers['cf-connecting-ip']) {
    return headers['cf-connecting-ip'];
  }
  
  // Standard forwarded headers
  if (headers['x-forwarded-for']) {
    const ips = headers['x-forwarded-for'].split(',');
    return ips[0].trim();
  }
  
  if (headers['x-real-ip']) {
    return headers['x-real-ip'];
  }
  
  // Fallback to remote address
  return headers['x-remote-addr'] || '0.0.0.0';
}

/**
 * Extract Cloudflare headers for security context
 */
export function getCloudflareContext(headers: any): {
  cfRay?: string;
  cfBotScore?: number;
  country?: string;
} {
  return {
    cfRay: headers['cf-ray'],
    cfBotScore: headers['cf-bot-management-score'] 
      ? parseInt(headers['cf-bot-management-score']) 
      : undefined,
    country: headers['cf-ipcountry']
  };
}

/**
 * Security middleware for API routes
 */
export async function securityMiddleware(
  request: Request
): Promise<{
  ip: string;
  userAgent: string;
  cfContext: ReturnType<typeof getCloudflareContext>;
  isBlocked: boolean;
}> {
  const headers = Object.fromEntries(request.headers.entries());
  const ip = getClientIP(headers);
  const userAgent = headers['user-agent'] || 'Unknown';
  const cfContext = getCloudflareContext(headers);
  
  // Check if IP is already blocked
  const recentBlocks = await prisma.securityEvent.count({
    where: {
      ipAddress: ip,
      blocked: true,
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
      }
    }
  });
  
  const isBlocked = recentBlocks >= 3; // Block after 3 security events
  
  if (isBlocked) {
    await logSecurityEvent({
      ipAddress: ip,
      eventType: 'IP_BLOCKED',
      severity: 'CRITICAL',
      userAgent,
      cfRay: cfContext.cfRay,
      cfBotScore: cfContext.cfBotScore,
      blocked: true,
      details: {
        reason: 'Multiple security violations',
        blockCount: recentBlocks
      }
    });
  }
  
  return {
    ip,
    userAgent,
    cfContext,
    isBlocked
  };
}

// Re-export for convenience
export { ValidationError, RateLimitError } from './validation';

/**
 * Security configuration constants
 */
export const SECURITY_CONFIG = {
  // Rate limits (as specified in PRD)
  rateLimits: {
    ip: { threshold: 3, windowMinutes: 60 },
    email: { threshold: 1, windowMinutes: 1440 },
    domain: { threshold: 1, windowMinutes: 1440 }
  },
  
  // Authority link criteria
  authorityLinkCriteria: {
    domainRank: 20,
    spamScore: 30,
    monthlyTraffic: 750,
    geoRelevance: ['AU', 'US', 'UK', 'EU', 'NZ', 'CA']
  },
  
  // Suspicious TLDs to block
  suspiciousTlds: ['.tk', '.ml', '.cf', '.ga', '.pw'],
  
  // Valid Australian locations
  validLocations: [
    'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide',
    'gold_coast', 'newcastle', 'canberra', 'sunshine_coast',
    'wollongong', 'central_coast', 'logan_city', 'australia_general'
  ]
}; 