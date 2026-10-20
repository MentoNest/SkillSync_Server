# Contract error codes

`ContractError` (`contract/src/errors.rs`) is the error enum every entry point
of `skillsync-escrow` returns. Because `#[contracterror]` derives
`Into<soroban_sdk::Error>`, a failing call surfaces its numeric code on-chain as
`ScError::Contract(code)`, which is what clients, indexers and the backend see.

The numeric codes are part of the public ABI:

- every code is unique and fits in a `u8` (0–255);
- a code is never renumbered or reused for a different meaning — add a new
  variant in the matching band instead.

## Bands

| Range     | Purpose                      |
|-----------|------------------------------|
| 100 – 119 | initialization               |
| 120 – 139 | authorization                |
| 140 – 159 | input validation             |
| 160 – 179 | session state                |
| 180 – 199 | configuration and arithmetic |

## Codes

| Code | Variant               | Meaning                                                                 | Returned by                                                     |
|------|-----------------------|-------------------------------------------------------------------------|-----------------------------------------------------------------|
| 100  | `AlreadyInitialized`  | `initialize` has already been called; re-initialization is rejected.    | `initialize`                                                    |
| 101  | `NotInitialized`      | An admin-gated entry point ran before `initialize`.                     | `upgrade`, `set_platform_fee`, `set_treasury`, `set_dispute_window`, `get_treasury`, `set_token`, `resolve_dispute` |
| 102  | `InvalidAdmin`        | The admin address is the zero address, so it could never sign.          | `initialize`                                                    |
| 103  | `InvalidTreasury`     | The treasury address is the zero address, so fees would be unclaimable. | `initialize`                                                    |
| 120  | `Unauthorized`        | The caller is not allowed to perform the action.                        | reserved for auth helpers                                       |
| 121  | `NotAParticipant`     | Only the session's buyer or seller may do this.                         | `open_dispute`                                                  |
| 140  | `InvalidAmount`       | An amount must be greater than zero.                                    | `lock_funds`                                                    |
| 141  | `InvalidFee`          | The platform fee must be between 0 and 1000 bps.                        | `set_platform_fee`                                              |
| 142  | `InvalidWindow`       | The dispute window must be greater than zero ledgers.                   | `set_dispute_window`                                            |
| 143  | `InvalidShares`       | Dispute shares are negative or do not add up to the escrowed amount.    | `resolve_dispute`                                               |
| 144  | `InvalidResolution`   | `resolution` is unknown or does not match the shares.                   | `resolve_dispute`                                               |
| 160  | `DuplicateSessionId`  | A session with this id already exists (ids are never reused).           | `lock_funds`                                                    |
| 161  | `SessionNotFound`     | No session exists for this id.                                          | `get_session`, lifecycle and dispute entry points               |
| 162  | `InvalidStatus`       | The session is not in the status the action requires.                   | `complete_session`, `approve_session`, `refund_session`, `auto_refund`, `open_dispute`, `resolve_dispute` |
| 163  | `DisputeWindowOpen`   | The dispute window has not elapsed yet.                                 | `auto_refund`                                                   |
| 180  | `TokenNotConfigured`  | The payment token has not been configured by the admin.                 | `lock_funds` and payout paths                                   |
| 181  | `ArithmeticOverflow`  | A fee or payout calculation overflowed.                                 | fee helpers, `resolve_dispute`                                  |

Codes 0–99 and 104–119, 122–139, 145–159, 164–179 and 182–199 are reserved for
future errors in their band and must not be assigned ad hoc.

## Zero address

`initialize` rejects the all-zero account
(`GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF`) and the all-zero
contract (`CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4`) as admin
or treasury, since neither has a key behind it.
