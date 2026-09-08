// Shared by every spec (unit and e2e) that needs to simulate a specific
// Prisma error code without a real database - constructing these by hand
// in three separate places risked them drifting (RAV-7 code review).

import { Prisma } from '@prisma/client';

export function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

export function recordNotFoundError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Record not found', {
    code: 'P2025',
    clientVersion: 'test',
  });
}
