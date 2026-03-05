import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Hex,
} from '@arkiv-network/sdk'
import { kaolin } from '@arkiv-network/sdk/chains'
import { eq } from '@arkiv-network/sdk/query'
import { ExpirationTime, jsonToPayload } from '@arkiv-network/sdk/utils'
import type { EIP1193Provider } from '@privy-io/react-auth'

// --- Constants ---

export const APP_TAG = 'rootgraph'

const PROFILE_EXPIRY = ExpirationTime.fromYears(2)
const CONNECTION_EXPIRY = ExpirationTime.fromYears(2)
const REQUEST_EXPIRY = ExpirationTime.fromDays(30)
const JOB_EXPIRY = ExpirationTime.fromDays(90)
const COMPANY_EXPIRY = ExpirationTime.fromYears(2)
const FLAG_EXPIRY = ExpirationTime.fromYears(2)

// --- Validation ---

const USERNAME_REGEX = /^[a-z0-9._-]{3,30}$/
const MAX_DISPLAY_NAME_LENGTH = 50
const MAX_POSITION_LENGTH = 50
const MAX_COMPANY_LENGTH = 50

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export function validateJobFields(data: JobData) {
  if (!data.title.trim()) throw new Error('Job title is required.')
  if (data.title.length > 100) throw new Error('Job title must be 100 characters or less.')
  if (data.company.length > 100) throw new Error('Company must be 100 characters or less.')
  if (data.location.length > 100) throw new Error('Location must be 100 characters or less.')
  if (data.description.length > 2000) throw new Error('Description must be 2000 characters or less.')
  if (data.salary && data.salary.length > 100) throw new Error('Salary must be 100 characters or less.')
  if (data.tags.length > 10) throw new Error('Maximum 10 tags allowed.')
  if (data.applyUrl && !isValidUrl(data.applyUrl)) {
    throw new Error('Apply URL must be a valid http or https URL.')
  }
}

export function validateCompanyFields(data: CompanyData) {
  if (!data.name.trim()) throw new Error('Company name is required.')
  if (data.name.length > 100) throw new Error('Company name must be 100 characters or less.')
  if (data.description.length > 1000) throw new Error('Description must be 1000 characters or less.')
  if (data.website && !isValidUrl(data.website)) {
    throw new Error('Website must be a valid http or https URL.')
  }
  if (data.tags.length > 10) throw new Error('Maximum 10 tags allowed.')
}

export function validateUsername(username: string): {
  valid: boolean
  error?: string
} {
  if (!USERNAME_REGEX.test(username)) {
    return {
      valid: false,
      error:
        'Username must be 3-30 characters, lowercase letters, numbers, dots, hyphens, or underscores only.',
    }
  }
  return { valid: true }
}

function validateProfileFields(data: ProfileData) {
  if (data.displayName && data.displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new Error(
      `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or less.`
    )
  }
  if (data.position && data.position.length > MAX_POSITION_LENGTH) {
    throw new Error(
      `Position must be ${MAX_POSITION_LENGTH} characters or less.`
    )
  }
  if (data.company && data.company.length > MAX_COMPANY_LENGTH) {
    throw new Error(
      `Company must be ${MAX_COMPANY_LENGTH} characters or less.`
    )
  }
}

// --- Types ---

export type ProfileData = {
  displayName: string
  position: string
  company: string
  tags: string[]
  avatarUrl: string
  createdAt: string
  encryptionPublicKey?: string
}

export type Profile = ProfileData & {
  entityKey: string
  wallet: string
  username: string
  owner?: string
}

export type ConnectionRequest = {
  entityKey: string
  from: string
  to: string
  message: string
  createdAt: string
}

export type Connection = {
  entityKey: string
  userA: string
  userB: string
  createdAt: string
}

export type JobStatus = 'active' | 'filled' | 'expired'

export type SalaryData = {
  encryptedAmount: string
  encryptedNonce: string
  currency: string
  rangeMin: number
  rangeMax: number
  zkProof?: string
  proofPublicInputs?: string
}

export type JobData = {
  title: string
  company: string
  location: string
  description: string
  salary: string
  tags: string[]
  isRemote: boolean
  applyUrl: string
  postedAt: string
  salaryData?: SalaryData
}

export type CompanyData = {
  name: string
  description: string
  website: string
  logoUrl: string
  tags: string[]
  createdAt: string
}

export type Company = CompanyData & {
  entityKey: string
  wallet: string
}

export type FlagData = {
  jobEntityKey: string
  reason: string
  flaggedAt: string
}

export type Flag = FlagData & {
  entityKey: string
  flaggedBy: string
}

export type Job = JobData & {
  entityKey: string
  postedBy: string
  status: JobStatus
}

import type { EncryptedPayload } from '@/lib/crypto'
export type EncryptedMessagePayload = EncryptedPayload

export type JobApplicationData = {
  jobEntityKey: string
  applicantWallet: string
  message: string
  appliedAt: string
  encryptedMessage?: EncryptedMessagePayload
}

export type JobApplication = JobApplicationData & {
  entityKey: string
}

// --- Clients ---

let publicClientInstance: ReturnType<typeof createPublicClient> | null = null

export function getArkivPublicClient() {
  if (!publicClientInstance) {
    publicClientInstance = createPublicClient({
      chain: kaolin,
      transport: http(),
    })
  }
  return publicClientInstance
}

export function createArkivWalletClient(provider: EIP1193Provider, address: Hex) {
  return createWalletClient({
    account: address,
    chain: kaolin,
    transport: custom(provider),
  })
}

type ArkivWalletClient = ReturnType<typeof createArkivWalletClient>

// --- Profiles ---

// A7: Return username in profile data
export async function getProfile(wallet: string): Promise<Profile | null> {
  const client = getArkivPublicClient()
  const result = await client
    .buildQuery()
    .where([
      eq('entityType', 'profile'),
      eq('app', APP_TAG),
      eq('wallet', wallet.toLowerCase()),
    ])
    .withPayload(true)
    .withAttributes(true)
    .withMetadata(true)
    .limit(1)
    .fetch()

  const entity = result.entities[0]
  if (!entity) return null

  const data = entity.toJson() as ProfileData
  const usernameAttr = entity.attributes.find((a) => a.key === 'username')
  return {
    ...data,
    entityKey: entity.key,
    wallet: wallet.toLowerCase(),
    username: usernameAttr?.value?.toString() ?? '',
    owner: entity.owner,
  }
}

// A7: Return username in profile data
export async function getProfileByUsername(
  username: string
): Promise<Profile | null> {
  const client = getArkivPublicClient()
  const result = await client
    .buildQuery()
    .where([
      eq('entityType', 'profile'),
      eq('app', APP_TAG),
      eq('username', username.toLowerCase()),
    ])
    .withPayload(true)
    .withAttributes(true)
    .withMetadata(true)
    .limit(1)
    .fetch()

  const entity = result.entities[0]
  if (!entity) return null

  const data = entity.toJson() as ProfileData
  const walletAttr = entity.attributes.find((a) => a.key === 'wallet')
  const usernameAttr = entity.attributes.find((a) => a.key === 'username')
  return {
    ...data,
    entityKey: entity.key,
    wallet: walletAttr?.value?.toString() ?? '',
    username: usernameAttr?.value?.toString() ?? '',
    owner: entity.owner,
  }
}

// A8: Validate username format in createProfile
export async function createProfile(
  walletClient: ArkivWalletClient,
  wallet: string,
  username: string,
  data: ProfileData
) {
  const usernameValidation = validateUsername(username)
  if (!usernameValidation.valid) {
    throw new Error(usernameValidation.error)
  }
  validateProfileFields(data)

  const payload = jsonToPayload(data)
  return walletClient.createEntity({
    payload,
    contentType: 'application/json',
    attributes: [
      { key: 'entityType', value: 'profile' },
      { key: 'app', value: APP_TAG },
      { key: 'wallet', value: wallet.toLowerCase() },
      { key: 'username', value: username.toLowerCase() },
    ],
    expiresIn: PROFILE_EXPIRY,
  })
}

export async function updateProfile(
  walletClient: ArkivWalletClient,
  entityKey: Hex,
  wallet: string,
  username: string,
  data: ProfileData
) {
  validateProfileFields(data)

  const payload = jsonToPayload(data)
  return walletClient.updateEntity({
    entityKey,
    payload,
    contentType: 'application/json',
    attributes: [
      { key: 'entityType', value: 'profile' },
      { key: 'app', value: APP_TAG },
      { key: 'wallet', value: wallet.toLowerCase() },
      { key: 'username', value: username.toLowerCase() },
    ],
    expiresIn: PROFILE_EXPIRY,
  })
}

// A1: Fix injection — use buildQuery + client-side filtering instead of raw GLOB
export async function searchProfiles(query: string) {
  const client = getArkivPublicClient()
  const result = await client
    .buildQuery()
    .where([eq('entityType', 'profile'), eq('app', APP_TAG)])
    .withPayload(true)
    .withAttributes(true)
    .withMetadata(true)
    .limit(200)
    .fetch()

  const normalizedQuery = query.toLowerCase().trim()
  return result.entities
    .filter((entity) => {
      const usernameAttr = entity.attributes.find(
        (a) => a.key === 'username'
      )
      const username = usernameAttr?.value?.toString() ?? ''
      const data = entity.toJson() as ProfileData
      const displayName = (data.displayName ?? '').toLowerCase()
      const walletAttr = entity.attributes.find((a) => a.key === 'wallet')
      const wallet = walletAttr?.value?.toString() ?? ''
      const tags = (data.tags ?? []).map((t) => t.toLowerCase())
      return (
        username.includes(normalizedQuery) ||
        displayName.includes(normalizedQuery) ||
        wallet.includes(normalizedQuery) ||
        tags.some((t) => t.includes(normalizedQuery))
      )
    })
    .map((entity) => {
      const data = entity.toJson() as ProfileData
      const walletAttr = entity.attributes.find((a) => a.key === 'wallet')
      const usernameAttr = entity.attributes.find(
        (a) => a.key === 'username'
      )
      return {
        ...data,
        entityKey: entity.key,
        wallet: walletAttr?.value?.toString() ?? '',
        username: usernameAttr?.value?.toString() ?? '',
      }
    })
}

export async function getAllProfiles() {
  const client = getArkivPublicClient()
  const result = await client
    .buildQuery()
    .where([eq('entityType', 'profile'), eq('app', APP_TAG)])
    .withPayload(true)
    .withAttributes(true)
    .withMetadata(true)
    .limit(200)
    .fetch()

  return result.entities.map((entity) => {
    const data = entity.toJson() as ProfileData
    const walletAttr = entity.attributes.find((a) => a.key === 'wallet')
    const usernameAttr = entity.attributes.find((a) => a.key === 'username')
    return {
      ...data,
      entityKey: entity.key,
      wallet: walletAttr?.value?.toString() ?? '',
      username: usernameAttr?.value?.toString() ?? '',
    }
  })
}

export async function getEncryptionPublicKey(wallet: string): Promise<string | null> {
  const profile = await getProfile(wallet)
  return profile?.encryptionPublicKey ?? null
}

// --- Connection Requests ---

// A10: Renamed attribute keys from 'from'/'to' to 'fromWallet'/'toWallet'
export async function sendConnectionRequest(
  walletClient: ArkivWalletClient,
  fromWallet: string,
  toWallet: string,
  message?: string
) {
  const payload = jsonToPayload({
    from: fromWallet.toLowerCase(),
    to: toWallet.toLowerCase(),
    message: message ?? '',
    createdAt: new Date().toISOString(),
  })

  return walletClient.createEntity({
    payload,
    contentType: 'application/json',
    attributes: [
      { key: 'entityType', value: 'connection-request' },
      { key: 'app', value: APP_TAG },
      { key: 'fromWallet', value: fromWallet.toLowerCase() },
      { key: 'toWallet', value: toWallet.toLowerCase() },
      { key: 'status', value: 'pending' },
    ],
    expiresIn: REQUEST_EXPIRY,
  })
}

// A3: Filter out already-connected requests
// A5: Validate entity owner matches 'from' attribute
export async function getIncomingRequests(wallet: string) {
  const client = getArkivPublicClient()
  const [requestResult, connections] = await Promise.all([
    client
      .buildQuery()
      .where([
        eq('entityType', 'connection-request'),
        eq('app', APP_TAG),
        eq('toWallet', wallet.toLowerCase()),
        eq('status', 'pending'),
      ])
      .withPayload(true)
      .withAttributes(true)
      .withMetadata(true)
      .limit(100)
      .fetch(),
    getConnections(wallet),
  ])

  const connectedWallets = new Set(
    connections.map((c) =>
      c.userA === wallet.toLowerCase() ? c.userB : c.userA
    )
  )

  return requestResult.entities
    .filter((entity) => {
      const data = entity.toJson() as ConnectionRequest
      // A5: reject spoofed requests where owner doesn't match from
      if (entity.owner?.toLowerCase() !== data.from.toLowerCase()) return false
      // A3: filter out requests from already-connected wallets
      if (connectedWallets.has(data.from.toLowerCase())) return false
      return true
    })
    .map((entity) => {
      const data = entity.toJson() as ConnectionRequest
      return { ...data, entityKey: entity.key }
    })
}

// A3: Filter out already-connected requests
export async function getOutgoingRequests(wallet: string) {
  const client = getArkivPublicClient()
  const [requestResult, connections] = await Promise.all([
    client
      .buildQuery()
      .where([
        eq('entityType', 'connection-request'),
        eq('app', APP_TAG),
        eq('fromWallet', wallet.toLowerCase()),
        eq('status', 'pending'),
      ])
      .withPayload(true)
      .withAttributes(true)
      .withMetadata(true)
      .limit(100)
      .fetch(),
    getConnections(wallet),
  ])

  const connectedWallets = new Set(
    connections.map((c) =>
      c.userA === wallet.toLowerCase() ? c.userB : c.userA
    )
  )

  return requestResult.entities
    .filter((entity) => {
      const data = entity.toJson() as ConnectionRequest
      // A3: filter out requests to already-connected wallets
      return !connectedWallets.has(data.to.toLowerCase())
    })
    .map((entity) => {
      const data = entity.toJson() as ConnectionRequest
      return { ...data, entityKey: entity.key }
    })
}

// --- Connections ---

function orderWallets(a: string, b: string): [string, string] {
  const lower = [a.toLowerCase(), b.toLowerCase()] as [string, string]
  return lower[0] < lower[1] ? lower : [lower[1], lower[0]]
}

// A4: isConnected() check to prevent duplicates
export async function acceptConnection(
  walletClient: ArkivWalletClient,
  fromWallet: string,
  toWallet: string
) {
  const alreadyConnected = await isConnected(fromWallet, toWallet)
  if (alreadyConnected) {
    return null
  }

  const [userA, userB] = orderWallets(fromWallet, toWallet)

  const connectionPayload = jsonToPayload({
    userA,
    userB,
    createdAt: new Date().toISOString(),
  })

  return walletClient.createEntity({
    payload: connectionPayload,
    contentType: 'application/json',
    attributes: [
      { key: 'entityType', value: 'connection' },
      { key: 'app', value: APP_TAG },
      { key: 'userA', value: userA },
      { key: 'userB', value: userB },
    ],
    expiresIn: CONNECTION_EXPIRY,
  })
}

export async function getConnections(wallet: string) {
  const client = getArkivPublicClient()
  const w = wallet.toLowerCase()

  const [resultA, resultB] = await Promise.all([
    client
      .buildQuery()
      .where([
        eq('entityType', 'connection'),
        eq('app', APP_TAG),
        eq('userA', w),
      ])
      .withPayload(true)
      .withAttributes(true)
      .withMetadata(true)
      .limit(200)
      .fetch(),
    client
      .buildQuery()
      .where([
        eq('entityType', 'connection'),
        eq('app', APP_TAG),
        eq('userB', w),
      ])
      .withPayload(true)
      .withAttributes(true)
      .withMetadata(true)
      .limit(200)
      .fetch(),
  ])

  const all = [...resultA.entities, ...resultB.entities]
  return all.map((entity) => {
    const data = entity.toJson() as Connection
    return { ...data, entityKey: entity.key }
  })
}

export async function isConnected(walletA: string, walletB: string) {
  const client = getArkivPublicClient()
  const [userA, userB] = orderWallets(walletA, walletB)

  const result = await client
    .buildQuery()
    .where([
      eq('entityType', 'connection'),
      eq('app', APP_TAG),
      eq('userA', userA),
      eq('userB', userB),
    ])
    .limit(1)
    .fetch()

  return result.entities.length > 0
}

// --- Graph Data (B3: moved from store.ts) ---

export type GraphProfile = ProfileData & {
  entityKey: string
  wallet: string
  username: string
}

export async function fetchGraphData(): Promise<{
  profiles: GraphProfile[]
  connections: Connection[]
}> {
  const client = getArkivPublicClient()

  const [profiles, connectionResult] = await Promise.all([
    getAllProfiles(),
    client
      .buildQuery()
      .where([eq('entityType', 'connection'), eq('app', APP_TAG)])
      .withPayload(true)
      .withAttributes(true)
      .limit(500)
      .fetch(),
  ])

  const connections = connectionResult.entities.map((entity) => {
    const data = entity.toJson() as Connection
    return { ...data, entityKey: entity.key }
  })

  return { profiles, connections }
}

// --- Jobs ---

export async function createJob(
  walletClient: ArkivWalletClient,
  wallet: string,
  data: JobData
) {
  validateJobFields(data)
  const payload = jsonToPayload(data)
  return walletClient.createEntity({
    payload,
    contentType: 'application/json',
    attributes: [
      { key: 'entityType', value: 'job' },
      { key: 'app', value: APP_TAG },
      { key: 'postedBy', value: wallet.toLowerCase() },
      { key: 'isActive', value: 'true' },
      { key: 'status', value: 'active' },
    ],
    expiresIn: JOB_EXPIRY,
  })
}

export async function updateJob(
  walletClient: ArkivWalletClient,
  entityKey: Hex,
  wallet: string,
  data: JobData,
  status: JobStatus = 'active'
) {
  validateJobFields(data)
  const payload = jsonToPayload(data)
  return walletClient.updateEntity({
    entityKey,
    payload,
    contentType: 'application/json',
    attributes: [
      { key: 'entityType', value: 'job' },
      { key: 'app', value: APP_TAG },
      { key: 'postedBy', value: wallet.toLowerCase() },
      { key: 'isActive', value: status === 'active' ? 'true' : 'false' },
      { key: 'status', value: status },
    ],
    expiresIn: JOB_EXPIRY,
  })
}

function parseJobStatus(entity: { attributes: { key: string; value: unknown }[] }): JobStatus {
  const statusAttr = entity.attributes.find((a) => a.key === 'status')
  const raw = statusAttr?.value?.toString()
  if (raw === 'filled' || raw === 'expired') return raw
  return 'active'
}

export async function getAllJobs(): Promise<Job[]> {
  const client = getArkivPublicClient()
  const result = await client
    .buildQuery()
    .where([
      eq('entityType', 'job'),
      eq('app', APP_TAG),
      eq('isActive', 'true'),
    ])
    .withPayload(true)
    .withAttributes(true)
    .withMetadata(true)
    .limit(200)
    .fetch()

  return result.entities.map((entity) => {
    const data = entity.toJson() as JobData
    const postedByAttr = entity.attributes.find((a) => a.key === 'postedBy')
    return {
      ...data,
      applyUrl: data.applyUrl ?? '',
      salary: data.salary ?? '',
      entityKey: entity.key,
      postedBy: postedByAttr?.value?.toString() ?? '',
      status: parseJobStatus(entity),
    }
  })
}

export async function getJobsByPoster(wallet: string): Promise<Job[]> {
  const client = getArkivPublicClient()
  const result = await client
    .buildQuery()
    .where([
      eq('entityType', 'job'),
      eq('app', APP_TAG),
      eq('postedBy', wallet.toLowerCase()),
    ])
    .withPayload(true)
    .withAttributes(true)
    .withMetadata(true)
    .limit(100)
    .fetch()

  return result.entities.map((entity) => {
    const data = entity.toJson() as JobData
    return {
      ...data,
      applyUrl: data.applyUrl ?? '',
      salary: data.salary ?? '',
      entityKey: entity.key,
      postedBy: wallet.toLowerCase(),
      status: parseJobStatus(entity),
    }
  })
}

export async function getJobByKey(entityKey: string): Promise<Job | null> {
  const client = getArkivPublicClient()
  try {
    const entity = await client.getEntity(entityKey as Hex)
    if (!entity) return null

    const appAttr = entity.attributes.find((a) => a.key === 'app')
    if (appAttr?.value?.toString() !== APP_TAG) return null

    const data = entity.toJson() as JobData
    const postedByAttr = entity.attributes.find((a) => a.key === 'postedBy')
    return {
      ...data,
      applyUrl: data.applyUrl ?? '',
      salary: data.salary ?? '',
      entityKey: entity.key,
      postedBy: postedByAttr?.value?.toString() ?? '',
      status: parseJobStatus(entity),
    }
  } catch (err) {
    console.error('Failed to fetch job by key:', err)
    return null
  }
}

export async function applyToJob(
  walletClient: ArkivWalletClient,
  jobEntityKey: string,
  applicantWallet: string,
  message?: string,
  encryptedMessage?: EncryptedMessagePayload
) {
  const payloadData: JobApplicationData = {
    jobEntityKey,
    applicantWallet: applicantWallet.toLowerCase(),
    message: encryptedMessage ? '[encrypted]' : (message ?? ''),
    appliedAt: new Date().toISOString(),
  }
  if (encryptedMessage) {
    payloadData.encryptedMessage = encryptedMessage
  }
  const payload = jsonToPayload(payloadData)

  return walletClient.createEntity({
    payload,
    contentType: 'application/json',
    attributes: [
      { key: 'entityType', value: 'job-application' },
      { key: 'app', value: APP_TAG },
      { key: 'jobKey', value: jobEntityKey },
      { key: 'applicantWallet', value: applicantWallet.toLowerCase() },
    ],
    expiresIn: JOB_EXPIRY,
  })
}

export async function getApplicationsForJob(
  jobEntityKey: string
): Promise<JobApplication[]> {
  const client = getArkivPublicClient()
  const result = await client
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

  return result.entities.map((entity) => {
    const data = entity.toJson() as JobApplicationData
    return { ...data, entityKey: entity.key }
  })
}

export async function getApplicationsByApplicant(
  wallet: string
): Promise<JobApplication[]> {
  const client = getArkivPublicClient()
  const result = await client
    .buildQuery()
    .where([
      eq('entityType', 'job-application'),
      eq('app', APP_TAG),
      eq('applicantWallet', wallet.toLowerCase()),
    ])
    .withPayload(true)
    .withAttributes(true)
    .withMetadata(true)
    .limit(200)
    .fetch()

  return result.entities.map((entity) => {
    const data = entity.toJson() as JobApplicationData
    return { ...data, entityKey: entity.key }
  })
}

// --- Companies ---

export async function getCompanyByWallet(wallet: string): Promise<Company | null> {
  const client = getArkivPublicClient()
  const result = await client
    .buildQuery()
    .where([
      eq('entityType', 'company'),
      eq('app', APP_TAG),
      eq('wallet', wallet.toLowerCase()),
    ])
    .withPayload(true)
    .withAttributes(true)
    .withMetadata(true)
    .limit(1)
    .fetch()

  const entity = result.entities[0]
  if (!entity) return null

  const data = entity.toJson() as CompanyData
  return {
    ...data,
    entityKey: entity.key,
    wallet: wallet.toLowerCase(),
  }
}

export async function createCompany(
  walletClient: ArkivWalletClient,
  wallet: string,
  data: CompanyData
) {
  validateCompanyFields(data)
  const payload = jsonToPayload(data)
  return walletClient.createEntity({
    payload,
    contentType: 'application/json',
    attributes: [
      { key: 'entityType', value: 'company' },
      { key: 'app', value: APP_TAG },
      { key: 'wallet', value: wallet.toLowerCase() },
    ],
    expiresIn: COMPANY_EXPIRY,
  })
}

export async function updateCompany(
  walletClient: ArkivWalletClient,
  entityKey: Hex,
  wallet: string,
  data: CompanyData
) {
  validateCompanyFields(data)
  const payload = jsonToPayload(data)
  return walletClient.updateEntity({
    entityKey,
    payload,
    contentType: 'application/json',
    attributes: [
      { key: 'entityType', value: 'company' },
      { key: 'app', value: APP_TAG },
      { key: 'wallet', value: wallet.toLowerCase() },
    ],
    expiresIn: COMPANY_EXPIRY,
  })
}

// --- Flags ---

export async function flagJob(
  walletClient: ArkivWalletClient,
  jobEntityKey: string,
  wallet: string,
  reason?: string
) {
  const payload = jsonToPayload({
    jobEntityKey,
    reason: reason ?? '',
    flaggedAt: new Date().toISOString(),
  })

  return walletClient.createEntity({
    payload,
    contentType: 'application/json',
    attributes: [
      { key: 'entityType', value: 'job-flag' },
      { key: 'app', value: APP_TAG },
      { key: 'jobKey', value: jobEntityKey },
      { key: 'flaggedBy', value: wallet.toLowerCase() },
    ],
    expiresIn: FLAG_EXPIRY,
  })
}

export async function getFlagsForJob(jobEntityKey: string): Promise<Flag[]> {
  const client = getArkivPublicClient()
  const result = await client
    .buildQuery()
    .where([
      eq('entityType', 'job-flag'),
      eq('app', APP_TAG),
      eq('jobKey', jobEntityKey),
    ])
    .withPayload(true)
    .withAttributes(true)
    .withMetadata(true)
    .limit(200)
    .fetch()

  return result.entities.map((entity) => {
    const data = entity.toJson() as FlagData
    const flaggedByAttr = entity.attributes.find((a) => a.key === 'flaggedBy')
    return {
      ...data,
      entityKey: entity.key,
      flaggedBy: flaggedByAttr?.value?.toString() ?? '',
    }
  })
}

export async function hasUserFlaggedJob(
  jobEntityKey: string,
  wallet: string
): Promise<boolean> {
  const client = getArkivPublicClient()
  const result = await client
    .buildQuery()
    .where([
      eq('entityType', 'job-flag'),
      eq('app', APP_TAG),
      eq('jobKey', jobEntityKey),
      eq('flaggedBy', wallet.toLowerCase()),
    ])
    .limit(1)
    .fetch()

  return result.entities.length > 0
}
