/**
 * Vitest Setup File
 *
 * Loads environment variables before all tests run
 */

import { config } from 'dotenv';

// Load environment variables from .env
// Use path from current working directory to ensure it's found
const result = config();

if (result.error) {
  console.warn('Warning: Failed to load .env file:', result.error);
}

// Verify required keys for API tests
const requiredKeys = [
  'HELIUS_RPC_URL',
  'GOPLUS_API_KEY'
];

const missingKeys = requiredKeys.filter(key => !process.env[key]);

if (missingKeys.length > 0) {
  console.warn(`Warning: Missing environment variables: ${missingKeys.join(', ')}`);
}
