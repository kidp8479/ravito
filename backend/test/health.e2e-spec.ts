import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckResult } from '@nestjs/terminus';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/healthz (GET) reports the app and database as up', () => {
    return request(app.getHttpServer())
      .get('/healthz')
      .expect(200)
      .expect((res) => {
        const body = res.body as HealthCheckResult;
        expect(body.status).toBe('ok');
        expect(body.details.database.status).toBe('up');
      });
  });

  it('sends helmet security headers on every response', () => {
    // helmet() is wired in AppModule.configure(), not main.ts's
    // bootstrap() - every e2e spec skips bootstrap(), so this is the
    // only thing that would catch a regression removing it (RAV-6
    // security review).
    return request(app.getHttpServer())
      .get('/healthz')
      .expect(200)
      .expect('x-content-type-options', 'nosniff')
      .expect((res) => {
        expect(res.headers['x-powered-by']).toBeUndefined();
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
