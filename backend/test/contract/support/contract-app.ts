import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AdminController } from '../../../src/admin/admin.controller';
import { AdminService } from '../../../src/admin/admin.service';
import { AppController } from '../../../src/app.controller';
import { AppService } from '../../../src/app.service';
import { AuthController } from '../../../src/auth/auth.controller';
import { AuthService } from '../../../src/auth/auth.service';
import { AuthUser, Role } from '../../../src/auth/auth.types';
import { JwtAuthGuard } from '../../../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../src/auth/guards/roles.guard';
import { WalletAuthGuard } from '../../../src/auth/guards/wallet-auth.guard';
import { AllExceptionsFilter } from '../../../src/common/filters/all-exceptions.filter';
import { createValidationPipe } from '../../../src/common/filters/validation';
import { AvailabilityController } from '../../../src/availability/availability.controller';
import { AvailabilityService } from '../../../src/availability/availability.service';
import { SkillLevel } from '../../../src/profile/mentee-profile.entity';
import { ProfileController } from '../../../src/profile/profile.controller';
import { ProfileService } from '../../../src/profile/profile.service';
import { ProfileUpdateRateLimitGuard } from '../../../src/profile/profile-update-rate-limit.guard';
import { ProfileHistoryController } from '../../../src/profile-history/profile-history.controller';
import { ProfileHistoryService } from '../../../src/profile-history/profile-history.service';
import { RedisHealthController } from '../../../src/redis/redis.health.controller';
import { RedisService } from '../../../src/redis/redis.service';
import { AvatarService } from '../../../src/user/avatar.service';
import { PortfolioLinksController } from '../../../src/user/portfolio-links.controller';
import { PortfolioLinksService } from '../../../src/user/portfolio-links.service';
import { PortfolioPlatform } from '../../../src/user/portfolio-link.entity';
import { UserStatus } from '../../../src/user/user-status.enum';
import { UserController } from '../../../src/user/user.controller';
import { UserService } from '../../../src/user/user.service';

const ADDRESS = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';
const NOW = '2026-11-22T10:00:00.000Z';

/** The authenticated principal injected by the permissive guard stubs below. */
export const TEST_USER: AuthUser = {
  address: ADDRESS,
  roles: [Role.USER, Role.MENTOR, Role.MENTEE, Role.ADMIN],
  status: UserStatus.ACTIVE,
  jti: 'contract-test-jti',
};

/** A syntactically valid JWT triple (not verified, only shape-checked by `@IsJWT`). */
export const FAKE_JWT =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjb250cmFjdCJ9.c2lnbmF0dXJl';

const userResponse = {
  walletAddress: ADDRESS,
  email: 'alice@example.com',
  username: 'alice_dev',
  displayName: 'Alice the Developer',
  status: UserStatus.ACTIVE,
  avatarUrl: null,
  avatarThumbnailUrl: null,
  timezone: 'UTC',
  locale: 'en',
  lastLoginAt: new Date(NOW),
  createdAt: new Date(NOW),
  updatedAt: new Date(NOW),
  isVerified: false,
  verifiedAt: null,
  verifiedBadge: null,
};

const userEntity = {
  ...userResponse,
  usernameChangedAt: null,
  deletedAt: null,
};

const mentorProfileEntity = {
  id: '11111111-1111-4111-8111-111111111111',
  walletAddress: ADDRESS,
  bio: 'Senior engineer with 10 years in distributed systems.',
  skills: ['TypeScript', 'NestJS'],
  hourlyRateUsdCents: 5000,
  maxMentees: 3,
  languages: ['English'],
  isActive: true,
  isVerified: false,
  averageRating: 0,
  version: 1,
  createdAt: new Date(NOW),
  updatedAt: new Date(NOW),
};

const menteeProfileEntity = {
  id: '66666666-6666-4666-8666-666666666666',
  walletAddress: ADDRESS,
  learningGoals: ['Master distributed systems'],
  interests: ['System Design', 'NestJS'],
  budgetUsdCentsPerMonth: 10000,
  experienceLevel: SkillLevel.INTERMEDIATE,
  preferredMentoringStyle: ['technical skills', 'career advice'],
  timeCommitmentHoursPerWeek: 5,
  professionalBackground: 'Backend developer with 3 years of experience.',
  jobTitle: 'Backend Developer',
  industry: 'FinTech',
  portfolioLinks: ['https://github.com/alice'],
  languages: ['English'],
  isActive: true,
  createdAt: new Date(NOW),
  updatedAt: new Date(NOW),
  version: 1,
};

const availabilitySlotEntity = {
  id: '22222222-2222-4222-8222-222222222222',
  mentorId: ADDRESS,
  dayOfWeek: 1,
  startTimeUtc: '10:00',
  endTimeUtc: '12:00',
  timezone: 'UTC',
  createdAt: new Date(NOW),
  updatedAt: new Date(NOW),
};

const availabilityExceptionEntity = {
  id: '33333333-3333-4333-8333-333333333333',
  mentorId: ADDRESS,
  date: '2026-12-25',
  startTimeUtc: '00:00',
  endTimeUtc: '23:59',
  reason: 'Holiday',
  isUnavailable: true,
  createdAt: new Date(NOW),
  updatedAt: new Date(NOW),
};

const portfolioLinkResponse = {
  id: '44444444-4444-4444-8444-444444444444',
  platform: PortfolioPlatform.GITHUB,
  url: 'https://github.com/alice',
  displayTitle: 'My GitHub',
  createdAt: new Date(NOW),
};

const historyEntryEntity = {
  id: '55555555-5555-4555-8555-555555555555',
  userId: ADDRESS,
  profileType: 'user',
  fieldName: 'username',
  oldValue: null,
  newValue: 'alice_dev',
  changedBy: ADDRESS,
  changeReason: 'user_edit',
  changedAt: new Date(NOW),
  retainUntil: new Date('2027-11-22T10:00:00.000Z'),
};

/**
 * A guard stub that both authenticates (sets `req.user`) and authorizes everything, so
 * contract tests can exercise protected controllers without real tokens or a database.
 */
const permissiveAuthGuard = {
  canActivate: (context: {
    switchToHttp: () => { getRequest: () => { user?: AuthUser } };
  }) => {
    context.switchToHttp().getRequest().user = TEST_USER;
    return true;
  },
};

const permissiveRolesGuard = { canActivate: () => true };

const appService = { getHello: () => 'Hello World!' };

const authService = {
  createNonce: async (address: string) => ({
    nonce: 'a3f8c2e1b74d9056a3f8c2e1b74d9056',
    message: `SkillSync login\nAddress: ${address}\nNonce: a3f8c2e1b74d9056a3f8c2e1b74d9056`,
    expiresIn: 300,
  }),
  createNonceWithExpiry: async () => ({
    nonce: 'a3f8c2e1b74d9056a3f8c2e1b74d9056a3f8c2e1b74d9056a3f8c2e1b74d9056',
    expiresAt: NOW,
  }),
  issueForUser: async () => ({
    accessToken: FAKE_JWT,
    refreshToken: FAKE_JWT,
    expiresIn: 900,
  }),
  refresh: async () => ({
    accessToken: FAKE_JWT,
    refreshToken: FAKE_JWT,
    expiresIn: 900,
  }),
  logout: async () => undefined,
  revokeAllSessions: async () => 1,
  adminRevokeAllSessions: async () => 1,
};

const userService = {
  findMe: async () => userResponse,
  updateMe: async () => userResponse,
  removeMe: async () => undefined,
  setStatus: async (_wallet: string, status: UserStatus) => ({
    ...userResponse,
    status,
  }),
  findAll: async () => ({ data: [userResponse], page: 1, limit: 20, total: 1 }),
  checkAvailability: async (username: string) => ({
    username,
    available: true,
  }),
  setUsername: async () => userEntity,
  setDisplayName: async () => userEntity,
  getPublicProfile: async () => ({
    walletAddress: ADDRESS,
    username: 'alice_dev',
    displayName: 'Alice the Developer',
    createdAt: NOW,
    avatarUrl: null,
    avatarThumbnailUrl: null,
    portfolioLinks: [portfolioLinkResponse],
    isFeatured: false,
    featuredBadge: null,
    isVerified: false,
    verifiedAt: null,
    verifiedBadge: null,
  }),
};

const avatarService = {
  uploadAvatar: async () => ({
    avatarUrl: '/uploads/avatars/test-original.png',
    avatarThumbnailUrl: '/uploads/avatars/test-thumbnail.png',
    avatarSmallUrl: '/uploads/avatars/test-small.png',
    avatarMediumUrl: '/uploads/avatars/test-medium.png',
  }),
};

const portfolioLinksService = {
  create: async (
    _address: string,
    dto: {
      url: string;
      platform?: PortfolioPlatform;
      displayTitle?: string | null;
    },
  ) => ({
    ...portfolioLinkResponse,
    url: dto.url,
    platform: dto.platform ?? PortfolioPlatform.GITHUB,
    displayTitle: dto.displayTitle ?? null,
  }),
  remove: async () => undefined,
};

const profileService = {
  createProfile: async (_address: string, dto: { profileType: string }) => ({
    profileType: dto.profileType,
    profile:
      dto.profileType === 'mentee' ? menteeProfileEntity : mentorProfileEntity,
  }),
  updateProfile: async (type: string) => ({
    profileType: type,
    profile: type === 'mentee' ? menteeProfileEntity : mentorProfileEntity,
  }),
  getMenteeProfile: async () => ({
    profile: menteeProfileEntity,
    completionPercentage: 100,
    missingFields: [],
  }),
  createMenteeProfileForRole: async () => ({
    profile: menteeProfileEntity,
    completionPercentage: 100,
    missingFields: [],
  }),
  updateMenteeProfileForRole: async () => ({
    profile: menteeProfileEntity,
    completionPercentage: 100,
    missingFields: [],
  }),
  deleteMenteeProfile: async () => undefined,
};

const availabilityService = {
  listSlots: async () => [availabilitySlotEntity],
  createSlot: async () => availabilitySlotEntity,
  updateSlot: async () => availabilitySlotEntity,
  deleteSlot: async () => undefined,
  listExceptions: async () => [availabilityExceptionEntity],
  createException: async () => availabilityExceptionEntity,
  updateException: async () => availabilityExceptionEntity,
  deleteException: async () => undefined,
  isAvailable: async (mentorId: string, dateTime: string) => ({
    mentorId,
    timezone: 'UTC',
    dateTime,
    available: true,
  }),
  getNext30DaysAvailability: async (mentorId: string) => ({
    mentorId,
    timezone: 'UTC',
    windows: [
      {
        startUtc: '2026-11-23T10:00:00.000Z',
        endUtc: '2026-11-23T12:00:00.000Z',
        displayStart: '11/23/2026, 10:00 GMT+0',
        displayEnd: '11/23/2026, 12:00 GMT+0',
        timezone: 'UTC',
        slotId: availabilitySlotEntity.id,
      },
    ],
  }),
};

const profileHistoryService = {
  getHistoryForUser: async () => ({ entries: [historyEntryEntity], total: 1 }),
};

const adminService = {
  listUsers: async () => ({
    data: [userEntity],
    meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
  }),
  listSuspendedUsers: async () => ({
    data: [],
    meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
  }),
  getUser: async () => userEntity,
  suspendUser: async () => ({
    ...userResponse,
    status: UserStatus.SUSPENDED,
    suspension: {
      id: '33333333-3333-4333-8333-333333333333',
      walletAddress: ADDRESS.toLowerCase(),
      reason: 'Violation of terms',
      suspendedBy: ADDRESS.toLowerCase(),
      suspendedAt: NOW,
      suspendedUntil: NOW,
      isActive: true,
      liftedAt: null,
      liftedBy: null,
    },
  }),
  unsuspendUser: async () => ({
    ...userResponse,
    status: UserStatus.ACTIVE,
    liftedAt: new Date(NOW),
  }),
  deleteUser: async () => ({ deleted: true }),
  restoreUser: async () => userResponse,
  assignRole: async () => ({
    walletAddress: ADDRESS.toLowerCase(),
    role: Role.MENTOR,
  }),
  listSessions: async () => ({
    data: [],
    meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
  }),
  getSession: async () => ({}),
  cancelSession: async () => ({}),
  resolveDispute: async () => ({}),
  listReports: async () => ({
    data: [],
    meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
  }),
  getReport: async () => ({}),
  resolveReport: async () => ({}),
  takeReportAction: async () => ({}),
  softDeleteReport: async () => ({ deleted: true }),
  restoreReport: async () => ({}),
  analytics: async () => ({}),
  userGrowth: async () => ({}),
  sessionStats: async () => ({}),
  revenue: () => ({
    available: false,
    amount: 0,
    currency: 'USD',
    message: '',
  }),
  systemHealth: async () => ({ status: 'ok' }),
  auditLogs: async () => ({
    data: [],
    meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
  }),
};

const redisService = { ping: async () => 1 };

/**
 * Boots the full HTTP surface with all controllers wired to in-memory service stubs and
 * permissive guards. This is the single app used both to generate the OpenAPI document
 * and to run the response contract tests, guaranteeing the two never drift.
 */
export async function createContractApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [
      AppController,
      AuthController,
      UserController,
      PortfolioLinksController,
      ProfileController,
      AvailabilityController,
      ProfileHistoryController,
      AdminController,
      RedisHealthController,
    ],
    providers: [
      { provide: AppService, useValue: appService },
      { provide: AuthService, useValue: authService },
      { provide: UserService, useValue: userService },
      { provide: AvatarService, useValue: avatarService },
      { provide: PortfolioLinksService, useValue: portfolioLinksService },
      { provide: ProfileService, useValue: profileService },
      { provide: AvailabilityService, useValue: availabilityService },
      { provide: ProfileHistoryService, useValue: profileHistoryService },
      { provide: AdminService, useValue: adminService },
      { provide: RedisService, useValue: redisService },
    ],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue(permissiveAuthGuard)
    .overrideGuard(WalletAuthGuard)
    .useValue(permissiveAuthGuard)
    .overrideGuard(RolesGuard)
    .useValue(permissiveRolesGuard)
    .overrideGuard(ProfileUpdateRateLimitGuard)
    .useValue(permissiveRolesGuard)
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter(true));
  await app.init();
  return app;
}
