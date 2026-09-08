import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService, PublicUser } from './auth.service';
import {
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_TTL_MS,
} from './auth.constants';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const tokens = await this.auth.register(dto);
    setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const tokens = await this.auth.login(dto);
    setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const rawToken = getRefreshCookie(req);
    if (!rawToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const tokens = await this.auth.refresh(rawToken);
    setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const rawToken = getRefreshCookie(req);
    if (rawToken) {
      await this.auth.logout(rawToken);
    }
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() userId: string): Promise<PublicUser> {
    const user = await this.auth.getPublicUser(userId);
    if (!user) {
      // The access token is still validly signed and unexpired; the user
      // it names was deleted after issuance. Every other auth failure in
      // this controller is a 401, not a 404, so a frontend session guard
      // keyed on 401 handles this the same way as any other invalid
      // session instead of needing a special case.
      throw new UnauthorizedException('User not found');
    }
    return user;
  }
}

function getRefreshCookie(req: Request): string | undefined {
  return req.cookies[REFRESH_COOKIE_NAME] as string | undefined;
}

function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}
