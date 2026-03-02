/**
 * RootGraph Demo Seed Script
 *
 * Creates 10 demo profiles with realistic data, connections forming an
 * interesting graph topology, and some activity events on Arkiv's Kaolin testnet.
 *
 * PREREQUISITES:
 *   1. Each wallet needs testnet ETH. Use the faucet:
 *      https://kaolin.hoodi.arkiv.network/faucet/
 *   2. Fund the first few wallets (at minimum wallets 0-4) with testnet ETH
 *      since they create the most entities.
 *
 * Usage:
 *   npx tsx scripts/seed-demo.ts
 *
 * The script uses deterministic private keys so the same wallets are
 * generated every run. You only need to fund them once.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
} from '@arkiv-network/sdk'
import { privateKeyToAccount } from '@arkiv-network/sdk/accounts'
import { kaolin } from '@arkiv-network/sdk/chains'
import { eq } from '@arkiv-network/sdk/query'
import { ExpirationTime, jsonToPayload } from '@arkiv-network/sdk/utils'

const APP_TAG = 'rootgraph'
const PROFILE_EXPIRY = ExpirationTime.fromYears(2)
const CONNECTION_EXPIRY = ExpirationTime.fromYears(2)
const REQUEST_EXPIRY = ExpirationTime.fromDays(30)
const ACTIVITY_EXPIRY = ExpirationTime.fromDays(90)

// Deterministic private keys for reproducible demo wallets
// These are TESTNET-ONLY keys — never use for real funds
const PRIVATE_KEYS: Hex[] = [
  '0x0000000000000000000000000000000000000000000000000000000000000001',
  '0x0000000000000000000000000000000000000000000000000000000000000002',
  '0x0000000000000000000000000000000000000000000000000000000000000003',
  '0x0000000000000000000000000000000000000000000000000000000000000004',
  '0x0000000000000000000000000000000000000000000000000000000000000005',
  '0x0000000000000000000000000000000000000000000000000000000000000006',
  '0x0000000000000000000000000000000000000000000000000000000000000007',
  '0x0000000000000000000000000000000000000000000000000000000000000008',
  '0x0000000000000000000000000000000000000000000000000000000000000009',
  '0x000000000000000000000000000000000000000000000000000000000000000a',
]

const DEMO_PROFILES = [
  {
    username: 'alice.chen',
    displayName: 'Alice Chen',
    position: 'Product Designer',
    company: 'Arkiv Network',
    tags: ['creative', 'intentional', 'builder'],
  },
  {
    username: 'bob.martinez',
    displayName: 'Bob Martinez',
    position: 'Smart Contract Developer',
    company: 'Freelance',
    tags: ['builder', 'analytical', 'deep'],
  },
  {
    username: 'carol.wu',
    displayName: 'Carol Wu',
    position: 'Research Scientist',
    company: 'MIT Media Lab',
    tags: ['deep', 'analytical', 'grounded'],
  },
  {
    username: 'david.kim',
    displayName: 'David Kim',
    position: 'DevRel Engineer',
    company: 'Ethereum Foundation',
    tags: ['builder', 'creative', 'grounded'],
  },
  {
    username: 'eve.johnson',
    displayName: 'Eve Johnson',
    position: 'Founder',
    company: 'TrustLayer',
    tags: ['intentional', 'builder', 'creative'],
  },
  {
    username: 'frank.osei',
    displayName: 'Frank Osei',
    position: 'Protocol Engineer',
    company: 'Arkiv Network',
    tags: ['analytical', 'builder', 'deep'],
  },
  {
    username: 'grace.li',
    displayName: 'Grace Li',
    position: 'Community Lead',
    company: 'RootGraph DAO',
    tags: ['intentional', 'grounded', 'creative'],
  },
  {
    username: 'hassan.ali',
    displayName: 'Hassan Ali',
    position: 'Security Researcher',
    company: 'OpenZeppelin',
    tags: ['analytical', 'deep', 'grounded'],
  },
  {
    username: 'iris.nakamura',
    displayName: 'Iris Nakamura',
    position: 'Full Stack Engineer',
    company: 'Vercel',
    tags: ['builder', 'creative', 'analytical'],
  },
  {
    username: 'james.rivera',
    displayName: 'James Rivera',
    position: 'Tokenomics Researcher',
    company: 'Delphi Digital',
    tags: ['deep', 'analytical', 'intentional'],
  },
]

// Graph topology: clusters with bridge nodes
// Cluster 1 (Arkiv team): Alice(0), Frank(5), Grace(6)
// Cluster 2 (Ethereum/Web3): Bob(1), David(3), Hassan(7)
// Cluster 3 (Research/Founders): Carol(2), Eve(4), James(9)
// Bridge nodes: Iris(8) connects clusters 1↔2, Eve(4) connects clusters 2↔3
const CONNECTIONS: [number, number][] = [
  // Cluster 1: Arkiv team (tight-knit)
  [0, 5], // Alice ↔ Frank
  [0, 6], // Alice ↔ Grace
  [5, 6], // Frank ↔ Grace

  // Cluster 2: Ethereum/Web3
  [1, 3], // Bob ↔ David
  [1, 7], // Bob ↔ Hassan
  [3, 7], // David ↔ Hassan

  // Cluster 3: Research/Founders
  [2, 4], // Carol ↔ Eve
  [2, 9], // Carol ↔ James
  [4, 9], // Eve ↔ James

  // Bridge: Iris connects Cluster 1 and Cluster 2
  [8, 0], // Iris ↔ Alice
  [8, 1], // Iris ↔ Bob

  // Bridge: Eve connects Cluster 2 and Cluster 3
  [4, 3], // Eve ↔ David

  // A couple extra cross-cluster connections for realism
  [6, 2], // Grace ↔ Carol (community ↔ research)
]

function orderWallets(a: string, b: string): [string, string] {
  const lower = [a.toLowerCase(), b.toLowerCase()] as [string, string]
  return lower[0] < lower[1] ? lower : [lower[1], lower[0]]
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  console.log('🌱 RootGraph Demo Seed Script')
  console.log('━'.repeat(50))

  const publicClient = createPublicClient({
    chain: kaolin,
    transport: http(),
  })

  // Create accounts and wallet clients
  const accounts = PRIVATE_KEYS.map((key) => privateKeyToAccount(key))
  const walletClients = accounts.map((account) =>
    createWalletClient({
      chain: kaolin,
      transport: http(),
      account,
    })
  )

  // Print wallet addresses for faucet funding
  console.log('\n📋 Demo wallet addresses (fund via faucet):')
  console.log(`   https://kaolin.hoodi.arkiv.network/faucet/\n`)
  accounts.forEach((account, i) => {
    console.log(`   [${i}] ${account.address} — ${DEMO_PROFILES[i].displayName}`)
  })

  // Check balances
  console.log('\n💰 Checking balances...')
  let unfunded = 0
  for (let i = 0; i < accounts.length; i++) {
    const balance = await publicClient.getBalance({
      address: accounts[i].address,
    })
    const ethBalance = Number(balance) / 1e18
    const status = ethBalance > 0.001 ? '✅' : '❌'
    if (ethBalance <= 0.001) unfunded++
    console.log(
      `   ${status} [${i}] ${DEMO_PROFILES[i].displayName}: ${ethBalance.toFixed(4)} ETH`
    )
  }

  if (unfunded > 0) {
    console.log(
      `\n⚠️  ${unfunded} wallet(s) need funding. Use the faucet above, then re-run.`
    )
    console.log(
      '   Tip: You can fund just wallets 0-4 for a minimal demo graph.\n'
    )
    process.exit(1)
  }

  // Step 1: Create profiles
  console.log('\n📝 Creating profiles...')
  for (let i = 0; i < DEMO_PROFILES.length; i++) {
    const p = DEMO_PROFILES[i]
    const wallet = accounts[i].address.toLowerCase()

    try {
      // Check if profile already exists
      const existing = await publicClient
        .buildQuery()
        .where([
          eq('entityType', 'profile'),
          eq('app', APP_TAG),
          eq('wallet', wallet),
        ])
        .limit(1)
        .fetch()

      if (existing.entities.length > 0) {
        console.log(`   ⏭️  [${i}] ${p.displayName} — already exists`)
        continue
      }

      const payload = jsonToPayload({
        displayName: p.displayName,
        position: p.position,
        company: p.company,
        tags: p.tags,
        avatarUrl: '',
        createdAt: new Date().toISOString(),
      })

      await walletClients[i].createEntity({
        payload,
        contentType: 'application/json',
        attributes: [
          { key: 'entityType', value: 'profile' },
          { key: 'app', value: APP_TAG },
          { key: 'wallet', value: wallet },
          { key: 'username', value: p.username },
        ],
        expiresIn: PROFILE_EXPIRY,
      })

      console.log(`   ✅ [${i}] ${p.displayName} (@${p.username})`)
      await sleep(500) // rate-limit courtesy
    } catch (err) {
      console.error(`   ❌ [${i}] ${p.displayName}: ${(err as Error).message}`)
    }
  }

  // Step 2: Create connections
  console.log('\n🤝 Creating connections...')
  for (const [i, j] of CONNECTIONS) {
    const walletI = accounts[i].address.toLowerCase()
    const walletJ = accounts[j].address.toLowerCase()
    const [userA, userB] = orderWallets(walletI, walletJ)

    try {
      // Check if connection already exists
      const existing = await publicClient
        .buildQuery()
        .where([
          eq('entityType', 'connection'),
          eq('app', APP_TAG),
          eq('userA', userA),
          eq('userB', userB),
        ])
        .limit(1)
        .fetch()

      if (existing.entities.length > 0) {
        console.log(
          `   ⏭️  ${DEMO_PROFILES[i].displayName} ↔ ${DEMO_PROFILES[j].displayName} — already exists`
        )
        continue
      }

      const payload = jsonToPayload({
        userA,
        userB,
        createdAt: new Date().toISOString(),
      })

      // Connection created by "userA" (lower address) for simplicity
      const creatorIdx = userA === walletI ? i : j
      await walletClients[creatorIdx].createEntity({
        payload,
        contentType: 'application/json',
        attributes: [
          { key: 'entityType', value: 'connection' },
          { key: 'app', value: APP_TAG },
          { key: 'userA', value: userA },
          { key: 'userB', value: userB },
        ],
        expiresIn: CONNECTION_EXPIRY,
      })

      console.log(
        `   ✅ ${DEMO_PROFILES[i].displayName} ↔ ${DEMO_PROFILES[j].displayName}`
      )
      await sleep(500)
    } catch (err) {
      console.error(
        `   ❌ ${DEMO_PROFILES[i].displayName} ↔ ${DEMO_PROFILES[j].displayName}: ${(err as Error).message}`
      )
    }
  }

  // Step 3: Create some activity events
  console.log('\n📊 Creating activity events...')
  const ACTIVITIES: { actor: number; eventType: string; target: number }[] = [
    { actor: 0, eventType: 'connection_accepted', target: 5 },
    { actor: 0, eventType: 'connection_accepted', target: 6 },
    { actor: 1, eventType: 'connection_accepted', target: 3 },
    { actor: 4, eventType: 'profile_created', target: 4 },
    { actor: 8, eventType: 'connection_accepted', target: 0 },
    { actor: 2, eventType: 'connection_accepted', target: 9 },
  ]

  for (const act of ACTIVITIES) {
    const actorWallet = accounts[act.actor].address.toLowerCase()
    const targetWallet = accounts[act.target].address.toLowerCase()

    try {
      const payload = jsonToPayload({
        actor: actorWallet,
        eventType: act.eventType,
        targetWallet,
        targetUsername: DEMO_PROFILES[act.target].username,
        createdAt: new Date().toISOString(),
      })

      await walletClients[act.actor].createEntity({
        payload,
        contentType: 'application/json',
        attributes: [
          { key: 'entityType', value: 'activity' },
          { key: 'app', value: APP_TAG },
          { key: 'actor', value: actorWallet },
          { key: 'eventType', value: act.eventType },
        ],
        expiresIn: ACTIVITY_EXPIRY,
      })

      console.log(
        `   ✅ ${DEMO_PROFILES[act.actor].displayName} → ${act.eventType} → ${DEMO_PROFILES[act.target].displayName}`
      )
      await sleep(300)
    } catch (err) {
      console.error(
        `   ❌ ${DEMO_PROFILES[act.actor].displayName} activity: ${(err as Error).message}`
      )
    }
  }

  // Step 4: Create a couple pending connection requests for demo
  console.log('\n📬 Creating pending connection requests...')
  const PENDING_REQUESTS: { from: number; to: number; message: string }[] = [
    {
      from: 9,
      to: 0,
      message: 'Hi Alice! Love what Arkiv is building. Would love to connect.',
    },
    {
      from: 7,
      to: 4,
      message: 'Saw your talk at ETHDenver — great insights on trust graphs.',
    },
  ]

  for (const req of PENDING_REQUESTS) {
    const fromWallet = accounts[req.from].address.toLowerCase()
    const toWallet = accounts[req.to].address.toLowerCase()

    try {
      const payload = jsonToPayload({
        from: fromWallet,
        to: toWallet,
        message: req.message,
        createdAt: new Date().toISOString(),
      })

      await walletClients[req.from].createEntity({
        payload,
        contentType: 'application/json',
        attributes: [
          { key: 'entityType', value: 'connection-request' },
          { key: 'app', value: APP_TAG },
          { key: 'from', value: fromWallet },
          { key: 'to', value: toWallet },
          { key: 'status', value: 'pending' },
        ],
        expiresIn: REQUEST_EXPIRY,
      })

      console.log(
        `   ✅ ${DEMO_PROFILES[req.from].displayName} → ${DEMO_PROFILES[req.to].displayName}: "${req.message.slice(0, 40)}…"`
      )
      await sleep(300)
    } catch (err) {
      console.error(
        `   ❌ Request from ${DEMO_PROFILES[req.from].displayName}: ${(err as Error).message}`
      )
    }
  }

  console.log('\n━'.repeat(50))
  console.log('✨ Seed complete!')
  console.log(`   ${DEMO_PROFILES.length} profiles`)
  console.log(`   ${CONNECTIONS.length} connections`)
  console.log(`   ${ACTIVITIES.length} activity events`)
  console.log(`   ${PENDING_REQUESTS.length} pending requests`)
  console.log('\n   Open the app and log in with any of the wallets above.')
  console.log('   The Trust Map should show a nice cluster graph. 🌐\n')
}

main().catch((err) => {
  console.error('\n💥 Seed failed:', err)
  process.exit(1)
})
