import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { EncryptionService } from '../common/encryption/encryption.service';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly encryptionService: EncryptionService,
  ) {}

  async findOrCreateByWallet(wallet: string): Promise<User> {
    // Use the hash index for the lookup so we never compare plaintext against
    // the encrypted column value stored in the database.
    const walletHash = this.encryptionService.hash(wallet);
    let user = await this.userRepository.findOne({ where: { walletHash } });
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
