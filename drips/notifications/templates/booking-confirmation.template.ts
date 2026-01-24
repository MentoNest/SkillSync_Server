import { EmailTemplate } from '../interfaces/email-template.interface';
import { BookingConfirmationContext } from '../dto/email-context.dto';

export function bookingConfirmationTemplate(
  context: BookingConfirmationContext,
): EmailTemplate {
  return {
    subject: 'Appointment Confirmation',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .details { background-color: white; padding: 15px; margin: 20px 0; border-left: 4px solid #2196F3; }
            .detail-row { margin: 10px 0; }
            .label { font-weight: bold; color: #666; }
            .button { display: inline-block; padding: 10px 20px; background-color: #2196F3; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✓ Appointment Confirmed</h1>
            </div>
            <div class="content">
              <p>Hello ${context.userName},</p>
              <p>Your appointment has been successfully scheduled.</p>
              <div class="details">
                <div class="detail-row">
                  <span class="label">Patient:</span> ${context.patientName}
                </div>
                <div class="detail-row">
                  <span class="label">Doctor:</span> ${context.doctorName}${context.specialization ? ` (${context.specialization})` : ''}
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
              <p><strong>Important:</strong> Please arrive 15 minutes early for check-in.</p>
              <p>If you need to reschedule or cancel, please contact us at least 24 hours in advance.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Hospital Management System. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `Appointment confirmed for ${context.patientName} with Dr. ${context.doctorName} on ${context.appointmentDate} at ${context.appointmentTime}. Location: ${context.location}`,
  };
}
