import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Keypair } from 'stellar-sdk';

describe('AuthService Wallet Management', () => {
    let authService: AuthService;
    let userServiceMock: any;
    let stellarNonceServiceMock: any;

    const user = {
        id: 'user-1',
        wallets: [{ address: 'G_PRIMARY', isPrimary: true, linkedAt: new Date() }],
    };

    beforeEach(() => {
        userServiceMock = {
            findByPublicKey: jest.fn(),
            findById: jest.fn(),
            linkWallet: jest.fn(),
            removeWallet: jest.fn(),
            setPrimaryWallet: jest.fn(),
        };

        stellarNonceServiceMock = {
            consume: jest.fn(),
        };

        authService = new AuthService(
            {} as any, // nonceService
            {} as any, // configService
            {} as any, // cacheService
            userServiceMock as any,
            {} as any, // mailService
            {} as any, // jwtService
            stellarNonceServiceMock as any,
            {} as any, // auditService
        );
    });

    describe('linkWallet', () => {
        it('should link a wallet successfully', async () => {
            const dto = {
                address: 'G_NEW',
                nonce: 'nonce-123',
                signature: 'sig-123',
            };

            stellarNonceServiceMock.consume.mockReturnValue(true);

            // Mock Keypair
            const verifyMock = jest.fn().mockReturnValue(true);
            jest.spyOn(Keypair, 'fromPublicKey').mockReturnValue({ verify: verifyMock } as any);

            userServiceMock.findByPublicKey.mockResolvedValue(null);
            userServiceMock.linkWallet.mockResolvedValue({ ...user, wallets: [...user.wallets, { address: 'G_NEW', isPrimary: false }] });

            const result = await authService.linkWallet('user-1', dto);

            expect(stellarNonceServiceMock.consume).toHaveBeenCalledWith('G_NEW', 'nonce-123');
            expect(verifyMock).toHaveBeenCalled();
            expect(userServiceMock.linkWallet).toHaveBeenCalledWith('user-1', 'G_NEW');
            expect(result.wallets).toHaveLength(2);
        });

        it('should throw BadRequestException for invalid nonce', async () => {
            stellarNonceServiceMock.consume.mockReturnValue(false);
            await expect(authService.linkWallet('user-1', { address: 'G_NEW', nonce: 'bad', signature: 'sig' }))
                .rejects.toThrow(BadRequestException);
        });

        it('should throw ConflictException if wallet already linked to another user', async () => {
            stellarNonceServiceMock.consume.mockReturnValue(true);
            jest.spyOn(Keypair, 'fromPublicKey').mockReturnValue({ verify: jest.fn().mockReturnValue(true) } as any);
            userServiceMock.findByPublicKey.mockResolvedValue({ id: 'user-2' });

            await expect(authService.linkWallet('user-1', { address: 'G_NEW', nonce: 'nonce', signature: 'sig' }))
                .rejects.toThrow(ConflictException);
        });
    });

    describe('removeWallet', () => {
        it('should remove a wallet successfully', async () => {
            const dto = {
                address: 'G_LINKED',
                nonce: 'nonce-123',
                signature: 'sig-123',
            };

            stellarNonceServiceMock.consume.mockReturnValue(true);
            jest.spyOn(Keypair, 'fromPublicKey').mockReturnValue({ verify: jest.fn().mockReturnValue(true) } as any);
            userServiceMock.removeWallet.mockResolvedValue(user);

            await authService.removeWallet('user-1', 'G_LINKED', dto);

            expect(userServiceMock.removeWallet).toHaveBeenCalledWith('user-1', 'G_LINKED');
        });
    });

    describe('setPrimaryWallet', () => {
        it('should set primary wallet', async () => {
            userServiceMock.setPrimaryWallet.mockResolvedValue(user);
            await authService.setPrimaryWallet('user-1', 'G_NEW');
            expect(userServiceMock.setPrimaryWallet).toHaveBeenCalledWith('user-1', 'G_NEW');
        });
    });
});
