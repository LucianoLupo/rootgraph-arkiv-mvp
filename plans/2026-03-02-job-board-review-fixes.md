# Job Board Review Fixes

All findings from the 5-agent review, prioritized and grouped into implementation batches.

---

## Batch 1: `arkiv.ts` — Security & Validation (data layer)

### 1a. Add `validateJobFields()` [Security #1, Pattern #3]

Add validation constants and function mirroring `validateProfileFields`:

```
MAX_JOB_TITLE_LENGTH = 100
MAX_JOB_COMPANY_LENGTH = 100
MAX_JOB_LOCATION_LENGTH = 100
MAX_JOB_DESCRIPTION_LENGTH = 2000
MAX_JOB_TAGS = 10
```

Call `validateJobFields(data)` at the top of `createJob()`.

### 1b. Add owner validation to `getAllJobs` [Security #2, Pattern #2]

Filter out entities where `entity.owner?.toLowerCase() !== postedByAttr?.value?.toString().toLowerCase()`. Follows the exact pattern from `getIncomingRequests` (line 393).

### 1c. Add owner validation to `getApplicationsByApplicant` [Security #5]

Same pattern: filter out entities where `entity.owner` doesn't match `applicantWallet` attribute.

### 1d. Add duplicate-application guard to `applyToJob` [Security #3, Architecture #1]

Before creating, query for existing application with same `jobKey` + `applicantWallet`. Return `null` if already exists. Follows the `isConnected()` pattern from `acceptConnection`.

### 1e. Add self-application guard to `applyToJob` [Security #4]

Reject if `applicantWallet === jobPosterWallet`. Need to resolve the job's poster — query the job entity by key or accept the poster wallet as a parameter (simpler).

**Decision:** Accept `jobPosterWallet` as parameter to `applyToJob` to avoid an extra query. The caller (jobs page) already has this data.

### 1f. Add `postedAtTs` numeric attribute [Pattern #2, Architecture]

Add `{ key: 'postedAtTs', value: Math.floor(Date.now() / 1000) }` to `createJob` attributes. Update `getAllJobs` to use `.orderBy('postedAtTs', 'number', 'desc')`.

### 1g. Move timestamp generation into functions [Security #7]

- `createJob`: Generate `postedAt` inside the function, remove from `JobData` type.
- `applyToJob`: Already generates `appliedAt` internally — no change needed.

### 1h. Fix attribute key mismatch [Pattern #5]

Change attribute key from `'jobKey'` to `'jobEntityKey'` in `applyToJob` and all query functions that filter by it (`getApplicationsForJob`).

### 1i. Delete unused functions [Simplicity #1]

- Delete `getJobsByPoster` (never imported)
- Delete `getApplicationsForJob` (never imported — note: we'll use an inline query for the duplicate check in 1d instead, since we only need a count/existence check, not the full function)

**Wait — `getApplicationsForJob` IS needed for the duplicate check in 1d.** Keep it but add owner validation to it.

**Revised:** Keep `getApplicationsForJob` (add owner validation), delete only `getJobsByPoster`.

---

## Batch 2: `jobs/page.tsx` — Performance & UX

### 2a. Fix N+1 profile resolution [Performance #2]

Replace the per-poster `getProfile()` loop with a single `getAllProfiles()` call in the same `Promise.all`. Build the poster lookup map client-side.

### 2b. Fix `toast` in `useCallback` deps [Performance #1]

Remove `toast` from the `loadJobs` useCallback dependency array. Add eslint-disable comment explaining why.

### 2c. Update `applyToJob` call signature [from 1e]

Pass `job.postedBy` as the new `jobPosterWallet` parameter.

### 2d. Update import [from 1i]

Replace `getProfile` import with `getAllProfiles`. Remove unused `getProfile` import.

### 2e. Memoize `filteredJobs` [Performance #4]

Wrap the filter logic in `useMemo([jobs, filter])`.

---

## Batch 3: `jobs/post/page.tsx` — Cleanup

### 3a. Remove `postedAt` from form data [from 1g]

Since `createJob` now generates `postedAt` internally, remove it from the `JobData` construction in `handlePost`.

### 3b. Remove duplicate selected-tags badge list [Simplicity #2]

Delete the `{form.tags.length > 0 && (...)}` badge section (lines 214-228). The highlighted state in the tag grid already communicates selection.

---

## Batch 4: Type cleanup

### 4a. Update `JobData` type [from 1g]

Remove `postedAt` from `JobData` — it's now generated internally by `createJob`. Add it only to the `Job` return type (it comes back from the entity payload).

**Actually:** `postedAt` is stored in the payload and returned when reading. So:
- `JobData` (what gets stored): remove `postedAt` — `createJob` adds it
- `Job` (what gets returned): keep `postedAt` — it comes from the entity payload

This means `JobData` becomes the "input" type and `Job` extends it with `postedAt` + `entityKey` + `postedBy`.

---

## Verification

After all changes:
1. `npx tsc --noEmit` — zero errors
2. `npx next lint` — zero warnings

---

## Files touched

| File | Changes |
|------|---------|
| `app/src/lib/arkiv.ts` | Validation, owner checks, duplicate guard, self-apply guard, postedAtTs, attribute rename, delete unused fn, timestamp generation |
| `app/src/app/(app)/jobs/page.tsx` | Batch profile fetch, fix useCallback deps, useMemo filter, update applyToJob signature |
| `app/src/app/(app)/jobs/post/page.tsx` | Remove postedAt from form, remove duplicate tag badges |

No new files created.
