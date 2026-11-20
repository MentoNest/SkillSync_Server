//! Off-chain signed approvals (#1641) and multi-signature admin proposals (#1642).
//!
//! Own storage keys (`GovKey`) and error range 910-949.

use super::*;
use soroban_sdk::xdr::{FromXdr, ToXdr};
use soroban_sdk::{contracterror, contractimpl, contracttype, panic_with_error, Bytes, Vec};

/// Pending proposals can be signed and executed for this many ledgers.
pub const PROPOSAL_TTL_LEDGERS: u32 = 10_000;
pub const MAX_ADMINS: u32 = 20;
const APPROVAL_DOMAIN: &[u8] = b"skillsync:approve:v1";

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum GovKey {
    Admins,
    Threshold,
    Proposal(Bytes32),
    ApprovalNonce(Address),
    SigningKey(Address),
}

/// Critical operations that need `threshold` admin signatures.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalAction {
    SetFee(u32),
    SetTreasury(Address),
    Upgrade(BytesN<32>),
    ResolveDispute(Bytes32, u32, i128, i128),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminProposal {
    pub proposer: Address,
    pub action: ProposalAction,
    /// Admins that signed, the proposer included.
    pub signers: Vec<Address>,
    pub expires_at: u32,
    pub executed: bool,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum GovError {
    NoSigningKey = 910,
    InvalidApprovalStatus = 911,
    MultisigRequired = 912,
    AlreadyConfigured = 913,
    InvalidAdminSet = 914,
    NotAnAdmin = 915,
    ProposalExists = 916,
    ProposalNotFound = 917,
    ProposalExpired = 918,
    AlreadySigned = 919,
    ThresholdNotMet = 920,
    AlreadyExecuted = 921,
    InvalidPayload = 922,
    InvalidAction = 923,
    NotConfigured = 924,
}

fn admins(env: &Env) -> Option<Vec<Address>> {
    env.storage().persistent().get(&GovKey::Admins)
}

fn require_multisig_admin(env: &Env, who: &Address) {
    let list = admins(env).unwrap_or_else(|| panic_with_error!(env, GovError::NotConfigured));
    if !list.contains(who) {
        panic_with_error!(env, GovError::NotAnAdmin);
    }
}

/// Hook for the single-admin critical functions: once multi-signature admins are
/// configured, those operations only run through executed proposals.
pub(crate) fn require_no_multisig(env: &Env) {
    if env.storage().persistent().has(&GovKey::Admins) {
        panic_with_error!(env, GovError::MultisigRequired);
    }
}

fn approval_nonce(env: &Env, owner: &Address) -> u64 {
    env.storage()
        .persistent()
        .get(&GovKey::ApprovalNonce(owner.clone()))
        .unwrap_or(0)
}

/// The exact bytes both parties sign: domain || contract || session id || buyer nonce || seller nonce.
fn approval_payload(env: &Env, session_id: &Bytes32, buyer_nonce: u64, seller_nonce: u64) -> Bytes {
    let mut message = Bytes::from_slice(env, APPROVAL_DOMAIN);
    message.append(&env.current_contract_address().to_xdr(env));
    message.append(&Bytes::from_slice(env, &session_id.to_array()));
    message.append(&Bytes::from_slice(env, &buyer_nonce.to_be_bytes()));
    message.append(&Bytes::from_slice(env, &seller_nonce.to_be_bytes()));
    message
}

fn settle_resolved_dispute(
    env: &Env,
    session_id: Bytes32,
    resolution: u32,
    buyer_share: i128,
    seller_share: i128,
) -> Result<(), ContractError> {
    let mut session =
        load_session(env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
    if session.status != SessionStatus::Disputed {
        return Err(ContractError::InvalidSessionStatus);
    }
    if buyer_share < 0
        || seller_share < 0
        || buyer_share
            .checked_add(seller_share)
            .map_or(true, |total| total != session.amount)
    {
        return Err(ContractError::InvalidShares);
    }
    match resolution {
        0 | 1 | 2 => {}
        _ => return Err(ContractError::InvalidResolution),
    }
    if resolution == 0 && (buyer_share != session.amount || seller_share != 0) {
        return Err(ContractError::InvalidShares);
    }
    if resolution == 1 && (seller_share != session.amount || buyer_share != 0) {
        return Err(ContractError::InvalidShares);
    }
    let token_addr = read_payment_token(env).ok_or(ContractError::PaymentTokenNotConfigured)?;
    let token = token::Client::new(env, &token_addr);
    let contract = env.current_contract_address();
    let (settlement, fee) = apply_fee(env, session.amount);
    let buyer_payout = if buyer_share == session.amount {
        settlement
    } else if seller_share == session.amount {
        0
    } else {
        buyer_share
            .checked_mul(settlement)
            .and_then(|value| value.checked_div(session.amount))
            .unwrap_or(0)
    };
    let seller_payout = settlement - buyer_payout;
    session.status = SessionStatus::Resolved;
    session.dispute_resolved_at = env.ledger().timestamp();
    save_session(env, session_id.clone(), &session);
    if buyer_payout > 0 {
        token.transfer(&contract, &session.buyer, &buyer_payout);
    }
    if seller_payout > 0 {
        token.transfer(&contract, &session.seller, &seller_payout);
    }
    transfer_treasury_fee(env, &token, fee)?;
    env.events().publish(
        (Symbol::new(env, "DisputeResolved"),),
        (session_id, resolution, buyer_share, seller_share),
    );
    Ok(())
}

fn apply_action(env: &Env, action: ProposalAction) -> Result<(), ContractError> {
    match action {
        ProposalAction::SetFee(fee_bps) => {
            if fee_bps > MAX_PLATFORM_FEE_BPS {
                return Err(ContractError::InvalidPlatformFee);
            }
            env.storage().persistent().set(&DataKey::PlatformFeeBps, &fee_bps);
            env.events()
                .publish((Symbol::new(env, "platform_fee_updated"),), fee_bps);
        }
        ProposalAction::SetTreasury(treasury) => {
            env.storage().persistent().set(&DataKey::Treasury, &treasury);
            env.events()
                .publish((Symbol::new(env, "treasury_updated"),), treasury);
        }
        ProposalAction::Upgrade(wasm_hash) => {
            env.deployer().update_current_contract_wasm(wasm_hash);
        }
        ProposalAction::ResolveDispute(session_id, resolution, buyer_share, seller_share) => {
            settle_resolved_dispute(env, session_id, resolution, buyer_share, seller_share)?;
        }
    }
    Ok(())
}

#[contractimpl]
impl SkillssyncEscrow {
    // ---- #1641 off-chain signed approvals -------------------------------------------

    /// Binds an ed25519 public key to `owner`; the key's signatures count as that owner's.
    pub fn register_signing_key(env: Env, owner: Address, public_key: BytesN<32>) {
        owner.require_auth();
        env.storage()
            .persistent()
            .set(&GovKey::SigningKey(owner), &public_key);
    }

    pub fn get_signing_key(env: Env, owner: Address) -> Option<BytesN<32>> {
        env.storage().persistent().get(&GovKey::SigningKey(owner))
    }

    /// The next approval nonce for `owner` (it increases every time one of their
    /// signed approvals is executed).
    pub fn get_approval_nonce(env: Env, owner: Address) -> u64 {
        approval_nonce(&env, &owner)
    }

    /// The payload that buyer and seller must both sign for the next approval of
    /// `session_id`. It binds the contract, the session and both parties' current nonces.
    pub fn approval_message(env: Env, session_id: Bytes32) -> Result<Bytes, ContractError> {
        let session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        Ok(approval_payload(
            &env,
            &session_id,
            approval_nonce(&env, &session.buyer),
            approval_nonce(&env, &session.seller),
        ))
    }

    /// Anyone (typically a relayer) can submit the two signatures. Verifies both with
    /// ed25519, bumps both nonces so the signatures cannot be replayed, and pays the seller
    /// exactly like `approve_session` (a completed session, platform fee to the treasury).
    pub fn approve_with_signature(
        env: Env,
        session_id: Bytes32,
        buyer_sig: BytesN<64>,
        seller_sig: BytesN<64>,
    ) -> Result<(), ContractError> {
        let mut session =
            load_session(&env, session_id.clone()).ok_or(ContractError::SessionNotFound)?;
        if session.status != SessionStatus::Completed {
            panic_with_error!(&env, GovError::InvalidApprovalStatus);
        }
        session_limits::ensure_not_expired(&env, &session_id);
        let buyer_key: BytesN<32> = env
            .storage()
            .persistent()
            .get(&GovKey::SigningKey(session.buyer.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, GovError::NoSigningKey));
        let seller_key: BytesN<32> = env
            .storage()
            .persistent()
            .get(&GovKey::SigningKey(session.seller.clone()))
            .unwrap_or_else(|| panic_with_error!(&env, GovError::NoSigningKey));

        let buyer_nonce = approval_nonce(&env, &session.buyer);
        let seller_nonce = approval_nonce(&env, &session.seller);
        let message = approval_payload(&env, &session_id, buyer_nonce, seller_nonce);
        env.crypto().ed25519_verify(&buyer_key, &message, &buyer_sig);
        env.crypto().ed25519_verify(&seller_key, &message, &seller_sig);

        // Consume the nonces before any funds move.
        env.storage()
            .persistent()
            .set(&GovKey::ApprovalNonce(session.buyer.clone()), &(buyer_nonce + 1));
        env.storage()
            .persistent()
            .set(&GovKey::ApprovalNonce(session.seller.clone()), &(seller_nonce + 1));

        let token_addr =
            read_payment_token(&env).ok_or(ContractError::PaymentTokenNotConfigured)?;
        let token = token::Client::new(&env, &token_addr);
        let (payout, fee) = apply_fee(&env, session.amount);
        session.status = SessionStatus::Approved;
        save_session(&env, session_id.clone(), &session);
        token.transfer(&env.current_contract_address(), &session.seller, &payout);
        transfer_treasury_fee(&env, &token, fee)?;
        env.events().publish(
            (Symbol::new(&env, "OffchainApprovalExecuted"),),
            (session_id, buyer_nonce, seller_nonce),
        );
        Ok(())
    }

    // ---- #1642 multi-signature admin ------------------------------------------------

    /// One-time setup by the current admin: from now on SetFee, SetTreasury, Upgrade and
    /// ResolveDispute need `threshold` of these admins (proposal -> signatures -> execute).
    pub fn set_admins(
        env: Env,
        admins_list: Vec<Address>,
        threshold: u32,
    ) -> Result<(), ContractError> {
        if admins(&env).is_some() {
            panic_with_error!(&env, GovError::AlreadyConfigured);
        }
        require_admin(&env)?;
        let count = admins_list.len();
        if count == 0 || count > MAX_ADMINS || threshold == 0 || threshold > count {
            panic_with_error!(&env, GovError::InvalidAdminSet);
        }
        for i in 0..count {
            for j in (i + 1)..count {
                if admins_list.get(i) == admins_list.get(j) {
                    panic_with_error!(&env, GovError::InvalidAdminSet);
                }
            }
        }
        env.storage().persistent().set(&GovKey::Admins, &admins_list);
        env.storage().persistent().set(&GovKey::Threshold, &threshold);
        Ok(())
    }

    pub fn get_admins(env: Env) -> Option<Vec<Address>> {
        admins(&env)
    }

    pub fn get_threshold(env: Env) -> u32 {
        env.storage().persistent().get(&GovKey::Threshold).unwrap_or(0)
    }

    /// Serializes an action into the `payload` expected by `submit_admin_proposal`.
    pub fn encode_proposal(env: Env, action: ProposalAction) -> Bytes {
        action.to_xdr(&env)
    }

    /// An admin proposes an action (their signature counts). `payload` is the XDR of a
    /// [`ProposalAction`].
    pub fn submit_admin_proposal(
        env: Env,
        proposer: Address,
        proposal_id: Bytes32,
        payload: Bytes,
    ) -> Result<(), ContractError> {
        proposer.require_auth();
        require_multisig_admin(&env, &proposer);
        let key = GovKey::Proposal(proposal_id.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, GovError::ProposalExists);
        }
        let action = ProposalAction::from_xdr(&env, &payload)
            .unwrap_or_else(|_| panic_with_error!(&env, GovError::InvalidPayload));
        let mut signers: Vec<Address> = Vec::new(&env);
        signers.push_back(proposer.clone());
        let expires_at = env.ledger().sequence().saturating_add(PROPOSAL_TTL_LEDGERS);
        env.storage().persistent().set(
            &key,
            &AdminProposal {
                proposer: proposer.clone(),
                action,
                signers,
                expires_at,
                executed: false,
            },
        );
        env.events().publish(
            (Symbol::new(&env, "ProposalCreated"),),
            (proposal_id, proposer, expires_at),
        );
        Ok(())
    }

    pub fn get_admin_proposal(env: Env, proposal_id: Bytes32) -> Option<AdminProposal> {
        env.storage().persistent().get(&GovKey::Proposal(proposal_id))
    }

    /// Another admin adds their signature.
    pub fn sign_proposal(
        env: Env,
        admin: Address,
        proposal_id: Bytes32,
    ) -> Result<(), ContractError> {
        admin.require_auth();
        require_multisig_admin(&env, &admin);
        let key = GovKey::Proposal(proposal_id.clone());
        let mut proposal: AdminProposal = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, GovError::ProposalNotFound));
        if proposal.executed {
            panic_with_error!(&env, GovError::AlreadyExecuted);
        }
        if env.ledger().sequence() > proposal.expires_at {
            panic_with_error!(&env, GovError::ProposalExpired);
        }
        if proposal.signers.contains(&admin) {
            panic_with_error!(&env, GovError::AlreadySigned);
        }
        proposal.signers.push_back(admin.clone());
        let count = proposal.signers.len();
        env.storage().persistent().set(&key, &proposal);
        env.events().publish(
            (Symbol::new(&env, "ProposalSigned"),),
            (proposal_id, admin, count),
        );
        Ok(())
    }

    /// Anyone can execute a proposal once it has `threshold` signatures and has not expired.
    pub fn execute_proposal(env: Env, proposal_id: Bytes32) -> Result<(), ContractError> {
        let key = GovKey::Proposal(proposal_id.clone());
        let mut proposal: AdminProposal = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic_with_error!(&env, GovError::ProposalNotFound));
        if proposal.executed {
            panic_with_error!(&env, GovError::AlreadyExecuted);
        }
        if env.ledger().sequence() > proposal.expires_at {
            panic_with_error!(&env, GovError::ProposalExpired);
        }
        let threshold: u32 = env.storage().persistent().get(&GovKey::Threshold).unwrap_or(0);
        if threshold == 0 || proposal.signers.len() < threshold {
            panic_with_error!(&env, GovError::ThresholdNotMet);
        }
        // Mark executed first so the action cannot run twice.
        proposal.executed = true;
        env.storage().persistent().set(&key, &proposal);
        apply_action(&env, proposal.action)?;
        env.events()
            .publish((Symbol::new(&env, "ProposalExecuted"),), proposal_id);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::vec;

    struct Fixture {
        env: Env,
        contract_id: Address,
        client: SkillssyncEscrowClient<'static>,
        token: token::Client<'static>,
        admin: Address,
        treasury: Address,
        buyer: Address,
        seller: Address,
    }

    fn setup() -> Fixture {
        let env = Env::default();
        env.mock_all_auths();
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
            token: token::Client::new(&env, &token_addr),
            env,
            contract_id,
            admin,
            treasury,
            buyer,
            seller,
        }
    }

    fn id(env: &Env, n: u8) -> Bytes32 {
        BytesN::from_array(env, &[n; 32])
    }

    // ---- off-chain approvals ----------------------------------------------------------

    fn keys() -> (SigningKey, SigningKey) {
        (SigningKey::from_bytes(&[7u8; 32]), SigningKey::from_bytes(&[9u8; 32]))
    }

    fn sign(env: &Env, key: &SigningKey, message: &Bytes) -> BytesN<64> {
        let raw = message.to_alloc_vec();
        BytesN::from_array(env, &key.sign(&raw).to_bytes())
    }

    fn completed_session_with_keys(f: &Fixture, n: u8) -> (SigningKey, SigningKey) {
        let (buyer_key, seller_key) = keys();
        f.client
            .register_signing_key(&f.buyer, &BytesN::from_array(&f.env, &buyer_key.verifying_key().to_bytes()));
        f.client
            .register_signing_key(&f.seller, &BytesN::from_array(&f.env, &seller_key.verifying_key().to_bytes()));
        f.client.lock_funds(&id(&f.env, n), &f.buyer, &f.seller, &10_000);
        f.client.complete_session(&id(&f.env, n));
        (buyer_key, seller_key)
    }

    #[test]
    fn valid_signatures_execute_the_approval_once() {
        let f = setup();
        let (buyer_key, seller_key) = completed_session_with_keys(&f, 1);
        let message = f.client.approval_message(&id(&f.env, 1));
        let buyer_sig = sign(&f.env, &buyer_key, &message);
        let seller_sig = sign(&f.env, &seller_key, &message);

        f.client.approve_with_signature(&id(&f.env, 1), &buyer_sig, &seller_sig);

        assert_eq!(f.client.get_session(&id(&f.env, 1)).unwrap().status, SessionStatus::Approved);
        assert_eq!(f.token.balance(&f.seller), 9_900);
        assert_eq!(f.token.balance(&f.treasury), 100);
        assert_eq!(f.client.get_approval_nonce(&f.buyer), 1);
        assert_eq!(f.client.get_approval_nonce(&f.seller), 1);
    }

    #[test]
    fn replaying_the_signatures_is_rejected() {
        let f = setup();
        let (buyer_key, seller_key) = completed_session_with_keys(&f, 1);
        let message = f.client.approval_message(&id(&f.env, 1));
        let buyer_sig = sign(&f.env, &buyer_key, &message);
        let seller_sig = sign(&f.env, &seller_key, &message);
        f.client.approve_with_signature(&id(&f.env, 1), &buyer_sig, &seller_sig);

        // Same signatures on a second session: the nonces moved, so the payload differs.
        f.client.lock_funds(&id(&f.env, 2), &f.buyer, &f.seller, &10_000);
        f.client.complete_session(&id(&f.env, 2));
        assert!(f
            .client
            .try_approve_with_signature(&id(&f.env, 2), &buyer_sig, &seller_sig)
            .is_err());
        // And the first session cannot be approved twice.
        assert!(f
            .client
            .try_approve_with_signature(&id(&f.env, 1), &buyer_sig, &seller_sig)
            .is_err());
    }

    #[test]
    #[should_panic]
    fn a_signature_from_the_wrong_key_is_rejected() {
        let f = setup();
        let (buyer_key, _seller_key) = completed_session_with_keys(&f, 1);
        let message = f.client.approval_message(&id(&f.env, 1));
        let buyer_sig = sign(&f.env, &buyer_key, &message);
        // The seller's slot carries the buyer's signature.
        f.client.approve_with_signature(&id(&f.env, 1), &buyer_sig, &buyer_sig);
    }

    #[test]
    fn approval_needs_registered_keys_and_a_completed_session() {
        let f = setup();
        f.client.lock_funds(&id(&f.env, 1), &f.buyer, &f.seller, &10_000);
        let dummy = BytesN::from_array(&f.env, &[0u8; 64]);
        // Not completed.
        assert!(f.client.try_approve_with_signature(&id(&f.env, 1), &dummy, &dummy).is_err());
        f.client.complete_session(&id(&f.env, 1));
        // No signing keys registered.
        assert!(f.client.try_approve_with_signature(&id(&f.env, 1), &dummy, &dummy).is_err());
    }

    // ---- multisig ---------------------------------------------------------------------

    fn admin_set(f: &Fixture) -> (Address, Address, Address) {
        (Address::generate(&f.env), Address::generate(&f.env), Address::generate(&f.env))
    }

    fn configure(f: &Fixture) -> (Address, Address, Address) {
        let (a, b, c) = admin_set(f);
        f.client.set_admins(&vec![&f.env, a.clone(), b.clone(), c.clone()], &2);
        (a, b, c)
    }

    #[test]
    fn admin_set_is_validated_and_configured_once() {
        let f = setup();
        let (a, b, _) = admin_set(&f);
        assert!(f.client.try_set_admins(&vec![&f.env], &1).is_err());
        assert!(f.client.try_set_admins(&vec![&f.env, a.clone(), b.clone()], &0).is_err());
        assert!(f.client.try_set_admins(&vec![&f.env, a.clone(), b.clone()], &3).is_err());
        assert!(f.client.try_set_admins(&vec![&f.env, a.clone(), a.clone()], &1).is_err());

        f.client.set_admins(&vec![&f.env, a.clone(), b.clone()], &2);
        assert_eq!(f.client.get_threshold(), 2);
        assert_eq!(f.client.get_admins().unwrap().len(), 2);
        assert!(f.client.try_set_admins(&vec![&f.env, a], &1).is_err());
    }

    #[test]
    fn a_proposal_executes_only_after_the_threshold_is_reached() {
        let f = setup();
        let (a, b, _) = configure(&f);
        let payload = f.client.encode_proposal(&ProposalAction::SetFee(300));
        f.client.submit_admin_proposal(&a, &id(&f.env, 1), &payload);

        // One signature (the proposer) is below the threshold of 2.
        assert!(f.client.try_execute_proposal(&id(&f.env, 1)).is_err());
        assert_eq!(f.client.get_platform_fee(), 100);

        f.client.sign_proposal(&b, &id(&f.env, 1));
        f.client.execute_proposal(&id(&f.env, 1));
        assert_eq!(f.client.get_platform_fee(), 300);
        assert!(f.client.get_admin_proposal(&id(&f.env, 1)).unwrap().executed);
        assert!(f.client.try_execute_proposal(&id(&f.env, 1)).is_err());
    }

    #[test]
    fn only_admins_can_propose_and_each_admin_signs_once() {
        let f = setup();
        let (a, b, _) = configure(&f);
        let stranger = Address::generate(&f.env);
        let payload = f.client.encode_proposal(&ProposalAction::SetFee(300));
        assert!(f.client.try_submit_admin_proposal(&stranger, &id(&f.env, 1), &payload).is_err());

        f.client.submit_admin_proposal(&a, &id(&f.env, 1), &payload);
        assert!(f.client.try_submit_admin_proposal(&b, &id(&f.env, 1), &payload).is_err());
        assert!(f.client.try_sign_proposal(&a, &id(&f.env, 1)).is_err());
        assert!(f.client.try_sign_proposal(&stranger, &id(&f.env, 1)).is_err());
        f.client.sign_proposal(&b, &id(&f.env, 1));
        assert!(f.client.try_sign_proposal(&b, &id(&f.env, 1)).is_err());
        assert!(f
            .client
            .try_submit_admin_proposal(&a, &id(&f.env, 2), &Bytes::from_slice(&f.env, &[1, 2, 3]))
            .is_err());
    }

    #[test]
    fn pending_proposals_expire_after_10000_ledgers() {
        let f = setup();
        let (a, b, _) = configure(&f);
        let payload = f.client.encode_proposal(&ProposalAction::SetFee(300));
        f.client.submit_admin_proposal(&a, &id(&f.env, 1), &payload);
        f.client.sign_proposal(&b, &id(&f.env, 1));

        f.env.ledger().with_mut(|li| li.sequence_number += PROPOSAL_TTL_LEDGERS + 1);
        assert!(f.client.try_execute_proposal(&id(&f.env, 1)).is_err());
        assert_eq!(f.client.get_platform_fee(), 100);
    }

    #[test]
    fn treasury_change_and_dispute_resolution_run_through_proposals() {
        let f = setup();
        let (a, b, _) = configure(&f);
        let new_treasury = Address::generate(&f.env);
        let payload = f.client.encode_proposal(&ProposalAction::SetTreasury(new_treasury.clone()));
        f.client.submit_admin_proposal(&a, &id(&f.env, 1), &payload);
        f.client.sign_proposal(&b, &id(&f.env, 1));
        f.client.execute_proposal(&id(&f.env, 1));
        assert_eq!(f.client.get_treasury(), Some(new_treasury.clone()));

        f.client.lock_funds(&id(&f.env, 9), &f.buyer, &f.seller, &10_000);
        f.client.open_dispute(&id(&f.env, 9), &String::from_str(&f.env, "x"));
        let resolve = f.client.encode_proposal(&ProposalAction::ResolveDispute(id(&f.env, 9), 1, 0, 10_000));
        f.client.submit_admin_proposal(&b, &id(&f.env, 2), &resolve);
        f.client.sign_proposal(&a, &id(&f.env, 2));
        f.client.execute_proposal(&id(&f.env, 2));
        assert_eq!(f.client.get_session(&id(&f.env, 9)).unwrap().status, SessionStatus::Resolved);
        assert_eq!(f.token.balance(&f.seller), 9_900);
        assert_eq!(f.token.balance(&new_treasury), 100);
    }

    #[test]
    fn the_single_admin_can_no_longer_change_critical_settings() {
        let f = setup();
        assert_eq!(f.admin, f.env.as_contract(&f.contract_id, || read_admin(&f.env).unwrap()));
        f.client.set_platform_fee(&200);
        configure(&f);
        assert!(f.client.try_set_platform_fee(&300).is_err());
        assert!(f.client.try_set_treasury(&f.treasury).is_err());
        assert_eq!(f.client.get_platform_fee(), 200);
    }
}
