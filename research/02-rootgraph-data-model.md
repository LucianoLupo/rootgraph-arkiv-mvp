# RootGraph Data Model & Feature Analysis

**Date:** 2026-03-01  
**Source:** UI analysis of https://www.rootgraph.xyz/  
**Purpose:** Map complete data model for decentralization onto Arkiv Network

---

## 1. Overview

RootGraph is a professional networking platform built around **trust-based connections**. Unlike LinkedIn's superficial connections, RootGraph emphasizes meaningful relationships through a visual "Trust Map" — a graph visualization showing how users are connected. The platform includes privacy controls, communities, messaging, and wallet integration.

**Current Stack (assumed):** Supabase (PostgreSQL + Auth + Realtime + Storage)

---

## 2. Core Entities

### 2.1 User (Profile)

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `username` | string | Unique handle, e.g., `@lupo0x` |
| `display_name` | string | Full name |
| `avatar_url` | string | Profile image URL |
| `company` | string | Optional employer |
| `position` | string | Job title, e.g., "Software engineer" |
| `tags` | string[] | Self-selected descriptors: "deep", "intentional", "grounded" |
| `privacy_level` | enum | `open` (100%), `selective` (60%), `private` (30%) |
| `wallet_address` | string | Ethereum/crypto wallet address |
| `created_at` | timestamp | Account creation date |
| `updated_at` | timestamp | Last profile update |

### 2.2 Connected Accounts (Social Links)

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → User |
| `platform` | enum | `twitter`, `github`, `farcaster`, `telegram` |
| `handle` | string | Platform-specific username |
| `verified` | boolean | Whether the link is verified |
| `linked_at` | timestamp | When the account was linked |

### 2.3 Connection (Graph Edge)

The core relationship — a bidirectional link between two users.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `user_a_id` | UUID | FK → User (initiator) |
| `user_b_id` | UUID | FK → User (acceptor) |
| `status` | enum | `pending`, `connected`, `rejected`, `blocked` |
| `connected_at` | timestamp | When connection was established |
| `trust_score` | float | Optional weighted trust metric |
| `notes` | string | Optional private note about the connection |

**Key behavior:**
- Connections are **bidirectional** — if A connects to B, both see each other
- Connections form the **graph edges** displayed in the Trust Map
- "Total Connections" = count of `status = 'connected'` edges for a user
- "Network Growth" = new connections over time

### 2.4 Connection Request

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `from_user_id` | UUID | FK → User (requester) |
| `to_user_id` | UUID | FK → User (recipient) |
| `message` | string | Optional intro message |
| `status` | enum | `pending`, `accepted`, `rejected` |
| `created_at` | timestamp | When request was sent |
| `responded_at` | timestamp | When recipient responded |

### 2.5 Message

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `conversation_id` | UUID | Groups messages in a thread |
| `sender_id` | UUID | FK → User |
| `recipient_id` | UUID | FK → User |
| `content` | text | Message body |
| `read` | boolean | Whether recipient has read it |
| `created_at` | timestamp | When sent |

### 2.6 Community

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `name` | string | Community name |
| `description` | text | Community description |
| `creator_id` | UUID | FK → User |
| `visibility` | enum | `public`, `private`, `invite_only` |
| `created_at` | timestamp | When created |
| `member_count` | integer | Cached count |

### 2.7 Community Membership

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `community_id` | UUID | FK → Community |
| `user_id` | UUID | FK → User |
| `role` | enum | `member`, `admin`, `moderator` |
| `joined_at` | timestamp | When joined |

### 2.8 Activity Event

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → User (actor) |
| `event_type` | enum | `connection_made`, `community_joined`, `profile_updated`, `message_sent` |
| `target_id` | UUID | FK → related entity (user, community, etc.) |
| `target_type` | string | Entity type of target |
| `metadata` | JSON | Additional event data |
| `created_at` | timestamp | When event occurred |

### 2.9 Wallet

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → User |
| `address` | string | Wallet address |
| `chain` | string | Blockchain network |
| `is_primary` | boolean | Primary wallet flag |
| `connected_at` | timestamp | When connected |

---

## 3. Graph Structure (Trust Map)

The Trust Map is the core differentiator of RootGraph. It visualizes the **social graph** with:

### 3.1 Nodes
- Each **User** is a node
- Displayed as circles with initials or avatar
- Position determined by graph layout algorithm (force-directed)

### 3.2 Edges
- Each **Connection** is an edge between two nodes
- Edges represent trust/professional relationships
- Visual weight could indicate trust_score or connection strength

### 3.3 Trust Map Features
| Feature | Description |
|---------|-------------|
| **Filter by** | `Global` (all visible connections) or scoped view |
| **Exposure** | `Private` / `Selective` / `Open` — controls how much of YOUR graph others can see |
| **Cluster By** | `None`, or group by role/company/tags |
| **Role Highlight** | Toggle to color-code nodes by role |
| **Total Connections** | Count of all nodes in the visible graph |
| **Direct Links** | Count of your 1st-degree connections |
| **Upload** | Import connections from external sources |
| **Share Link** | Generate shareable link to your graph |
| **Learn Mode** | Educational overlay explaining the graph |

### 3.4 Graph Query Patterns

These are the key queries the backend must support:

1. **Get user's direct connections** — 1-hop neighbors
2. **Get connections of connections** — 2-hop neighbors (paths through mutual connections)
3. **Path finding** — How to reach user X through existing connections
4. **Clustering** — Group users by shared attributes (role, company, tags)
5. **Network growth over time** — Connections added per time period
6. **Mutual connections** — Common connections between two users
7. **Graph filtering** — Show only connections matching criteria
8. **Visibility filtering** — Respect privacy levels when showing graph to other users

---

## 4. Privacy & Visibility Model

RootGraph has a **three-tier privacy model** controlling how visible your profile is to others:

| Level | Visibility % | Description |
|-------|-------------|-------------|
| **Open** | 100% | Visible to anyone on the platform |
| **Selective** | 60% | Visible only when you are part of a connection path to the viewer |
| **Private** | 30% | Visible only to your direct trusted connections (roots) |

### 4.1 Visibility Rules

- **Open users**: Profile and connections visible to all authenticated users
- **Selective users**: Profile visible only if the viewer has a path to them through their connection graph (2+ hops away, but connected via chain of trust)
- **Private users**: Profile visible ONLY to direct (1st-degree) connections

### 4.2 Implications for Graph Queries

When User A views the Trust Map:
- All **Open** users' nodes are always visible
- **Selective** users appear only if a path exists from A to them
- **Private** users appear only if directly connected to A
- Edge information respects both endpoints' privacy levels

---

## 5. CRUD Operations

### 5.1 User Operations
- `createUser(profile)` — Register with wallet or social auth
- `updateUser(profile)` — Update profile fields
- `deleteUser()` — Remove account and connections
- `getUser(id)` — Fetch profile (respecting privacy)
- `searchUsers(query)` — Search by name, username, position, tags

### 5.2 Connection Operations
- `requestConnection(userId, message?)` — Send connection request
- `acceptConnection(requestId)` — Accept pending request
- `rejectConnection(requestId)` — Reject pending request
- `removeConnection(connectionId)` — Sever an existing connection
- `getConnections(userId)` — List all connections for a user
- `getMutualConnections(userA, userB)` — Shared connections

### 5.3 Trust Map Operations
- `getGraph(userId, depth?, filters?)` — Fetch visible graph from user's perspective
- `findPath(fromUser, toUser)` — Find connection chain between users
- `getNetworkGrowth(userId, timeRange)` — Growth metrics
- `getClusters(userId, clusterBy)` — Group graph by attribute

### 5.4 Message Operations
- `sendMessage(recipientId, content)` — Send message to connected user
- `getConversations(userId)` — List all conversations
- `getMessages(conversationId)` — Get messages in a thread
- `markRead(messageId)` — Mark message as read

### 5.5 Community Operations
- `createCommunity(name, description, visibility)` — Create community
- `joinCommunity(communityId)` — Join a community
- `leaveCommunity(communityId)` — Leave a community
- `getCommunityMembers(communityId)` — List members
- `getCommunities(userId?)` — List communities (user's or all public)

### 5.6 Activity Operations
- `logActivity(event)` — Record an activity event
- `getActivity(userId, timeRange?)` — Fetch user's activity feed
- `getNetworkActivity(userId)` — Activity from user's connections

---

## 6. Search Capabilities

The search feature needs to support:
- **User search**: By username, display name, company, position
- **Tag search**: Find users with specific tags
- **Connection search**: Search within your connections
- **Community search**: Find communities by name or description
- **Filtered search**: Combine multiple criteria

---

## 7. Realtime Requirements

Based on the Activity tab (showing badge with "2" notifications):
- **Connection requests**: Real-time notifications
- **Messages**: Real-time delivery
- **Activity feed**: Near-real-time updates
- **Network growth**: Can be periodic/cached

---

## 8. Data Relationships Diagram (Text)

```
User ──────────── ConnectedAccount (1:N)
  │
  ├── Connection ──── User (N:N via Connection entity)
  │
  ├── ConnectionRequest ──── User (N:N)
  │
  ├── Message ──── User (N:N via conversations)
  │
  ├── CommunityMembership ──── Community (N:N)
  │
  ├── ActivityEvent (1:N)
  │
  └── Wallet (1:N)
```

---

## 9. Estimated Data Volumes (for sizing)

For a modest professional network:

| Entity | Scale | Notes |
|--------|-------|-------|
| Users | 1K - 100K | Early stage |
| Connections | 5K - 500K | ~5-50 connections per user average |
| Messages | 10K - 1M | Moderate messaging usage |
| Communities | 10 - 1K | Smaller, focused groups |
| Activity Events | 50K - 5M | Multiple events per user per day |

---

## 10. Key Technical Challenges for Decentralization

1. **Graph traversal** — Finding paths between users requires efficient graph queries
2. **Privacy enforcement** — Visibility rules must be enforced at query time, not just client-side
3. **Real-time updates** — Notifications and messages need low latency
4. **Search** — Full-text search across user profiles
5. **Data ownership** — Each user should own their profile data
6. **Connection mutuality** — Both sides must agree to a connection (requires state machine)
7. **Expiring content** — Activity events could expire, but profiles and connections shouldn't
