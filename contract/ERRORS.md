# Contract error codes

`ContractError` (`src/lib.rs`) converts into the Soroban `Error` type (`#[contracterror]`, `repr(u32)`). Every
variant has a unique numeric code, grouped into ranges so a client can tell the category from the number.

| Range   | Group                    | Codes |
|---------|--------------------------|-------|
| 100–199 | Initialization           | `AlreadyInitialized` 100, `NotInitialized` 101, `InvalidAdmin` 102, `InvalidTreasury` 103 |
| 200–299 | Authorization            | `Unauthorized` 200, `NotAdmin` 201, `NotBuyer` 202, `NotSeller` 203 |
| 240–249 | Legacy (to be re-homed)  | `InvalidPlatformFee` 240, `InvalidAmount` 241, `DuplicateSessionId` 242, `SessionNotFound` 243, `InvalidSessionStatus` 244, `PaymentTokenNotConfigured` 245, `InvalidResolution` 246, `InvalidShares` 247 |
| 300–399 | Session validation       | planned: `SessionNotFound` 300 … `SessionInDispute` 306 |
| 400–499 | Financial validation     | planned: `InvalidAmount` 400 … `Overflow` 404 |
| 500–599 | Timeouts and disputes    | planned: `DisputeWindowNotElapsed` 500 … `ResolutionNotAllowed` 503 |
| 600–699 | Upgrades                 | `InvalidWasmHash` 600, planned `UpgradeFailed` 601 |

Note: the issue text asks for codes 0–255, but the per-group issues specify 300–600. Soroban error codes are `u32`,
so the grouped ranges above are used; the legacy block sits in 240–249 so it does not collide with 200–203.

Which entry point returns what:

- admin-only calls before an admin exists: `NotInitialized`;
- a payout with no treasury configured: `InvalidTreasury`;
- `upgrade` with an all-zero hash: `InvalidWasmHash`.

`NotAdmin`, `NotBuyer` and `NotSeller` are defined but not returned yet: the buyer, seller and admin checks use
`require_auth()` on the stored address, which aborts rather than returning a typed error. Returning them needs the
caller address as a parameter of each entry point.
