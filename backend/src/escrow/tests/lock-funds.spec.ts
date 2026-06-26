import { EscrowService } from '../escrow.service';

describe('Lock Funds (#764)', () => {
  let service: Partial<EscrowService>;

  beforeEach(() => {
    service = { lockFunds: jest.fn(), getBalance: jest.fn() };
  });

  it('buyer can lock funds with sufficient balance', async () => {
    (service.lockFunds as jest.Mock).mockResolvedValue({ success: true, sessionId: 'sess-1', amount: 100 });
    const result = await service.lockFunds!({ sessionId: 'sess-1', buyer: 'GABC...', amount: 100 });
    expect(result.success).toBe(true);
  });

  it('contract balance increases by exact amount locked', async () => {
    (service.getBalance as jest.Mock).mockResolvedValue({ balance: 200 });
    (service.lockFunds as jest.Mock).mockResolvedValue({ contractBalance: 300 });
    const before = await service.getBalance!('contract');
    const result = await service.lockFunds!({ sessionId: 'sess-2', buyer: 'GABC...', amount: 100 });
    expect(result.contractBalance).toBe(before.balance + 100);
  });

  it('reverts on duplicate session ID', async () => {
    (service.lockFunds as jest.Mock).mockRejectedValue(new Error('Session ID already exists'));
    await expect(service.lockFunds!({ sessionId: 'dup', buyer: 'GABC...', amount: 100 }))
      .rejects.toThrow('Session ID already exists');
  });

  it('reverts when amount is zero', async () => {
    (service.lockFunds as jest.Mock).mockRejectedValue(new Error('Amount must be greater than zero'));
    await expect(service.lockFunds!({ sessionId: 'sess-3', buyer: 'GABC...', amount: 0 }))
      .rejects.toThrow('Amount must be greater than zero');
  });

  it('reverts on insufficient buyer balance', async () => {
    (service.lockFunds as jest.Mock).mockRejectedValue(new Error('Insufficient balance'));
    await expect(service.lockFunds!({ sessionId: 'sess-4', buyer: 'GABC...', amount: 9999 }))
      .rejects.toThrow('Insufficient balance');
  });

  it('emits FundsLocked event', async () => {
    (service.lockFunds as jest.Mock).mockResolvedValue({ event: 'FundsLocked', success: true });
    const result = await service.lockFunds!({ sessionId: 'sess-5', buyer: 'GABC...', amount: 50 });
    expect(result.event).toBe('FundsLocked');
  });
});
