# Contract error codes

`ContractError` (`contract/src/lib.rs`) is the single error enum used across
the SkillSync Soroban contract. Every variant has a unique numeric code in
the range 0-255. Codes are grouped into reserved ranges by category:

| Range   | Category                  |
|---------|----------------------------|
| 0-99    | General / uncategorized    |
| 100-199 | Initialization errors      |
| 200-299 | Authorization errors       |
| 300-399 | Session validation errors  |

## General (0-99)

| Code | Variant                | Meaning                                   |
|------|-------------------------|--------------------------------------------|
| 6    | `AmountMustBePositive`  | Session amount must be greater than zero. |
| 7    | `InvalidStatus`         | Operation not valid for current status.   |
| 8    | `SharesMismatch`        | Buyer/seller shares don't sum to amount.  |
| 9    | `TransferFailed`        | Token transfer failed.                    |
| 10   | `FeeExceedsAmount`      | Platform fee exceeds the session amount.  |
| 11   | `FeeTooHigh`            | Requested platform fee exceeds the cap.   |
| 12   | `AlreadyArchived`       | Session has already been archived.        |
| 13   | `NotArchived`           | Session has not been archived.            |

## Initialization (100-199)

| Code | Variant              | Meaning                              |
|------|-----------------------|----------------------------------------|
| 100  | `AlreadyInitialized` | Contract already initialized.         |
| 101  | `NotInitialized`     | Contract not initialized yet.         |

## Authorization (200-299)

| Code | Variant        | Meaning                          |
|------|-----------------|-----------------------------------|
| 200  | `Unauthorized` | Generic unauthorized access.      |

## Session validation (300-399)

| Code | Variant                | Meaning                          |
|------|--------------------------|-------------------------------------|
| 300  | `SessionNotFound`      | Session ID does not exist.        |
| 301  | `SessionAlreadyExists` | Session ID already exists.        |
