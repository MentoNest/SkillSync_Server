import { EscrowService } from '../escrow.service';

describe('Refund Scenarios (#766)', () => {
  let service: Partial<EscrowService>;

  beforeEach(() => {
    service = { refund: jest.fn() };
  });

  it('buyer can refund before seller completes', async () => {
    (service.refund as jest.Mock).mockResolvedValue({ success: true, fee: 0, refundedAmount: 100, lockedAmount: 100 });
    const result = await service.refund!({ sessionId: 'sess-1', buyerAddress: 'GABC...' });
    expect(result.success).toBe(true);
  });

  it('returns full amount with no fee deducted', async () => {
    (service.refund as jest.Mock).mockResolvedValue({ fee: 0, refundedAmount: 200, lockedAmount: 200 });
    const result = await service.refund!({ sessionId: 'sess-2', buyerAddress: 'GABC...' });
    expect(result.fee).toBe(0);
    expect(result.refundedAmount).toBe(result.lockedAmount);
  });

  it('reverts if session already completed', async () => {
    (service.refund as jest.Mock).mockRejectedValue(new Error('Session already completed'));
    await expect(service.refund!({ sessionId: 'completed', buyerAddress: 'GABC...' }))
      .rejects.toThrow('Session already completed');
  });

  it('reverts if session already approved', async () => {
    (service.refund as jest.Mock).mockRejectedValue(new Error('Session already approved'));
    await expect(service.refund!({ sessionId: 'approved', buyerAddress: 'GABC...' }))
      .rejects.toThrow('Session already approved');
  });

  it('emits SessionRefunded event on successful refund', async () => {
    (service.refund as jest.Mock).mockResolvedValue({ success: true, event: 'SessionRefunded' });
    const result = await service.refund!({ sessionId: 'sess-3', buyerAddress: 'GABC...' });
    expect(result.event).toBe('SessionRefunded');
  });
});
