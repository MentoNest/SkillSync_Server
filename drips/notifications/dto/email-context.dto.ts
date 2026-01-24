export class WelcomeEmailContext {
  userName: string;
  loginUrl: string;
}

export class PasswordResetContext {
  userName: string;
  resetToken: string;
  resetUrl: string;
  expiresIn: string;
}

export class BookingConfirmationContext {
  userName: string;
  patientName: string;
  doctorName: string;
  appointmentDate: string;
  appointmentTime: string;
  location: string;
  specialization?: string;
}

export class AppointmentReminderContext {
  userName: string;
  patientName: string;
  doctorName: string;
  appointmentDate: string;
  appointmentTime: string;
  location: string;
  hoursUntil: number;
}
