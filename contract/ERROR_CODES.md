# Contract error codes

`ContractError` (`contract/src/errors.rs`) is the error enum every entry point
of `skillsync-escrow` returns. Because `#[contracterror]` derives
`Into<soroban_sdk::Error>`, a failing call surfaces its numeric code on-chain as
`ScError::Contract(code)`, which is what clients, indexers and the backend see.

The numeric codes are part of the public ABI:

- every code is unique;
- a code is never reused for a different meaning — add a new variant in the
  matching band instead;
- renumbering an existing variant is a breaking change for every client.

## Bands

| Range     | Purpose                      |
|-----------|------------------------------|
| 100 – 119 | initialization               |
| 200 – 219 | authorization                |
| 300 – 319 | session validation           |
| 400 – 419 | financial validation         |
| 500 – 519 | timeout and dispute          |
| 600 – 619 | upgrade                      |
| 700 – 719 | configuration                |

## Codes

| Code | Variant                     | Meaning                                                                 | Returned by                                                     |
|------|-----------------------------|-------------------------------------------------------------------------|-----------------------------------------------------------------|
| 100  | `AlreadyInitialized`        | `initialize` has already been called; re-initialization is rejected.    | `initialize`                                                    |
| 101  | `NotInitialized`            | An admin-gated entry point ran before `initialize`.                     | `upgrade`, `set_platform_fee`, `set_treasury`, `set_dispute_window`, `get_treasury`, `resolve_dispute` |
| 102  | `InvalidAdmin`              | The admin address is the zero address, so it could never sign.          | `initialize`                                                    |
| 103  | `InvalidTreasury`           | The treasury address is the zero address, so fees would be unclaimable. | `initialize`                                                    |
| 200  | `Unauthorized`              | Generic unauthorized access: the caller may not perform the action.     | role guards                                                     |
| 201  | `NotAdmin`                  | The caller is not the stored contract admin.                            | role guards                                                     |
| 202  | `NotBuyer`                  | The caller is not the session's buyer.                                  | role guards                                                     |
| 203  | `NotSeller`                 | The caller is not the session's seller.                                 | role guards                                                     |
| 204  | `NotAParticipant`           | The caller is neither the session's buyer nor its seller.               | `open_dispute`                                                  |
| 300  | `SessionNotFound`           | No session exists for this id.                                          | `get_session`, lifecycle and dispute entry points               |
| 301  | `DuplicateSessionId`        | A session with this id already exists (ids are never reused).           | `lock_funds`                                                    |
| 302  | `InvalidSessionState`       | The operation is not allowed in the session's current state.            | lifecycle and dispute entry points, `validate_resolution` callers |
| 303  | `SessionAlreadyCompleted`   | The session was already completed and cannot be completed again.        | `complete_session`, `refund_session`, `resolve_dispute`, `open_dispute` |
| 304  | `SessionAlreadyApproved`    | The session was already approved and cannot be approved again.          | `approve_session`, `open_dispute`                               |
| 305  | `SessionAlreadyRefunded`    | The session was already refunded and cannot be refunded again.          | `refund_session`, `auto_refund`, `open_dispute`                 |
| 306  | `SessionInDispute`          | The session is in dispute, so no normal settlement path may touch it.   | `complete_session`, `approve_session`, `refund_session`, `auto_refund`, `open_dispute` |
| 400  | `InvalidAmount`             | An amount is zero or negative.                                          | `lock_funds`, `split_fee`                                       |
| 401  | `InsufficientBalance`       | The payer does not hold enough of the payment token.                    | `lock_funds` (checked before the transfer)                      |
| 402  | `FeeTooHigh`                | The fee exceeds the maximum of 1000 basis points (10%).                 | `set_platform_fee`, `split_fee`                                 |
| 403  | `InvalidSplit`              | Dispute shares are negative or do not add up to the session amount.     | `resolve_dispute`                                               |
| 404  | `Overflow`                  | An arithmetic operation overflowed instead of wrapping.                 | fee helpers, `resolve_dispute`                                  |
| 405  | `InvalidResolution`         | `resolution` is unknown or does not match the shares.                   | `resolve_dispute`                                               |
| 500  | `DisputeWindowOpen`         | The dispute window has not elapsed yet.                                 | `auto_refund`                                                   |
| 700  | `InvalidWindow`             | The dispute window must be greater than zero ledgers.                   | `set_dispute_window`                                            |
| 701  | `TokenNotConfigured`        | The payment token has not been configured by the admin.                 | `lock_funds` and payout paths                                   |

Codes 0–99, 104–119, 205–219, 307–319, 406–419, 501–519, 600–699 and 702–719
are reserved for future errors in their band and must not be assigned ad hoc.

## Authorization errors

Codes 200–203 belong to the ABI so a client can tell "wrong role" apart from a
plain signature failure. Entry points that know which address must have signed
authenticate with `require_auth` on that stored address (`admin.require_auth()`,
`session.buyer.require_auth()`, ...): a missing signature is rejected by the
host as an authorization failure and never reaches contract code, so those
paths cannot return a contract error code. `open_dispute` is the entry point
that receives the caller explicitly and it uses 204 when the caller is neither
party to the session.

## Session state errors

`require_status` picks the most specific code for a failed transition:

| Current status | Code returned                          |
|----------------|----------------------------------------|
| `Completed`    | 303 `SessionAlreadyCompleted`          |
| `Approved`     | 304 `SessionAlreadyApproved`           |
| `Refunded`     | 305 `SessionAlreadyRefunded`           |
| `Disputed`     | 306 `SessionInDispute`                 |
| `Locked`       | 302 `InvalidSessionState`              |
| `Resolved`     | 302 `InvalidSessionState`              |

This lets a client tell "already done" apart from "this step is out of order"
without parsing an error string.

## Zero address

`initialize` rejects the all-zero account
(`GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF`) and the all-zero
contract (`CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4`) as admin
or treasury, since neither has a key behind it.
