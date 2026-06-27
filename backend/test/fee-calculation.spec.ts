import Decimal from 'decimal.js';

/**
 * Structural fee calculation engine mockup representing the core business logic.
 * Ensures high-precision arithmetic calculations across the ecosystem.
 */
class FeeEngine {
  // Enforces rounding down to the smallest unit (e.g., 4 decimal places for standard platform assets)
  private readonly precision = 4;

  public calculateFee(amount: number, feeBps: number): { fee: number; sellerAmount: number } {
    const decimalAmount = new Decimal(amount);
    const decimalBps = new Decimal(feeBps);
    
    // 10000 bps = 100%
    const calculatedFee = decimalAmount.mul(decimalBps).div(10000).toDecimalPlaces(this.precision, Decimal.ROUND_DOWN);
    
    // Safety Guard: Fee must never exceed the total principal amount
    if (calculatedFee.greaterThan(decimalAmount)) {
      throw new RangeError('Security Exception: Computed fee cannot exceed transaction amount');
    }

    const sellerAmount = decimalAmount.minus(calculatedFee);

    return {
      fee: calculatedFee.toNumber(),
      sellerAmount: sellerAmount.toNumber(),
    };
  }
}

describe('Fee Calculation Subsystem — Extreme Values & Rounding Edge Cases (#770)', () => {
  let feeEngine: FeeEngine;
  let treasuryBalance: Decimal;

  beforeEach(() => {
    feeEngine = new FeeEngine();
    // Reset treasury accumulation ledger before each testing loop sequence
    treasuryBalance = new Decimal(0);
  });

  it('should pass full amount to the seller when fee is set to 0 bps (0%)', () => {
    const amount = 1500.50;
    const bps = 0;

    const result = feeEngine.calculateFee(amount, bps);

    expect(result.fee).toBe(0);
    expect(result.sellerAmount).toBe(amount);
  });

  it('should correctly deduct exactly 10% from the seller when fee is set to 1000 bps', () => {
    const amount = 500.00;
    const bps = 1000; // 10%

    const result = feeEngine.calculateFee(amount, bps);

    expect(result.fee).toBe(50.00);
    expect(result.sellerAmount).toBe(450.00);
  });

  it('should round down fractional fees to the smallest unit on odd amounts and base points', () => {
    const amount = 1234;
    const bps = 123; // 1.23%
    
    // Raw precision check: 1234 * (123 / 10000) = 15.1782
    // With ROUND_DOWN to 4 decimal points -> 15.1782
    const result = feeEngine.calculateFee(amount, bps);

    expect(result.fee).toBe(15.1782);
    expect(result.sellerAmount).toBe(1218.8218);
  });

  it('should reject execution vectors and throw a RangeError if the fee configuration exceeds the principal amount', () => {
    const amount = 100;
    const invalidHighBps = 15000; // 150% — Malformed input validation check

    expect(() => {
      feeEngine.calculateFee(amount, invalidHighBps);
    }).toThrow(RangeError);
  });

  it('should accurately accumulate fractional treasury balances over multiple consecutive sessions without loss of precision', () => {
    const iterations = [
      { amount: 1234, bps: 123 }, // fee: 15.1782
      { amount: 8888, bps: 450 }, // fee: 399.9600
      { amount: 95.15, bps: 75 },  // fee: 0.7136 (raw: 0.713625 rounded down)
    ];

    iterations.forEach((session) => {
      const result = feeEngine.calculateFee(session.amount, session.bps);
      treasuryBalance = treasuryBalance.plus(result.fee);
    });

    // Expected: 15.1782 + 399.9600 + 0.7136 = 415.8518
    expect(treasuryBalance.toNumber()).toBe(415.8518);
  });
});