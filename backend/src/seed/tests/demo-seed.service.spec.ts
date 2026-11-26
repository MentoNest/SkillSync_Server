import { Keypair } from '@stellar/stellar-sdk';
import type { Repository } from 'typeorm';
import { AvailabilitySlot } from '../../availability/availability-slot.entity';
import { normalizeWalletAddress } from '../../common/utils/wallet.utils';
import { MenteeProfile } from '../../profile/mentee-profile.entity';
import { MentorProfile } from '../../profile/mentor-profile.entity';
import { RoleEntity } from '../../user/role.entity';
import { User } from '../../user/user.entity';
import { DEMO_MENTEES, DEMO_MENTORS } from '../demo-data';
import { DemoSeedService } from '../demo-seed.service';

interface RoleRow {
  id?: string;
  name: string;
  permissions?: string[];
}

interface UserRow {
  id?: string;
  walletAddress: string;
  email: string | null;
  username: string | null;
  displayName: string | null;
  role: string | null;
  roles: RoleRow[];
  status?: string;
  education?: string[];
  certifications?: string[];
  deletedAt?: Date | null;
}

interface MentorRow {
  id?: string;
  walletAddress: string;
  bio?: string;
  skills?: string[];
  expertiseAreas?: string[];
  hourlyRateUsdCents?: number;
  maxMentees?: number;
  languages?: string[];
  isActive?: boolean;
}

interface MenteeRow {
  id?: string;
  walletAddress: string;
  learningGoals?: string[];
  interests?: string[];
  experienceLevel?: string;
  preferredMentoringStyle?: string[];
  timeCommitmentHoursPerWeek?: number | null;
  professionalBackground?: string | null;
  budgetUsdCentsPerMonth?: number | null;
  languages?: string[];
  isActive?: boolean;
}

interface SlotRow {
  id?: string;
  mentorId: string;
  dayOfWeek: number;
  startTimeUtc: string;
  endTimeUtc: string;
  timezone: string;
}

interface QueryOptions {
  where?: Record<string, unknown>;
}

interface FakeRepo<T extends object> {
  rows: T[];
  repo: Repository<T>;
}

function matches(where: Record<string, unknown>, row: object): boolean {
  const record = row as Record<string, unknown>;
  return Object.entries(where).every(
    ([field, expected]) => record[field] === expected,
  );
}

function createFakeRepo<T extends object>(keyFields: string[]): FakeRepo<T> {
  const rows: T[] = [];
  let idCounter = 0;
  const repo = {
    findOne: jest.fn((options: QueryOptions = {}): Promise<T | null> => {
      const found = rows.find((row) => matches(options.where ?? {}, row));
      if (!found) return Promise.resolve(null);
      const clone = { ...found } as unknown as Record<string, unknown>;
      if (Array.isArray(clone.roles)) {
        clone.roles = (clone.roles as RoleRow[]).slice();
      }
      return Promise.resolve(clone as unknown as T);
    }),
    find: jest.fn((options: QueryOptions = {}): Promise<T[]> =>
      Promise.resolve(
        rows
          .filter((row) => matches(options.where ?? {}, row))
          .map((row) => ({ ...row })),
      ),
    ),
    create: jest.fn(
      (value: Partial<T>): T =>
        ({ id: `generated-${++idCounter}`, ...value }) as unknown as T,
    ),
    save: jest.fn((value: T | T[]): Promise<T | T[]> => {
      const values = Array.isArray(value) ? value : [value];
      const saved: T[] = [];
      for (const row of values) {
        const record = row as unknown as Record<string, unknown>;
        const keyField = keyFields.find((field) => record[field] !== undefined);
        const index = keyField
          ? rows.findIndex(
              (existing) =>
                (existing as unknown as Record<string, unknown>)[keyField] ===
                record[keyField],
            )
          : -1;
        const stored = { ...row };
        if (index >= 0) rows[index] = stored;
        else rows.push(stored);
        saved.push(stored);
      }
      return Promise.resolve(Array.isArray(value) ? saved : saved[0]);
    }),
  };
  return { rows, repo: repo as unknown as Repository<T> };
}

function createHarness() {
  const users = createFakeRepo<UserRow>(['walletAddress']);
  const roles = createFakeRepo<RoleRow>(['name']);
  const mentors = createFakeRepo<MentorRow>(['walletAddress']);
  const mentees = createFakeRepo<MenteeRow>(['walletAddress']);
  const slots = createFakeRepo<SlotRow>(['id']);
  const wallets = Array.from({ length: 20 }, () =>
    Keypair.random().publicKey(),
  );
  let walletIndex = 0;
  const walletFactory = jest.fn(
    (): string => wallets[walletIndex++] ?? Keypair.random().publicKey(),
  );
  const service = new DemoSeedService(
    users.repo as unknown as Repository<User>,
    roles.repo as unknown as Repository<RoleEntity>,
    mentors.repo as unknown as Repository<MentorProfile>,
    mentees.repo as unknown as Repository<MenteeProfile>,
    slots.repo as unknown as Repository<AvailabilitySlot>,
    walletFactory,
  );
  return {
    service,
    users,
    roles,
    mentors,
    mentees,
    slots,
    wallets,
    walletFactory,
  };
}

describe('DemoSeedService', () => {
  it('is idempotent across repeated runs', async () => {
    const h = createHarness();

    const first = await h.service.seed();
    expect(first).toMatchObject({
      mentorsCreated: DEMO_MENTORS.length,
      menteesCreated: DEMO_MENTEES.length,
      skipped: 0,
    });

    const walletsAfterFirstRun = h.users.rows.map((user) => user.walletAddress);
    expect(new Set(walletsAfterFirstRun).size).toBe(
      DEMO_MENTORS.length + DEMO_MENTEES.length,
    );
    expect(h.mentors.rows).toHaveLength(DEMO_MENTORS.length);
    expect(h.mentees.rows).toHaveLength(DEMO_MENTEES.length);
    expect(h.slots.rows).toHaveLength(DEMO_MENTORS.length * 2);
    expect(h.roles.rows.map((role) => role.name).sort()).toEqual([
      'mentee',
      'mentor',
    ]);
    expect(h.walletFactory).toHaveBeenCalledTimes(
      DEMO_MENTORS.length + DEMO_MENTEES.length,
    );

    for (const user of h.users.rows) {
      expect(user.walletAddress).toBe(user.walletAddress.toLowerCase());
      expect(normalizeWalletAddress(user.walletAddress.toUpperCase())).toBe(
        user.walletAddress,
      );
      expect(user.roles).toHaveLength(1);
      expect(user.role).toBe(user.roles[0].name);
    }

    for (const profile of h.mentors.rows) {
      expect(profile.bio?.length ?? 0).toBeGreaterThan(10);
      expect(profile.skills?.length ?? 0).toBeGreaterThan(0);
      expect(profile.hourlyRateUsdCents ?? 0).toBeGreaterThan(0);
    }

    for (const profile of h.mentees.rows) {
      expect(profile.learningGoals?.length ?? 0).toBeGreaterThan(0);
      expect(profile.interests?.length ?? 0).toBeGreaterThan(0);
      expect(['beginner', 'intermediate', 'advanced']).toContain(
        profile.experienceLevel,
      );
    }

    const second = await h.service.seed();
    expect(second).toMatchObject({
      mentorsCreated: 0,
      menteesCreated: 0,
      skipped: 0,
    });
    expect(h.users.rows).toHaveLength(
      DEMO_MENTORS.length + DEMO_MENTEES.length,
    );
    expect(h.mentors.rows).toHaveLength(DEMO_MENTORS.length);
    expect(h.mentees.rows).toHaveLength(DEMO_MENTEES.length);
    expect(h.slots.rows).toHaveLength(DEMO_MENTORS.length * 2);
    expect(h.walletFactory).toHaveBeenCalledTimes(
      DEMO_MENTORS.length + DEMO_MENTEES.length,
    );
    expect(h.users.rows.map((user) => user.walletAddress)).toEqual(
      walletsAfterFirstRun,
    );
  });

  it('does not delete or overwrite non-demo users', async () => {
    const h = createHarness();
    const collidingWallet = normalizeWalletAddress(h.wallets[0]);
    const regularUser: UserRow = {
      walletAddress: normalizeWalletAddress(h.wallets[5]),
      email: 'real.user@example.com',
      username: 'real_user',
      displayName: 'Real User',
      role: 'user',
      roles: [],
    };
    const collidingUser: UserRow = {
      walletAddress: collidingWallet,
      email: 'other.user@example.com',
      username: 'other_user',
      displayName: 'Other User',
      role: 'user',
      roles: [],
    };
    const conflictingDemoEmail: UserRow = {
      walletAddress: normalizeWalletAddress(h.wallets[6]),
      email: DEMO_MENTORS[0].email,
      username: 'not_a_demo',
      displayName: 'Not A Demo',
      role: 'user',
      roles: [],
    };
    h.users.rows.push(regularUser, collidingUser, conflictingDemoEmail);

    const first = await h.service.seed();
    expect(first).toMatchObject({
      mentorsCreated: DEMO_MENTORS.length - 1,
      menteesCreated: DEMO_MENTEES.length,
      skipped: 1,
    });

    expect(h.users.rows).toContainEqual(regularUser);
    expect(h.users.rows).toContainEqual(collidingUser);
    expect(h.users.rows).toContainEqual(conflictingDemoEmail);
    expect(
      h.mentors.rows.some(
        (profile) => profile.walletAddress === collidingWallet,
      ),
    ).toBe(false);
    expect(
      h.mentors.rows.some(
        (profile) =>
          profile.walletAddress === conflictingDemoEmail.walletAddress,
      ),
    ).toBe(false);
    expect(
      h.users.rows.some((user) => user.username === DEMO_MENTORS[0].username),
    ).toBe(false);
    expect(
      h.users.rows.some(
        (user) => user.walletAddress === normalizeWalletAddress(h.wallets[1]),
      ),
    ).toBe(true);

    const demoUser = h.users.rows.find(
      (user) => user.email === DEMO_MENTORS[1].email,
    );
    if (!demoUser) throw new Error('expected demo mentor to exist');
    demoUser.roles.push({ name: 'admin' });
    h.users.rows[0].displayName = 'Changed By Owner';

    const second = await h.service.seed();
    expect(second).toMatchObject({
      mentorsCreated: 0,
      menteesCreated: 0,
      skipped: 1,
    });
    const reloadedDemoUser = h.users.rows.find(
      (user) => user.email === DEMO_MENTORS[1].email,
    );
    expect(reloadedDemoUser?.roles).toHaveLength(2);
    expect(h.users.rows[0].displayName).toBe('Changed By Owner');
    expect(h.users.rows).toHaveLength(
      DEMO_MENTORS.length - 1 + DEMO_MENTEES.length + 3,
    );
    expect(h.mentors.rows).toHaveLength(DEMO_MENTORS.length - 1);
    expect(h.slots.rows).toHaveLength((DEMO_MENTORS.length - 1) * 2);
  });

  it('preserves mentor availability slots added by a user', async () => {
    const h = createHarness();
    await h.service.seed();

    const firstMentor = h.users.rows.find(
      (user) => user.email === DEMO_MENTORS[0].email,
    );
    if (!firstMentor) throw new Error('expected demo mentor to exist');
    h.slots.rows.push({
      id: 'user-created-slot',
      mentorId: firstMentor.walletAddress,
      dayOfWeek: 6,
      startTimeUtc: '10:00',
      endTimeUtc: '12:00',
      timezone: 'UTC',
    });

    await h.service.seed();

    expect(
      h.slots.rows.filter(
        (slot) => slot.mentorId === firstMentor.walletAddress,
      ),
    ).toHaveLength(3);
    expect(h.slots.rows.some((slot) => slot.id === 'user-created-slot')).toBe(
      true,
    );
  });
});
