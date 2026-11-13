import * as bcrypt from 'bcrypt';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';

const now = new Date('2026-09-24T07:30:00.000Z');
const user = {
  id: '64b64b64b64b64b64b64b640',
  _id: { toString: () => '64b64b64b64b64b64b64b640' },
  fullName: 'Test User',
  email: 'test@example.com',
  roleIds: [{ toString: () => '64b64b64b64b64b64b64b642' }],
  department: 'Engineering',
  isActive: true,
  passwordHash: '',
  createdAt: now,
  updatedAt: now,
};
const safeUser = { id: user.id, fullName: user.fullName, email: user.email, role: 'EMPLOYEE' as const, roles: ['EMPLOYEE' as const], department: user.department, isActive: true, createdAt: now, updatedAt: now };
const request = { headers: { 'user-agent': 'vitest' }, ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } };

function queryResult<T>(value: T) { return { exec: vi.fn().mockResolvedValue(value) }; }

function createService(overrides: {
  sessionFindOne?: ReturnType<typeof vi.fn>;
  sessionFindOneAndUpdate?: ReturnType<typeof vi.fn>;
  sessionCreate?: ReturnType<typeof vi.fn>;
  userFindByEmail?: ReturnType<typeof vi.fn>;
  passwordResetFindOneAndUpdate?: ReturnType<typeof vi.fn>;
} = {}) {
  const users = {
    findByEmailForAuth: overrides.userFindByEmail ?? vi.fn().mockResolvedValue(user),
    resetLoginFailures: vi.fn().mockResolvedValue(undefined),
    recordLogin: vi.fn().mockResolvedValue(undefined),
    toSafeUser: vi.fn().mockResolvedValue(safeUser),
    findSafeByIdWithPermissions: vi.fn().mockResolvedValue({ ...safeUser, permissionKeys: ['REQUESTS.VIEW_OWN'] }),
    findById: vi.fn().mockResolvedValue(user),
    recordLoginFailure: vi.fn(),
  };
  const session = {
    findOne: overrides.sessionFindOne ?? vi.fn(),
    findOneAndUpdate: overrides.sessionFindOneAndUpdate ?? vi.fn(),
    create: overrides.sessionCreate ?? vi.fn(),
  };
  const rateLimit = {
    findOne: vi.fn().mockReturnValue(queryResult(null)),
    findOneAndUpdate: vi.fn().mockReturnValue(queryResult(null)),
    updateOne: vi.fn().mockReturnValue(queryResult({ modifiedCount: 1 })),
    create: vi.fn().mockResolvedValue(undefined),
  };
  const jwt = { signAsync: vi.fn().mockResolvedValue('access-token') };
  const audit = { recordForResolvedActor: vi.fn().mockResolvedValue(undefined) };
  const mail = { sendPasswordResetOtp: vi.fn().mockResolvedValue(true) };
  const config = { get: vi.fn((key: string, fallback?: string) => key === 'SESSION_ABSOLUTE_TTL_HOURS' ? '24' : fallback) };
  const passwordResetRequest = {
    findOneAndUpdate: overrides.passwordResetFindOneAndUpdate
      ?? vi.fn().mockReturnValue(queryResult({ id: 'password-reset-request' })),
  };
  return { service: new AuthService(users as never, jwt as never, audit as never, mail as never, config as never, session as never, rateLimit as never, passwordResetRequest as never), users, session, rateLimit, mail, jwt };
}

describe('AuthService password reset eligibility', () => {
  it('given an active account, when password reset is requested, then OTP verification is allowed and an email is dispatched', async () => {
    const { service, mail } = createService();

    await expect(service.requestPasswordReset(request as never, { email: user.email }))
      .resolves.toMatchObject({
        message: 'Mã xác minh đã được gửi.',
        canVerifyOtp: true,
        resendLocked: false,
      });
    expect(mail.sendPasswordResetOtp).toHaveBeenCalledOnce();
  });

  it('given an unregistered email, when password reset is requested, then OTP verification is blocked without dispatching an email', async () => {
    const { service, rateLimit, mail } = createService({ userFindByEmail: vi.fn().mockResolvedValue(null) });

    await expect(service.requestPasswordReset(request as never, { email: 'missing@example.com' }))
      .resolves.toMatchObject({
        message: 'Không thể gửi mã xác minh. Email chưa được đăng ký hoặc tài khoản đã ngưng hoạt động.',
        canVerifyOtp: false,
        resendLocked: false,
      });
    expect(rateLimit.create).toHaveBeenCalledOnce();
    expect(mail.sendPasswordResetOtp).not.toHaveBeenCalled();
  });

  it('given an inactive account, when password reset is requested, then OTP verification is blocked without dispatching an email', async () => {
    const { service, rateLimit, mail } = createService({
      userFindByEmail: vi.fn().mockResolvedValue({ ...user, isActive: false }),
    });

    await expect(service.requestPasswordReset(request as never, { email: user.email }))
      .resolves.toMatchObject({
        message: 'Không thể gửi mã xác minh. Email chưa được đăng ký hoặc tài khoản đã ngưng hoạt động.',
        canVerifyOtp: false,
        resendLocked: false,
      });
    expect(rateLimit.create).toHaveBeenCalledOnce();
    expect(mail.sendPasswordResetOtp).not.toHaveBeenCalled();
  });
});

describe('AuthService session lifecycle', () => {
  it('returns unauthorized and records the failure when an existing user enters a wrong password', async () => {
    user.passwordHash = await bcrypt.hash('correct-password', 4);
    const { service, users } = createService();

    await expect(service.login(request as never, { email: user.email, password: 'wrong-password' }))
      .rejects.toMatchObject({
        status: 401,
        response: { message: 'Email hoặc mật khẩu không chính xác', statusCode: 401 },
      });
    expect(users.recordLoginFailure).toHaveBeenCalledOnce();
  });

  it('creates a session that expires exactly 24 hours after a successful login', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    user.passwordHash = await bcrypt.hash('password123', 4);
    const session = { _id: { toString: () => '64b64b64b64b64b64b64b641' }, userId: user._id, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) };
    const { service, session: sessionModel, jwt } = createService({ sessionCreate: vi.fn().mockResolvedValue(session) });

    const result = await service.login(request as never, { email: user.email, password: 'password123' });

    expect(sessionModel.create).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: new Date('2026-09-25T07:30:00.000Z') }));
    expect(result.sessionExpiresAt).toBe('2026-09-25T07:30:00.000Z');
    expect(result.refreshToken).not.toHaveLength(0);
    expect(jwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({ sub: user.id, sid: '64b64b64b64b64b64b64b641' }));
    expect(jwt.signAsync).not.toHaveBeenCalledWith(expect.objectContaining({ role: expect.anything() }));
    vi.useRealTimers();
  });

  it('rotates the refresh token without extending the absolute session expiry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const session = { _id: { toString: () => '64b64b64b64b64b64b64b641' }, userId: user._id, refreshTokenHash: 'current-hash', expiresAt: new Date('2026-09-25T07:30:00.000Z'), revokedAt: null };
    const rotated = { ...session, refreshTokenHash: 'next-hash', previousRefreshTokenHash: 'current-hash', lastSeenAt: now };
    const findOne = vi.fn().mockReturnValue(queryResult(session));
    const findOneAndUpdate = vi.fn().mockReturnValue(queryResult(rotated));
    const { service } = createService({ sessionFindOne: findOne, sessionFindOneAndUpdate: findOneAndUpdate });

    const result = await service.refresh(request as never, 'refresh-token');

    expect(result.sessionExpiresAt).toBe('2026-09-25T07:30:00.000Z');
    expect(findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: { $gt: now } }), expect.any(Object), expect.any(Object));
    vi.useRealTimers();
  });

  it('revokes the session when an immediately previous refresh token is reused', async () => {
    const session = { _id: { toString: () => '64b64b64b64b64b64b64b641' }, userId: user._id, expiresAt: new Date('2026-09-25T07:30:00.000Z'), revokedAt: null };
    const findOne = vi.fn().mockReturnValueOnce(queryResult(null)).mockReturnValueOnce(queryResult(session));
    const findOneAndUpdate = vi.fn().mockReturnValue(queryResult({ ...session, revokedAt: now }));
    const { service } = createService({ sessionFindOne: findOne, sessionFindOneAndUpdate: findOneAndUpdate });

    await expect(service.refresh(request as never, 'reused-token')).rejects.toMatchObject({ status: 401 });
    expect(findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({ revokedAt: null }), expect.objectContaining({ $set: expect.objectContaining({ revokedReason: 'REFRESH_TOKEN_REUSE' }) }), expect.any(Object));
  });
});
