/**
 * Jest Setup File
 * Global test environment configuration
 */

// Setup global fetch polyfill for Node.js environment
const fetch = require('node-fetch');
global.fetch = fetch;

// Setup TextEncoder/TextDecoder for jsPDF and other libraries
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock environment variables for testing
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test";
process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "test-secret-key-for-testing-only";

// Mock Railway services (테스트에서 실제 API 호출 안함)
process.env.RAILWAY_HWP_PARSER_URL = "http://localhost:8001";
process.env.RAILWAY_PDF_PARSER_URL = "http://localhost:8002";
process.env.RAILWAY_HWPX_PARSER_URL = "http://localhost:8003";
process.env.RAILWAY_CRAWLER_URL = "http://localhost:8004";
process.env.RAILWAY_AI_PROCESSOR_URL = "http://localhost:8005";

// Mock AI API keys (실제 값 없이도 테스트 가능)
process.env.OPENAI_API_KEY = "sk-test-key";
process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

// Setup TransformStream for AI SDK
const { TransformStream } = require('stream/web');
global.TransformStream = TransformStream;
