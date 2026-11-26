import { getMetadataArgsStorage } from 'typeorm';
import { User } from '../user.entity';
import { UserStatus } from '../user-status.enum';

describe('User entity metadata', () => {
  it('defines status enum column and soft delete column', () => {
    const metadata = getMetadataArgsStorage();
    const columns = metadata.columns.filter((c) => c.target === User);

    const status = columns.find((c) => c.propertyName === 'status');
    expect(status?.options.type).toBe('enum');
    expect(status?.options.default).toBe(UserStatus.ACTIVE);

    const deletedAt = metadata.columns.find(
      (c) => c.target === User && c.propertyName === 'deletedAt',
    );
    expect(deletedAt?.options.name).toBe('deleted_at');
  });

  it('has indexes for walletAddress, status, createdAt, lastLoginAt and unique email', () => {
    const metadata = getMetadataArgsStorage();
    const indexes = metadata.indices.filter((i) => i.target === User);
    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toEqual(
      expect.arrayContaining([
        'idx_users_wallet_address',
        'idx_users_status',
        'idx_users_created_at',
        'idx_users_last_login_at',
        'uq_users_email',
      ]),
    );
  });

  it('prepares mentor/mentee profile relations', () => {
    const relations = getMetadataArgsStorage().relations.filter(
      (r) => r.target === User,
    );
    const names = relations.map((r) => r.propertyName);
    expect(names).toEqual(
      expect.arrayContaining(['mentorProfile', 'menteeProfile', 'roles']),
    );
  });
});
