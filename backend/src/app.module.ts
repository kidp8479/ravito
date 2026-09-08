import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { LoggerModule } from 'nestjs-pino';
import { envValidationSchema } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';

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
    PrismaModule,
    HealthModule,
    AuthModule,
  ],
})
export class AppModule implements NestModule {
  // Wired here, not in main.ts: a NestApplication created by the testing
  // module (every e2e spec) skips main.ts's bootstrap() entirely, and the
  // refresh cookie (ADR 0002) needs this middleware to read req.cookies
  // regardless of how the app was created.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser()).forRoutes('*');
  }
}
