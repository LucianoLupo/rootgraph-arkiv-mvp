# Advanced Privacy Patterns for Blockchain Systems Without Smart Contracts

**Date:** 2026-03-05
**Context:** RootGraph job board on Arkiv Network — a chain where entities are created/read/updated via precompile calls with no smart contract execution. The `entity.owner` field always records the `msg.sender` wallet address. No mixer contracts, no forwarder contracts, no on-chain registries are possible.
**Purpose:** Rigorous evaluation of seven advanced privacy patterns, assessing whether each solves our specific problem on Arkiv.

---

## Table of Contents

1. [The Problem Statement](#1-the-problem-statement)
2. [Stealth Addresses (EIP-5564 Adaptation)](#2-stealth-addresses-eip-5564-adaptation)
3. [Burner Wallet Pattern](#3-burner-wallet-pattern)
4. [Commitment Schemes](#4-commitment-schemes)
5. [Proxy Re-Encryption](#5-proxy-re-encryption)
6. [Ring Signatures](#6-ring-signatures)
7. [Mixnet / Batch Submission](#7-mixnet--batch-submission)
8. [Encrypted Entity Attributes](#8-encrypted-entity-attributes)
9. [Comparative Analysis](#9-comparative-analysis)
10. [Architectural Recommendations](#10-architectural-recommendations)

---

## 1. The Problem Statement

### What Arkiv Exposes

Every entity on Arkiv has an `owner` field set to `msg.sender` at creation time. This field is immutable and publicly readable. Combined with string attributes (which are plaintext-indexed), the complete chain of evidence for a job application looks like:

```
Transaction from: 0xAlice
  → createEntity({
      stringAttributes: [
        { key: "type",    value: "application" },
        { key: "job",     value: "0xJobEntityKey" },
        { key: "profile", value: "0xAliceProfileKey" }  // links back to identity
      ],
      payload: <application content>
    })

Result: entity.owner = 0xAlice (immutable, public)
```

Anyone scanning the chain can build a complete bipartite graph: wallets on one side, job entity keys on the other, applications as edges. If 0xAlice's wallet is ever linked to her real identity (via her profile entity, ENS name, exchange KYC, or gas funding from a known address), every application she has ever made is exposed.

### What We Need

The privacy goal for job applications is specifically:
1. **Break the link between the applicant's main wallet and the application entity's `owner` field**
2. **Prevent the application payload from revealing the applicant's identity to anyone except the intended job poster**
3. **Optionally: prevent timing correlation between the act of applying and an observable transaction**

The sections below evaluate seven patterns against this concrete goal.

---

## 2. Stealth Addresses (EIP-5564 Adaptation)

### The Standard EIP-5564 Protocol

EIP-5564 defines a cryptographic mechanism for generating one-time addresses. In the standard flow, a *sender* generates a stealth address for a *recipient* so that the recipient can receive funds at an unlinkable address without prior interaction.

The cryptography relies on Elliptic Curve Diffie-Hellman (ECDH) over secp256k1:

**Sender-side:**
```
1. Generate ephemeral key pair:  e, E = e * G
2. Compute shared secret:        S = e * P_view   (P_view = recipient's viewing pubkey)
3. Hash shared secret:           s_h = keccak256(S)
4. Extract view tag:             tag = s_h[0]
5. Derive stealth address:       P_stealth = P_spend + s_h * G
6. Stealth address:              addr = pubkeyToAddress(P_stealth)
7. Publish ephemeral pubkey E and view tag
```

**Recipient-side (scanning for incoming):**
```
1. For each announcement:
   a. Check view tag (fast: 1-byte filter, skip 255/256 on mismatch)
   b. Compute shared secret:  S = p_view * E
   c. Hash:                   s_h = keccak256(S)
   d. Derive:                 P_stealth = P_spend + s_h * G
   e. If pubkeyToAddress(P_stealth) == announced_stealth_addr → it's yours
2. Compute stealth private key: p_stealth = p_spend + s_h
```

The **announcer contract** in EIP-5564 is simply a log emitter — it broadcasts `(stealth_addr, ephemeral_pubkey, view_tag)` so recipients can scan. The cryptography itself requires no contract.

### Adapting for Arkiv: Self-Stealth Application Flow

The standard EIP-5564 roles are sender → recipient. For Arkiv job applications, the applicant plays **both** roles: they generate a one-time address for *themselves* to submit the application from.

```
Applicant (has main wallet with profile entity):

1. Derive application-specific stealth keypair:
   a. Take viewing key v and spending key s derived from main wallet
      (via: v = keccak256(sign("RootGraph-ViewKey-v1")),
            s = keccak256(sign("RootGraph-SpendKey-v1")))
   b. Compute V = v*G, S = s*G (viewing and spending public keys)

2. For each job application, generate fresh ephemeral key:
   e = random(), E = e*G

3. Derive shared secret:
   sharedSecret = ECDH(e, V) = e*V
   s_h = keccak256(sharedSecret)

4. Derive stealth address:
   P_stealth = S + s_h*G
   stealth_addr = pubkeyToAddress(P_stealth)

5. Fund stealth_addr with gas (PROBLEM — see below)

6. Create application entity from stealth_addr:
   entity.owner = stealth_addr  (unlinkable to main wallet on-chain)
   entity.stringAttributes = [
     { key: "type", value: "application" },
     { key: "job",  value: jobEntityKey },
     { key: "ephem_pubkey", value: hex(E) }  // stored for later verify
   ]
   entity.payload = ECIES_encrypt(applicationContent, jobPosterPublicKey)

7. Applicant can later prove ownership:
   - Signs a message from both stealth_addr and main wallet
   - Or: shares s_h (reveals linking only to whom they choose)
```

**What this achieves on Arkiv:**
- `entity.owner` = `stealth_addr`, which is unlinkable to the main wallet
- No on-chain registry or announcer contract needed — the ephemeral pubkey E is stored as a string attribute on the entity itself
- Application content encrypted for job poster only

### The Gas Funding Problem: The Central Barrier

This is not a minor implementation detail. It is the existential blocker.

To submit a transaction on Arkiv, the stealth address needs gas. There are four ways to fund it, each with severe tradeoffs:

| Method | How | Linkability | Feasibility |
|--------|-----|-------------|-------------|
| **Fund from main wallet** | Main wallet sends gas to stealth_addr | **Full exposure**: on-chain link from main → stealth, defeating the entire scheme | Defeats purpose |
| **Fund from another disposable wallet** | Chain of hops | Adds hops but still observable if chain is shallow | Shifts problem |
| **Relayer/paymaster** | Third party pays gas | Relayer sees signed intent; must trust relayer | Acceptable with trust |
| **Testnet faucet** | Chain-operated faucet gives gas to any address | No linkage if faucet is open | Only works on testnet |

On **Arkiv testnet (Kaolin)**, an open faucet is viable. This makes the stealth address approach feasible for the current context.

On a production mainnet, the only practical solution without a relayer is **account abstraction with a shared paymaster** — but Arkiv has no smart contracts, so ERC-4337 paymasters are not available.

**A hybrid approach works for Arkiv specifically:** The Arkiv team or RootGraph backend operates a simple relayer that receives a signed application intent off-chain, submits the transaction from a hot wallet pool, and pays gas. The hot wallet IS the `msg.sender` and `entity.owner`. This is the server-side relayer pattern (covered in `06-metadata-privacy-web3.md`) — and the stealth address mechanics become unnecessary if the relayer is used because the relayer already breaks the `owner` linkage.

### Does It Solve the `entity.owner` Problem?

**Yes, if the gas problem is solved.** The stealth address becomes the entity owner, which is unlinkable to the main wallet on-chain. However:
- If funded directly from main wallet: No, it's immediately linkable.
- If funded via open faucet (testnet): Yes.
- If funded via relayer: The relayer pattern itself solves the problem more simply.

### Can It Work Without Smart Contracts?

**Yes.** All ECDH operations are client-side. The ephemeral public key is stored as an entity attribute instead of in an announcer contract event. The cryptography is chain-agnostic.

### UX Cost

**High.** Users need to:
1. Derive and store viewing/spending keys from their main wallet
2. Generate ephemeral keys per application
3. Wait for gas funding before submission
4. Manage the stealth address for later access (update/delete the application)
5. Understand a non-trivial reveal protocol

With Privy embedded wallets, key derivation (#1-2) can be abstracted. But the gas funding step (#3) requires either a faucet button, a backend service, or explicit user action.

### Libraries

| Library | Package | Notes |
|---------|---------|-------|
| ScopeLift Stealth Address SDK | `@scopelift/stealth-address-sdk` | Full EIP-5564. TypeScript. Actively maintained. |
| Fluidkey Stealth Account Kit | `@fluidkey/stealth-account-kit` | Core crypto only. Audited (Dedaub, 2024). Minimal surface. |
| noble-secp256k1 | `@noble/secp256k1` | Low-level ECDH. Audited. Build custom on top. |
| viem | `viem` | Can derive keys, do ECDH via noble internally. |

The `@fluidkey/stealth-account-kit` is the best choice for building the derivation logic directly. `@scopelift/stealth-address-sdk` includes more tooling but also more opinionated contract assumptions.

### Implementation Complexity

**Medium-High.** The crypto is well-specified (~100 lines of TypeScript using noble libraries). The complexity is in gas management and UX. Without the gas problem, it would be Medium.

### Verdict for Arkiv

Stealth addresses solve the `entity.owner` problem cleanly — but only if the gas funding issue is resolved independently. On the testnet, a faucet endpoint makes this viable. The approach is worthwhile for a Phase 2 implementation. For MVP, it is simpler to use the server-side relayer pattern, which achieves the same `owner` unlinkability at lower complexity.

---

## 3. Burner Wallet Pattern

### How It Works

The simplest possible approach: the applicant creates a fresh wallet (new keypair) for each application. The fresh wallet submits the entity creation transaction, so `entity.owner` = fresh wallet address. The link between the fresh wallet and the applicant's real identity is encrypted in the application payload, readable only by the job poster.

```
Applicant flow:

1. Generate fresh keypair: (burner_priv, burner_addr)
   - Can use BIP32 derivation from main wallet:
     burner_priv = deriveKey(mainWallet.sign("RootGraph-Burner-v1"), applicationIndex)
   - Or: purely random, stored locally

2. Fund burner_addr with gas (same problem as stealth addresses)

3. Encrypt linking data for job poster:
   const linkPayload = {
     mainWalletAddr: "0xAlice",
     profileEntityKey: "0xAliceProfileKey",
     coverLetter: "...",
     nonce: randomBytes(32)
   };
   const encryptedLink = ECIES.encrypt(jobPosterPublicKey, linkPayload);

4. Create application entity from burner_addr:
   entity.owner = burner_addr  (fresh, unlinkable)
   entity.payload = encryptedLink
   entity.stringAttributes = [{ key: "type", value: "application" }, ...]

5. Job poster decrypts payload → learns applicant's main wallet and profile

6. Reveal / identity confirmation:
   Applicant can sign a message from mainWallet attesting to the application.
```

### Comparison with Stealth Addresses

| Aspect | Burner Wallet | Stealth Address |
|--------|--------------|-----------------|
| Cryptographic novelty | None — just a new keypair | ECDH derivation |
| Unlinkability to main wallet | Same (both create fresh on-chain address) | Same |
| Key management overhead | Store/derive burner key | Store/derive viewing + spending + ephemeral keys |
| Gas funding problem | Identical problem | Identical problem |
| Can recover access | Yes (if deterministic derivation) | Yes (via stealth private key) |
| Proof of identity link | Requires signing from both | Built into protocol (shared secret) |
| Complexity | Very Low | Medium-High |

The burner wallet pattern is **functionally equivalent** to stealth addresses for our use case, but simpler. Stealth addresses add a formal protocol for the identity link derivation, but since we're encrypting the link payload anyway, the stealth address ECDH ceremony adds complexity without additional security benefit here.

**Key insight:** Stealth addresses are designed for the case where the *sender* wants to send to a *recipient* without the recipient needing to do anything. In our case, the applicant controls both sides — there is no "sender" separate from "recipient." The formal EIP-5564 derivation adds nothing we don't already get from a simple deterministic HD child key.

### The Gas Funding Problem (Same as Stealth)

Identical blocker. Solutions:
1. **Testnet faucet** (current Kaolin context): Viable, good for MVP.
2. **Server-side relayer** (recommended): Backend submits transaction from a hot wallet pool. The hot wallet becomes entity.owner. If the relayer is trustworthy, this is the cleanest solution.
3. **User funds manually**: Acceptable during a hackathon demo if we advise users to fund from a mixer or faucet.

### HD Wallet Derivation for Burner Keys

Using BIP32/BIP44 derivation makes burner wallets recoverable without storing extra state:

```typescript
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";

// Derive a burner key for a specific job application
function deriveBurnerKey(
  mainWalletSignature: string,  // sign("RootGraph-BurnerSeed-v1")
  applicationIndex: number
): { privateKey: Uint8Array; address: string } {
  const seed = keccak256(mainWalletSignature);  // 32 bytes of entropy
  const hdKey = HDKey.fromMasterSeed(seed);
  const child = hdKey.derive(`m/44'/60'/0'/0/${applicationIndex}`);
  return {
    privateKey: child.privateKey!,
    address: privateKeyToAddress(child.privateKey!)
  };
}
```

This approach means:
- No extra secrets to store (everything derivable from wallet signature)
- Deterministic per application index
- Recoverable across devices if the user can re-sign the seed message

However: the derivation is deterministic, which means if the signed message is ever leaked, all burner keys are recoverable. Use the nonce from the signed message as salt to mitigate.

### Payload Encryption for Job Poster

The application payload needs to be encrypted so only the job poster can read the applicant's real identity. Use ECIES over secp256k1 (the job poster's Ethereum public key):

```typescript
import { encrypt } from "eciesjs";  // or eth-crypto / noble

// Job poster's public key (derivable from their Ethereum address via
// any signed message: "I am job poster at company X")
const jobPosterPubKey = recoverPublicKey(jobPosterSignedMessage, jobPosterAddress);

const applicationPayload = {
  mainWalletAddress: applicantMainWallet,
  profileEntityKey: applicantProfileKey,
  coverLetter: "...",
  resumeCID: "ipfs://...",
  timestamp: Date.now(),
  nonce: toHex(randomBytes(32))
};

// Encrypt so only job poster can read
const encryptedPayload = encrypt(jobPosterPubKey,
  Buffer.from(JSON.stringify(applicationPayload)));

// The entity on-chain contains only encrypted bytes
await createEntity({
  payload: encryptedPayload,
  stringAttributes: [
    { key: "type", value: "application" },
    { key: "job",  value: jobEntityKey }
    // NO applicant identifier in cleartext attributes
  ]
});
```

### Does It Solve the `entity.owner` Problem?

**Yes** — `entity.owner` is the fresh burner wallet, which has no prior on-chain history. An observer cannot link the burner address to the applicant's main wallet unless they can decrypt the payload (which requires the job poster's private key) or observe the gas funding transaction.

### Can It Work Without Smart Contracts?

**Yes.** Purely client-side keypair generation and ECIES encryption. No contract infrastructure needed.

### UX Cost

**Medium-Low** if well-abstracted in the UI. The user ideally sees none of this — the app silently generates a burner key, requests gas (from faucet or relayer), and submits. UX burden items:
- Gas faucet flow (1 extra click)
- Waiting for gas to arrive (~seconds on testnet)
- Potential confusion if the user tries to access the application from a different device (key recovery UX)

### Libraries

| Library | Purpose |
|---------|---------|
| `@scure/bip32` | HD key derivation (audited, by paulmillr) |
| `eciesjs` | ECIES encryption with secp256k1 or x25519 |
| `eth-crypto` | Ethereum-specific ECIES, pubkey recovery |
| `@noble/secp256k1` | Low-level ECDH, used internally by above |
| `viem` | `generatePrivateKey()`, `privateKeyToAccount()` |

### Implementation Complexity

**Low.** Key generation is 5 lines. Encryption is another 10 lines. The complexity is gas management (identical to stealth addresses).

### Verdict for Arkiv

The burner wallet pattern is the **most pragmatic solution** for an MVP:
- Solves `entity.owner` linkage
- No smart contracts needed
- Simple cryptography
- Well-understood pattern
- Same gas problem as stealth addresses, same solutions apply

The only reason to prefer stealth addresses over burner wallets is if you need a standardized protocol for identity discovery at scale (e.g., a general-purpose wallet scanning for incoming stealth payments). For a job board, we don't need this — we always know which applications exist because we can query Arkiv by `job` attribute.

---

## 4. Commitment Schemes

### What They Are and What They Don't Do

A commitment scheme binds a promisor to a value without revealing it. The classic construction:

```
commitment = hash(value || nonce)
```

Properties:
- **Hiding**: Given only `commitment`, it is computationally infeasible to learn `value`.
- **Binding**: The promisor cannot change their mind — they cannot find a different `(value', nonce')` that produces the same `commitment` (collision resistance of the hash function).

### The Core Problem: Commitments Don't Hide `tx.from`

This is the crucial point that makes commitments insufficient as a standalone solution for Arkiv.

```
On-chain visibility:
  tx.from = 0xAlice                    ← ALWAYS PUBLIC
  entity.owner = 0xAlice               ← set to msg.sender, always public
  entity.stringAttributes = [
    { key: "identity_commitment",
      value: keccak256("0xAlice" || nonce) }  ← commitment is public too
  ]
```

The commitment hides the *value of* the identity attribute. But the *wallet that created the entity* is already public. If `0xAlice` has a profile entity on Arkiv, any observer can trivially see that `0xAlice` created both the profile and the application. The commitment inside the application entity is irrelevant — the wallet already told them who applied.

**Conclusion:** Commitments do NOT solve the `entity.owner` problem. They are only useful as a complement to address-unlinkability techniques (burner wallet or stealth address), not as a replacement.

### Where Commitments DO Add Value: Staged Reveal

Once the `entity.owner` problem is solved by a different mechanism (burner wallet, stealth address, or relayer), commitments provide a useful **staged reveal** protocol:

```
Phase 1 — Application submission (from burner wallet):
  entity.payload = ECIES_encrypt(jobPosterPubKey, {
    identityCommitment: keccak256(mainWalletAddr || profileKey || nonce),
    coverLetter: "..."
  })
  // Job poster can decrypt and see the commitment, but not yet the identity

Phase 2 — Job poster shortlists (signals interest, e.g., updates entity status)

Phase 3 — Applicant reveals identity (only to shortlisted job posters):
  Send (mainWalletAddr, profileKey, nonce) via encrypted channel.
  Job poster verifies: keccak256(mainWalletAddr || profileKey || nonce) == commitment

  Optionally: applicant also signs a message from mainWallet proving they control it.
```

This prevents the job poster from correlating all application identities until they're ready to reveal. The commitment adds a privacy guarantee *within the job poster relationship*, not against chain observers.

### Pedersen Commitments vs. Hash Commitments

Pedersen commitments (`C = g^v * h^r` over an elliptic curve) have the advantage of being *perfectly hiding* (information-theoretically, not just computationally). Hash commitments are only computationally hiding.

For a job board, this distinction is irrelevant. The adversary model does not involve infinite-compute attackers. Hash commitments are sufficient and far simpler to implement.

### Does It Solve the `entity.owner` Problem?

**No.** Commitments hide the identity *value*, not the wallet that submitted the transaction.

### Can It Work Without Smart Contracts?

**Yes.** Pure hashing, completely client-side. No on-chain logic needed beyond storing the commitment string in an entity attribute.

### UX Cost

**Very Low** — just a hash operation. The nonce must be stored (or derived deterministically), but this can be automated.

### Libraries

- `viem`: `keccak256`, `encodePacked`
- `@noble/hashes`: `sha256`, `keccak_256`
- `ethers.js`: `keccak256`, `solidityPackedKeccak256`

### Implementation Complexity

**Very Low.** 10 lines of code for hash commitment. The staged reveal is a UX flow, not a cryptographic challenge.

### Verdict for Arkiv

Use commitments as a **complement** to the burner wallet or relayer pattern, not as a standalone solution. Specifically, the staged reveal pattern (identity commitment in encrypted payload, revealed only to interested parties) adds meaningful privacy within the job poster relationship at near-zero implementation cost. Do not rely on commitments to hide the applicant from chain observers.

---

## 5. Proxy Re-Encryption

### What It Is

Proxy re-encryption (PRE) allows a *proxy* to transform a ciphertext encrypted for Alice's public key into a ciphertext for Bob's public key, **without the proxy ever seeing the plaintext**.

The classic Umbral scheme (NuCypher):

```
Alice encrypts:    C_A = ECIES(alice_pubkey, plaintext)
Alice generates:   kfrag = re-encryption_key_fragment(alice_privkey, bob_pubkey)
Proxy performs:    C_B = re_encrypt(C_A, kfrag)
Bob decrypts:      plaintext = ECDH_decrypt(bob_privkey, C_B)
```

Umbral uses threshold re-encryption: Alice splits the `kfrag` into N shares, requiring M-of-N proxies to cooperate to re-encrypt. This distributes trust.

The JS package `@nucypher/umbral-pre` (WASM bindings for rust-umbral) supports this, but **was last published 3 years ago** and appears unmaintained in 2025.

### Does PRE Solve the `entity.owner` Problem?

**No.** Proxy re-encryption is a mechanism for *delegating decryption rights*. It has nothing to do with who submits a transaction or what `entity.owner` is set to.

PRE would be useful in a different problem: "Alice encrypts her application for herself; later she wants to grant the job poster decryption access without re-uploading the data." This is a *data access delegation* problem, not an identity hiding problem.

### Where PRE Adds Value in Our Context

If the payload is large (e.g., resume documents, code samples) and stored on IPFS or a content-addressed store, PRE would allow:

```
1. Alice encrypts large payload for herself: C_A = ECIES(alice_pubkey, resume)
2. Alice stores C_A on IPFS, references CID in entity
3. When applying to Job X:
   a. Alice generates a re-encryption key fragment for job poster X's pubkey
   b. Alice stores kfrag alongside the application entity (or sends to a proxy)
   c. Job poster X requests re-encryption from proxy
   d. Proxy transforms C_A → C_X without seeing resume
   e. Job poster X decrypts C_X with their private key
```

This means Alice only stores one copy of her encrypted resume, but can grant access to multiple job posters independently. This is a **scalability and access management** benefit, not a privacy benefit for the `entity.owner` problem.

### Can It Work Without Smart Contracts?

**Yes.** PRE is a pure cryptographic operation. The proxy is just a server running re-encryption. No blockchain required.

However, trust in the proxy is required. The proxy knows:
- Who is requesting re-encryption (the job poster)
- That someone is sharing data with them
- The timing of access delegation events

This is different from the proxy seeing the plaintext — the proxy cannot read the content — but the proxy does see the access pattern.

### UX Cost

**High.** Users would need to:
- Maintain asymmetric key pairs beyond their signing key
- Generate key fragments per job poster
- Either run or trust a proxy service
- Manage key fragment revocation

This overhead is not justified for an MVP where the simpler pattern (encrypt payload directly for job poster using ECIES) achieves the same result without any infrastructure.

### Libraries

| Library | Status | Notes |
|---------|--------|-------|
| `@nucypher/umbral-pre` | Unmaintained (last update 2022) | WASM/JS bindings for rust-umbral |
| `pyUmbral` | Unmaintained | Python reference implementation |
| `rust-umbral` | Maintained on GitHub | Rust only; JS bindings stale |

**No production-ready, maintained JS PRE library exists for this use case in 2025.** Building your own PRE scheme from scratch is not advisable for a hackathon or MVP.

### Implementation Complexity

**Very High** — not because the cryptography is impossibly hard, but because:
- No maintained JS library
- Requires operating proxy infrastructure
- Key fragment management is complex
- Not justified vs. simpler ECIES direct encryption

### Verdict for Arkiv

**Do not use PRE for the MVP or Phase 2.** The problem it solves (delegating decryption rights without re-encrypting data) is a nice-to-have scalability feature for large payloads. The simpler pattern — encrypt the payload once with the job poster's public key at application time — achieves equivalent security for our use case and requires no proxy infrastructure. If resume documents become large and multi-employer reuse is needed, revisit PRE then.

---

## 6. Ring Signatures

### What They Are

A ring signature allows a member of a group to sign a message such that:
- Any verifier can confirm the signature came from *someone* in the group
- No verifier can determine *which* group member signed

This is useful for proving "I am a verified RootGraph user" without revealing which user.

**Linkable ring signatures (LSAG/bLSAG)** add a "key image" — a deterministic value derived from the signer's private key and the signing context. Properties:
- Two signatures by the same key in the same context produce the same key image (linkable)
- Two signatures in *different* contexts produce different key images (unlinkable across contexts)
- This prevents double-signing within a context (e.g., double-applying to the same job) without revealing identity

Monero uses CLSAG (Concise Linkable Spontaneous Anonymous Group signatures), an optimized variant. The core construction follows:

```
Ring = [P_1, P_2, ..., P_n]  ← public keys of ring members
Signer has private key p_i where P_i = p_i * G

Signature proves: "someone from Ring signed this, and their key image I = p_i * H(P_i)"

Verifier checks: valid ring signature AND key image not previously seen
```

### Does Ring Signatures Solve the `entity.owner` Problem?

**No, directly.** Ring signatures prove *who you are* (one of N people), not *who submits the transaction*. The `entity.owner` is still `msg.sender` — the wallet that paid gas and submitted the create transaction. If you submit from your main wallet, that wallet is visible even if you include a valid ring signature in the payload.

Ring signatures address a **different problem**: proving group membership anonymously. They would prevent a chain observer from saying "Alice specifically applied for this job" — they could only say "someone from this set of N verified users applied" — **but only if the transaction is submitted from an unlinkable wallet** (burner or relayer).

### Using Ring Signatures on Arkiv

The practical flow would be:

```
1. Group: All verified RootGraph profiles = {0xAlice, 0xBob, 0xCarol, ...}
   (derivable from on-chain profile entities)

2. Applicant (0xAlice) generates ring signature:
   - Ring = [0xAlice_pubkey, 0xBob_pubkey, 0xCarol_pubkey, ...]
   - Signs: "I am applying to job 0xJobKey"
   - Key image: I = alice_privkey * H(alice_pubkey)

3. Application entity submitted from burner wallet:
   entity.owner = burner_addr (unlinkable)
   entity.payload = {
     ringSignature: sig,
     ring: [...public_keys...],
     keyImage: I,
     applicationContent: ECIES_encrypt(jobPosterPubKey, details)
   }

4. Job poster verifies:
   - Ring signature is valid
   - Key image not previously used for this job (prevents double-apply)
   - Decrypts application content

5. Job poster learns: "a verified user applied, key image is I"
   Job poster does NOT know which specific user
   Until applicant chooses to reveal
```

### Key Image for Double-Apply Prevention

This is the distinctive value proposition of linkable ring signatures: the same private key applied to the same job produces the same key image. The job poster (or anyone) can detect if the same real applicant applies twice to the same job, without knowing who that person is.

```
jobSpecificKeyImage = alice_privkey * H(alice_pubkey || jobEntityKey)
```

Two applications from Alice for the same job → same key image → detectable duplicate.
Two applications from Alice for *different* jobs → different key images → no cross-job linkage.

This is the only privacy mechanism that provides **double-apply prevention without centralized state** and **without revealing identity**. Hash commitments and burner wallets cannot do this without either a trusted server or on-chain nullifier state.

### The Ring Composition Problem

Ring signatures require a valid ring of public keys. On Arkiv, the ring members are profiles (profile entity owners), but:
- The ring must be composed at application time
- If Alice always uses the same set {Alice, Bob, Carol}, an observer who knows none of them can deduce Alice is one of these three, but not which
- **Anonymity set size matters**: a ring of 2 is barely better than no ring. A ring of 100 is significantly better.
- Who builds the ring? The applicant selects ring members from valid Arkiv profiles. This requires indexing profiles. Without a smart contract maintaining a Merkle root, the applicant must trust their own local view of the profile set.

### JS Libraries

| Library | Package | Notes |
|---------|---------|-------|
| nostringer | `nostringer` (npm) | SAG (unlinkable) ring signatures for secp256k1. Unaudited, experimental. |
| beritani/ring-signatures | `ring-signatures` (npm) | SAG, bLSAG, MLSAG, CLSAG — but Ed25519, not secp256k1. |
| Monero WASM (ring-crypto) | `ring-crypto` (npm) | WASM bindings for Monero C++ libs. Large bundle. Sparse docs. |
| Alice's Ring | `alices-ring` | TypeScript, ZK ring sig for Nostr. Experimental. |

**Critical note:** `nostringer` implements SAG (unlinkable), not LSAG (linkable). For double-apply prevention, you need linkable ring signatures. The only maintained JS option for linkable ring signatures over secp256k1 is to build on top of `@noble/secp256k1` using the LSAG construction directly from the Monero spec. This is non-trivial (~300-500 lines of careful cryptography) and should not be attempted without a security review.

All available libraries carry explicit "not audited, do not use in production" warnings.

### Can It Work Without Smart Contracts?

**Yes.** Ring signature generation and verification are pure client-side cryptographic operations. The key image (nullifier) can be tracked in an off-chain database or stored as a string attribute in the job entity's associated data.

### UX Cost

**High.** Users need to:
- Have their signing key available in a form compatible with the ring signature scheme (secp256k1, which Ethereum uses — but the library needs the private key directly, not via MetaMask)
- Understand that their signature proves "I am one of N people" — which is harder to explain than "I used a fresh wallet"
- The ring composition (which other public keys are in my ring?) needs to be automated

### Implementation Complexity

**High.** Ring signatures for secp256k1 with linkability:
- No production-ready library in JS
- ~400 lines of cryptographic code to implement LSAG correctly
- Requires careful handling of the hash-to-curve function for key images
- Testing and verification are non-trivial
- Not recommended unless privacy is a core feature requiring cryptographic proof-of-group-membership

### Verdict for Arkiv

Ring signatures provide a unique capability — anonymous group membership proof with double-apply prevention — that no other mechanism in this document provides. However:

- They **do not** solve `entity.owner` on their own (still need burner wallet or relayer)
- They **do** add valuable "one of N" semantics if anonymity sets are large enough
- **No maintained, audited JS library exists** for the secp256k1 linkable variant
- The UX complexity is significant

For MVP: Do not use. The burner wallet + encrypted payload combination achieves equivalent practical privacy with a fraction of the implementation cost.

For future consideration: If RootGraph needs to prove "a verified user applied, not a bot" without revealing identity, and the platform grows to have 1000+ profiles (giving meaningful anonymity sets), ring signatures become the right tool. At that point, invest in a proper LSAG implementation or adopt a ZK alternative (Semaphore) that achieves the same property more cleanly.

---

## 7. Mixnet / Batch Submission

### What Mixnets Are

A mixnet (mix network) is a network of routers that receive messages, randomly reorder and re-encrypt them, and forward the batch. The goal is to break *timing and traffic correlation* — an observer who sees message M enter node A at time T cannot determine which message exits node B at time T+ε, because the messages have been shuffled and delayed.

The canonical modern mixnet is **Nym**, which routes Sphinx-formatted packets through three layers of mix nodes with random delays, making statistical traffic analysis computationally intractable.

### The Problem Mixnets Actually Solve

Mixnets address **network-level privacy**: hiding who communicated with whom based on packet timing and volume. They do not address blockchain-level privacy. Specifically:

- Mixnets do NOT change `entity.owner` or `tx.from`
- Mixnets do NOT encrypt transaction calldata
- Mixnets DO hide the IP address of the user submitting the transaction
- Mixnets DO prevent timing correlation between "user performed action" and "transaction appeared on-chain"

### Batch Submission: The Application-Layer Analogue

Without a full mixnet, batch submission achieves the timing-correlation defense at the application layer:

```
Instead of:
  10:00:00 — Alice visits job page → opens application form
  10:01:32 — Transaction from 0xAlice appears on-chain
  [Observer trivially links Alice's browsing to 0xAlice]

With batch submission:
  Applications queue in a server-side buffer
  Every 5 minutes: all queued applications are submitted in one batch
  10:00:00 — Alice submits application intent
  10:05:00 — 17 application transactions appear on-chain simultaneously
  [Observer cannot determine timing correlation for any individual application]
```

This is **application-layer batching**, not a true mixnet, but it achieves the primary goal of timing resistance.

**Cover traffic** strengthens this: if the batch always contains at least N applications (padding with dummy transactions if necessary), the batch size itself reveals nothing about actual application volume for that interval.

### Batch Submission on Arkiv

Since Arkiv is a custom chain:
- Applications can be queued off-chain via the backend
- The backend submits batches at fixed intervals from a rotating pool of hot wallets
- No smart contract or on-chain batching logic needed
- This is pure infrastructure-level sequencing

```typescript
// Batch submission service (runs on backend)
const APPLICATION_INTERVAL_MS = 5 * 60 * 1000;  // 5 minutes

setInterval(async () => {
  const pending = await drainApplicationQueue();
  if (pending.length === 0) return;

  // Optionally pad to minimum batch size
  const padded = padWithDummies(pending, MIN_BATCH_SIZE);

  // Shuffle order (prevents first-seen correlation)
  shuffle(padded);

  // Submit from rotating hot wallets
  for (const app of padded) {
    const relayerWallet = pickRelayerWallet();
    await submitToArkiv(relayerWallet, app.signedIntent);
    await randomDelay(100, 500);  // jitter between submissions
  }
}, APPLICATION_INTERVAL_MS);
```

### Nym Integration

Nym's TypeScript SDK (`@nymproject/sdk`) allows routing messages through the Nym mixnet. In theory, one could route the application submission via Nym to hide the user's IP from both the RPC endpoint and any network observers.

**Practical barriers for Arkiv:**
- Nym is a separate network with its own infrastructure (mix nodes, validators)
- Nym mixnet delivery has significant latency (seconds to tens of seconds per hop)
- Nym does not currently have seamless integration with arbitrary EVM RPC calls
- Overkill for a testnet with a trusted chain operator

### Does Mixnet/Batch Submission Solve the `entity.owner` Problem?

**No.** Timing obfuscation hides *when* an application was submitted. It does not change *who* submitted it (`entity.owner` = `msg.sender` = wallet address). An observer who knows both the applicant's wallet address and the batch contents can still identify their application.

Mixnet/batch submission is a **defense in depth** layer, not a primary privacy mechanism for the `entity.owner` problem.

### Can It Work Without Smart Contracts?

**Yes.** Batching is a backend service concern. No chain-level changes needed.

### UX Cost

**None for the user** — completely transparent. The application might appear with a slight delay (~5 minutes in the batch model), which is communicated to the user as "Application queued, will be submitted shortly."

### Libraries

| Technique | Library/Tool |
|-----------|-------------|
| Nym mixnet | `@nymproject/sdk` (TypeScript) |
| Random delays | Native `setTimeout`, no library needed |
| Batch job queue | `bullmq`, `pg-boss`, or simple in-memory queue |
| Cover traffic | Backend service, no special library |

### Implementation Complexity

**Low** for application-layer batching (a queue and a cron job).
**High** for real Nym integration (separate infrastructure, latency, SDK complexity).

### Verdict for Arkiv

Implement **application-layer batching** as part of the server-side relayer architecture (already recommended from `06-metadata-privacy-web3.md`). It costs almost nothing to add a 5-minute submission queue to the relayer, and it provides meaningful timing resistance. Do not attempt Nym integration for the current phase — the added complexity is not justified.

---

## 8. Encrypted Entity Attributes

### What This Means

Arkiv string attributes are plaintext and indexed — the chain can be queried by attribute value. The question is: can we encrypt attribute values, and what breaks if we do?

### What Encrypting Attributes Gains

If we store `applicant = ECIES_encrypt(jobPosterPubKey, "0xAlice")` instead of `applicant = "0xAlice"`, then:
- A casual observer reading the entity cannot see the applicant's address
- Only the job poster (with their private key) can decrypt

This looks promising, but it collides with Arkiv's indexing model.

### The Query Problem: Everything Breaks

Arkiv allows querying entities by attribute key-value pairs, such as:

```
getEntities({ stringAttributes: [{ key: "job", value: "0xJobEntityKey" }] })
```

If attribute values are encrypted, queries against those values are impossible without decrypting them first. Specifically:

**Breaks:**
- Query "all applications for job 0xJobKey" — unless `job` attribute is plaintext
- Query "all applications from profile 0xAlice" — encrypted applicant field is unsearchable
- Any filtering/indexing by the encrypted attribute

**Does not break:**
- Storing opaque data in the payload (encryption there is fine — payloads are not indexed)
- Querying by unencrypted attributes (type, job) and then decrypting specific fields client-side

### Deterministic Encryption: A Partial Solution

If the encryption is *deterministic* (same plaintext + same key → same ciphertext), equality queries become possible:

```
blindIndex = HMAC_SHA256(secret_key, "0xAlice" + attributeName)
```

Store the blind index alongside the encrypted value. Query by blind index — the server never sees the plaintext, but can find exact matches.

This is the **blind index** pattern, used in encrypted databases (e.g., CipherStash, ParadeDB). It has a known weakness: **frequency analysis**. If attribute values are drawn from a small set (e.g., `status` ∈ {pending, reviewed, accepted, rejected}), an observer can match ciphertext frequency patterns to plaintext values.

For `applicant = "0xAlice"`, the address space is large (2^160), so frequency analysis is not practical. But for `status`, it would be trivially reversible.

### Practical Design for Arkiv

The correct design is to partition attributes by privacy sensitivity:

| Attribute | Value | Treatment |
|-----------|-------|-----------|
| `type` | `"application"` | Plaintext (needed for type queries) |
| `job` | `"0xJobEntityKey"` | Plaintext (needed for job queries) |
| `applicant` | `"0xAlice"` | **Omit entirely** from attributes — only in encrypted payload |
| `status` | `"pending"` | Plaintext (status is public) or encrypted if sensitive |
| `commitment` | `"keccak256(...)"` | Plaintext (it's a hash, reveals nothing) |

**Key principle:** Do not put identifying attributes in string attributes at all. Put them in the encrypted payload. String attributes should contain only the minimum information needed to support legitimate queries (job ID, type, and possibly a commitment hash).

```typescript
// Correct design: no applicant identifier in cleartext attributes
await createEntity({
  payload: ECIES.encrypt(jobPosterPubKey, {
    applicantMainWallet: "0xAlice",
    applicantProfileKey: "0xAliceProfile",
    coverLetter: "...",
    identityCommitment: keccak256("0xAlice" + nonce),
    nonce: hex(randomBytes(32))
  }),
  stringAttributes: [
    { key: "type",       value: "application" },     // queryable
    { key: "job",        value: jobEntityKey },       // queryable
    { key: "commitment", value: commitmentHash }      // queryable hash, no PII
  ]
});
```

### Does Encrypted Attributes Solve the `entity.owner` Problem?

**No.** `entity.owner` is set by the chain, not by the application. Encrypting attribute values does not affect who the owner is.

### Can It Work Without Smart Contracts?

**Yes.** Encryption is entirely client-side. The payload and string attributes are arbitrary bytes/strings from the chain's perspective.

### UX Cost

**None** for the user. This is a developer-level design decision about what to put in attributes vs. payload.

### Libraries

No specialized library needed. `eciesjs`, `eth-crypto`, or `@noble/ciphers` + `@noble/secp256k1` handle the encryption. Standard `keccak256` for blind indices.

### Implementation Complexity

**Very Low.** Decide which fields go in attributes (plaintext) vs. payload (encrypted). Implement ECIES encryption for the payload.

### Verdict for Arkiv

Encrypting attributes is the **wrong framing**. The correct approach is to not put sensitive attributes in cleartext string attributes in the first place. Put sensitive data in the encrypted payload. This is not a privacy "pattern" — it is basic data hygiene. String attributes should contain only the minimum non-sensitive data needed for querying.

The payload is arbitrary bytes. Encrypt it with the job poster's ECIES public key from day one.

---

## 9. Comparative Analysis

### Evaluation Matrix

| Pattern | Solves `entity.owner`? | No Smart Contracts? | UX Cost | Complexity | Libs Available? | Arkiv Fit |
|---------|----------------------|--------------------:|---------|-----------|-----------------|-----------|
| **Stealth Addresses** | Yes* | Yes | High | Medium-High | Yes (ScopeLift, Fluidkey) | Phase 2 |
| **Burner Wallet** | Yes* | Yes | Low-Medium | Low | Yes (viem, @scure/bip32) | MVP |
| **Commitment Schemes** | No | Yes | Very Low | Very Low | Yes (viem) | Complement only |
| **Proxy Re-Encryption** | No | Yes | Very High | Very High | No (unmaintained) | Not recommended |
| **Ring Signatures** | No (needs burner) | Yes | High | High | Experimental only | Phase 3 |
| **Mixnet / Batching** | No | Yes | None | Low | Yes (bullmq) | MVP (batching) |
| **Encrypted Attributes** | No | Yes | None | Very Low | Yes (eciesjs) | Always (payload design) |

*Requires solving the gas funding problem first.

### Gas Funding Problem Summary

Both stealth addresses and burner wallets face the same gas funding challenge. The solutions in order of preference for Arkiv:

1. **Server-side relayer (recommended)**: Backend holds hot wallet pool, receives signed application intents, pays gas. `entity.owner` = relayer wallet. No key management for users. Fully solves the problem.

2. **Testnet faucet**: Chain-operated endpoint funds any address with small amount of gas. Works for Kaolin testnet today. Does not scale to mainnet.

3. **Direct user funding**: User funds burner from main wallet. Creates an observable on-chain link. Acceptable only if the link is through a mixer (not available on Kaolin) or the privacy requirement is relaxed.

### The Only Pattern That Solves `entity.owner` Without a Relayer

| Approach | Mechanism |
|----------|-----------|
| Stealth address + testnet faucet | Stealth addr gets gas from faucet, submits tx |
| Burner wallet + testnet faucet | Burner gets gas from faucet, submits tx |
| Server-side relayer | Relayer wallet is `entity.owner` — user wallet never touches chain |

All other patterns (commitments, PRE, ring sigs, mixnets) leave `entity.owner` = user's main wallet and merely obfuscate the application content or timing.

---

## 10. Architectural Recommendations

### For Arkiv MVP (Testnet / Hackathon Context)

**Recommended stack:**

1. **Encrypted payload (always)**: Application content encrypted with ECIES using the job poster's public key. Store in entity payload, not attributes. This is table stakes — do it from day one.

2. **Server-side relayer for entity creation**: User signs an EIP-712 application intent off-chain. Backend submits the entity creation from a hot wallet pool. `entity.owner` = hot wallet, not user wallet. This is the single most impactful change.

3. **Batch submission queue**: Queue applications, submit in 5-minute batches with random ordering. Cheap to implement, meaningful timing resistance.

4. **Hash commitment for staged reveal**: Include `identityCommitment = keccak256(mainWalletAddr || profileKey || nonce)` in the encrypted payload. This allows applicant to prove their identity to the job poster without revealing it to chain observers.

```
Chain visibility with this stack:
  tx.from = relayer_hot_wallet  ← not applicant's wallet
  entity.owner = relayer_hot_wallet  ← not linkable to applicant
  entity.stringAttributes = [type, job]  ← no PII
  entity.payload = <encrypted bytes>  ← only job poster can read
```

An observer sees: "some relayer submitted an application for job X." No applicant identity is recoverable without the job poster's private key.

### For Phase 2 (Post-MVP)

1. **Burner wallet per application (replacing relayer for full decentralization)**: Use HD derivation from wallet signature to generate per-job burner keys. Pair with testnet faucet or a lightweight gas sponsorship service.

2. **Stealth address standard compliance**: Implement using `@fluidkey/stealth-account-kit` for cryptographic correctness and future ecosystem compatibility.

3. **Batch submission with cover traffic**: Pad batches to constant size to prevent volume inference.

### For Phase 3 (If Privacy Becomes Core Product Feature)

1. **Ring signatures (LSAG)**: Implement properly once a vetted secp256k1 LSAG library exists, or use Semaphore (ZK group membership) as a cleaner alternative that already has audited JS libraries. Provides anonymous group membership proof with double-apply prevention.

2. **Nym mixnet integration**: Route application submission through Nym if network-level IP privacy is required.

3. **Threshold encryption at sequencer level**: If Arkiv evolves to support commit-reveal or Shutter-style threshold encryption, integrate for mempool-level privacy.

### What Not to Build

- **Proxy re-encryption**: No maintained JS library, unnecessary complexity given ECIES direct encryption achieves the same result.
- **Pedersen commitments**: Hash commitments are sufficient for our threat model.
- **Full Nym integration for MVP**: Massive infrastructure overhead for marginal gain on a testnet.
- **Attribute-level encryption**: Wrong abstraction. Put sensitive data in the payload and don't encrypt attributes — keep attributes minimal and non-identifying.

---

## Summary of Critical Insights

1. **`entity.owner` is set by `msg.sender` at tx submission time, immutably.** No amount of encrypting attributes or signing commitments changes this. The only way to solve it is to change who submits the transaction — via a relayer, a burner wallet, or a stealth address.

2. **Stealth addresses and burner wallets solve the same problem** with different complexity levels. For Arkiv without smart contracts, burner wallets are simpler and functionally equivalent. Stealth addresses are worth adopting for protocol compliance (EIP-5564 ecosystem) but not for their cryptographic necessity.

3. **The gas funding problem is the central barrier for address-unlinkability approaches** when no relayer is used. On a testnet with an open faucet, this is solvable. On a production chain without smart contract paymasters, the server-side relayer is the practical solution.

4. **Ring signatures provide a unique capability** (anonymous group membership + double-apply prevention) **that no other mechanism here provides**, but they require a proper LSAG implementation that does not yet exist as an audited JS library. Use Semaphore ZK proofs (see `07-zk-group-membership-anonymous-credentials.md`) as a cleaner alternative that achieves the same property.

5. **Commitments are a complement, not a solution.** They hide identity data from chain observers within the context of an already-unlinkable submission (burner/relayer), and they enable staged reveal to job posters. They do not replace address-unlinkability.

6. **Batch submission is cheap and impactful.** Add it to the relayer service at essentially zero cost.

7. **Proxy re-encryption is not relevant to this problem.** It solves data access delegation, not transaction identity hiding. No maintained JS library exists.

8. **Encrypting attributes breaks Arkiv's indexing.** Design entities so that PII lives in the encrypted payload, and only query-necessary non-PII lives in string attributes.

---

## Sources

- [EIP-5564: Stealth Addresses Specification](https://eips.ethereum.org/EIPS/eip-5564)
- [Vitalik Buterin: An Incomplete Guide to Stealth Addresses](https://vitalik.eth.limo/general/2023/01/20/stealth.html)
- [Fluidkey Stealth Account Kit (audited)](https://github.com/fluidkey/fluidkey-stealth-account-kit)
- [ScopeLift Stealth Address SDK](https://github.com/ScopeLift/stealth-address-sdk)
- [NuCypher Umbral PRE Scheme](https://medium.com/nucypher/unveiling-umbral-3d9d4423cd71)
- [rust-umbral GitHub](https://github.com/nucypher/rust-umbral)
- [nostringer: Ring Signatures for secp256k1](https://github.com/AbdelStark/nostringer)
- [Monero Ring Signature Moneropedia](https://www.getmonero.org/resources/moneropedia/ringsignatures.html)
- [Nym Mixnet SDK](https://sdk.nymtech.net/)
- [Mix Network (Wikipedia)](https://en.wikipedia.org/wiki/Mix_network)
- [Blind Index Pattern](https://github.com/ankane/blind_index)
- [Searchable Symmetric Encryption (Brown CS)](https://esl.cs.brown.edu/blog/how-to-search-on-encrypted-data-searchable-symmetric-encryption-part-5/)
- [eciesjs npm package](https://www.npmjs.com/package/eciesjs)
- [noble-secp256k1 (audited)](https://github.com/paulmillr/noble-secp256k1)
- [Linkable Ring Signature for Blockchain IIoT (MDPI 2025)](https://www.mdpi.com/1424-8220/25/12/3684)
- [Timing Analysis in Low-Latency Mix Networks (Cornell)](https://www.cs.cornell.edu/~shmat/shmat_esorics06.pdf)
