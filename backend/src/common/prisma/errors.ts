import { Prisma } from '@prisma/client';

// Shared by every service that maps a Prisma error code to an HTTP
// exception (products/, inventory/, more to come) - constructing this
// instanceof + code check in each service risked it drifting, same
// reasoning as test/prisma-errors.ts for the test-side equivalent.

export function isUniqueConstraintError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

export function isRecordNotFoundError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  );
}
