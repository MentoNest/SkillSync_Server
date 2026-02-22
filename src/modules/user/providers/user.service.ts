import { Injectable } from '@nestjs/common';
import { User } from '../entities/user.entity';
import { UserRole } from '../../../common/enums/user-role.enum';

@Injectable()
export class UserService {
  // In-memory storage for demo purposes - replace with database in production
  private users: User[] = [];

  findByEmail(email: string): Promise<User | null> {
    const user = this.users.find((u) => u.email === email);
    return Promise.resolve(user || null);
  }

  findById(id: string): Promise<User | null> {
    const user = this.users.find((u) => u.id === id);
    return Promise.resolve(user || null);
  }

  findByPublicKey(publicKey: string): Promise<User | null> {
    const user = this.users.find((u) => u.wallets.some(w => w.address === publicKey));
    return Promise.resolve(user || null);
  }

  async findOrCreateByPublicKey(publicKey: string): Promise<User> {
    const existing = await this.findByPublicKey(publicKey);
    if (existing) return existing;

    const user = new User();
    Object.assign(user, {
      id: Date.now().toString(),
      wallets: [{ address: publicKey, isPrimary: true, linkedAt: new Date() }],
      email: undefined,
      password: undefined,
      firstName: undefined,
      lastName: undefined,
      role: UserRole.MENTEE,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    this.users.push(user);
    return user;
  }


  async linkWallet(userId: string, address: string): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new Error('User not found');

    if (user.wallets.some(w => w.address === address)) {
      return user;
    }

    user.wallets.push({ address, isPrimary: false, linkedAt: new Date() });
    return user;
  }

  async removeWallet(userId: string, address: string): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new Error('User not found');

    const walletIndex = user.wallets.findIndex(w => w.address === address);
    if (walletIndex === -1) throw new Error('Wallet not found');

    const wallet = user.wallets[walletIndex];
    if (wallet.isPrimary) {
      throw new Error('Cannot remove primary wallet');
    }

    user.wallets.splice(walletIndex, 1);
    return user;
  }

  async setPrimaryWallet(userId: string, address: string): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new Error('User not found');

    const wallet = user.wallets.find(w => w.address === address);
    if (!wallet) throw new Error('Wallet not found');

    user.wallets.forEach(w => w.isPrimary = false);
    wallet.isPrimary = true;
    return user;
  }


  create(userData: Partial<User>): Promise<User> {
    const user = new User();
    Object.assign(user, {
      id: Date.now().toString(),
      wallets: [],
      email: userData.email!,
      password: userData.password!,
      firstName: userData.firstName,
      lastName: userData.lastName,
      role: userData.role ?? UserRole.MENTEE,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    this.users.push(user);
    return Promise.resolve(user);
  }

}
