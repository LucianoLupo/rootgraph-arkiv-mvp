# RootGraph × Arkiv — Agent Context

A decentralized professional trust graph where users own their connections on-chain via Arkiv Network. Built for the Arkiv Network hackathon.

## Quick Reference

| Item | Value |
|---|---|
| **App dir** | `app/` (Next.js 14 App Router) |
| **Dev server** | `cd app && npm run dev` → `http://localhost:3000` |
| **Type check** | `cd app && npx tsc --noEmit` |
| **Lint** | `cd app && npx next lint` |
| **Seed demo data** | `cd app && npm run seed` |
| **Chain** | Arkiv Kaolin testnet (chain ID `60138453025`) |
| **RPC** | `https://kaolin.hoodi.arkiv.network/rpc` |
| **Explorer** | `https://explorer.kaolin.hoodi.arkiv.network` |
| **Faucet** | `https://kaolin.hoodi.arkiv.network/faucet/` |

## Project Structure

```
rootgraph-arkiv-mvp/
├── app/                          # Next.js application (all code lives here)
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx             # Root layout (PrivyProvider only)
│   │   │   ├── page.tsx               # Landing page (public, no auth)
│   │   │   └── (app)/                 # Authenticated route group
│   │   │       ├── layout.tsx         # App layout (ArkivProvider + sidebar + auth guard)
│   │   │       ├── dashboard/page.tsx
│   │   │       ├── connections/page.tsx
│   │   │       ├── trustmap/page.tsx
│   │   │       ├── search/page.tsx
│   │   │       ├── settings/page.tsx
│   │   │       └── profile/[wallet]/page.tsx
│   │   ├── lib/
│   │   │   ├── arkiv.ts           # ★ Core: all Arkiv SDK interactions (683 lines)
│   │   │   ├── store.ts           # Zustand store (190 lines)
│   │   │   └── utils.ts           # Shared utilities (truncateWallet, cn)
│   │   ├── providers/
│   │   │   ├── privy-provider.tsx  # Privy auth (wallet + Google login)
│   │   │   └── arkiv-provider.tsx  # Creates Arkiv wallet client from Privy provider
│   │   ├── hooks/
│   │   │   ├── use-arkiv.ts       # Hook to get wallet client from ArkivProvider
│   │   │   └── use-toast.ts       # Toast notification hook
│   │   └── components/ui/         # shadcn/ui primitives (don't modify these)
│   ├── scripts/
│   │   └── seed-demo.ts           # Creates 10 demo profiles + connections on Kaolin
│   └── reviews/                   # Code review findings (reference only)
├── research/                      # Architecture docs (reference only)
│   ├── 01-arkiv-architecture.md   # Deep dive on Arkiv entity model, SDK, limitations
│   ├── 02-rootgraph-data-model.md # Entity schema design
│   ├── 03-integration-architecture.md # Full integration mapping
│   └── 04-hackathon-plan.md       # Hackathon scope and demo script
├── arkiv-code-samples/            # Arkiv official examples (reference only, old SDK versions)
└── learn-arkiv/                   # Arkiv tutorial site source (reference only)
```

## Architecture

### Auth Flow
```
User clicks "Connect Wallet" or "Sign in with Google"
  → Privy handles auth (embedded MPC wallet for Google users)
  → PrivyProvider exposes wallet + EIP-1193 provider
  → ArkivProvider creates an Arkiv WalletClient from the provider
  → useArkiv() hook gives components the wallet client for writes
  → Public reads use a shared PublicClient (no auth needed)
```

### Provider Hierarchy
```
RootLayout (PrivyProvider)
  ├── Landing page (no ArkivProvider — public)
  └── (app) layout (ArkivProvider → auth guard → sidebar)
        └── All authenticated pages
```

### Data Flow
```
Arkiv Kaolin Testnet
  ↕ (CRUD via @arkiv-network/sdk)
src/lib/arkiv.ts (17 service functions)
  ↕ (called by)
src/lib/store.ts (Zustand — single global store)
  ↕ (React hooks)
Page components (read state, dispatch actions)
```

## Key File: `src/lib/arkiv.ts`

This is the most important file. All blockchain interactions go through here.

### Exports

| Export | Type | Purpose |
|---|---|---|
| `APP_TAG` | `'rootgraph'` | Namespace for all entities |
| `validateUsername()` | function | Validates `/^[a-z0-9._-]{3,30}$/` |
| `getArkivPublicClient()` | function | Singleton public client for reads |
| `createArkivWalletClient()` | function | Creates write client from EIP-1193 provider |
| `getProfile()` | async | Fetch profile by wallet address |
| `getProfileByUsername()` | async | Fetch profile by username |
| `createProfile()` | async | Create new profile entity |
| `updateProfile()` | async | Update existing profile entity |
| `searchProfiles()` | async | Search profiles (client-side filter) |
| `getAllProfiles()` | async | Fetch all profiles (limit 200) |
| `sendConnectionRequest()` | async | Create connection request entity |
| `getIncomingRequests()` | async | Fetch pending requests TO this wallet |
| `getOutgoingRequests()` | async | Fetch pending requests FROM this wallet |
| `acceptConnection()` | async | Create connection entity (atomic batch with activity) |
| `getConnections()` | async | Fetch all connections for a wallet |
| `isConnected()` | async | Check if two wallets are connected |
| `getConnectionCount()` | async | Count connections for a wallet |
| `logActivity()` | async | Create activity entity |
| `getActivity()` | async | Fetch activity for a wallet |
| `getRecentActivity()` | async | Fetch recent global activity |
| `fetchGraphData()` | async | Fetch all connections + profiles for graph visualization |

### Types

```typescript
type ProfileData = {
  displayName: string; position: string; company: string;
  tags: string[]; avatarUrl: string; privacyLevel: string;
}
type Profile = ProfileData & {
  entityKey: string; wallet: string; username: string; owner: string;
}
type ConnectionRequest = {
  entityKey: string; from: string; to: string;
  message: string; status: string; createdAt: string;
}
type Connection = {
  entityKey: string; userA: string; userB: string; createdAt: string;
}
type ActivityEntry = {
  entityKey: string; type: string; actor: string;
  targetUsername: string; message: string; createdAt: string;
}
```

### Entity Design on Arkiv

Each data type maps to an Arkiv entity with:
- **entityType** attribute: `"profile"` | `"connection-request"` | `"connection"` | `"activity"`
- **app** attribute: `"rootgraph"` (namespace to avoid collisions)
- **TTLs**: profiles 2yr, connections 2yr, requests 30d, activity 90d
- **Payload**: JSON-serialized data (ProfileData, etc.)
- **String/numeric attributes**: indexed for queries (wallet, username, fromWallet, toWallet, etc.)

Connection model: `userA` = lexicographically smaller wallet, `userB` = larger. Ensures one entity per pair.

## Key File: `src/lib/store.ts`

Zustand store with all app state.

### State

| Field | Type | Notes |
|---|---|---|
| `walletAddress` | `string \| null` | Current user's wallet |
| `profile` | `Profile \| null` | Current user's profile |
| `profileLoading` | `boolean` | |
| `connections` | `Connection[]` | Current user's connections |
| `connectionsLoading` | `boolean` | |
| `incomingRequests` | `ConnectionRequest[]` | Pending requests TO user |
| `outgoingRequests` | `ConnectionRequest[]` | Pending requests FROM user |
| `requestsLoading` | `boolean` | |
| `graphData` | `{ nodes, links }` | For react-force-graph-2d |
| `profileMap` | `Map<string, ProfileMapEntry>` | wallet → { displayName, position, username } |
| `error` | `string \| null` | Last error message |

### Actions
- `fetchProfile(wallet)` / `fetchConnections(wallet)` / `fetchRequests(wallet)`
- `buildGraphData()` — fetches all connections + profiles, builds graph nodes/links + profileMap
- `refreshAll()` — calls all fetch + buildGraphData

## Arkiv SDK Quick Reference

```typescript
// Imports
import { createPublicClient, createWalletClient, custom, http } from '@arkiv-network/sdk'
import { kaolin } from '@arkiv-network/sdk/chains'
import { eq } from '@arkiv-network/sdk/query'
import { ExpirationTime, jsonToPayload } from '@arkiv-network/sdk/utils'
import { privateKeyToAccount } from '@arkiv-network/sdk/accounts'

// Public client (reads)
const client = createPublicClient({ chain: kaolin, transport: http() })

// Wallet client (writes — from Privy provider)
const walletClient = createWalletClient({ chain: kaolin, transport: custom(provider) })

// Query entities
const result = await client
  .buildQuery()
  .where([eq('entityType', 'profile'), eq('app', 'rootgraph'), eq('wallet', '0x...')])
  .withPayload(true)
  .withAttributes(true)
  .withMetadata(true)
  .limit(100)
  .fetch()

// Create entity
await walletClient.createEntity({
  body: jsonToPayload({ key: 'value' }),
  attributes: [
    { key: 'entityType', value: 'profile' },
    { key: 'app', value: 'rootgraph' },
  ],
  expirationTime: ExpirationTime.fromYears(2),
})

// Batch create (atomic)
await walletClient.mutateEntities({
  creates: [entityA, entityB],
})

// Read entity
const entity = await client.getEntityByKey(entityKey)
const data = entity.toJson() // parse payload
```

### Arkiv Limitations (critical to know)
- **ALL data is publicly readable** — no access control on entities
- **Only entity owner can update/delete** — owner = wallet that created it
- **Attributes are string or uint64 only** — no booleans, no arrays
- **No JOINs** — must fetch separately and combine client-side
- **Entities MUST expire** — TTL is mandatory
- **No native graph queries** — graph is built client-side with graphology + react-force-graph-2d
- **2-second block time** — writes take ~2s to confirm
- **Query limit max ~200** — no cursor pagination in current SDK

## Environment Variables

```bash
# .env.local
NEXT_PUBLIC_PRIVY_APP_ID=cmm8j1lop01lq0cjuvw4fh1ct
```

This is the only env var. The Arkiv RPC URL and chain config are hardcoded (Kaolin testnet is public).

## Coding Conventions

- **`'use client'`** on all page and provider files (Arkiv SDK and Privy require browser APIs)
- **Dark theme only** — emerald green accent (`emerald-400/500`), gray-900/950 backgrounds
- **No server components** for data fetching — all reads go through client-side Arkiv SDK
- **shadcn/ui components** in `src/components/ui/` — don't modify, use as-is
- **No tests** — hackathon MVP, validate with `tsc --noEmit` + `next lint` + manual testing
- **Minimal comments** — code is self-documenting
- **All Arkiv queries use `buildQuery()` API** — never raw string interpolation (security fix)
- **`truncateWallet()`** lives in `src/lib/utils.ts` — import from there, don't redefine

## Validation Commands

Run these after any changes:
```bash
cd app
npx tsc --noEmit          # Must pass with zero errors
npx next lint             # Must pass with zero warnings
npm run dev               # Verify dev server starts and pages load
```

## Common Tasks

### Add a new entity type
1. Define types in `arkiv.ts` (payload type + full type with entityKey/wallet)
2. Add CRUD functions following existing patterns (use `buildQuery`, `eq`, `jsonToPayload`)
3. Add state + actions to `store.ts`
4. Create page in `src/app/(app)/`

### Add a new page
1. Create `src/app/(app)/yourpage/page.tsx` with `'use client'`
2. Use `useAppStore()` for state, `useArkiv()` for wallet client
3. Add nav link in `(app)/layout.tsx` sidebar

### Modify entity attributes
- Remember: attributes are indexed, payload is not
- Put fields you query on into attributes
- Put display-only data into the JSON payload
- Attribute values must be string or uint64

## Reference Material

- `research/01-arkiv-architecture.md` — Arkiv deep dive (entity model, CRUD, queries, SDK patterns, limitations)
- `research/02-rootgraph-data-model.md` — Entity schema design decisions
- `research/03-integration-architecture.md` — Full integration mapping and tech stack
- `research/04-hackathon-plan.md` — Hackathon scope, demo script, talking points
- `app/reviews/` — 5 code review reports (findings have been fixed)
- `app/TODO.md` — Master fix list (all 33 items completed)
- Arkiv SDK source: cloned at `/tmp/arkiv-sdk-js/` (may need re-cloning)
