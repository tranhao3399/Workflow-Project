import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import type { StringValue } from 'ms';
import { AuditLogModule } from '../audit-logs/audit-log.module.js';
import { MailModule } from '../mail/mail.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { AuthRateLimit, AuthRateLimitSchema } from './schemas/auth-rate-limit.schema.js';
import { UserSession, UserSessionSchema } from './schemas/user-session.schema.js';
import { PasswordResetRequest, PasswordResetRequestSchema } from './schemas/password-reset-request.schema.js';

@Module({
  imports: [
    UsersModule,
    AuditLogModule,
    MailModule,
    MongooseModule.forFeature([
      { name: UserSession.name, schema: UserSessionSchema },
      { name: AuthRateLimit.name, schema: AuthRateLimitSchema },
      { name: PasswordResetRequest.name, schema: PasswordResetRequestSchema },
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET') ?? configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_ACCESS_TTL', '15m') as StringValue,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
