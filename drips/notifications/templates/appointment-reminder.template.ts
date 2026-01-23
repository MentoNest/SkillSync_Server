import { EmailTemplate } from '../interfaces/email-template.interface';
import { AppointmentReminderContext } from '../dto/email-context.dto';

export function appointmentReminderTemplate(
  context: AppointmentReminderContext,
): EmailTemplate {
  return {
    subject: 'Appointment Reminder',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #FF9800; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .reminder-box { background-color: #fff3e0; border: 2px solid #FF9800; padding: 15px; margin: 20px 0; text-align: center; }
            .details { background-color: white; padding: 15px; margin: 20px 0; }
            .detail-row { margin: 10px 0; }
            .label { font-weight: bold; color: #666; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⏰ Appointment Reminder</h1>
            </div>
            <div class="content">
              <p>Hello ${context.userName},</p>
              <div class="reminder-box">
                <h2 style="margin: 0;">Your appointment is in ${context.hoursUntil} hours</h2>
              </div>
              <div class="details">
                <div class="detail-row">
                  <span class="label">Patient:</span> ${context.patientName}
                </div>
                <div class="detail-row">
                  <span class="label">Doctor:</span> ${context.doctorName}
                </div>
                <div class="detail-row">
                  <span class="label">Date:</span> ${context.appointmentDate}
                </div>
                <div class="detail-row">
                  <span class="label">Time:</span> ${context.appointmentTime}
                </div>
                <div class="detail-row">
                  <span class="label">Location:</span> ${context.location}
                </div>
              </div>
              <p><strong>Reminder:</strong> Please arrive 15 minutes early.</p>
              <p>We look forward to seeing you!</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Hospital Management System. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `Reminder: Your appointment with Dr. ${context.doctorName} is in ${context.hoursUntil} hours on ${context.appointmentDate} at ${context.appointmentTime}. Location: ${context.location}`,
  };
}
