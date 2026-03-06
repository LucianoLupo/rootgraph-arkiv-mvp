# Master Fix List — RootGraph × Arkiv MVP

> **Status:** All critical fixes complete. Multi-entity trust graph (companies + jobs) shipped. Privacy layer live.

Consolidated from 5 expert reviews. Deduplicated. Ordered by priority then by workstream.

---

## Workstream A: `src/lib/arkiv.ts` — Service Layer Fixes

### A1 [P1] Fix `searchProfiles()` query injection
**Reviews:** Security #1, Architecture P1.1, Arkiv #1  
**File:** `src/lib/arkiv.ts` → `searchProfiles()`  
**Problem:** Raw GLOB string interpolation allows query manipulation via `&&`, `||`, `*`, `?`, `[`, `]`.  
**Fix:** Replace with `buildQuery().where(eq('username', term))` + fetch ALL profiles matching the app/entityType, then filter client-side with `username.includes(query)`. Remove the raw `client.query()` call entirely.  
**Test:** Search for `* && entityType = "connection"` → should return no profiles, not leak data.

### A2 [P1] Fix `createArkivWalletClient()` account parameter
**Reviews:** Arkiv #2  
**File:** `src/lib/arkiv.ts` → `createArkivWalletClient()`  
**Problem:** Passes `address` (a Hex string) directly as `account`. Viem expects either an Account object or nothing when using custom provider transport.  
**Fix:** Change to pass no `account` field (let the provider handle signing), OR pass a proper JSON-RPC account object. Verify write operations (createEntity, updateEntity) still work on Kaolin.
```typescript
// Option A: omit account, let provider handle it
export function createArkivWalletClient(provider: EIP1193Provider) {
  return createWalletClient({
    chain: kaolin,
    transport: custom(provider),
  })
}
// Option B: proper account object
import { toAccount } from 'viem/accounts'
// ...
account: toAccount(address),
```

### A3 [P1] Filter out already-connected requests from `getIncomingRequests`
**Reviews:** Architecture P1.3, Arkiv #4  
**File:** `src/lib/arkiv.ts` → `getIncomingRequests()`  
**Problem:** After accepting a connection, the original request stays `status="pending"` because only the owner (requester) can update it. It keeps showing up.  
**Fix:** After fetching pending requests, also fetch connections for the current wallet. Filter out any request where a connection already exists between the two wallets.
```typescript
export async function getIncomingRequests(wallet: string) {
  const [requestResult, connections] = await Promise.all([
    /* existing query */,
    getConnections(wallet),
  ])
  const connectedWallets = new Set(
    connections.map(c => c.userA === wallet.toLowerCase() ? c.userB : c.userA)
  )
  return requestResult.entities
    .map(entity => { /* existing mapping */ })
    .filter(req => !connectedWallets.has(req.from.toLowerCase()))
}
```
Do the same for `getOutgoingRequests` — filter out requests where a connection already exists.

### A4 [P2] Add `isConnected()` check inside `acceptConnection()`
**Reviews:** Security #8, Arkiv #5  
**File:** `src/lib/arkiv.ts` → `acceptConnection()`  
**Problem:** No duplicate check. Double-clicking Accept creates two connection entities.  
**Fix:** Call `isConnected()` at the start of `acceptConnection()`. If already connected, return early (throw or return null).

### A5 [P2] Validate `from` attribute matches entity owner in request queries
**Reviews:** Security #4  
**File:** `src/lib/arkiv.ts` → `getIncomingRequests()`  
**Problem:** A malicious user could spoof the `from` attribute to impersonate another user's request.  
**Fix:** After fetching, filter: `entity.owner?.toLowerCase() === request.from.toLowerCase()`.

### A6 [P2] Use `mutateEntities` for atomic batch accept
**Reviews:** Arkiv #11, Hackathon Judge quick win #1  
**File:** `src/lib/arkiv.ts` → `acceptConnection()`  
**Problem:** Accept creates connection + activity as two separate transactions (non-atomic).  
**Fix:** Use `walletClient.mutateEntities({ creates: [connectionCreate, activityCreate] })` to batch both in one tx. Shows Arkiv SDK depth to judges.

### A7 [P2] Return username in profile data
**Reviews:** Frontend #1, Architecture P2.10  
**File:** `src/lib/arkiv.ts` → `getProfile()`, `getProfileByUsername()`  
**Problem:** Username is stored as an attribute but not returned in the profile object. Settings page can't populate it.  
**Fix:** Extract username from `entity.attributes` and include it in the returned object:
```typescript
const usernameAttr = entity.attributes.find(a => a.key === 'username')
return { ...data, entityKey: entity.key, wallet: ..., username: usernameAttr?.value?.toString() ?? '' }
```
Update the `ProfileData` or create a `Profile` type that includes `username`.

### A8 [P2] Add input validation for username format
**Reviews:** Security #7  
**File:** `src/lib/arkiv.ts` → `createProfile()`, and `src/app/(app)/settings/page.tsx`  
**Fix:** Add validation: `/^[a-z0-9._-]{3,30}$/`. Reject invalid usernames both in the UI (settings page) and in the service function (defense in depth). Add max length validation for displayName (50), position (50), company (50).

### A9 [P3] Use different TTLs per entity type
**Reviews:** Arkiv #10  
**File:** `src/lib/arkiv.ts`  
**Fix:** Replace single `ENTITY_EXPIRY` with:
```typescript
const PROFILE_EXPIRY = ExpirationTime.fromYears(2)
const CONNECTION_EXPIRY = ExpirationTime.fromYears(2)
const REQUEST_EXPIRY = ExpirationTime.fromDays(30)
const ACTIVITY_EXPIRY = ExpirationTime.fromDays(90)
```

### A10 [P3] Rename `from`/`to` attributes to `fromWallet`/`toWallet`
**Reviews:** Arkiv #13  
**File:** `src/lib/arkiv.ts` — all connection-request functions  
**Fix:** Rename attribute keys from `from`→`fromWallet`, `to`→`toWallet` to avoid potential reserved word conflicts. Update all queries.

### A11 [P3] Add `createdAtTs` numeric attribute for ordering
**Reviews:** Arkiv #14  
**File:** `src/lib/arkiv.ts` — `logActivity()`, `getActivity()`  
**Fix:** Add `{ key: 'createdAtTs', value: Math.floor(Date.now() / 1000) }` as a numeric attribute to activity entities. Use `.orderBy('createdAtTs', 'number', 'desc')` in `getActivity()`.

---

## Workstream B: `src/lib/store.ts` + Providers — State & Infra Fixes

### B1 [P1] Add error state to store
**Reviews:** Architecture P1.4  
**File:** `src/lib/store.ts`  
**Problem:** All async actions catch errors and `console.error` but never expose errors to the UI.  
**Fix:** Add `error: string | null` to the store. Set it in catch blocks. Clear it on successful fetch. Expose it so pages can show error banners with retry buttons.
```typescript
error: null as string | null,
fetchProfile: async (wallet) => {
  set({ profileLoading: true, error: null })
  try { ... }
  catch (err) {
    console.error('Failed to fetch profile:', err)
    set({ error: 'Failed to load profile. Is Arkiv reachable?' })
  } finally { set({ profileLoading: false }) }
}
```

### B2 [P1] Fix hardcoded `'rootgraph'` in `buildGraphData`
**Reviews:** Architecture P1.5  
**File:** `src/lib/store.ts` → `buildGraphData()`  
**Fix:** Import `APP_TAG` from `arkiv.ts` (need to export it first) and use it instead of the hardcoded string `'rootgraph'`.

### B3 [P2] Move `buildGraphData` logic to `arkiv.ts`
**Reviews:** Architecture P2.5, Architecture notes  
**File:** `src/lib/store.ts` → `buildGraphData()`, move to `src/lib/arkiv.ts`  
**Problem:** Store has raw Arkiv SDK calls with dynamic imports.  
**Fix:** Create `getAllConnections()` and `buildGraphFromArkiv()` functions in `arkiv.ts`. The store action just calls those and sets state. No more `await import(...)` in the store.

### B4 [P2] Move ArkivProvider to app group layout
**Reviews:** Architecture P2.4  
**File:** `src/app/layout.tsx` → `src/app/(app)/layout.tsx`  
**Problem:** ArkivProvider wraps the landing page unnecessarily.  
**Fix:** Move `<ArkivProvider>` from root layout to the `(app)` layout. Root layout only has `<PrivyProvider>`. Landing page no longer loads wallet infrastructure.

### B5 [P2] Add `requestsLoading` state
**Reviews:** Architecture P2.9  
**File:** `src/lib/store.ts`  
**Fix:** Add `requestsLoading: boolean` to store. Set it in `fetchRequests()`.

### B6 [P3] Fix `isReady` when wallet is not ethereum type
**Reviews:** Architecture P3.2  
**File:** `src/providers/arkiv-provider.tsx`  
**Fix:** Only set `isReady(true)` when `walletClient` is successfully created OR when there are no wallets at all. Not when wallet type is non-ethereum.

---

## Workstream C: UI/UX Fixes — Pages & Components

### C1 [P1] Resolve wallet addresses to profile names on connections page
**Reviews:** Frontend #3, Hackathon Judge weakness #1  
**File:** `src/app/(app)/connections/page.tsx`  
**Problem:** Shows `0xab12…ef56` instead of usernames. Demo killer.  
**Fix:** After store loads connections, resolve each connected wallet to a profile. Option: add a `profileMap` to the store (built during `buildGraphData`) that maps wallet→profile. Then connections page looks up display names from the map.
```typescript
// In store, expose profileMap
profileMap: new Map<string, { displayName: string, position: string, username: string }>()
// In connections page
const profileMap = useAppStore(s => s.profileMap)
const otherProfile = profileMap.get(otherWallet)
// Render: otherProfile?.displayName || truncateWallet(otherWallet)
```
Also resolve names on pending requests (incoming and outgoing).

### C2 [P1] Fix reject button — either implement or remove
**Reviews:** ALL reviewers flagged this  
**File:** `src/app/(app)/connections/page.tsx` → `handleReject()`  
**Fix (pragmatic for hackathon):** Remove the reject button entirely. Replace with an "Ignore" label or just have the Accept button only. Requests expire in 30 days (with A9 fix). If keeping reject: create a `connection-rejection` entity owned by the rejector, and filter them out in `getIncomingRequests()`.
**Recommended:** Remove button for hackathon. Add this to the rejection entity comment for judges: "Rejected requests auto-expire in 30 days."

### C3 [P1] Populate username in settings form on edit
**Reviews:** Frontend #1, Architecture P2.10  
**File:** `src/app/(app)/settings/page.tsx`  
**Problem:** `setForm({ username: '' })` always — never reads the stored username.  
**Fix:** After A7 (return username from profile), populate the form:
```typescript
useEffect(() => {
  if (profile) {
    setForm({
      username: profile.username || '',
      displayName: profile.displayName || '',
      // ...
    })
  }
}, [profile])
```
Also make username readonly after creation (can't change username — too complex for MVP).

### C4 [P2] Auto-redirect to settings on first login (no profile)
**Reviews:** Frontend #4  
**File:** `src/app/(app)/layout.tsx`  
**Fix:** After `refreshAll`, check if profile is null. If so, redirect to `/settings`:
```typescript
useEffect(() => {
  if (walletAddress && isReady && !profile && !profileLoading) {
    router.replace('/settings')
  }
}, [walletAddress, isReady, profile, profileLoading])
```

### C5 [P2] Add loading states to accept/connect buttons
**Reviews:** Frontend #5  
**File:** `src/app/(app)/connections/page.tsx`, `src/app/(app)/search/page.tsx`, `src/app/(app)/profile/[username]/page.tsx`  
**Fix:** Add `[loading, setLoading] = useState(false)` per action. Wrap the async call, disable button while loading, show spinner.

### C6 [P2] Fix useEffect re-fire in profile page
**Reviews:** Architecture P2.3  
**File:** `src/app/(app)/profile/[username]/page.tsx`  
**Fix:** Remove `outgoingRequests` from dependency array. Compute pending status inside the effect or use a ref.

### C7 [P2] Clear stale search results when input is emptied
**Reviews:** Frontend #8  
**File:** `src/app/(app)/search/page.tsx`  
**Fix:** In the search handler, if query is empty, set results to `[]`.

### C8 [P2] Rename route from `/profile/[username]` to `/profile/[wallet]`
**Reviews:** Frontend #7  
**File:** Rename `src/app/(app)/profile/[username]/` to `src/app/(app)/profile/[wallet]/`  
**Fix:** Also update all router.push calls to use `router.push(\`/profile/${wallet}\`)`. The route param is honest about what it is.

### C9 [P2] Extract `truncateWallet` to `src/lib/utils.ts`
**Reviews:** Architecture P2.2, Frontend #15  
**Files:** 4 files with duplicate function  
**Fix:** Add to `src/lib/utils.ts`:
```typescript
export function truncateWallet(addr: string) {
  if (addr.length > 12) return `${addr.slice(0, 6)}…${addr.slice(-4)}`
  return addr
}
```
Delete all copies from pages. Import from utils.

### C10 [P2] Delete dead code: `app-shell.tsx` and `sidebar.tsx`
**Reviews:** Architecture P2.1  
**Files:** `src/components/layout/app-shell.tsx`, `src/components/layout/sidebar.tsx`  
**Fix:** Delete both files. They're unused — the actual layout is in `(app)/layout.tsx`.

### C11 [P3] Add aria-label to mobile menu button
**Reviews:** Architecture P3.7  
**File:** `src/app/(app)/layout.tsx`  
**Fix:** Add `aria-label="Open menu"` to the Sheet trigger button.

### C12 [P3] Trust Map: show self node when no connections
**Reviews:** Frontend #6  
**File:** `src/app/(app)/trustmap/page.tsx`  
**Fix:** If `graphData.nodes.length === 0` but profile exists, show at least the user's own node with a "Connect with people" message.

---

## Workstream D: Hackathon Polish & Demo Boost

### D1 [P2] Add "View on Arkiv Explorer" links
**Reviews:** Hackathon Judge quick win #4  
**Files:** `settings/page.tsx` (after save), `connections/page.tsx`, `profile/[wallet]/page.tsx`, `dashboard/page.tsx`  
**Fix:** Add small link/button: "View on Arkiv →" that opens `https://explorer.kaolin.hoodi.arkiv.network/tx/${txHash}` or `/address/${wallet}`. Show entity key in tooltip where available.

### D2 [P3] Create demo seed script
**Reviews:** Hackathon Judge quick win #3  
**File:** `scripts/seed-demo.ts`  
**Fix:** Create a Node.js script that:
1. Creates 10-15 profiles with realistic names, positions, companies
2. Creates connections between them (forming a nice graph)
3. Creates some activity events
Uses `@arkiv-network/sdk` with `privateKeyToAccount`. Run with `npx tsx scripts/seed-demo.ts`.

### D3 [P3] Add OG meta tags and favicon
**Reviews:** Frontend #12  
**File:** `src/app/layout.tsx`  
**Fix:** Add metadata export with title, description, OG image. Add a simple favicon.

### D4 [P3] Add connection request message field
**Reviews:** Hackathon Judge quick win #6  
**File:** `src/app/(app)/search/page.tsx` and `profile/[wallet]/page.tsx`  
**Fix:** When sending a connection request, show a small dialog/input for an optional message. Pass it to `sendConnectionRequest()`.

---

## Summary

| Workstream | P1 | P2 | P3 | Total |
|---|---|---|---|---|
| A: arkiv.ts service layer | 3 | 5 | 3 | 11 |
| B: store + providers | 2 | 3 | 1 | 6 |
| C: UI/UX pages | 3 | 7 | 2 | 12 |
| D: hackathon polish | 0 | 1 | 3 | 4 |
| **Total** | **8** | **16** | **9** | **33** |

## Recommended Assignment

| Agent | Workstream | Items |
|---|---|---|
| **service-fixer** | A (all) + B1-B3 | Service layer + store state fixes (14 items) |
| **ui-fixer** | C (all) + B4-B6 | All UI/UX fixes + provider move (15 items) |
| **polish-agent** | D (all) | Explorer links, seed script, OG tags, message field (4 items) |
