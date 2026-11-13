import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MailService } from './mail.service.js';

function createConfig(values: Record<string, string>): ConfigService {
  return {
    get: vi.fn((key: string, fallback?: string) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

describe('MailService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('given a formatted Gmail app password, when sending a reset OTP, then remove display spaces before SMTP authentication', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const createTransport = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as unknown as Transporter);
    const service = new MailService(createConfig({
      MAIL_HOST: 'smtp.gmail.com',
      MAIL_PORT: '587',
      MAIL_SECURE: 'false',
      MAIL_USER: 'sender@example.com',
      MAIL_PASSWORD: 'abcd efgh ijkl mnop',
      MAIL_FROM: 'sender@example.com',
    }));

    await expect(service.sendPasswordResetOtp('employee@example.com', '123456')).resolves.toBe(true);
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      auth: { user: 'sender@example.com', pass: 'abcdefghijklmnop' },
    }));
  });

  it('given a non-Gmail SMTP password with spaces, when creating the transporter, then preserve its internal spaces', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const createTransport = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as unknown as Transporter);
    const service = new MailService(createConfig({
      MAIL_HOST: 'smtp.example.com',
      MAIL_PORT: '587',
      MAIL_SECURE: 'false',
      MAIL_USER: 'sender@example.com',
      MAIL_PASSWORD: 'valid password value',
      MAIL_FROM: 'sender@example.com',
    }));

    await expect(service.sendPasswordResetOtp('employee@example.com', '123456')).resolves.toBe(true);
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
      auth: { user: 'sender@example.com', pass: 'valid password value' },
    }));
  });
});
