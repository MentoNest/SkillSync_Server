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
    const user = this.users.find((u) => u.publicKey === publicKey);
    return Promise.resolve(user || null);
  }
  
  async findOrCreateByPublicKey(publicKey: string): Promise<User> {
    const existing = await this.findByPublicKey(publicKey);
    if (existing) return existing;

    const user: User = {
      id:        Date.now().toString(),
      publicKey,
      email:     undefined,
      password:  undefined,
      firstName: undefined,
      lastName:  undefined,
      role:      UserRole.MENTEE,
      isActive:  true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.push(user);
    return user;
  }

  create(userData: Partial<User>): Promise<User> {
    const user: User = {
      id: Date.now().toString(),
      email: userData.email!,
      password: userData.password!,
      firstName: userData.firstName,
      lastName: userData.lastName,
      role: userData.role ?? UserRole.MENTEE,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.push(user);
    return Promise.resolve(user);
  }
}
