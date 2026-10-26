import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { Model } from 'mongoose';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { AuditOutcome } from '../audit-logs/enums/audit-outcome.enum.js';
import { isMongoDuplicateKeyError } from '../common/database/mongo-errors.js';
import { MailService } from '../mail/mail.service.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { UsersService } from '../users/users.service.js';
import type { SafeUser, SafeUserWithPermissions } from '../users/users.service.js';
import { UserRole } from '../users/enums/user-role.enum.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ForgotPasswordRequestDto, ForgotPasswordResetDto, ForgotPasswordVerifyDto } from './dto/forgot-password.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { JwtPayload } from './interfaces/jwt-payload.interface.js';
import { AuthRateLimit, type AuthRateLimitAction } from './schemas/auth-rate-limit.schema.js';
import { UserSession, UserSessionDocument } from './schemas/user-session.schema.js';
import { PasswordResetRequest } from './schemas/password-reset-request.schema.js';

const LOGIN_IP_LIMIT = 30;
const LOGIN_IP_WINDOW_MS = 60_000;
const FAILED_LOGIN_LIMIT = 5;
const FAILED_LOGIN_WINDOW_MS = 15 * 60_000;
const ACCOUNT_LOCK_MS = 10 * 60_000;
const PASSWORD_RESET_TTL_MS = 10 * 60_000;
const PASSWORD_RESET_MAX_ATTEMPTS = 5;
const PASSWORD_RESET_SEQUENCE_TTL_MS = 30 * 60_000;
const PASSWORD_RESET_SEND_DELAYS_MS = [60_000, 3 * 60_000, 5 * 60_000, 30 * 60_000] as const;

export interface PasswordResetRequestResult {
  message: string;
  retryAfterSeconds: number;
  resendLocked: boolean;
}

interface PasswordResetSendClaim {
  shouldSend: boolean;
  retryAfterSeconds: number;
  resendLocked: boolean;
}

export interface AuthTokenResult {
  accessToken: string;
  accessTokenExpiresAt: string;
  sessionExpiresAt: string;
  user: SafeUserWithPermissions;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly auditLogService: AuditLogService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    @InjectModel(UserSession.name) private readonly sessionModel: Model<UserSession>,
    @InjectModel(AuthRateLimit.name) private readonly rateLimitModel: Model<AuthRateLimit>,
    @InjectModel(PasswordResetRequest.name) private readonly passwordResetRequestModel: Model<PasswordResetRequest>,
  ) {}

  async register(request: RequestWithContext, registerDto: RegisterDto): Promise<SafeUser> {
    if (registerDto.role === UserRole.ADMIN) throw new BadRequestException('Không thể gán vai trò ADMIN qua đăng ký công khai.');
    const email = registerDto.email.toLowerCase();
    if (await this.usersService.findByEmailForAuth(email)) throw new ConflictException('Email đã được sử dụng.');
    const passwordHash = await bcrypt.hash(registerDto.password, 12);
    try {
      const user = await this.usersService.create({ fullName: registerDto.fullName, email, passwordHash, role: registerDto.role });
      const safeUser = await this.usersService.toSafeUser(user);
      await this.auditLogService.recordForResolvedActor(request, safeUser, {
        action: 'AUTH.REGISTER', outcome: AuditOutcome.SUCCESS, resource: { type: 'USER', id: safeUser.id },
        changes: { after: { fullName: safeUser.fullName, email: safeUser.email, role: safeUser.role, isActive: safeUser.isActive } },
      });
      return safeUser;
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) throw new ConflictException('Email đã được sử dụng.');
      throw error;
    }
  }

  async requestPasswordReset(_request: RequestWithContext, input: ForgotPasswordRequestDto): Promise<PasswordResetRequestResult> {
    const now = new Date();
    const email = input.email.trim().toLowerCase();
    const user = await this.usersService.findByEmailForAuth(email);
    if (!user) {
      throw new NotFoundException({
        code: 'PASSWORD_RESET_ACCOUNT_NOT_FOUND',
        message: 'Email này chưa được đăng ký tài khoản.',
      });
    }
    if (!user.isActive) {
      throw new ForbiddenException({
        code: 'PASSWORD_RESET_ACCOUNT_INACTIVE',
        message: 'Tài khoản này đang ngưng hoạt động. Vui lòng liên hệ quản trị viên.',
      });
    }

    const sendClaim = await this.claimPasswordResetSend(email, now);
    if (!sendClaim.shouldSend) return this.passwordResetRequestResponse(sendClaim);

    const otp = this.createPasswordResetOtp();
    await this.passwordResetRequestModel.findOneAndUpdate(
      { userId: user._id },
      {
        $set: {
          emailSnapshot: email,
          otpHash: await bcrypt.hash(otp, 12),
          attemptCount: 0,
          maxAttempts: PASSWORD_RESET_MAX_ATTEMPTS,
          lastSentAt: now,
          status: 'PENDING',
          expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
        },
        $unset: {
          verifiedAt: 1,
          resetTokenHash: 1,
          resetTokenExpiresAt: 1,
          usedAt: 1,
          invalidatedAt: 1,
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ).exec();
    this.dispatchPasswordResetOtp(email, otp);
    return this.passwordResetRequestResponse(sendClaim);
  }

  async verifyPasswordResetOtp(input: ForgotPasswordVerifyDto): Promise<{ resetToken: string }> {
    const now = new Date();
    const email = input.email.trim().toLowerCase();
    const user = await this.usersService.findByEmailForAuth(email);
    if (!user || !user.isActive) throw new BadRequestException('Mã xác minh không hợp lệ hoặc đã hết hạn.');
    const resetRequest = await this.passwordResetRequestModel.findOne({
      emailSnapshot: email,
      status: 'PENDING',
      expiresAt: { $gt: now },
    }).select('+otpHash').exec();
    if (!resetRequest || !resetRequest.otpHash) throw new BadRequestException('Mã xác minh không hợp lệ hoặc đã hết hạn.');

    if (!await bcrypt.compare(input.code, resetRequest.otpHash)) {
      const nextAttemptCount = resetRequest.attemptCount + 1;
      await this.passwordResetRequestModel.updateOne(
        { _id: resetRequest._id, status: 'PENDING' },
        nextAttemptCount >= PASSWORD_RESET_MAX_ATTEMPTS
          ? { $set: { status: 'INVALIDATED', invalidatedAt: now, attemptCount: nextAttemptCount } }
          : { $inc: { attemptCount: 1 } },
      ).exec();
      if (nextAttemptCount >= PASSWORD_RESET_MAX_ATTEMPTS) {
        throw new BadRequestException('Mã xác minh đã vượt quá số lần cho phép. Vui lòng gửi mã mới.');
      }
      throw new BadRequestException('Mã xác minh không hợp lệ.');
    }

    const resetToken = this.createResetToken();
    const verified = await this.passwordResetRequestModel.findOneAndUpdate(
      { _id: resetRequest._id, status: 'PENDING', expiresAt: { $gt: now } },
      {
        $set: {
          verifiedAt: now,
          status: 'VERIFIED',
          resetTokenHash: this.hashResetToken(resetToken),
          resetTokenExpiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
        },
      },
      { returnDocument: 'after' },
    ).exec();
    if (!verified) throw new BadRequestException('Mã xác minh không hợp lệ hoặc đã hết hạn.');
    return { resetToken };
  }

  async resetPassword(request: RequestWithContext, input: ForgotPasswordResetDto): Promise<{ message: string }> {
    if (input.newPassword !== input.confirmPassword) throw new BadRequestException('Xác nhận mật khẩu mới không khớp.');
    const now = new Date();
    const resetRequest = await this.passwordResetRequestModel.findOneAndUpdate(
      {
        resetTokenHash: this.hashResetToken(input.resetToken),
        status: 'VERIFIED',
        resetTokenExpiresAt: { $gt: now },
      },
      { $set: { usedAt: now, status: 'USED' } },
      { returnDocument: 'before' },
    ).select('+resetTokenHash').exec();
    if (!resetRequest) throw new BadRequestException('Phiên đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng xác minh mã lại.');

    const user = await this.usersService.resetPasswordFromForgotPassword(resetRequest.userId.toString(), input.newPassword);
    if (!user) throw new BadRequestException('Không thể đặt lại mật khẩu cho tài khoản này.');
    const safeUser = await this.usersService.toSafeUser(user);
    await this.auditLogService.recordForResolvedActor(request, safeUser, {
      action: 'AUTH.PASSWORD_RESET_SUCCEEDED',
      outcome: AuditOutcome.SUCCESS,
      resource: { type: 'USER', id: safeUser.id, code: safeUser.email },
    });
    return { message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.' };
  }

  async changePassword(request: RequestWithContext, input: ChangePasswordDto): Promise<{ message: string }> {
    if (input.newPassword !== input.confirmPassword) throw new BadRequestException('Xác nhận mật khẩu mới không khớp.');
    const userId = request.user?.id;
    if (!userId) throw new UnauthorizedException('Phiên đăng nhập không hợp lệ.');

    const user = await this.usersService.findByIdForAuth(userId);
    if (!user || !user.isActive) throw new UnauthorizedException('Tài khoản không còn hoạt động.');
    if (!await bcrypt.compare(input.currentPassword, user.passwordHash)) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác.');
    }
    if (await bcrypt.compare(input.newPassword, user.passwordHash)) {
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại.');
    }

    const updated = await this.usersService.resetPasswordFromForgotPassword(userId, input.newPassword);
    if (!updated) throw new BadRequestException('Không thể đổi mật khẩu cho tài khoản này.');
    const safeUser = await this.usersService.toSafeUser(updated);
    await this.auditLogService.recordForResolvedActor(request, safeUser, {
      action: 'USER.PASSWORD_CHANGED',
      outcome: AuditOutcome.SUCCESS,
      resource: { type: 'USER', id: safeUser.id, code: safeUser.email },
    });
    return { message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.' };
  }

  async login(request: RequestWithContext, loginDto: LoginDto): Promise<AuthTokenResult> {
    const now = new Date();
    const ipAddress = this.getIpAddress(request);
    const email = loginDto.email.trim().toLowerCase();
    if (await this.consumeRateLimit('LOGIN_IP', ipAddress, LOGIN_IP_LIMIT, LOGIN_IP_WINDOW_MS, now)) {
      throw this.tooManyLoginAttempts();
    }
    const user = await this.usersService.findByEmailForAuth(email);
    if (!user || !user.isActive) {
      await this.recordFailedLogin(request, undefined, email, ipAddress, now);
      throw this.invalidCredentials();
    }
    if (user.loginLockedUntil && user.loginLockedUntil > now) {
      await this.recordLoginLocked(request, await this.usersService.toSafeUser(user));
      throw new UnauthorizedException('Không thể đăng nhập. Vui lòng thử lại sau ít phút.');
    }
    if (!await bcrypt.compare(loginDto.password, user.passwordHash)) {
      await this.recordFailedLogin(request, await this.usersService.toSafeUser(user), email, ipAddress, now);
      throw this.invalidCredentials();
    }

    await Promise.all([this.usersService.resetLoginFailures(user.id), this.usersService.recordLogin(user.id)]);
    const safeUser = await this.usersService.toSafeUser(user);
    const { session, refreshToken } = await this.createSession(safeUser.id, request, now);
    const userWithPermissions = await this.usersService.findSafeByIdWithPermissions(safeUser.id);
    const result = await this.issueTokens(userWithPermissions, session, refreshToken);
    await this.auditLogService.recordForResolvedActor(request, safeUser, {
      action: 'USER.LOGIN_SUCCEEDED', outcome: AuditOutcome.SUCCESS, resource: { type: 'USER', id: safeUser.id, code: safeUser.email },
    });
    return result;
  }

  async refresh(request: RequestWithContext, refreshToken?: string): Promise<AuthTokenResult> {
    if (!refreshToken) throw this.sessionError('SESSION_EXPIRED');
    const now = new Date();
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const session = await this.sessionModel.findOne({ refreshTokenHash }).exec();
    if (!session) {
      const reusedSession = await this.sessionModel.findOne({ previousRefreshTokenHash: refreshTokenHash }).exec();
      if (reusedSession) {
        await this.revokeSession(reusedSession, 'REFRESH_TOKEN_REUSE', request, 'USER.SESSION_REVOKED');
        throw this.sessionError('SESSION_REVOKED');
      }
      throw this.sessionError('SESSION_EXPIRED');
    }
    await this.assertSessionUsable(session, request, now);
    const nextRefreshToken = this.createRefreshToken();
    const rotated = await this.sessionModel.findOneAndUpdate(
      { _id: session._id, refreshTokenHash, revokedAt: null, expiresAt: { $gt: now } },
      { $set: { refreshTokenHash: this.hashRefreshToken(nextRefreshToken), previousRefreshTokenHash: refreshTokenHash, lastSeenAt: now } },
      { returnDocument: 'after' },
    ).exec();
    if (!rotated) throw this.sessionError('SESSION_REVOKED');
    const user = await this.usersService.findSafeByIdWithPermissions(session.userId.toString());
    return this.issueTokens(user, rotated, nextRefreshToken);
  }

  async logout(request: RequestWithContext): Promise<{ message: string }> {
    const sessionId = request.user?.sessionId;
    if (sessionId) {
      const session = await this.sessionModel.findOne({ _id: sessionId, userId: request.user?.id, revokedAt: null }).exec();
      if (session) await this.revokeSession(session, 'LOGOUT', request, 'USER.LOGOUT');
    }
    return { message: 'Đã đăng xuất.' };
  }

  getRefreshCookieName(): string { return this.configService.get<string>('REFRESH_COOKIE_NAME', 'workflow.refresh-token'); }
  getRefreshCookieSecure(): boolean { return this.configService.get<string>('REFRESH_COOKIE_SECURE', 'false').toLowerCase() === 'true'; }

  private async createSession(userId: string, request: RequestWithContext, now: Date): Promise<{ session: UserSessionDocument; refreshToken: string }> {
    const expiresAt = new Date(now.getTime() + this.sessionAbsoluteTtlHours() * 60 * 60 * 1000);
    const refreshToken = this.createRefreshToken();
    const session = await this.sessionModel.create({
      userId, refreshTokenHash: this.hashRefreshToken(refreshToken), userAgent: request.headers['user-agent']?.slice(0, 1000), ipAddress: this.getIpAddress(request), createdAt: now, lastSeenAt: now, expiresAt, revokedAt: null,
    });
    return { session, refreshToken };
  }

  private async issueTokens(user: SafeUserWithPermissions, session: UserSessionDocument, rotatedRefreshToken?: string): Promise<AuthTokenResult> {
    const payload: JwtPayload = { sub: user.id, sid: session._id.toString(), email: user.email };
    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = rotatedRefreshToken ?? '';
    if (!refreshToken) throw new UnauthorizedException('Không thể tạo phiên đăng nhập.');
    return {
      accessToken,
      accessTokenExpiresAt: new Date(Date.now() + this.accessTokenTtlMs()).toISOString(),
      sessionExpiresAt: session.expiresAt.toISOString(),
      user,
      refreshToken,
    };
  }

  private async assertSessionUsable(session: UserSessionDocument, request: RequestWithContext, now: Date): Promise<void> {
    if (session.revokedAt) throw this.sessionError('SESSION_REVOKED');
    if (session.expiresAt <= now) {
      await this.revokeSession(session, 'EXPIRED', request, 'USER.SESSION_EXPIRED');
      throw this.sessionError('SESSION_EXPIRED');
    }
    const user = await this.usersService.findById(session.userId.toString());
    if (!user || !user.isActive) {
      await this.revokeSession(session, 'ACCOUNT_INACTIVE', request, 'USER.SESSION_REVOKED');
      throw this.sessionError('SESSION_REVOKED');
    }
  }

  private async revokeSession(session: UserSessionDocument, reason: string, request: RequestWithContext, action: string): Promise<void> {
    const updated = await this.sessionModel.findOneAndUpdate(
      { _id: session._id, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } }, { returnDocument: 'after' },
    ).exec();
    if (!updated) return;
    const user = await this.usersService.findById(session.userId.toString());
    const actor = user ? await this.usersService.toSafeUser(user) : undefined;
    await this.auditLogService.recordForResolvedActor(request, actor, {
      action, outcome: AuditOutcome.SUCCESS, resource: { type: 'USER_SESSION', id: session._id.toString() },
    });
  }

  private async recordFailedLogin(request: RequestWithContext, actor: SafeUser | undefined, email: string, ipAddress: string, now: Date): Promise<void> {
    const pairExceeded = await this.consumeRateLimit('LOGIN_FAILURE', `${email}:${ipAddress}`, FAILED_LOGIN_LIMIT, FAILED_LOGIN_WINDOW_MS, now);
    let locked = false;
    if (actor) {
      const failedUser = await this.usersService.recordLoginFailure(actor.id, now, new Date(now.getTime() - FAILED_LOGIN_WINDOW_MS), new Date(now.getTime() + ACCOUNT_LOCK_MS));
      locked = Boolean(failedUser?.loginLockedUntil && failedUser.loginLockedUntil > now);
    }
    await this.auditLogService.recordForResolvedActor(request, actor, { action: 'USER.LOGIN_FAILED', outcome: AuditOutcome.FAILED, resource: { type: 'AUTH_SESSION', id: actor?.id ?? 'unknown' } });
    if (locked && actor) await this.recordLoginLocked(request, actor);
    if (pairExceeded) throw this.tooManyLoginAttempts();
  }

  private async recordLoginLocked(request: RequestWithContext, actor: SafeUser): Promise<void> {
    await this.auditLogService.recordForResolvedActor(request, actor, { action: 'USER.LOGIN_LOCKED', outcome: AuditOutcome.FAILED, resource: { type: 'USER', id: actor.id, code: actor.email } });
  }

  private async consumeRateLimit(action: AuthRateLimitAction, subject: string, limit: number, windowMs: number, now: Date): Promise<boolean> {
    const subjectHash = this.hashRateLimitSubject(subject);
    const active = await this.rateLimitModel.findOneAndUpdate({ action, subjectHash, expiresAt: { $gt: now } }, { $inc: { count: 1 }, $set: { updatedAt: now } }, { returnDocument: 'after' }).exec();
    if (active) return active.count > limit;
    const reset = await this.rateLimitModel.findOneAndUpdate({ action, subjectHash, expiresAt: { $lte: now } }, { $set: { count: 1, windowStartedAt: now, expiresAt: new Date(now.getTime() + windowMs), updatedAt: now }, $unset: { blockedUntil: 1 } }, { returnDocument: 'after' }).exec();
    if (reset) return false;
    try {
      await this.rateLimitModel.create({ action, subjectHash, count: 1, windowStartedAt: now, expiresAt: new Date(now.getTime() + windowMs), updatedAt: now });
      return false;
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) return this.consumeRateLimit(action, subject, limit, windowMs, now);
      throw error;
    }
  }

  private hashRateLimitSubject(subject: string): string {
    return createHash('sha256').update(subject.trim().toLowerCase()).digest('hex');
  }

  private async claimPasswordResetSend(email: string, now: Date): Promise<PasswordResetSendClaim> {
    const action: AuthRateLimitAction = 'PASSWORD_RESET_COOLDOWN';
    const subjectHash = this.hashRateLimitSubject(email);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const current = await this.rateLimitModel.findOne({ action, subjectHash }).exec();
      const isActive = Boolean(current && current.expiresAt > now);
      const blockedUntil = current?.blockedUntil ?? current?.expiresAt;

      if (current && isActive && blockedUntil && blockedUntil > now) {
        return {
          shouldSend: false,
          retryAfterSeconds: this.secondsUntil(blockedUntil, now),
          resendLocked: current.count >= PASSWORD_RESET_SEND_DELAYS_MS.length,
        };
      }

      const sendCount = isActive && current
        ? Math.min(current.count + 1, PASSWORD_RESET_SEND_DELAYS_MS.length)
        : 1;
      const delayMs = PASSWORD_RESET_SEND_DELAYS_MS[sendCount - 1];
      const nextAllowedAt = new Date(now.getTime() + delayMs);
      const expiresAt = new Date(now.getTime() + (
        sendCount === PASSWORD_RESET_SEND_DELAYS_MS.length
          ? delayMs
          : PASSWORD_RESET_SEQUENCE_TTL_MS
      ));

      if (current) {
        const result = await this.rateLimitModel.updateOne(
          { _id: current._id, count: current.count, updatedAt: current.updatedAt },
          {
            $set: {
              count: sendCount,
              windowStartedAt: isActive ? current.windowStartedAt : now,
              blockedUntil: nextAllowedAt,
              expiresAt,
              updatedAt: now,
            },
          },
        ).exec();
        if (result.modifiedCount !== 1) continue;
      } else {
        try {
          await this.rateLimitModel.create({
            action,
            subjectHash,
            count: sendCount,
            windowStartedAt: now,
            blockedUntil: nextAllowedAt,
            expiresAt,
            updatedAt: now,
          });
        } catch (error) {
          if (isMongoDuplicateKeyError(error)) continue;
          throw error;
        }
      }

      return {
        shouldSend: true,
        retryAfterSeconds: Math.ceil(delayMs / 1000),
        resendLocked: sendCount === PASSWORD_RESET_SEND_DELAYS_MS.length,
      };
    }

    const latest = await this.rateLimitModel.findOne({ action, subjectHash }).exec();
    const retryAt = latest?.blockedUntil ?? new Date(now.getTime() + PASSWORD_RESET_SEND_DELAYS_MS[0]);
    return {
      shouldSend: false,
      retryAfterSeconds: this.secondsUntil(retryAt, now),
      resendLocked: Boolean(latest && latest.count >= PASSWORD_RESET_SEND_DELAYS_MS.length),
    };
  }

  private secondsUntil(target: Date, now: Date): number {
    return Math.max(1, Math.ceil((target.getTime() - now.getTime()) / 1000));
  }

  private passwordResetRequestResponse(claim: PasswordResetSendClaim): PasswordResetRequestResult {
    return {
      message: 'Nếu email tồn tại, mã xác minh đã được gửi.',
      retryAfterSeconds: claim.retryAfterSeconds,
      resendLocked: claim.resendLocked,
    };
  }

  private createPasswordResetOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private dispatchPasswordResetOtp(email: string, otp: string): void {
    // SMTP delivery is external I/O. The reset request is already persisted, so
    // the API can respond without making the user wait for the mail server.
    void this.mailService.sendPasswordResetOtp(email, otp).catch(() => undefined);
  }

  private createResetToken(): string { return randomBytes(48).toString('base64url'); }
  private hashResetToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
  private createRefreshToken(): string { return randomBytes(64).toString('base64url'); }
  private hashRefreshToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
  private accessTokenTtlMs(): number {
    const match = /^(\d+)(ms|s|m|h)$/.exec(this.configService.get<string>('JWT_ACCESS_TTL', '15m').trim());
    if (!match) return 15 * 60 * 1000;
    const amount = Number(match[1]);
    const multiplier = match[2] === 'h' ? 60 * 60 * 1000 : match[2] === 'm' ? 60 * 1000 : match[2] === 's' ? 1000 : 1;
    return amount * multiplier;
  }
  private sessionAbsoluteTtlHours(): number {
    const value = Number(this.configService.get<string>('SESSION_ABSOLUTE_TTL_HOURS', '24'));
    return Number.isFinite(value) && value > 0 ? value : 24;
  }
  private getIpAddress(request: RequestWithContext): string {
    const forwarded = request.headers['x-forwarded-for'];
    const source = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return source?.split(',')[0].trim() || request.ip || request.socket.remoteAddress || 'unknown';
  }
  private invalidCredentials(): UnauthorizedException { return new UnauthorizedException('Email hoặc mật khẩu không chính xác'); }
  private tooManyLoginAttempts(): HttpException { return new HttpException('Không thể đăng nhập. Vui lòng thử lại sau ít phút.', HttpStatus.TOO_MANY_REQUESTS); }
  private sessionError(code: 'SESSION_EXPIRED' | 'SESSION_REVOKED'): UnauthorizedException { return new UnauthorizedException({ message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', code }); }
}
