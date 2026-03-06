import { create } from 'zustand'
import {
  getProfile,
  getConnections,
  getIncomingRequests,
  getOutgoingRequests,
  fetchGraphData,
  type Profile,
  type Connection,
  type ConnectionRequest,
  type Company,
  type Job,
  type JobStatus,
  type SalaryData,
} from '@/lib/arkiv'

// --- Graph Node Types (discriminated union) ---

export type PersonGraphNode = {
  nodeType: 'person'
  id: string
  wallet: string
  displayName: string
  position: string
  company: string
  tags: string[]
  avatarUrl: string
  connectionCount: number
}

export type CompanyGraphNode = {
  nodeType: 'company'
  id: string
  wallet: string
  name: string
  description: string
  website: string
  logoUrl: string
  tags: string[]
  jobCount: number
}

export type JobGraphNode = {
  nodeType: 'job'
  id: string
  entityKey: string
  title: string
  companyName: string
  location: string
  salary: string
  salaryData?: SalaryData
  isRemote: boolean
  status: JobStatus
  postedBy: string
  tags: string[]
  applyUrl: string
}

export type GraphNode = PersonGraphNode | CompanyGraphNode | JobGraphNode

// --- Graph Link Types ---

type GraphLinkType = 'connection' | 'posted-job'

export type GraphLink = {
  source: string
  target: string
  linkType: GraphLinkType
}

// --- Node Filters ---

export type NodeFilters = {
  showPeople: boolean
  showCompanies: boolean
  showJobs: boolean
}

export type ProfileMapEntry = {
  displayName: string
  position: string
  username: string
}

// --- Raw graph entities (cached for re-filtering) ---

type RawGraphEntities = {
  profiles: (import('@/lib/arkiv').GraphProfile)[]
  connections: Connection[]
  companies: Company[]
  jobs: Job[]
}

// --- Pure function: compute graph from raw data + filters ---

function computeGraphData(
  raw: RawGraphEntities,
  filters: NodeFilters
): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = []
  const links: GraphLink[] = []
  const nodeIds = new Set<string>()

  // Track connection counts for person nodes
  const connectionMap = new Map<string, number>()

  // Build company wallet→id map for posted-job edge resolution
  // Always populated so jobs can link to companies even when company nodes are hidden
  const companyWalletToId = new Map<string, string>()
  for (const c of raw.companies) {
    companyWalletToId.set(c.wallet, `company:${c.wallet}`)
  }

  // Count jobs per company wallet
  const jobCountByWallet = new Map<string, number>()
  for (const job of raw.jobs) {
    const count = jobCountByWallet.get(job.postedBy) ?? 0
    jobCountByWallet.set(job.postedBy, count + 1)
  }

  // 1. Company nodes
  if (filters.showCompanies) {
    for (const c of raw.companies) {
      const id = `company:${c.wallet}`
      nodeIds.add(id)
      nodes.push({
        nodeType: 'company',
        id,
        wallet: c.wallet,
        name: c.name,
        description: c.description,
        website: c.website,
        logoUrl: c.logoUrl,
        tags: c.tags,
        jobCount: jobCountByWallet.get(c.wallet) ?? 0,
      })
    }
  }

  // 2. Person nodes
  if (filters.showPeople) {
    for (const p of raw.profiles) {
      connectionMap.set(p.wallet, 0)
      nodeIds.add(p.wallet)
      nodes.push({
        nodeType: 'person',
        id: p.wallet,
        wallet: p.wallet,
        displayName: p.displayName,
        position: p.position,
        company: p.company,
        tags: p.tags,
        avatarUrl: p.avatarUrl,
        connectionCount: 0,
      })
    }

    // Connection links (person-person)
    for (const conn of raw.connections) {
      if (nodeIds.has(conn.userA) && nodeIds.has(conn.userB)) {
        const countA = connectionMap.get(conn.userA) ?? 0
        const countB = connectionMap.get(conn.userB) ?? 0
        connectionMap.set(conn.userA, countA + 1)
        connectionMap.set(conn.userB, countB + 1)
        links.push({ source: conn.userA, target: conn.userB, linkType: 'connection' })
      }
    }

    // Update connection counts on person nodes
    for (const node of nodes) {
      if (node.nodeType === 'person') {
        node.connectionCount = connectionMap.get(node.wallet) ?? 0
      }
    }
  }

  // 3. Job nodes + posted-job edges
  if (filters.showJobs) {
    for (const job of raw.jobs) {
      const jobId = `job:${job.entityKey}`
      nodeIds.add(jobId)
      nodes.push({
        nodeType: 'job',
        id: jobId,
        entityKey: job.entityKey,
        title: job.title,
        companyName: job.company,
        location: job.location,
        salary: job.salary,
        salaryData: job.salaryData,
        isRemote: job.isRemote,
        status: job.status,
        postedBy: job.postedBy,
        tags: job.tags,
        applyUrl: job.applyUrl,
      })

      // Link job to its poster: prefer company node if visible, fall back to person node
      const companyId = companyWalletToId.get(job.postedBy)
      if (companyId && nodeIds.has(companyId)) {
        links.push({ source: companyId, target: jobId, linkType: 'posted-job' })
      } else if (nodeIds.has(job.postedBy)) {
        links.push({ source: job.postedBy, target: jobId, linkType: 'posted-job' })
      }
      // If neither company nor person node is visible, job floats (no edge)
    }
  }

  return { nodes, links }
}

// --- Store ---

type AppStore = {
  walletAddress: string | null
  profile: Profile | null
  profileLoading: boolean

  connections: Connection[]
  connectionsLoading: boolean

  incomingRequests: ConnectionRequest[]
  outgoingRequests: ConnectionRequest[]
  requestsLoading: boolean

  graphData: { nodes: GraphNode[]; links: GraphLink[] }
  graphLoading: boolean
  rawGraphEntities: RawGraphEntities | null
  nodeFilters: NodeFilters

  profileMap: Map<string, ProfileMapEntry>

  error: string | null

  setWalletAddress: (addr: string | null) => void
  setProfile: (p: Profile | null) => void
  fetchProfile: (wallet: string) => Promise<void>
  fetchConnections: (wallet: string) => Promise<void>
  fetchRequests: (wallet: string) => Promise<void>
  buildGraphData: () => Promise<void>
  setNodeFilter: (filter: Partial<NodeFilters>) => void
  refreshAll: (wallet: string) => Promise<void>
}

export const useAppStore = create<AppStore>((set, get) => ({
  walletAddress: null,
  profile: null,
  profileLoading: false,

  connections: [],
  connectionsLoading: false,

  incomingRequests: [],
  outgoingRequests: [],
  requestsLoading: false,

  graphData: { nodes: [], links: [] },
  graphLoading: false,
  rawGraphEntities: null,
  nodeFilters: { showPeople: true, showCompanies: true, showJobs: true },

  profileMap: new Map<string, ProfileMapEntry>(),

  error: null,

  setWalletAddress: (addr) => set({ walletAddress: addr }),

  setProfile: (p) => set({ profile: p }),

  fetchProfile: async (wallet) => {
    set({ profileLoading: true, error: null })
    try {
      const profile = await getProfile(wallet)
      set({ profile })
    } catch (err) {
      console.error('Failed to fetch profile:', err)
      set({ error: 'Failed to load profile. Is Arkiv reachable?' })
    } finally {
      set({ profileLoading: false })
    }
  },

  fetchConnections: async (wallet) => {
    set({ connectionsLoading: true, error: null })
    try {
      const connections = await getConnections(wallet)
      set({ connections })
    } catch (err) {
      console.error('Failed to fetch connections:', err)
      set({ error: 'Failed to load connections.' })
    } finally {
      set({ connectionsLoading: false })
    }
  },

  fetchRequests: async (wallet) => {
    set({ requestsLoading: true, error: null })
    try {
      const [incoming, outgoing] = await Promise.all([
        getIncomingRequests(wallet),
        getOutgoingRequests(wallet),
      ])
      set({ incomingRequests: incoming, outgoingRequests: outgoing })
    } catch (err) {
      console.error('Failed to fetch requests:', err)
      set({ error: 'Failed to load connection requests.' })
    } finally {
      set({ requestsLoading: false })
    }
  },

  buildGraphData: async () => {
    set({ graphLoading: true, error: null })
    try {
      const { profiles, connections, companies, jobs } = await fetchGraphData()
      const raw: RawGraphEntities = { profiles, connections, companies, jobs }

      const newProfileMap = new Map<string, ProfileMapEntry>()
      for (const p of profiles) {
        newProfileMap.set(p.wallet, {
          displayName: p.displayName,
          position: p.position,
          username: p.username,
        })
      }

      const { nodeFilters } = get()
      const graphData = computeGraphData(raw, nodeFilters)

      set({
        rawGraphEntities: raw,
        graphData,
        profileMap: newProfileMap,
      })
    } catch (err) {
      console.error('Failed to build graph data:', err)
      set({ error: 'Failed to load trust map data.' })
    } finally {
      set({ graphLoading: false })
    }
  },

  setNodeFilter: (filter) => {
    const { nodeFilters, rawGraphEntities } = get()
    const newFilters = { ...nodeFilters, ...filter }
    if (!rawGraphEntities) {
      set({ nodeFilters: newFilters })
      return
    }
    const graphData = computeGraphData(rawGraphEntities, newFilters)
    set({ nodeFilters: newFilters, graphData })
  },

  refreshAll: async (wallet) => {
    const { fetchProfile, fetchConnections, fetchRequests, buildGraphData } = get()
    await Promise.all([
      fetchProfile(wallet),
      fetchConnections(wallet),
      fetchRequests(wallet),
      buildGraphData(),
    ])
  },
}))
