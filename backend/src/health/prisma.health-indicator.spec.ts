import { Test, TestingModule } from '@nestjs/testing';
import { HealthIndicatorService } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaHealthIndicator } from './prisma.health-indicator';

describe('PrismaHealthIndicator', () => {
  let indicator: PrismaHealthIndicator;
  let prisma: { $queryRaw: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaHealthIndicator,
        HealthIndicatorService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    indicator = module.get(PrismaHealthIndicator);
  });

  it('reports up when the database answers', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const result = await indicator.isHealthy('database');

    expect(result.database.status).toBe('up');
  });

  it('reports down when the database query throws', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));

    const result = await indicator.isHealthy('database');

    expect(result.database.status).toBe('down');
    expect(result.database.message).toBe('connection refused');
  });
});
