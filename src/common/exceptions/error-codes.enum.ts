export enum ErrorCodes {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 200, // Generic unauthorized access
  NOT_ADMIN = 201, // Caller is not contract admin
  NOT_BUYER = 202, // Caller is not session buyer
  NOT_SELLER = 203, // Caller is not session seller
  INVALID_AMOUNT = 400, // Amount is zero or negative
  INSUFFICIENT_BALANCE = 401, // Buyer has insufficient funds
  FEE_TOO_HIGH = 402, // Fee exceeds maximum (1000 bps)
  INVALID_SPLIT = 403, // Dispute split does not sum to amount
  OVERFLOW = 404, // Arithmetic overflow detected
  FORBIDDEN = 'FORBIDDEN',
  BAD_REQUEST = 'BAD_REQUEST',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  CONFLICT = 'CONFLICT',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  // Security-related error codes
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_REVOKED = 'TOKEN_REVOKED',
  INVALID_TOKEN = 'INVALID_TOKEN',
}
