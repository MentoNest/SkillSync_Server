interface FakeUser {
  walletAddress: string;
  tokenVersion: number;
}

export class FakeUserRepository {
  private readonly users = new Map<string, FakeUser>();

  findOne({
    where,
  }: {
    where: { walletAddress: string };
  }): Promise<FakeUser | null> {
    return Promise.resolve(this.users.get(where.walletAddress) ?? null);
  }

  query(_sql: string, [walletAddress]: [string]): Promise<never[]> {
    const user = this.users.get(walletAddress);
    this.users.set(walletAddress, {
      walletAddress,
      tokenVersion: (user?.tokenVersion ?? 0) + 1,
    });
    return Promise.resolve([]);
  }
}
