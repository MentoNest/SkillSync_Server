import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { SendService } from './providers/send.service';
import { FeeService, UserTier } from './providers/fee.service';
import { PinService } from './providers/pin.service';
import { TransfersService } from './providers/transfers.service';
import { UserService } from '../user/providers/user.service';
import { UserRole } from '../../common/enums/user-role.enum';

const mockUser = (overrides = {}) => ({
  id: 'user-1',
  username: 'alice',
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'Smith',
  role: UserRole.MENTEE,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  wallets: [],
  pinHash: '$2b$10$hashedpin',
  ...overrides,
});

const mockRecipient = mockUser({ id: 'user-2', username: 'bob', pinHash: undefined });

describe('SendService', () => {
  let service: SendService;
  let userService: jest.Mocked<UserService>;
  let pinService: jest.Mocked<PinService>;
  let transfersService: jest.Mocked<TransfersService>;
  let feeService: FeeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SendService,
        FeeService,
        {
          provide: UserService,
          useValue: {
            findById: jest.fn(),
            findByUsername: jest.fn(),
          },
        },
        {
          provide: PinService,
          useValue: { verifyPin: jest.fn() },
        },
        {
          provide: TransfersService,
          useValue: {
            create: jest.fn(),
            getDailyUsed: jest.fn().mockResolvedValue(0),
          },
        },
      ],
    }).compile();

    service = module.get(SendService);
    feeService = module.get(FeeService);
    userService = module.get(UserService);
    pinService = module.get(PinService);
    transfersService = module.get(TransfersService);
  });

  describe('preview', () => {
    it('returns correct fee calculation for BASIC tier', async () => {
      userService.findById.mockResolvedValue(mockUser() as any);
      userService.findByUsername.mockResolvedValue(mockRecipient as any);

      const result = await service.preview('user-1', 'bob', 100);

      expect(result.amountUsdc).toBe(100);
      expect(result.feeUsdc).toBeCloseTo(2); // 2% of 100
      expect(result.netAmountUsdc).toBeCloseTo(98);
      expect(result.estimatedNgn).toBeCloseTo(98 * 1600);
      expect(result.recipient.username).toBe('bob');
    });

    it('throws 404 when recipient not found', async () => {
      userService.findById.mockResolvedValue(mockUser() as any);
      userService.findByUsername.mockResolvedValue(null);

      await expect(service.preview('user-1', 'ghost', 100)).rejects.toThrow(NotFoundException);
    });

    it('throws 400 when tier daily limit exceeded', async () => {
      userService.findById.mockResolvedValue(mockUser() as any);
      userService.findByUsername.mockResolvedValue(mockRecipient as any);
      transfersService.getDailyUsed.mockResolvedValue(490); // BASIC limit = 500

      await expect(service.preview('user-1', 'bob', 20)).rejects.toThrow(BadRequestException);
    });

    it('does not create a transfer record', async () => {
      userService.findById.mockResolvedValue(mockUser() as any);
      userService.findByUsername.mockResolvedValue(mockRecipient as any);

      await service.preview('user-1', 'bob', 50);

      expect(transfersService.create).not.toHaveBeenCalled();
    });
  });

  describe('confirm', () => {
    it('verifies PIN before creating transfer', async () => {
      userService.findById.mockResolvedValue(mockUser() as any);
      userService.findByUsername.mockResolvedValue(mockRecipient as any);
      pinService.verifyPin.mockResolvedValue(undefined);
      transfersService.create.mockResolvedValue({ id: 'tx-1' } as any);

      await service.confirm('user-1', 'bob', 100, '1234');

      expect(pinService.verifyPin).toHaveBeenCalledWith('1234', mockUser().pinHash);
      expect(transfersService.create).toHaveBeenCalled();
    });

    it('throws 401 on wrong PIN', async () => {
      userService.findById.mockResolvedValue(mockUser() as any);
      pinService.verifyPin.mockRejectedValue(new UnauthorizedException('Invalid PIN'));

      await expect(service.confirm('user-1', 'bob', 100, 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(transfersService.create).not.toHaveBeenCalled();
    });

    it('throws 404 when recipient not found', async () => {
      userService.findById.mockResolvedValue(mockUser() as any);
      pinService.verifyPin.mockResolvedValue(undefined);
      userService.findByUsername.mockResolvedValue(null);

      await expect(service.confirm('user-1', 'ghost', 100, '1234')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws 400 when tier limit exceeded at confirm time', async () => {
      userService.findById.mockResolvedValue(mockUser() as any);
      pinService.verifyPin.mockResolvedValue(undefined);
      userService.findByUsername.mockResolvedValue(mockRecipient as any);
      transfersService.getDailyUsed.mockResolvedValue(499);

      await expect(service.confirm('user-1', 'bob', 10, '1234')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getRecipient', () => {
    it('returns PublicProfileDto for existing username', async () => {
      userService.findByUsername.mockResolvedValue(mockRecipient as any);

      const result = await service.getRecipient('bob');

      expect(result.username).toBe('bob');
    });

    it('throws 404 for unknown username', async () => {
      userService.findByUsername.mockResolvedValue(null);

      await expect(service.getRecipient('nobody')).rejects.toThrow(NotFoundException);
    });
  });

  describe('FeeService', () => {
    it('computes fee correctly for each tier', () => {
      expect(feeService.computeFee(100, UserTier.BASIC).feeUsdc).toBeCloseTo(2);
      expect(feeService.computeFee(100, UserTier.STANDARD).feeUsdc).toBeCloseTo(1.5);
      expect(feeService.computeFee(100, UserTier.PREMIUM).feeUsdc).toBeCloseTo(1);
    });
  });
});
