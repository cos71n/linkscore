import { prisma } from '../database';

/**
 * LinkScore Security Validation & Sanitization
 * Implements Layer 3 of the security framework - comprehensive input validation
 */

// Custom error classes
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * Domain validation and sanitization
 */
export function sanitizeDomain(domain: string): string {
  if (!domain || typeof domain !== 'string') {
    throw new ValidationError('Invalid domain format');
  }
  
  // Convert to lowercase and remove common prefixes
  const cleaned = domain.toLowerCase()
    .replace(/[^a-z0-9.-]/g, '') // Remove invalid characters
    .replace(/^https?:\/\//, '') // Remove protocol
    .replace(/^www\./, '') // Remove www
    .replace(/\/.*$/, '') // Remove path
    .trim();
  
  // Basic domain format validation
  if (!cleaned || cleaned.length < 4 || cleaned.length > 253) {
    throw new ValidationError('Invalid domain length');
  }
  
  // Check for valid domain pattern
  const domainPattern = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;
  if (!domainPattern.test(cleaned)) {
    throw new ValidationError('Invalid domain name format');
  }
  
  // Block suspicious TLDs as specified in PRD
  const suspiciousTlds = ['.tk', '.ml', '.cf', '.ga', '.pw'];
  if (suspiciousTlds.some(tld => cleaned.endsWith(tld))) {
    throw new ValidationError('Domain not supported for analysis');
  }
  
  return cleaned;
}

/**
 * Email validation and sanitization
 */
export function sanitizeEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    throw new ValidationError('Invalid email format');
  }
  
  const cleaned = email.toLowerCase().trim();
  
  // Basic email validation
  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailPattern.test(cleaned)) {
    throw new ValidationError('Invalid email address');
  }
  
  // Block disposable email domains
  const disposableDomains = ['tempmail.com', 'throwaway.email', '10minutemail.com'];
  const emailDomain = cleaned.split('@')[1];
  if (disposableDomains.includes(emailDomain)) {
    throw new ValidationError('Disposable email addresses not allowed');
  }
  
  return cleaned;
}

/**
 * Text sanitization (for names, company names, etc.)
 */
export function sanitizeText(text: string | null | undefined): string {
  if (!text) return '';
  
  if (typeof text !== 'string') {
    throw new ValidationError('Invalid text format');
  }
  
  // Remove any HTML tags and dangerous characters
  const cleaned = text
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/[<>\"'`]/g, '') // Remove potentially dangerous characters
    .trim();
  
  if (cleaned.length > 100) {
    throw new ValidationError('Text too long (max 100 characters)');
  }
  
  // Block obvious SQL injection patterns
  const dangerousPatterns = [
    /\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|CREATE|ALTER|EXEC|SCRIPT)\b/i,
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i, // Event handlers like onclick=
    /\\\'/g, // Escaped quotes
    /--/g, // SQL comments
  ];
  
  if (dangerousPatterns.some(pattern => pattern.test(cleaned))) {
    throw new ValidationError('Invalid characters detected');
  }
  
  return cleaned;
}

/**
 * Phone number sanitization
 */
export function sanitizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  
  if (typeof phone !== 'string') {
    throw new ValidationError('Invalid phone format');
  }
  
  // Keep only digits and common separators
  const cleaned = phone.replace(/[^\d\s+()-]/g, '').trim();
  
  // Australian phone number validation (rough)
  if (cleaned.length < 8 || cleaned.length > 15) {
    throw new ValidationError('Invalid phone number length');
  }
  
  return cleaned;
}

/**
 * Location validation (must be from approved list)
 */
export function validateLocation(location: string): string {
  const validLocations = [
    'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide',
    'gold_coast', 'newcastle', 'canberra', 'sunshine_coast',
    'wollongong', 'central_coast', 'logan_city', 'australia_general'
  ];
  
  if (!validLocations.includes(location)) {
    throw new ValidationError('Invalid location selected');
  }
  
  return location;
}

/**
 * Investment range validation
 */
export function validateSpendRange(spendRange: string): string {
  const validRanges = ['1000-2000', '2000-4000', '4000-6000', '6000-10000', '10000+'];
  
  if (!validRanges.includes(spendRange)) {
    throw new ValidationError('Invalid spend range selected');
  }
  
  return spendRange;
}

/**
 * Duration range validation
 */
export function validateDurationRange(durationRange: string): string {
  const validRanges = ['6-12', '12-24', '24+'];
  
  if (!validRanges.includes(durationRange)) {
    throw new ValidationError('Invalid duration range selected');
  }
  
  return durationRange;
}

/**
 * Keywords validation and sanitization
 */
export function sanitizeKeywords(keywords: string[]): string[] {
  if (!Array.isArray(keywords)) {
    throw new ValidationError('Keywords must be an array');
  }
  
  if (keywords.length < 1 || keywords.length > 3) {
    throw new ValidationError('Please provide 1-3 keywords');
  }
  
  return keywords.map(keyword => {
    if (typeof keyword !== 'string') {
      throw new ValidationError('Invalid keyword format');
    }
    
    const cleaned = sanitizeText(keyword);
    if (cleaned.length < 2 || cleaned.length > 50) {
      throw new ValidationError('Keywords must be 2-50 characters');
    }
    
    return cleaned;
  });
}

/**
 * Complete input validation and sanitization
 */
export interface UserInput {
  domain: string;
  email: string;
  firstName?: string;
  phone?: string;
  company?: string;
  location: string;
  spendRange: string;
  durationRange: string;
  keywords: string[];
}

export async function validateAndSanitizeInput(
  userInput: UserInput,
  ipAddress: string
): Promise<UserInput> {
  try {
    // Validate and sanitize all inputs
    const sanitized: UserInput = {
      domain: sanitizeDomain(userInput.domain),
      email: sanitizeEmail(userInput.email),
      firstName: sanitizeText(userInput.firstName),
      phone: sanitizePhone(userInput.phone),
      company: sanitizeText(userInput.company),
      location: validateLocation(userInput.location),
      spendRange: validateSpendRange(userInput.spendRange),
      durationRange: validateDurationRange(userInput.durationRange),
      keywords: sanitizeKeywords(userInput.keywords),
    };
    
    return sanitized;
  } catch (error) {
    // Log validation failures as security events
    await logSecurityEvent({
      ipAddress,
      eventType: 'VALIDATION_FAILED',
      severity: 'MEDIUM',
      details: {
        error: error instanceof Error ? error.message : 'Unknown validation error',
        input: {
          domain: userInput.domain?.substring(0, 50), // Truncate for logging
        }
      }
    });
    
    throw error;
  }
}

/**
 * Security event logging
 */
export interface SecurityEventData {
  ipAddress: string;
  userId?: string;
  eventType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details?: any;
  userAgent?: string;
  cfRay?: string;
  cfBotScore?: number;
  blocked?: boolean;
}

export async function logSecurityEvent(data: SecurityEventData): Promise<void> {
  try {
    await prisma.securityEvent.create({
      data: {
        ipAddress: data.ipAddress,
        userId: data.userId,
        eventType: data.eventType,
        severity: data.severity,
        details: data.details || {},
        userAgent: data.userAgent,
        cfRay: data.cfRay,
        cfBotScore: data.cfBotScore,
        blocked: data.blocked || false,
      }
    });
  } catch (error) {
    console.error('Failed to log security event:', error);
    // Don't throw - security logging should not break the application
  }
} 