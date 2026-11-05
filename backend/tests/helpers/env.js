// Test environment. Uses its own database (abacco_crm_test by default) — never
// the development or production one. No real mail is sent in tests.
process.env.TZ = 'UTC';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://abaccotechnology:root@localhost:5432/abacco_crm_test?schema=public' // keep in sync with globalSetup.js;
process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.ENCRYPTION_KEYS = '1:' + Buffer.alloc(32, 7).toString('base64');
process.env.ENCRYPTION_ACTIVE_KEY_VERSION = '1';
process.env.SETUP_TOKEN = 'setup-token-for-tests-only-0123456789';
process.env.REDIS_URL = '';
process.env.APP_URL = 'http://localhost:5173';
