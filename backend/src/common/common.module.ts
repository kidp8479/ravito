import { Global, Module } from '@nestjs/common';
import { HouseholdMembershipGuard } from './guards/household-membership.guard';

// Global, like PrismaModule: every domain module (households/, and later
// products/, inventory/, shopping-list/ per PLAN.md's architecture) needs
// the same tenant guard rather than re-declaring it.
@Global()
@Module({
  providers: [HouseholdMembershipGuard],
  exports: [HouseholdMembershipGuard],
})
export class CommonModule {}
