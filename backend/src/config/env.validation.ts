import * as Joi from 'joi';

/**
 * Schema for every environment variable the app reads. ConfigModule runs
 * this at startup and refuses to boot if anything is missing or malformed,
 * so a misconfigured deploy fails immediately instead of surfacing as a
 * runtime error later.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),

  // Single connection string, the format Prisma itself expects.
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),

  // CORS allowed origin for the SPA, defaulting to the local Vite dev server.
  FRONTEND_ORIGIN: Joi.string().uri().default('http://localhost:5173'),

  // Symmetric signing key for access tokens (ADR 0002). 32 chars minimum so
  // a trivially short secret can't slip into an env file unnoticed.
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),

  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
});
