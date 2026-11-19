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

  it('given a request notification payload, when sending mail, then format escaped HTML and include the request link', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as unknown as Transporter);
    const service = new MailService(createConfig({
      MAIL_HOST: 'smtp.example.com',
      MAIL_PORT: '587',
      MAIL_SECURE: 'false',
      MAIL_USER: 'sender@example.com',
      MAIL_PASSWORD: 'secret',
      MAIL_FROM: 'Workflow ERP <noreply@example.com>',
    }));

    await expect(service.sendRequestNotification({
      toEmail: 'approver@example.com',
      recipientName: 'Nguyễn <Admin>',
      type: 'APPROVAL',
      title: 'Bạn có phiếu cần phê duyệt',
      message: 'Phiếu REQ-2026-001 đang chờ bạn xử lý.',
      requestNo: 'REQ-2026-001',
      requestTitle: 'Đơn xin nghỉ phép',
      formName: 'Nghỉ phép năm',
      requesterName: 'Trần Văn A',
      requesterDepartment: 'Phòng Kỹ thuật',
      stepName: 'Quản lý trực tiếp duyệt',
      statusLabel: 'Đang xử lý',
      actionUrl: 'http://localhost:5173/requests/123?from=approval-inbox',
    })).resolves.toBe(true);

    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'Workflow ERP <noreply@example.com>',
      to: 'approver@example.com',
      subject: '[Workflow ERP] [REQ-2026-001] Bạn có phiếu cần phê duyệt',
      html: expect.stringContaining('Nguyễn &lt;Admin&gt;'),
      text: expect.stringContaining('http://localhost:5173/requests/123?from=approval-inbox'),
    }));
    const sent = sendMail.mock.calls[0]?.[0] as { html: string };
    expect(sent.html).toContain('http://localhost:5173/requests/123?from=approval-inbox');
    expect(sent.html).toContain('Quản lý trực tiếp duyệt');
  });

  it('given missing SMTP configuration, when sending request notification, then return false without throwing', async () => {
    const service = new MailService(createConfig({}));

    await expect(service.sendRequestNotification({
      toEmail: 'approver@example.com',
      type: 'DECISION',
      title: 'Phiếu đã được phê duyệt',
      message: 'Phiếu REQ-2026-001 đã được phê duyệt.',
    })).resolves.toBe(false);
  });
});
