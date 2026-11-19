import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { NotificationType } from '../notifications/schemas/notification.schema.js';

export interface RequestNotificationEmailPayload {
  toEmail: string;
  recipientName?: string;
  type: NotificationType;
  title: string;
  message: string;
  requestNo?: string;
  requestTitle?: string;
  formName?: string;
  requesterName?: string;
  requesterDepartment?: string;
  stepName?: string;
  statusLabel?: string;
  actionUrl?: string;
}

const notificationBadgeStyles: Record<
  NotificationType,
  { label: string; color: string; background: string; border: string }
> = {
  APPROVAL: { label: 'Cần phê duyệt', color: '#1d4ed8', background: '#eff6ff', border: '#bfdbfe' },
  REVISION: { label: 'Yêu cầu bổ sung', color: '#b45309', background: '#fffbeb', border: '#fde68a' },
  DECISION: { label: 'Kết quả xử lý', color: '#15803d', background: '#f0fdf4', border: '#bbf7d0' },
  SLA: { label: 'Nhắc quá hạn SLA', color: '#b91c1c', background: '#fef2f2', border: '#fecaca' },
  SYSTEM: { label: 'Thông báo phiếu', color: '#334155', background: '#f8fafc', border: '#cbd5e1' },
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: Transporter;

  constructor(private readonly configService: ConfigService) {}

  async sendPasswordResetOtp(email: string, otp: string): Promise<boolean> {
    return this.dispatchMail(
      {
        to: email,
        subject: 'Mã đặt lại mật khẩu - Workflow ERP',
        text: `Mã xác minh đặt lại mật khẩu của bạn là: ${otp}. Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.`,
        html: `<p>Mã xác minh đặt lại mật khẩu của bạn là:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${otp}</p><p>Mã có hiệu lực trong <strong>10 phút</strong>.</p><p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>`,
      },
      'đặt lại mật khẩu',
    );
  }

  async sendRequestNotification(payload: RequestNotificationEmailPayload): Promise<boolean> {
    const subjectPrefix = payload.requestNo ? `[Workflow ERP] [${payload.requestNo}]` : '[Workflow ERP]';
    const subject = `${subjectPrefix} ${payload.title}`;
    const safeUrl = sanitizeActionUrl(payload.actionUrl);
    const badge = notificationBadgeStyles[payload.type] ?? notificationBadgeStyles.SYSTEM;
    const greeting = payload.recipientName
      ? `Xin chào ${payload.recipientName},`
      : 'Xin chào,';

    const detailRows = [
      ['Mã phiếu', payload.requestNo],
      ['Biểu mẫu', payload.formName],
      ['Tiêu đề phiếu', payload.requestTitle],
      [
        'Người gửi',
        payload.requesterName
          ? payload.requesterDepartment
            ? `${payload.requesterName} (${payload.requesterDepartment})`
            : payload.requesterName
          : undefined,
      ],
      ['Bước xử lý', payload.stepName],
      ['Trạng thái', payload.statusLabel],
    ].filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()));

    const textLines = [
      greeting,
      '',
      payload.title,
      payload.message,
      ...(detailRows.length > 0 ? ['', ...detailRows.map(([label, value]) => `- ${label}: ${value}`)] : []),
      ...(safeUrl ? ['', `Xem chi tiết phiếu: ${safeUrl}`] : []),
      '',
      'Email được gửi tự động từ hệ thống Workflow ERP.',
    ];

    const detailRowsHtml = detailRows
      .map(
        ([label, value]) =>
          `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;width:140px;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;font-weight:600;">${escapeHtml(value)}</td></tr>`,
      )
      .join('');

    const html = `
<div style="margin:0;padding:24px 16px;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
    <tr>
      <td style="padding:18px 24px;background-color:#0f172a;color:#ffffff;">
        <div style="font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#94a3b8;font-weight:700;">Workflow ERP</div>
        <div style="margin-top:4px;font-size:17px;font-weight:700;line-height:1.35;">${escapeHtml(payload.title)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:22px 24px;">
        <span style="display:inline-block;padding:4px 10px;border-radius:999px;border:1px solid ${badge.border};background-color:${badge.background};color:${badge.color};font-size:12px;font-weight:700;">${escapeHtml(badge.label)}</span>
        <p style="margin:14px 0 8px;font-size:14px;color:#334155;">${escapeHtml(greeting)}</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#0f172a;">${escapeHtml(payload.message)}</p>
        ${detailRowsHtml ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;background-color:#f8fafc;margin-bottom:20px;">${detailRowsHtml}</table>` : ''}
        ${safeUrl ? `<p style="margin:0 0 8px;"><a href="${escapeHtml(safeUrl)}" style="display:inline-block;padding:10px 18px;border-radius:6px;background-color:#1d4ed8;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">Xem chi tiết phiếu</a></p>` : ''}
      </td>
    </tr>
    <tr>
      <td style="padding:14px 24px;border-top:1px solid #e2e8f0;background-color:#f8fafc;color:#64748b;font-size:12px;">
        Đây là email thông báo tự động từ hệ thống Workflow ERP. Vui lòng không trả lời trực tiếp email này.
      </td>
    </tr>
  </table>
</div>`.trim();

    return this.dispatchMail(
      {
        to: payload.toEmail,
        subject,
        text: textLines.join('\n'),
        html,
      },
      `thông báo phiếu ${payload.requestNo ?? ''}`.trim(),
    );
  }

  private async dispatchMail(
    message: { to: string; subject: string; text: string; html: string },
    contextLabel: string,
  ): Promise<boolean> {
    const transporter = this.getTransporter();
    const from = this.configService.get<string>('MAIL_FROM');
    if (!transporter || !from) {
      this.logger.warn(`Email ${contextLabel} was not sent because SMTP is not configured.`);
      return false;
    }

    try {
      await transporter.sendMail({ from, ...message });
      return true;
    } catch (error) {
      const smtpError = error as { code?: string; responseCode?: number };
      if (smtpError.code === 'EAUTH' || smtpError.responseCode === 535) {
        this.logger.error(`Không thể gửi email ${contextLabel}: Gmail từ chối thông tin xác thực SMTP. Hãy tạo App Password mới và cập nhật MAIL_PASSWORD.`);
      } else {
        this.logger.error(`Không thể gửi email ${contextLabel} do kết nối SMTP thất bại.`);
      }
      return false;
    }
  }

  private getTransporter(): Transporter | undefined {
    if (this.transporter) return this.transporter;
    const host = this.configService.get<string>('MAIL_HOST')?.trim();
    const user = this.configService.get<string>('MAIL_USER')?.trim();
    const configuredPassword = this.configService.get<string>('MAIL_PASSWORD')?.trim();
    const password = host?.toLowerCase() === 'smtp.gmail.com'
      ? configuredPassword?.replace(/\s+/g, '')
      : configuredPassword;
    if (!host || !user || !password) return undefined;

    const configuredPort = Number(this.configService.get<string>('MAIL_PORT', '587'));
    const port = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 587;
    const secure = this.configService.get<string>('MAIL_SECURE', 'false').toLowerCase() === 'true';
    this.transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass: password } });
    return this.transporter;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sanitizeActionUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}
