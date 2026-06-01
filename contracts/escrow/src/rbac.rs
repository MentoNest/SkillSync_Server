//! Role-Based Access Control (RBAC) module for SkillSync Escrow
//!
//! Provides multi-role access control to replace the single-admin pattern.
//!
//! # Predefined roles
//! | Constant                | Purpose                                      |
//! |-------------------------|----------------------------------------------|
//! | `DEFAULT_ADMIN_ROLE`    | Can grant / revoke any role                  |
//! | `FEE_MANAGER_ROLE`      | Can update platform fee and treasury address |
//! | `DISPUTE_RESOLVER_ROLE` | Can resolve disputed sessions                |
//! | `UPGRADER_ROLE`         | Can upgrade the contract WASM                |
//!
//! # Storage layout
//! Each (role, account) pair is stored as a `bool` under a `RoleKey` in
//! **persistent** storage so role assignments survive ledger TTL expiry.
//!
//! # Usage
//! ```rust
//! // Check a role inside a function:
//! only_role!(&env, FEE_MANAGER_ROLE, &caller);
//!
//! // Or call the helper directly:
//! rbac::require_role(&env, FEE_MANAGER_ROLE, &caller);
//! ```

#![allow(dead_code)]

use soroban_sdk::{contracttype, Address, BytesN, Env, Symbol};

// ============================================================================
// Predefined role identifiers (32-byte hashes)
// ============================================================================
//
// Each constant is a fixed 32-byte value that uniquely identifies a role.
// Using BytesN<32> keeps them compatible with the `role: BytesN<32>` parameter
// type required by the acceptance criteria.

/// Grants the ability to call `grant_role` and `revoke_role`.
/// Assigned to the deployer during `initialize`.
pub const DEFAULT_ADMIN_ROLE: [u8; 32] = [0u8; 32]; // 0x00…00

/// Grants the ability to update the platform fee and treasury address.
pub const FEE_MANAGER_ROLE: [u8; 32] = {
    let mut b = [0u8; 32];
    b[31] = 0x01;
    b
};

/// Grants the ability to resolve disputed sessions.
pub const DISPUTE_RESOLVER_ROLE: [u8; 32] = {
    let mut b = [0u8; 32];
    b[31] = 0x02;
    b
};

/// Grants the ability to upgrade the contract WASM.
pub const UPGRADER_ROLE: [u8; 32] = {
    let mut b = [0u8; 32];
    b[31] = 0x03;
    b
};

// ============================================================================
// Storage key
// ============================================================================

/// Composite storage key: (role_bytes, account) → bool
#[contracttype]
#[derive(Clone)]
pub struct RoleKey {
    pub role: BytesN<32>,
    pub account: Address,
}

// ============================================================================
// Core RBAC helpers (called from lib.rs and the only_role! macro)
// ============================================================================

/// Returns `true` if `account` has been granted `role`.
pub fn has_role(env: &Env, role: BytesN<32>, account: &Address) -> bool {
    let key = RoleKey {
        role,
        account: account.clone(),
    };
    env.storage()
        .persistent()
        .get::<RoleKey, bool>(&key)
        .unwrap_or(false)
}

/// Panics with `"AccessControl: account does not have role"` unless
/// `account` holds `role`.
pub fn require_role(env: &Env, role: BytesN<32>, account: &Address) {
    if !has_role(env, role, account) {
        panic!("AccessControl: account does not have role");
    }
}

/// Grants `role` to `account`.
///
/// The caller must hold `DEFAULT_ADMIN_ROLE`.  Emits `RoleGranted`.
/// No-ops silently if the account already has the role.
pub fn grant_role(env: &Env, caller: &Address, role: BytesN<32>, account: &Address) {
    // Only DEFAULT_ADMIN_ROLE holders may grant roles
    require_role(env, BytesN::from_array(env, &DEFAULT_ADMIN_ROLE), caller);

    let key = RoleKey {
        role: role.clone(),
        account: account.clone(),
    };

    // Idempotent — skip storage write and event if already granted
    if env
        .storage()
        .persistent()
        .get::<RoleKey, bool>(&key)
        .unwrap_or(false)
    {
        return;
    }

    env.storage().persistent().set(&key, &true);

    env.events().publish(
        (Symbol::new(env, "RoleGranted"),),
        (role, account.clone(), caller.clone()),
    );
}

/// Revokes `role` from `account`.
///
/// The caller must hold `DEFAULT_ADMIN_ROLE`.  Emits `RoleRevoked`.
/// No-ops silently if the account does not have the role.
pub fn revoke_role(env: &Env, caller: &Address, role: BytesN<32>, account: &Address) {
    // Only DEFAULT_ADMIN_ROLE holders may revoke roles
    require_role(env, BytesN::from_array(env, &DEFAULT_ADMIN_ROLE), caller);

    let key = RoleKey {
        role: role.clone(),
        account: account.clone(),
    };

    // Idempotent — skip storage write and event if not currently granted
    if !env
        .storage()
        .persistent()
        .get::<RoleKey, bool>(&key)
        .unwrap_or(false)
    {
        return;
    }

    env.storage().persistent().remove(&key);

    env.events().publish(
        (Symbol::new(env, "RoleRevoked"),),
        (role, account.clone(), caller.clone()),
    );
}

/// Bootstrap helper: grants `DEFAULT_ADMIN_ROLE` to `account` without
/// requiring the caller to already hold the role.
///
/// **Must only be called once, from `initialize`.**
pub fn bootstrap_admin(env: &Env, account: &Address) {
    let role = BytesN::from_array(env, &DEFAULT_ADMIN_ROLE);
    let key = RoleKey {
        role: role.clone(),
        account: account.clone(),
    };
    env.storage().persistent().set(&key, &true);

    env.events().publish(
        (Symbol::new(env, "RoleGranted"),),
        (role, account.clone(), account.clone()),
    );
}
