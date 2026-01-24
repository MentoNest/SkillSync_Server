import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import { SendEmailDto } from '../dto/send-email.dto';
import { TemplateService, EmailTemplateType } from './template.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter;

  constructor(
    private configService: ConfigService,
    private templateService: TemplateService,
  ) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST', 'smtp.gmail.com'),
      port: this.configService.get<number>('SMTP_PORT', 587),
      secure: this.configService.get<boolean>('SMTP_SECURE', false),
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASSWORD'),
      },
    });

    this.transporter.verify((error) => {
      if (error) {
        this.logger.error('SMTP connection failed:', error);
      } else {
        this.logger.log('SMTP connection successful');
      }
    });
  }

  async send(emailDto: SendEmailDto): Promise<boolean> {
    try {
      const mailOptions = {
        from: this.configService.get<string>(
          'SMTP_FROM',
          'noreply@hospital.com',
        ),
        to: emailDto.to,
        subject: emailDto.subject,
        html: emailDto.html,
        text: emailDto.text,
        attachments: emailDto.attachments,
      };

      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email sent to ${emailDto.to}: ${info.messageId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${emailDto.to}:`, error);
      return false;
    }
  }

  async sendTemplatedEmail(
    to: string,
    templateType: EmailTemplateType,
    context: any,
  ): Promise<boolean> {
    const template = this.templateService.getTemplate(templateType, context);

    return this.send({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  async sendWelcomeEmail(
    to: string,
    userName: string,
    loginUrl: string,
  ): Promise<boolean> {
    return this.sendTemplatedEmail(to, EmailTemplateType.WELCOME, {
      userName,
      loginUrl,
    });
  }

  async sendPasswordResetEmail(
    to: string,
    userName: string,
    resetToken: string,
    expiresIn: string = '1 hour',
  ): Promise<boolean> {
    const resetUrl = `${this.configService.get<string>('APP_URL')}/auth/reset-password?token=${resetToken}`;

    return this.sendTemplatedEmail(to, EmailTemplateType.PASSWORD_RESET, {
      userName,
      resetToken,
      resetUrl,
      expiresIn,
    });
  }

  async sendBookingConfirmation(
    to: string,
    userName: string,
    appointmentDetails: {
      patientName: string;
      doctorName: string;
      appointmentDate: string;
      appointmentTime: string;
      location: string;
      specialization?: string;
    },
  ): Promise<boolean> {
    return this.sendTemplatedEmail(to, EmailTemplateType.BOOKING_CONFIRMATION, {
      userName,
      ...appointmentDetails,
    });
  }

  async sendAppointmentReminder(
    to: string,
    userName: string,
    appointmentDetails: {
      patientName: string;
      doctorName: string;
      appointmentDate: string;
      appointmentTime: string;
      location: string;
      hoursUntil: number;
    },
  ): Promise<boolean> {
    return this.sendTemplatedEmail(to, EmailTemplateType.APPOINTMENT_REMINDER, {
      userName,
      ...appointmentDetails,
    });
  }
}
