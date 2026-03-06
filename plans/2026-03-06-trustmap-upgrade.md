# Trust Map Upgrade Plan: Canvas → DOM+SVG Hybrid

**Date:** 2026-03-06
**Goal:** Make our trust map visually match the original RootGraph app's quality while keeping our multi-entity (people + companies + jobs) differentiation.

---

## Analysis: Original vs Ours

### Original RootGraph Trust Map

| Layer | Tech | Details |
|---|---|---|
| Background | Canvas 2D (`#firmament-canvas`) | Animated star/particle field, `z-index: -1`, `pointer-events: none` |
| Edges | SVG `<path>` in a full-screen `<svg>` | Quadratic Bézier curves, `stroke: white`, `stroke-width: 0.2`, `fill: none` |
| Nodes | Absolute-positioned DIVs | `left/top` percentages, `transform: -translate-x/y-1/2`, CSS transitions 700ms |
| Node content | DOM elements | Real avatar images (circular, bordered), initials fallback, name label below |
| Zoom/Pan | CSS `transform: translate() scale()` | On parent container, `transition-transform duration-500` |
| Layout | Custom radial/force layout | Pre-computed positions, not a live simulation |
| UI framework | React + Radix UI + Tailwind | Standard component library |

### Our Current Trust Map

| Layer | Tech | Details |
|---|---|---|
| Background | Flat `#0e0e10` | No animation |
| Edges | Canvas 2D straight lines | `moveTo/lineTo`, dashed for job links |
| Nodes | Canvas 2D shapes | Circles (people), rounded rects (companies), diamonds (jobs) + initials text |
| Layout | `react-force-graph-2d` | Live d3-force physics simulation |
| UI | React + shadcn/ui + Tailwind | Same stack |

### What Makes Theirs Look Better

1. **Particle background** — creates depth/atmosphere (the "firmament")
2. **Avatar images** in nodes — visual richness vs plain circles with initials
3. **Bézier curve edges** — elegant curves vs straight lines
4. **Very thin white edges** (0.2px) — subtle, not harsh
5. **DOM nodes** — native shadows, borders, hover effects, smooth CSS transitions
6. **Larger node sizes** (64-90px vs ~10-20px canvas) — more readable
7. **Hardware-accelerated animations** via CSS transforms

---

## Decision: Hybrid Approach

**Don't rewrite to full DOM.** Our `react-force-graph-2d` gives us:
- Live physics simulation (theirs is static — less interactive)
- Automatic zoom/pan/drag
- Handles layout automatically

**Instead, enhance the canvas rendering + add a particle background.**

This is the 80/20 approach: ~80% of the visual improvement for ~20% of the effort of a full rewrite.

---

## Revised Implementation Plan (post-review)

Three expert reviews (architecture, performance, simplicity) identified critical issues
in the original plan. This revised plan incorporates all feedback.

### Key Review Findings Applied

| Finding | Source | Action |
|---|---|---|
| `ctx.shadowBlur` costs 25-50ms/frame for 50 nodes | Performance | Use concentric translucent circles instead |
| `backgroundColor="#0e0e10"` would hide separate particle canvas | Architecture | Use CSS gradient on container instead of particle canvas |
| Zoom controls duplicate library functionality | Simplicity | Killed |
| Help text not worth a phase | Simplicity | Killed |
| `setLineDash`/font/fill state leaks between paint calls | Architecture | Add `ctx.save()`/`ctx.restore()` |
| `pointerAreaPaint` radius won't match larger nodes | Architecture | Scale hit area |
| Spread nodes (physics) before making them bigger | Architecture | Reordered |
| Bézier math over-complicated | Simplicity | Simplified to 2 lines |

---

### Phase 1: Bézier Curve Edges + Bug Fixes

**File:** `trustmap/page.tsx` — `paintLink` function

- Straight lines → quadratic Bézier curves (simplified math)
- Line width: `1` → `0.4` (thinner, like original's 0.2)
- Opacity reduced for subtlety
- Add `ctx.save()`/`ctx.restore()` to prevent state leaks
- Add `dist < 0.1` guard for NaN protection

---

### Phase 2: CSS Depth Background + Physics Tuning

**File:** `trustmap/page.tsx`

- Add CSS `radial-gradient` on graph container for depth effect (no new file, no rAF loop)
- Set `backgroundColor="transparent"` on ForceGraph2D (so gradient shows through)
- Physics tuning: stronger repulsion, longer links, slower cooldown for spread-out layout

---

### Phase 3: Larger Nodes + Fake Glow + Better Fonts

**File:** `trustmap/page.tsx` — `paintNode` function

- Increase radii: people 10/5→18/12, companies/jobs proportionally
- Fake glow via concentric translucent circles (NOT `ctx.shadowBlur`)
- White border on all person nodes
- Sans-serif fonts, larger sizes (12/10px initials, 7px labels)
- Add `ctx.save()`/`ctx.restore()` in paintNode
- Update `pointerAreaPaint` radius to match new sizes

---

## Killed (with reasons)

| Original Phase | Reason |
|---|---|
| Particle canvas (Phase 2) | Blocked by backgroundColor bug, CSS gradient is simpler/zero-cost |
| Zoom controls (Phase 5) | react-force-graph-2d already provides scroll-zoom + drag-pan |
| Help text (Phase 6) | 3 lines of JSX, not worth a phase — inlined if desired |
| `ctx.shadowBlur` | 25-50ms/frame, unacceptable. Replaced with fake glow |
| Rounded diamond vertices | Invisible at 7px node size |
| Mouse parallax | Scope creep |

---

## File Changes Summary

| File | Change |
|---|---|
| `trustmap/page.tsx` | All 3 phases — edges, background, nodes, physics |

**No new files. No new dependencies. ~58 lines changed.**
