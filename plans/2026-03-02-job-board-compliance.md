# Job Board Challenge Compliance — Implementation Plan

## Context

RootGraph is submitted to the Arkiv Web3 Database Builders Challenge as a **Job Board**. After auditing the challenge requirements (builder's guide, scoring rubric, rules), we identified 7 compliance gaps. This plan addresses all of them.

**Deadline: March 6, 2026 23:59 UTC**

---

## Gap Summary

| # | Gap | Impact | Priority |
|---|-----|--------|----------|
| 1 | No public browsing — auth required to see /jobs | ❌ Fails "no wallet needed to browse" requirement | Critical |
| 2 | No `applyUrl` field — "Apply via external link" missing | ❌ Fails minimum feature requirement | Critical |
| 3 | No edit job functionality | ❌ Fails "Edit a listing" requirement | Critical |
| 4 | No "My Jobs" management view | ❌ Fails "View and manage their listings" requirement | Critical |
| 5 | No dedicated job detail page | ⚠️ Weak "View full job details" — only truncated cards | High |
| 6 | No job status lifecycle (active→filled→expired) | ⚠️ Weak "Advanced features" scoring (40% weight) | High |
| 7 | Job expiration = 1 year (guide recommends 30-90 days) | ⚠️ Lower score on "Expiration dates" rubric item | Medium |

---

## Implementation Plan

### Phase 1: Data Layer Changes (`app/src/lib/arkiv.ts`)

These changes are foundational — everything else depends on them.

#### 1A. Add `applyUrl` to `JobData` type

```ts
export type JobData = {
  title: string
  company: string
  location: string
  description: string
  tags: string[]
  isRemote: boolean
  applyUrl: string        // <-- NEW: external application URL
  postedAt: string
}
```

**Impact:** All existing createJob callers need to include `applyUrl`. The post form needs a new field. Existing on-chain jobs won't have this field, so readers must handle `undefined`.

#### 1B. Add `status` attribute to `createJob()`

Add a `status` attribute to job entities for lifecycle management:

```ts
// In createJob(), add to attributes:
{ key: 'status', value: 'active' },
```

Update `getAllJobs()` query to filter by `status=active` (currently filters by `isActive=true` — we can keep both for backward compat with existing entities, or just add status alongside).

#### 1C. Add `updateJob()` function

Follow the exact `updateProfile()` pattern:

```ts
export async function updateJob(
  walletClient: ArkivWalletClient,
  entityKey: Hex,
  wallet: string,
  data: JobData,
  status: string = 'active'
) {
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
```

#### 1D. Add `getJobByKey()` function

Needed for the detail page and edit page:

```ts
export async function getJobByKey(entityKey: string): Promise<Job | null> {
  const client = getArkivPublicClient()
  const result = await client
    .buildQuery()
    .where([
      eq('entityType', 'job'),
      eq('app', APP_TAG),
    ])
    .withPayload(true)
    .withAttributes(true)
    .withMetadata(true)
    .limit(200)
    .fetch()

  const entity = result.entities.find((e) => e.key === entityKey)
  if (!entity) return null

  const data = entity.toJson() as JobData
  const postedByAttr = entity.attributes.find((a) => a.key === 'postedBy')
  return {
    ...data,
    entityKey: entity.key,
    postedBy: postedByAttr?.value?.toString() ?? '',
  }
}
```

Note: Arkiv SDK may not support querying by entity key directly. If it does (check SDK), prefer a direct key lookup. Otherwise, fetch by entityType+app and filter client-side, or try using the entity key as a query parameter.

#### 1E. Change `JOB_EXPIRY` to 90 days

```ts
const JOB_EXPIRY = ExpirationTime.fromDays(90)
```

Rationale: Guide explicitly says 30-90 day expiration scores well. 90 days is a reasonable default for job listings.

---

### Phase 2: Public Browsing (`app/src/app/(public)/`)

#### 2A. Create a new `(public)` layout group

The current `(app)` layout requires authentication and redirects unauthenticated users. Rather than adding conditional logic to `(app)/layout.tsx`, we create a parallel layout group for public pages.

**New file: `app/src/app/(public)/layout.tsx`**

A minimal layout that:
- Does NOT require Privy auth
- Shows a simplified header with "[ ROOTGRAPH ]" branding + "SIGN IN" button
- No sidebar navigation (keeps it simple for public visitors)
- Wraps children with ArkivProvider (needed for public Arkiv queries — read-only)
- Dark theme matching existing design

```
(public)/
  layout.tsx          — minimal public layout with sign-in CTA
  jobs/
    page.tsx          — public jobs listing (read-only, no "post" or "interested" actions)
    [id]/
      page.tsx        — public job detail page
```

#### 2B. Public Jobs Page (`(public)/jobs/page.tsx`)

Nearly identical to the existing `(app)/jobs/page.tsx` but:
- No "POST A JOB" button (or shows it as a CTA: "Sign in to post a job")
- No "INTERESTED" button on cards (or: "Sign in to express interest")
- No `walletClient` or `walletAddress` dependency
- Still loads jobs via `getAllJobs()` (uses public client, no auth needed)
- Still loads poster profiles via `getProfile()`
- Filter/search works identically
- Job cards link to `/(public)/jobs/[id]` for full details

#### 2C. Public Job Detail Page (`(public)/jobs/[id]/page.tsx`)

New page showing:
- Full job description (not truncated)
- Poster profile card (avatar, name, position, company, tags, link to poster's profile)
- Apply link button (external URL) — primary CTA
- Location, remote badge, tags
- "Sign in to express interest" secondary CTA
- "Posted X days ago" timestamp
- Back to jobs link

---

### Phase 3: Authenticated Job Pages (modify existing `(app)/jobs/`)

#### 3A. Add `applyUrl` field to Post Job form (`(app)/jobs/post/page.tsx`)

Add a new input field after the description:

```
<Label>Apply URL</Label>
<Input placeholder="https://yourcompany.com/careers/apply" ... />
```

Update the `handlePost` to include `applyUrl: form.applyUrl` in the JobData.

#### 3B. Create Job Detail Page (`(app)/jobs/[id]/page.tsx`)

Same as the public detail page but with authenticated features:
- "INTERESTED" button (functional, calls `applyToJob()`)
- "EDIT" button (visible only if `walletAddress === job.postedBy`)
- "Mark as Filled" button (visible only if owner)
- Apply link button
- Full job description
- Poster profile card with link to `/profile/[wallet]`

#### 3C. Create Edit Job Page (`(app)/jobs/[id]/edit/page.tsx`)

Reuse the post form pattern from `(app)/jobs/post/page.tsx`:
- Pre-populate all fields from existing job data (loaded via `getJobByKey()`)
- Title field, company, location, remote toggle, description, apply URL, tags
- "SAVE CHANGES" button → calls `updateJob()`
- "MARK AS FILLED" button → calls `updateJob()` with status='filled'
- Only accessible by the job owner (redirect if `walletAddress !== job.postedBy`)
- Redirects to `/jobs/[id]` after saving

#### 3D. Add "My Jobs" Tab/Section to Jobs Page (`(app)/jobs/page.tsx`)

Add a tab system at the top of the existing jobs page:
- **ALL JOBS** tab (default) — current behavior, shows all active jobs
- **MY JOBS** tab — shows only the current user's jobs via `getJobsByPoster(walletAddress)`

The "My Jobs" tab shows:
- Each job card with "EDIT" button and "MARK AS FILLED" button
- Application count badge (number of interested people)
- Status indicator (active/filled)

#### 3E. Update Job Cards to link to detail page

In both `(app)/jobs/page.tsx` and `(public)/jobs/page.tsx`, make job titles clickable — link to the detail page.

Also add the apply link as a small external link icon if `applyUrl` is present.

---

### Phase 4: Cross-cutting Concerns

#### 4A. Update existing jobs page to handle missing `applyUrl`

Existing on-chain jobs won't have `applyUrl`. Handle gracefully:
```ts
const applyUrl = job.applyUrl || ''
```

#### 4B. Poster profile links

On job cards (both public and authenticated), make the poster name clickable:
- Authenticated: link to `/profile/[wallet]`
- Public: link to poster's profile on Arkiv Explorer (or just show name, since profiles require auth)

#### 4C. Navigation between public and authenticated

- Public `/jobs` page has a "SIGN IN" CTA in the header
- After signing in, user lands on `(app)/dashboard` per existing flow
- The `(app)/jobs` page is the full-featured version

---

## File Change Summary

### New Files (5)
| File | Purpose |
|------|---------|
| `app/src/app/(public)/layout.tsx` | Minimal public layout with sign-in CTA |
| `app/src/app/(public)/jobs/page.tsx` | Public job listing (read-only) |
| `app/src/app/(public)/jobs/[id]/page.tsx` | Public job detail page |
| `app/src/app/(app)/jobs/[id]/page.tsx` | Authenticated job detail page |
| `app/src/app/(app)/jobs/[id]/edit/page.tsx` | Edit job form |

### Modified Files (3)
| File | Changes |
|------|---------|
| `app/src/lib/arkiv.ts` | Add `applyUrl` to JobData, `updateJob()`, `getJobByKey()`, `status` attribute, 90-day expiry |
| `app/src/app/(app)/jobs/page.tsx` | Add My Jobs tab, link job titles to detail, handle applyUrl |
| `app/src/app/(app)/jobs/post/page.tsx` | Add applyUrl field to form |

---

## Implementation Order

Execute in this order to minimize broken intermediate states:

1. **arkiv.ts** — all data layer changes (Phase 1A-1E)
2. **jobs/post/page.tsx** — add applyUrl field (Phase 3A)
3. **jobs/page.tsx** — add My Jobs tab, card links (Phase 3D, 3E)
4. **(app)/jobs/[id]/page.tsx** — authenticated detail page (Phase 3B)
5. **(app)/jobs/[id]/edit/page.tsx** — edit form (Phase 3C)
6. **(public)/layout.tsx** — public layout (Phase 2A)
7. **(public)/jobs/page.tsx** — public jobs listing (Phase 2B)
8. **(public)/jobs/[id]/page.tsx** — public detail page (Phase 2C)

After each batch: `npx tsc --noEmit && npx next lint`

---

## Scoring Impact (estimated)

| Rubric Area | Before | After | Key Improvement |
|---|---|---|---|
| Entity schema design | 4 | 4 | Already good |
| Query usage | 4 | 4 | Already good |
| Ownership model | 4 | 5 | Owner-only edit/manage |
| Entity relationships | 3 | 4 | Job→applications navigable from detail page |
| Expiration dates | 3 | 5 | 90-day jobs vs 2-year profiles — thoughtful differentiation |
| Advanced features | 1 | 4 | Status lifecycle (active→filled→expired) |
| Core flows work | 3 | 5 | All CRUD flows complete |
| Filtering & search | 4 | 4 | Already good |
| Wallet integration | 4 | 4 | Already good via Privy |
| Blockchain abstraction | 3 | 5 | Public browsing without wallet |

**Estimated weighted score improvement: ~3.5 → ~4.3 / 5.0**

---

## Verification Checklist

After implementation:
- [ ] `npx tsc --noEmit` — zero errors
- [ ] `npx next lint` — zero warnings
- [ ] Unauthenticated user can browse /jobs and see listings
- [ ] Unauthenticated user can view /jobs/[id] with full details
- [ ] Authenticated user can post a job with apply URL
- [ ] Job poster can see "My Jobs" tab with their listings
- [ ] Job poster can edit their listing
- [ ] Job poster can mark listing as "filled"
- [ ] Job seeker can click "INTERESTED" button
- [ ] Job seeker can click apply link to open external URL
- [ ] Existing jobs without applyUrl don't break the UI
