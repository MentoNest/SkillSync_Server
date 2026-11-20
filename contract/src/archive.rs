//! Archiving and purging of finalized sessions (#1651).
//!
//! Own storage keys (`ArchiveKey`) and error range 1040-1059.
//!
//! Sessions record timestamps (seconds), not ledger numbers, so how long ago a session
//! was finalized is estimated as `seconds since its last recorded activity / 5` ledgers.

use super::*;
use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{contracterror, contractimpl, contracttype, panic_with_error, Vec};

/// Seconds per ledger used to turn session timestamps into an age in ledgers.
pub const SECONDS_PER_LEDGER: u64 = 5;
/// Default: archive 30 days after the last activity.
pub const DEFAULT_ARCHIVE_AFTER_LEDGERS: u32 = 518_400;
/// Default: an archived record may be deleted 30 days after archiving.
pub const DEFAULT_DELETE_AFTER_LEDGERS: u32 = 518_400;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ArchiveKey {
    ArchiveAfter,
    DeleteAfter,
    Index,
    Archived(Bytes32),
}

/// What remains of an archived session: a hash of the original, and when it was archived.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ArchivedSession {
    pub hash: BytesN<32>,
    pub archived_ledger: u32,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ArchiveError {
    NotFinalized = 1040,
    TooRecent = 1041,
    NotArchived = 1042,
    ArchivePeriodNotElapsed = 1043,
    InvalidConfig = 1044,
    InvalidLimit = 1045,
}

fn archive_after(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get(&ArchiveKey::ArchiveAfter)
        .unwrap_or(DEFAULT_ARCHIVE_AFTER_LEDGERS)
}

fn delete_after(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get(&ArchiveKey::DeleteAfter)
        .unwrap_or(DEFAULT_DELETE_AFTER_LEDGERS)
}

fn index(env: &Env) -> Vec<Bytes32> {
    env.storage()
        .persistent()
        .get(&ArchiveKey::Index)
        .unwrap_or(Vec::new(env))
}

/// Hook for `lock_funds`: remembers the id so batch archiving can find it.
pub(crate) fn track_session(env: &Env, session_id: &Bytes32) {
    let mut list = index(env);
    list.push_back(session_id.clone());
    env.storage().persistent().set(&ArchiveKey::Index, &list);
}

/// Hook for `session_exists`: an archived id can never be used for a new session.
pub(crate) fn is_archived(env: &Env, session_id: &Bytes32) -> bool {
    env.storage()
        .persistent()
        .has(&ArchiveKey::Archived(session_id.clone()))
}

fn is_final(status: SessionStatus) -> bool {
    matches!(
        status,
        SessionStatus::Approved | SessionStatus::Refunded | SessionStatus::Resolved
    )
}

fn age_in_ledgers(env: &Env, session: &Session) -> u64 {
    let last_activity = session
        .created_at
        .max(session.completed_at)
        .max(session.dispute_opened_at)
        .max(session.dispute_resolved_at);
    env.ledger().timestamp().saturating_sub(last_activity) / SECONDS_PER_LEDGER
}

fn is_archivable(env: &Env, session: &Session) -> bool {
    is_final(session.status) && age_in_ledgers(env, session) >= archive_after(env) as u64
}

fn archive(env: &Env, session_id: &Bytes32, session: &Session) {
    let hash = env.crypto().sha256(&session.clone().to_xdr(env)).to_bytes();
    env.storage().persistent().set(
        &ArchiveKey::Archived(session_id.clone()),
        &ArchivedSession {
            hash: hash.clone(),
            archived_ledger: env.ledger().sequence(),
        },
    );
    env.storage()
        .persistent()
        .remove(&DataKey::Session(session_id.clone()));
    env.events()
        .publish((Symbol::new(env, "SessionArchived"),), (session_id.clone(), hash));
}

#[contractimpl]
impl SkillssyncEscrow {
    /// `archive_after_ledgers`: how long after its last activity a finalized session may be
    /// archived. `delete_after_ledgers`: how long an archived record is kept before it can
    /// be deleted.
    pub fn set_archive_config(
        env: Env,
        archive_after_ledgers: u32,
        delete_after_ledgers: u32,
    ) -> Result<(), ContractError> {
        require_admin(&env)?;
        if archive_after_ledgers == 0 || delete_after_ledgers == 0 {
            panic_with_error!(&env, ArchiveError::InvalidConfig);
        }
        env.storage()
            .persistent()
            .set(&ArchiveKey::ArchiveAfter, &archive_after_ledgers);
        env.storage()
            .persistent()
            .set(&ArchiveKey::DeleteAfter, &delete_after_ledgers);
        Ok(())
    }

    /// `(archive_after_ledgers, delete_after_ledgers)`.
    pub fn get_archive_config(env: Env) -> (u32, u32) {
        (archive_after(&env), delete_after(&env))
    }

    pub fn get_archived_session(env: Env, session_id: Bytes32) -> Option<ArchivedSession> {
        env.storage().persistent().get(&ArchiveKey::Archived(session_id))
    }

    /// Replaces a finalized, old-enough session with a hash of its contents. Anyone can
    /// call it; archived sessions cannot be restored or modified.
    pub fn archive_session(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        let session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        if !is_final(session.status) {
            panic_with_error!(&env, ArchiveError::NotFinalized);
        }
        if !is_archivable(&env, &session) {
            panic_with_error!(&env, ArchiveError::TooRecent);
        }
        archive(&env, &session_id, &session);
        // Drop the id from the batch index as well.
        let kept: Vec<Bytes32> = {
            let mut kept = Vec::new(&env);
            for id in index(&env).iter() {
                if id != session_id {
                    kept.push_back(id);
                }
            }
            kept
        };
        env.storage().persistent().set(&ArchiveKey::Index, &kept);
        Ok(())
    }

    /// Permanently removes an archived record once `delete_after_ledgers` have passed
    /// since it was archived. Admin only.
    pub fn delete_archived_session(env: Env, session_id: Bytes32) -> Result<(), ContractError> {
        require_admin(&env)?;
        let key = ArchiveKey::Archived(session_id.clone());
        let archived: ArchivedSession = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, ArchiveError::NotArchived));
        if env.ledger().sequence()
            < archived.archived_ledger.saturating_add(delete_after(&env))
        {
            panic_with_error!(&env, ArchiveError::ArchivePeriodNotElapsed);
        }
        env.storage().persistent().remove(&key);
        env.events()
            .publish((Symbol::new(&env, "SessionDeleted"),), session_id);
        Ok(())
    }

    /// Looks at up to `limit` tracked sessions and archives the eligible ones, so a
    /// single call has a bounded cost. Returns how many were archived.
    pub fn batch_archive_sessions(env: Env, limit: u32) -> u32 {
        if limit == 0 {
            panic_with_error!(&env, ArchiveError::InvalidLimit);
        }
        let mut kept: Vec<Bytes32> = Vec::new(&env);
        let mut examined = 0u32;
        let mut archived = 0u32;
        for id in index(&env).iter() {
            if examined < limit {
                examined += 1;
                match load_session(&env, id.clone()) {
                    Some(session) if is_archivable(&env, &session) => {
                        archive(&env, &id, &session);
                        archived += 1;
                        continue;
                    }
                    Some(_) => {}
                    None => continue, // already archived or gone
                }
            }
            kept.push_back(id);
        }
        env.storage().persistent().set(&ArchiveKey::Index, &kept);
        archived
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};

    struct Fixture {
        env: Env,
        client: SkillssyncEscrowClient<'static>,
        buyer: Address,
        seller: Address,
    }

    fn setup() -> Fixture {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().with_mut(|li| li.timestamp = 1_000_000);
        let contract_id = env.register(SkillssyncEscrow, ());
        let token_addr = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();
        let admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        env.as_contract(&contract_id, || {
            env.storage().persistent().set(&DataKey::Admin, &admin);
            env.storage().persistent().set(&DataKey::Treasury, &treasury);
            env.storage().persistent().set(&DataKey::PaymentToken, &token_addr);
        });
        token::StellarAssetClient::new(&env, &token_addr).mint(&buyer, &1_000_000);
        Fixture {
            client: SkillssyncEscrowClient::new(&env, &contract_id),
            env,
            buyer,
            seller,
        }
    }

    fn id(env: &Env, n: u8) -> Bytes32 {
        BytesN::from_array(env, &[n; 32])
    }

    fn finalized(f: &Fixture, n: u8) {
        f.client.lock_funds(&id(&f.env, n), &f.buyer, &f.seller, &1_000);
        f.client.complete_session(&id(&f.env, n));
        f.client.approve_session(&id(&f.env, n));
    }

    /// Moves the clock `ledgers` ledgers forward (timestamp and sequence).
    fn age(f: &Fixture, ledgers: u32) {
        f.env.ledger().with_mut(|li| {
            li.timestamp += ledgers as u64 * SECONDS_PER_LEDGER;
            li.sequence_number += ledgers;
        });
    }

    #[test]
    fn a_finalized_session_is_archived_down_to_a_hash() {
        let f = setup();
        f.client.set_archive_config(&100, &50);
        finalized(&f, 1);
        age(&f, 100);

        f.client.archive_session(&id(&f.env, 1));

        assert!(f.client.get_session(&id(&f.env, 1)).is_none());
        let archived = f.client.get_archived_session(&id(&f.env, 1)).unwrap();
        assert_eq!(archived.archived_ledger, f.env.ledger().sequence());
        // The hash does not change when read again, and the id cannot be reused.
        assert_eq!(f.client.get_archived_session(&id(&f.env, 1)).unwrap().hash, archived.hash);
        assert!(f.client.try_lock_funds(&id(&f.env, 1), &f.buyer, &f.seller, &1_000).is_err());
        // Archived sessions cannot be modified.
        assert!(f.client.try_approve_session(&id(&f.env, 1)).is_err());
        assert!(f.client.try_archive_session(&id(&f.env, 1)).is_err());
    }

    #[test]
    fn only_old_finalized_sessions_can_be_archived() {
        let f = setup();
        f.client.set_archive_config(&100, &50);
        f.client.lock_funds(&id(&f.env, 1), &f.buyer, &f.seller, &1_000);
        age(&f, 1_000);
        // Still locked: never archivable.
        assert!(f.client.try_archive_session(&id(&f.env, 1)).is_err());

        finalized(&f, 2);
        age(&f, 99);
        assert!(f.client.try_archive_session(&id(&f.env, 2)).is_err()); // too recent
        age(&f, 1);
        f.client.archive_session(&id(&f.env, 2));
    }

    #[test]
    fn archived_records_are_deleted_only_by_the_admin_after_the_archive_period() {
        let f = setup();
        f.client.set_archive_config(&100, &50);
        finalized(&f, 1);
        age(&f, 100);
        f.client.archive_session(&id(&f.env, 1));

        assert!(f.client.try_delete_archived_session(&id(&f.env, 1)).is_err());
        age(&f, 50);
        f.client.delete_archived_session(&id(&f.env, 1));
        assert!(f.client.get_archived_session(&id(&f.env, 1)).is_none());
        assert!(f.client.try_delete_archived_session(&id(&f.env, 1)).is_err());
    }

    #[test]
    fn batch_archiving_is_bounded_by_the_limit() {
        let f = setup();
        f.client.set_archive_config(&100, &50);
        for n in 1..=4 {
            finalized(&f, n);
        }
        f.client.lock_funds(&id(&f.env, 9), &f.buyer, &f.seller, &1_000); // never final
        age(&f, 100);

        // Looks at only 2 tracked sessions.
        assert_eq!(f.client.batch_archive_sessions(&2), 2);
        assert!(f.client.get_session(&id(&f.env, 1)).is_none());
        assert!(f.client.get_session(&id(&f.env, 3)).is_some());

        assert_eq!(f.client.batch_archive_sessions(&10), 2);
        assert!(f.client.get_session(&id(&f.env, 9)).is_some());
        assert_eq!(f.client.batch_archive_sessions(&10), 0);
        assert!(f.client.try_batch_archive_sessions(&0).is_err());
    }

    #[test]
    fn configuration_is_validated_and_has_defaults() {
        let f = setup();
        assert_eq!(f.client.get_archive_config(), (DEFAULT_ARCHIVE_AFTER_LEDGERS, DEFAULT_DELETE_AFTER_LEDGERS));
        assert!(f.client.try_set_archive_config(&0, &10).is_err());
        assert!(f.client.try_set_archive_config(&10, &0).is_err());
        f.client.set_archive_config(&10, &20);
        assert_eq!(f.client.get_archive_config(), (10, 20));
    }
}
