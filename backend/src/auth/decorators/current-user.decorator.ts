import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { JwtPayload } from '../strategies/jwt.strategy';

// Trusts that a guard already populated req.user (JwtAuthGuard, always
// paired with this in practice) rather than re-checking here too - that
// check belongs at the guard, the actual enforcement point (see
// HouseholdMembershipGuard's comment on the same precondition).
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return (req.user as JwtPayload).sub;
  },
);
