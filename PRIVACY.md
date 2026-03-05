# RootGraph Privacy Layer — Technical Report

## Executive Summary

RootGraph implements an **end-to-end encryption layer** for its on-chain job board, enabling users to post jobs with encrypted salaries and exchange encrypted application messages — all stored on the Arkiv Network. The exact salary amount is never visible on-chain; only an auto-calculated public range bracket is shown. A Noir zero-knowledge circuit is included to prove salary falls within the stated range without revealing the exact figure.

This report documents every component, algorithm, data flow, on-chain structure, and design decision in the privacy layer.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Key Derivation](#2-key-derivation)
3. [Encrypted Salary](#3-encrypted-salary)
4. [ZK Salary Range Proofs](#4-zk-salary-range-proofs)
5. [Encrypted Application Messages](#5-encrypted-application-messages)
6. [Key Lifecycle and Session Management](#6-key-lifecycle-and-session-management)
7. [On-Chain Data Structures](#7-on-chain-data-structures)
8. [User Interface Flows](#8-user-interface-flows)
9. [File Inventory](#9-file-inventory)
10. [Verified On-Chain Evidence](#10-verified-on-chain-evidence)
11. [Security Model and Threat Analysis](#11-security-model-and-threat-analysis)
12. [Known Limitations](#12-known-limitations)
13. [Future Work](#13-future-work)

---

## 1. Architecture Overview

```
                         Wallet Signature
                               |
                      personal_sign("RootGraph Encryption Key v1")
                               |
                               v
                    +---------------------+
                    |  signatureToBytes()  |  Hex -> Uint8Array
                    +---------------------+
                               |
                 +-------------+-------------+
                 |                           |
                 v                           v
    +------------------------+   +------------------------+
    | deriveEncryptionKeypair|   |   deriveSalaryKey      |
    | HKDF(sig, "RootGraph", |   | HKDF(sig, "RootGraph", |
    |   "encryption-v1", 32) |   |  "salary-encryption-   |
    | -> NaCl X25519 keypair |   |       v1", 32)         |
    +------------------------+   | -> 32-byte symmetric   |
         |            |          +------------------------+
         |            |                    |
         v            v                    v
    publicKey    secretKey            salaryKey
    (on-chain)   (session)           (session)
         |            |                    |
         |     +------+------+      +------+------+
         |     |             |      |             |
         v     v             v      v             v
    NaCl box          NaCl box.open   NaCl secretbox
    (encrypt msg)     (decrypt msg)   (encrypt salary)
```

### Components

| Component | File | Purpose |
|-----------|------|---------|
| `crypto.ts` | `src/lib/crypto.ts` | Core cryptographic primitives (HKDF, NaCl box, secretbox) |
| `zk.ts` | `src/lib/zk.ts` | ZK proof generation/verification (Noir + Barretenberg) |
| `CryptoProvider` | `src/providers/crypto-provider.tsx` | React context managing key lifecycle |
| `useCrypto` | `src/hooks/use-crypto.ts` | Consumer hook wrapping encrypt/decrypt operations |
| `salary_range` | `noir/salary_range/src/main.nr` | Noir circuit for ZK salary range proofs |

---

## 2. Key Derivation

### Process

1. User clicks "ENABLE" on the Settings page
2. App calls `personal_sign` with the deterministic message `"RootGraph Encryption Key v1"`
3. Wallet returns a 65-byte ECDSA signature (hex-encoded)
4. Signature is converted to bytes via `signatureToBytes()`
5. Two independent HKDF derivations produce separate keys:

```
Signature Bytes (65 bytes)
    |
    +---> HKDF(ikm=sig, salt="RootGraph", info="encryption-v1", len=32)
    |         -> 32-byte seed -> nacl.box.keyPair.fromSecretKey(seed)
    |         -> { publicKey: Uint8Array[32], secretKey: Uint8Array[32] }
    |
    +---> HKDF(ikm=sig, salt="RootGraph", info="salary-encryption-v1", len=32)
              -> 32-byte symmetric key for NaCl secretbox
```

### HKDF Implementation

Uses the Web Crypto API (`crypto.subtle`):
- **Extract:** `HMAC-SHA256(key=ikm, data=salt)` -> PRK (32 bytes)
- **Expand:** `HMAC-SHA256(key=PRK, data=info||0x01)` -> OKM (32 bytes)

**Note:** The Extract step uses `HMAC(key=ikm, data=salt)`, which swaps the key and data parameters compared to RFC 5869 (`HMAC(key=salt, data=ikm)`). This is a deliberate design trade-off documented in [Known Limitations](#12-known-limitations) — the derivation is deterministic and consistent, and changing it would break existing encrypted data on-chain. This is a simplified single-block HKDF sufficient for deriving 32-byte keys.

### Source: `crypto.ts:15-51`

```typescript
async function hkdf(ikm: Uint8Array, salt: string, info: string, length: number): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const ikmBuffer = new Uint8Array(ikm).buffer as ArrayBuffer
  const keyMaterial = await crypto.subtle.importKey('raw', ikmBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', keyMaterial, encoder.encode(salt)))

  const prkKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])

  const infoBytes = encoder.encode(info)
  const input = new Uint8Array(infoBytes.length + 1)
  input.set(infoBytes)
  input[infoBytes.length] = 1

  const okm = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, input))
  return okm.slice(0, length)
}
```

### Why This Design

- **Deterministic:** Same wallet + same message = same keys. No key storage needed beyond the signature.
- **Domain separation:** Different `info` strings produce independent keys for messaging vs salary encryption.
- **No new secrets:** Leverages the wallet's existing private key through `personal_sign`.

---

## 3. Encrypted Salary

### Encryption Algorithm

**NaCl `secretbox`** (XSalsa20 stream cipher + Poly1305 MAC):
- **Key:** 32-byte `salaryKey` derived via HKDF
- **Nonce:** 24 random bytes (generated per encryption)
- **Plaintext:** Salary amount as string (e.g., `"175000"`)

### Source: `crypto.ts:107-116`

```typescript
export function encryptSymmetric(plaintext: string, key: Uint8Array): SymmetricEncrypted {
  const nonce = nacl.randomBytes(24)
  const messageBytes = decodeUTF8(plaintext)
  const ciphertext = nacl.secretbox(messageBytes, nonce, key)
  return { ciphertext: encodeBase64(ciphertext), nonce: encodeBase64(nonce) }
}
```

### Decryption: `crypto.ts:118-128`

```typescript
export function decryptSymmetric(encrypted: SymmetricEncrypted, key: Uint8Array): string | null {
  const ciphertext = decodeBase64(encrypted.ciphertext)
  const nonce = decodeBase64(encrypted.nonce)
  const plaintext = nacl.secretbox.open(ciphertext, nonce, key)
  if (!plaintext) return null
  return encodeUTF8(plaintext)
}
```

### Salary Range Auto-Calculation

When a user enters an exact salary, a public range bracket is automatically computed:

```typescript
// zk.ts:75-82
export function calculateSalaryRange(amount: number): { rangeMin: number; rangeMax: number } {
  if (amount <= 50000) {
    const min = Math.floor(amount / 25000) * 25000
    return { rangeMin: min, rangeMax: min + 25000 }
  }
  const min = Math.floor(amount / 50000) * 50000
  return { rangeMin: min, rangeMax: min + 50000 }
}
```

| Salary | Bracket Size | Public Range |
|--------|-------------|--------------|
| $35,000 | $25k | $25,000 - $50,000 |
| $95,000 | $50k | $50,000 - $100,000 |
| $175,000 | $50k | $150,000 - $200,000 |
| $300,000 | $50k | $300,000 - $350,000 |

### What Goes On-Chain

```json
{
  "salary": "$150k - $200k",
  "salaryData": {
    "encryptedAmount": "gJwZtuqb7fOis4+ZBcPbWdMzwZukjQ==",
    "encryptedNonce": "8L/Zhx/3mAxGLseiODeYq1luO1jytAvR",
    "currency": "USD",
    "rangeMin": 150000,
    "rangeMax": 200000
  }
}
```

- `salary`: Human-readable range string (public)
- `encryptedAmount`: Base64 NaCl secretbox ciphertext (opaque on-chain)
- `encryptedNonce`: Base64 24-byte nonce
- `rangeMin`/`rangeMax`: Numeric range bounds (public, for filtering)
- `currency`: Currency code (public)

The exact salary ($175,000) exists **nowhere** in the on-chain data.

### Who Can Decrypt

Only the job poster. The `salaryKey` is derived from their wallet signature, which only they can produce.

---

## 4. ZK Salary Range Proofs

### Noir Circuit

**File:** `noir/salary_range/src/main.nr`

```noir
fn main(
    salary: u64,             // private: exact salary amount
    range_min: pub u64,      // public: stated range minimum
    range_max: pub u64,      // public: stated range maximum
) {
    assert(range_min <= range_max);   // sanity: valid range
    assert(salary >= range_min);       // salary >= min
    assert(salary <= range_max);       // salary <= max
}
```

This circuit proves three things without revealing `salary`:
1. The stated range is valid (`min <= max`)
2. The exact salary is at least the range minimum
3. The exact salary is at most the range maximum

### Proof Generation Flow

```
User enters $175,000
    |
    v
calculateSalaryRange(175000) -> { min: 150000, max: 200000 }
    |
    v
generateSalaryRangeProof(175000, 150000, 200000)
    |
    v
Noir circuit executes with private input salary=175000
    |
    v
Barretenberg backend generates SNARK proof
    |
    v
{ proof: base64, publicInputs: [150000, 200000] }
    |
    v
Stored on-chain alongside encrypted salary
```

### Verification

Any viewer can call `verifySalaryRangeProof(proof, publicInputs)` to verify the poster proved their salary is within the stated range, without learning the exact amount.

### Current Status: Graceful Degradation

The ZK proof system is implemented but currently fails at runtime due to a version mismatch between `@noir-lang/noir_js@1.0.0-beta.19` and `@noir-lang/backend_barretenberg@0.36.0`. Additionally, Barretenberg requires `SharedArrayBuffer` which needs COOP/COEP headers that conflict with Privy's auth iframes.

**Behavior:** When proof generation fails, the job posts normally with the encrypted salary and public range but without a ZK proof attached. A neutral toast informs the user: "Posted without ZK proof — Salary range is shown but not cryptographically verified."

The circuit is compiled and deployed to `public/circuits/salary_range.json` (1,781 bytes), ready for when compatible library versions are available.

---

## 5. Encrypted Application Messages

### Algorithm

**NaCl `box`** (X25519 Diffie-Hellman + XSalsa20-Poly1305):
- Applicant's secret key + Poster's public key -> shared secret
- Message encrypted with 24-byte random nonce

### Context Binding

Messages are prefixed with a context string to prevent cross-context replay:

```typescript
const contextBound = context + ':' + message  // e.g., "job-application:0xe1db...:Hello!"
```

On decryption, the context prefix is verified before returning the plaintext.

### Source: `crypto.ts:66-84`

```typescript
export function encryptForRecipient(
  message: string, senderSecretKey: Uint8Array,
  recipientPublicKey: Uint8Array, context: string
): EncryptedPayload {
  const nonce = nacl.randomBytes(24)
  const contextBound = context + ':' + message
  const messageBytes = decodeUTF8(contextBound)
  const ciphertext = nacl.box(messageBytes, nonce, recipientPublicKey, senderSecretKey)
  if (!ciphertext) throw new Error('Encryption failed')

  const senderKeypair = nacl.box.keyPair.fromSecretKey(senderSecretKey)
  return {
    ciphertext: encodeBase64(ciphertext),
    nonce: encodeBase64(nonce),
    senderPublicKey: encodeBase64(senderKeypair.publicKey),
  }
}
```

### Encryption Flow

```
Applicant clicks "Express Interest" with message
    |
    v
useCrypto().encryptForWallet(message, posterWallet, context)
    |
    +---> Fetch poster's profile from Arkiv
    |     Extract poster's encryptionPublicKey
    |
    +---> encryptForRecipient(message, applicantSecretKey, posterPublicKey, context)
    |
    v
EncryptedPayload { ciphertext, nonce, senderPublicKey } stored on-chain
```

### Plaintext Safety

When the **applicant** has encryption enabled:
- If the poster also has encryption → message is encrypted with NaCl box
- If the poster lacks encryption → `encryptForWallet` returns `null` → message is **omitted entirely** (not sent in plaintext)
- The user sees a yellow warning that the poster hasn't enabled encryption

When the **applicant** has encryption disabled:
- The application message is sent as plaintext on-chain (the applicant has not opted into privacy)

This ensures users who have opted into encryption never have their messages sent in plaintext without their knowledge.

### Who Can Decrypt

Only the job poster, using their secret key + the applicant's public key (included in the payload).

---

## 6. Key Lifecycle and Session Management

### CryptoProvider (`crypto-provider.tsx`)

The `CryptoProvider` React context manages the entire key lifecycle:

```
App loads
    |
    v
CryptoProvider initializes
    |
    +---> Check sessionStorage for cached keys (keyed by wallet address)
    |     If found: restore keys from cache
    |     If not: keys remain null (encryption disabled)
    |
    v
User clicks "ENABLE" in Settings
    |
    +---> promptForSignature()
    |     personal_sign("RootGraph Encryption Key v1")
    |
    +---> deriveKeys(signatureFn)
    |     HKDF -> keypair + salaryKey
    |     Cache in sessionStorage
    |     Set React state
    |
    v
Encryption enabled for this session
```

### Wallet Switch Handling

When the user switches wallets, all keys are cleared immediately:

```typescript
useEffect(() => {
  setKeys(null)  // Clear keys on wallet change
  if (!wallet?.address) { setIsInitializing(false); return }
  const cached = loadCachedKeys(wallet.address)
  if (cached) setKeys(cached)
  setIsInitializing(false)
}, [wallet?.address])
```

### Session Storage

Keys are cached in `sessionStorage` (tab-scoped):
- **Key format:** `rg_crypto_{walletAddress}`
- **Value:** JSON with base64-encoded `publicKey`, `secretKey`, `salaryKey`
- **Lifetime:** Cleared when the tab closes
- **Isolation:** Each wallet address has its own cache entry

---

## 7. On-Chain Data Structures

### Profile Entity (with encryption)

```json
{
  "displayName": "Alice",
  "position": "Engineer",
  "company": "Acme",
  "tags": ["builder"],
  "avatarUrl": "",
  "createdAt": "2026-03-05T23:00:53.540Z",
  "encryptionPublicKey": "hS9ux4L+eh6psxaQmhdQ9EB87fBkDyDYuU8Eqe9Gzj0="
}
```

The `encryptionPublicKey` field is the base64-encoded X25519 public key. It enables any other user to encrypt messages for this profile's owner.

### Job Entity (with encrypted salary)

```json
{
  "title": "ZK Privacy Engineer",
  "company": "RootGraph Labs",
  "location": "",
  "description": "Build privacy-preserving features...",
  "salary": "$150k - $200k",
  "applyUrl": "",
  "tags": ["rust"],
  "isRemote": false,
  "postedAt": "2026-03-05T23:05:06.447Z",
  "salaryData": {
    "encryptedAmount": "gJwZtuqb7fOis4+ZBcPbWdMzwZukjQ==",
    "encryptedNonce": "8L/Zhx/3mAxGLseiODeYq1luO1jytAvR",
    "currency": "USD",
    "rangeMin": 150000,
    "rangeMax": 200000
  }
}
```

### Job Application Entity (with encrypted message)

```json
{
  "jobEntityKey": "0xe1db...",
  "applicantWallet": "0xabc...",
  "appliedAt": "2026-03-05T23:10:00.000Z",
  "encryptedMessage": {
    "ciphertext": "base64...",
    "nonce": "base64...",
    "senderPublicKey": "base64..."
  }
}
```

---

## 8. User Interface Flows

### Enabling Encryption (Settings Page)

1. User creates a profile (required first)
2. `[ ENCRYPTION ]` section appears below profile form
3. Shows "Encryption disabled" with shield icon and "ENABLE" button
4. User clicks ENABLE -> wallet prompts for signature
5. Keys derived -> UI shows green shield, "Encryption enabled", and the public key
6. User clicks "SAVE CHANGES" -> public key saved to profile entity on Arkiv

### Posting a Job with Private Salary

1. User clicks "POST A JOB" on the job board
2. Salary field shows "MAKE PRIVATE" button (only visible if encryption is enabled)
3. Clicking "MAKE PRIVATE" toggles to the private salary form:
   - Green info banner: "Exact salary encrypted. Only you can see it. A range will be shown publicly."
   - Exact Amount input (number) + Currency dropdown (USD/EUR/GBP)
   - Public Range fields (auto-calculated, editable)
   - "Displayed as: $150k - $200k" preview
   - "A ZK proof will verify the exact salary falls within this range" note
4. On submit: salary encrypted with secretbox, range stored in plaintext, ZK proof attempted
5. Job posted to Arkiv with encrypted salary data

### Viewing Jobs

**As job poster (owner):**
- Decrypted salary shown in green: "$ USD 175,000"
- Public range in grey parentheses: "($150k - $200k)"
- Green shield icon confirming encryption

**As any other viewer:**
- Only the public range shown: "$ $150k - $200k"
- Shield icon indicating salary is encrypted
- No "unlock" or "enable encryption to view" prompt (by design — symmetric encryption means only the poster can decrypt)

### Applying with Encrypted Message

1. Viewer opens a job detail page and types an application message
2. If both applicant and poster have encryption enabled:
   - Green lock icon shown next to the message input
   - Message encrypted with NaCl box on submit
3. If poster lacks encryption:
   - Yellow warning: "Poster hasn't enabled encryption"
   - Message is omitted (not sent in plaintext)
4. Poster views applications and sees decrypted messages with lock icons

---

## 9. File Inventory

### Core Privacy Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/lib/crypto.ts` | 146 | HKDF, NaCl box/secretbox, key derivation, encoding utilities |
| `src/lib/zk.ts` | 83 | Noir circuit initialization, proof generation/verification, salary range calculation |
| `src/providers/crypto-provider.tsx` | 138 | React context for key lifecycle, sessionStorage caching, wallet signature prompt |
| `src/hooks/use-crypto.ts` | 76 | Consumer hook: encryptForWallet, decryptMessage, encryptSalary, decryptSalary |
| `noir/salary_range/src/main.nr` | 9 | Noir ZK circuit: salary in [min, max] |
| `public/circuits/salary_range.json` | 1 | Compiled Noir circuit artifact (1,781 bytes) |

### UI Files Using Privacy Features

| File | Privacy Features |
|------|-----------------|
| `src/app/(app)/settings/page.tsx` | Encryption enable UI, public key display, save to profile |
| `src/app/(app)/jobs/post/page.tsx` | Private salary toggle, encrypted salary form, ZK proof attempt |
| `src/app/(app)/jobs/[id]/page.tsx` | Salary decryption (owner view), encrypted message sending, message decryption |
| `src/app/(app)/jobs/[id]/edit/page.tsx` | Salary re-encryption on edit, ZK proof attempt |
| `src/app/(app)/jobs/page.tsx` | Salary range display with shield icon on job cards |

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `tweetnacl` | ^1.0.3 | NaCl box (X25519 + XSalsa20-Poly1305), NaCl secretbox |
| `tweetnacl-util` | ^0.15.1 | Base64/UTF8 encoding utilities |
| `@noir-lang/noir_js` | ^1.0.0-beta.19 | Noir circuit execution in browser |
| `@noir-lang/backend_barretenberg` | ^0.36.0 | Barretenberg SNARK backend for Noir |

---

## 10. Verified On-Chain Evidence

All data below was verified live on the Arkiv Explorer on March 5, 2026.

### Wallet Address

**Explorer:** [explorer.kaolin.hoodi.arkiv.network/address/0xb4ba65732cbdbeb0b5dd34c74ae80c3fb37bc7ee](https://explorer.kaolin.hoodi.arkiv.network/address/0xb4ba65732cbdbeb0b5dd34c74ae80c3fb37bc7ee)

- 3 transactions, 2 owned entities, 0 failed transactions
- 642 bytes total on-chain data

### Profile Entity

**Explorer:** [explorer.kaolin.hoodi.arkiv.network/entity/0xcde6af5c3fd8073df01a4f8d6a9ba112323d6df5357b1bbd8f8faf1645a555c6](https://explorer.kaolin.hoodi.arkiv.network/entity/0xcde6af5c3fd8073df01a4f8d6a9ba112323d6df5357b1bbd8f8faf1645a555c6)

- **Size:** 178 bytes
- **Status:** Active
- **Key field:** `encryptionPublicKey: "hS9ux4L+eh6psxaQmhdQ9EB87fBkDyDYuU8Eqe9Gzj0="`
- **Annotations:** `app: rootgraph`, `entityType: profile`, `username: testuser`

### Job Entity (Encrypted Salary)

**Explorer:** [explorer.kaolin.hoodi.arkiv.network/entity/0xe1dbdd34f8f37fc7271f429d654197536730a12906d56cd911f8a543ae2114e5](https://explorer.kaolin.hoodi.arkiv.network/entity/0xe1dbdd34f8f37fc7271f429d654197536730a12906d56cd911f8a543ae2114e5)

- **Size:** 464 bytes
- **Status:** Active
- **Salary field (public):** `"$150k - $200k"` — only the range is visible
- **Encrypted amount:** `"gJwZtuqb7fOis4+ZBcPbWdMzwZukjQ=="` — opaque ciphertext
- **Nonce:** `"8L/Zhx/3mAxGLseiODeYq1luO1jytAvR"` — 24-byte random nonce
- **Range bounds:** `rangeMin: 150000`, `rangeMax: 200000`
- **Annotations:** `app: rootgraph`, `entityType: job`, `postedBy: 0xb4ba...`, `status: active`

The exact salary ($175,000) was successfully decrypted in the app by the job poster but is **nowhere in the on-chain data** in plaintext.

---

## 11. Security Model and Threat Analysis

### What the Privacy Layer Protects Against

| Threat | Protection |
|--------|-----------|
| On-chain salary snooping | Exact salary encrypted with NaCl secretbox; only range bracket visible |
| Application message eavesdropping | Messages encrypted with NaCl box (X25519 ECDHE) |
| Cross-context message replay | Context string bound into ciphertext; verified on decryption |
| Plaintext leakage when poster lacks encryption | Message omitted entirely; never sent unencrypted |
| Key contamination on wallet switch | All keys cleared from React state when wallet address changes |

### Cryptographic Guarantees

| Property | Guarantee |
|----------|-----------|
| **Confidentiality** | XSalsa20 stream cipher (256-bit key) |
| **Integrity** | Poly1305 MAC on all ciphertexts |
| **Authenticity (messages)** | X25519 ECDH authenticates both sender and recipient |
| **Key derivation** | HKDF with domain-separated info strings |
| **Nonce uniqueness** | 24-byte random nonce per encryption (192-bit, collision-resistant) |

### Trust Model

- **Wallet security:** The privacy layer's security reduces to the security of the user's wallet private key. If the wallet is compromised, the attacker can re-derive all encryption keys.
- **Client-side only:** All cryptographic operations run in the browser. No server sees plaintext data.
- **Arkiv as storage:** Arkiv stores opaque ciphertext blobs. The chain provides integrity and availability, not confidentiality.

---

## 12. Known Limitations

| Limitation | Impact | Rationale |
|-----------|--------|-----------|
| **Session keys in sessionStorage** | XSS attack could extract keys | Acceptable for hackathon MVP. Production would use WebAuthn or hardware-backed key derivation. |
| **ZK proofs not functional** | Salary range is trusted, not cryptographically verified | Version mismatch between Noir JS and Barretenberg backend. Circuit is compiled and ready; graceful degradation handles the failure. |
| **ZK proof not bound to ciphertext** | Poster could theoretically prove a range for a different salary than what's encrypted | Circuit design limitation. For MVP, encryption alone provides the core privacy. Fixing requires commitment schemes in a future version. |
| **No salary sharing with candidates** | Only the poster can decrypt the exact salary | By design for symmetric encryption. Re-encryption or proxy re-encryption could enable selective sharing in v2. |
| **Single-block HKDF** | Non-standard parameter order (salt/info swapped vs RFC 5869) | Deterministic and consistent — changing would break existing encrypted data. |
| **SharedArrayBuffer requirement for ZK** | COOP/COEP headers conflict with Privy auth iframes | Fundamental browser security constraint. Would require moving ZK to a Web Worker or server-side proving. |

---

## 13. Future Work

1. **Fix ZK proof generation** — Align `noir_js` and `backend_barretenberg` versions, or move proving to a Web Worker to avoid COOP/COEP conflicts
2. **Commitment-bound proofs** — Bind the ZK proof to the encrypted ciphertext hash so the proof can't be reused with a different encrypted salary
3. **Selective salary reveal** — Enable posters to re-encrypt the salary for specific candidates using NaCl box
4. **WebAuthn key derivation** — Replace `personal_sign` with WebAuthn-backed key generation for hardware-level security
5. **Forward secrecy** — Implement ephemeral key exchange for application messages
6. **On-chain proof verification** — Deploy a Solidity verifier contract on Arkiv for trustless on-chain salary range verification

---

## Appendix: Cryptographic Library Choices

### Why TweetNaCl?

- **Audited:** The original NaCl library is by Daniel J. Bernstein. TweetNaCl is a minimal, audited JavaScript port.
- **No configuration:** No cipher suite negotiation, no mode selection — a single secure default for each operation.
- **Small:** ~7KB minified. No WASM, no native modules.
- **Proven primitives:** X25519 (ECDH), XSalsa20 (stream cipher), Poly1305 (MAC) are considered state-of-the-art symmetric/asymmetric cryptography.

### Why HKDF via Web Crypto?

- **Native performance:** `crypto.subtle.sign('HMAC', ...)` runs in the browser's native crypto implementation.
- **No additional dependencies:** Uses the built-in Web Crypto API.
- **Deterministic:** Same input always produces the same output — critical for re-deriving keys from wallet signatures.

### Why Noir for ZK?

- **Rust-like syntax:** Familiar to blockchain developers.
- **SNARK-based:** Small proof size, fast verification.
- **Browser-compatible:** Compiles to ACIR (Abstract Circuit Intermediate Representation) executable via WASM.
- **Growing ecosystem:** Backed by Aztec, gaining adoption in the privacy-focused blockchain space.
