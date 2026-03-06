# Rubric Compliance Report: RootGraph

**Date:** 2026-03-03
**Rubric:** [Arkiv Web3 Database Builders Challenge Scoring Rubric](https://github.com/Arkiv-Network/arkiv-web3-database-builders-challenge/blob/main/docs/scoring-rubric.md)

## Before vs After All Fixes

---

### 1. Arkiv Integration Depth (40% weight)

| Criterion | Before | After | What Changed |
|---|---|---|---|
| Entity schema design | 4 | **5** | Added `company` + `job-flag` entity types to README documentation |
| Query usage | 4 | 4 | No change (already solid, no sorting in SDK) |
| Ownership model | 5 | 5 | No change needed |
| Entity relationships | 4 | **5** | `getJobByKey` now verifies `app=rootgraph` after direct fetch |
| Expiration dates | 5 | 5 | No change needed |
| Advanced features | 4 | 4 | No change needed |
| **Section avg** | **4.3** | **4.7** | |
| **Weighted (×0.40)** | **1.73** | **1.87** | |

---

### 2. Functionality (30% weight)

| Criterion | Before | After | What Changed |
|---|---|---|---|
| Core flows | 5 | 5 | No change needed |
| Filtering & search | 3 | **4.5** | Search now matches username, display name, wallet, AND tags; placeholder updated to match |
| Wallet integration | 5 | 5 | No change needed |
| Error handling | 2.5 | **4** | Fixed: silent `.catch(() => {})` on dashboard, unhandled `buildGraphData()` on trustmap, silent `catch { return null }` in `getJobByKey`, added React ErrorBoundary wrapping all routes |
| Data integrity | 4 | **5** | Fixed `createdAt` being blanked to `''` on company update |
| **Section avg** | **3.9** | **4.7** | |
| **Weighted (×0.30)** | **1.17** | **1.41** | |

---

### 3. Design & UX (20% weight)

| Criterion | Before | After | What Changed |
|---|---|---|---|
| Visual design | 5 | 5 | No change needed |
| User experience | 4 | **4.5** | ErrorBoundary provides graceful crash recovery UI with styled "Try Again" |
| Responsive | 4 | 4 | No change needed |
| Blockchain abstraction | 5 | 5 | No change needed |
| **Section avg** | **4.5** | **4.6** | |
| **Weighted (×0.20)** | **0.90** | **0.93** | |

---

### 4. Code Quality & Documentation (10% weight)

| Criterion | Before | After | What Changed |
|---|---|---|---|
| README | 3 | **5** | Added screenshots (landing + jobs), fixed `YOUR_USERNAME` placeholder, added `company`/`job-flag` to entity table, added salary to job description, added company pages + seed script to project structure, added feature bullets |
| Code organization | 5 | 5 | No change needed |
| Code quality | 4 | **4.5** | Consistent error handling everywhere, no more silent swallows |
| **Section avg** | **4.0** | **4.8** | |
| **Weighted (×0.10)** | **0.40** | **0.48** | |

---

### Final Score

| Category | Weight | Before | After |
|---|---|---|---|
| Arkiv Integration | 40% | 4.3 | 4.7 |
| Functionality | 30% | 3.9 | 4.7 |
| Design & UX | 20% | 4.5 | 4.6 |
| Code Quality | 10% | 4.0 | 4.8 |
| **Weighted Total** | | **4.20** | **4.69** |

---

### All Fixes Applied

| # | Fix | Impact |
|---|---|---|
| 1 | README: entity types, features, structure, salary | +README |
| 2 | README: screenshots (landing + jobs) | +README |
| 3 | README: `YOUR_USERNAME` → real repo URL | +README |
| 4 | Dashboard: `.catch(() => {})` → `console.error` | +Error handling |
| 5 | Trustmap: `buildGraphData()` → `.catch(console.error)` | +Error handling |
| 6 | `getJobByKey`: silent catch → `console.error` | +Error handling |
| 7 | `getJobByKey`: verify `app=rootgraph` on direct fetch | +Entity relationships |
| 8 | Search: match username, name, wallet, tags (was username only) | +Filtering & search |
| 9 | Search: placeholder updated to match behavior | +UX accuracy |
| 10 | Company: `createdAt` preserved on update (was blanked) | +Data integrity |
| 11 | React ErrorBoundary wrapping all routes | +Error handling, +UX |

---

### Post-Report Features (March 5, 2026)

| Feature | Impact |
|---|---|
| Multi-entity trust graph (people + companies + jobs) | +Arkiv integration depth, +Functionality, +Design |
| 3 node shapes (circles, rounded squares, diamonds) with distinct colors | +Design & UX |
| Type-aware detail panels (person/company/job) | +Functionality, +UX |
| Apply-from-graph (one-click express interest) | +Functionality |
| Sidebar filters with instant re-computation (no network calls) | +Performance, +UX |
| `getAllCompanies()` + extended `fetchGraphData()` with 4 parallel queries | +Arkiv integration depth |
| Discriminated union `GraphNode` types with `computeGraphData()` pure function | +Code quality |
| Privacy layer: encrypted salary, encrypted messages, ZK range proofs | +Arkiv integration depth, +Functionality |
