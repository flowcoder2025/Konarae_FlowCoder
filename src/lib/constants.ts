/**
 * Centralized Constants
 * All magic numbers and configuration values in one place
 */

// ============================================
// Pagination
// ============================================
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

// ============================================
// Rate Limiting
// ============================================
export const RATE_LIMIT = {
  REQUESTS_PER_WINDOW: 10,
  WINDOW_SECONDS: 60,
} as const;

// ============================================
// Timeouts (in milliseconds)
// ============================================
export const TIMEOUT = {
  API_REQUEST_MS: 10000,
  CRON_MAX_DURATION: 60,
  DOCUMENT_ANALYZE_MAX_DURATION: 300,
} as const;

// ============================================
// Matching
// ============================================
export const MATCHING = {
  DEFAULT_MIN_SCORE: 60,
  BATCH_SIZE: 50,
  HIGH_CONFIDENCE_THRESHOLD: 80,
  MEDIUM_CONFIDENCE_THRESHOLD: 60,
} as const;

// ============================================
// File Upload
// ============================================
export const FILE_UPLOAD = {
  MAX_FILE_SIZE_MB: 10,
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
  ALLOWED_DOCUMENT_TYPES: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
  ] as const,
} as const;

// ============================================
// Notifications
// ============================================
export const NOTIFICATIONS = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

// ============================================
// Embedding
// ============================================
export const EMBEDDING = {
  DIMENSION: 1536,
  MODEL: 'text-embedding-3-small',
  BATCH_SIZE: 50,
} as const;

// ============================================
// Date/Time
// ============================================
export const DATE_TIME = {
  DEADLINE_WARNING_DAYS: 30,
  MS_PER_DAY: 24 * 60 * 60 * 1000,
} as const;
