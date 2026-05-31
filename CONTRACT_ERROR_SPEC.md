# SkillSync Contract Error Codes Spec

This document defines the standard error codes used by the SkillSync smart contracts. Each error code is a unique numeric value between 0 and 255.

## Error Code Mapping

| Code | Name | Description |
|------|------|-------------|
| 1 | `InternalError` | Internal contract error |
| 2 | `AlreadyInitialized` | Contract already initialized |
| 3 | `Unauthorized` | Caller is not authorized |
| 4 | `Forbidden` | Operation is forbidden |
| 5 | `NotFound` | Resource not found |
| 6 | `BadRequest` | Invalid request parameters |
| 7 | `Conflict` | Resource state conflict |
| 8 | `Timeout` | Operation timed out |
| 9 | `RateLimitExceeded` | Rate limit exceeded |
| 10 | `ValidationError` | Validation failed |
| 11 | `SuspiciousActivity` | Suspicious activity detected |
| 12 | `AccountLocked` | Account is locked |
| 13 | `TokenExpired` | Token has expired |
| 14 | `TokenRevoked` | Token has been revoked |
| 15 | `InvalidToken` | Token is invalid |
| 400 | `InvalidAmount` | Amount is zero or negative |
| 401 | `InsufficientBalance` | Insufficient funds for operation |
| 402 | `FeeTooHigh` | Fee exceeds maximum (1000 bps) |
| 403 | `InvalidSplit` | Dispute split does not sum to amount |
| 404 | `Overflow` | Arithmetic overflow occurred |
| 24 | `InvalidAsset` | Asset is not supported |
| 31 | `MentorNotFound` | Mentor profile not found |
| 32 | `MenteeNotFound` | Mentee profile not found |
| 33 | `SessionNotFound` | Mentoring session not found |
| 34 | `InvalidSessionStatus` | Invalid session status for operation |
| 35 | `MaxLimitReached` | Maximum limit reached |

## Implementation Details

The error enum is implemented in Rust using the `soroban_sdk` with the `#[contracterror]` attribute.

```rust
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    // ...
}
```

Each variant is explicitly assigned a `u32` value that corresponds to the numeric code.
