import { envValidationSchema } from './env.validation';

describe('envValidationSchema', () => {
  const validEnv = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/ravito',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
  };

  it('accepts a minimal valid environment and fills in the defaults', () => {
    const result = envValidationSchema.validate(validEnv);

    expect(result.error).toBeUndefined();
    expect(result.value as Record<string, unknown>).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      FRONTEND_ORIGIN: 'http://localhost:5173',
      LOG_LEVEL: 'info',
    });
  });

  it('rejects a missing DATABASE_URL', () => {
    const { error } = envValidationSchema.validate({
      JWT_ACCESS_SECRET: validEnv.JWT_ACCESS_SECRET,
    });

    expect(error?.message).toMatch(/DATABASE_URL/);
  });

  it('rejects a missing JWT_ACCESS_SECRET', () => {
    const { error } = envValidationSchema.validate({
      DATABASE_URL: validEnv.DATABASE_URL,
    });

    expect(error?.message).toMatch(/JWT_ACCESS_SECRET/);
  });

  it('rejects a JWT_ACCESS_SECRET shorter than 32 characters', () => {
    const { error } = envValidationSchema.validate({
      ...validEnv,
      JWT_ACCESS_SECRET: 'too-short',
    });

    expect(error).toBeDefined();
  });

  it('rejects a DATABASE_URL with the wrong scheme', () => {
    const { error } = envValidationSchema.validate({
      DATABASE_URL: 'mysql://user:pass@localhost:3306/ravito',
    });

    expect(error).toBeDefined();
  });

  it('rejects an out-of-range PORT', () => {
    const { error } = envValidationSchema.validate({
      ...validEnv,
      PORT: 70000,
    });

    expect(error).toBeDefined();
  });

  it('rejects an unknown NODE_ENV', () => {
    const { error } = envValidationSchema.validate({
      ...validEnv,
      NODE_ENV: 'staging',
    });

    expect(error).toBeDefined();
  });
});
