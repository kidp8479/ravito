import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { LoggerModule } from 'nestjs-pino';
import { envValidationSchema } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { HouseholdsModule } from './households/households.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Compose (dev) and the deploy environment (prod) inject every var
      // into the process directly; there is no .env file to read here.
      ignoreEnvFile: true,
      validationSchema: envValidationSchema,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>('LOG_LEVEL'),
          transport:
            config.get<string>('NODE_ENV') !== 'production'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
          // The access token (Bearer) and refresh token (cookie) must
          // never land in logs, same as a password (RAV-6 security
          // review) - pino-http's default serializers log every request
          // and response header otherwise.
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
            ],
            censor: '[Redacted]',
          },
        },
      }),
    }),
    // 10 requests / minute per IP, applied per-controller via
    // `@UseGuards(ThrottlerGuard)` (originally RAV-6, on auth/ only;
    // households/'s join-by-code route needs the same defense against
    // guessing, RAV-7). @nestjs/throttler's ThrottlerModule is itself
    // @Global(), so this is reachable from every module regardless of
    // where it's registered.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
    PrismaModule,
    CommonModule,
    HealthModule,
    AuthModule,
    HouseholdsModule,
  ],
})
export class AppModule implements NestModule {
  // Wired here, not in main.ts: a NestApplication created by the testing
  // module (every e2e spec) skips main.ts's bootstrap() entirely, and
  // both the refresh cookie (ADR 0002, needs req.cookies) and the
  // security headers below need to apply regardless of how the app was
  // created - the same gap that let helmet() ship untested in RAV-6's
  // security review, until it moved here alongside cookie-parser.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser(), helmet()).forRoutes('*');
  }
}
