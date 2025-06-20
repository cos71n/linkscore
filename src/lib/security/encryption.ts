import crypto from 'crypto';

/**
 * PII Encryption Utilities for LinkScore
 * Provides secure encryption/decryption of personally identifiable information
 */

interface EncryptedData {
  encrypted: string;
  iv: string;
  tag: string;
}

export class PIIEncryption {
  private static algorithm = 'aes-256-cbc';
  private static keyLength = 32; // 256 bits
  
  private static getEncryptionKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }
    
    if (key.length !== 64) { // 32 bytes = 64 hex characters
      throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }
    
    return Buffer.from(key, 'hex');
  }
  
  private static getHashSalt(): string {
    const salt = process.env.HASH_SALT;
    if (!salt) {
      throw new Error('HASH_SALT environment variable is required');
    }
    
    if (salt.length < 32) {
      throw new Error('HASH_SALT must be at least 32 characters');
    }
    
    return salt;
  }
  
  /**
   * Encrypt sensitive data for storage
   */
  static encrypt(data: string): EncryptedData {
    if (!data) {
      throw new Error('Data to encrypt cannot be empty');
    }
    
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: '' // Not used with CBC mode
    };
  }
  
  /**
   * Decrypt sensitive data for use
   */
  static decrypt(encryptedData: EncryptedData): string {
    if (!encryptedData.encrypted || !encryptedData.iv) {
      throw new Error('Invalid encrypted data format');
    }
    
    const key = this.getEncryptionKey();
    const iv = Buffer.from(encryptedData.iv, 'hex');
    
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
  
  /**
   * Create hash for lookup purposes (non-reversible)
   */
  static hashForLookup(data: string): string {
    if (!data) {
      throw new Error('Data to hash cannot be empty');
    }
    
    const salt = this.getHashSalt();
    return crypto
      .createHash('sha256')
      .update(data + salt)
      .digest('hex');
  }
  
  /**
   * Generate secure random encryption key (for initial setup)
   */
  static generateEncryptionKey(): string {
    return crypto.randomBytes(this.keyLength).toString('hex');
  }
  
  /**
   * Generate secure random hash salt (for initial setup)
   */
  static generateHashSalt(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}

/**
 * Helper functions for common PII operations
 */
export const encryptEmail = (email: string): { encrypted: string; hash: string } => {
  const encrypted = PIIEncryption.encrypt(email.toLowerCase().trim());
  const hash = PIIEncryption.hashForLookup(email.toLowerCase().trim());
  
  return {
    encrypted: JSON.stringify(encrypted),
    hash
  };
};

export const decryptEmail = (encryptedEmailJson: string): string => {
  const encryptedData = JSON.parse(encryptedEmailJson) as EncryptedData;
  return PIIEncryption.decrypt(encryptedData);
};

export const hashPhone = (phone: string): string => {
  // Normalize phone number (remove all non-digits)
  const normalized = phone.replace(/\D/g, '');
  return PIIEncryption.hashForLookup(normalized);
};

/**
 * Validate environment variables are properly configured
 */
export const validateEncryptionConfig = (): void => {
  try {
    PIIEncryption['getEncryptionKey']();
    PIIEncryption['getHashSalt']();
  } catch (error) {
    console.error('❌ Encryption configuration error:', error);
    throw new Error('Encryption environment variables not properly configured');
  }
};

/**
 * Development utility to generate secure keys
 */
export const generateSecurityKeys = () => {
  console.log('🔐 Generated Security Keys for LinkScore:');
  console.log('');
  console.log('ENCRYPTION_KEY=' + PIIEncryption.generateEncryptionKey());
  console.log('HASH_SALT=' + PIIEncryption.generateHashSalt());
  console.log('');
  console.log('⚠️  Store these securely and never commit to version control!');
}; 