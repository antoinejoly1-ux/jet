// Test defaults. CI and local runs point TEST_DATABASE_URL at a throwaway database.
process.env.TEST_DATABASE_URL ??= "postgresql://jet:jet@localhost:5432/jet_test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-0000";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.RESEND_API_KEY = "";
