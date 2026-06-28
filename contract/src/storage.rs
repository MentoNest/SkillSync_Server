use soroban_sdk::{Bytes, Env, Vec};

use crate::{DataKey, Session, SessionStatus};

const ARCHIVE_THRESHOLD_DAYS: u32 = 90;
const SECONDS_PER_DAY: u32 = 86400;

pub fn archive_session(env: &Env, session_id: &Bytes) {
    let session = crate::get_session(env, session_id);
    let ledger_time = env.ledger().timestamp();
    let completed_at = session.completed_at;

    if completed_at == 0 || ledger_time < completed_at {
        panic!("Session is not yet completed");
    }

    let age_seconds = ledger_time - completed_at;
    if age_seconds < ARCHIVE_THRESHOLD_DAYS * SECONDS_PER_DAY {
        panic!("Session is not old enough to archive");
    }

    let archive_key = DataKey::Session(session_id.clone());
    let meta_key = DataKey::SessionMeta(session_id.clone());

    env.storage().persistent().remove(&archive_key);
    env.storage().persistent().remove(&meta_key);
}

pub fn cleanup_expired_sessions(env: &Env, max_to_clean: u32) -> u32 {
    let mut cleaned = 0u32;
    let ledger_time = env.ledger().timestamp();

    for i in 0..max_to_clean {
        let key = Bytes::from_slice(env, &i.to_be_bytes());
        match crate::try_get_session(env, &key) {
            Some(session) => {
                let completed_at = session.completed_at;
                if completed_at > 0 {
                    let age = ledger_time - completed_at;
                    if age >= ARCHIVE_THRESHOLD_DAYS * SECONDS_PER_DAY {
                        archive_session(env, &key);
                        cleaned += 1;
                    }
                }
            }
            None => continue,
        }
    }

    cleaned
}

pub fn get_storage_stats(env: &Env) -> (u32, u32) {
    let mut total = 0u32;
    let mut archived = 0u32;
    let ledger_time = env.ledger().timestamp();

    for i in 0..1000u32 {
        let key = Bytes::from_slice(env, &i.to_be_bytes());
        match crate::try_get_session(env, &key) {
            Some(session) => {
                total += 1;
                let completed_at = session.completed_at;
                if completed_at > 0 {
                    let age = ledger_time - completed_at;
                    if age >= ARCHIVE_THRESHOLD_DAYS * SECONDS_PER_DAY {
                        archived += 1;
                    }
                }
            }
            None => continue,
        }
    }

    (total, archived)
}
