# Review 04: Frontend, UX & Performance

**Reviewer:** Senior Frontend & UX Specialist  
**Date:** 2026-03-01  

---

## P1 — Critical

### 1. Settings page doesn't populate username on edit
**File:** `settings/page.tsx:50`
```typescript
useEffect(() => {
  if (profile) {
    setForm({
      username: '',  // ← Always empty!
```
When editing an existing profile, the username field is blank. The user might think they need to re-enter it, or worse, submit without it — which would pass an empty username to `updateProfile()`, potentially corrupting the entity's `username` attribute.

**Fix:** Populate from the profile's username attribute (need to store/return it from `getProfile`).

### 2. Reject button is fake — gives false feedback
**File:** `connections/page.tsx:42`
The reject button shows a success toast "Request declined" but does nothing on-chain. The request reappears on next page load. This is a **broken user flow** that will confuse demo judges.

**Fix:** Either remove the reject button entirely (label it "Ignore" with no toast) or implement proper rejection (see Arkiv review).

### 3. Connection cards show wallet addresses, not usernames
**File:** `connections/page.tsx:101`
The connected list shows truncated wallet addresses (`0xab12…ef56`) instead of usernames or display names. Same issue on pending requests. For a demo, this looks bad — the whole point is a "professional network" but you see hex gibberish.

**Fix:** After fetching connections, resolve wallet addresses to profiles (fetch profile for each connected wallet). The store's `buildGraphData` already does this for the graph — reuse that logic for the connections list.

---

## P2 — Important

### 4. No onboarding redirect
When a user logs in for the first time (no profile), they land on `/dashboard` which shows an "onboarding" card. But there's no automatic redirect to `/settings` to create their profile. The user has to find the link themselves.

**Fix:** In the `(app)/layout.tsx` effect, after `refreshAll`, if no profile exists, redirect to `/settings`.

### 5. No loading states for accept/reject/connect actions
When clicking "Accept" on a connection request, there's no loading spinner on the button. The async operation takes ~2-4 seconds (Arkiv block time). User might double-click.

**Fix:** Add loading state to accept/connect buttons. Disable button while processing.

### 6. Trust Map empty state is too minimal
If user has no connections, the trust map shows a gray icon and text. For the demo, it would be better to show at least the user's own node with a prompt: "Send your first connection request to see your trust map grow!"

### 7. Profile `[username]` page uses wallet address in URL
**File:** `profile/[username]/page.tsx`  
The route is `/profile/[username]` but connections link to `/profile/${otherWallet}` — so the URL is actually a wallet address, not a username. This works but is misleading. For demo, usernames in URLs look much better.

**Fix:** Either rename to `/profile/[wallet]` for honesty, or resolve wallet → username before navigating.

### 8. Search doesn't handle empty query gracefully
If the search input is cleared after results were shown, stale results remain.

### 9. No toast on profile creation success — redirect happens too fast
After creating a profile, the toast "Profile created!" may not be visible because `router.push('/dashboard')` fires immediately. Add a small delay or let the toast persist across navigation.

### 10. Mobile sidebar Sheet has no close-on-navigate
The Sheet-based sidebar on mobile doesn't close automatically when navigating to a new page.

---

## P3 — Nice-to-have

### 11. Landing page CTAs both say "Connect Wallet" style
The Google button should have a Google icon and clearly say "Sign in with Google" vs the wallet button saying "Connect Wallet."

### 12. No favicon or OG tags
For hackathon demo, having a proper favicon and Open Graph tags (title, description, preview image) makes sharing links look professional.

### 13. Force graph config could be tuned
- `cooldownTicks={100}` — graph stops stabilizing quickly, may look jittery
- `d3AlphaDecay={0.02}` — slow decay, nodes bounce for a long time
- Consider `nodeAutoColorBy` for visual variety

### 14. Dark theme gradient on landing page is CSS-only
Looks good but could be enhanced with subtle particle animation (three.js/tsparticles) for extra wow factor in the demo.

### 15. `truncateWallet` utility is defined in 4+ files
Should be extracted to `src/lib/utils.ts`.

### 16. No keyboard navigation support
Tab order through the sidebar nav items doesn't work. Search input should auto-focus on page load.

---

## Positive Observations

- **Dark theme is consistently applied** — no white flashes, good contrast ratios
- **Empty states exist for all lists** — connections, requests, search results all have appropriate empty state UI
- **Loading spinners on data-fetching pages** — dashboard and connections show loaders
- **Mobile-responsive sidebar** via Sheet component is well-implemented
- **Trust Map visual is impressive** — custom canvas painting with glow effects on the current user's node looks polished
- **Tag selector in settings** is a nice touch with the chip toggle pattern
- **Emerald accent color** is distinctive and professional
