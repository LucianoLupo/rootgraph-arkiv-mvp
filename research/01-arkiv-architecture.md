# Arkiv Network - Complete Architecture Research

**Date:** 2026-03-01  
**Researcher:** arkiv-researcher  
**Sources:** GitHub repos (21 cloned), source code analysis, SDK documentation

---

## 1. What is Arkiv?

**Arkiv** (formerly "Golem Base") is a **decentralized data layer** built as a modified OP Stack (Optimism) L2/L3 chain. It is **not** a general-purpose database or a traditional blockchain — it's a **purpose-built blockchain optimized for storing, querying, and managing structured data entities**.

### Key Identity
- **Modified Ethereum L2/L3 chain** — fork of op-geth (Optimism's execution client) with a custom storage layer baked into the state transition function
- **Entity-centric data model** — all data is stored as "entities" with payloads, typed attributes (string/numeric), ownership, and expiration
- **Built by the Golem Network team** — leverages Golem's infrastructure; previously named "Golem Base"
- **OP Stack architecture** — inherits Ethereum security guarantees via L2/L3 settlement

### What It's NOT
- Not a smart contract platform (no EVM execution for storage operations)
- Not IPFS/Filecoin (data is stored in-state, not content-addressed file storage)
- Not a traditional database (all writes are blockchain transactions)

---

## 2. Architecture Overview

### Chain Topology

```
Ethereum Mainnet (L1)
    └── Hoodi (Testnet L1)
         └── Erech (L2 - Chain ID: 393530)
              └── Kaolin (L3 - Chain ID: 60138453025) ← Primary data layer
```

Additional named chains (all testnets on Hoodi):
- **Kaolin** — `60138453025` — Primary testnet
- **Mendoza** — `60138453056`
- **Rosario** — `60138453057`
- **Marketplace** — `60138453027`

All chains use:
- **Block time:** 2 seconds
- **Native currency:** ETH
- **RPC pattern:** `https://{chain}.hoodi.arkiv.network/rpc`
- **WebSocket:** `wss://{chain}.hoodi.arkiv.network/rpc/ws`

### Core Components

```
┌─────────────────────────────────────────────┐
│  Applications (dPaste, CopyPal, WebDB, etc) │
├─────────────────────────────────────────────┤
│  SDKs (TypeScript, Python, Rust)            │
├──────────────┬──────────────────────────────┤
│  Query API   │  Block Explorer (Blockscout) │
│  (Go/SQLite) │                              │
├──────────────┴──────────────────────────────┤
│  arkiv-op-geth (Modified Execution Client)  │
│  ┌───────────────────────────────────────┐  │
│  │ Custom State Transition:              │  │
│  │ - Entity CRUD via precompile address  │  │
│  │ - Housekeeping (auto-expiration)      │  │
│  │ - Storage accounting                  │  │
│  └───────────────────────────────────────┘  │
├─────────────────────────────────────────────┤
│  arkiv-op-node (Consensus/Rollup Node)      │
├─────────────────────────────────────────────┤
│  Ethereum L1/L2 Settlement                  │
└─────────────────────────────────────────────┘
```

---

## 3. Data Model: Entities

Everything in Arkiv is an **Entity**. This is the fundamental data unit.

### Entity Structure

| Field | Type | Description |
|-------|------|-------------|
| `key` | `bytes32` (Hex) | Unique identifier, derived from `keccak256(txHash + payload + operationIndex)` |
| `payload` | `bytes` | Arbitrary binary data (JSON, text, images, etc.) |
| `contentType` | `string` | MIME type (e.g., `application/json`, `text/plain`, `image/png`) |
| `owner` | `address` | Ethereum address of the entity creator/owner |
| `expiresAtBlock` | `uint64` | Block number at which the entity auto-deletes |
| `createdAtBlock` | `uint64` | Block number when created |
| `lastModifiedAtBlock` | `uint64` | Block number of last modification |
| `transactionIndexInBlock` | `uint64` | Position in the block |
| `operationIndexInTransaction` | `uint64` | Position within a batch transaction |
| `stringAttributes` | `[]{ key, value }` | Indexed string key-value pairs |
| `numericAttributes` | `[]{ key, value }` | Indexed numeric key-value pairs |

### Entity Key Derivation

```go
key := crypto.Keccak256Hash(txHash.Bytes(), create.Payload, paddedOperationIndex)
```

The key is deterministic — same payload in the same transaction at the same index always produces the same key.

### Entity Metadata (On-Chain State)

Stored compactly in a single 32-byte EVM storage slot:
```go
type EntityMetaData struct {
    Owner          common.Address  // 20 bytes
    ExpiresAtBlock uint64          // 8 bytes (at offset 24)
}
```

### Attribute Rules
- Attribute keys must match regex: `[\p{L}_][\p{L}\p{N}_]*` (letters/underscores, no `$` or `0x` prefix)
- `$` prefix is reserved for system meta-attributes (`$owner`, `$key`, `$expiration`, `$sequence`, `$creator`)
- Same key can have both a string and numeric value, but not multiple values of the same type
- Max 1000 operations per transaction

---

## 4. Operations (CRUD)

### Write Operations

All writes are **blockchain transactions** sent to the Arkiv processor address:
```
ARKIV_ADDRESS = 0x00000000000000000000000000000061726b6976
```
("arkiv" in ASCII → `61726b6976`)

The transaction data is **Brotli-compressed RLP-encoded** operations:

| Operation | Description |
|-----------|-------------|
| **Create** | New entity with payload, attributes, contentType, BTL (blocks-to-live) |
| **Update** | Replace payload, attributes, contentType of existing entity (owner-only) |
| **Delete** | Remove entity (owner-only) |
| **Extend** | Extend expiration by additional blocks (owner-only) |
| **ChangeOwner** | Transfer entity ownership to another address |

### Batch Operations (mutateEntities)

All operations can be combined in a single atomic transaction:
```typescript
await client.mutateEntities({
  creates: [{ payload, attributes, contentType, expiresIn }],
  updates: [{ entityKey, payload, attributes, contentType, expiresIn }],
  deletes: [{ entityKey }],
  extensions: [{ entityKey, expiresIn }],
  ownershipChanges: [{ entityKey, newOwner }],
})
```

Execution order within a transaction: Creates → Deletes → Updates → Extensions → OwnershipChanges

### Transaction Flow (Write)

```
SDK (TS/Python)
  → Build operation payload
  → RLP encode
  → Brotli compress
  → Send as ETH transaction to ARKIV_ADDRESS
  
arkiv-op-geth (state_transition.go):
  → Detect destination == ARKIV_ADDRESS
  → Brotli decompress
  → RLP decode into ArkivTransaction
  → Validate (BTL > 0, annotations valid, etc.)
  → Execute operations against EVM state
  → Emit event logs
  → Update storage accounting
```

### Auto-Expiration (Housekeeping)

On every **deposit transaction** (L2→L3 bridge message), geth runs a housekeeping routine:
```go
// Iterates all entities scheduled to expire at current block
toDelete := entityexpiration.IteratorOfEntitiesToExpireAtBlock(blockNumber)
for _, key := range toDelete {
    entity.Delete(key)  // Removes from state
    emit ArkivEntityExpired(key, owner)
}
```

This means entities automatically expire and are garbage collected without any user action.

---

## 5. Query System

### Architecture

Queries are NOT executed on the EVM. Instead, a separate **Query API** service:

1. **arkiv-events** (Go) — reads blocks from the chain, extracts entity events
2. **sqlite-store** (Go) — indexes events into SQLite tables
3. **query-api** (Go) — exposes `arkiv_query` RPC method, parses query language, generates SQL

### SQLite Schema

```sql
-- String attributes with temporal validity
CREATE TABLE string_attributes (
    entity_key BLOB NOT NULL,
    from_block INTEGER NOT NULL,
    to_block INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (entity_key, key, from_block)
);

-- Numeric attributes with temporal validity
CREATE TABLE numeric_attributes (
    entity_key BLOB NOT NULL,
    from_block INTEGER NOT NULL,
    to_block INTEGER NOT NULL,
    key TEXT NOT NULL,
    value INTEGER NOT NULL,
    PRIMARY KEY (entity_key, key, from_block)
);

-- Payloads with temporal validity
CREATE TABLE payloads (
    entity_key BLOB NOT NULL,
    from_block INTEGER NOT NULL,
    to_block INTEGER NOT NULL,
    payload BLOB NOT NULL,
    content_type TEXT NOT NULL DEFAULT '',
    string_attributes TEXT NOT NULL DEFAULT '{}',
    numeric_attributes TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (entity_key, from_block)
);
```

All tables use **temporal validity** (`from_block`, `to_block`) for point-in-time queries.

### Query Language

Custom SQL-like language parsed with [participle](https://github.com/alecthomas/participle):

**Comparison Operators:** `=`, `!=`, `>`, `>=`, `<`, `<=`  
**Logical Operators:** `&&` / `AND`, `||` / `OR`, `!` / `NOT`  
**Pattern Matching:** `~` (GLOB), `!~` (NOT GLOB)  
**Meta-attributes:** `$owner`, `$key`, `$expiration`, `$sequence`, `$creator`  
**Grouping:** Parentheses  

Examples:
```
category = "documentation" && $owner = 0x6186B0...
type = "user" && (status = "active" || status = "pending")
age >= 18 && age < 65
name ~ "John*"
```

### Query via SDK

**TypeScript (QueryBuilder pattern):**
```typescript
const result = await client.buildQuery()
  .where([eq('token', 'bitcoin'), eq('type', 'price')])
  .ownedBy('0x...')
  .withPayload(true)
  .withAttributes(true)
  .withMetadata(true)
  .orderBy('timestamp', 'number', 'desc')
  .limit(10)
  .fetch()

// Pagination
if (result.hasNextPage()) {
  await result.next()
}
```

**Python (Expression builder):**
```python
from arkiv import Arkiv, StrAttr, IntAttr, IntSort, DESC

token = StrAttr("token")
age = IntAttr("age")

results = client.arkiv.select() \
    .where((token == "bitcoin") & (age >= 18)) \
    .order_by(IntSort("age", DESC)) \
    .limit(10) \
    .fetch()
```

**Raw query string:**
```python
entities = client.arkiv.query_entities('type = "user" && status = "active"')
```

### Query Options

| Option | Description |
|--------|-------------|
| `includeData` | Bitmask: key, attributes, payload, contentType, expiration, owner, etc. |
| `orderBy` | Sort by string or numeric attributes, asc/desc |
| `resultsPerPage` | Pagination size |
| `cursor` | Opaque pagination cursor |
| `atBlock` | Pin query to a specific block height (point-in-time) |

---

## 6. Authentication & Identity

### Wallet-Based Identity
- All operations use **Ethereum wallets** (private keys / MetaMask / any EIP-1193 provider)
- Entity ownership is an Ethereum address
- Only the owner can update, delete, extend, or transfer an entity
- No custom auth system — it's standard Ethereum transaction signing

### Client Types

| Client Type | Auth Required | Capabilities |
|-------------|---------------|--------------|
| **PublicClient** | No | Read: getEntity, buildQuery, query, getEntityCount, getBlockTiming, subscribeEntityEvents |
| **WalletClient** | Private key | Write: createEntity, updateEntity, deleteEntity, extendEntity, changeOwnership, mutateEntities |

### Access Control
- **Owner-based** — entity creator is the owner
- **Transferable** — ownership can be transferred via `changeOwnership`
- **No ACLs** — no role-based access control; all entities are publicly readable
- **All entities are public** — anyone can read any entity (like a public blockchain)

---

## 7. SDKs & APIs

### TypeScript SDK (`@arkiv-network/sdk`)
- **Based on:** Viem (re-exports all of Viem)
- **Install:** `npm install @arkiv-network/sdk`
- **Features:** PublicClient, WalletClient, QueryBuilder, event subscriptions, Brotli compression, ExpirationTime helpers
- **Browser support:** Works via CDN (esm.sh) with brotli-wasm for compression
- **Subpath exports:** `@arkiv-network/sdk/chains`, `@arkiv-network/sdk/query`, `@arkiv-network/sdk/utils`, `@arkiv-network/sdk/accounts`

### Python SDK (`arkiv-sdk`)
- **Based on:** Web3.py
- **Install:** `pip install --pre arkiv-sdk`
- **Features:** Sync + Async APIs, ProviderBuilder, QueryBuilder with `StrAttr`/`IntAttr` typed expressions, batch operations, event watching, testcontainers for testing
- **Pattern:** `client.arkiv.*` — extends Web3.py's module pattern

### Rust SDK (`arkiv-sdk-rust`)
- Listed but not deeply examined; likely early stage

### Custom RPC Methods

| Method | Description |
|--------|-------------|
| `arkiv_query` | Query entities with filter string and options |
| `arkiv_getBlockTiming` | Get current block, block time, block duration |
| `arkiv_getEntityCount` | Count all active entities |

Plus all standard Ethereum JSON-RPC methods (eth_*, net_*, etc.)

---

## 8. Events System

### Event Types (Emitted as EVM Logs)

| Event | Topics | Data |
|-------|--------|------|
| `ArkivEntityCreated` | entityKey, owner | expirationBlock, cost |
| `ArkivEntityUpdated` | entityKey, owner | oldExpiration, newExpiration, cost |
| `ArkivEntityDeleted` | entityKey, owner | — |
| `ArkivEntityExpired` | entityKey, owner | entityKey (data) |
| `ArkivEntityBTLExtended` | entityKey, owner | oldExpiration, newExpiration, cost |
| `ArkivEntityOwnerChanged` | entityKey, oldOwner, newOwner | — |

### Subscribing to Events

**TypeScript:**
```typescript
const unsubscribe = await client.subscribeEntityEvents({
  onEntityCreated: (event) => console.log('Created:', event.entityKey),
  onEntityUpdated: (event) => console.log('Updated:', event.entityKey),
  onEntityDeleted: (event) => console.log('Deleted:', event.entityKey),
  onEntityExpired: (event) => console.log('Expired:', event.entityKey),
  onEntityExpiresInExtended: (event) => console.log('Extended:', event.entityKey),
}, pollingInterval, fromBlock)
```

**Python:**
```python
filter = client.arkiv.watch_entity_created(callback, from_block=0)
# ... later
filter.stop()
filter.uninstall()
```

---

## 9. Consensus & Replication

- **OP Stack Rollup** — Arkiv IS an Optimism chain. Consensus comes from the OP Stack:
  - **Sequencer** produces blocks (2-second block time)
  - **Batch submissions** to L1 for data availability
  - **Fault proofs** for settlement on L1
- **No custom consensus** — inherits Ethereum's security model via the rollup
- **Single sequencer** (currently) — centralized block production, decentralized verification

---

## 10. How to Set Up and Interact

### Quick Start (TypeScript)

```bash
mkdir my-arkiv-app && cd my-arkiv-app
npm init -y
npm install @arkiv-network/sdk
```

```typescript
import { createPublicClient, createWalletClient, http } from "@arkiv-network/sdk"
import { privateKeyToAccount } from "@arkiv-network/sdk/accounts"
import { kaolin } from "@arkiv-network/sdk/chains"
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk/utils"
import { eq } from "@arkiv-network/sdk/query"

// Read (no private key needed)
const publicClient = createPublicClient({ chain: kaolin, transport: http() })
const entity = await publicClient.getEntity('0x...')

// Write (requires funded wallet)
const walletClient = createWalletClient({
  chain: kaolin,
  transport: http(),
  account: privateKeyToAccount('0x...')
})

const { entityKey, txHash } = await walletClient.createEntity({
  payload: jsonToPayload({ hello: "world" }),
  contentType: 'application/json',
  attributes: [{ key: 'type', value: 'greeting' }],
  expiresIn: ExpirationTime.fromDays(30),
})

// Query
const result = await publicClient.buildQuery()
  .where(eq('type', 'greeting'))
  .withPayload(true)
  .limit(10)
  .fetch()
```

### Quick Start (Python)

```bash
pip install --pre arkiv-sdk
```

```python
from arkiv import Arkiv

client = Arkiv()  # Auto-starts local node via testcontainers
entity_key, receipt = client.arkiv.create_entity(
    payload=b"Hello World!",
    content_type="text/plain",
    attributes={"type": "greeting", "version": 1},
    expires_in=client.arkiv.to_seconds(days=1)
)
```

### Getting Testnet ETH

1. Get Holesky ETH from faucets
2. Bridge to L2 "Erech" by sending to `0x54D6C1435ac7B90a5d46d01EE2f22Ed6fF270ED3`
3. Bridge to L3 "Kaolin" by sending to `0x5c857718caea1f6e9b0a7adf1415d0b98b6498d0`
4. Or use direct faucet: `https://kaolin.hoodi.arkiv.network/faucet/`

---

## 11. Limitations

### Current Limitations
1. **No native graph queries** — no built-in support for relationships/edges between entities; must be modeled via attributes (e.g., `replyTo` attribute pointing to parent entity key)
2. **Entity size limits** — payloads are bounded (appears to be ~100KB based on chunking middleware); large files need chunking
3. **All data is public** — no encryption or access control at the protocol level; anyone can read any entity
4. **Entities expire** — all entities MUST have an expiration (BTL > 0); no permanent storage without periodic extension
5. **Single sequencer** — centralized block production (standard OP Stack limitation)
6. **Testnet only** — no production/mainnet deployment yet (as of March 2026)
7. **No full-text search** — query language supports GLOB patterns but not full-text search
8. **No joins** — queries can only filter within a single entity type; no cross-entity joins
9. **No complex aggregations** — no GROUP BY, COUNT BY, SUM, etc. in the query language
10. **Max 1000 operations per transaction**
11. **No offline verification** — cannot cryptographically verify entity data without querying the chain (noted in roadmap as desired feature)
12. **No creation flags yet** — planned features like READ_ONLY and PUBLIC_EXTENSION not implemented yet

### Data Modeling Constraints
- Relationships between entities must be modeled as attributes (e.g., forum replies use `replyTo` attribute)
- No foreign keys or referential integrity
- No schema enforcement — attributes are schemaless key-value pairs
- Attribute values are either strings or uint64 numbers (no nested objects, arrays, booleans, or floats)

---

## 12. Example Applications Built on Arkiv

### Official Showcases

| App | Description | Tech |
|-----|-------------|------|
| **dPaste** | Decentralized pastebin with syntax highlighting, TTL, and password encryption | Next.js + MetaMask |
| **CopyPal** | Cross-device clipboard with email notifications | React + Node.js backend |
| **FileDB** | File chunking middleware (up to 50MB, 32KB chunks, SHA-256 integrity) | TypeScript |
| **WebDB** | Decentralized static web hosting | Node.js + Docker |
| **ImageDB** | Image chunking middleware for large images | TypeScript |
| **DrawioDB** | Decentralized diagram editor (draw.io integration) | JavaScript |
| **UmamiDB** | Privacy-first web analytics with Arkiv backup | JavaScript |
| **Online Forum** | Forum with posts and replies, demonstrates relationship modeling | Next.js + RainbowKit + DaisyUI |
| **Crypto Dashboard** | Real-time BTC/ETH/GLM price dashboard | Node.js backend + Vanilla JS frontend |
| **Portfolio** | Showcase site of Arkiv use cases | TypeScript |

### Data Modeling Pattern (Forum Example)

Posts:
```typescript
await walletClient.createEntity({
  payload: jsonToPayload({ title, content }),
  contentType: "application/json",
  attributes: [
    { key: "project", value: "my-forum" },
    { key: "entityType", value: "post" },
  ],
  expiresIn: ExpirationTime.fromDays(30),
})
```

Replies (linking to parent via attribute):
```typescript
await walletClient.createEntity({
  payload: jsonToPayload({ content }),
  contentType: "application/json",
  attributes: [
    { key: "project", value: "my-forum" },
    { key: "entityType", value: "reply" },
    { key: "replyTo", value: postEntityKey },  // <-- relationship via attribute
  ],
  expiresIn: ExpirationTime.fromDays(30),
})
```

Fetching replies for a post:
```typescript
const result = await publicClient.buildQuery()
  .where([
    eq("project", "my-forum"),
    eq("entityType", "reply"),
    eq("replyTo", postId),  // <-- filter by parent
  ])
  .withPayload(true)
  .withMetadata(true)
  .limit(50)
  .fetch()
```

---

## 13. Key Technical Details

### Transaction Encoding

```
Application Data → JSON/binary
  → RLP Encode (creates, updates, deletes, extensions, ownershipChanges)
  → Brotli Compress (max 20MB decompressed)
  → Send as calldata to ARKIV_ADDRESS
```

### State Storage

Entity metadata is stored in EVM state storage slots under the `ArkivProcessorAddress`:
- Account is auto-created if not exists
- Uses standard EVM `GetState`/`SetState` interface
- Entity expiration tracking uses a keyset data structure (array + hashmap)

### Storage Accounting

The `SlotUsageCounter` tracks total storage slots used, providing a gauge of chain utilization.

### Query Execution Path

```
SDK buildQuery() → construct predicate string → arkiv_query RPC
  → query-api parses with participle grammar
  → Normalizes to DNF (Disjunctive Normal Form)
  → Generates SQL JOINs across string_attributes, numeric_attributes, payloads tables
  → Executes against SQLite
  → Returns paginated results with cursor
```

---

## 14. Summary for RootGraph Integration

### What Arkiv Provides
- ✅ **Decentralized entity storage** with ownership and expiration
- ✅ **Queryable attributes** (string and numeric) with SQL-like filtering
- ✅ **CRUD operations** — create, read, update, delete entities
- ✅ **Batch operations** — atomic multi-operation transactions
- ✅ **Event system** — real-time entity lifecycle events
- ✅ **SDKs** — TypeScript (Viem-based) and Python (Web3.py-based)
- ✅ **Wallet-based auth** — standard Ethereum wallets
- ✅ **Pagination** — cursor-based with configurable page size

### What Arkiv Does NOT Provide (Must Build in App Layer)
- ❌ **Graph relationships** — no native edges/vertices; model via attributes
- ❌ **Schema validation** — no enforced schemas; validate in application
- ❌ **Access control** — all entities are publicly readable
- ❌ **Complex queries** — no JOINs, aggregations, or full-text search
- ❌ **Large file storage** — needs chunking middleware
- ❌ **Permanent storage** — all entities require expiration
