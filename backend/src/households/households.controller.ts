import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { HouseholdMembershipGuard } from '../common/guards/household-membership.guard';
import { CreateHouseholdDto } from './dto/create-household.dto';
import { JoinHouseholdDto } from './dto/join-household.dto';
import {
  HouseholdInvite,
  HouseholdMemberView,
  HouseholdsService,
} from './households.service';

@UseGuards(JwtAuthGuard)
@Controller('households')
export class HouseholdsController {
  constructor(private readonly households: HouseholdsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: Request,
    @Body() dto: CreateHouseholdDto,
  ): Promise<{ id: string; name: string }> {
    const { sub: userId } = req.user as JwtPayload;
    return this.households.create(userId, dto.name);
  }

  @Post('join')
  @HttpCode(HttpStatus.OK)
  async join(
    @Req() req: Request,
    @Body() dto: JoinHouseholdDto,
  ): Promise<{ householdId: string }> {
    const { sub: userId } = req.user as JwtPayload;
    return this.households.joinByCode(userId, dto.code);
  }

  @Post(':id/invites')
  @UseGuards(HouseholdMembershipGuard)
  @HttpCode(HttpStatus.CREATED)
  async createInvite(
    @Param('id') householdId: string,
    @Req() req: Request,
  ): Promise<HouseholdInvite> {
    const { sub: userId } = req.user as JwtPayload;
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
    @Req() req: Request,
  ): Promise<void> {
    const { sub: callerId } = req.user as JwtPayload;
    await this.households.removeMember(householdId, callerId, targetUserId);
  }
}
