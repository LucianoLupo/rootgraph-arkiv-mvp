# Security Audit — RootGraph × Arkiv MVP

**Reviewer:** security-reviewer (Senior Security Engineer)  
**Date:** 2026-03-01  
**Scope:** All source files in `src/`  
**Severity Scale:** P1 (Critical) · P2 (Important) · P3 (Nice-to-have)

---

## Executive Summary

The RootGraph MVP has a reasonable security posture for a hackathon project, primarily because Arkiv enforces owner-only writes at the protocol level — meaning most write-side attacks would fail at the chain layer rather than in application code. However, several significant issues exist around query injection, auth enforcement gaps, missing validation, and abuse vectors that would need remediation before any production deployment.

**Totals:** 3 × P1 · 5 × P2 · 5 × P3

---

## P1 — Critical

### 1. Query Injection in `searchProfiles()` (Arkiv Query Language Injection)

**File:** `src/lib/arkiv.ts:112-121`  
**Category:** Input Sanitization

The search function constructs a raw query string by interpolating user input:

```ts
const safeQuery = query.toLowerCase().replace(/['"\\]/g, '')
const result = await client.query(
  `entityType = "profile" && app = "${APP_TAG}" && username GLOB "*${safeQuery}*"`,
  ...
)
```

**Problem:** The sanitization only strips `'`, `"`, and `\`. This is insufficient for a GLOB-based query language. An attacker can inject:
- **Logical operators:** Input like `* && entityType = "connection-request"` could alter query semantics to enumerate connection requests (including messages) across all users.
- **Wildcards:** `*` and `?` characters are not stripped, allowing GLOB pattern manipulation.
- **Parentheses and operators:** Characters like `(`, `)`, `&&`, `||`, `!` are not sanitized, potentially allowing boolean injection to bypass the `app = "rootgraph"` filter.
- **Cross-app data leakage:** If the injection can break out of the `app` filter, an attacker could read entities from other Arkiv applications on the same chain.

**Proof of concept input:** `" || entityType = "connection-request" && app = "rootgraph` — depending on Arkiv's query parser, this could return connection requests instead of profiles.

**Recommendation:** Use the `buildQuery()` API with `eq()` predicates exclusively. If GLOB/wildcard is needed, use a parameterized approach or implement a strict allowlist regex: `/^[a-z0-9._-]+$/`.

---

### 2. No Server-Side Auth — All Route Protection is Client-Side Only

**File:** `src/app/(app)/layout.tsx`  
**Category:** Auth Flow / Client-Side Trust

The auth guard is purely client-side:

```tsx
useEffect(() => {
  if (ready && !authenticated) {
    router.replace('/');
  }
}, [ready, authenticated, router]);
```

**Problems:**
1. **No Next.js middleware** exists (confirmed — no `middleware.ts` file). There is zero server-side route protection. An attacker can:
   - Directly navigate to `/dashboard`, `/connections`, `/search`, `/settings` and see the rendered HTML/JS before the client-side redirect fires.
   - During the loading state (`!ready || !isReady`), the page renders a spinner — but the JS bundle with all page logic is already delivered.
2. **Race condition:** Between `ready` becoming `true` and the redirect executing, there's a window where the page is rendered as `null` but the component tree has already mounted. This is cosmetic for most pages (they rely on wallet state), but the search page and trust map fetch public data and would display results regardless of auth.
3. **SSR/RSC gap:** All pages are `'use client'`, so Next.js serves them as client components. The HTML shell is served to anyone. While the actual data requires wallet-signed operations, the app's structure and routes are exposed.

**Recommendation:** Add `middleware.ts` at the app root that checks for a Privy session cookie/token and redirects unauthenticated requests to `/`. This is the standard Privy + Next.js pattern.

---

### 3. Username Uniqueness Race Condition — TOCTOU on Profile Creation

**File:** `src/app/(app)/settings/page.tsx` + `src/lib/arkiv.ts`  
**Category:** Username Squatting

The username availability check and profile creation are separate, non-atomic operations:

```
1. checkUsername() → queries Arkiv, returns "available"
2. (time gap — could be seconds or minutes)
3. handleSave() → calls createProfile() with that username
```

**Problem:** Two users can simultaneously check the same username, both get "available," and both create profile entities with the same username. Arkiv stores both — there is no uniqueness constraint at the entity layer.

**Impact:**
- **Identity confusion:** Two profiles with the same username. `getProfileByUsername()` returns `.limit(1)`, so whichever entity the query returns first "wins," which could change over time.
- **Impersonation:** An attacker can claim a username they observed someone else checking, then create a look-alike profile.
- **Username squatting:** Automated scripts could mass-register usernames before legitimate users.

**Recommendation:**
1. Short-term: Check username availability again immediately before `createProfile()` in `handleSave()`.
2. Medium-term: Implement a "username reservation" entity pattern — create a short-lived claim entity, then verify ownership before finalizing the profile.
3. Long-term: If Arkiv supports conditional writes or unique attribute constraints, use those.

---

## P2 — Important

### 4. Connection Request Spoofing — No Validation of `from` Field

**File:** `src/lib/arkiv.ts:155-172`  
**Category:** Connection Request Spoofing

`sendConnectionRequest()` accepts `fromWallet` as a parameter and stores it as an attribute:

```ts
export async function sendConnectionRequest(
  walletClient: ArkivWalletClient,
  fromWallet: string,
  toWallet: string,
  ...
```

The calling code passes `walletAddress` from the Zustand store, but there's no server-side enforcement that `fromWallet === walletClient.account`. The entity's `owner` field (set by Arkiv based on the signing wallet) would differ from the `from` attribute if spoofed.

**Impact:** A malicious user could craft a transaction where:
- `from` attribute = victim's wallet address
- Entity owner = attacker's wallet
- This could make it appear that the victim sent the connection request

The `getIncomingRequests()` query filters on `from` attribute, not entity owner, so a spoofed request would appear as coming from the victim.

**Recommendation:** When displaying incoming requests, verify `entity.owner === request.from`. Add this check in `getIncomingRequests()`:

```ts
return result.entities
  .filter(entity => entity.owner === entity.attributes.find(a => a.key === 'from')?.value)
  .map(...)
```

---

### 5. Rejection Doesn't Actually Do Anything

**File:** `src/app/(app)/connections/page.tsx:37-40`  
**Category:** Data Integrity

```ts
const handleReject = (fromWallet: string) => {
  console.log('Reject connection from', fromWallet);
  toast({ title: 'Request declined' });
};
```

**Problem:** The reject handler is a no-op. The connection request entity remains on Arkiv with `status: "pending"` forever. The user sees a "Request declined" toast but:
1. The request keeps appearing after a page refresh.
2. The sender's outgoing request still shows as pending.
3. There's no way to update the request status because only the entity owner (the sender) can update it — the recipient has no write access.

**Impact:** This is a UX deception (user thinks they rejected) and a design flaw. Combined with finding #9 (DoS), rejected spam requests will permanently clog the inbox.

**Recommendation:**
- Store a separate "rejection" entity owned by the recipient, and filter out requests that have a corresponding rejection.
- Or implement an off-chain rejection cache (localStorage) with a disclaimer.

---

### 6. XSS via User-Generated Content

**Files:** All pages rendering `displayName`, `position`, `company`, `tags`, `message`  
**Category:** Input Sanitization / XSS

User-generated fields from Arkiv entities are rendered directly via JSX:

```tsx
<p className="font-medium">{result.displayName || 'Anonymous'}</p>
<p className="text-sm text-gray-400">{result.position}...</p>
<span>{req.message}</span>
```

**Mitigation already in place:** React's JSX escapes strings by default, so basic `<script>` injection won't work. This is **not** a traditional XSS vector.

**Remaining risk:**
- **`dangerouslySetInnerHTML`** is not used anywhere — good.
- **`explorerUrl` construction** in `profile/[username]/page.tsx` uses `targetWallet` from the URL param directly in an `href`. If `targetWallet` is a non-hex string (e.g., `javascript:alert(1)`), it could be an issue. However, it's used in `https://kaolin.hoodi.arkiv.network/address/${targetWallet}`, so the protocol is hardcoded to `https:`. **Low risk.**
- **Connection request `message` field** is rendered with `&ldquo;{req.message}&rdquo;` — safe due to React escaping.
- **No Content-Security-Policy** headers are configured. A supply-chain attack on any dependency could inject arbitrary scripts.

**Recommendation:** 
- Add input validation (max length, character allowlists) on profile fields before writing to Arkiv.
- Add CSP headers via `next.config.mjs`.

---

### 7. Missing Input Validation on All User Fields

**File:** `src/app/(app)/settings/page.tsx`  
**Category:** Input Sanitization / Data Quality

No validation exists for any profile field:
- **Username:** No format validation. Can contain spaces, unicode, zero-width characters, emoji, or be an extremely long string.
- **Display name:** Unlimited length, no character restrictions.
- **Position / Company:** Same.
- **Tags:** Restricted to a predefined set (good), but only enforced client-side.

**Impact:**
- Unicode homograph attacks on usernames (e.g., `аlice` using Cyrillic `а` vs `alice`).
- Extremely long strings could bloat entity storage and cause UI overflow.
- A malicious actor calling `createProfile()` directly (not through the UI) could store arbitrary data.

**Recommendation:** Add validation regex for username (`/^[a-z0-9._-]{3,30}$/`), max lengths for all fields, and document that client-side validation is UX-only (Arkiv entities can be created by anyone with a wallet client).

---

### 8. `acceptConnection()` Creates Duplicate Connections

**File:** `src/lib/arkiv.ts:196-213`  
**Category:** Data Integrity

`acceptConnection()` creates a new connection entity but never:
1. Checks if a connection already exists between the two wallets.
2. Deletes or marks the original connection request as accepted.

**Impact:**
- Clicking "Accept" multiple times (or re-accepting after a page refresh) creates duplicate connection entities.
- `getConnections()` would return duplicates, inflating connection counts.
- `getConnectionCount()` uses `.count()` which would count duplicates.
- Old `pending` request entities remain forever.

**Recommendation:**
- Call `isConnected()` before creating the connection entity.
- Delete or update the request entity after acceptance (though only the request owner can update it — see design note in finding #5).

---

## P3 — Nice-to-have

### 9. Denial-of-Service: Unbounded Entity Creation

**Category:** DoS Vectors

There are no rate limits on entity creation. An attacker can:
1. **Spam connection requests:** Send thousands of requests to a single user, flooding their inbox. `getIncomingRequests()` limits to 100, but the attacker could create thousands.
2. **Spam profiles:** Create thousands of profile entities (different wallets) to pollute search results and the trust map.
3. **Spam activity:** `logActivity()` creates entities with no throttling.
4. **Graph pollution:** The trust map (`buildGraphData()`) fetches `limit(500)` connections and `limit(200)` profiles. An attacker could fill these limits with junk data.

**Mitigation:** This is partially Arkiv's responsibility (gas costs for entity creation should provide economic rate limiting on mainnet). On testnet, gas is free, so this is exploitable.

**Recommendation:** Add application-level cooldowns (e.g., one connection request per target per hour), and filter out entities from wallets with suspicious activity patterns.

---

### 10. Wallet Address Exposure in Public Data

**Category:** Data Exposure

All Arkiv data is public by design. The following are stored as queryable attributes:
- Wallet addresses (in profiles, connections, connection requests, activity logs)
- Usernames linked to wallet addresses
- Connection graphs (who is connected to whom)
- Connection request messages
- Activity history (who did what, when)

**Assessment:** This is by design for a "decentralized trust graph." However:
- **Connection request messages** could contain sensitive information. Users should be warned that messages are public.
- **Activity logs** reveal behavioral patterns (when users are online, who they're connecting with).

**Recommendation:** Add a visible "⚠️ All data is publicly visible on Arkiv" warning on the settings page and connection request form. Consider encrypting connection request messages if privacy is desired.

---

### 11. Privy App ID Exposed Client-Side

**File:** `src/providers/privy-provider.tsx`  
**Category:** Configuration

`NEXT_PUBLIC_PRIVY_APP_ID` is exposed in the client bundle. This is **expected behavior** for Privy — the app ID is a public identifier, not a secret. However:
- If the Privy dashboard has misconfigured allowed origins, an attacker could use this app ID from a phishing domain.
- No `allowedDomains` restriction visible in the Privy config.

**Recommendation:** Verify that the Privy dashboard has origin restrictions configured for production domains.

---

### 12. No CSRF Protection — But Not Needed

**Category:** CSRF / Session

Privy uses token-based auth with embedded wallets. There are no server-side endpoints accepting cookie-based auth, so traditional CSRF is not applicable. All state-changing operations are signed by the wallet client, which requires the private key.

**Assessment:** No CSRF vulnerability exists in the current architecture. This is a non-issue.

---

### 13. Entity Ownership — Correctly Delegated to Arkiv

**Category:** Entity Ownership

Arkiv enforces owner-only writes at the protocol level. The `walletClient.updateEntity()` and `walletClient.createEntity()` calls are signed by the user's wallet, and Arkiv verifies the signature. A user cannot update/delete entities they don't own.

**Assessment:** The app correctly relies on Arkiv for write authorization. No app-layer bypass exists.

**Minor note:** The `updateProfile()` function doesn't verify that `entityKey` belongs to the current user before calling `updateEntity()`. However, Arkiv would reject the transaction if the signer isn't the owner, so this is defense-in-depth rather than a vulnerability.

---

### 14. Dependency Notes

**Category:** Dependencies

| Package | Version | Notes |
|---------|---------|-------|
| `next` | 14.2.35 | Check for known CVEs. Next.js 14.x has had server action vulnerabilities in earlier patches. 14.2.35 appears recent. |
| `@privy-io/react-auth` | ^3.15.0 | Privy manages embedded wallet keys in an iframe sandbox. Keys never touch the app's JS context. No known key exposure. |
| `@arkiv-network/sdk` | ^0.6.2 | Pre-1.0 SDK. API stability not guaranteed. Review changelog for security patches. |
| `react-force-graph-2d` | ^1.29.1 | Canvas-based rendering. Low XSS risk. |
| `zustand` | ^5.0.11 | Client-side state only. No security concerns. |

**Recommendation:** Run `npm audit` and pin dependency versions for reproducible builds.

---

## Architecture-Level Observations

### Public Data Model — By Design, Not a Bug

The entire application stores data on Arkiv, which is a public blockchain data layer. This means:
- Anyone can query all profiles, connections, connection requests, and activity logs without authentication.
- The "auth guard" only controls the app's UI, not data access.
- A motivated attacker can build their own client that reads all RootGraph data without ever logging in.

**This is architecturally correct for a decentralized trust graph**, but users should be clearly informed that their professional connections and activity are public.

### Embedded Wallet Security

Privy's embedded wallets use an iframe sandbox with key sharding. The private key is never accessible to the application's JavaScript context. This is well-implemented:
- The provider is passed to `createArkivWalletClient()` as an EIP-1193 provider — the key stays in Privy's iframe.
- `wallet.address` is public information, not a secret.
- No `console.log` of sensitive data found.

---

## Summary Table

| # | Finding | Severity | Category |
|---|---------|----------|----------|
| 1 | Query injection in `searchProfiles()` | **P1** | Input Sanitization |
| 2 | No server-side auth (no middleware) | **P1** | Auth Flow |
| 3 | Username uniqueness TOCTOU race condition | **P1** | Username Squatting |
| 4 | Connection request `from` field spoofable | **P2** | Spoofing |
| 5 | Reject handler is a no-op | **P2** | Data Integrity |
| 6 | XSS surface (mitigated by React, but no CSP) | **P2** | XSS |
| 7 | No input validation on profile fields | **P2** | Input Sanitization |
| 8 | Duplicate connections on re-accept | **P2** | Data Integrity |
| 9 | DoS via unbounded entity creation | **P3** | DoS |
| 10 | Sensitive data in public connection messages | **P3** | Data Exposure |
| 11 | Privy App ID origin restrictions | **P3** | Configuration |
| 12 | CSRF — not applicable | **P3** | N/A (Non-issue) |
| 13 | Entity ownership — correctly handled by Arkiv | **P3** | N/A (Positive finding) |
| 14 | Dependency audit needed | **P3** | Dependencies |
