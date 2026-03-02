/**
 * RootGraph Job Board Test Script
 *
 * Tests all job-related Arkiv operations on the Kaolin testnet:
 *   - Create a job listing
 *   - Query all jobs
 *   - Query jobs by poster
 *   - Get a specific job by key
 *   - Apply to a job (express interest)
 *   - Query applications for a job
 *   - Query applications by applicant
 *   - Update a job (edit details)
 *   - Mark a job as filled
 *   - Reactivate a filled job
 *
 * Uses the same deterministic wallets as seed-demo.ts.
 * Wallets 0 and 1 must be funded via the Kaolin faucet:
 *   https://kaolin.hoodi.arkiv.network/faucet/
 *
 * Usage:
 *   npx tsx scripts/test-jobs.ts
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
const JOB_EXPIRY = ExpirationTime.fromDays(90)

// Reuse deterministic keys from seed-demo
const POSTER_KEY: Hex = '0x0000000000000000000000000000000000000000000000000000000000000001'
const APPLICANT_KEY: Hex = '0x0000000000000000000000000000000000000000000000000000000000000002'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`   ✅ ${message}`)
    passed++
  } else {
    console.log(`   ❌ FAIL: ${message}`)
    failed++
  }
}

async function main() {
  console.log('🧪 RootGraph Job Board Test Script')
  console.log('━'.repeat(50))

  const publicClient = createPublicClient({ chain: kaolin, transport: http() })

  const posterAccount = privateKeyToAccount(POSTER_KEY)
  const applicantAccount = privateKeyToAccount(APPLICANT_KEY)

  const posterWallet = posterAccount.address.toLowerCase()
  const applicantWallet = applicantAccount.address.toLowerCase()

  const posterClient = createWalletClient({ chain: kaolin, transport: http(), account: posterAccount })
  const applicantClient = createWalletClient({ chain: kaolin, transport: http(), account: applicantAccount })

  console.log(`\n📋 Poster:    ${posterAccount.address}`)
  console.log(`📋 Applicant: ${applicantAccount.address}`)

  // Check balances
  console.log('\n💰 Checking balances...')
  for (const [label, addr] of [['Poster', posterAccount.address], ['Applicant', applicantAccount.address]] as const) {
    const balance = await publicClient.getBalance({ address: addr })
    const eth = Number(balance) / 1e18
    console.log(`   ${eth > 0.0005 ? '✅' : '❌'} ${label}: ${eth.toFixed(6)} ETH`)
    if (eth <= 0.0005) {
      console.log(`\n⚠️  ${label} needs funding. Use the faucet:`)
      console.log('   https://kaolin.hoodi.arkiv.network/faucet/')
      process.exit(1)
    }
  }

  // ─── Test 1: Create a job ───
  console.log('\n── Test 1: Create a job ──')
  const jobData = {
    title: 'Senior Solidity Developer',
    company: 'RootGraph',
    location: 'Remote',
    description: 'Build on-chain trust graph primitives. Test job posted by the test script.',
    tags: ['solidity', 'defi', 'fullstack'],
    isRemote: true,
    applyUrl: 'https://rootgraph.xyz/careers/solidity',
    postedAt: new Date().toISOString(),
  }

  let jobEntityKey: string = ''
  try {
    const payload = jsonToPayload(jobData)
    const result = await posterClient.createEntity({
      payload,
      contentType: 'application/json',
      attributes: [
        { key: 'entityType', value: 'job' },
        { key: 'app', value: APP_TAG },
        { key: 'postedBy', value: posterWallet },
        { key: 'isActive', value: 'true' },
        { key: 'status', value: 'active' },
      ],
      expiresIn: JOB_EXPIRY,
    })
    jobEntityKey = result.entityKey
    assert(!!jobEntityKey, `Job created with key: ${jobEntityKey}`)
  } catch (err) {
    assert(false, `Create job failed: ${(err as Error).message}`)
    process.exit(1)
  }

  await sleep(1000) // wait for indexing

  // ─── Test 2: Query all jobs ───
  console.log('\n── Test 2: Query all active jobs ──')
  try {
    const result = await publicClient
      .buildQuery()
      .where([eq('entityType', 'job'), eq('app', APP_TAG), eq('isActive', 'true')])
      .withPayload(true)
      .withAttributes(true)
      .withMetadata(true)
      .limit(200)
      .fetch()

    assert(result.entities.length > 0, `Found ${result.entities.length} active job(s)`)
    const found = result.entities.find((e) => e.key === jobEntityKey)
    assert(!!found, 'Our newly created job is in the results')
    if (found) {
      const data = found.toJson() as typeof jobData
      assert(data.title === jobData.title, `Title matches: "${data.title}"`)
      assert(data.applyUrl === jobData.applyUrl, `Apply URL matches: "${data.applyUrl}"`)
      assert(data.isRemote === true, 'isRemote flag preserved')
    }
  } catch (err) {
    assert(false, `Query all jobs failed: ${(err as Error).message}`)
  }

  // ─── Test 3: Query jobs by poster ───
  console.log('\n── Test 3: Query jobs by poster ──')
  try {
    const result = await publicClient
      .buildQuery()
      .where([eq('entityType', 'job'), eq('app', APP_TAG), eq('postedBy', posterWallet)])
      .withPayload(true)
      .withAttributes(true)
      .withMetadata(true)
      .limit(100)
      .fetch()

    assert(result.entities.length > 0, `Poster has ${result.entities.length} job(s)`)
    const found = result.entities.find((e) => e.key === jobEntityKey)
    assert(!!found, 'Our job found in poster query')
  } catch (err) {
    assert(false, `Query by poster failed: ${(err as Error).message}`)
  }

  // ─── Test 4: Get specific job by key (client-side filter) ───
  console.log('\n── Test 4: Get job by entity key ──')
  try {
    const result = await publicClient
      .buildQuery()
      .where([eq('entityType', 'job'), eq('app', APP_TAG)])
      .withPayload(true)
      .withAttributes(true)
      .withMetadata(true)
      .limit(200)
      .fetch()

    const entity = result.entities.find((e) => e.key === jobEntityKey)
    assert(!!entity, `Found job by key: ${jobEntityKey}`)
    if (entity) {
      const statusAttr = entity.attributes.find((a) => a.key === 'status')
      assert(statusAttr?.value?.toString() === 'active', `Status is "active"`)
    }
  } catch (err) {
    assert(false, `Get job by key failed: ${(err as Error).message}`)
  }

  // ─── Test 5: Apply to job (express interest) ───
  console.log('\n── Test 5: Apply to job ──')
  let applicationKey: string = ''
  try {
    const applicationPayload = jsonToPayload({
      jobEntityKey,
      applicantWallet,
      message: 'I am very interested in this role!',
      appliedAt: new Date().toISOString(),
    })

    const result = await applicantClient.createEntity({
      payload: applicationPayload,
      contentType: 'application/json',
      attributes: [
        { key: 'entityType', value: 'job-application' },
        { key: 'app', value: APP_TAG },
        { key: 'jobKey', value: jobEntityKey },
        { key: 'applicantWallet', value: applicantWallet },
      ],
      expiresIn: JOB_EXPIRY,
    })
    applicationKey = result.entityKey
    assert(!!applicationKey, `Application created with key: ${applicationKey}`)
  } catch (err) {
    assert(false, `Apply to job failed: ${(err as Error).message}`)
  }

  await sleep(1000)

  // ─── Test 6: Query applications for job ───
  console.log('\n── Test 6: Query applications for job ──')
  try {
    const result = await publicClient
      .buildQuery()
      .where([
        eq('entityType', 'job-application'),
        eq('app', APP_TAG),
        eq('jobKey', jobEntityKey),
      ])
      .withPayload(true)
      .withAttributes(true)
      .withMetadata(true)
      .limit(200)
      .fetch()

    assert(result.entities.length > 0, `Job has ${result.entities.length} application(s)`)
    const found = result.entities.find((e) => e.key === applicationKey)
    assert(!!found, 'Our application found in job applications')
  } catch (err) {
    assert(false, `Query applications for job failed: ${(err as Error).message}`)
  }

  // ─── Test 7: Query applications by applicant ───
  console.log('\n── Test 7: Query applications by applicant ──')
  try {
    const result = await publicClient
      .buildQuery()
      .where([
        eq('entityType', 'job-application'),
        eq('app', APP_TAG),
        eq('applicantWallet', applicantWallet),
      ])
      .withPayload(true)
      .withAttributes(true)
      .withMetadata(true)
      .limit(200)
      .fetch()

    assert(result.entities.length > 0, `Applicant has ${result.entities.length} application(s)`)
    const found = result.entities.some((e) => {
      const data = e.toJson() as { jobEntityKey: string }
      return data.jobEntityKey === jobEntityKey
    })
    assert(found, 'Application references our job entity key')
  } catch (err) {
    assert(false, `Query by applicant failed: ${(err as Error).message}`)
  }

  // ─── Test 8: Update job (edit details) ───
  console.log('\n── Test 8: Update job details ──')
  try {
    const updatedData = {
      ...jobData,
      title: 'Lead Solidity Developer',
      description: 'Updated: Lead role for on-chain trust graph.',
    }
    const payload = jsonToPayload(updatedData)
    await posterClient.updateEntity({
      entityKey: jobEntityKey as Hex,
      payload,
      contentType: 'application/json',
      attributes: [
        { key: 'entityType', value: 'job' },
        { key: 'app', value: APP_TAG },
        { key: 'postedBy', value: posterWallet },
        { key: 'isActive', value: 'true' },
        { key: 'status', value: 'active' },
      ],
      expiresIn: JOB_EXPIRY,
    })
    assert(true, 'Job updated successfully')

    await sleep(1000)

    // Verify update
    const result = await publicClient
      .buildQuery()
      .where([eq('entityType', 'job'), eq('app', APP_TAG)])
      .withPayload(true)
      .withAttributes(true)
      .limit(200)
      .fetch()

    const entity = result.entities.find((e) => e.key === jobEntityKey)
    if (entity) {
      const data = entity.toJson() as typeof jobData
      assert(data.title === 'Lead Solidity Developer', `Title updated to: "${data.title}"`)
    } else {
      assert(false, 'Could not find updated job')
    }
  } catch (err) {
    assert(false, `Update job failed: ${(err as Error).message}`)
  }

  // ─── Test 9: Mark job as filled ───
  console.log('\n── Test 9: Mark job as filled ──')
  try {
    const filledData = {
      ...jobData,
      title: 'Lead Solidity Developer',
      description: 'Updated: Lead role for on-chain trust graph.',
    }
    const payload = jsonToPayload(filledData)
    await posterClient.updateEntity({
      entityKey: jobEntityKey as Hex,
      payload,
      contentType: 'application/json',
      attributes: [
        { key: 'entityType', value: 'job' },
        { key: 'app', value: APP_TAG },
        { key: 'postedBy', value: posterWallet },
        { key: 'isActive', value: 'false' },
        { key: 'status', value: 'filled' },
      ],
      expiresIn: JOB_EXPIRY,
    })
    assert(true, 'Job marked as filled')

    await sleep(1000)

    // Verify: should NOT appear in isActive=true queries
    const activeResult = await publicClient
      .buildQuery()
      .where([eq('entityType', 'job'), eq('app', APP_TAG), eq('isActive', 'true')])
      .withPayload(true)
      .withAttributes(true)
      .limit(200)
      .fetch()

    const stillActive = activeResult.entities.find((e) => e.key === jobEntityKey)
    assert(!stillActive, 'Filled job no longer appears in active jobs query')

    // Verify: should appear in poster query with status=filled
    const posterResult = await publicClient
      .buildQuery()
      .where([eq('entityType', 'job'), eq('app', APP_TAG), eq('postedBy', posterWallet)])
      .withPayload(true)
      .withAttributes(true)
      .limit(100)
      .fetch()

    const filledEntity = posterResult.entities.find((e) => e.key === jobEntityKey)
    if (filledEntity) {
      const statusAttr = filledEntity.attributes.find((a) => a.key === 'status')
      assert(statusAttr?.value?.toString() === 'filled', `Status is now "filled"`)
    } else {
      assert(false, 'Job not found in poster query after marking filled')
    }
  } catch (err) {
    assert(false, `Mark as filled failed: ${(err as Error).message}`)
  }

  // ─── Test 10: Reactivate job ───
  console.log('\n── Test 10: Reactivate filled job ──')
  try {
    const reactivatedData = {
      ...jobData,
      title: 'Lead Solidity Developer',
      description: 'Updated: Lead role for on-chain trust graph.',
    }
    const payload = jsonToPayload(reactivatedData)
    await posterClient.updateEntity({
      entityKey: jobEntityKey as Hex,
      payload,
      contentType: 'application/json',
      attributes: [
        { key: 'entityType', value: 'job' },
        { key: 'app', value: APP_TAG },
        { key: 'postedBy', value: posterWallet },
        { key: 'isActive', value: 'true' },
        { key: 'status', value: 'active' },
      ],
      expiresIn: JOB_EXPIRY,
    })
    assert(true, 'Job reactivated')

    await sleep(1000)

    // Verify: should appear in active jobs again
    const activeResult = await publicClient
      .buildQuery()
      .where([eq('entityType', 'job'), eq('app', APP_TAG), eq('isActive', 'true')])
      .withPayload(true)
      .withAttributes(true)
      .limit(200)
      .fetch()

    const reactivated = activeResult.entities.find((e) => e.key === jobEntityKey)
    assert(!!reactivated, 'Reactivated job appears in active jobs query')
    if (reactivated) {
      const statusAttr = reactivated.attributes.find((a) => a.key === 'status')
      assert(statusAttr?.value?.toString() === 'active', `Status is back to "active"`)
    }
  } catch (err) {
    assert(false, `Reactivate failed: ${(err as Error).message}`)
  }

  // ─── Summary ───
  console.log('\n' + '━'.repeat(50))
  console.log(`🧪 Results: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`)
  if (failed > 0) {
    console.log('❌ Some tests failed!')
    process.exit(1)
  } else {
    console.log('✅ All tests passed!')
  }
}

main().catch((err) => {
  console.error('\n💥 Test script failed:', err)
  process.exit(1)
})
