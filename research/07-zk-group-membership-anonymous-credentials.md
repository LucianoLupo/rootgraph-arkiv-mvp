# ZK Group Membership Proofs & Anonymous Credential Systems

**Research Date:** 2026-03-04
**Purpose:** Evaluate approaches for proving "I am a registered user of this platform" without revealing which user, for hiding job applicant identities on a public blockchain (Arkiv entity CRUD, no smart contracts, browser-only).

---

## Table of Contents

1. [Semaphore Protocol (v4)](#1-semaphore-protocol-v4)
2. [Noir-Based Group Membership](#2-noir-based-group-membership)
3. [Rate-Limiting Nullifiers (RLN)](#3-rate-limiting-nullifiers-rln)
4. [Anonymous Credentials (BBS+)](#4-anonymous-credentials-bbs)
5. [Practical Implementation Flow](#5-practical-implementation-flow)
6. [Feasibility Assessment](#6-feasibility-assessment)
7. [Recommendation](#7-recommendation)

---

## 1. Semaphore Protocol (v4)

### Overview

Semaphore is a zero-knowledge protocol by Privacy & Scaling Explorations (Ethereum Foundation) that enables anonymous group membership proofs and signaling. Users prove they belong to a group (Merkle tree of identity commitments) without revealing which member they are.

- **Repository:** https://github.com/semaphore-protocol/semaphore
- **Docs:** https://docs.semaphore.pse.dev/
- **Current version:** v4.13.0+ (active development, not backward compatible with v3)

### How It Works

```
1. User creates an Identity (EdDSA keypair + Poseidon commitment)
2. Identity commitment is added as a leaf in a Merkle tree (the "group")
3. User generates a ZK proof that:
   - Their commitment is in the tree (Merkle inclusion proof)
   - They know the private key for that commitment
   - A nullifier is derived from (scope + secret) to prevent double-signaling
4. Verifier checks the proof against the group's Merkle root
```

**Cryptographic primitives in v4:**
- **Identity:** EdDSA keypair on Baby Jubjub curve (changed from Poseidon-based in v3)
- **Hashing:** Poseidon hash for Merkle tree and nullifier computation
- **Tree:** LeanIMT (Lean Incremental Merkle Tree), supports depths 1-32
- **Proof system:** Groth16 SNARKs (via snarkjs)

### NPM Packages

```bash
# All-in-one
npm install @semaphore-protocol/core@4.13.0

# Individual packages
npm install @semaphore-protocol/identity@4.13.0
npm install @semaphore-protocol/group@4.13.0
npm install @semaphore-protocol/proof@4.14.0
```

### Code Examples

**Identity creation:**
```typescript
import { Identity } from "@semaphore-protocol/identity"

// Random identity
const identity = new Identity()
console.log(identity.privateKey)  // EdDSA private key
console.log(identity.publicKey)   // EdDSA public key
console.log(identity.commitment)  // Poseidon hash of publicKey (bigint)

// Deterministic from secret
const identity2 = new Identity("my-secret-seed")

// Export/import for persistence
const exported = identity.export()  // base64 string
const restored = Identity.import(exported)

// Sign messages (useful for linking proofs to actions)
const signature = identity.signMessage("apply-to-job-123")
Identity.verifySignature("apply-to-job-123", signature, identity.publicKey)
```

**Group management (off-chain, no contracts needed):**
```typescript
import { Group } from "@semaphore-protocol/group"

// Create empty group
const group = new Group()

// Add members by their identity commitments
group.addMember(identity1.commitment)
group.addMember(identity2.commitment)
group.addMember(identity3.commitment)

// Bulk add
group.addMembers([commitment1, commitment2, commitment3])

// Remove member (sets leaf to zero, preserving tree structure)
group.removeMember(0) // by index

// Update member
group.updateMember(0, newCommitment)

// Generate Merkle proof for a member
const merkleProof = group.generateMerkleProof(0)

// Group properties
console.log(group.root)    // Current Merkle root
console.log(group.depth)   // Tree depth
console.log(group.size)    // Number of members
```

**Proof generation and verification (fully off-chain, browser-compatible):**
```typescript
import { generateProof, verifyProof } from "@semaphore-protocol/proof"

// Generate proof
const proof = await generateProof(
  identity,           // The prover's Identity object
  group,              // Group object OR MerkleProof
  "job-application",  // message: arbitrary signal (e.g., application data hash)
  "job-posting-123",  // scope: prevents double-signaling per scope
  // merkleTreeDepth,  // optional, auto-inferred from group
  // snarkArtifacts,   // optional, auto-fetched from snark-artifacts.pse.dev
)

// proof contains:
// - proof.merkleTreeDepth
// - proof.merkleTreeRoot  (the group's root at proof time)
// - proof.nullifier       (unique per identity+scope, prevents double-proving)
// - proof.message         (the signal)
// - proof.scope           (the scope)
// - proof.points          (the actual SNARK proof data)

// Verify proof (no group/identity needed, self-contained)
const isValid = await verifyProof(proof)
```

### Browser Compatibility

- **Works in browser:** Yes. Uses snarkjs WASM backend.
- **SNARK artifacts:** Auto-downloaded from `snark-artifacts.pse.dev` on first proof generation. Artifacts are cached. Sizes vary by tree depth.
- **Multithreading:** Supported in browsers with SharedArrayBuffer (requires COOP/COEP headers). Falls back to single-threaded.
- **Mobile:** Works on mobile browsers.

### Off-Chain / No Smart Contracts

Semaphore v4 **fully supports off-chain operation.** The `@semaphore-protocol/group` package manages groups entirely in JavaScript. The `verifyProof` function verifies proofs without any blockchain interaction. The on-chain contracts (`@semaphore-protocol/contracts`) are optional and only needed if you want on-chain group management or on-chain verification.

**For our use case (Arkiv CRUD, no smart contracts):** Groups can be stored as serialized Merkle tree state in Arkiv entities. Proof verification happens client-side in the browser. The only shared state needed is the group's Merkle root (and optionally the full member list for reconstruction).

### Limitations

- Groups with 1-2 members cannot guarantee anonymity (anonymity set too small).
- Nullifiers are deterministic per identity+scope -- if scope is reused, double-signaling is detectable.
- SNARK artifact download adds latency on first proof generation (~seconds, depends on tree depth).
- No built-in mechanism for "conditional deanonymization" -- identity is either anonymous or not.

---

## 2. Noir-Based Group Membership

### Overview

Noir is Aztec's domain-specific language for writing ZK circuits. It compiles to an intermediate representation that can be proven using multiple backends (primarily Barretenberg/UltraPlonk). NoirJS enables browser-based proof generation via WASM.

Since we already use Noir in the project, building Semaphore-like group membership proofs in Noir avoids adding a second ZK stack.

### Noir Standard Library: Merkle Proofs

Noir's stdlib includes `std::merkle::compute_merkle_root` which uses Poseidon hashing:

```noir
use std::merkle::compute_merkle_root;
use std::hash::poseidon::bn254::hash_2;

// Verify that a leaf is in the Merkle tree with the given root
fn main(
    root: pub Field,              // Public: the group's Merkle root
    nullifier_hash: pub Field,    // Public: prevents double-signaling
    leaf: Field,                  // Private: the user's identity commitment
    path_indices: [Field; 20],    // Private: path in the tree (depth 20)
    siblings: [Field; 20],        // Private: sibling hashes
    secret: Field,                // Private: user's secret key
    scope: pub Field,             // Public: scope for nullifier
) {
    // 1. Verify identity commitment = hash(secret)
    let commitment = hash_2([secret, 0]);
    assert(commitment == leaf);

    // 2. Verify Merkle inclusion
    let computed_root = compute_merkle_root(leaf, path_indices, siblings);
    assert(computed_root == root);

    // 3. Compute and verify nullifier (prevents double-signaling)
    let expected_nullifier = hash_2([secret, scope]);
    assert(expected_nullifier == nullifier_hash);
}
```

### Custom Merkle Root Implementation (if stdlib version doesn't fit)

From the `tomoima525/noir-merkle-root` library:

```noir
use dep::std;

fn compute_merkle_root(leaf: Field, path_indices: [Field], siblings: [Field]) -> Field {
    let n = siblings.len();
    let mut current = leaf;
    for i in 0..n {
        let is_right = (path_indices[i] == 1) as bool;
        let (hash_left, hash_right) = if is_right {
            (siblings[i], current)
        } else {
            (current, siblings[i])
        };
        current = std::hash::poseidon::bn254::hash_2([hash_left, hash_right]);
    };
    current
}
```

### NoirJS Browser Integration

**Required packages:**
```bash
npm install @noir-lang/noir_js @aztec/bb.js
```

**Browser proof generation flow:**
```typescript
import { Noir } from "@noir-lang/noir_js";
import { BarretenbergBackend } from "@aztec/bb.js";
import circuit from "./circuit/target/circuit.json";

// 1. Initialize backend
const backend = new BarretenbergBackend(circuit);
const noir = new Noir(circuit);

// 2. Prepare inputs
const inputs = {
  root: groupMerkleRoot,
  nullifier_hash: computedNullifier,
  leaf: identityCommitment,
  path_indices: merklePathIndices,
  siblings: merkleSiblings,
  secret: userSecret,
  scope: jobPostingId,
};

// 3. Generate witness (execute circuit)
const { witness } = await noir.execute(inputs);

// 4. Generate proof
const proof = await backend.generateProof(witness);

// 5. Verify proof
const isValid = await backend.verifyProof(proof);
```

### Performance in Browser

- **Witness generation:** Not multithreaded. For a ~512k constraint circuit, ~12 seconds.
- **Proof generation:** Depends on circuit size. A Merkle tree depth-20 proof likely has ~50k-100k constraints. Estimated 3-10 seconds on modern hardware.
- **Max circuit size:** 2^19 gates (524,288) due to WASM 4GB memory limit.
- **Multithreading:** Supported with SharedArrayBuffer (COOP/COEP headers). Falls back to single-threaded otherwise.
- **A depth-20 Merkle tree circuit** should be well within limits. Each Poseidon hash level adds ~250-500 constraints, so 20 levels = ~5,000-10,000 constraints for the Merkle proof alone.

### Existing Noir Libraries

| Library | Description | URL |
|---------|-------------|-----|
| `noir-merkle-root` | Merkle root computation with Poseidon | github.com/tomoima525/noir-merkle-root |
| Noir stdlib `std::merkle` | Built-in Merkle root computation | Built into Noir |
| Noir stdlib `std::hash::poseidon` | Poseidon hash | Built into Noir |
| `awesome-noir` | Curated list of Noir projects | github.com/noir-lang/awesome-noir |

### Advantages Over Semaphore for Our Case

1. **Single ZK stack:** We already use Noir. No need to add Circom/snarkjs.
2. **Custom circuit:** We can add application-specific constraints (e.g., prove profile has certain fields, prove registration timestamp).
3. **Smaller artifacts:** Custom circuit = smaller proving key than Semaphore's general-purpose circuit.
4. **No trusted setup dependency:** Barretenberg uses UltraPlonk (universal setup), not circuit-specific trusted setup like Groth16.

### Disadvantages

1. **More work:** We'd build the group management, nullifier logic, and verification from scratch instead of using Semaphore's battle-tested packages.
2. **No community tooling:** Semaphore has a rich ecosystem; a custom Noir circuit is DIY.
3. **Auditing:** Semaphore has been audited; our custom circuit would not be.

---

## 3. Rate-Limiting Nullifiers (RLN)

### Overview

RLN extends Semaphore to allow **N actions per epoch** instead of just one. Built by Privacy & Scaling Explorations (same team as Semaphore). Uses Shamir's Secret Sharing to enable "slashing" -- if a user exceeds the rate limit, their secret key can be reconstructed.

- **Docs:** https://rate-limiting-nullifier.github.io/rln-docs/
- **GitHub:** https://github.com/Rate-Limiting-Nullifier
- **NPM:** `rlnjs`
- **Status:** Research/experimental. Less mature than Semaphore.

### How It Works

```
Standard Semaphore: 1 signal per scope (nullifier = hash(secret, scope))
RLN: N signals per epoch, using Shamir polynomial evaluation

For each message in an epoch:
1. User evaluates a degree-1 polynomial: y = a0 + a1 * x
   - a0 = user's secret key
   - a1 = hash(a0, epoch, rln_identifier)
   - x = hash(message)
2. User provides (x, y) as part of the proof
3. If user sends >1 message in same epoch, two (x,y) points exist
   → Lagrange interpolation recovers a0 (the secret key)
   → User is "slashed" (secret revealed)
```

**For N messages per epoch (messageLimit > 1):**
```
Each message gets a messageId (0 to messageLimit-1)
The polynomial depends on messageId:
  a1 = hash(a0, epoch, rln_identifier, messageId)

This means each messageId produces a different polynomial,
so sending messageLimit messages with different messageIds is safe.
Sending two messages with the SAME messageId reveals the secret.
```

### Nullifier System

```
internal_nullifier = hash(a1)  // same for all messages with same (epoch, messageId)
external_nullifier = hash(epoch, rln_identifier)

If two proofs share the same internal_nullifier → same user, same epoch, same messageId
→ BREACH: secret can be recovered from the two (x,y) shares
```

### JavaScript Library (rlnjs)

```bash
npm install rlnjs
```

```typescript
import { RLN } from "rlnjs"
import { MemoryMessageIDCounter, Registry } from "rlnjs"

// Create a shared registry
const rlnIdentifier = BigInt("unique-app-id-hash")
const registry = new Registry()  // or a custom registry backed by Arkiv

// Create RLN instance for a user
const rln = new RLN({
  rlnIdentifier,
  registry,
  // treeDepth, wasmFilePath, zkeyFilePath...
})

// Register user (adds identity commitment to registry)
await rln.register()

// Generate a proof for a message in an epoch
const epoch = BigInt(Math.floor(Date.now() / 60000)) // 1-minute epochs
const proof = await rln.createProof({
  epoch,
  message: "application-data-hash",
  messageId: 0,           // first message in this epoch
  messageLimit: 3,         // allow 3 applications per epoch
})

// Verify proof
const result = await rln.verifyProof(proof)

// Check for rate limit breaches
const saveResult = rln.saveProof(proof)
// saveResult.status: "VALID" | "DUPLICATE" | "BREACH"
// if BREACH: saveResult.secret contains the recovered secret key
```

### Relevance to Job Applications

RLN could enforce: "A user can apply to at most N jobs per time period." If they exceed the limit, their identity is revealed (slashing). This prevents:
- Spam applications
- Sybil attacks (one person creating many identities to apply multiple times)

**But:** The slashing mechanism (revealing the secret) may be too aggressive for a job board. You might want rate-limiting without the punishment of identity exposure. In that case, you'd use the nullifier system to detect duplicates and simply reject the proof, without implementing the Shamir recovery.

### Feasibility for Our Use Case

- **Maturity:** Less mature than Semaphore. The `rlnjs` library is experimental.
- **Browser support:** Uses the same snarkjs backend as Semaphore, so browser-compatible.
- **Complexity:** Adds significant complexity over basic Semaphore.
- **Verdict:** Useful concept for rate-limiting applications, but implementing basic Semaphore-style nullifiers (1 application per job posting per identity) is simpler and sufficient for MVP.

---

## 4. Anonymous Credentials (BBS+)

### Overview

BBS+ signatures are a multi-message signature scheme that supports:
- **Selective disclosure:** Sign N attributes, reveal only a subset
- **Unlinkability:** Multiple presentations of the same credential cannot be linked
- **Zero-knowledge proofs of knowledge:** Prove you hold a valid signature without revealing the signature itself

This is the approach used by Verifiable Credentials (W3C) for privacy-preserving identity.

### How BBS+ Works for Anonymous Credentials

```
1. Issuer (platform) generates a BLS12-381 keypair
2. Issuer signs a credential with multiple messages:
   [userId, registrationDate, profileType, ...]
3. Holder receives the signature
4. Holder creates a ZK proof revealing ONLY selected messages:
   - Proves: "I hold a valid signature from this issuer"
   - Reveals: "profileType = 'verified'" (but not userId)
   - Hides: userId, registrationDate
5. Verifier checks the proof against the issuer's public key
```

### JavaScript Implementations

**@mattrglobal/bbs-signatures (deprecated, but still functional):**
```bash
npm install @mattrglobal/bbs-signatures
```

```typescript
import {
  generateBls12381G2KeyPair,
  blsSign,
  blsVerify,
  blsCreateProof,
  blsVerifyProof,
} from "@mattrglobal/bbs-signatures"

// 1. Platform generates issuer keypair
const keyPair = await generateBls12381G2KeyPair()

// 2. Platform signs a credential (multiple messages)
const messages = [
  Uint8Array.from(Buffer.from("user-id-123")),           // message[0]: hidden
  Uint8Array.from(Buffer.from("2024-01-15")),             // message[1]: hidden
  Uint8Array.from(Buffer.from("verified-professional")),  // message[2]: revealed
]

const signature = await blsSign({
  keyPair,
  messages,
})

// 3. User creates a selective disclosure proof
const proof = await blsCreateProof({
  signature,
  publicKey: keyPair.publicKey,
  messages,
  revealed: [2],  // Only reveal message[2] ("verified-professional")
  nonce: Uint8Array.from(Buffer.from("unique-nonce")),
})

// 4. Verifier checks the proof
const isProofValid = await blsVerifyProof({
  proof,
  publicKey: keyPair.publicKey,
  messages: [messages[2]],  // Only the revealed messages
  revealed: [2],
  messageCount: 3,
  nonce: Uint8Array.from(Buffer.from("unique-nonce")),
})
```

**Note:** `@mattrglobal/bbs-signatures` has been deprecated in favor of `@mattrglobal/pairing-crypto`, but the API is well-documented and the WASM bundle works in browsers.

**Dock Network SDK (more complete anonymous credential system):**
```bash
npm install @docknetwork/crypto-wasm-ts
```

The Dock SDK provides a full anonymous credential system built on BBS+, including:
- Credential issuance with BBS+ signatures
- Selective disclosure proofs
- Accumulator-based revocation
- Presentation creation and verification

### BBS+ vs Semaphore for Our Use Case

| Feature | Semaphore | BBS+ |
|---------|-----------|------|
| Proves group membership | Yes (Merkle tree) | Yes (valid signature) |
| Prevents double-signaling | Yes (nullifiers) | No (unlinkable by design) |
| Selective attribute disclosure | No | Yes |
| Requires shared state | Yes (Merkle root) | No (just issuer public key) |
| Credential revocation | Remove from tree | Accumulator-based |
| Issuer required | No (self-service tree) | Yes (trusted signer) |
| Browser support | Yes (snarkjs WASM) | Yes (BLS12-381 WASM) |
| Maturity | High | Medium-High |

### Key Tradeoff

BBS+ gives you **selective disclosure** (prove attributes about yourself without revealing identity) but **no nullifiers** (can't prevent double-signaling because unlinkability means you can't detect the same credential being used twice).

Semaphore gives you **nullifiers** (prevent double-signaling per scope) but **no selective disclosure** (you either prove membership or you don't; no attribute revelation).

**For job applications, we need both:** membership proof (you're a real user) + nullifiers (you can only apply once per job). This points to Semaphore or a Noir-based custom circuit.

---

## 5. Practical Implementation Flow

### End-to-End Architecture for Arkiv (No Smart Contracts)

```
┌─────────────────────────────────────────────────────────────┐
│                    REGISTRATION PHASE                        │
│                                                              │
│  1. User creates Semaphore/Noir Identity in browser          │
│     - Stores private key in localStorage/wallet              │
│     - Derives identity commitment (public)                   │
│                                                              │
│  2. User registers profile on Arkiv                          │
│     - Profile entity includes identity commitment            │
│     - Platform maintains a "registered users" group           │
│     - Group = Merkle tree of all identity commitments         │
│     - Group state stored as Arkiv entity                      │
│                                                              │
│  3. Group Merkle root is published/shared                    │
│     - Any user can verify the group state                    │
│     - Root changes when members are added/removed            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   APPLICATION PHASE                          │
│                                                              │
│  4. User wants to apply to a job anonymously                 │
│     - Downloads current group state (member list)            │
│     - Reconstructs Merkle tree locally                       │
│     - Generates ZK proof:                                    │
│       * "I am in this group" (Merkle inclusion)              │
│       * scope = jobPostingId (prevents double-apply)         │
│       * message = hash(applicationData)                      │
│       * nullifier = hash(secret, scope)                      │
│                                                              │
│  5. Application is stored on Arkiv/chain                     │
│     - Contains: proof, nullifier, merkleRoot, message        │
│     - Does NOT contain: identity, commitment, index          │
│                                                              │
│  6. Job poster verifies the proof                            │
│     - Checks proof validity (verifyProof)                    │
│     - Checks merkleRoot matches current/recent group root    │
│     - Checks nullifier hasn't been used before for this job  │
│     - Confirms: "This is a real registered user"             │
│     - Cannot determine: "Which user this is"                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│               CONDITIONAL IDENTITY REVEAL                    │
│                                                              │
│  Option A: Encrypted Identity Escrow                         │
│  ─────────────────────────────────────                       │
│  Along with the ZK proof, the applicant encrypts their       │
│  identity (or a link to their profile) using the job         │
│  poster's public key. This ciphertext is stored alongside    │
│  the application. The job poster can only decrypt it after   │
│  deciding to "accept" (or at any time, depending on UX).     │
│                                                              │
│  Implementation:                                             │
│  - Applicant: encrypt(profileId, posterPublicKey)            │
│  - Stored: { proof, nullifier, encryptedIdentity }           │
│  - Poster decrypts when ready: decrypt(ciphertext, posterPK) │
│                                                              │
│  Note: This is NOT enforced by ZK -- the poster could        │
│  decrypt immediately. It's a UX/trust convention, not a      │
│  cryptographic guarantee. For true enforcement, you'd need   │
│  a trusted third party or timelock encryption.               │
│                                                              │
│  Option B: Verifiable Encryption (Advanced)                  │
│  ──────────────────────────────────────────                   │
│  The applicant proves in ZK that the ciphertext correctly    │
│  encrypts their identity commitment. This prevents the       │
│  applicant from encrypting a fake identity. Requires adding  │
│  encryption verification to the ZK circuit (complex).        │
│                                                              │
│  Option C: Trusted Reveal via Platform                       │
│  ─────────────────────────────────────                       │
│  The platform (as a semi-trusted entity) holds the mapping   │
│  from nullifiers to identities. When a poster "accepts" an   │
│  application, the platform reveals the identity. This is     │
│  simpler but requires trusting the platform.                 │
└─────────────────────────────────────────────────────────────┘
```

### Concrete Implementation with Semaphore v4 (Simplest Path)

```typescript
// === REGISTRATION (runs once per user) ===

import { Identity } from "@semaphore-protocol/identity"
import { Group } from "@semaphore-protocol/group"

// User creates identity
const identity = new Identity()
const privateKeyBase64 = identity.export()
localStorage.setItem("semaphore-identity", privateKeyBase64)

// Platform adds commitment to group (stored in Arkiv)
const group = new Group()
// Load existing members from Arkiv entity...
existingMembers.forEach(m => group.addMember(BigInt(m)))
// Add new member
group.addMember(identity.commitment)
// Save updated group to Arkiv
await arkiv.updateEntity("registered-users-group", {
  members: group.members.map(String),
  root: group.root.toString(),
})


// === APPLICATION (runs each time user applies) ===

import { generateProof, verifyProof } from "@semaphore-protocol/proof"
import { Identity } from "@semaphore-protocol/identity"
import { Group } from "@semaphore-protocol/group"
import { encrypt } from "./crypto"  // nacl/tweetnacl box encryption

// Restore identity
const identity = Identity.import(localStorage.getItem("semaphore-identity")!)

// Reconstruct group from Arkiv
const groupData = await arkiv.getEntity("registered-users-group")
const group = new Group(groupData.members.map(BigInt))

// Generate anonymous proof
const applicationData = JSON.stringify({
  coverLetter: "...",
  portfolioHash: "0x...",
})
const proof = await generateProof(
  identity,
  group,
  hashMessage(applicationData),  // message
  jobPostingId,                   // scope (1 application per job)
)

// Encrypt identity for conditional reveal
const encryptedIdentity = encrypt(
  identity.commitment.toString(),
  jobPosterPublicKey
)

// Submit application to Arkiv
await arkiv.createEntity("job-application", {
  jobId: jobPostingId,
  proof: JSON.stringify(proof),
  nullifier: proof.nullifier.toString(),
  merkleRoot: proof.merkleTreeRoot.toString(),
  applicationDataHash: hashMessage(applicationData),
  encryptedIdentity: encryptedIdentity,
  // NO identity commitment, NO member index
})


// === VERIFICATION (job poster checks application) ===

const application = await arkiv.getEntity(applicationId)
const proof = JSON.parse(application.proof)

// 1. Verify ZK proof
const isValid = await verifyProof(proof)

// 2. Check root matches (or is recent enough)
const currentGroup = await arkiv.getEntity("registered-users-group")
const rootMatches = proof.merkleTreeRoot.toString() === currentGroup.root

// 3. Check nullifier hasn't been used (prevents double-apply)
const existingApps = await arkiv.queryEntities("job-application", {
  jobId: jobPostingId,
  nullifier: proof.nullifier.toString(),
})
const isFirstApplication = existingApps.length === 1  // only this one

// 4. If all checks pass, application is from a real registered user
if (isValid && rootMatches && isFirstApplication) {
  // Valid anonymous application!
}

// 5. To reveal identity (after accepting):
const identityCommitment = decrypt(
  application.encryptedIdentity,
  jobPosterPrivateKey
)
// Look up profile by commitment
const profile = await arkiv.queryEntities("profile", {
  identityCommitment: identityCommitment,
})
```

### Concrete Implementation with Noir (Custom Circuit)

```noir
// circuit/src/main.nr
use std::merkle::compute_merkle_root;
use std::hash::poseidon::bn254::hash_2;

fn main(
    // Public inputs
    root: pub Field,
    nullifier_hash: pub Field,
    signal_hash: pub Field,
    scope: pub Field,

    // Private inputs
    secret: Field,
    path_indices: [Field; 20],
    siblings: [Field; 20],
) {
    // 1. Compute identity commitment from secret
    let commitment = hash_2([secret, 0]);

    // 2. Verify Merkle membership
    let computed_root = compute_merkle_root(commitment, path_indices, siblings);
    assert(computed_root == root);

    // 3. Verify nullifier (prevents double-signaling for this scope)
    let computed_nullifier = hash_2([secret, scope]);
    assert(computed_nullifier == nullifier_hash);

    // 4. Bind the signal to the proof (prevents front-running)
    // Signal hash is a public input, so it's bound to the proof
    // but doesn't need verification inside the circuit
    let _ = signal_hash;
}
```

```typescript
// TypeScript integration
import { Noir } from "@noir-lang/noir_js";
import { BarretenbergBackend } from "@aztec/bb.js";
import circuit from "./circuit/target/circuit.json";

async function generateMembershipProof(
  secret: bigint,
  groupMembers: bigint[],
  memberIndex: number,
  scope: string,
  signal: string,
) {
  // Build Merkle tree locally
  const tree = buildPoseidonMerkleTree(groupMembers, 20);
  const { pathIndices, siblings } = tree.getProof(memberIndex);

  // Compute nullifier
  const nullifier = poseidonHash([secret, BigInt(scope)]);

  // Compute signal hash
  const signalHash = poseidonHash([BigInt(signal)]);

  const backend = new BarretenbergBackend(circuit);
  const noir = new Noir(circuit);

  const { witness } = await noir.execute({
    root: tree.root.toString(),
    nullifier_hash: nullifier.toString(),
    signal_hash: signalHash.toString(),
    scope: BigInt(scope).toString(),
    secret: secret.toString(),
    path_indices: pathIndices.map(String),
    siblings: siblings.map(String),
  });

  const proof = await backend.generateProof(witness);
  return { proof, nullifier, root: tree.root };
}
```

---

## 6. Feasibility Assessment

### Evaluation Criteria

For each approach: browser-only, no backend server, no smart contracts, Arkiv entity CRUD only.

### Semaphore v4

| Criterion | Score | Notes |
|-----------|-------|-------|
| Browser compatibility | 9/10 | Mature snarkjs WASM, auto-downloads artifacts |
| No smart contracts needed | 9/10 | Full off-chain support via @semaphore-protocol/group |
| Implementation effort | 8/10 | Well-documented, ~200 lines of integration code |
| Performance | 7/10 | Proof gen: 2-5 seconds browser. Artifact download: one-time. |
| Maturity/audits | 9/10 | Multiple audits, used by Worldcoin/World ID |
| Fits our architecture | 8/10 | Group state stored in Arkiv entities |
| **Overall** | **8.3/10** | **Best balance of effort vs. capability** |

### Noir Custom Circuit

| Criterion | Score | Notes |
|-----------|-------|-------|
| Browser compatibility | 7/10 | NoirJS + bb.js WASM. Less battle-tested than snarkjs. |
| No smart contracts needed | 10/10 | Pure client-side circuit |
| Implementation effort | 5/10 | Must build Merkle tree management, nullifier logic from scratch |
| Performance | 7/10 | Similar to Semaphore. UltraPlonk may be slightly slower than Groth16. |
| Maturity/audits | 5/10 | Noir is beta. No audit on our custom circuit. |
| Fits our architecture | 9/10 | Already using Noir. Single ZK stack. |
| **Overall** | **7.2/10** | **Higher effort, but better architectural fit long-term** |

### RLN

| Criterion | Score | Notes |
|-----------|-------|-------|
| Browser compatibility | 6/10 | rlnjs is experimental |
| No smart contracts needed | 7/10 | Can work off-chain, but slashing needs shared state |
| Implementation effort | 4/10 | Complex, experimental libraries |
| Performance | 6/10 | Additional circuit constraints for Shamir evaluation |
| Maturity/audits | 4/10 | Research-grade, limited production use |
| Fits our architecture | 6/10 | Overkill for MVP. Rate-limiting is a nice-to-have. |
| **Overall** | **5.5/10** | **Not recommended for MVP. Revisit for rate-limiting later.** |

### BBS+ Anonymous Credentials

| Criterion | Score | Notes |
|-----------|-------|-------|
| Browser compatibility | 7/10 | WASM bundle available |
| No smart contracts needed | 10/10 | Pure cryptographic scheme, no chain needed |
| Implementation effort | 6/10 | Good libraries, but requires issuer infrastructure |
| Performance | 9/10 | Fast: no SNARK proof generation, just BLS operations |
| Maturity/audits | 7/10 | IETF standardization in progress. Libraries stable. |
| Fits our architecture | 5/10 | No nullifiers = can't prevent double-apply. Requires trusted issuer. |
| **Overall** | **7.3/10** | **Fast and elegant, but missing nullifiers is a dealbreaker for job apps.** |

---

## 7. Recommendation

### MVP: Semaphore v4 (off-chain)

**Why:** Best balance of effort, maturity, and features. Off-chain group management works perfectly with Arkiv entity storage. Nullifiers prevent double-applications. Battle-tested (Worldcoin uses it). ~200 lines of integration code.

**Implementation plan:**
1. Add `@semaphore-protocol/core` to the project
2. Generate Semaphore identity during user profile creation, store private key in localStorage
3. Store identity commitments as part of a "registered-users" Arkiv entity
4. On job application: reconstruct group locally, generate proof, submit proof + encrypted identity
5. On verification: verify proof, check nullifier uniqueness, decrypt identity on accept

### Post-MVP: Migrate to Noir Custom Circuit

**Why:** We already use Noir. A custom circuit gives us:
- Single ZK stack (no Circom/snarkjs alongside Noir/Barretenberg)
- Custom constraints (e.g., prove profile age, prove credential type)
- Smaller proof artifacts (circuit tailored to our needs)
- UltraPlonk universal setup (no trusted setup ceremony dependency)

**Migration path:**
1. Build Noir circuit equivalent to Semaphore's membership proof
2. Build JavaScript Merkle tree management using Poseidon (matching Noir's hash)
3. Replace Semaphore proof generation with NoirJS proof generation
4. Keep same verification and nullifier logic
5. The Arkiv entity structure stays the same (proof format changes, but data model doesn't)

### Post-MVP: Add RLN-style Rate Limiting

**Why:** Once basic anonymous applications work, add rate limiting to prevent spam:
- "Max 5 applications per day" using epoch-based nullifiers
- No need for Shamir slashing -- just reject proofs with duplicate nullifiers in the same epoch
- Can be added as an extension to either Semaphore or the Noir circuit

### Not Recommended: BBS+ as Primary Solution

**Why not:** No nullifiers means no double-application prevention. Could be used as a complementary system (e.g., for selective disclosure of profile attributes alongside a Semaphore membership proof), but not as the primary anonymous application mechanism.

---

## References

- [Semaphore Protocol](https://semaphore.pse.dev/)
- [Semaphore Documentation](https://docs.semaphore.pse.dev/)
- [Semaphore GitHub](https://github.com/semaphore-protocol/semaphore)
- [@semaphore-protocol/proof on npm](https://www.npmjs.com/package/@semaphore-protocol/proof)
- [Semaphore Technical Overview (HackMD)](https://hackmd.io/@vplasencia/B1sCrsoFkg)
- [Zero-Knowledge Group Membership with Semaphore v4](https://nkapolcs.dev/thoughts/20240728_zero_knowledge_with_semaphore_v4/)
- [Noir Documentation](https://noir-lang.org/docs/)
- [NoirJS Tutorial: Web App](https://noir-lang.org/docs/tutorials/noirjs_app/)
- [Noir Merkle Root Library](https://github.com/tomoima525/noir-merkle-root)
- [awesome-noir](https://github.com/noir-lang/awesome-noir)
- [Noir Explained: Features and Examples](https://oxor.io/blog/2024-06-18-noir-explained-features-and-examples/)
- [RLN Documentation](https://rate-limiting-nullifier.github.io/rln-docs/)
- [RLN on PSE](https://pse.dev/projects/rln)
- [rlnjs on GitHub](https://github.com/Rate-Limiting-Nullifier/rlnjs)
- [RLN Circuits](https://github.com/Rate-Limiting-Nullifier/rln-circuits)
- [RLN on Ethereum Research](https://ethresear.ch/t/semaphore-rln-rate-limiting-nullifier-for-spam-prevention-in-anonymous-p2p-setting/5009)
- [@mattrglobal/bbs-signatures on GitHub](https://github.com/mattrglobal/bbs-signatures)
- [BBS Signature Scheme (IETF Draft)](https://identity.foundation/bbs-signature/draft-irtf-cfrg-bbs-signatures.html)
- [Dock Anonymous Credentials Tutorial](https://docknetwork.github.io/sdk/tutorials/tutorial_anoncreds.html)
- [zk-creds: Flexible Anonymous Credentials](https://eprint.iacr.org/2022/878)
- [SNARK Artifacts Registry](https://snark-artifacts.pse.dev/)
- [Barretenberg (bb.js)](https://www.npmjs.com/package/@aztec/bb.js)
