import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);

  // Close DB connections and run module teardown on SIGTERM/SIGINT (what
  // `docker stop` sends) instead of dropping them.
  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strips fields not declared in the DTO
      forbidNonWhitelisted: true, // ...and returns 400 if any are sent
      transform: true, // turns the JSON payload into a DTO class instance
    }),
  );

  app.enableCors({
    // getOrThrow, not get: Joi guarantees both vars are set (with
    // defaults), so ConfigService's own "might be undefined" return type
    // would otherwise be a lie here.
    origin: config.getOrThrow<string>('FRONTEND_ORIGIN'),
    credentials: true, // needed later for cookies / the Authorization header
  });

  await app.listen(config.getOrThrow<number>('PORT'));
}
void bootstrap();
