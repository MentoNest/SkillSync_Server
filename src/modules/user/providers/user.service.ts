import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { Wallet } from '../entities/wallet.entity';
import { UserRole } from '../../../common/enums/user-role.enum';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ 
      where: { email },
      relations: ['wallets']
    });
  }

  findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ 
      where: { id },
      relations: ['wallets']
    });
  }

  findByPublicKey(publicKey: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.wallets', 'wallet')
      .where('wallet.address = :address', { address: publicKey })
      .getOne();
  }

  async findOrCreateByPublicKey(publicKey: string): Promise<User> {
    const existing = await this.findByPublicKey(publicKey);
    if (existing) return existing;

    const newUser = await this.userRepository.create({
      role: UserRole.MENTEE,
      isActive: true,
    });

    const savedUser = await this.userRepository.save(newUser);

    const wallet = this.walletRepository.create({
      address: publicKey,
      isPrimary: true,
      user: savedUser,
    });

    await this.walletRepository.save(wallet);

    const user = await this.findById(savedUser.id);
    if (!user) throw new Error('Failed to create user');
    return user;
  }

  async linkWallet(userId: string, address: string): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new Error('User not found');

    const existingWallet = await this.walletRepository.findOne({
      where: { address, user: { id: userId } }
    });

    if (existingWallet) {
      return user;
    }

    const wallet = this.walletRepository.create({
      address,
      isPrimary: false,
      user,
    });

    await this.walletRepository.save(wallet);
    const updatedUser = await this.findById(userId);
    if (!updatedUser) throw new Error('User not found after update');
    return updatedUser;
  }

  async removeWallet(userId: string, address: string): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new Error('User not found');

    const wallet = await this.walletRepository.findOne({
      where: { address, user: { id: userId } }
    });

    if (!wallet) throw new Error('Wallet not found');
    if (wallet.isPrimary) {
      throw new Error('Cannot remove primary wallet');
    }

    await this.walletRepository.remove(wallet);
    const updatedUser = await this.findById(userId);
    if (!updatedUser) throw new Error('User not found after update');
    return updatedUser;
  }

  async setPrimaryWallet(userId: string, address: string): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new Error('User not found');

    const wallet = await this.walletRepository.findOne({
      where: { address, user: { id: userId } }
    });

    if (!wallet) throw new Error('Wallet not found');

    await this.walletRepository.update(
      { user: { id: userId } },
      { isPrimary: false }
    );

    wallet.isPrimary = true;
    await this.walletRepository.save(wallet);

    const updatedUser = await this.findById(userId);
    if (!updatedUser) throw new Error('User not found after update');
    return updatedUser;
  }

  async create(userData: Partial<User>): Promise<User> {
    const user = this.userRepository.create({
      email: userData.email,
      passwordHash: userData.passwordHash,
      firstName: userData.firstName,
      lastName: userData.lastName,
      role: userData.role ?? UserRole.MENTEE,
      isActive: userData.isActive ?? true,
    });

    return this.userRepository.save(user);
  }

  async updatePassword(userId: string, newPasswordHash: string): Promise<void> {
    await this.userRepository.update(userId, {
      passwordHash: newPasswordHash,
      updatedAt: new Date(),
    });
  }
}
