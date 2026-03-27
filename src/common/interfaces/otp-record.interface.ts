export interface OtpRecord {
  otp: string;
  expiresAt: Date;
  email: string;
  purpose: string;
  createdAt: Date;
}