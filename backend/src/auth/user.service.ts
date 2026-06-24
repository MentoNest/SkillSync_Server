import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class UserService {
  constructor(@InjectRepository(User) private readonly userRepository: Repository<User>) {}

  async findOrCreateByWallet(wallet: string): Promise<User> {
    let user = await this.userRepository.findOne({ where: { wallet } });
    if (!user) {
      user = this.userRepository.create({
        wallet,
        roles: ['user'],
        permissions: [],
      });
      user = await this.userRepository.save(user);
    }
    return user;
  }
}
