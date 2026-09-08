import { randomBytes, createHash } from 'crypto';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL_MS } from './auth.constants';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// An explicit allow-list, not `Omit<User, 'passwordHash'>`: a future column
// added to the User model then has to be deliberately added here too,
// rather than leaking to clients by default.
export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
}

// Precomputed argon2id hash of an arbitrary string, verified on login when
// no user matches the given email. Keeps the "wrong password" and "no such
// user" branches doing the same amount of work, so a timing side-channel
// can't be used to enumerate registered emails.
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$82jfZuZdTtm0HEoawXR79g$/IMd7Cgx3o27n3IGSribmDXdX9O7bCWOT8+7boV46H0';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const email = dto.email.toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: { email, passwordHash, displayName: dto.displayName },
    });

    return this.issueTokens(user.id);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    const valid = await argon2.verify(
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      dto.password,
    );
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokens(user.id);
  }

  // Rotates the refresh token on every use (ADR 0002): presenting an
  // already-revoked token is treated as theft and revokes the rest of that
  // user's chain, rather than just rejecting the one request.
  async refresh(rawToken: string): Promise<AuthTokens> {
    const tokenHash = hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const accessToken = await this.signAccessToken(stored.userId);
    const { raw: refreshToken, id: newTokenId } = await this.createRefreshToken(
      stored.userId,
    );

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedByTokenId: newTokenId },
    });

    return { accessToken, refreshToken };
  }

  async logout(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getPublicUser(userId: string): Promise<PublicUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return null;
    }
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt,
    };
  }

  private async issueTokens(userId: string): Promise<AuthTokens> {
    const [accessToken, { raw: refreshToken }] = await Promise.all([
      this.signAccessToken(userId),
      this.createRefreshToken(userId),
    ]);

    return { accessToken, refreshToken };
  }

  private signAccessToken(userId: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId }, { expiresIn: ACCESS_TOKEN_TTL });
  }

  private async createRefreshToken(
    userId: string,
  ): Promise<{ raw: string; id: string }> {
    const raw = randomBytes(32).toString('hex');
    const { id } = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return { raw, id };
  }
}

// The refresh token is a 256-bit CSPRNG value, unlike a password: it has no
// guessable structure to protect against, so a fast hash is enough (versus
// argon2id for passwords, which do need a slow one).
function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
