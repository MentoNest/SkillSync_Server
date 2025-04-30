import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from 'src/user/entities/user.entity';
import { UserRole } from 'src/user/enums/user-role.enum';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { AuthDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async signup(dto: CreateUserDto) {
    const hash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepo.create({
      ...dto,
      password: hash,
      role: dto.role === 'MENTOR' ? UserRole.MENTOR : UserRole.MENTEE,
    });
    return this.userRepo.save(user);
  }

  async signin(dto: AuthDto) {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const token = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
    });
    return { access_token: token };
  }
}
