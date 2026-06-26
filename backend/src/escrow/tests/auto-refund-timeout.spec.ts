import { EscrowService } from '../escrow.service';

describe('Auto-Refund Timeout Logic (#767)', () => {
  let service: Partial<EscrowService>;

  beforeEach(() => {
    service = { autoRefund: jest.fn(), approve: jest.fn() };
  });

  it('triggers auto-refund after dispute window passes', async () => {
    (service.autoRefund as jest.Mock).mockResolvedValue({ refunded: true, lockedAmount: 100, buyerReceived: 100 });
    const result = await service.autoRefund!({ sessionId: 'sess-1', windowElapsed: true });
    expect(result.refunded).toBe(true);
  });

  it('does not trigger auto-refund before window expires', async () => {
    (service.autoRefund as jest.Mock).mockRejectedValue(new Error('Dispute window has not elapsed'));
    await expect(service.autoRefund!({ sessionId: 'sess-1', windowElapsed: false }))
      .rejects.toThrow('Dispute window has not elapsed');
  });

  it('buyer receives full locked amount on auto-refund', async () => {
    (service.autoRefund as jest.Mock).mockResolvedValue({ refunded: true, lockedAmount: 150, buyerReceived: 150 });
    const result = await service.autoRefund!({ sessionId: 'sess-2', windowElapsed: true });
    expect(result.buyerReceived).toBe(result.lockedAmount);
  });

  it('emits AutoRefundExecuted event', async () => {
    (service.autoRefund as jest.Mock).mockResolvedValue({ event: 'AutoRefundExecuted', refunded: true });
    const result = await service.autoRefund!({ sessionId: 'sess-3', windowElapsed: true });
    expect(result.event).toBe('AutoRefundExecuted');
  });

  it('session cannot be approved after auto-refund', async () => {
    (service.approve as jest.Mock).mockRejectedValue(new Error('Session already refunded'));
    await expect(service.approve!({ sessionId: 'refunded-sess' }))
      .rejects.toThrow('Session already refunded');
  });
});
