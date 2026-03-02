# RootGraph × Arkiv Network — Integration Architecture

**Date:** 2026-03-01  
**Author:** Integration Architect  
**Sources:** `01-arkiv-architecture.md`, `02-rootgraph-data-model.md`

---

## Executive Summary

This document defines how to rebuild RootGraph — a trust-based professional networking platform — on top of Arkiv Network's decentralized entity storage. The fundamental challenge is bridging a **relational social graph** (PostgreSQL with JOINs, RLS, full-text search) onto a **flat entity store** (key-value entities, no JOINs, no native graph, all data public).

The recommended approach is a **hybrid architecture**: Arkiv serves as the **decentralized source of truth** for identity, connections, and data ownership, while a **client-side graph engine** (or lightweight indexer) handles graph traversal, privacy filtering, and complex queries that Arkiv cannot natively support.

---

## 1. Data Model Mapping

### 1.1 Mapping Strategy

Every RootGraph entity becomes one or more Arkiv entities, using **attributes for indexing** and **JSON payloads for structured data**. Relationships between entities are modeled via attribute references (entity keys stored as string attributes).

### 1.2 Entity Mappings

#### User Profile → Arkiv Entity

```
Entity Type: "profile"
Attributes (indexed):
  entityType     = "profile"           (string)
  app            = "rootgraph"         (string)
  username       = "lupo0x"            (string)
  privacyLevel   = "open"             (string: open|selective|private)
  walletAddress  = "0xabc..."          (string)

Payload (JSON):
{
  "displayName": "Luciano Lupo",
  "avatarUrl": "https://...",
  "company": "Fuul",
  "position": "Software Engineer",
  "tags": ["deep", "intentional", "grounded"],
  "createdAt": "2026-03-01T00:00:00Z"
}

Owner: User's Ethereum wallet address
Expiration: MAX (renewed automatically via cron/heartbeat)
Content-Type: application/json
```

**Key design decisions:**
- `username` as a string attribute allows querying by username directly
- `privacyLevel` as an attribute enables filtering during graph construction
- Tags go in payload (not queryable individually) — for MVP, tag search happens client-side after fetching profiles
- Owner = the user's wallet → only they can update their profile

#### Connected Account → Arkiv Entity

```
Entity Type: "social-link"
Attributes:
  entityType     = "social-link"
  app            = "rootgraph"
  userId         = "<owner-profile-entity-key>"    (string)
  platform       = "twitter"                        (string)
  handle         = "@lupo0x"                        (string)

Payload (JSON):
{
  "verified": true,
  "linkedAt": "2026-03-01T00:00:00Z"
}

Owner: Same wallet as the user's profile
```

#### Connection (Graph Edge) → Arkiv Entity

This is the most critical mapping. Each **accepted connection** becomes a single entity owned by the connection initiator, but queryable by both parties.

```
Entity Type: "connection"
Attributes:
  entityType     = "connection"
  app            = "rootgraph"
  userA          = "<wallet-address-A>"     (string)
  userB          = "<wallet-address-B>"     (string)
  status         = "connected"               (string: pending|connected|blocked)

Payload (JSON):
{
  "connectedAt": "2026-03-01T00:00:00Z",
  "initiator": "<wallet-address-A>"
}

Owner: Initiator's wallet
Expiration: MAX (renewed periodically)
```

**Why wallet addresses as attributes instead of entity keys:**
- Wallet addresses are stable identifiers (entity keys change if a profile is recreated)
- Allows querying all connections for a user: `entityType = "connection" && (userA = "0x..." || userB = "0x...")`
- **Limitation**: Arkiv's query language supports `||` (OR), so this query works

**Bidirectionality challenge:**
- One entity represents the connection, owned by the initiator
- To let either party sever the connection, the app layer must handle this:
  - Option A: Initiator owns it; acceptor can request deletion via a "disconnect-request" entity
  - Option B: **Two mirror entities** (one per user), both must exist for the connection to be valid
  - **Recommended (MVP): Option A** — simpler, with app-level logic for disconnect flow

#### Connection Request → Arkiv Entity

```
Entity Type: "connection-request"
Attributes:
  entityType     = "connection-request"
  app            = "rootgraph"
  fromUser       = "<wallet-address>"        (string)
  toUser         = "<wallet-address>"         (string)
  status         = "pending"                  (string: pending|accepted|rejected)

Payload (JSON):
{
  "message": "Hey, we met at ETHDenver!",
  "createdAt": "2026-03-01T00:00:00Z"
}

Owner: Requester's wallet
Expiration: 30 days (auto-expire unresponded requests)
```

**Acceptance flow:**
1. Requester creates `connection-request` entity
2. Recipient polls for requests: `entityType = "connection-request" && toUser = "0x..." && status = "pending"`
3. Recipient creates a new `connection` entity and the requester updates the request's status to "accepted"
4. **Problem**: Only the owner can update an entity. So the requester must update their own request.
5. **Solution**: The accept action creates the `connection` entity (owned by acceptor OR initiator via app coordination). The request entity can be left to expire or updated by the requester when they detect the connection entity exists.

**Simplified MVP flow:**
1. A creates `connection-request` (owned by A)
2. B sees it, creates `connection` entity (owned by B, with `userA` and `userB` set)
3. A detects the connection entity exists, deletes the request
4. Connection is valid when a `connection` entity exists with both wallet addresses

#### Message → Arkiv Entity

```
Entity Type: "message"
Attributes:
  entityType       = "message"
  app              = "rootgraph"
  conversationId   = "<deterministic-id>"     (string)
  sender           = "<wallet-address>"        (string)
  recipient        = "<wallet-address>"        (string)
  readStatus       = "0"                       (numeric: 0=unread, 1=read)

Payload: Encrypted message content (see Section 5)

Owner: Sender's wallet
Expiration: 90 days (configurable)
Content-Type: application/octet-stream (encrypted)
```

**Conversation ID derivation:**
```typescript
const conversationId = [walletA, walletB].sort().join('-')
```
This ensures both parties derive the same conversation ID regardless of who messages first.

#### Community → Arkiv Entity

```
Entity Type: "community"
Attributes:
  entityType     = "community"
  app            = "rootgraph"
  communityName  = "ETH Builders"             (string)
  visibility     = "public"                    (string)
  creator        = "<wallet-address>"          (string)

Payload (JSON):
{
  "description": "A community for Ethereum builders",
  "createdAt": "2026-03-01T00:00:00Z",
  "memberCount": 42
}

Owner: Creator's wallet
```

#### Community Membership → Arkiv Entity

```
Entity Type: "community-member"
Attributes:
  entityType     = "community-member"
  app            = "rootgraph"
  communityKey   = "<community-entity-key>"    (string)
  member         = "<wallet-address>"           (string)
  role           = "member"                     (string: member|admin|moderator)

Owner: Member's wallet (they can leave by deleting)
```

#### Activity Event → Arkiv Entity

```
Entity Type: "activity"
Attributes:
  entityType     = "activity"
  app            = "rootgraph"
  actor          = "<wallet-address>"           (string)
  eventType      = "connection_made"            (string)
  targetId       = "<entity-key>"               (string)

Payload (JSON):
{
  "metadata": { ... },
  "createdAt": "2026-03-01T00:00:00Z"
}

Owner: Actor's wallet
Expiration: 30 days (activity events are ephemeral)
```

### 1.3 Attribute Naming Convention

All attributes follow this pattern:
- `app` = `"rootgraph"` — namespace isolation (multiple apps can share the chain)
- `entityType` = discriminator for filtering
- Remaining attributes are entity-specific, using camelCase

---

## 2. Graph Operations

### 2.1 The Core Problem

Arkiv has **no native graph traversal**. It's a flat entity store with attribute-based filtering. Building a Trust Map requires graph operations (BFS, shortest path, clustering) that must be implemented in the **application layer**.

### 2.2 Architecture: Client-Side Graph Engine

```
┌─────────────────────────────────────┐
│  Browser (Next.js App)              │
│  ┌───────────────────────────────┐  │
│  │ Graph Engine (in-memory)      │  │
│  │ - ngraph / graphology         │  │
│  │ - BFS, shortest path          │  │
│  │ - Force-directed layout       │  │
│  │ - Privacy filtering           │  │
│  └──────────┬────────────────────┘  │
│             │ hydrate                │
│  ┌──────────┴────────────────────┐  │
│  │ Arkiv Data Layer              │  │
│  │ - Fetch all connections       │  │
│  │ - Fetch visible profiles      │  │
│  │ - Subscribe to events         │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

**Approach:**
1. On page load, fetch all `connection` entities for the current user's graph neighborhood
2. Fetch profile entities for connected users
3. Build an in-memory graph (using `graphology` or `ngraph`)
4. Run traversal algorithms client-side
5. Apply privacy filtering before rendering
6. Use WebSocket event subscriptions for real-time updates

### 2.3 Query Implementations

#### Get User's Direct Connections (1-hop)

```typescript
// Fetch all connections where this wallet is involved
const connections = await publicClient.buildQuery()
  .where([
    eq('app', 'rootgraph'),
    eq('entityType', 'connection'),
    eq('status', 'connected'),
    eq('userA', myWallet)
  ])
  .withPayload(true)
  .limit(500)
  .fetch()

// Also fetch where they're userB
const connectionsB = await publicClient.buildQuery()
  .where([
    eq('app', 'rootgraph'),
    eq('entityType', 'connection'),
    eq('status', 'connected'),
    eq('userB', myWallet)
  ])
  .withPayload(true)
  .limit(500)
  .fetch()

// Merge results
const allConnections = [...connections.entities, ...connectionsB.entities]
```

**Note:** Two queries needed because Arkiv doesn't support `OR` in the same way a SQL `WHERE userA = X OR userB = X` would work. If Arkiv's `||` operator works at the top level, this can be combined:
```
app = "rootgraph" && entityType = "connection" && status = "connected" && (userA = "0x..." || userB = "0x...")
```

#### Get 2-Hop Network (Connections of Connections)

```typescript
// 1. Get direct connections (1-hop)
const directPeers = getDirectConnections(myWallet) // returns wallet addresses

// 2. For each peer, get THEIR connections
const twoHopPromises = directPeers.map(peer =>
  getDirectConnections(peer)
)
const twoHopResults = await Promise.all(twoHopPromises)

// 3. Build graph in memory
const graph = new Graph()
// ... add all nodes and edges
```

**Performance concern:** For a user with 50 connections, this is 50+ queries. Mitigation strategies:
- **Batch queries** — fetch connections in parallel (Promise.all)
- **Local caching** — cache graph data in IndexedDB with TTL
- **Progressive loading** — render 1-hop immediately, expand to 2-hop asynchronously
- **Global index** — periodically fetch ALL connections (feasible for <100K edges) and build a complete graph client-side

#### Path Finding (How to Reach User X)

```typescript
// Using graphology's BFS shortest path
import { bidirectional } from 'graphology-shortest-path'

const path = bidirectional(graph, myWallet, targetWallet)
// Returns: [myWallet, intermediary1, intermediary2, targetWallet]
```

This requires the graph to be loaded in memory first.

#### Clustering

```typescript
// After loading profiles with tags/company/position
import { louvain } from 'graphology-communities-louvain'

// Cluster by graph topology
const communities = louvain(graph)

// Or cluster by attribute (company, role)
function clusterByAttribute(graph, attribute) {
  const clusters = {}
  graph.forEachNode((node, attrs) => {
    const key = attrs[attribute] || 'Other'
    if (!clusters[key]) clusters[key] = []
    clusters[key].push(node)
  })
  return clusters
}
```

#### Mutual Connections

```typescript
// Given two users' connection sets
const mutualConnections = directConnectionsA.filter(
  addr => directConnectionsB.includes(addr)
)
```

### 2.4 Graph Data Loading Strategy

For MVP, use a **tiered loading approach**:

| Tier | Data | When | Cache |
|------|------|------|-------|
| T1 | My profile + direct connections | On login | IndexedDB, 5min TTL |
| T2 | 2-hop profiles + connections | On Trust Map open | IndexedDB, 15min TTL |
| T3 | Global connection index | Background sync | IndexedDB, 1hr TTL |

For the MVP scale (1K-10K users, 5K-50K edges), loading the entire connection graph is feasible (~2-5MB). At larger scale, this shifts to server-side indexing.

---

## 3. Identity & Authentication

### 3.1 Authentication Flow

Arkiv uses Ethereum wallets natively. RootGraph should embrace this:

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Browser     │───▶│ Wallet       │───▶│ Arkiv Chain   │
│   (Next.js)   │    │ (MetaMask /  │    │ (Kaolin L3)   │
│               │◀───│  WalletConnect│◀───│               │
└──────────────┘    └──────────────┘    └──────────────┘
```

1. **Connect Wallet** — user connects via MetaMask, WalletConnect, or Coinbase Wallet
2. **Sign Message** — app requests a signature to prove wallet ownership (SIWE — Sign-In with Ethereum)
3. **Session Created** — client stores session locally (JWT or signed cookie)
4. **Arkiv Operations** — write operations use the wallet's private key via the Arkiv WalletClient

### 3.2 Identity Resolution

- **Primary identity**: Ethereum wallet address
- **Human-readable identity**: RootGraph username (stored as profile attribute)
- **Lookup**: Query `entityType = "profile" && username = "lupo0x"` → returns profile entity with wallet address as owner
- **Wallet-to-profile**: Query `entityType = "profile" && walletAddress = "0x..."` → profile

### 3.3 Username Registration

Usernames must be unique. Since Arkiv has no unique constraints:

1. Before creating a profile, query: `entityType = "profile" && username = "desired_username"`
2. If no results, create the profile entity with that username
3. **Race condition**: Two users could claim the same username simultaneously
4. **Mitigation**: Resolve by earliest `createdAtBlock` — the entity created in the earlier block wins. App layer enforces this by checking for duplicates after creation and deleting the later one.
5. **Alternative**: Use a lightweight registration service (see Section 10) that coordinates username claims via a smart contract or off-chain registry.

### 3.4 Account Recovery

If a user loses wallet access:
- Their profile and connections are owned by the lost wallet
- **No protocol-level recovery** — this is a fundamental blockchain limitation
- **Mitigation**: Support social recovery (future), multi-sig wallets, or allow linking multiple wallets to one identity via a "wallet-link" entity

---

## 4. Privacy Model

### 4.1 The Fundamental Challenge

**Arkiv has no access control.** All entities are publicly readable by anyone. This directly conflicts with RootGraph's three-tier privacy model (Open/Selective/Private).

### 4.2 Approach: Encryption + Client-Side Filtering

Privacy is enforced through a combination of:

1. **Metadata remains public** (privacy level attribute, wallet addresses on connections)
2. **Sensitive payload data is encrypted** for non-Open profiles
3. **Client-side filtering** respects privacy levels when rendering the graph
4. **Honest client assumption** for MVP (see tradeoffs)

### 4.3 Privacy Implementation

#### Open Profiles (100% Visible)
- Profile payload: **unencrypted** (plain JSON)
- Connections: visible to all
- No special handling needed

#### Selective Profiles (60% — Path-Connected Only)
- Profile payload: **unencrypted** (data is available, but app only shows it if a path exists)
- The app computes whether the viewer has a path to this profile via the connection graph
- If no path exists, the client omits the profile from the Trust Map and search results
- **Honest client**: The data IS technically public on Arkiv; the privacy is enforced by the app, not the protocol
- **Stronger alternative (post-MVP)**: Encrypt the payload with a group key shared along connection paths

#### Private Profiles (30% — Direct Connections Only)
- Profile payload: **encrypted** with a symmetric key
- The symmetric key is shared only with direct connections (via encrypted key-exchange entities)
- Non-connected users can see the entity exists (wallet address, `privacyLevel = "private"`) but cannot read the profile data

### 4.4 Encryption Scheme for Private Profiles

```
Profile Creation (Private):
1. Generate random AES-256-GCM key (profileKey)
2. Encrypt profile JSON with profileKey
3. Store encrypted payload as Arkiv entity
4. For each connection, create a "key-share" entity:
   - Encrypt profileKey with the connection's public key (ECDH)
   - Store as entity: entityType = "key-share", recipient = "<connection-wallet>"

Reading a Private Profile:
1. Fetch the profile entity (encrypted payload)
2. Fetch key-share: entityType = "key-share" && recipient = "<my-wallet>" && profileKey = "<profile-entity-key>"
3. Decrypt the key-share with my private key → get profileKey
4. Decrypt the profile payload with profileKey
```

### 4.5 Privacy Level Summary

| Level | Payload | Connection Visibility | Trust Map Visibility |
|-------|---------|----------------------|---------------------|
| Open | Plain JSON | All connections visible | Always visible |
| Selective | Plain JSON (app-enforced) | Visible only to path-connected | Only if path exists from viewer |
| Private | Encrypted (AES-256-GCM) | Visible only to direct connections | Only to direct connections |

### 4.6 Limitations & Honest Acknowledgement

- **Selective privacy is soft** — the data is technically public on Arkiv. A determined user with direct chain access can read all Selective profiles. This is acceptable for an MVP where the threat model is casual browsing, not adversarial extraction.
- **Private privacy is strong** — encrypted payloads are unreadable without the key
- **Connection graph is public** — the fact that A and B are connected is visible to all (entity exists with their wallet addresses). Encrypting the connection graph itself would make graph traversal impossible.
- **Metadata leakage** — even for Private profiles, attributes like `entityType`, `app`, `walletAddress` are visible

---

## 5. Encrypted Messaging

### 5.1 End-to-End Encryption with ECDH

Since Arkiv data is public, all messages MUST be encrypted end-to-end.

```
Message Send Flow:
1. Derive shared secret: ECDH(myPrivateKey, recipientPublicKey)
2. Derive encryption key: HKDF(sharedSecret, conversationId)
3. Encrypt message: AES-256-GCM(encryptionKey, plaintext)
4. Create Arkiv entity with encrypted payload

Message Receive Flow:
1. Query: entityType = "message" && recipient = "<my-wallet>" && readStatus = 0
2. Derive shared secret: ECDH(myPrivateKey, senderPublicKey)
3. Derive encryption key: HKDF(sharedSecret, conversationId)
4. Decrypt message payload
```

### 5.2 Public Key Distribution

Ethereum wallet public keys can be derived from any signed transaction. For users who haven't transacted yet, store an explicit "public-key" entity:

```
Entity Type: "public-key"
Attributes:
  entityType   = "public-key"
  app          = "rootgraph"
  wallet       = "<wallet-address>"

Payload: The user's public key (compressed, 33 bytes)
```

### 5.3 Read Receipts

The sender creates the message entity (they own it). The recipient cannot modify it to mark as "read". Options:

- **Option A**: Recipient creates a separate "read-receipt" entity
- **Option B**: App tracks read state locally (IndexedDB) — simpler, no on-chain cost
- **Recommended (MVP): Option B** — read state is local-only

### 5.4 Message Expiration

Messages auto-expire (Arkiv requirement). Set a reasonable default:
- Messages: 90 days
- Connection requests: 30 days
- Activity events: 30 days

Users should be informed that messages are ephemeral. The app can offer "extend" to keep important conversations.

---

## 6. MVP Scope

### 6.1 Essential (Must Have for MVP)

| Feature | Complexity | Notes |
|---------|-----------|-------|
| **Wallet connect + SIWE** | Low | Standard Web3 auth |
| **Profile CRUD** | Low | Create/update/read profile entities |
| **Connection requests** | Medium | Request → accept → connection entity flow |
| **1-hop connection list** | Low | Simple attribute query |
| **Trust Map visualization** | Medium | Force-directed graph with graphology + D3/Three.js |
| **2-hop graph exploration** | Medium | Multi-query + client-side graph building |
| **Privacy levels (Open only)** | Low | Start with Open profiles only |
| **Basic search (by username)** | Low | Attribute query on username |
| **Activity feed** | Low | Query recent activity entities |
| **Entity auto-renewal** | Medium | Background job to extend non-expired entities |

### 6.2 Important (Should Have, Post-MVP v0.2)

| Feature | Complexity | Notes |
|---------|-----------|-------|
| **Encrypted messaging** | High | E2E encryption + key exchange |
| **Private/Selective privacy** | High | Encryption scheme + key sharing |
| **Communities** | Medium | Community + membership entities |
| **Path finding ("How to reach X")** | Medium | BFS on client-side graph |
| **Clustering (by role/company)** | Low | Client-side grouping |
| **Social links (connected accounts)** | Low | Simple entity CRUD |
| **Connection import** | Medium | Bulk entity creation |

### 6.3 Nice to Have (v1.0+)

| Feature | Complexity | Notes |
|---------|-----------|-------|
| **Full-text search** | High | Requires off-chain indexer |
| **Real-time notifications** | Medium | WebSocket event subscriptions |
| **Trust scores** | High | Algorithmic scoring |
| **Network analytics** | Medium | Growth charts, stats |
| **Multi-wallet identity** | High | Account linking system |
| **Social recovery** | Very High | Multi-sig or guardian system |

### 6.4 MVP Timeline Estimate

| Phase | Duration | Deliverables |
|-------|----------|-------------|
| **Week 1-2** | Setup + Core | Wallet auth, profile CRUD, Arkiv integration, basic UI |
| **Week 3-4** | Connections | Request/accept flow, connection list, 1-hop queries |
| **Week 5-6** | Trust Map | Graph visualization, 2-hop loading, force layout |
| **Week 7-8** | Polish | Search, activity feed, auto-renewal, testing |

---

## 7. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER'S BROWSER                           │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   Next.js App (React)                    │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │    │
│  │  │ Profile   │ │ Connect  │ │ Trust    │ │ Activity  │  │    │
│  │  │ Pages     │ │ Flow     │ │ Map      │ │ Feed      │  │    │
│  │  └─────┬─────┘ └─────┬────┘ └────┬─────┘ └─────┬─────┘  │    │
│  │        └──────────────┼──────────┼──────────────┘        │    │
│  │                       ▼          ▼                        │    │
│  │  ┌──────────────────────────────────────────────────┐    │    │
│  │  │           RootGraph SDK / Service Layer           │    │    │
│  │  │  - Entity serialization/deserialization           │    │    │
│  │  │  - Privacy filtering logic                        │    │    │
│  │  │  - Connection state machine                       │    │    │
│  │  │  - Encryption/decryption (E2E)                    │    │    │
│  │  └────────────┬─────────────────────────┬────────────┘    │    │
│  │               │                         │                 │    │
│  │  ┌────────────▼────────────┐  ┌─────────▼──────────┐    │    │
│  │  │  Graph Engine            │  │  Local Cache        │    │    │
│  │  │  (graphology)            │  │  (IndexedDB)        │    │    │
│  │  │  - In-memory graph       │  │  - Profile cache    │    │    │
│  │  │  - BFS / shortest path   │  │  - Connection cache │    │    │
│  │  │  - Clustering            │  │  - Message history  │    │    │
│  │  │  - Force layout calc     │  │  - Session state    │    │    │
│  │  └─────────────────────────┘  └──────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  Wallet Provider                         │    │
│  │          (MetaMask / WalletConnect / Coinbase)           │    │
│  │  - Signs transactions for writes                        │    │
│  │  - SIWE for session auth                                │    │
│  │  - ECDH for E2E encryption                              │    │
│  └──────────────────────┬──────────────────────────────────┘    │
└─────────────────────────┼───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ARKIV NETWORK (Kaolin L3)                     │
│                                                                 │
│  ┌───────────────────────────────────────────────────────┐      │
│  │              Query API (arkiv_query RPC)                │      │
│  │  - Filter entities by attributes                       │      │
│  │  - Pagination with cursors                             │      │
│  │  - WebSocket event subscriptions                       │      │
│  └───────────────────────────────────────────────────────┘      │
│                                                                 │
│  ┌───────────────────────────────────────────────────────┐      │
│  │         Entity Storage (Modified OP-Geth)              │      │
│  │  Entities:                                             │      │
│  │  📄 Profiles    (entityType="profile")                 │      │
│  │  🔗 Connections (entityType="connection")              │      │
│  │  📨 Requests    (entityType="connection-request")      │      │
│  │  💬 Messages    (entityType="message")                 │      │
│  │  👥 Communities (entityType="community")               │      │
│  │  📋 Activities  (entityType="activity")                │      │
│  │  🔑 Key Shares  (entityType="key-share")              │      │
│  └───────────────────────────────────────────────────────┘      │
│                                                                 │
│  ┌───────────────────────────────────────────────────────┐      │
│  │              OP Stack Settlement                        │      │
│  │  Kaolin L3 → Erech L2 → Hoodi L1 → Ethereum           │      │
│  └───────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘

Optional Future Components:
┌─────────────────────────────────────────────────────────────────┐
│  ┌───────────────────┐  ┌───────────────────┐                   │
│  │ Renewal Service    │  │ Indexer Service    │                   │
│  │ (Cron/Serverless)  │  │ (Full-Text Search) │                   │
│  │ - Extends entity   │  │ - Syncs entities   │                   │
│  │   expirations      │  │ - Builds search    │                   │
│  │ - Heartbeat check  │  │   index            │                   │
│  └───────────────────┘  └───────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

### 7.1 Data Flow — Creating a Connection

```
1. Alice clicks "Connect" on Bob's profile
   │
2. Alice's app creates "connection-request" entity on Arkiv
   │  (wallet signs tx → Arkiv WalletClient → createEntity)
   │
3. Bob's app polls for pending requests
   │  (publicClient.buildQuery → entityType="connection-request" && toUser=Bob)
   │
4. Bob clicks "Accept"
   │
5. Bob's app creates "connection" entity on Arkiv
   │  (wallet signs tx → createEntity with userA=Alice, userB=Bob)
   │
6. Both apps detect the new connection entity
   │  (via polling or WebSocket subscription)
   │
7. Both apps update their local graph cache
   │
8. Trust Map re-renders with the new edge
```

---

## 8. Tradeoffs: Supabase → Arkiv

### 8.1 What You Gain

| Benefit | Details |
|---------|---------|
| **True data ownership** | Users own their profile and connections via wallet. No platform can delete or censor them. |
| **Censorship resistance** | Data is on a blockchain — no single entity can take it down |
| **Trustless verification** | Anyone can verify that a connection exists on-chain |
| **Interoperability** | Other apps can build on the same social graph (composability) |
| **No backend to maintain** | No servers, databases, or ops — purely client + chain |
| **Built-in audit trail** | Every change is a blockchain transaction with immutable history |
| **Web3 identity alignment** | Wallet-native identity fits RootGraph's crypto-savvy audience |
| **Decentralized ethos** | Aligns with RootGraph's philosophy of genuine trust relationships |

### 8.2 What You Lose

| Loss | Details | Mitigation |
|------|---------|------------|
| **Complex queries** | No JOINs, aggregations, or full-text search | Client-side graph engine + future indexer |
| **Real-time performance** | 2-second block times vs instant Supabase Realtime | Optimistic UI updates + WebSocket events |
| **Privacy guarantees** | All data is public on-chain | Application-layer encryption + client-side filtering |
| **Query performance** | Multiple queries needed for graph traversal | Aggressive caching (IndexedDB) + parallel queries |
| **Data permanence** | Entities expire — must be renewed | Auto-renewal service / heartbeat |
| **Onboarding friction** | Users need a wallet + testnet ETH | WalletConnect + faucet integration + account abstraction (future) |
| **Schema enforcement** | No database-level constraints | App-level validation + defensive queries |
| **Referential integrity** | No foreign keys — dangling references possible | App-level cleanup + eventual consistency |
| **Backup/export** | No built-in export | Query all user's entities by owner address |
| **Cost model** | Every write is a transaction (gas) | Batch operations + L3 low gas + testnet is free |

### 8.3 Net Assessment

For an **MVP targeting crypto-native users** who value decentralization and data ownership, the tradeoffs are acceptable. The biggest risks are UX friction (wallets) and query complexity (graph traversal). Both are manageable at MVP scale.

For a **mass-market product**, the tradeoffs would be harder to justify without significant infrastructure investment (indexers, account abstraction, relay services).

---

## 9. Technical Risks

### 9.1 Critical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Arkiv is testnet-only (no mainnet)** | HIGH | HIGH | Build MVP on testnet, monitor Arkiv roadmap for mainnet. Have fallback plan to fork or migrate. |
| **Query performance at scale** | MEDIUM | HIGH | Client-side caching, progressive loading, global graph index for small networks |
| **Entity expiration data loss** | MEDIUM | HIGH | Auto-renewal service with monitoring + alerts. Store backup in IndexedDB. |
| **Arkiv SDK breaking changes** | MEDIUM | MEDIUM | Pin SDK versions, maintain abstraction layer between app and SDK |
| **Single sequencer failure** | LOW | HIGH | OP Stack limitation — no mitigation except waiting for decentralized sequencing |

### 9.2 Moderate Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Username squatting/races** | MEDIUM | MEDIUM | Earliest-block-wins rule + future registration contract |
| **Privacy model is soft (Selective)** | HIGH | MEDIUM | Document clearly, use encryption for Private. Honest about limitations. |
| **Connection state inconsistency** | MEDIUM | MEDIUM | Defensive queries, app-level state reconciliation |
| **Wallet onboarding friction** | HIGH | MEDIUM | Clear UX flow, faucet integration, future account abstraction |
| **Message encryption key management** | MEDIUM | MEDIUM | Use battle-tested libraries (tweetnacl, noble-secp256k1) |

### 9.3 Unknown Unknowns

1. **Arkiv rate limits** — unclear if the query API has rate limits at scale
2. **Brotli compression overhead** — impact on mobile performance for frequent writes
3. **SQLite query performance** — how does the query API perform with 100K+ entities and complex filters?
4. **WebSocket reliability** — are event subscriptions stable for long-lived connections?
5. **Multi-chain future** — if Arkiv launches multiple chains, which one to use?
6. **Arkiv governance** — who controls the sequencer? Can they censor transactions?
7. **Cost at scale** — testnet is free, but mainnet gas costs are unknown

---

## 10. Recommended Tech Stack

### 10.1 Frontend

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Framework** | Next.js 14+ (App Router) | SSR for public profiles, client components for interactive Trust Map |
| **Styling** | Tailwind CSS + shadcn/ui | Consistent design, fast iteration |
| **Graph Visualization** | `@react-sigma/core` or `react-force-graph-2d` | Built on graphology (sigma) or Three.js/D3. Sigma preferred for larger graphs. |
| **Graph Library** | `graphology` | In-memory graph with BFS, shortest path, clustering, serialization |
| **State Management** | Zustand or Jotai | Lightweight, works with React Server Components |
| **Local Storage** | `idb-keyval` (IndexedDB wrapper) | Cache profiles, connections, graph state |

### 10.2 Web3 / Arkiv Integration

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Arkiv SDK** | `@arkiv-network/sdk` | Official TypeScript SDK (Viem-based) |
| **Wallet Connection** | `RainbowKit` + `wagmi` | Best-in-class wallet UX, supports MetaMask/WalletConnect/Coinbase |
| **Auth (SIWE)** | `siwe` + `next-auth` | Sign-In with Ethereum for session management |
| **Chain** | Kaolin (L3, testnet) | Primary Arkiv testnet |

### 10.3 Encryption

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Symmetric Encryption** | AES-256-GCM (Web Crypto API) | Native browser API, fast, standard |
| **Key Exchange** | ECDH via secp256k1 | Same curve as Ethereum wallets — reuse existing keys |
| **Key Derivation** | HKDF (Web Crypto API) | Standard KDF for deriving encryption keys from shared secrets |
| **Crypto Library** | `@noble/secp256k1` + `@noble/hashes` | Audited, pure JS, no native dependencies |

### 10.4 Optional Backend Services

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Entity Renewal** | Vercel Cron / Cloudflare Worker | Periodic job to extend entity expirations. Needs a funded wallet. |
| **Full-Text Search** | Meilisearch (self-hosted) or Algolia | Index profiles for search. Syncs from Arkiv events. Post-MVP. |
| **Analytics** | Plausible or PostHog | Privacy-respecting usage analytics |

### 10.5 Development & Testing

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Language** | TypeScript (strict) | Type safety across frontend and Arkiv SDK |
| **Testing** | Vitest + Playwright | Unit tests + E2E browser tests |
| **Arkiv Local Dev** | Docker (testcontainers) | Arkiv Python SDK supports testcontainers; check if TS SDK has equivalent |
| **CI/CD** | GitHub Actions | Standard |
| **Deployment** | Vercel | Next.js native hosting, edge functions for cron |

---

## 11. Implementation Notes

### 11.1 Entity Renewal Strategy

Since all Arkiv entities expire, profiles and connections need periodic renewal:

```typescript
// Renewal worker (runs every 24 hours)
async function renewEntities(walletClient) {
  // Find entities expiring within 7 days
  const soonExpiring = await publicClient.buildQuery()
    .where([
      eq('app', 'rootgraph'),
      // Filter by expiration range — if Arkiv supports $expiration meta-attribute queries
    ])
    .fetch()

  // Batch extend all
  await walletClient.mutateEntities({
    extensions: soonExpiring.entities.map(e => ({
      entityKey: e.key,
      expiresIn: ExpirationTime.fromDays(365)
    }))
  })
}
```

**Problem**: Only the owner can extend their entities. A centralized renewal service can't extend entities on behalf of users unless it has their keys.

**Solutions:**
1. **Client-side renewal**: The app extends entities when the user is online (on login, periodic background task)
2. **Long expiration**: Set initial expiration to 1 year; user needs to log in at least once per year
3. **Delegation (future)**: If Arkiv adds PUBLIC_EXTENSION flag (mentioned in their roadmap), anyone can extend

**Recommended for MVP**: Set expiration to 365 days. Client-side renewal on login. Alert users if they haven't logged in for 300+ days.

### 11.2 Optimistic UI

Since Arkiv writes take ~2 seconds (block time), use optimistic updates:

```typescript
async function sendConnectionRequest(toWallet: string) {
  // 1. Optimistically update UI immediately
  updateUI({ status: 'pending', toUser: toWallet })

  // 2. Send transaction in background
  try {
    const { entityKey } = await walletClient.createEntity({ ... })
    // 3. Confirm with real entity key
    updateUI({ status: 'pending', entityKey })
  } catch (error) {
    // 4. Rollback on failure
    rollbackUI()
    showError('Transaction failed')
  }
}
```

### 11.3 Namespace Isolation

All RootGraph entities include `app = "rootgraph"` attribute. This ensures:
- Queries only return RootGraph data (not other apps on the same chain)
- Multiple apps can coexist on the same Arkiv chain
- Future: could support cross-app interoperability by querying other app namespaces

---

## 12. Summary of Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Graph traversal | Client-side (graphology) | Arkiv has no native graph; client-side is sufficient for MVP scale |
| Privacy (Selective) | App-enforced filtering | Encryption too complex for MVP; soft privacy is acceptable |
| Privacy (Private) | E2E encryption (AES-256-GCM) | Strong guarantee for users who explicitly want privacy |
| Connection model | Single entity per connection | Simpler than dual-entity; owned by initiator |
| Username uniqueness | Earliest-block-wins | No unique constraints in Arkiv; app-level enforcement |
| Messages | E2E encrypted, 90-day expiry | Required since Arkiv data is public |
| Entity renewal | Client-side on login, 365-day TTL | Can't delegate to server without user keys |
| Authentication | SIWE (Sign-In with Ethereum) | Native Web3 auth, no separate auth system |
| Graph visualization | Sigma.js / graphology | Mature, performant, good for medium-sized graphs |
| Wallet UX | RainbowKit | Best-in-class, supports major wallets |

---

## Appendix A: Arkiv Query Cheat Sheet for RootGraph

```
// Find a user by username
entityType = "profile" && app = "rootgraph" && username = "lupo0x"

// Find all connections for a wallet
entityType = "connection" && app = "rootgraph" && (userA = "0x..." || userB = "0x...")

// Find pending connection requests TO a user
entityType = "connection-request" && app = "rootgraph" && toUser = "0x..." && status = "pending"

// Find messages in a conversation
entityType = "message" && app = "rootgraph" && conversationId = "0xaaa-0xbbb"

// Find all members of a community
entityType = "community-member" && app = "rootgraph" && communityKey = "0x..."

// Find recent activity for a user
entityType = "activity" && app = "rootgraph" && actor = "0x..."

// Find all public communities
entityType = "community" && app = "rootgraph" && visibility = "public"
```

---

## Appendix B: Risk Matrix

```
           Impact →
           Low    Medium   High
         ┌────────┬────────┬────────┐
 High    │        │ Wallet │ Testnet│
Likelih. │        │ UX     │ Only   │
         ├────────┼────────┼────────┤
 Medium  │        │Username│ Query  │
         │        │ Races  │ Perf   │
         ├────────┼────────┼────────┤
 Low     │        │ SDK    │Sequencr│
         │        │ Changes│ Failure│
         └────────┴────────┴────────┘
```

---

*End of Integration Architecture Document*
