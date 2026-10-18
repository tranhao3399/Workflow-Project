import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: Transporter;

  constructor(private readonly configService: ConfigService) {}

  async sendPasswordResetOtp(email: string, otp: string): Promise<boolean> {
    const transporter = this.getTransporter();
    const from = this.configService.get<string>('MAIL_FROM');
    if (!transporter || !from) {
      this.logger.warn('Password reset email was not sent because SMTP is not configured.');
      return false;
    }

    try {
      await transporter.sendMail({
        from,
        to: email,
        subject: 'Mã đặt lại mật khẩu - Workflow ERP',
        text: `Mã xác minh đặt lại mật khẩu của bạn là: ${otp}. Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.`,
        html: `<p>Mã xác minh đặt lại mật khẩu của bạn là:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${otp}</p><p>Mã có hiệu lực trong <strong>10 phút</strong>.</p><p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>`,
      });
      return true;
    } catch {
      this.logger.error('Password reset email could not be sent.');
      return false;
    }
  }

  private getTransporter(): Transporter | undefined {
    if (this.transporter) return this.transporter;
    const host = this.configService.get<string>('MAIL_HOST')?.trim();
    const user = this.configService.get<string>('MAIL_USER')?.trim();
    const password = this.configService.get<string>('MAIL_PASSWORD');
    if (!host || !user || !password) return undefined;

    const configuredPort = Number(this.configService.get<string>('MAIL_PORT', '587'));
    const port = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 587;
    const secure = this.configService.get<string>('MAIL_SECURE', 'false').toLowerCase() === 'true';
    this.transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass: password } });
    return this.transporter;
  }
}
