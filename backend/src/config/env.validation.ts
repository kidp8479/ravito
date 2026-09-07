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

  // Optional - CORS allowed origin for the SPA. main.ts falls back to the
  // local Vite dev server when unset.
  FRONTEND_ORIGIN: Joi.string().uri().optional(),

  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
});
