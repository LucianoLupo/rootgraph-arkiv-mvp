# Multi-Entity Trust Graph: People + Companies + Jobs

**Date:** 2026-03-05
**Status:** In Progress -- decisions resolved, implementing

---

## Overview

Extend the Trust Map graph (currently people-only) to also render Company and Job nodes, with distinct visual shapes, multiple edge types, sidebar filters, and the ability to express interest in jobs directly from the graph.

---

## Decisions (Resolved)

1. **`works-at` edges**: Private, not shown. Deferred entirely.
2. **`applied-to` edges**: Private, not shown. Applied state tracked locally for the current user only (for button state in panel).
3. **Graph scope**: Global (all public entities), with type filters.
4. **Apply from graph**: Simplified one-click "Interested" + link to full page.
5. **Edge types shown**: Trust links (person-person), posted-job (company->job or person->job).

---

## Visual Design

### Node Shapes and Colors

| Node Type | Shape | Fill | Border | Size |
|-----------|-------|------|--------|------|
| Person (you) | Circle + glow rings | `#FE7445` | `#FE7445` | 10px (fixed) |
| Person (other) | Circle | `#2A2A2E` | `#444` | 5 + min(connCount, 5) |
| Company | Rounded square | `#0EA5E9` (teal) | `#0284C7` | 8 + min(jobCount, 6) * 1.5 |
| Job (active) | Diamond | `#F59E0B` (amber) | `#D97706` | 6px base |
| Job (filled) | Diamond (dimmed) | `#78716C` | `#57534E` | 5px |
| Job (applied) | Diamond + check | `#FE7445/20` | `#FE7445` | 6px |

### Edge Types

| Edge | Style | Color | Direction |
|------|-------|-------|-----------|
| Trust link (person-person) | Solid | `rgba(254,116,69,0.15)` | None |
| Posted job (company->job) | Dashed `[4,3]` | `rgba(245,158,11,0.3)` | Arrow to job |
| Applied to (person->job) | Dotted `[2,4]` | `rgba(245,158,11,0.2)` | Animated particle |
| Works at (person->company) | *Deferred to Phase 2* | -- | -- |

### Color Tokens

| Element | Hex |
|---------|-----|
| Person (self) | `#FE7445` |
| Person (other) | `#2A2A2E` / `#444` stroke |
| Company | `#0EA5E9` |
| Job (active) | `#F59E0B` |
| Job (filled) | `#78716C` |
| Background | `#141414` |

---

## Data Layer Changes

### New functions needed in `arkiv.ts`

```
getAllCompanies() -> Company[]       // New: bulk fetch companies
getAllApplications() -> JobApplication[]  // New: bulk fetch applications
```

Both follow the exact pattern of `getAllJobs()` and `getAllProfiles()`.

### Extended `fetchGraphData()` return

```typescript
{
  profiles: GraphProfile[]
  connections: Connection[]
  companies: Company[]
  jobs: Job[]                // already have getAllJobs()
  applications: JobApplication[]  // for applied-to edges + applied state
}
```

All 5 queries run in parallel via `Promise.all`. Each capped at 200-500 entities.

### New TypeScript types in `store.ts`

```typescript
// Discriminated union for graph nodes
type PersonGraphNode = {
  nodeType: 'person'
  id: string  // = wallet
  wallet: string
  displayName: string
  position: string
  company: string
  tags: string[]
  avatarUrl: string
  connectionCount: number
}

type CompanyGraphNode = {
  nodeType: 'company'
  id: string  // = `company:${wallet}`
  wallet: string
  name: string
  description: string
  website: string
  logoUrl: string
  tags: string[]
  jobCount: number
}

type JobGraphNode = {
  nodeType: 'job'
  id: string  // = `job:${entityKey}`
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
  applicantCount: number
}

type GraphNode = PersonGraphNode | CompanyGraphNode | JobGraphNode

// Extended links with type discriminator
type GraphLinkType = 'connection' | 'posted-job' | 'applied-to'
type GraphLink = { source: string; target: string; linkType: GraphLinkType }
```

### ID prefix scheme

- Person: wallet address (e.g., `0xabc...`)
- Company: `company:0xabc...` (prevents collision with person wallets)
- Job: `job:0xentitykey...`

### Edge derivation logic

| Edge | Source | Target | How |
|------|--------|--------|-----|
| `connection` | person wallet | person wallet | From connections array (existing) |
| `posted-job` | `company:${job.postedBy}` | `job:${job.entityKey}` | Match job.postedBy wallet to company wallet. If no company entity, fall back to person->job edge. |
| `applied-to` | current user wallet | `job:${app.jobEntityKey}` | From applications where `applicantWallet === currentUser`. Only current user's edges. |

### Store additions

```typescript
// New state
nodeFilters: { showPeople: boolean; showCompanies: boolean; showJobs: boolean }
rawGraphEntities: { profiles, connections, companies, jobs, applications } | null

// New actions
setNodeFilter: (filter: Partial<NodeFilters>) => void
```

### `computeGraphData` pure function

Extracted from `buildGraphData`. Takes `rawGraphEntities` + `nodeFilters` and returns `{ nodes, links }`. This allows instant re-filtering without re-fetching.

---

## UI Changes

### Detail Panel (type-aware)

The selected-node panel at top-left becomes polymorphic based on `node.nodeType`:

**Person panel** (enhanced from current):
- Name, position, company
- Connection count
- [View Profile] button -> `/profile/[wallet]`

**Company panel** (new):
- Company name + description (2 lines)
- Website link
- Tags
- "Open Jobs (N)" with clickable job list (selects job node in graph)
- [View Company] button -> `/company/[wallet]`

**Job panel** (new):
- Title, company name (clickable -> selects company node)
- Location + remote badge
- Salary range (with ZK shield if verified)
- Tags
- "Posted by [Name]" (clickable -> selects person node)
- [INTERESTED] primary button (one-click apply)
- [View Full Listing] secondary button -> `/jobs/[entityKey]`
- Already-applied state: disabled badge with checkmark
- Filled state: no apply button, "POSITION FILLED" text

### Sidebar changes

```
[ TRUST MAP ]
Your network graph

STATS
  People:    12
  Companies:  4
  Jobs:       8
  Edges:     23

FILTERS
  [x] People
  [x] Companies
  [x] Jobs

LEGEND
  (circle, orange)     You
  (circle, gray)       People
  (square, teal)       Companies
  (diamond, amber)     Jobs (Active)
  (diamond, gray)      Jobs (Filled)
  (solid line)         Trust Link
  (dashed line)        Posted Job
  (dotted line)        Applied To

Powered by Arkiv
```

### Mobile

- Detail panel becomes a bottom sheet (`Sheet side="bottom"`)
- Sidebar becomes a collapsible bottom drawer via floating button
- Touch target radius increases from 12 to 16px

---

## Implementation Phases

### Phase 1: Data Layer (arkiv.ts + store.ts)
1. Add `getAllCompanies()` to `arkiv.ts`
2. Add `getAllApplications()` to `arkiv.ts`
3. Extend `fetchGraphData()` to return all 5 entity sets
4. Define `GraphNode` discriminated union type
5. Add `linkType` to `GraphLink`
6. Add `nodeFilters` and `rawGraphEntities` to store
7. Extract `computeGraphData()` pure function
8. Refactor `buildGraphData` to use new pipeline

### Phase 2: Graph Rendering (trustmap/page.tsx)
1. Rewrite `paintNode` to draw circles/squares/diamonds per `nodeType`
2. Add custom link renderer for dashed/dotted/solid per `linkType`
3. Update `handleNodeClick` to pass full typed node data
4. Build polymorphic detail panel (person/company/job variants)
5. Add `useArkiv()` hook to trustmap page for wallet client access
6. Update sidebar stats to show per-type counts
7. Update legend with all node types and edge types

### Phase 3: Apply from Graph
1. Compute `appliedJobKeys` set from `rawGraphEntities.applications`
2. Add "INTERESTED" button to job panel with auth gate
3. Wire up `applyToJob()` call with loading/error/success states
4. Optimistic update of `appliedJobKeys` and node visual state
5. Toast feedback

### Phase 4: Sidebar Filters
1. Add toggle switches for People/Companies/Jobs
2. Wire to `setNodeFilter()` store action
3. Re-run `computeGraphData()` on filter change (no network call)

### Phase 5: Polish
1. Hover highlight (brighten connected edges, dim others)
2. Cross-node navigation within graph (click company name in job panel -> center on company node)
3. Zoom-dependent label rendering
4. Force layout tuning for multi-type clustering
5. Mobile bottom sheet for detail panel

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Graph density with 3 node types | Visual clutter | Type filters ON by default; progressive disclosure later |
| `works-at` string matching unreliable | Wrong edges | Defer to Phase 2 with explicit entity type |
| Performance: 5 queries + 1000 nodes | Slow load on mobile | All queries parallel; `.limit(200)` caps; benchmark early |
| Apply flow divergence from job page | Feature inconsistency | Simplified graph apply + "View Full Listing" link |
| Privacy: applied-to edges visible | Data leak | Only show current user's own application edges |
| `react-force-graph-2d` canvas perf | Janky rendering | Profile with 200+ nodes; fallback to WebGL renderer if needed |

---

## Files to Modify

| File | Changes |
|------|---------|
| `app/src/lib/arkiv.ts` | Add `getAllCompanies()`, `getAllApplications()`, extend `fetchGraphData()` |
| `app/src/lib/store.ts` | New `GraphNode` union, `GraphLink.linkType`, filters, `computeGraphData()` |
| `app/src/app/(app)/trustmap/page.tsx` | Multi-shape rendering, type-aware panels, filters, apply flow, legend |
| `app/src/components/ui/sheet.tsx` | Already exists, used for mobile bottom sheet |
