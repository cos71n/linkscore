#!/usr/bin/env node

/**
 * LinkScore Environment Setup Script
 * Generates secure encryption keys and provides setup guidance
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

console.log('🔧 LinkScore Environment Setup\n');

// Generate secure keys
const encryptionKey = crypto.randomBytes(32).toString('hex');
const hashSalt = crypto.randomBytes(32).toString('hex');

console.log('🔐 Generated Security Keys:');
console.log('ENCRYPTION_KEY=' + encryptionKey);
console.log('HASH_SALT=' + hashSalt);
console.log('');

// Create .env.example content
const envExample = `# LinkScore Environment Configuration
# Copy this file to .env and fill in your actual values
# Never commit .env to version control!

# Database Configuration
# Get this from your Supabase project settings -> Database -> Connection string
DATABASE_URL="postgresql://username:password@hostname:port/database?schema=public"

# PII Encryption & Security (Generated keys - use these!)
ENCRYPTION_KEY="${encryptionKey}"
HASH_SALT="${hashSalt}"

# DataForSEO API Credentials
# Sign up at https://dataforseo.com to get these credentials
DATAFORSEO_LOGIN="your_dataforseo_login"
DATAFORSEO_PASSWORD="your_dataforseo_password"

# Optional: CRM Webhook Integration
# URL where analysis results will be sent for lead management
WEBHOOK_URL="https://your-crm-system.com/webhook/linkscore"
WEBHOOK_SECRET="your_webhook_secret_for_verification"

# Optional: Development Settings
NODE_ENV="development"
NEXT_PUBLIC_APP_URL="http://localhost:3002"

# Optional: Cloudflare Settings (for production)
# These are automatically provided by Cloudflare in production
# CF_RAY=""
# CF_CONNECTING_IP=""
# CF_BOT_SCORE=""
`;

// Write .env.example
const envExamplePath = path.join(process.cwd(), '.env.example');
fs.writeFileSync(envExamplePath, envExample);
console.log('✅ Created .env.example file');

// Check if .env already exists
const envPath = path.join(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  fs.writeFileSync(envPath, envExample);
  console.log('✅ Created .env file with generated keys');
} else {
  console.log('⚠️  .env file already exists - not overwriting');
}

console.log('\n📋 Next Steps:');
console.log('1. Update DATABASE_URL in .env with your Supabase connection string');
console.log('2. Add DataForSEO API credentials to .env');
console.log('3. Run: npm run db:push to create database tables');
console.log('4. Run: npm run dev to start the development server');
console.log('\n🔒 Security Notes:');
console.log('- Never commit .env to version control');
console.log('- Store encryption keys securely in production');
console.log('- Use environment variables in deployment platforms'); 