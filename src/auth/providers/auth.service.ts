import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { User } from 'src/user/entities/user.entity';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { Response } from 'express';
import { AuthDto } from '../dto/sign-in.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { SignInResponseDto } from '../dto/sign-in-response.dto';
import { UserService } from 'src/user/providers/user.service';
import { RedisService } from 'src/redis/providers/cache.service';
import { MailerService } from 'src/mailer/mailer.service';
import { userRole } from 'src/common/enums/role.enum';
import { UserResponseDto } from '../dto/user-response.dto';


@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) 
    private userRepo: Repository<User>,
    
    private jwtService: JwtService,

    private readonly usersService: UserService,

    private readonly redisService: RedisService,

    private readonly mailerService: MailerService,
  ) {}

  //FN TO REGISTER A NEW USER 
  async signup(dto: CreateUserDto) {
    const hash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepo.create({
      ...dto,
      password: hash,
      role: dto.role === userRole.MENTOR ? userRole.MENTOR : userRole.MENTEE,
    });
    return this.userRepo.save(user);
  }

  //FN TO SIGN IN A USER 
  async signin(dto: AuthDto) {
    const user = await this.userRepo.findOne({
      where: { email: dto.email },
      select: ['id', 'email', 'password', 'role', 'fullName'], 
    });

    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
    });

    const userResponse = new UserResponseDto(user);
    return new SignInResponseDto({
      accessToken: token,
      user: userResponse,
    });
  }

  //FN TO CHANGE A USER PASSWORD 
  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Verify new passwords match
    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new BadRequestException('New passwords do not match');
    }

    // Hash and update the new password
    const hash = await bcrypt.hash(dto.newPassword, 10);
    user.password = hash;

    await this.userRepo.save(user);
    return { message: 'Password updated successfully' };
  }

  async logout(userId: number, res: Response) {
    try {
      // Find the user to ensure they exist
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const cookiesToClear = ['refreshToken', 'refresh_token', 'jwt_refresh'];
      
      cookiesToClear.forEach(cookieName => {
        res.clearCookie(cookieName, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
        });
      });

      // Log the logout event for auditing purposes
      this.logger.log(`User ${user.email} (ID: ${userId}) logged out successfully`);

      return { message: 'Logout successful' };
    } catch (error) {
      this.logger.error(`Logout failed for user ID ${userId}:`, error.message);
      throw error;
    }
  }

   async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) return;

    const token = randomBytes(32).toString('hex');
    await this.redisService.set(`reset:${token}`, user.id.toString(), 3600);
 // 1 hour

    await this.mailerService.sendResetEmail(email, token);
  }

  async resetPassword(token: string, newPassword: string) {
    const userId = await this.redisService.get(`reset:${token}`);
    if (!userId) throw new BadRequestException('Invalid or expired token.');

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.usersService.updatePassword(String(userId), hashed);
    await this.redisService.delete(`reset:${token}`);
  }
}