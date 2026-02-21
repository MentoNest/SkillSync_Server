import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
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

  constructor(private readonly configService: ConfigService) {
    this.templatesDir = path.join(__dirname, 'templates');
  }

  /**
   * 📧 Send welcome email to new user
   * @param user - User object with email, firstName, and optional username
   * @returns Promise<void>
   */
  async sendWelcomeEmail(user: MailUser): Promise<void> {
    try {
      const { email, firstName, username } = user;
      
      // Validate email
      if (!email || !this.isValidEmail(email)) {
        throw new Error('Invalid email address provided');
      }

      // Load template
      const template = await this.loadTemplate('welcome.ejs');
      
      // Prepare template variables
      const templateVars = {
        name: firstName || username || 'there',
        email: this.maskEmail(email),
        appName: this.configService.mailAppName,
        appUrl: process.env.APP_URL || 'https://skillsync.com',
        year: new Date().getFullYear(),
      };

      // Render template
      let html = processConditionals(template, templateVars);
      html = renderTemplate(html, templateVars);

      // Prepare email data
      const subject = `${this.configService.mailSubjectPrefix} Welcome to ${this.configService.mailAppName}!`;
      const from = this.configService.mailSender;

      // Log email dispatch (no PII in logs)
      this.logger.log(`Sending welcome email to user`);

      // Send email (placeholder for actual implementation)
      await this.dispatchEmail({
        to: email,
        from,
        subject,
        html,
      });

      this.logger.log(`Welcome email sent successfully`);
    } catch (error) {
      this.logger.error(`Failed to send welcome email: ${error.message}`);
      // Don't throw - fail gracefully
    }
  }

  /**
   * 📧 Send login notification email
   * @param user - User object with email, firstName, and optional username
   * @param metadata - Optional metadata including ip, device, and time
   * @returns Promise<void>
   */
  async sendLoginEmail(user: MailUser, metadata?: LoginMetadata): Promise<void> {
    try {
      const { email, firstName, username } = user;
      const { ip, device, time } = metadata || {};

      // Validate email
      if (!email || !this.isValidEmail(email)) {
        throw new Error('Invalid email address provided');
      }

      // Load template
      const template = await this.loadTemplate('login.ejs');

      // Prepare template variables
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

      // Render template
      let html = processConditionals(template, templateVars);
      html = renderTemplate(html, templateVars);

      // Prepare email data
      const subject = `${this.configService.mailSubjectPrefix} New Login Detected`;
      const from = this.configService.mailSender;

      // Log email dispatch (no PII in logs)
      this.logger.log(`Sending login notification email to user`);

      // Send email (placeholder for actual implementation)
      await this.dispatchEmail({
        to: email,
        from,
        subject,
        html,
      });

      this.logger.log(`Login notification email sent successfully`);
    } catch (error) {
      this.logger.error(`Failed to send login email: ${error.message}`);
      // Don't throw - fail gracefully
    }
  }

  /**
   * 📂 Load email template from file
   * @param templateName - Name of the template file
   * @returns Template content as string
   */
  private async loadTemplate(templateName: string): Promise<string> {
    try {
      const templatePath = path.join(this.templatesDir, templateName);
      
      // Check if file exists
      if (!fs.existsSync(templatePath)) {
        // Fallback: return inline template
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
   * @param emailData - Email data including to, from, subject, and html
   */
  private async dispatchEmail(emailData: {
    to: string;
    from: string;
    subject: string;
    html: string;
  }): Promise<void> {
    // TODO: Integrate with actual email provider (SendGrid, AWS SES, Nodemailer, etc.)
    // Example with Nodemailer:
    // const transporter = nodemailer.createTransport({...});
    // await transporter.sendMail(emailData);

    // For development, just log the email
    this.logger.debug(`Email prepared: ${emailData.subject}`);
    
    // Simulate async operation
    return Promise.resolve();
  }

  /**
   * ✅ Validate email format
   * @param email - Email address to validate
   * @returns boolean
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * 🎭 Mask email for logging (privacy protection)
   * @param email - Email to mask
   * @returns Masked email
   */
  private maskEmail(email: string): string {
    const [localPart, domain] = email.split('@');
    const maskedLocal = localPart.charAt(0) + '***' + localPart.charAt(localPart.length - 1);
    return `${maskedLocal}@${domain}`;
  }

  /**
   * 📅 Format date for display
   * @param date - Date to format
   * @returns Formatted date string
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
   * @param templateName - Name of the template
   * @returns Fallback template string
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

    return '<p>Email template</p>';

  }
}
