export class CreateUserDto {
    username: string;
    email: string;
    password: string;
    role: 'MENTOR' | 'MENTEE';
  }
  
