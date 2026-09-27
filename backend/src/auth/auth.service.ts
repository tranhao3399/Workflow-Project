import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { Model } from 'mongoose';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { AuditOutcome } from '../audit-logs/enums/audit-outcome.enum.js';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import { UsersService } from '../users/users.service.js';
import type { SafeUser, SafeUserWithPermissions } from '../users/users.service.js';
import { UserRole } from '../users/enums/user-role.enum.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { JwtPayload } from './interfaces/jwt-payload.interface.js';
import { AuthRateLimit } from './schemas/auth-rate-limit.schema.js';
import { UserSession, UserSessionDocument } from './schemas/user-session.schema.js';

const LOGIN_IP_LIMIT = 30;
const LOGIN_IP_WINDOW_MS = 60_000;
const FAILED_LOGIN_LIMIT = 5;
const FAILED_LOGIN_WINDOW_MS = 15 * 60_000;
const ACCOUNT_LOCK_MS = 10 * 60_000;

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
    private readonly configService: ConfigService,
    @InjectModel(UserSession.name) private readonly sessionModel: Model<UserSession>,
    @InjectModel(AuthRateLimit.name) private readonly rateLimitModel: Model<AuthRateLimit>,
  ) {}

  async register(request: RequestWithContext, registerDto: RegisterDto): Promise<SafeUser> {
    if (registerDto.role === UserRole.ADMIN) throw new BadRequestException('Public registration cannot assign the ADMIN role');
    const email = registerDto.email.toLowerCase();
    if (await this.usersService.findByEmailForAuth(email)) throw new ConflictException('Email is already registered');
    const passwordHash = await bcrypt.hash(registerDto.password, 12);
    try {
      const user = await this.usersService.create({ fullName: registerDto.fullName, email, passwordHash, role: registerDto.role, roles: [registerDto.role], department: registerDto.department });
      const safeUser = this.usersService.toSafeUser(user);
      await this.auditLogService.recordForResolvedActor(request, safeUser, {
        action: 'AUTH.REGISTER', outcome: AuditOutcome.SUCCESS, resource: { type: 'USER', id: safeUser.id },
        changes: { after: { fullName: safeUser.fullName, email: safeUser.email, role: safeUser.role, department: safeUser.department, isActive: safeUser.isActive } },
      });
      return safeUser;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) throw new ConflictException('Email is already registered');
      throw error;
    }
  }

  async login(request: RequestWithContext, loginDto: LoginDto): Promise<AuthTokenResult> {
    const now = new Date();
    const ipAddress = this.getIpAddress(request);
    const email = loginDto.email.trim().toLowerCase();
    if (await this.consumeRateLimit(`login-ip:${ipAddress}`, LOGIN_IP_LIMIT, LOGIN_IP_WINDOW_MS, now)) {
      throw this.tooManyLoginAttempts();
    }
    const user = await this.usersService.findByEmailForAuth(email);
    if (!user || !user.isActive) {
      await this.recordFailedLogin(request, undefined, email, ipAddress, now);
      throw this.invalidCredentials();
    }
    if (user.loginLockedUntil && user.loginLockedUntil > now) {
      await this.recordLoginLocked(request, this.usersService.toSafeUser(user));
      throw new UnauthorizedException('Không thể đăng nhập. Vui lòng thử lại sau ít phút.');
    }
    if (!await bcrypt.compare(loginDto.password, user.passwordHash)) {
      await this.recordFailedLogin(request, this.usersService.toSafeUser(user), email, ipAddress, now);
      throw this.invalidCredentials();
    }

    await Promise.all([this.usersService.resetLoginFailures(user.id), this.usersService.recordLogin(user.id)]);
    const safeUser = this.usersService.toSafeUser(user);
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
    const payload: JwtPayload = { sub: user.id, sid: session._id.toString(), email: user.email, role: user.role };
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
    await this.auditLogService.recordForResolvedActor(request, user ? this.usersService.toSafeUser(user) : undefined, {
      action, outcome: AuditOutcome.SUCCESS, resource: { type: 'USER_SESSION', id: session._id.toString() },
    });
  }

  private async recordFailedLogin(request: RequestWithContext, actor: SafeUser | undefined, email: string, ipAddress: string, now: Date): Promise<void> {
    const pairExceeded = await this.consumeRateLimit(`login-failure:${email}:${ipAddress}`, FAILED_LOGIN_LIMIT, FAILED_LOGIN_WINDOW_MS, now);
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

  private async consumeRateLimit(key: string, limit: number, windowMs: number, now: Date): Promise<boolean> {
    const active = await this.rateLimitModel.findOneAndUpdate({ key, expiresAt: { $gt: now } }, { $inc: { count: 1 }, $set: { updatedAt: now } }, { returnDocument: 'after' }).exec();
    if (active) return active.count > limit;
    const reset = await this.rateLimitModel.findOneAndUpdate({ key, expiresAt: { $lte: now } }, { $set: { count: 1, expiresAt: new Date(now.getTime() + windowMs), updatedAt: now } }, { returnDocument: 'after' }).exec();
    if (reset) return false;
    try {
      await this.rateLimitModel.create({ key, count: 1, expiresAt: new Date(now.getTime() + windowMs), updatedAt: now });
      return false;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) return this.consumeRateLimit(key, limit, windowMs, now);
      throw error;
    }
  }

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
  private isDuplicateKeyError(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000; }
}
