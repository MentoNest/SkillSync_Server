import { UserStatus } from '../../user/user-status.enum';

export interface FakeUser {
  walletAddress: string;
  tokenVersion: number;
  status?: UserStatus;
  deletedAt?: Date | null;
}

export class FakeUserRepository {
  readonly users = new Map<string, FakeUser>();

  findOne({
    where,
  }: {
    where: { walletAddress: string };
  }): Promise<FakeUser | null> {
    return Promise.resolve(this.users.get(where.walletAddress) ?? null);
  }

  save(user: FakeUser): Promise<FakeUser> {
    this.users.set(user.walletAddress, user);
    return Promise.resolve(user);
  }

  query(_sql: string, [walletAddress]: [string]): Promise<never[]> {
    const user = this.users.get(walletAddress);
    this.users.set(walletAddress, {
      ...user,
      walletAddress,
      tokenVersion: (user?.tokenVersion ?? 0) + 1,
    });
    return Promise.resolve([]);
  }
}
