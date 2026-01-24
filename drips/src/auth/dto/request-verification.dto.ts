import { IsEmail } from 'class-validator';

export class RequestVerificationDto {
  @IsEmail()
  email!: string;
}
