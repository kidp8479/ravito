import { envValidationSchema } from './env.validation';

describe('envValidationSchema', () => {
  const validEnv = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/ravito',
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
    const { error } = envValidationSchema.validate({});

    expect(error?.message).toMatch(/DATABASE_URL/);
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
