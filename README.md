# RootGraph — The On-Chain Job Board

RootGraph is a decentralized professional network and job board built on the [Arkiv Network](https://arkiv.network). Post jobs, hire from your trust network, and build a portable professional reputation — all stored on-chain.

Built for the **Arkiv Web3 Database Builders Challenge 2026**.

## Features

- **On-Chain Job Board** — Post and discover jobs stored as Arkiv entities. Listings are transparent, censorship-resistant, and queryable by any app.
- **Trust-Based Hiring** — Hire from your connection graph. Connections are cryptographically verified on-chain.
- **Decentralized Profiles** — Your professional identity lives on Arkiv. You own it completely.
- **Interactive Trust Map** — Visualize the entire network as a force-directed graph.
- **Portable Reputation** — Your trust graph is composable. Other apps can read your data directly from Arkiv.

## Arkiv Integration

RootGraph stores **all data** as Arkiv entities on the Kaolin testnet (L2 on Hoodi). There is no traditional database.

### Entity Types

| Entity | Attributes | Description |
|---|---|---|
| `profile` | `wallet`, `username`, `entityType`, `app` | User professional profiles with display name, position, company, tags |
| `connection` | `userA`, `userB`, `entityType`, `app` | Bidirectional trust connections between wallets |
| `connection-request` | `fromWallet`, `toWallet`, `status`, `entityType`, `app` | Pending connection requests |
| `job` | `postedBy`, `status`, `isActive`, `entityType`, `app` | Job postings with title, company, location, description, tags, remote flag |
| `job-application` | `jobKey`, `applicantWallet`, `entityType`, `app` | Expressions of interest linking applicants to jobs |

### SDK Usage

- **`@arkiv-network/sdk`** — Entity creation, updates, and queries via `createPublicClient` and `createWalletClient`
- **`@arkiv-network/sdk/query`** — `eq()` for attribute-based filtering
- **`@arkiv-network/sdk/utils`** — `jsonToPayload()` for entity payloads, `ExpirationTime` for TTLs
- **`@arkiv-network/sdk/chains`** — `kaolin` chain config (chain ID `60138453025`)

All queries use the `buildQuery()` API with attribute filters. Profiles and connections expire after 2 years; jobs and applications after 90 days; connection requests after 30 days.

### Data Flow

```
User Action → Privy Wallet → Arkiv SDK → Kaolin Testnet (on-chain)
                                ↓
                        Query via buildQuery()
                                ↓
                        Attribute-based filtering (eq)
                                ↓
                        JSON payload deserialization
```

## Tech Stack

- **Next.js 14** (App Router) — Framework
- **Arkiv SDK** (`@arkiv-network/sdk` v0.6.2) — On-chain data layer
- **Privy** (`@privy-io/react-auth`) — Wallet connection and authentication
- **Zustand** — Client-side state management
- **Tailwind CSS** + **shadcn/ui** — Styling and components
- **react-force-graph-2d** — Trust map visualization
- **TypeScript** — Full type safety

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/rootgraph-arkiv-mvp.git
cd rootgraph-arkiv-mvp/app

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local and add your Privy App ID (get one at https://dashboard.privy.io/)

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run seed` | Seed demo data on Kaolin testnet |
| `npm run test:jobs` | Run job board integration tests against Kaolin |

## Project Structure

```
app/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Landing page
│   │   └── (app)/
│   │       ├── layout.tsx              # App shell with sidebar nav
│   │       ├── dashboard/page.tsx      # Dashboard with stats
│   │       ├── jobs/
│   │       │   ├── page.tsx            # Job board listing
│   │       │   ├── post/page.tsx       # Post a job form
│   │       │   └── [id]/
│   │       │       ├── page.tsx        # Job detail + applications
│   │       │       └── edit/page.tsx   # Edit job form
│   │       ├── search/page.tsx         # Search profiles
│   │       ├── connections/page.tsx    # Manage connections
│   │       ├── profile/[wallet]/       # Public profile view
│   │       ├── trustmap/page.tsx       # Interactive trust graph
│   │       └── settings/page.tsx       # Edit own profile
│   ├── lib/
│   │   ├── arkiv.ts                    # All Arkiv SDK operations
│   │   ├── store.ts                    # Zustand state management
│   │   └── utils.ts                    # Utility functions
│   ├── providers/
│   │   └── arkiv-provider.tsx          # Wallet client context
│   ├── hooks/                          # Custom React hooks
│   └── components/ui/                  # shadcn/ui components
├── scripts/
│   ├── seed-demo.ts                    # Demo data seeder
│   └── test-jobs.ts                    # Job board integration tests
└── package.json
```

## Network

- **Chain**: Kaolin (Arkiv L2 on Hoodi)
- **Chain ID**: `60138453025`
- **RPC**: `https://kaolin.hoodi.arkiv.network/rpc`
- **Explorer**: `https://explorer.kaolin.hoodi.arkiv.network`
- **Faucet**: `https://kaolin.hoodi.arkiv.network/faucet/`

## License

MIT — see [LICENSE](./LICENSE)
