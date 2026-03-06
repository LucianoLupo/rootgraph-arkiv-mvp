# Privacy-Preserving Techniques for On-Chain Job Applications

**Date:** 2026-03-04
**Purpose:** Deep research on hiding applicant identity in on-chain job application flows on Arkiv (public EVM L3, entity CRUD via precompiles, no smart contracts)

---

## Table of Contents

1. [Context: Arkiv Constraints](#1-context-arkiv-constraints)
2. [Per-Action Pseudonyms / Deterministic Pseudonymous Identifiers](#2-per-action-pseudonyms--deterministic-pseudonymous-identifiers)
3. [Stealth Addresses (EIP-5564)](#3-stealth-addresses-eip-5564)
4. [Commitment Schemes for Identity](#4-commitment-schemes-for-identity)
5. [ZK Identity Proofs](#5-zk-identity-proofs)
6. [Metadata-Resistant Application Systems](#6-metadata-resistant-application-systems)
7. [Comparison Matrix](#7-comparison-matrix)
8. [Recommendations for Arkiv MVP](#8-recommendations-for-arkiv-mvp)

---

## 1. Context: Arkiv Constraints

Before evaluating techniques, the constraints of Arkiv's entity model must be understood:

- **No smart contracts** -- all data operations are entity CRUD via precompile calls
- **Entities have an `owner` field** -- the `msg.sender` address, always visible on-chain
- **String attributes are plaintext indexed** -- queryable but not encrypted
- **Numeric attributes are plaintext indexed** -- same visibility concern
- **Payloads are arbitrary bytes** -- can hold encrypted data, but not natively searchable when encrypted
- **All writes are blockchain transactions** -- `tx.from` is always public
- **Entity keys are deterministic** -- derived from `keccak256(txHash + payload + operationIndex)`

**The core problem:** When Alice applies to Bob's job posting, the transaction is visible on-chain. Anyone can see that Alice's wallet created an "application" entity pointing to Bob's job. If Alice's wallet is linked to her profile, her identity is trivially revealed.

**Threat model for MVP:**
1. **Casual observer** -- someone browsing the block explorer should not trivially link applicant to application
2. **Job poster** -- should eventually learn the applicant's identity (after shortlisting or mutual reveal)
3. **Other applicants** -- should not know who else applied
4. **Chain analyst** -- a determined analyst with graph analysis tools (secondary concern for MVP)

---

## 2. Per-Action Pseudonyms / Deterministic Pseudonymous Identifiers

### How It Works

Generate a unique, deterministic pseudonym for each interaction context so that the same wallet produces different identifiers for different actions, breaking linkability.

**Core formula:**

```
pseudonym = HMAC-SHA256(secret_key, context_string)
```

Where:
- `secret_key` = a wallet-derived secret (e.g., signed message or derived key)
- `context_string` = action-specific context (e.g., `"apply:" + jobEntityKey`)

**Concrete implementation for job applications:**

```typescript
// Derive a per-wallet secret (one-time, stored client-side)
const walletSecret = await wallet.signMessage("RootGraph Pseudonym Seed v1");

// Generate per-job pseudonym
const pseudonym = hmacSHA256(
  walletSecret,
  `job-application:${jobEntityKey}`
);
// pseudonym is a 32-byte hex string, unlinkable across jobs
```

### Hash Scheme Choices

| Scheme | Properties | Use Case |
|--------|-----------|----------|
| **Plain SHA256** `sha256(wallet + context)` | No secret key -- anyone who knows the wallet address can compute the pseudonym. Linkable if context is guessable. | Not recommended for privacy. |
| **HMAC-SHA256** `hmac(secret, context)` | Requires knowledge of the secret to compute or verify. Deterministic for the same wallet+context. Resistant to brute-force if secret has sufficient entropy. | Recommended for per-action pseudonyms. |
| **HMAC-Keccak256** `hmac(secret, context)` using Keccak | Same properties as HMAC-SHA256 but uses Ethereum-native hash. Slightly better ecosystem fit. | Good alternative, but fewer standard libraries. |
| **Signed message hash** `keccak256(sign(context))` | Uses wallet's signing key directly. Deterministic per wallet+context (if using deterministic ECDSA). No separate secret needed. | Simple but signature is on-chain-visible if included. |

### Salting Strategies

1. **Application-level salt** -- a fixed salt embedded in the app (weak, if leaked all pseudonyms are computable)
2. **User-derived salt** -- derived from a signed message (recommended; user controls it, lost if wallet changes)
3. **Per-job salt** -- the job entity key itself serves as context diversifier (built into the HMAC context string)
4. **Rotating salt** -- change salt periodically to break temporal linkability (adds complexity, less useful for job apps)

### Pros

- Extremely simple to implement (pure cryptography, no external dependencies)
- Works entirely client-side -- no protocol changes needed
- Deterministic: same user applying to same job always gets same pseudonym (idempotent)
- The pseudonym can be stored as a string attribute on the application entity
- Zero gas overhead beyond normal entity creation

### Cons

- **Does not hide `tx.from`** -- the wallet address is still visible as entity owner and transaction sender
- Only provides pseudonymous *identifiers*, not transaction-level privacy
- The job poster must have a way to "resolve" the pseudonym to the real identity (requires a separate reveal step)
- If the wallet secret is compromised, all pseudonyms for that wallet are computable

### Implementation Complexity

**Very Low.** 10-20 lines of code. Uses standard crypto primitives.

### Available Libraries

- `crypto` (Node.js built-in) -- `crypto.createHmac('sha256', secret).update(context).digest('hex')`
- `@noble/hashes` -- `hmac(sha256, secret, context)` (audited, used by viem)
- `viem` -- can derive wallet secrets via `signMessage`
- `ethers.js` -- `ethers.utils.computeHmac('sha256', secret, context)`

### Gotchas

- The `owner` field on the Arkiv entity still reveals `msg.sender`. Pseudonyms only help if the application entity is created from a *different* address than the user's profile address. This means pseudonyms alone are insufficient without an additional layer (fresh wallet, relayer, or stealth address).
- HMAC-SHA256 with a signed-message seed means the pseudonym system is wallet-bound. If the user changes wallets, they lose their pseudonym mapping.
- Context strings must be carefully designed to avoid collisions while remaining deterministic.

---

## 3. Stealth Addresses (EIP-5564)

### How It Works

Stealth addresses allow a sender to generate a one-time address that only the intended recipient can detect and spend from, without any prior interaction. In the Arkiv context, the *applicant* would generate a stealth address to submit their application, so the application entity's `owner` is a fresh, unlinkable address.

**Protocol flow (simplified):**

1. **Setup:** Applicant has a key pair `(spending_privkey, spending_pubkey)` and `(viewing_privkey, viewing_pubkey)`. The combined stealth meta-address is published (e.g., on their profile or via ENS).
2. **Generation:** When applying to a job, the applicant:
   - Generates an ephemeral key pair `(ephemeral_privkey, ephemeral_pubkey)`
   - Computes shared secret: `S = ECDH(ephemeral_privkey, applicant_viewing_pubkey)` -- wait, this is inverted. In standard EIP-5564 the *sender* generates the stealth address for the *recipient*. For our use case, we need to adapt: the applicant generates a stealth address for *themselves*.
3. **Self-stealth variant:**
   - Applicant generates ephemeral key `e`
   - Computes `S = ECDH(e, own_viewing_pubkey)` (= `e * viewing_pubkey`)
   - Derives stealth private key: `stealth_privkey = spending_privkey + hash(S)`
   - Derives stealth address: `stealth_addr = pubkey_to_addr(spending_pubkey + hash(S) * G)`
   - Funds the stealth address (needs ETH for gas)
   - Submits the application entity from `stealth_addr`
   - Publishes `ephemeral_pubkey` alongside the application (as an attribute or in payload)

4. **Detection:** The applicant can later scan for their own stealth addresses by computing `ECDH(viewing_privkey, ephemeral_pubkey)` and checking if the derived address matches.

5. **Reveal to job poster:** When the applicant wants to reveal their identity, they can share their viewing key or simply sign a message from both the stealth address and their main address.

### Adaptation for Arkiv

The standard EIP-5564 flow assumes a *sender* hiding payments to a *recipient*. For job applications, the roles are different:

| Standard EIP-5564 | Job Application Adaptation |
|---|---|
| Sender generates stealth addr for recipient | Applicant generates stealth addr for themselves |
| Recipient scans announcements | Applicant already knows their stealth addrs |
| Announcement contract emits events | No contract needed -- ephemeral pubkey stored in entity attribute |

**Key insight:** We don't need the announcement contract or event scanning because the applicant knows their own stealth addresses. The ephemeral public key can be stored as a string attribute on the application entity for later verification.

### State of Adoption (2025-2026)

- **Umbra Protocol** (`umbra.cash`): Most mature implementation. 77,000+ stealth addresses generated. Deployed on Ethereum mainnet, Arbitrum, Optimism, Polygon. Uses EIP-5564 with SECP256k1 scheme.
- **Fluidkey**: Deployed on Base, Optimism, Arbitrum, Polygon, Gnosis, Ethereum mainnet. ENS-integrated. Generates stealth addresses server-side for better UX.
- **ScopeLift SDK**: TypeScript SDK implementing EIP-5564 and EIP-6538. Available on npm as `@scopelift/stealth-address-sdk`.
- **EIP status**: ERC-5564 is in "Review" status. Actively being refined with companion ERC-6538 (Stealth Meta-Address Registry).

### Can It Work on Non-Mainnet EVM Chains?

**Yes, with caveats:**
- The cryptographic operations (ECDH, key derivation) are chain-agnostic -- they happen client-side
- The stealth address is a standard Ethereum address, valid on any EVM chain
- The *announcement contract* (ERC-5564's `Announcer.sol`) would need to be deployed, but for our use case we don't need it since we store the ephemeral pubkey in entity attributes
- **The funding problem**: the stealth address needs ETH for gas on Kaolin. This requires either:
  - A gas relayer/paymaster (adds infrastructure)
  - The user pre-funding the stealth address from their main wallet (creates a linkable trace)
  - An on-chain faucet that drips gas to any address (possible on testnets)

### Pros

- Strong privacy: the application entity's `owner` is a fresh, unlinkable address
- Well-specified standard with multiple implementations
- Cryptographically sound (ECDH + SECP256k1)
- Works without smart contracts for the core key derivation
- Job poster can verify the reveal (applicant proves they control both addresses)

### Cons

- **Funding problem** is the biggest barrier -- the stealth address needs gas, and funding it creates linkability unless a relayer is used
- More complex UX: user must manage ephemeral keys and understand the reveal flow
- Requires the user to store ephemeral key material (lost keys = lost access to stealth identity)
- The entity `owner` is the stealth address, so the applicant cannot update/delete the application from their main wallet
- Overkill for hiding the *sender* when we really just need to hide the *applicant identity*

### Implementation Complexity

**Medium-High.** Requires ECDH key derivation, ephemeral key management, funding strategy, and reveal protocol. The crypto is well-understood but the UX flow is non-trivial.

### Available Libraries

| Library | npm Package | Notes |
|---------|------------|-------|
| ScopeLift Stealth Address SDK | `@scopelift/stealth-address-sdk` | Full EIP-5564 implementation. TypeScript. |
| Fluidkey Stealth Account Kit | `@fluidkey/stealth-account-kit` | Core crypto functions. Well-audited (Dedaub). |
| noble-secp256k1 | `@noble/secp256k1` | Low-level ECDH. Audited. Used by viem. |
| viem | `viem` | Can derive keys, sign messages. Foundation for building custom stealth logic. |

### Gotchas

- **Gas funding linkability**: If user sends ETH from their main wallet to the stealth address, the link is trivially discoverable on-chain. Mitigations: gas relayer, paymaster, or testnet faucet.
- **Key management burden**: Users must securely store or re-derive ephemeral keys. Browser storage is fragile.
- **Entity ownership**: Since the entity is owned by the stealth address, the user cannot manage it from their primary wallet without revealing the link.
- **View tag optimization** (1-byte tag for efficient scanning) is irrelevant for our self-stealth use case since the applicant already knows their addresses.

---

## 4. Commitment Schemes for Identity

### How It Works

The applicant commits to their identity by publishing a hash of their identity data, without revealing the data itself. Later, they can "reveal" by providing the preimage that matches the commitment.

**Two main approaches:**

#### 4.1 Hash Commitments (Simple)

```
commitment = keccak256(identity_data + random_nonce)
```

- **Commit phase:** Applicant creates an application entity with `commitment` as a string attribute. The entity payload can contain the encrypted application content.
- **Reveal phase:** Applicant sends the `(identity_data, nonce)` to the job poster (off-chain, e.g., via encrypted message). The poster verifies `keccak256(identity_data + nonce) == commitment`.

**Example in Arkiv:**

```typescript
// Commit phase
const nonce = crypto.randomBytes(32).toString('hex');
const identityData = JSON.stringify({
  profileEntityKey: "0xabc...",
  walletAddress: "0x123..."
});
const commitment = keccak256(
  encodePacked(['string', 'string'], [identityData, nonce])
);

// Create application entity with commitment
await createEntity({
  payload: encryptedApplicationContent,
  stringAttributes: [
    { key: "type", value: "application" },
    { key: "job", value: jobEntityKey },
    { key: "identity_commitment", value: commitment },
  ]
});

// Reveal phase (off-chain, to job poster only)
await sendEncryptedMessage(jobPoster, { identityData, nonce });
```

#### 4.2 Pedersen Commitments (Algebraic)

```
C = g^v * h^r  (over elliptic curve)
```

Where `v` is the value being committed to, `r` is a random blinding factor, and `g`, `h` are generator points.

**Advantages over hash commitments:**
- **Homomorphic** -- commitments can be added together: `C(a) + C(b) = C(a+b)`. Useful if you want to combine commitments without revealing individual values.
- **Perfect hiding** -- information-theoretically impossible to determine `v` from `C` (even with infinite compute)
- **Computational binding** -- computationally infeasible to find different `(v', r')` that produces the same `C`

**For job applications:** Pedersen commitments are overkill. The homomorphic property is unnecessary (we're not adding identities), and hash commitments provide sufficient hiding for our threat model.

### How the Recipient Resolves Identity

1. **Direct reveal:** Applicant sends `(identity, nonce)` to the job poster via an off-chain channel (encrypted DM, email, etc.)
2. **Conditional reveal via encryption:** Applicant encrypts `(identity, nonce)` with the job poster's public key and stores the ciphertext in the application entity payload. Only the job poster can decrypt.
3. **Staged reveal:** Commitment goes on-chain first. Once the job poster shortlists (signals interest), the applicant reveals. This prevents the poster from learning identities of applicants they're not interested in.

### Pros

- Very simple cryptography (just hashing)
- Works perfectly with Arkiv's entity model -- commitment is a string attribute
- The `owner` problem remains, but the *identity* is hidden even if the wallet is visible
- Supports staged reveal (privacy until mutual interest)
- No external infrastructure needed

### Cons

- **Does not hide `tx.from`** -- the submitting wallet address is still visible
- Only hides the *identity data*, not the *act of applying*
- If the user's wallet is already linked to their profile (same address), the commitment is pointless -- anyone can see the same wallet owns both the profile entity and the application entity
- Requires an off-chain channel for the reveal step
- The nonce must be stored securely by the applicant (lost nonce = cannot reveal)

### Implementation Complexity

**Very Low** for hash commitments. 5-10 lines of code. Pedersen commitments would be **Medium** (need elliptic curve arithmetic).

### Available Libraries

| Library | Use |
|---------|-----|
| `viem` | `keccak256`, `encodePacked` for hash commitments |
| `ethers.js` | `keccak256`, `solidityPack` |
| `@noble/hashes` | `sha256`, `keccak_256` |
| `@noble/curves` | Elliptic curve operations for Pedersen commitments |
| `pedersen-commitment` (Haskell) | Reference implementation (not practical for JS) |

### Gotchas

- **The `owner` link problem**: If the user creates both their profile entity and application entity from the same wallet, the commitment is moot. The chain reveals both are from the same address. Commitment schemes must be combined with address unlinkability (fresh wallet, stealth address, or relayer).
- **Replay protection**: Without a nonce, the same identity data always produces the same commitment, allowing correlation.
- **Timing analysis**: Even with commitments, if only one entity is created at a specific time from a specific address, the act itself may be revealing.

---

## 5. ZK Identity Proofs

### How It Works

Zero-knowledge proofs allow the applicant to prove a statement about their identity (e.g., "I hold a valid profile on RootGraph") without revealing *which* profile they hold.

#### 5.1 Semaphore Protocol

Semaphore is the most mature ZK group membership protocol. It allows:
- **Anonymous signaling** -- prove you're a member of a group without revealing which member
- **Double-signaling prevention** -- prevent the same member from signaling twice on the same topic (via nullifiers)

**How it applies to job applications:**

1. **Group setup:** All verified RootGraph profiles form a Semaphore group. Each profile's identity commitment (derived from an EdDSA key pair in Semaphore v4) is added as a leaf in a Merkle tree.
2. **Proof generation:** When applying, the applicant generates a ZK proof that:
   - They are a member of the RootGraph profiles group
   - They haven't already applied to this specific job (via nullifier)
3. **Verification:** The job poster (or anyone) can verify the proof without learning which profile generated it.

**Semaphore v4 specifics:**
- Uses EdDSA key pairs for identity (was Poseidon hash in v3)
- Groups use Lean Incremental Merkle Tree (LeanIMT) -- more efficient than v3
- Off-chain proof generation is supported via `@semaphore-protocol/core`
- Proof verification can happen off-chain (no smart contract needed)
- Nullifier hash: `hash(externalNullifier, identitySecret)` prevents double-signaling

**Key npm packages:**
- `@semaphore-protocol/core` -- all-in-one: identity, group, proof
- `@semaphore-protocol/identity` -- identity management
- `@semaphore-protocol/group` -- Merkle tree group management
- `@semaphore-protocol/proof` -- proof generation and verification

#### 5.2 Noir / Barretenberg (Custom ZK Circuits)

For more flexible ZK proofs, Noir (Aztec's ZK DSL) allows writing custom circuits:

```noir
// Pseudocode: prove membership without revealing identity
fn main(
    identity_commitment: pub Field,
    merkle_root: pub Field,
    merkle_path: [Field; DEPTH],
    merkle_indices: [Field; DEPTH],
    secret: Field,
    nullifier: Field,
) {
    // Verify identity_commitment = hash(secret)
    assert(identity_commitment == pedersen_hash(secret));

    // Verify Merkle proof
    let computed_root = compute_merkle_root(identity_commitment, merkle_path, merkle_indices);
    assert(computed_root == merkle_root);

    // Output nullifier for double-signal prevention
    let computed_nullifier = pedersen_hash(secret, external_nullifier);
    assert(computed_nullifier == nullifier);
}
```

**Noir ecosystem (2025-2026):**
- Noir 1.0 pre-release announced (November 2025)
- `@noir-lang/noir_js` -- JavaScript bindings for proof generation
- `@aztec/bb.js` -- Barretenberg proving backend for browsers
- Proofs can be generated entirely in the browser
- Verification can be done off-chain (no smart contract needed)
- Aztec Ignition Chain live as decentralized L2 (November 2025)

#### 5.3 Zupass / PCD Framework

Zupass (Proof-Carrying Data) is a framework for managing and verifying zero-knowledge credentials:

- Used by 800+ Zuzalu participants as a "digital passport"
- Supports anonymous group membership proofs (built on Semaphore)
- `@pcd/zuauth` npm package for authentication flows
- General Purpose Circuits (GPC) allow proving things about PODs (Provable Object Data) without custom circuit programming
- Could be used to issue "RootGraph Profile Holder" credentials that can be proven without revealing which profile

### Pros

- **Strongest privacy guarantee** -- mathematically proves membership without revealing identity
- Prevents double-application via nullifiers
- Proof verification can happen off-chain (compatible with Arkiv's no-smart-contract model)
- The proof itself can be stored as the application entity payload
- Semaphore v4 has production-ready npm packages

### Cons

- **Group management problem** -- who maintains the Merkle tree of all valid profiles? On Arkiv without smart contracts, this requires an off-chain service or the group must be reconstructed from on-chain entity data.
- **Proof generation is compute-intensive** -- browser-based proof generation takes 2-10 seconds depending on group size and device
- **Circuit constraints** -- if you need to prove additional properties (e.g., "I have 3+ years experience"), custom circuits are needed
- **Trust assumption for group** -- someone must build the Merkle tree from profile entities. If this is centralized, it's a trust point.
- **UX complexity** -- users need to understand ZK proofs, manage identity secrets
- **Large proof sizes** -- Groth16 proofs are ~256 bytes, but PLONK/Ultra proofs can be larger. Stored in entity payload.

### Implementation Complexity

**High.** Requires:
- Group management infrastructure (Merkle tree builder from Arkiv entities)
- Identity key management (separate from wallet keys for Semaphore v4)
- Proof generation UI (loading WASM circuits, computing proofs)
- Verification logic (off-chain service or client-side)
- Nullifier management (track which nullifiers are used to prevent double-apply)

For custom Noir circuits: **Very High** (circuit design, testing, trusted setup / SRS)

### Available Libraries

| Library | npm Package | Purpose |
|---------|------------|---------|
| Semaphore v4 | `@semaphore-protocol/core` | All-in-one identity + group + proof |
| Semaphore Identity | `@semaphore-protocol/identity` | EdDSA identity management |
| Semaphore Group | `@semaphore-protocol/group` | LeanIMT Merkle tree |
| Semaphore Proof | `@semaphore-protocol/proof` | ZK proof generation/verification |
| Noir JS | `@noir-lang/noir_js` | Custom ZK circuits in browser |
| Barretenberg | `@aztec/bb.js` | Proving backend |
| ZK-Kit | `@zk-kit/identity` | Identity primitives |
| Zupass/PCD | `@pcd/zuauth` | Anonymous auth flows |

### Gotchas

- **Group sync problem**: Semaphore groups must mirror the set of valid profiles on Arkiv. Since there's no smart contract to maintain the group, an off-chain indexer must scan Arkiv entities and build the Merkle tree. This introduces latency (new profiles aren't immediately provable) and a trust/availability dependency.
- **Identity binding**: Semaphore v4 uses EdDSA keys, not Ethereum keys. Users need a separate identity secret, adding key management overhead. The identity can be derived from a wallet signature for convenience.
- **Proof size**: Groth16 proofs are compact (~256 bytes) but require a trusted setup. PLONK proofs (used by Noir/Barretenberg) don't need trusted setup but are larger.
- **Browser performance**: Proof generation in mobile browsers can be slow (10+ seconds for large groups). Consider WebWorkers and showing loading indicators.

---

## 6. Metadata-Resistant Application Systems

### Real-World Examples and Approaches

#### 6.1 Encrypted Payload with Public Metadata

The simplest practical approach: store the application content encrypted in the entity payload, while using minimal, non-identifying metadata in string attributes.

```typescript
// Application entity on Arkiv
{
  payload: encrypt(applicationJSON, jobPosterPublicKey), // Only job poster can read
  stringAttributes: [
    { key: "type", value: "application" },
    { key: "job", value: jobEntityKey },
    // NO applicant identifier attributes
  ]
}
```

**Real-world parallel:** Academic blind review systems -- reviewers don't know author identity. The job poster downloads and decrypts all applications without knowing who submitted them until a reveal step.

#### 6.2 IPFS + Encrypted Links

Store application content on IPFS, encrypted with the job poster's public key. The on-chain entity contains only the IPFS CID.

- Used by research projects on encrypted resume management
- IPFS CID is a content hash -- doesn't reveal content without decryption key
- Adds external dependency (IPFS pinning service)

#### 6.3 Consortium/Relay-Based Systems

Academic research has proposed consortium blockchain frameworks for privacy-preserving recruitment:

- Students encrypt and upload resumes to the blockchain
- Strict access controls require student authorization for data retrieval
- Encrypted keyword search mechanisms for matching
- Relevant work: "Secure and efficient graduate employment" (PMC, 2025) using IPFS + consortium chain

#### 6.4 Oasis Network / Secret Network Confidential Compute

Privacy-focused L1 chains that encrypt state by default:

- **Oasis Network**: Oasis Privacy Layer (OPL) provides encrypted transactions and confidential state on EVM chains
- **Secret Network**: "Secret Contracts" encrypt inputs, outputs, and state using TEEs

These are not directly applicable to Arkiv (different chain), but the patterns are instructive: encrypted state with selective disclosure is the gold standard.

#### 6.5 Practical MVP Pattern: "Sealed Application Box"

Combining the simplest techniques into a practical system:

1. **Applicant creates a fresh wallet** (or uses a stealth address) specifically for applying
2. **Application content is encrypted** with the job poster's public key (ECIES or NaCl box)
3. **Application entity** is created from the fresh wallet, with:
   - Encrypted payload containing the full application + a commitment to the applicant's real identity
   - String attributes contain only `type=application`, `job=<key>`, and optionally `identity_commitment=<hash>`
4. **Job poster decrypts** the application content off-chain
5. **Mutual interest reveal:** If the poster is interested, they signal (e.g., create a "shortlist" entity). The applicant then reveals their real identity by providing the commitment preimage.

This pattern requires no ZK proofs, no external infrastructure beyond a fresh wallet funding mechanism, and provides reasonable privacy for an MVP.

---

## 7. Comparison Matrix

| Approach | Privacy Level | Impl. Complexity | UX Impact | Arkiv Compatibility | Hides tx.from | Hides Identity Data | Double-Apply Prevention | Reveal Mechanism |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|
| **Per-Action Pseudonyms** | Low | Very Low | None | Excellent | No | Partially | Via pseudonym | Share HMAC secret |
| **Stealth Addresses** | High | Medium-High | Medium (key mgmt) | Good (no contract needed for core crypto) | Yes | Yes | No (need separate mechanism) | Sign from both addresses |
| **Hash Commitments** | Low-Medium | Very Low | Low (nonce mgmt) | Excellent | No | Yes | No | Share preimage + nonce |
| **Pedersen Commitments** | Medium | Medium | Low | Good (payload only) | No | Yes | No | Share opening values |
| **Semaphore ZK Proofs** | Very High | High | High (proof gen, identity mgmt) | Medium (needs off-chain group manager) | No* | Yes | Yes (nullifiers) | Selective disclosure |
| **Custom Noir Circuits** | Very High | Very High | High | Medium (same as Semaphore) | No* | Yes | Yes | Custom reveal logic |
| **Zupass/PCD** | Very High | High | Medium (wallet-like UX) | Medium | No* | Yes | Configurable | PCD reveal |
| **Encrypted Payload Only** | Low | Very Low | None | Excellent | No | Yes (content only) | No | Decrypt + read |
| **Sealed Application Box** (combo) | Medium-High | Low-Medium | Low-Medium | Excellent | Yes (fresh wallet) | Yes | Via commitment | Commitment reveal |

*ZK approaches don't inherently hide `tx.from`, but the proof makes `tx.from` irrelevant since it can't be linked to any specific profile.

### Scoring Key
- **Privacy Level**: How well the approach hides the applicant's identity from various threat actors
- **Impl. Complexity**: Engineering effort to build and maintain
- **UX Impact**: How much the approach burdens the end user
- **Arkiv Compatibility**: How well it fits Arkiv's entity model (plaintext attributes, no smart contracts, entities owned by `msg.sender`)

---

## 8. Recommendations for Arkiv MVP

### Tier 1: MVP (Ship Now)

**Approach: Encrypted Payloads + Hash Commitment + Fresh Wallet Advisory**

1. **Encrypt application content** with the job poster's public key using ECIES (via `@noble/curves`) or NaCl box (`tweetnacl`). Store ciphertext as entity payload.
2. **Hash commitment** of applicant identity stored as string attribute: `identity_commitment = keccak256(profileKey + nonce)`.
3. **Advise users** to create a fresh wallet for applications (document it in the UX, but don't enforce).
4. **Reveal flow:** When job poster expresses interest, applicant shares `(profileKey, nonce)` via encrypted DM.

**Why:** Minimal implementation effort. Works entirely within Arkiv's entity model. Provides meaningful privacy against casual observers. The main weakness (wallet linkability) is acceptable for an MVP where the testnet has low traffic.

**Estimated effort:** 1-2 days

### Tier 2: Post-MVP Enhancement

**Approach: Client-Side Stealth Addresses for Application Submission**

1. Implement self-stealth address generation using `@scopelift/stealth-address-sdk` or `@noble/secp256k1`.
2. Auto-generate a fresh stealth address per application.
3. Solve the gas funding problem with a simple faucet (acceptable on testnet) or lightweight relayer.
4. Store ephemeral public key as entity attribute for later verification.

**Why:** Breaks the `owner` linkability problem. Well-understood cryptography with available libraries. The gas funding problem is solvable on testnet.

**Estimated effort:** 3-5 days (including faucet/funding mechanism)

### Tier 3: Future (If Privacy Becomes Core Feature)

**Approach: Semaphore ZK Group Membership**

1. Build an off-chain indexer that maintains a Semaphore group of all valid profile identity commitments.
2. Applicants generate ZK proofs of profile membership.
3. Proofs stored as entity payloads; nullifiers prevent double-application.
4. Selective reveal via the Semaphore identity secret.

**Why:** Gold standard for anonymous applications. Mathematically strong privacy. But requires significant infrastructure (group indexer, identity management UX) that's not justified for an MVP.

**Estimated effort:** 2-4 weeks

### Implementation Notes for All Tiers

- **Job poster public key**: Must be published (e.g., as a string attribute on the job entity) so applicants can encrypt to it. Can derive from the wallet public key.
- **Encrypted DM for reveals**: Requires a messaging system or can use an existing one (e.g., XMTP, which supports wallet-to-wallet encrypted messaging).
- **Key derivation from wallet**: Use `signMessage("RootGraph Privacy Key v1")` to derive deterministic secrets without exposing the private key. The signed message acts as a seed for HMAC secrets, commitment nonces, and Semaphore identities.

---

## Sources

- [ERC-5564: Stealth Addresses Specification](https://eips.ethereum.org/EIPS/eip-5564)
- [ScopeLift Stealth Address SDK](https://github.com/ScopeLift/stealth-address-sdk)
- [Fluidkey Stealth Account Kit](https://github.com/fluidkey/fluidkey-stealth-account-kit)
- [Fluidkey Technical Walkthrough](https://docs.fluidkey.com/technical-documentation/technical-walkthrough)
- [Umbra Protocol](https://github.com/ScopeLift/umbra-protocol)
- [Semaphore Protocol](https://semaphore.pse.dev/)
- [Semaphore v4 Release](https://github.com/semaphore-protocol/semaphore/releases/tag/v4.0.0)
- [Semaphore Documentation](https://docs.semaphore.pse.dev/)
- [Noir Language Documentation](https://noir-lang.org/docs/)
- [Noir 1.0 Pre-Release Announcement](https://aztec.network/blog/the-future-of-zk-development-is-here-announcing-the-noir-1-0-pre-release)
- [NoirJS for Browser ZK](https://aztec.network/blog/announcing-noirjs-privacy-preserving-zk-applications-in-your-browser)
- [QuickNode: Stealth Addresses on Ethereum](https://www.quicknode.com/guides/ethereum-development/wallets/how-to-use-stealth-addresses-on-ethereum-eip-5564)
- [RareSkills: Pedersen Commitments](https://rareskills.io/post/pedersen-commitment)
- [Commitment Schemes Overview (RootstockLabs)](https://medium.com/iovlabs-innovation-stories/commitment-schemes-4f3590be8c5)
- [Gitcoin: Commit-Reveal Scheme](https://www.gitcoin.co/blog/commit-reveal-scheme-on-ethereum)
- [World ID Privacy Deep Dive](https://world.org/blog/developers/privacy-deep-dive)
- [World ID and Semaphore](https://world.org/blog/world/intro-zero-knowledge-proofs-semaphore-application-world-id)
- [Zupass / PCD Framework](https://github.com/proofcarryingdata/zupass)
- [PCD SDK Documentation](https://docs.pcd.team/)
- [noble-secp256k1](https://github.com/paulmillr/noble-secp256k1)
- [Anonymity Analysis of Umbra (ACM 2024)](https://dl.acm.org/doi/10.1145/3589335.3651963)
- [Salted SHA-256 Pseudonymization](https://www.emergentmind.com/topics/salted-sha-256-pseudonymization)
- [Ethereum Pseudonymity Survey (ScienceDirect 2024)](https://www.sciencedirect.com/science/article/abs/pii/S1084804524001966)
- [Privacy-Preserving Job Search Platform (ResearchGate)](https://www.researchgate.net/publication/375127846_A_Transparent_and_Privacy-Preserving_Job_Search_Platform_Built_on_the_Ethereum_Blockchain_Framework)
- [Oasis Network Smart Privacy](https://oasis.net/build)
