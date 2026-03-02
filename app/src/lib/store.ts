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
} from '@/lib/arkiv'

export type GraphNode = {
  id: string
  wallet: string
  displayName: string
  position: string
  company: string
  tags: string[]
  avatarUrl: string
  connectionCount: number
}

export type GraphLink = {
  source: string
  target: string
}

export type ProfileMapEntry = {
  displayName: string
  position: string
  username: string
}

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

  profileMap: Map<string, ProfileMapEntry>

  error: string | null

  setWalletAddress: (addr: string | null) => void
  setProfile: (p: Profile | null) => void
  fetchProfile: (wallet: string) => Promise<void>
  fetchConnections: (wallet: string) => Promise<void>
  fetchRequests: (wallet: string) => Promise<void>
  buildGraphData: () => Promise<void>
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

  profileMap: new Map<string, ProfileMapEntry>(),

  error: null,

  setWalletAddress: (addr) => set({ walletAddress: addr }),

  setProfile: (p) => set({ profile: p }),

  fetchProfile: async (wallet) => {
    set({ profileLoading: true, error: null })
    try {
      const profile = await getProfile(wallet)
      if (profile) {
        set({ profile })
      } else {
        set({ profile: null })
      }
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

  // B2 + B3: Use fetchGraphData from arkiv.ts (no dynamic imports, uses APP_TAG)
  buildGraphData: async () => {
    set({ error: null })
    try {
      const { profiles, connections } = await fetchGraphData()
      const connectionMap = new Map<string, number>()

      // Build profileMap for wallet→profile resolution (C1 support)
      const newProfileMap = new Map<string, ProfileMapEntry>()

      const nodes: GraphNode[] = profiles.map((p) => {
        connectionMap.set(p.wallet, 0)
        newProfileMap.set(p.wallet, {
          displayName: p.displayName,
          position: p.position,
          username: p.username,
        })
        return {
          id: p.wallet,
          wallet: p.wallet,
          displayName: p.displayName,
          position: p.position,
          company: p.company,
          tags: p.tags,
          avatarUrl: p.avatarUrl,
          connectionCount: 0,
        }
      })

      const links: GraphLink[] = connections.map((conn) => {
        const countA = connectionMap.get(conn.userA) ?? 0
        const countB = connectionMap.get(conn.userB) ?? 0
        connectionMap.set(conn.userA, countA + 1)
        connectionMap.set(conn.userB, countB + 1)
        return { source: conn.userA, target: conn.userB }
      })

      // Update connection counts
      nodes.forEach((node) => {
        node.connectionCount = connectionMap.get(node.wallet) ?? 0
      })

      set({
        graphData: { nodes, links },
        profileMap: newProfileMap,
      })
    } catch (err) {
      console.error('Failed to build graph data:', err)
      set({ error: 'Failed to load trust map data.' })
    }
  },

  refreshAll: async (wallet) => {
    const { fetchProfile, fetchConnections, fetchRequests } = get()
    await Promise.all([
      fetchProfile(wallet),
      fetchConnections(wallet),
      fetchRequests(wallet),
    ])
  },
}))
