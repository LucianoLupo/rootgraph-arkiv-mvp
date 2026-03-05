# RootGraph — The On-Chain Job Board

RootGraph is a decentralized professional network and job board built on the [Arkiv Network](https://arkiv.network). Post jobs, hire from your trust network, and build a portable professional reputation — all stored on-chain.

Built for the **Arkiv Web3 Database Builders Challenge 2026**.

## Screenshots

**Landing Page** — The main entry point with feature overview and animated trust graph preview.

![Landing Page](app/public/screenshots/landing.png)

**Job Board** — Browse on-chain job listings with salary, tags, remote filter, and description search.

![Job Board](app/public/screenshots/jobs.png)

## Features

- **On-Chain Job Board** — Post and discover jobs stored as Arkiv entities. Listings are transparent, censorship-resistant, and queryable by any app.
- **Trust-Based Hiring** — Hire from your connection graph. Connections are cryptographically verified on-chain.
- **Decentralized Profiles** — Your professional identity lives on Arkiv. You own it completely.
- **Company Profiles** — Create and manage company pages with name, description, website, and tags. Publicly viewable by wallet address.
- **Salary Display** — Job listings include optional salary information for transparency.
- **Community Flagging** — Flag suspicious job listings for community review with on-chain accountability.
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
| `job` | `postedBy`, `status`, `isActive`, `entityType`, `app` | Job postings with title, company, location, description, tags, salary, remote flag |
| `job-application` | `jobKey`, `applicantWallet`, `entityType`, `app` | Expressions of interest linking applicants to jobs |
| `company` | `wallet`, `entityType`, `app` | Company profiles with name, description, website, tags |
| `job-flag` | `jobKey`, `flaggerWallet`, `entityType`, `app` | Community flags on suspicious job listings |

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

## Privacy Layer

RootGraph includes a full privacy layer for salary encryption, encrypted application messages, and ZK salary range proofs. For the complete technical deep-dive, see **[PRIVACY.md](./PRIVACY.md)**.

### Summary

| Feature | Technique | Status |
|---------|-----------|--------|
| **Encrypted Salary** | NaCl `secretbox` (XSalsa20-Poly1305) | Working |
| **Public Salary Range** | Auto-calculated bracket (e.g., $150k-$200k) | Working |
| **Encrypted Messages** | NaCl `box` (X25519 ECDHE) | Working |
| **Key Derivation** | Wallet signature -> HKDF -> NaCl keypair + symmetric key | Working |
| **ZK Range Proofs** | Noir circuit + Barretenberg SNARK | Compiled, graceful degradation |

- **Key derivation:** User signs a deterministic message -> HKDF derives an X25519 keypair (messaging) and a symmetric key (salary). Keys cached in `sessionStorage`, cleared on tab close.
- **Encrypted salary:** Exact amount encrypted with secretbox; only the poster can decrypt. A public range bracket is auto-calculated and stored alongside.
- **ZK proofs:** A Noir circuit proves salary falls within the stated range without revealing the amount. Currently degrades gracefully due to library version constraints.
- **Encrypted messages:** NaCl box between applicant and poster with context binding. Messages are omitted (never sent in plaintext) if the poster lacks encryption.

### On-Chain Evidence

- **Profile with encryption key:** [explorer](https://explorer.kaolin.hoodi.arkiv.network/entity/0xcde6af5c3fd8073df01a4f8d6a9ba112323d6df5357b1bbd8f8faf1645a555c6)
- **Job with encrypted salary:** [explorer](https://explorer.kaolin.hoodi.arkiv.network/entity/0xe1dbdd34f8f37fc7271f429d654197536730a12906d56cd911f8a543ae2114e5)

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
git clone https://github.com/LucianoLupo/rootgraph-arkiv-mvp.git
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
│   │       ├── company/page.tsx        # Company profile management
│   │       ├── company/[wallet]/page.tsx # Public company view
│   │       ├── profile/[wallet]/       # Public profile view
│   │       ├── trustmap/page.tsx       # Interactive trust graph
│   │       └── settings/page.tsx       # Edit own profile + encryption
│   ├── lib/
│   │   ├── arkiv.ts                    # All Arkiv SDK operations
│   │   ├── crypto.ts                   # Encryption primitives (HKDF, NaCl)
│   │   ├── zk.ts                       # ZK proof generation (Noir)
│   │   ├── store.ts                    # Zustand state management
│   │   └── utils.ts                    # Utility functions
│   ├── providers/
│   │   ├── arkiv-provider.tsx          # Wallet client context
│   │   └── crypto-provider.tsx         # Encryption key lifecycle
│   ├── hooks/
│   │   └── use-crypto.ts              # Encrypt/decrypt consumer hook
│   └── components/ui/                  # shadcn/ui components
├── noir/
│   └── salary_range/src/main.nr        # ZK salary range circuit (Noir)
├── public/circuits/
│   └── salary_range.json               # Compiled circuit artifact
├── scripts/
│   ├── seed-demo.ts                    # Demo data seeder
│   ├── seed-jobs-companies.ts          # Seed companies, jobs, and flags
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
