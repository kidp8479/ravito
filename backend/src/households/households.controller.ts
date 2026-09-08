import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HouseholdMembershipGuard } from '../common/guards/household-membership.guard';
import { CreateHouseholdDto } from './dto/create-household.dto';
import { JoinHouseholdDto } from './dto/join-household.dto';
import {
  HouseholdInvite,
  HouseholdMemberView,
  HouseholdsService,
  HouseholdSummary,
} from './households.service';

// 10 req/min/IP (RAV-7): the join-by-code route accepts a guessable-format
// secret, so it gets the same defense-in-depth as auth/'s routes even
// though the code's entropy already makes brute-forcing impractical.
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@Controller('households')
export class HouseholdsController {
  constructor(private readonly households: HouseholdsService) {}

  @Get('mine')
  async listMine(@CurrentUser() userId: string): Promise<HouseholdSummary[]> {
    return this.households.listMine(userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() userId: string,
    @Body() dto: CreateHouseholdDto,
  ): Promise<{ id: string; name: string }> {
    return this.households.create(userId, dto.name);
  }

  @Post('join')
  @HttpCode(HttpStatus.OK)
  async join(
    @CurrentUser() userId: string,
    @Body() dto: JoinHouseholdDto,
  ): Promise<{ householdId: string }> {
    return this.households.joinByCode(userId, dto.code);
  }

  @Post(':id/invites')
  @UseGuards(HouseholdMembershipGuard)
  @HttpCode(HttpStatus.CREATED)
  async createInvite(
    @Param('id') householdId: string,
    @CurrentUser() userId: string,
  ): Promise<HouseholdInvite> {
    return this.households.createInvite(householdId, userId);
  }

  @Get(':id/members')
  @UseGuards(HouseholdMembershipGuard)
  async listMembers(
    @Param('id') householdId: string,
  ): Promise<HouseholdMemberView[]> {
    return this.households.listMembers(householdId);
  }

  @Delete(':id/members/:userId')
  @UseGuards(HouseholdMembershipGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('id') householdId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() callerId: string,
  ): Promise<void> {
    await this.households.removeMember(householdId, callerId, targetUserId);
  }
}
