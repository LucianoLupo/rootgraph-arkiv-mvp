# Style Alignment Plan: Arkiv MVP -> Original RootGraph

**Date:** 2026-03-05
**Goal:** Make the Arkiv MVP visually match the original RootGraph app (rootgraph.xyz) as closely as possible.

---

## 1. Design System / Theme

### Original RootGraph (rootgraph.xyz) — Extracted CSS Variables

```css
--background: 240 7% 6%       /* rgb(14, 14, 16) — near-black with slight blue tint */
--foreground: 240 14% 96%     /* rgb(243, 243, 246) — off-white */
--card: 240 7% 8%             /* rgb(19, 19, 22) — slightly lighter than bg */
--card-foreground: 240 14% 96%
--primary: 240 14% 96%        /* white-ish — primary buttons are light */
--primary-foreground: 240 7% 6%
--secondary: 240 7% 12%       /* rgb(28, 28, 33) */
--muted: 240 7% 12%           /* same as secondary */
--muted-foreground: 240 7% 55% /* rgb(132, 132, 148) — gray text */
--accent: 240 7% 14%
--destructive: 0 100% 65%     /* bright red */
--border: 240 7% 16%          /* rgb(38, 38, 44) — subtle borders */
--input: 240 7% 14%
--ring: 0 0% 100%             /* white */
--radius: .75rem              /* 12px */
```

### Current Arkiv MVP Theme

The Arkiv MVP uses **emerald-400/500** as accent color with gray-900/950 backgrounds. This needs to change to match the original:

### Changes Needed

| Property | Current (Arkiv MVP) | Target (Original) | Action |
|---|---|---|---|
| Background | gray-950 (#030712) | `rgb(14,14,16)` — HSL 240 7% 6% | Update CSS vars |
| Card bg | gray-900 | `rgb(19,19,22)` — HSL 240 7% 8% | Update CSS vars |
| Accent color | emerald-400/500 | **None** — original has NO accent color. Primary = white | Remove emerald, use white primary |
| Muted text | gray-400 | `rgb(132,132,148)` — HSL 240 7% 55% | Update CSS vars |
| Border | gray-800 | `rgb(38,38,44)` — HSL 240 7% 16% | Update CSS vars |
| Border radius | 0.5rem | **0.75rem (12px)** | Update --radius |
| Font | system sans | Same system sans stack | OK |

**Key insight: The original has NO colored accent. Everything is monochrome dark gray + white. The only color is red for destructive/error states.**

---

## 2. Sidebar

### Original
- **Width:** 256px (`w-64`)
- **Background:** `rgba(14,14,16,0.7)` with `backdrop-blur` — semi-transparent!
- **Border right:** `1px solid rgba(38,38,44,0.6)` — 60% opacity border
- **Position:** Fixed, full height
- **Logo:** SVG logo "Root" with `<>` angle-bracket icon, ~24px height
- **Nav items:** `<button>` elements with:
  - Normal: `text-muted-foreground hover:bg-muted/50`
  - Active: `bg-muted text-foreground` (subtle gray highlight, white text)
  - Padding: `px-4 py-3`
  - Font: `text-[15px]`
  - Gap: `gap-3` between icon and text
  - Icons: Lucide icons, `h-5 w-5`
  - Border radius: `rounded-lg`
  - Spacing: `space-y-1`
- **Bottom section:**
  - "Built on [Arkiv logo]" text
  - Separator line
  - "Logout" button with arrow icon
- **Nav items (9 total):**
  1. Dashboard (house icon)
  2. Connections (users icon)
  3. Activity (activity/zap icon)
  4. Trust Map (git-branch icon)
  5. Search (search icon)
  6. Messages (message-square icon)
  7. Communities (globe icon)
  8. Wallet (wallet icon)
  9. Docs (monitor icon)
  10. Settings (settings icon)

### Current Arkiv MVP Differences
- **Logo:** `[ ROOTGRAPH ]` text in emerald — needs SVG logo or similar treatment
- **Nav text:** ALL CAPS with letter-spacing — original uses **normal case**
- **Active state:** Left border emerald accent — original uses **bg-muted** subtle fill
- **Colors:** Emerald accent throughout — needs to be monochrome
- **Bottom:** Shows "CONNECTED AS 0x..." + "NETWORK SETUP" + "DISCONNECT" — different from original's "Built on Arkiv" + "Logout"

### Changes Needed
- [ ] Remove ALL CAPS from nav items, use normal case `text-[15px]`
- [ ] Remove emerald accent color from sidebar entirely
- [ ] Change active state from left-border-emerald to `bg-muted text-foreground` subtle fill
- [ ] Update logo to `<> Root` style (or `<> RootGraph`)
- [ ] Add backdrop-blur to sidebar background
- [ ] Change "DISCONNECT" to "Logout" with proper icon
- [ ] Update nav item padding to `px-4 py-3 gap-3 rounded-lg`
- [ ] Move "CONNECTED AS" wallet display to be less prominent

---

## 3. Dashboard / Profile Page

### Original Layout
The dashboard IS the profile page. Single URL `/profile` shows:

1. **Profile Card** (top) — full-width card with:
   - Left: Avatar circle (80px, white border, gray bg, initials)
   - Center: `@username` with X/Twitter verified badge, position, tags row
   - Right: Stats (Total Connections count, Network Growth count) with icons
   - Top-right: Share icon + Settings gear icon
   - Card: `rounded-lg border bg-card shadow-sm pt-8 px-4 pb-4 sm:pt-10 sm:px-6 sm:pb-8`
   - Border: `1px solid rgb(38,38,44)` (border-border)

2. **Tab Bar** (below profile card):
   - 4 tabs: Home | Connections | Activity | Trust Map
   - `grid-cols-4 rounded-md bg-muted p-1`
   - Active tab: `bg-background` (darker = active), white text
   - Inactive: muted text
   - Activity tab has red notification badge (count)
   - Icons: Lucide icons before each label

3. **Home Tab Content:**
   - "Network Growth (30 Days)" chart card with line graph
   - Chart: white line on dark bg, grid lines, date axis labels
   - Card: `rounded-lg border bg-card shadow-sm p-6 border-border/50`

4. **Recent Connections** section:
   - Section header with clock icon
   - "View All" link on right
   - Connection rows: avatar, @username, date, "Connected" badge
   - Badge: muted/ghost style

5. **Share Your Profile** section:
   - QR code (white on white rounded container)
   - "Share" + "Scan QR" buttons side by side

### Current Arkiv MVP Dashboard Differences
- Dashboard is a separate page from profile
- Uses emerald accent for stats
- Different card styling
- No tab bar (separate pages via sidebar)
- Different layout structure

### Changes Needed
- [ ] Merge dashboard into a profile-centric layout
- [ ] Add the profile card at top of dashboard with avatar, username, position, tags, stats
- [ ] Add inline tab bar (Home/Connections/Activity/Trust Map) below profile card
- [ ] Update card styling to match: `rounded-lg border border-border bg-card shadow-sm`
- [ ] Avatar: white border circle with gray bg + initials
- [ ] Stats: white text, `text-3xl font-bold`, with muted label above
- [ ] Remove all emerald green coloring

---

## 4. Connections Page

### Original (via tab in profile)
- Search bar: Input with placeholder "Search connections..." + "Invite user" button
- Count: "2 connections" with users icon
- Connection cards:
  - Avatar circle + @username + date
  - Right side: Message icon, red "Break" button (with unlink icon), Edit/pencil icon
  - Card: `rounded-lg border bg-card`
  - Full-width rows

### Current Arkiv MVP
- Shows wallet addresses instead of usernames (fixed in previous work)
- Different card layout
- Has Accept/Reject for pending requests

### Changes Needed
- [ ] Add search input at top of connections list
- [ ] Match connection card layout: avatar | @name + date | action buttons
- [ ] Use "Break" terminology with red styling for disconnect
- [ ] Add message icon button per connection

---

## 5. Activity Page

### Original (via tab in profile)
- Timeline style with dot indicators
- Each event has:
  - Dot (filled = unread, unfilled = read)
  - "Connection" badge (muted pill)
  - Timestamp: "Feb 28 - 4:58 PM"
  - Description: "@Fran wants to connect with you"
  - Status badge: green "Accepted" with checkmark
  - "View" button on right
- Cards: `rounded-lg border bg-card`

### Current Arkiv MVP
- Separate activity/dashboard page
- Different styling

### Changes Needed
- [ ] Match timeline dot + badge + timestamp + description layout
- [ ] Add "Connection" type badge pill
- [ ] Green "Accepted" badge for accepted connections
- [ ] "View" button link on right side

---

## 6. Trust Map

### Original
- **Header bar:** Home icon breadcrumb + "Trust Map" title + search input on right
- **Graph:** Full-screen dark background, circular avatar nodes with white borders
- **Zoom controls:** Top-right box with 100% + / - / fullscreen buttons
- **Right sidebar panel:**
  - "Trustmap" title with X/close and eye/visibility toggle
  - "Filter by" dropdown (Global)
  - "Exposure" setting (Intimate)
  - "Cluster By" dropdown (None)
  - "Role Highlight" toggle switch
  - Stats: Total Connections (18), Direct Links (2) with green count badges
  - "Upload" + "Share link" buttons
  - "Reset" button
  - "Learn Mode" toggle at bottom with info icon
- **Bottom bar:** "Select a node to see details." + "Scroll to zoom - Drag to pan - Click nodes to select"
- **Nodes:** Circular with avatar images, white borders, varying sizes

### Current Arkiv MVP Trust Map
- Multi-entity graph with circles/squares/diamonds
- Right panel with stats, filters, legend
- Different styling/colors (emerald/blue/amber)

### Changes Needed
- [ ] Update right panel styling to match original's card style
- [ ] Change filter controls to dropdown-style like original
- [ ] Add zoom controls box (top-right of graph area)
- [ ] Match bottom helper text style
- [ ] Update node border style to white circles (keep multi-entity shapes for our extension)
- [ ] Remove colored backgrounds from filter buttons, use subtle toggle style
- [ ] Consider adding "Search users..." input in header bar

---

## 7. Search Page

### Original
- Centered layout (no sidebar card)
- Icon at top (users/people icon)
- "Find People" large title
- "Search for users by their alias and view their profiles" subtitle in muted
- Search card: Input with search icon + "Search" button (muted bg, rounded)
- Empty state card: Search/magnifying glass icon + "Start searching" + "Enter an alias to find people in the Root network"
- Result cards: Avatar + Name + tags row + "View Profile" button (white/primary) + "Scan QR to connect" text

### Current Arkiv MVP
- Different layout, likely card-based
- Emerald accent on buttons

### Changes Needed
- [ ] Match centered layout with icon + title + subtitle pattern
- [ ] Search input inside a card with "Search" button
- [ ] Empty state with icon + text in a separate card
- [ ] Result cards: avatar + name + tags + "View Profile" white button
- [ ] Remove emerald coloring

---

## 8. Settings Page

### Original
- Tab bar at top (same as dashboard)
- "Edit Profile" title + "Update your profile information" subtitle
- Centered avatar with "Upload Photo" button below
- Form fields: Alias, Bio (with word/char counter "0/120 words - 0/720 chars"), Company, Position
- Fields: Full-width inputs with labels above, dark bg input, subtle border
- "Connected Accounts" section: X (linked/green badge), GitHub, Farcaster, Telegram — expandable rows with chevron
- "Privacy" section: Three selectable cards (Open 100% / Selective 60% / Private 30%) with icons and descriptions

### Current Arkiv MVP
- Different form layout
- Has encryption settings (unique to Arkiv version)

### Changes Needed
- [ ] Match form field styling: label above, full-width dark input
- [ ] Add char/word counter to bio/description fields
- [ ] Match the input field styling: `bg-input border border-border rounded-lg`

---

## 9. Common Component Styles

### Cards
```
Original: rounded-lg border border-border bg-card shadow-sm
Border: 1px solid hsl(240 7% 16%)
Background: hsl(240 7% 8%)
Border radius: 12px (0.75rem)
```

### Buttons
```
Primary: bg-primary text-primary-foreground (white bg, dark text)
  - rounded-lg (not rounded-md)
  - h-9 px-3 text-sm font-medium
  - Example: "Search", "View Profile"

Ghost/Muted: bg-transparent hover:bg-muted
  - text-muted-foreground
  - Example: nav items, icon buttons

Destructive: text-destructive border-destructive
  - Example: "Break" button (red text/border)
```

### Input Fields
```
bg-transparent or bg-card
border border-border (subtle)
rounded-lg (12px)
h-10 px-3
text-sm
placeholder: text-muted-foreground
focus: ring-ring
```

### Tags/Badges
```
Inline text pills with subtle separators (pipe character |)
Not actually badge components - just text in a row
Muted foreground color
```

### Avatar
```
Circular (rounded-full)
~48-80px depending on context
Gray background (bg-muted)
White/light border (border-2 border-white/20)
Initials in center (text-lg or text-xl)
```

### Toast/Notifications
```
Error: Bright coral/red background (#ff4757-ish), white text
Position: bottom-right
Rounded corners
```

---

## 10. Typography

| Element | Original Style |
|---|---|
| Page title | text-2xl font-bold (e.g., "Find People") |
| Section header | text-base font-normal (e.g., "Network Growth (30 Days)") |
| Username | text-lg font-semibold (e.g., "@lupo0x") |
| Position/subtitle | text-sm text-muted-foreground |
| Stat number | text-3xl font-bold |
| Stat label | text-xs text-muted-foreground uppercase |
| Nav item | text-[15px] font-normal |
| Button | text-sm font-medium |
| Body/content | text-sm font-normal |

---

## 11. Implementation Priority

### Phase 1: Theme Foundation (highest impact, smallest effort)
1. Update CSS variables in `globals.css` to match original's HSL values
2. Remove all emerald-400/500 references across the codebase
3. Update `--radius` to `0.75rem`
4. **This alone will fix ~60% of the visual gap**

### Phase 2: Sidebar Overhaul
1. Remove ALL CAPS and letter-spacing from nav items
2. Change active state from left-border-emerald to bg-muted fill
3. Add backdrop-blur to sidebar
4. Update logo style
5. Restructure bottom section (wallet display, logout)

### Phase 3: Dashboard Redesign
1. Add profile card to top of dashboard
2. Add inline tab bar
3. Update card styling
4. Match stat number/label layout

### Phase 4: Page-by-Page Polish
1. Connections: card layout, action buttons
2. Search: centered layout, empty state
3. Settings: form field styling
4. Activity: timeline layout with badges
5. Trust Map: right panel styling, zoom controls

---

## Key Principles

1. **Monochrome first** — The original is almost entirely grayscale. Only red for errors/destructive.
2. **Subtle borders** — `border-border/50` or `border-border/60`, not full opacity
3. **Backdrop blur** — Sidebar uses semi-transparent bg with blur
4. **Card pattern** — Everything is in `rounded-lg border bg-card` containers
5. **White primary** — Primary buttons/actions are white, not colored
6. **Muted text hierarchy** — Clear distinction between foreground (white) and muted (gray)
7. **No accent color** — The biggest difference from current MVP
