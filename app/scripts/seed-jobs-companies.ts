/**
 * RootGraph Jobs & Companies Seed Script
 *
 * Seeds company profiles, job listings (with salary), and a flag
 * on top of the existing demo wallets from seed-demo.ts.
 *
 * PREREQUISITES:
 *   1. Run seed-demo.ts first (or at least fund the wallets)
 *   2. Wallets 0-4 need testnet ETH:
 *      https://kaolin.hoodi.arkiv.network/faucet/
 *
 * Usage:
 *   npx tsx scripts/seed-jobs-companies.ts
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
const COMPANY_EXPIRY = ExpirationTime.fromYears(2)
const JOB_EXPIRY = ExpirationTime.fromDays(90)
const FLAG_EXPIRY = ExpirationTime.fromYears(2)

const PRIVATE_KEYS: Hex[] = [
  '0x0000000000000000000000000000000000000000000000000000000000000001',
  '0x0000000000000000000000000000000000000000000000000000000000000002',
  '0x0000000000000000000000000000000000000000000000000000000000000003',
  '0x0000000000000000000000000000000000000000000000000000000000000004',
  '0x0000000000000000000000000000000000000000000000000000000000000005',
]

const WALLET_NAMES = ['Alice', 'Bob', 'Carol', 'Eve', 'Frank'] // wallets 0-4 from seed-demo

const COMPANIES = [
  {
    walletIdx: 0, // Alice
    name: 'Arkiv Network',
    description: 'Building the decentralized data layer for web3. We make on-chain data accessible, queryable, and composable for developers worldwide.',
    website: 'https://arkiv.network',
    tags: ['infrastructure', 'tooling', 'defi'],
  },
  {
    walletIdx: 3, // Eve
    name: 'TrustLayer',
    description: 'Decentralized trust scoring and reputation protocol. Enabling verifiable trust relationships between wallets and organizations.',
    website: 'https://trustlayer.xyz',
    tags: ['social', 'security', 'dao'],
  },
  {
    walletIdx: 4, // Frank (wallet index 4 = Eve in seed-demo, but here we use our own PRIVATE_KEYS array index)
    name: 'ChainGuard Security',
    description: 'Smart contract auditing and on-chain security monitoring. Protecting protocols from vulnerabilities and exploits.',
    website: 'https://chainguard.io',
    tags: ['security', 'analytics', 'infrastructure'],
  },
]

const JOBS = [
  {
    walletIdx: 0, // Alice / Arkiv Network
    title: 'Senior Solidity Developer',
    company: 'Arkiv Network',
    location: 'San Francisco, CA',
    description: 'Join our core protocol team to build the next generation of on-chain data infrastructure. You will design and implement smart contracts for our decentralized storage layer, work on gas optimization, and help architect our cross-chain bridge system.\n\nRequirements:\n- 3+ years Solidity experience\n- Deep understanding of EVM internals\n- Experience with foundry/hardhat testing\n- Bonus: Rust experience',
    salary: '$150k-$200k + tokens',
    tags: ['solidity', 'defi', 'infrastructure'],
    isRemote: true,
    applyUrl: 'https://arkiv.network/careers/solidity',
  },
  {
    walletIdx: 0, // Alice / Arkiv Network
    title: 'Frontend Engineer',
    company: 'Arkiv Network',
    location: 'Remote',
    description: 'Build beautiful, performant interfaces for our developer tools and explorer. You will work closely with our design team to create dashboards, query builders, and data visualization components.\n\nStack: Next.js, TypeScript, Tailwind, wagmi/viem.',
    salary: '$120k-$160k',
    tags: ['frontend', 'typescript', 'design'],
    isRemote: true,
    applyUrl: 'https://arkiv.network/careers/frontend',
  },
  {
    walletIdx: 3, // Eve / TrustLayer
    title: 'Protocol Researcher',
    company: 'TrustLayer',
    location: 'Berlin, Germany',
    description: 'Research and design trust scoring algorithms for our decentralized reputation system. Publish findings, prototype solutions, and collaborate with our engineering team to bring research to production.\n\nIdeal background: cryptography, graph theory, mechanism design.',
    salary: '$130k-$170k',
    tags: ['defi', 'dao'],
    isRemote: false,
    applyUrl: 'https://trustlayer.xyz/jobs/researcher',
  },
  {
    walletIdx: 3, // Eve / TrustLayer
    title: 'Full Stack Developer',
    company: 'TrustLayer',
    location: 'Remote',
    description: 'Build the TrustLayer dashboard and API layer. Integrate with multiple blockchain networks to aggregate reputation data. Design and maintain our GraphQL API and real-time notification system.',
    salary: 'Competitive + equity',
    tags: ['fullstack', 'typescript', 'backend'],
    isRemote: true,
    applyUrl: '',
  },
  {
    walletIdx: 4, // Frank / ChainGuard
    title: 'Smart Contract Auditor',
    company: 'ChainGuard Security',
    location: 'New York, NY',
    description: 'Audit DeFi protocols and smart contracts for security vulnerabilities. Write detailed audit reports, develop internal tooling for static analysis, and mentor junior auditors.\n\nRequirements:\n- Expert Solidity knowledge\n- Experience finding real-world vulnerabilities\n- Clear technical writing skills',
    salary: '$180k-$250k',
    tags: ['solidity', 'defi', 'infrastructure'],
    isRemote: false,
    applyUrl: 'https://chainguard.io/careers',
  },
  {
    walletIdx: 1, // Bob (no company profile — freelancer)
    title: 'Rust Developer (Part-Time)',
    company: 'Freelance Project',
    location: 'Anywhere',
    description: 'Looking for a Rust developer to help build a custom indexer for a new L2. Part-time contract, flexible hours. Must have experience with async Rust and blockchain data structures.',
    salary: '$80/hr',
    tags: ['rust', 'backend', 'infrastructure'],
    isRemote: true,
    applyUrl: '',
  },
]

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  console.log('🏢 RootGraph Jobs & Companies Seed Script')
  console.log('━'.repeat(50))

  const publicClient = createPublicClient({ chain: kaolin, transport: http() })
  const accounts = PRIVATE_KEYS.map((key) => privateKeyToAccount(key))
  const walletClients = accounts.map((account) =>
    createWalletClient({ chain: kaolin, transport: http(), account })
  )

  // Print addresses
  console.log('\n📋 Wallets used:')
  accounts.forEach((account, i) => {
    console.log(`   [${i}] ${account.address} — ${WALLET_NAMES[i]}`)
  })

  // Check balances
  console.log('\n💰 Checking balances...')
  for (let i = 0; i < accounts.length; i++) {
    const balance = await publicClient.getBalance({ address: accounts[i].address })
    const eth = Number(balance) / 1e18
    const status = eth > 0.0005 ? '✅' : '❌'
    console.log(`   ${status} [${i}] ${WALLET_NAMES[i]}: ${eth.toFixed(6)} ETH`)
    if (eth <= 0.0005) {
      console.log(`\n⚠️  Wallet ${i} needs funding: https://kaolin.hoodi.arkiv.network/faucet/`)
      process.exit(1)
    }
  }

  // Step 1: Create company profiles
  console.log('\n🏢 Creating company profiles...')
  for (const c of COMPANIES) {
    const wallet = accounts[c.walletIdx].address.toLowerCase()
    try {
      const existing = await publicClient
        .buildQuery()
        .where([
          eq('entityType', 'company'),
          eq('app', APP_TAG),
          eq('wallet', wallet),
        ])
        .limit(1)
        .fetch()

      if (existing.entities.length > 0) {
        console.log(`   ⏭️  ${c.name} — already exists`)
        continue
      }

      const payload = jsonToPayload({
        name: c.name,
        description: c.description,
        website: c.website,
        logoUrl: '',
        tags: c.tags,
        createdAt: new Date().toISOString(),
      })

      await walletClients[c.walletIdx].createEntity({
        payload,
        contentType: 'application/json',
        attributes: [
          { key: 'entityType', value: 'company' },
          { key: 'app', value: APP_TAG },
          { key: 'wallet', value: wallet },
        ],
        expiresIn: COMPANY_EXPIRY,
      })

      console.log(`   ✅ ${c.name} (${WALLET_NAMES[c.walletIdx]})`)
      await sleep(500)
    } catch (err) {
      console.error(`   ❌ ${c.name}: ${(err as Error).message}`)
    }
  }

  // Step 2: Create job listings
  console.log('\n💼 Creating job listings...')
  const jobKeys: string[] = []
  for (const j of JOBS) {
    const wallet = accounts[j.walletIdx].address.toLowerCase()
    try {
      const payload = jsonToPayload({
        title: j.title,
        company: j.company,
        location: j.location,
        description: j.description,
        salary: j.salary,
        tags: j.tags,
        isRemote: j.isRemote,
        applyUrl: j.applyUrl,
        postedAt: new Date().toISOString(),
      })

      const result = await walletClients[j.walletIdx].createEntity({
        payload,
        contentType: 'application/json',
        attributes: [
          { key: 'entityType', value: 'job' },
          { key: 'app', value: APP_TAG },
          { key: 'postedBy', value: wallet },
          { key: 'isActive', value: 'true' },
          { key: 'status', value: 'active' },
        ],
        expiresIn: JOB_EXPIRY,
      })

      jobKeys.push(result.entityKey)
      console.log(`   ✅ "${j.title}" at ${j.company} [${j.salary}]`)
      await sleep(500)
    } catch (err) {
      console.error(`   ❌ "${j.title}": ${(err as Error).message}`)
    }
  }

  // Step 3: Create some job applications
  console.log('\n📝 Creating job applications...')
  if (jobKeys.length >= 2) {
    // Bob applies to Alice's Solidity job
    const applicants = [
      { applicantIdx: 1, jobIdx: 0, msg: 'Very interested in the Solidity role!' },
      { applicantIdx: 2, jobIdx: 0, msg: 'I have 5 years of Solidity experience.' },
      { applicantIdx: 1, jobIdx: 4, msg: 'Would love to do auditing work.' },
    ]

    for (const app of applicants) {
      if (!jobKeys[app.jobIdx]) continue
      const applicantWallet = accounts[app.applicantIdx].address.toLowerCase()
      try {
        const payload = jsonToPayload({
          jobEntityKey: jobKeys[app.jobIdx],
          applicantWallet,
          message: app.msg,
          appliedAt: new Date().toISOString(),
        })

        await walletClients[app.applicantIdx].createEntity({
          payload,
          contentType: 'application/json',
          attributes: [
            { key: 'entityType', value: 'job-application' },
            { key: 'app', value: APP_TAG },
            { key: 'jobKey', value: jobKeys[app.jobIdx] },
            { key: 'applicantWallet', value: applicantWallet },
          ],
          expiresIn: JOB_EXPIRY,
        })

        console.log(`   ✅ ${WALLET_NAMES[app.applicantIdx]} → "${JOBS[app.jobIdx].title}"`)
        await sleep(300)
      } catch (err) {
        console.error(`   ❌ Application: ${(err as Error).message}`)
      }
    }
  }

  // Step 4: Create a flag on Bob's freelance job (from Carol)
  console.log('\n🚩 Creating a flag...')
  if (jobKeys.length >= 6) {
    const flagJobKey = jobKeys[5] // Bob's freelance job
    const flaggerWallet = accounts[2].address.toLowerCase() // Carol
    try {
      const payload = jsonToPayload({
        jobEntityKey: flagJobKey,
        reason: 'Unclear scope and deliverables',
        flaggedAt: new Date().toISOString(),
      })

      await walletClients[2].createEntity({
        payload,
        contentType: 'application/json',
        attributes: [
          { key: 'entityType', value: 'job-flag' },
          { key: 'app', value: APP_TAG },
          { key: 'jobKey', value: flagJobKey },
          { key: 'flaggedBy', value: flaggerWallet },
        ],
        expiresIn: FLAG_EXPIRY,
      })

      console.log(`   ✅ Carol flagged Bob's freelance listing`)
    } catch (err) {
      console.error(`   ❌ Flag: ${(err as Error).message}`)
    }
  }

  console.log('\n' + '━'.repeat(50))
  console.log('✨ Seed complete!')
  console.log(`   ${COMPANIES.length} company profiles`)
  console.log(`   ${JOBS.length} job listings (with salary)`)
  console.log(`   3 job applications`)
  console.log(`   1 flag`)
  console.log('\n   Open the app to see companies, jobs with salary, and flagging in action.\n')
}

main().catch((err) => {
  console.error('\n💥 Seed failed:', err)
  process.exit(1)
})
