// src/auth/auth.service.ts
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from '../users/user.entity';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,

    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
    
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  public async register(registerDto: RegisterDto): Promise<User> {
    const { email, password, name } = registerDto;

    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash the password
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const user = this.userRepository.create({
      email,
      name,
      password: hashedPassword,
    });

    return this.userRepository.save(user);
  }

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  //LOGIN FN 
  public async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    const payload = { email: user.email, sub: user.id };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshTokenString = this.jwtService.sign(payload, {
      expiresIn: '7d',
    });

    const refreshToken = this.refreshTokenRepository.create({
      token: refreshTokenString,
      user,
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    await this.refreshTokenRepository.save(refreshToken);

    return { accessToken, refreshToken: refreshTokenString };
  }


  //LOGOUT FN 
  async logout(refreshToken: string): Promise<boolean> {
    const tokenRecord = await this.refreshTokenRepository.findOne({
      where: { token: refreshToken },
    });
    if (!tokenRecord) return false;

    tokenRecord.isInvalidated = true;
    await this.refreshTokenRepository.save(tokenRecord);
    return true;
  }

  async findRefreshToken(token: string): Promise<RefreshToken> {
    return this.refreshTokenRepository.findOne({ where: { token } });
  }

  async createNewRefreshToken(
    user: User,
    token: string,
  ): Promise<RefreshToken> {
    const newToken = this.refreshTokenRepository.create({
      token,
      user,
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    return this.refreshTokenRepository.save(newToken);
  }
}
