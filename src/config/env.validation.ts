type Environment = Record<string, unknown>;

const REQUIRED_KEYS = [
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
] as const;

function parsePositiveInteger(value: unknown, fallback: number, name: string): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

export function validateEnvironment(config: Environment): Environment {
  const missing = REQUIRED_KEYS.filter((key) => {
    const value = config[key];
    return typeof value !== 'string' || value.trim().length === 0;
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  const accessSecret = String(config.JWT_ACCESS_SECRET);
  const refreshSecret = String(config.JWT_REFRESH_SECRET);

  if (accessSecret.length < 32 || refreshSecret.length < 32) {
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must each be at least 32 characters.',
    );
  }

  return {
    ...config,
    NODE_ENV: config.NODE_ENV ?? 'development',
    PORT: parsePositiveInteger(config.PORT, 3000, 'PORT'),
    DB_PORT: parsePositiveInteger(config.DB_PORT, 5432, 'DB_PORT'),
    JWT_ACCESS_EXPIRES_IN: config.JWT_ACCESS_EXPIRES_IN ?? '15m',
    JWT_REFRESH_EXPIRES_IN: config.JWT_REFRESH_EXPIRES_IN ?? '7d',
  };
}
