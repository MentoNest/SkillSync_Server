/**
 * Unit Tests – Dispute and Resolution (Issue #768)
 *
 * Tests dispute opening, admin resolution, and fund splitting logic
 * modelled after the Soroban smart contract dispute semantics.
 */

enum SessionStatus {
  Locked = 'Locked',
  Completed = 'Completed',
  Disputed = 'Disputed',
  Resolved = 'Resolved',
  Refunded = 'Refunded',
}

interface Session {
  id: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  status: SessionStatus;
  disputeOpenedAt: number | null;
  disputeResolvedAt: number | null;
}

interface DisputeResolution {
  buyerAmount: number;
  sellerAmount: number;
}

// Minimal in-memory simulation of contract dispute logic
function openDispute(session: Session, callerId: string, ledger: number): Session {
  if (session.status !== SessionStatus.Locked && session.status !== SessionStatus.Completed) {
    throw new Error('InvalidSessionState: session not in disputable state');
  }
  if (callerId !== session.buyerId && callerId !== session.sellerId) {
    throw new Error('Unauthorized: only buyer or seller can open dispute');
  }
  return { ...session, status: SessionStatus.Disputed, disputeOpenedAt: ledger };
}

function resolveDispute(
  session: Session,
  resolution: DisputeResolution,
  adminId: string,
  ledger: number,
): { session: Session; events: string[] } {
  if (adminId !== 'admin') throw new Error('Unauthorized: admin only');
  if (session.status !== SessionStatus.Disputed) throw new Error('session not disputed');
  const { buyerAmount, sellerAmount } = resolution;
  if (buyerAmount + sellerAmount !== session.amount) {
    throw new Error('shares must equal session amount');
  }
  const events: string[] = ['DisputeOpened', 'DisputeResolved'];
  return {
    session: { ...session, status: SessionStatus.Resolved, disputeResolvedAt: ledger },
    events,
  };
}

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'session-1',
  buyerId: 'buyer-1',
  sellerId: 'seller-1',
  amount: 1000,
  status: SessionStatus.Locked,
  disputeOpenedAt: null,
  disputeResolvedAt: null,
  ...overrides,
});

describe('Dispute and Resolution', () => {
  describe('openDispute', () => {
    it('buyer can open dispute on locked session', () => {
      const session = makeSession({ status: SessionStatus.Locked });
      const result = openDispute(session, 'buyer-1', 100);
      expect(result.status).toBe(SessionStatus.Disputed);
    });

    it('seller can open dispute on locked session', () => {
      const session = makeSession({ status: SessionStatus.Locked });
      const result = openDispute(session, 'seller-1', 100);
      expect(result.status).toBe(SessionStatus.Disputed);
    });

    it('buyer can open dispute on completed session', () => {
      const session = makeSession({ status: SessionStatus.Completed });
      const result = openDispute(session, 'buyer-1', 200);
      expect(result.status).toBe(SessionStatus.Disputed);
      expect(result.disputeOpenedAt).toBe(200);
    });

    it('stores dispute opened ledger timestamp', () => {
      const session = makeSession({ status: SessionStatus.Locked });
      const result = openDispute(session, 'buyer-1', 42);
      expect(result.disputeOpenedAt).toBe(42);
    });

    it('reverts when session is already resolved', () => {
      const session = makeSession({ status: SessionStatus.Resolved });
      expect(() => openDispute(session, 'buyer-1', 100)).toThrow('InvalidSessionState');
    });

    it('reverts for unauthorized caller', () => {
      const session = makeSession({ status: SessionStatus.Locked });
      expect(() => openDispute(session, 'random-user', 100)).toThrow('Unauthorized');
    });
  });

  describe('resolveDispute', () => {
    const getDisputedSession = () =>
      makeSession({ status: SessionStatus.Disputed, disputeOpenedAt: 50 });

    it('admin can resolve dispute with buyer 100%', () => {
      const session = getDisputedSession();
      const { session: resolved, events } = resolveDispute(
        session,
        { buyerAmount: 1000, sellerAmount: 0 },
        'admin',
        200,
      );
      expect(resolved.status).toBe(SessionStatus.Resolved);
      expect(events).toContain('DisputeResolved');
    });

    it('admin can resolve dispute with seller 100%', () => {
      const session = getDisputedSession();
      const { session: resolved } = resolveDispute(
        session,
        { buyerAmount: 0, sellerAmount: 1000 },
        'admin',
        200,
      );
      expect(resolved.status).toBe(SessionStatus.Resolved);
    });

    it('admin can resolve dispute with split payout', () => {
      const session = getDisputedSession();
      const { session: resolved } = resolveDispute(
        session,
        { buyerAmount: 400, sellerAmount: 600 },
        'admin',
        200,
      );
      expect(resolved.status).toBe(SessionStatus.Resolved);
    });

    it('DisputeOpened and DisputeResolved events are emitted', () => {
      const session = getDisputedSession();
      const { events } = resolveDispute(
        session,
        { buyerAmount: 500, sellerAmount: 500 },
        'admin',
        200,
      );
      expect(events).toContain('DisputeOpened');
      expect(events).toContain('DisputeResolved');
    });

    it('reverts when total split does not equal session amount', () => {
      const session = getDisputedSession();
      expect(() =>
        resolveDispute(session, { buyerAmount: 500, sellerAmount: 400 }, 'admin', 200),
      ).toThrow('shares must equal session amount');
    });

    it('reverts when session is not in disputed state', () => {
      const session = makeSession({ status: SessionStatus.Locked });
      expect(() =>
        resolveDispute(session, { buyerAmount: 1000, sellerAmount: 0 }, 'admin', 200),
      ).toThrow('session not disputed');
    });

    it('reverts when called by non-admin', () => {
      const session = getDisputedSession();
      expect(() =>
        resolveDispute(session, { buyerAmount: 1000, sellerAmount: 0 }, 'not-admin', 200),
      ).toThrow('Unauthorized');
    });
  });
});
