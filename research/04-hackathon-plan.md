# RootGraph × Arkiv — Hackathon MVP Plan

**Date:** 2026-03-01  
**Target:** Arkiv Network Hackathon  
**Chain:** Kaolin Testnet (Chain ID: 60138453025)

---

## The Pitch

> **RootGraph on Arkiv** — A decentralized professional trust graph and on-chain job board where users own their connections. No centralized database. Your network lives on-chain, portable across apps, censorship-resistant. Connect your wallet or sign in with Google — either way, you own your data. Browse jobs, post company profiles, apply with encrypted messages, and visualize the entire ecosystem in a multi-entity trust graph.

---

## Auth Strategy: Wallet + Google Login

Since Arkiv requires an Ethereum wallet for all write operations, but we want Google login for accessibility:

### Option: Privy (Recommended)

[Privy](https://www.privy.io/) creates **embedded wallets** behind the scenes for social login users:

| Login Method | What Happens |
|---|---|
| **Wallet (MetaMask, WalletConnect, Coinbase)** | Direct wallet connection — user's existing wallet used for Arkiv transactions |
| **Google OAuth** | Privy creates an embedded MPC wallet for the user automatically. User gets a wallet address without knowing crypto. Privy handles key management. |

**Why Privy:**
- Single SDK handles both wallet + social login
- Embedded wallets can sign Arkiv transactions
- Free tier is enough for hackathon
- Great DX — `usePrivy()` hook, `useWallets()` for accessing the wallet
- Supports funding embedded wallets (we auto-fund from faucet)

**Alternative:** Thirdweb Connect (similar embedded wallet approach), Dynamic, Web3Auth

### Auth Flow

```
User opens app
  ├── "Connect Wallet" → MetaMask/WalletConnect/Coinbase
  │     └── Wallet address = Arkiv identity
  │
  └── "Sign in with Google" → Privy OAuth
        └── Privy creates embedded wallet → Arkiv identity
              └── Auto-fund from Kaolin faucet (testnet)
```

---

## MVP Scope (Hackathon-Tight)

### ✅ Build (Demo-Ready)

| Feature | Priority | Complexity |
|---|---|---|
| **Login** (wallet OR Google via Privy) | P0 | Low |
| **Create profile** (username, position, company, tags) | P0 | Low |
| **View profile** | P0 | Low |
| **Send connection request** | P0 | Medium |
| **Accept/reject connection request** | P0 | Medium |
| **View connections list** | P0 | Low |
| **Trust Map** — visual graph of your connections (1-hop) | P0 | Medium |
| **Search users** by username | P1 | Low |
| **Activity feed** (recent connections) | P1 | Low |

### ❌ Skip (Post-Hackathon)

- ~~Encrypted messaging~~ **Done** (NaCl box, context-bound messages)
- Communities
- ~~Privacy levels (Selective/Private encryption)~~ **Done** (salary encryption, ZK proofs)
- 2-hop graph / path finding
- Social link verification
- Wallet page
- ~~Settings page beyond basics~~ **Done** (encryption enable, public key display)
- Entity renewal system

### Bonus: Shipped Beyond Original Scope

- **On-Chain Job Board** — Full CRUD for jobs, applications, company profiles, community flagging
- **Privacy Layer** — Encrypted salaries (NaCl secretbox), encrypted messages (NaCl box), ZK range proofs (Noir)
- **Multi-Entity Trust Map** — People, companies, and jobs rendered as distinct shapes with type-aware panels, filters, and apply-from-graph
- **Company Profiles** — Create/manage company pages with jobs count and public visibility

---

## Data Model on Arkiv (Simplified for Hackathon)

### Entity Types

**1. Profile**
```typescript
// Attributes (indexed, queryable)
app          = "rootgraph"
entityType   = "profile"
username     = "lupo0x"
wallet       = "0xabc..."          // owner's wallet address for lookups

// Payload (JSON)
{
  "displayName": "Luciano Lupo",
  "position": "Software Engineer",
  "company": "Fuul",
  "tags": ["deep", "intentional", "grounded"],
  "avatarUrl": "",
  "createdAt": "2026-03-01T00:00:00Z"
}

// Config
owner: user's wallet
expiresIn: 365 days
contentType: "application/json"
```

**2. Connection Request**
```typescript
// Attributes
app          = "rootgraph"
entityType   = "connection-request"
fromWallet   = "0xabc..."
toWallet     = "0xdef..."
status       = "pending"            // pending | accepted | rejected

// Payload (JSON)
{
  "message": "Hey, met you at ETHDenver!",
  "createdAt": "2026-03-01T00:00:00Z"
}

// Config
owner: requester's wallet
expiresIn: 30 days
```

**3. Connection (Edge)**
```typescript
// Attributes
app          = "rootgraph"
entityType   = "connection"
userA        = "0xabc..."           // alphabetically first wallet
userB        = "0xdef..."           // alphabetically second wallet

// Payload (JSON)
{
  "connectedAt": "2026-03-01T00:00:00Z",
  "initiator": "0xabc..."
}

// Config
owner: acceptor's wallet
expiresIn: 365 days
```

**Connection ID convention:** `userA` is always the lexicographically smaller wallet address. This ensures one unique connection entity per pair regardless of who initiated.

**4. Activity Event**
```typescript
// Attributes
app          = "rootgraph"
entityType   = "activity"
actor        = "0xabc..."
eventType    = "connection_made"    // profile_created | connection_made | connection_requested

// Payload (JSON)
{
  "targetWallet": "0xdef...",
  "targetUsername": "fran",
  "createdAt": "2026-03-01T00:00:00Z"
}

// Config
owner: actor's wallet
expiresIn: 90 days
```

---

## Connection Flow (State Machine)

```
Alice wants to connect with Bob:

1. Alice → createEntity(connection-request, fromWallet=Alice, toWallet=Bob, status="pending")
2. Bob polls: query(entityType="connection-request" && toWallet=Bob && status="pending")
3. Bob sees request, clicks Accept:
   a. Bob → createEntity(connection, userA=min(Alice,Bob), userB=max(Alice,Bob))
   b. Bob → createEntity(activity, eventType="connection_made")
   c. Alice's request auto-expires in 30 days (no need to update/delete)
4. Both apps detect new connection entity via polling

Reject:
3b. Bob ignores → request expires in 30 days
    OR Bob → can't update Alice's entity (she owns it)
    → Bob creates a "rejection" entity OR we just let it expire
    → For MVP: just let unaccepted requests expire
```

**Simplification for hackathon:** We don't need to update the request status. The presence of a `connection` entity between two wallets IS the acceptance. Pending requests that aren't accepted simply expire.

---

## Key Queries

```typescript
// Find profile by username
entityType = "profile" && app = "rootgraph" && username = "lupo0x"

// Find profile by wallet
entityType = "profile" && app = "rootgraph" && wallet = "0xabc..."

// My pending connection requests (incoming)
entityType = "connection-request" && app = "rootgraph" && toWallet = "0xMyWallet..." && status = "pending"

// My connections (I'm userA)
entityType = "connection" && app = "rootgraph" && userA = "0xMyWallet..."

// My connections (I'm userB) — need second query
entityType = "connection" && app = "rootgraph" && userB = "0xMyWallet..."

// Merge both results client-side for full connection list

// All profiles (for search / graph)
entityType = "profile" && app = "rootgraph"

// Recent activity for a user
entityType = "activity" && app = "rootgraph" && actor = "0xMyWallet..."
```

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| **Framework** | Next.js 14 (App Router) | Fast, SSR for landing page, client components for app |
| **Styling** | Tailwind CSS + shadcn/ui | Polished look, fast to build |
| **Auth** | Privy | Wallet + Google login, embedded wallets |
| **Arkiv SDK** | `@arkiv-network/sdk` | Official TS SDK (Viem-based) |
| **Graph Viz** | `react-force-graph-2d` or `@react-sigma/core` | Trust Map visualization |
| **Graph Library** | `graphology` | In-memory graph for client-side traversal |
| **State** | Zustand | Simple global state |
| **Chain** | Kaolin testnet | Primary Arkiv testnet |

### Key Dependencies

```json
{
  "@arkiv-network/sdk": "latest",
  "@privy-io/react-auth": "latest",
  "graphology": "latest",
  "react-force-graph-2d": "latest",
  "zustand": "latest",
  "next": "14.x",
  "tailwindcss": "latest",
  "@shadcn/ui": "latest"
}
```

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Next.js App (Browser)                           │
│                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Landing   │ │ Profile  │ │ Trust Map        │ │
│  │ Page      │ │ + Connect│ │ (react-force-    │ │
│  │           │ │ ions     │ │  graph-2d)       │ │
│  └──────────┘ └────┬─────┘ └────────┬─────────┘ │
│                    │                 │            │
│  ┌─────────────────┴─────────────────┘           │
│  │ Arkiv Service Layer                           │
│  │  - createProfile(), getProfile()              │
│  │  - sendRequest(), acceptRequest()             │
│  │  - getConnections(), getGraph()               │
│  │  - searchUsers(), getActivity()               │
│  └──────────────────┬────────────────────────────┘│
│                     │                             │
│  ┌──────────────────┴────────────────────────────┐│
│  │ Privy (Auth)         + @arkiv-network/sdk     ││
│  │ - Wallet connect     - PublicClient (reads)   ││
│  │ - Google OAuth       - WalletClient (writes)  ││
│  │ - Embedded wallets   - QueryBuilder           ││
│  └───────────────────────────────────────────────┘│
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │  Arkiv Kaolin (L3 Testnet)   │
        │  RPC: kaolin.hoodi.arkiv...  │
        │  Entities: profiles,         │
        │    connections, requests,     │
        │    activities                 │
        └──────────────────────────────┘
```

---

## Pages / Routes

| Route | Description | Auth |
|---|---|---|
| `/` | Landing page — pitch + login buttons | Public |
| `/dashboard` | Profile overview, network growth, recent connections | Protected |
| `/connections` | List of connections + pending requests | Protected |
| `/trustmap` | Visual graph of your network | Protected |
| `/search` | Search for users by username | Protected |
| `/profile/[username]` | View another user's public profile | Protected |
| `/settings` | Edit profile (username, position, company, tags) | Protected |

---

## Demo Script (for hackathon judges)

1. **Landing page** — explain the concept: "Own your professional network and job board on-chain"
2. **Login with Google** — show how easy onboarding is (Privy creates wallet behind scenes)
3. **Create profile** — fill in username, position, company, tags
4. **Enable encryption** — one-click signature derives NaCl keys, show public key on profile
5. **Search for another user** — find a pre-created demo user
6. **Send connection request** — show the tx going to Arkiv
7. **Switch to second account** — accept the request
8. **Job Board** — browse jobs with salary ranges, tags, remote filter
9. **Post a job with encrypted salary** — enter exact amount, show auto-calculated range, explain ZK proof concept
10. **Trust Map** — show the multi-entity graph: people (circles), companies (blue squares), jobs (amber diamonds)
11. **Click a company node** — show detail panel with name, description, job count, website
12. **Click a job node** — show detail panel with salary, tags, INTERESTED button
13. **Apply from graph** — one-click express interest directly from the Trust Map
14. **Toggle filters** — hide/show companies and jobs, watch stats update instantly
15. **Show Arkiv explorer** — prove encrypted salary ciphertext lives on-chain, exact amount not visible
16. **Key message**: "No Supabase. No Firebase. Your entire professional network — profiles, connections, jobs, applications, encrypted salaries — all on Arkiv. Portable. Private. Yours."

---

## Implementation Order

### Phase 1: Foundation (Day 1)
- [ ] `npx create-next-app` + Tailwind + shadcn
- [ ] Privy setup (wallet + Google auth)
- [ ] Arkiv SDK integration (PublicClient + WalletClient from Privy wallet)
- [ ] Kaolin testnet faucet for dev wallets
- [ ] Basic layout (sidebar nav, dark theme to match RootGraph)

### Phase 2: Core Features (Day 2-3)
- [ ] Profile CRUD (create on first login, edit in settings)
- [ ] Username uniqueness check (query before create)
- [ ] Connection request flow (send, view incoming, accept)
- [ ] Connections list page
- [ ] User search (query profiles by username GLOB)

### Phase 3: Trust Map (Day 3-4)
- [ ] Fetch all connections for current user
- [ ] Fetch profiles for connected users
- [ ] Build graphology graph in memory
- [ ] Render with react-force-graph-2d
- [ ] Click node → view profile
- [ ] Basic styling (dark theme, RootGraph aesthetic)

### Phase 4: Polish (Day 4-5)
- [ ] Activity feed (recent connection events)
- [ ] Dashboard with stats (total connections, network growth)
- [ ] Landing page (hero, features, CTA)
- [ ] Loading states, error handling
- [ ] Mobile responsiveness basics
- [ ] Demo prep + Blockscout integration for proving on-chain

---

## Testnet Setup

```bash
# Kaolin RPC
https://kaolin.hoodi.arkiv.network/rpc

# Kaolin WebSocket
wss://kaolin.hoodi.arkiv.network/rpc/ws

# Chain ID
60138453025

# Faucet
https://kaolin.hoodi.arkiv.network/faucet/

# Block Explorer
https://kaolin.hoodi.arkiv.network/explorer/
```

---

## Risk Mitigations (Hackathon-Specific)

| Risk | Mitigation |
|---|---|
| Privy embedded wallet can't sign Arkiv txs | Test immediately on Day 1. Fallback: use `viem` WalletClient with Privy's exported private key |
| Arkiv SDK issues | Pin SDK version, have the forum example as reference implementation |
| Graph viz performance | Limit to 1-hop for demo, keep node count small |
| Testnet down | Have screenshots/video backup of working demo |
| Username races | For hackathon: just check-then-create, accept the race condition |
| Entity expiration during demo | Set 365-day expiration, no issue for hackathon |

---

## What Makes This Hackathon-Worthy

1. **Novel use of Arkiv** — social graph + job board + privacy layer on decentralized entity storage (not just pastebin/files)
2. **Real product vision** — RootGraph already exists, this is a credible migration path
3. **Dual auth** — wallet + Google shows accessibility thinking
4. **Visual demo** — Multi-entity Trust Map with 3 node shapes, filters, and apply-from-graph is eye-catching
5. **Privacy layer** — Encrypted salaries (NaCl secretbox), encrypted messages (NaCl box), ZK range proofs (Noir circuit) — all client-side
6. **On-chain proof** — can show encrypted ciphertext in Arkiv Explorer, prove exact salary is not in plaintext
7. **Composability angle** — other apps could read the same social graph, job listings, and company profiles from Arkiv
8. **Depth of integration** — 8 entity types, atomic batch writes, 4-query parallel graph building, attribute-based filtering, TTL management
