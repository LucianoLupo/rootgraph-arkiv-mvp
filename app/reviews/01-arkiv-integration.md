# Review 01: Arkiv SDK Integration & Data Model

**Reviewer:** Arkiv Integration Specialist  
**Date:** 2026-03-01  

---

## P1 — Critical

### 1. `searchProfiles()` uses raw query string with injection risk
**File:** `arkiv.ts:176`  
The GLOB query is built via string interpolation. Even with partial sanitization (`replace(/['"\\]/g, '')`), Arkiv's query parser accepts `&&`, `||`, `()` operators. An attacker could craft a username search like `" || entityType = "connection-request` to enumerate other entity types.

**Fix:** Replace with `buildQuery().where(eq('username', ...))` and filter client-side for partial matches. Or use a stricter allowlist regex (`/^[a-z0-9._-]+$/`).

### 2. `createArkivWalletClient()` passes address string as `account`
**File:** `arkiv.ts:68`  
```typescript
account: address,  // address is a Hex string
```
Viem's `createWalletClient` expects an `Account` object (with `signTransaction`, `signMessage` methods), not a plain string. When using `custom(provider)` transport, the account signing is delegated to the provider, but passing a raw string may cause type mismatches or silent failures on certain viem actions. The Arkiv SDK re-exports viem's `createWalletClient` which inherits this requirement.

**Fix:** Either omit `account` and let the provider handle it, or use `account: { address, type: 'json-rpc' }`. Test this thoroughly on Kaolin.

### 3. `handleReject` is a no-op — request stays on-chain forever
**File:** `connections/page.tsx:42`  
```typescript
const handleReject = (fromWallet: string) => {
  console.log('Reject connection from', fromWallet);
  toast({ title: 'Request declined' });
};
```
This never touches Arkiv. The request entity persists. The user thinks they rejected, but the requester still sees "pending." Worse: the requester could later accept on behalf of the recipient by creating the connection entity themselves (see Security review).

**Fix:** Since you can't delete entities you don't own, create a `rejection` entity (`entityType: "connection-rejection"`) that the acceptor owns. The app then checks for rejections when showing pending requests.

---

## P2 — Important

### 4. `acceptConnection` doesn't clean up the request
When Bob accepts Alice's request, a `connection` entity is created but the `connection-request` entity (owned by Alice) stays as `status="pending"`. Next time Bob loads pending requests, Alice's request still appears. The app needs to either: (a) filter out requests where a connection already exists, or (b) have Alice detect the connection and delete her request.

**Fix:** In `getIncomingRequests`, after fetching pending requests, cross-check against existing connections and filter out already-connected pairs.

### 5. No duplicate connection check before `acceptConnection`
If Bob clicks "Accept" twice (or the UI double-fires), two `connection` entities are created for the same pair. The `isConnected` check uses `limit(1)` so it'll return the first, but `getConnections` will return duplicates.

**Fix:** Check `isConnected()` before creating the connection entity in `acceptConnection`.

### 6. `getAllProfiles()` and `getConnections()` have hard-coded limits
```typescript
.limit(200)  // getAllProfiles
.limit(200)  // getConnections (each direction)
```
At scale, this silently drops data. The trust map will be incomplete if a user has 200+ connections.

**Fix:** Implement pagination loop or use a generous limit with a warning comment. For hackathon, 200 is likely fine but document the assumption.

### 7. `getConnectionCount` uses `.count()` which re-fetches all entities
The SDK's `count()` method calls `processQuery` and returns `data.length` — it fetches all matching entities, not a count query. For a user with many connections, this is wasteful.

**Fix:** For now, acceptable. But note: count = getConnections().length would be equivalent and you already have the data.

### 8. `buildGraphData` in store.ts builds the graph with wallet addresses as node IDs
```typescript
profileMap.forEach((p, wallet) => {
  nodes.push({ id: wallet, ... })
})
```
If wallet addresses have different casing across entities, nodes may be duplicated. The `orderWallets` function lowercases, but profile `wallet` attribute values depend on what was stored.

**Fix:** Always `.toLowerCase()` wallet addresses when building the graph. (Already done in `arkiv.ts` service functions, but verify the store normalizes too.)

### 9. Entity `contentType` not set on some operations
`updateProfile` and `acceptConnection` set `contentType: 'application/json'` ✅, but verify all `createEntity` calls set it. Missing content-type could cause `entity.toJson()` to fail on read.

---

## P3 — Nice-to-have

### 10. ExpirationTime uses `fromYears(2)` everywhere
Connection requests and activities should have shorter TTLs (30 days, 90 days respectively as planned). Currently all share `ENTITY_EXPIRY = ExpirationTime.fromYears(2)`.

### 11. No use of `mutateEntities` for batch operations
When accepting a connection, we could batch-create the connection + activity entity in one tx for atomicity.

### 12. No event subscriptions for real-time updates
Arkiv supports `subscribeEntityEvents`. Using this would make the app feel live (new connection requests appear instantly). Low priority for hackathon, but would impress judges.

### 13. Attribute naming uses `from`/`to` — may conflict with reserved words
Check Arkiv's query parser doesn't treat `from` or `to` as reserved keywords. Safer alternatives: `fromWallet`, `toWallet`.

### 14. `getActivity` should order by a timestamp attribute
Currently returns in arbitrary order. Adding a numeric `createdAtTs` attribute (unix timestamp) and using `orderBy('createdAtTs', 'number', 'desc')` would give chronological feed.

---

## Positive Observations

- **Entity attribute design is solid** — `entityType` + `app` namespace pattern is exactly how Arkiv recommends structuring multi-entity apps
- **Wallet ordering for connections** is a good pattern — ensures one entity per pair
- **`jsonToPayload()` usage is correct** — SDK helper properly encodes JSON to Uint8Array
- **Profile querying by both wallet and username** is well-implemented with separate indexed attributes
- **Parallel queries** for connections (userA + userB) are correctly implemented with `Promise.all`
