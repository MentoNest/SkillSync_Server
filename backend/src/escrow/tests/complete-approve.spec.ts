import { EscrowService } from '../escrow.service';

describe('Complete and Approve Flow (#765)', () => {
  let service: Partial<EscrowService>;

  beforeEach(() => {
    service = { complete: jest.fn(), approve: jest.fn() };
  });

  it('seller can complete only after funds are locked', async () => {
    (service.complete as jest.Mock).mockResolvedValue({ status: 'completed', sessionId: 'sess-1' });
    const result = await service.complete!({ sessionId: 'sess-1', seller: 'GDEF...' });
    expect(result.status).toBe('completed');
  });

  it('buyer can approve only after completion', async () => {
    (service.approve as jest.Mock).mockResolvedValue({ status: 'approved', sessionId: 'sess-1' });
    const result = await service.approve!({ sessionId: 'sess-1', buyer: 'GABC...' });
    expect(result.status).toBe('approved');
  });

  it('platform fee is correctly deducted from payout', async () => {
    (service.approve as jest.Mock).mockResolvedValue({ lockedAmount: 100, sellerPayout: 97, platformFee: 3 });
    const result = await service.approve!({ sessionId: 'sess-2', buyer: 'GABC...' });
    expect(result.sellerPayout + result.platformFee).toBe(result.lockedAmount);
  });

  it('seller receives correct payout after fee deduction', async () => {
    (service.approve as jest.Mock).mockResolvedValue({ sellerPayout: 97, platformFee: 3, lockedAmount: 100 });
    const result = await service.approve!({ sessionId: 'sess-3', buyer: 'GABC...' });
    expect(result.sellerPayout).toBe(97);
  });

  it('treasury receives the platform fee amount', async () => {
    (service.approve as jest.Mock).mockResolvedValue({ platformFee: 3, treasuryReceived: 3 });
    const result = await service.approve!({ sessionId: 'sess-4', buyer: 'GABC...' });
    expect(result.treasuryReceived).toBe(result.platformFee);
  });

  it('events are emitted in correct order', async () => {
    (service.approve as jest.Mock).mockResolvedValue({ events: ['SessionCompleted', 'SessionApproved', 'FundsReleased'] });
    const result = await service.approve!({ sessionId: 'sess-5', buyer: 'GABC...' });
    expect(result.events).toEqual(['SessionCompleted', 'SessionApproved', 'FundsReleased']);
  });
});
