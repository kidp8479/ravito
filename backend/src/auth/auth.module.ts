import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      }),
    }),
    // ThrottlerModule.forRoot() moved to AppModule (RAV-7): households/'s
    // join-by-code route needs the same ThrottlerGuard, and while
    // @nestjs/throttler's ThrottlerModule is itself @Global() (so this
    // would still have worked registered here), an app-wide rate limiter
    // reads clearer declared alongside Prisma/Common at the app level
    // than nested inside the one domain module that needed it first.
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
