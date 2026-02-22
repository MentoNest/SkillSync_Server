import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ConfigService } from '../../config/config.service';

/**
 * User interface for email recipients
 */
export interface MailUser {
  email: string;
  firstName?: string;
  username?: string;
}

/**
 * Metadata for login emails
 */
export interface LoginMetadata {
  ip?: string;
  device?: string;
  time?: Date;
}

/**
 * OTP record stored in cache/DB
 */
export interface OtpRecord {
  otp: string;
  expiresAt: Date;
  email: string;
  purpose: string;
  createdAt: Date;
}

/**
 * Result returned from sendOtpEmail
 */
export interface OtpResult {
  otp: string;
  expiresAt: Date;
}

/**
 * Simple in-memory OTP store (replace with Redis/DB in production)
 */
class OtpStore {
  private store: Map<string, OtpRecord> = new Map();

  set(email: string, record: OtpRecord): void {
    // Invalidate any existing OTP for this email (single active OTP per email)
    this.store.set(email.toLowerCase(), record);
  }

  get(email: string): OtpRecord | undefined {
    return this.store.get(email.toLowerCase());
  }

  delete(email: string): void {
    this.store.delete(email.toLowerCase());
  }

  isValid(email: string, otp: string): boolean {
    const record = this.get(email);
    if (!record) return false;
    if (record.otp !== otp) return false;
    if (new Date() > record.expiresAt) {
      this.delete(email);
      return false;
    }
    return true;
  }
}

/**
 * Simple template engine that replaces <%= variable %> with values
 */
function renderTemplate(template: string, variables: Record<string, any>): string {
  return template.replace(/<%=\s*(\w+)\s*%>/g, (match, key) => {
    const value = variables[key];
    return value !== undefined ? String(value) : match;
  });
}

/**
 * Process EJS conditionals (simple implementation)
 */
function processConditionals(template: string, variables: Record<string, any>): string {
  // Process <% if (condition) { %> ... <% } %>
  return template.replace(/<%\s*if\s*\((\w+)\)\s*\{\s*%>([\s\S]*?)<%\s*}\s*%>/g, (match, key, content) => {
    return variables[key] ? content : '';
  });
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly templatesDir: string;
  private readonly otpStore: OtpStore;

  // OTP configuration (defaults — override via ConfigService)
  private readonly OTP_TTL_MINUTES: number;
  private readonly OTP_SUBJECT: string;

  constructor(private readonly configService: ConfigService) {
    this.templatesDir = path.join(__dirname, 'templates');
    this.otpStore = new OtpStore();

    // Read from config or fall back to defaults
    this.OTP_TTL_MINUTES =
      (this.configService as any).otpTtlMinutes ?? 10;
    this.OTP_SUBJECT =
      (this.configService as any).otpSubject ?? 'Your One-Time Password (OTP)';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC METHODS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * 📧 Send welcome email to new user
   */
  async sendWelcomeEmail(user: MailUser): Promise<void> {
    try {
      const { email, firstName, username } = user;

      if (!email || !this.isValidEmail(email)) {
        throw new Error('Invalid email address provided');
      }

      const template = await this.loadTemplate('welcome.ejs');

      const templateVars = {
        name: firstName || username || 'there',
        email: this.maskEmail(email),
        appName: this.configService.mailAppName,
        appUrl: process.env.APP_URL || 'https://skillsync.com',
        year: new Date().getFullYear(),
      };

      let html = processConditionals(template, templateVars);
      html = renderTemplate(html, templateVars);

      const subject = `${this.configService.mailSubjectPrefix} Welcome to ${this.configService.mailAppName}!`;
      const from = this.configService.mailSender;

      this.logger.log(`Sending welcome email to user`);

      await this.dispatchEmail({ to: email, from, subject, html });

      this.logger.log(`Welcome email sent successfully`);
    } catch (error) {
      this.logger.error(`Failed to send welcome email: ${error.message}`);
    }
  }

  /**
   * 📧 Send login notification email
   */
  async sendLoginEmail(user: MailUser, metadata?: LoginMetadata): Promise<void> {
    try {
      const { email, firstName, username } = user;
      const { ip, device, time } = metadata || {};

      if (!email || !this.isValidEmail(email)) {
        throw new Error('Invalid email address provided');
      }

      const template = await this.loadTemplate('login.ejs');

      const templateVars = {
        name: firstName || username || 'there',
        email: this.maskEmail(email),
        appName: this.configService.mailAppName,
        resetUrl: process.env.RESET_PASSWORD_URL || 'https://skillsync.com/reset-password',
        time: time ? this.formatDate(time) : this.formatDate(new Date()),
        ip: ip || null,
        device: device || null,
        year: new Date().getFullYear(),
      };

      let html = processConditionals(template, templateVars);
      html = renderTemplate(html, templateVars);

      const subject = `${this.configService.mailSubjectPrefix} New Login Detected`;
      const from = this.configService.mailSender;

      this.logger.log(`Sending login notification email to user`);

      await this.dispatchEmail({ to: email, from, subject, html });

      this.logger.log(`Login notification email sent successfully`);
    } catch (error) {
      this.logger.error(`Failed to send login email: ${error.message}`);
    }
  }

  /**
   * 🔐 Generate a 6-digit OTP, persist it with a 10-minute expiry, and send it
   * to the provided email address.
   *
   * @param email   Recipient email address
   * @param purpose Optional purpose tag (default: 'password_reset')
   * @returns       The generated OTP and its expiry timestamp
   */
  async sendOtpEmail(
    email: string,
    purpose: string = 'password_reset',
  ): Promise<OtpResult> {
    if (!email || !this.isValidEmail(email)) {
      throw new Error('Invalid email address provided');
    }

    // 1. Generate cryptographically secure 6-digit OTP (000000 – 999999)
    const otp = this.generateSecureOtp();

    // 2. Calculate expiry (now + OTP_TTL_MINUTES)
    const expiresAt = new Date(Date.now() + this.OTP_TTL_MINUTES * 60 * 1000);

    // 3. Persist — automatically invalidates any previous OTP for this email
    const record: OtpRecord = {
      otp,
      expiresAt,
      email: email.toLowerCase(),
      purpose,
      createdAt: new Date(),
    };
    this.otpStore.set(email, record);
    this.logger.log(`OTP stored for email (masked: ${this.maskEmail(email)}), purpose: ${purpose}`);

    // 4. Render template & send email
    try {
      const template = await this.loadTemplate('otp.ejs');

      const templateVars = {
        otp,
        appName: this.configService.mailAppName,
        expiryMinutes: this.OTP_TTL_MINUTES,
        expiresAt: this.formatDate(expiresAt),
        year: new Date().getFullYear(),
        purpose,
      };

      let html = processConditionals(template, templateVars);
      html = renderTemplate(html, templateVars);

      const subject = `${this.configService.mailSubjectPrefix} ${this.OTP_SUBJECT}`;
      const from = this.configService.mailSender;

      this.logger.log(`Sending OTP email to user`);

      await this.dispatchEmail({ to: email, from, subject, html });

      this.logger.log(`OTP email sent successfully`);
    } catch (error) {
      this.logger.error(`Failed to send OTP email: ${error.message}`);
      // OTP is still persisted — caller can retry sending without regenerating
    }

    return { otp, expiresAt };
  }

  /**
   * ✅ Verify an OTP for the given email address.
   * Invalidates the OTP on successful verification (single-use).
   *
   * @param email Recipient email address
   * @param otp   OTP to verify
   * @returns     true if valid, false otherwise
   */
  verifyOtp(email: string, otp: string): boolean {
    const valid = this.otpStore.isValid(email, otp);
    if (valid) {
      // Consume / invalidate after successful verification
      this.otpStore.delete(email);
      this.logger.log(`OTP verified and invalidated for: ${this.maskEmail(email)}`);
    }
    return valid;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * 🔢 Generate a cryptographically secure, zero-padded 6-digit OTP
   */
  private generateSecureOtp(): string {
    // randomInt is available from Node 14.10+; falls back to randomBytes if not
    if (crypto.randomInt) {
      return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    }
    // Fallback: use 3 random bytes (gives 0–16 777 215), take modulo 1 000 000
    const buf = crypto.randomBytes(3);
    const num = buf.readUIntBE(0, 3) % 1_000_000;
    return num.toString().padStart(6, '0');
  }

  /**
   * 📂 Load email template from file
   */
  private async loadTemplate(templateName: string): Promise<string> {
    try {
      const templatePath = path.join(this.templatesDir, templateName);

      if (!fs.existsSync(templatePath)) {
        this.logger.warn(`Template not found: ${templatePath}, using fallback`);
        return this.getFallbackTemplate(templateName);
      }

      return fs.readFileSync(templatePath, 'utf-8');
    } catch (error) {
      this.logger.error(`Error loading template ${templateName}: ${error.message}`);
      return this.getFallbackTemplate(templateName);
    }
  }

  /**
   * 📤 Dispatch email (placeholder for actual email provider integration)
   */
  private async dispatchEmail(emailData: {
    to: string;
    from: string;
    subject: string;
    html: string;
  }): Promise<void> {
    // TODO: Integrate with actual email provider (SendGrid, AWS SES, Nodemailer, etc.)
    this.logger.debug(`Email prepared: ${emailData.subject}`);
    return Promise.resolve();
  }

  /**
   * ✅ Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * 🎭 Mask email for logging (privacy protection)
   */
  private maskEmail(email: string): string {
    const [localPart, domain] = email.split('@');
    const maskedLocal = localPart.charAt(0) + '***' + localPart.charAt(localPart.length - 1);
    return `${maskedLocal}@${domain}`;
  }

  /**
   * 📅 Format date for display
   */
  private formatDate(date: Date): string {
    return date.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  }

  /**
   * 🔄 Get fallback template if file is not found
   */
  private getFallbackTemplate(templateName: string): string {
    if (templateName === 'welcome.ejs') {
      return `
        <h1>Welcome to <%= appName %>!</h1>
        <p>Hello <%= name %>,</p>
        <p>Thank you for joining <%= appName %>. Your account has been successfully created.</p>
        <p>Best regards,<br>The <%= appName %> Team</p>
      `;
    }

    if (templateName === 'login.ejs') {
      return `
        <h1>New Login Detected</h1>
        <p>Hello <%= name %>,</p>
        <p>We detected a new login to your <%= appName %> account at <%= time %>.</p>
        <% if (ip) { %><p>IP Address: <%= ip %></p><% } %>
        <% if (device) { %><p>Device: <%= device %></p><% } %>
        <p>If this wasn't you, please secure your account immediately.</p>
        <p>Best regards,<br>The <%= appName %> Security Team</p>
      `;
    }

    if (templateName === 'otp.ejs') {
      return `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333;">Your One-Time Password</h1>
          <p>You requested a one-time password for <strong><%= appName %></strong>.</p>
          <div style="background: #f4f4f4; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
            <p style="margin: 0; font-size: 14px; color: #666;">Your OTP code</p>
            <p style="margin: 12px 0 0; font-size: 40px; font-weight: bold; letter-spacing: 8px; color: #1a1a1a;"><%= otp %></p>
          </div>
          <p>This code will expire on <strong><%= expiresAt %></strong> (<%= expiryMinutes %> minutes from when it was requested).</p>
          <p>If you did not request this code, please ignore this email or contact support if you have concerns.</p>
          <p style="color: #666; font-size: 12px; margin-top: 32px;">
            &copy; <%= year %> <%= appName %>. All rights reserved.
          </p>
        </body>
        </html>
      `;
    }

    return '<p>Email template</p>';
  }
}