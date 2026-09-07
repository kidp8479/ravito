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
    origin: config.get<string>('FRONTEND_ORIGIN') ?? 'http://localhost:5173',
    credentials: true, // needed later for cookies / the Authorization header
  });

  await app.listen(config.get<number>('PORT') ?? 3000);
}
void bootstrap();
