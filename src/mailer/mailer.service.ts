import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailerService {
  private transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: +process.env.SMTP_PORT || 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  async sendResetEmail(to: string, token: string) {
    const resetUrl = `https://yourdomain.com/reset-password?token=${token}`;
    const html = `<p>Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 1 hour.</p>`;
    await this.transporter.sendMail({
      to,
      subject: 'Reset Your Password',
      html,
    });
  }
}
