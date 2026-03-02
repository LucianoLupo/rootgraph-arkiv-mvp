# Architecture Review — RootGraph Arkiv MVP

**Reviewer:** architecture-reviewer (staff-level)  
**Date:** 2026-03-01  
**Scope:** Full `src/` directory, config files  
**Classification:** P1 (critical) · P2 (significant) · P3 (minor)

---

## Executive Summary

The codebase is well-structured for a hackathon MVP — clean separation between the Arkiv service layer, Zustand store, and React components. Provider hierarchy (Privy → Arkiv → children) is correct. However, several issues range from a potential injection vulnerability to dead code, state management bugs, and missing error handling that would bite in any real usage beyond a demo.

**Counts:** 5 P1 · 10 P2 · 10 P3

---

## P1 — Critical

### P1.1 — GLOB Injection in `searchProfiles`

**File:** `src/lib/arkiv.ts:157`

```ts
const safeQuery = query.toLowerCase().replace(/['"\\]/g, '')
const result = await client.query(
  `entityType = "profile" && app = "${APP_TAG}" && username GLOB "*${safeQuery}*"`,
  ...
)
```

The sanitization strips `'`, `"`, `\` but does **not** strip GLOB special characters (`*`, `?`, `[`, `]`). A user searching for `*` or `[a-z]` could manipulate the query pattern. More importantly, the raw string interpolation pattern itself is fragile — any future attribute addition using user input could break the query syntax.

**Fix:** Use the `buildQuery` API consistently (as used everywhere else), or add a proper allowlist sanitizer that only permits `[a-z0-9._-]`.

---

### P1.2 — `handleReject` Is a No-Op

**File:** `src/app/(app)/connections/page.tsx:38-41`

```ts
const handleReject = (fromWallet: string) => {
  console.log('Reject connection from', fromWallet);
  toast({ title: 'Request declined' });
};
```

The reject button shows a success toast but **never modifies the on-chain entity**. The connection request remains `status: "pending"` forever. Users believe they declined a request, but it persists and will reappear on next fetch.

**Fix:** Implement an `updateEntity` call to set the request's status to `"rejected"`, or delete the entity.

---

### P1.3 — `acceptConnection` Doesn't Update Request Status

**File:** `src/lib/arkiv.ts:214-234`

When a connection is accepted, `acceptConnection` creates a new `connection` entity but **never updates the original `connection-request` entity**. The request stays `status: "pending"`, meaning:
- It still appears in `getIncomingRequests` and `getOutgoingRequests`
- Users see phantom "pending" requests for people they're already connected to

**Fix:** `acceptConnection` should also call `walletClient.updateEntity()` on the request entity to set `status: "accepted"`, or the caller should do so after acceptance.

---

### P1.4 — Store Swallows All Errors, No Error State

**File:** `src/lib/store.ts` (all async actions)

Every store action catches errors and logs to `console.error` but **never exposes error state to the UI**:

```ts
fetchProfile: async (wallet) => {
  set({ profileLoading: true })
  try {
    const profile = await getProfile(wallet)
    // ...
  } catch (err) {
    console.error('Failed to fetch profile:', err)
    // No error state set! UI shows "no profile" instead of "error"
  }
}
```

If Arkiv is down or the network is flaky, users see a blank "no profile" state with no error message and no retry mechanism. They might think they need to create a profile when they already have one.

**Fix:** Add `error: string | null` fields to the store (e.g., `profileError`, `connectionsError`) and expose them so the UI can show error states with retry actions.

---

### P1.5 — `buildGraphData` Hardcodes `APP_TAG`

**File:** `src/lib/store.ts:108`

```ts
const result = await client
  .buildQuery()
  .where([eqQuery('entityType', 'connection'), eqQuery('app', 'rootgraph')])
```

The string `'rootgraph'` is hardcoded instead of using the `APP_TAG` constant from `arkiv.ts`. If `APP_TAG` is ever changed, the graph will silently return zero connections while other features continue to work.

**Fix:** Import and use `APP_TAG` from `arkiv.ts`, or export it as a constant.

---

## P2 — Significant

### P2.1 — Dead Code: `AppShell` and `Sidebar` Components

**Files:** `src/components/layout/app-shell.tsx`, `src/components/layout/sidebar.tsx`

These two components implement a complete app shell with sidebar navigation but are **never imported or used**. The actual app layout is in `src/app/(app)/layout.tsx` which reimplements its own `SidebarContent` inline.

The dead code even has **divergent route names** (`/trust-map` in `sidebar.tsx` vs `/trustmap` in the actual layout), proving it's stale.

**Fix:** Delete `app-shell.tsx` and `sidebar.tsx`, or refactor `(app)/layout.tsx` to use them.

---

### P2.2 — `truncateAddress`/`truncateWallet` Duplicated 4 Times

**Files:**
- `src/app/(app)/layout.tsx:31` — `truncateAddress`
- `src/app/(app)/connections/page.tsx:13` — `truncateWallet`
- `src/app/(app)/dashboard/page.tsx:162` — `truncateWallet`
- `src/app/(app)/profile/[username]/page.tsx:142` — `truncateWallet`

Four copies of essentially the same function, with minor naming differences (`truncateAddress` vs `truncateWallet`) and slight formatting differences (`…` vs `...`).

**Fix:** Move to `src/lib/utils.ts` as a single exported function.

---

### P2.3 — `useEffect` in Profile Page Re-fires on Every Store Update

**File:** `src/app/(app)/profile/[username]/page.tsx:38-55`

```ts
useEffect(() => {
  async function load() { ... }
  load();
}, [targetWallet, walletAddress, outgoingRequests]);
```

`outgoingRequests` is an array from Zustand. Every time `refreshAll` runs (triggered in the app layout on mount), it calls `fetchRequests` which calls `set({ outgoingRequests: ... })`. Even if the data is identical, Zustand creates a new array reference, causing this effect to re-fire and re-fetch the profile data.

**Fix:** Remove `outgoingRequests` from the dependency array and compute pending status separately, or use a shallow equality selector: `useAppStore(s => s.outgoingRequests, shallow)`.

---

### P2.4 — `ArkivProvider` Wraps All Routes Including Landing Page

**File:** `src/app/layout.tsx:35-38`

```tsx
<AppPrivyProvider>
  <ArkivProvider>
    {children}
  </ArkivProvider>
</AppPrivyProvider>
```

The `ArkivProvider` runs `useWallets()` and `usePrivy()` hooks and attempts wallet client initialization on **every route**, including the public landing page where there's no wallet. While it handles the unauthenticated case gracefully, it's unnecessary overhead and couples the landing page to wallet infrastructure.

**Fix:** Move `ArkivProvider` to `src/app/(app)/layout.tsx` so it only wraps authenticated routes.

---

### P2.5 — Unnecessary Dynamic Import in `buildGraphData`

**File:** `src/lib/store.ts:104-105`

```ts
const client = (await import('@/lib/arkiv')).getArkivPublicClient()
const { eq: eqQuery } = await import('@arkiv-network/sdk/query')
```

The store already imports `getArkivPublicClient` (via `getProfile`, `getConnections`, etc.) at the top of the file. These dynamic imports add async overhead and create a separate code path for the same module. The `eq` function is also already available at module scope in `arkiv.ts`.

**Fix:** Use the already-imported functions directly, or refactor `buildGraphData` into `arkiv.ts` as a service function (where it arguably belongs).

---

### P2.6 — No Error Boundary for ForceGraph2D

**File:** `src/app/(app)/trustmap/page.tsx`

The `ForceGraph2D` component is loaded with `dynamic(() => import('react-force-graph-2d'), { ssr: false })`. If the canvas library throws (e.g., WebGL not supported, invalid data), the entire page crashes with no recovery.

**Fix:** Wrap the graph in a React Error Boundary component that shows a fallback UI.

---

### P2.7 — `kaolinChain` Uses `as any` Twice

**File:** `src/providers/privy-provider.tsx:24-26`

```ts
supportedChains: [kaolinChain as any],
defaultChain: kaolinChain as any,
```

This silences type mismatches between the custom chain object and Privy's expected chain type. If Privy's chain type changes in a minor version update, these casts will hide the breakage at compile time.

**Fix:** Import Privy's chain type and properly type `kaolinChain` to match it, or use a chain definition helper if Privy provides one.

---

### P2.8 — No Pagination for Entity Queries

**File:** `src/lib/arkiv.ts` (multiple functions)

All queries use fixed limits:
- `getAllProfiles()` — `limit(200)`
- `getConnections()` — `limit(200)` × 2
- `getIncomingRequests()` / `getOutgoingRequests()` — `limit(100)`
- `getActivity()` / `getRecentActivity()` — `limit(50)`

As the network grows beyond these limits, data is **silently truncated** with no indication to the user that they're seeing a partial view.

**Fix:** At minimum, add a warning or "load more" indicator. Ideally, implement cursor-based pagination.

---

### P2.9 — No Loading State for `fetchRequests`

**File:** `src/lib/store.ts:79-90`

`fetchConnections` has a `connectionsLoading` flag, but `fetchRequests` has none. During the async fetch, the UI may flash empty request lists before populating them.

**Fix:** Add `requestsLoading: boolean` to the store and set it around the `fetchRequests` call.

---

### P2.10 — Settings Page Loses Username on Edit

**File:** `src/app/(app)/settings/page.tsx:52-53`

```ts
useEffect(() => {
  if (profile) {
    setForm({
      username: profile.wallet ? '' : '',  // Always empty!
      ...
    });
  }
}, [profile]);
```

The username is always initialized to `''` because `ProfileData` doesn't include a `username` field — it's stored as an Arkiv attribute, not in the payload. When updating a profile, the `updateProfile` call passes `form.username || profile.wallet` which overwrites the username with the wallet address.

**Fix:** Either store the username in `ProfileData` payload so it's retrievable, or fetch the username attribute separately and populate the form with it.

---

## P3 — Minor

### P3.1 — Multiple `eslint-disable` Comments for `any` Types

**Files:** `privy-provider.tsx`, `trustmap/page.tsx`

Five `eslint-disable-next-line @typescript-eslint/no-explicit-any` comments. While pragmatic for a hackathon, they accumulate tech debt. The trustmap ones are due to `react-force-graph-2d` lacking proper types.

---

### P3.2 — `isReady` Can Be True While `walletClient` Is Null

**File:** `src/providers/arkiv-provider.tsx:41`

If `wallet.type !== 'ethereum'`, `setIsReady(true)` is called but `walletClient` stays `null`. Consumers checking `isReady` alone may proceed without a working client.

---

### P3.3 — Module-Level Singleton `publicClientInstance`

**File:** `src/lib/arkiv.ts:48`

The singleton pattern works for client-side rendering but could cause issues if the module were accidentally imported in a server component (stale connections across requests). Low risk since all consumers are `'use client'`.

---

### P3.4 — `TOAST_REMOVE_DELAY` Is ~16 Minutes

**File:** `src/hooks/use-toast.ts:12`

`TOAST_REMOVE_DELAY = 1000000` ms (~16.6 minutes). Toasts linger in memory far longer than needed. This is the shadcn/ui default, but worth reducing to 5-10 seconds.

---

### P3.5 — Unused CSS Animation Class

**File:** `src/app/globals.css:59`

`.animate-float` is defined but never used in any component.

---

### P3.6 — Empty `next.config.mjs`

**File:** `next.config.mjs`

No configuration at all — no image optimization domains, no security headers, no output configuration. Fine for hackathon, but worth noting.

---

### P3.7 — Missing `aria-label` on Mobile Menu Button

**File:** `src/app/(app)/layout.tsx:116`

The hamburger menu `<Button>` has no `aria-label`, making it inaccessible to screen readers.

---

### P3.8 — `useToast` Effect Has `state` as Dependency

**File:** `src/hooks/use-toast.ts:131`

```ts
React.useEffect(() => {
  listeners.push(setState);
  return () => { ... };
}, [state]);  // Should be []
```

The effect registers and unregisters the listener on every state change. Should be an empty dependency array since the listener registration is a one-time setup.

---

### P3.9 — Inconsistent Color Scheme Between Dead Code and Active Code

The dead `sidebar.tsx` uses indigo (`bg-indigo-500/10 text-indigo-400`) while the active layout uses emerald (`bg-emerald-500/10 text-emerald-400`). Further evidence the dead code is stale and divergent.

---

### P3.10 — No Testing Infrastructure

The project has no test files, no testing dependencies (jest, vitest, playwright), and no test scripts in `package.json`. The service layer in `arkiv.ts` is testable in isolation, but nothing exercises it.

---

## Architecture Notes (Not Bugs)

### `arkiv.ts` Monolith Assessment

At 474 lines, `arkiv.ts` handles profiles, connection requests, connections, and activity — four distinct domains. For a hackathon this is fine, but for growth it should split into:
- `lib/arkiv/client.ts` — client creation
- `lib/arkiv/profiles.ts`
- `lib/arkiv/connections.ts`
- `lib/arkiv/activity.ts`
- `lib/arkiv/types.ts`

### `buildGraphData` Belongs in Service Layer

`store.ts:buildGraphData` contains raw Arkiv query logic (importing `eq`, calling `client.buildQuery()`). This should be a function in `arkiv.ts` alongside the other query functions, keeping the store as a thin orchestration layer.

### Testing Readiness

The code is **moderately testable**:
- ✅ `arkiv.ts` functions are pure service functions (inject client → get result)
- ✅ Store actions are isolated and could be tested with a mock `arkiv.ts`
- ❌ Components mix data fetching with rendering — no separation of container/presentational
- ❌ No dependency injection for the Arkiv clients (singleton pattern)

---

## Summary Table

| Priority | Count | Key Themes |
|----------|-------|------------|
| P1 | 5 | Injection risk, broken reject flow, orphaned requests, silent errors, hardcoded constant |
| P2 | 10 | Dead code, duplication, unnecessary re-renders, provider scope, missing pagination |
| P3 | 10 | Type safety, accessibility, unused CSS, testing infrastructure |
