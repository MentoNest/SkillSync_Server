import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { googleId } });
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async createFromGoogle(profile: any): Promise<User> {
    const email = profile.emails[0].value;
    const existingUser = await this.findByEmail(email);

    if (existingUser) {
      // Link Google account to existing user
      existingUser.googleId = profile.id;
      existingUser.authProvider = 'google';
      if (!existingUser.profilePicture && profile.photos?.[0]) {
        existingUser.profilePicture = profile.photos[0].value;
      }
      return this.usersRepository.save(existingUser);
    }

    // Create new user
    const user = this.usersRepository.create({
      email,
      googleId: profile.id,
      firstName: profile.name?.givenName || 'User',
      lastName: profile.name?.familyName || '',
      profilePicture: profile.photos?.[0]?.value,
      authProvider: 'google',
    });

    return this.usersRepository.save(user);
  }

  async create(userData: Partial<User>): Promise<User> {
    const user = this.usersRepository.create(userData);
    return this.usersRepository.save(user);
  }

  async update(id: string, userData: Partial<User>): Promise<User> {
    await this.usersRepository.update(id, userData);
    return this.findById(id);
  }
}
