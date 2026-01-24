import { EmailTemplate } from '../interfaces/email-template.interface';
import { PasswordResetContext } from '../dto/email-context.dto';

export function passwordResetTemplate(
  context: PasswordResetContext,
): EmailTemplate {
  return {
    subject: 'Password Reset Request',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f44336; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .button { display: inline-block; padding: 10px 20px; background-color: #f44336; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .warning { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Reset</h1>
            </div>
            <div class="content">
              <p>Hello ${context.userName},</p>
              <p>We received a request to reset your password. Click the button below to create a new password:</p>
              <a href="${context.resetUrl}" class="button">Reset Password</a>
              <p>This link will expire in ${context.expiresIn}.</p>
              <div class="warning">
                <strong>Security Notice:</strong> If you didn't request this password reset, please ignore this email or contact support if you have concerns.
              </div>
              <p>For security purposes, this link can only be used once.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Hospital Management System. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `Password reset requested for ${context.userName}. Reset link: ${context.resetUrl} (expires in ${context.expiresIn})`,
  };
}
