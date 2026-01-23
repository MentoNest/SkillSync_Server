import { Injectable } from '@nestjs/common';
import { EmailTemplate } from '../interfaces/email-template.interface';
import { welcomeEmailTemplate } from '../templates/welcome.template';
import { passwordResetTemplate } from '../templates/password-reset.template';
import { bookingConfirmationTemplate } from '../templates/booking-confirmation.template';
import { appointmentReminderTemplate } from '../templates/appointment-reminder.template';
import {
  WelcomeEmailContext,
  PasswordResetContext,
  BookingConfirmationContext,
  AppointmentReminderContext,
} from '../dto/email-context.dto';

export enum EmailTemplateType {
  WELCOME = 'WELCOME',
  PASSWORD_RESET = 'PASSWORD_RESET',
  BOOKING_CONFIRMATION = 'BOOKING_CONFIRMATION',
  APPOINTMENT_REMINDER = 'APPOINTMENT_REMINDER',
}

@Injectable()
export class TemplateService {
  getTemplate(type: EmailTemplateType, context: any): EmailTemplate {
    switch (type) {
      case EmailTemplateType.WELCOME:
        return welcomeEmailTemplate(context as WelcomeEmailContext);
      case EmailTemplateType.PASSWORD_RESET:
        return passwordResetTemplate(context as PasswordResetContext);
      case EmailTemplateType.BOOKING_CONFIRMATION:
        return bookingConfirmationTemplate(
          context as BookingConfirmationContext,
        );
      case EmailTemplateType.APPOINTMENT_REMINDER:
        return appointmentReminderTemplate(
          context as AppointmentReminderContext,
        );
      default:
        throw new Error(`Unknown template type: ${type}`);
    }
  }
}
