process.env.NODE_ENV = 'test';

// Safety by default: e2e tests must never point at the normal StockFlow DB.
// DB host/user/password can continue to come from the project's normal .env,
// but DB_NAME is forcibly redirected to a dedicated test database.
process.env.DB_NAME =
  process.env.E2E_DB_NAME || 'stockflow_test';

process.env.JWT_ACCESS_SECRET =
  process.env.E2E_JWT_ACCESS_SECRET ||
  'stockflow-e2e-access-secret-0123456789abcdef';

process.env.JWT_REFRESH_SECRET =
  process.env.E2E_JWT_REFRESH_SECRET ||
  'stockflow-e2e-refresh-secret-0123456789abcdef';

process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
