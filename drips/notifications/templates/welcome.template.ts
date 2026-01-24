import { EmailTemplate } from '../interfaces/email-template.interface';
import { WelcomeEmailContext } from '../dto/email-context.dto';

export function welcomeEmailTemplate(
  context: WelcomeEmailContext,
): EmailTemplate {
  return {
    subject: 'Welcome to Our Hospital Management System',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .button { display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome!</h1>
            </div>
            <div class="content">
              <p>Hello ${context.userName},</p>
              <p>Welcome to our Hospital Management System. We're excited to have you on board!</p>
              <p>Your account has been successfully created. You can now access all our services.</p>
              <a href="${context.loginUrl}" class="button">Get Started</a>
              <p>If you have any questions, please don't hesitate to contact our support team.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Hospital Management System. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `Welcome ${context.userName}! Your account has been created. Login at: ${context.loginUrl}`,
  };
}
