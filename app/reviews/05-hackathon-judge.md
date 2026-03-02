# Review 05: Hackathon Judge Evaluation

**Reviewer:** Simulated Arkiv Hackathon Judge  
**Date:** 2026-03-01

---

## Scoring (1-10)

| Criteria | Score | Notes |
|---|---|---|
| **Arkiv Integration Depth** | 7/10 | Uses entities, attributes, queries, payload serialization. Missing: batch ops (mutateEntities), event subscriptions, pagination. |
| **Data Model Design** | 8/10 | Smart entity design with app namespacing, wallet-ordered connections, indexed attributes. Well thought out. |
| **Use Case Novelty** | 9/10 | Social graph on a data layer is genuinely novel. Most Arkiv demos are pastebins/file storage. This is a step-change. |
| **Technical Execution** | 6/10 | Core works but has bugs: fake reject button, missing username display on connections, search injection. Needs polish. |
| **Demo Readiness** | 6/10 | Can demo the flow, but wallet addresses instead of usernames will look rough. Trust Map is the visual hook. |
| **Composability** | 8/10 | Any app can query `entityType = "profile" && app = "rootgraph"` from Arkiv. Social graph is truly composable. |
| **Presentation Quality** | 7/10 | Landing page sells the vision well. "Built on Arkiv" badge is a nice touch. Missing: clearer Arkiv branding. |
| **Overall** | **7.3/10** | Solid concept, good architecture, needs a polish pass to be competitive |

---

## Strengths to Highlight in Demo

1. **"Your social graph is an open protocol"** — Show how any app can read the connection data. This is the composability pitch Arkiv loves.

2. **The Trust Map** — Visually striking. Have 5-10 pre-created profiles with connections so the graph looks alive. The emerald glow on your node is a nice touch.

3. **Dual auth** — Demo both paths: "Here's how a crypto-native user connects with MetaMask. And here's how my mom connects with Google." Both end up with on-chain data.

4. **Show Blockscout** — After creating a profile or connection, open the Arkiv explorer and show the entity with its attributes. This proves it's real, not a mock.

5. **Entity design** — Walk judges through the attribute schema. Show how `entityType`, `app`, `wallet`, `username` attributes enable queries. This shows you understood Arkiv deeply.

6. **Data ownership pitch** — "If RootGraph shuts down, your connections are still on Arkiv. Another app can pick them up."

---

## Weaknesses to Hide or Address Before Demo

1. **Connection list shows hex addresses** — This is the #1 demo killer. Fix this before presenting. Show usernames and positions, not `0xab12…ef56`.

2. **Reject button is broken** — Either fix it or remove it. A judge clicking reject and seeing it reappear will notice.

3. **No profile resolution on connection cards** — After accepting a connection, the list should show "Alice - Software Engineer at Arkiv" not a hex string.

4. **Search injection** — If a judge types special characters in search, it could break. Make the search robust.

5. **Two-second delay on writes** — Prepare the audience: "Arkiv runs 2-second blocks, so watch — the transaction confirms in real time." Frame the delay as a feature (confirmation).

---

## Missing Features That Would Boost the Score

### Quick wins (hours, not days):

1. **Use `mutateEntities` for batch operations** — When accepting a connection, batch the connection entity + activity entity in one atomic transaction. Judges will notice you know the advanced SDK features. (+0.5 to Arkiv Integration score)

2. **Add event subscriptions** — Use `subscribeEntityEvents` to show real-time updates when a connection is accepted. Even if it's just a console log or toast. (+0.5 to Integration Depth)

3. **Pre-seed demo data** — Create a script that seeds 10-15 profiles with connections. The Trust Map looks 10x better with a real graph than with 2 nodes.

4. **Add "View on Arkiv Explorer" links** — Everywhere. Profile page, connection card, settings page after save. Each link opens Blockscout for that entity. This is the proof that everything is on-chain.

5. **Add entity key display** — Show the hex entity key somewhere subtle (tooltip, small text). Judges who know Arkiv will appreciate seeing actual entity references.

6. **Connection request with message** — The data model supports it. Add a "Add a note" field when sending a request. Small feature, big polish.

---

## Talking Points for Presentation

### Opening (30 seconds)
> "What if your professional network was a public good? LinkedIn owns your connections — they can delete your account, sell your data, lock you out. RootGraph puts your network on Arkiv. You own every connection as a blockchain entity. It's portable, composable, and censorship-resistant."

### Arkiv-specific pitch (30 seconds)
> "We chose Arkiv because it's purpose-built for structured data — not just blobs. Each profile is an entity with indexed attributes: username, wallet address, privacy level. Each connection is an entity linking two wallets. The query API lets us build a full social graph client-side. No smart contracts needed — just entities and attributes."

### Composability pitch (20 seconds)
> "Here's the exciting part: any app on Arkiv can query `entityType = 'connection' && app = 'rootgraph'` and read the entire social graph. Imagine a decentralized LinkedIn where your endorsements, recommendations, and introductions all live on Arkiv — built by different teams, composing on the same data."

### Close (15 seconds)
> "RootGraph isn't just a hackathon project — it's a vision for how professional identity should work in Web3. And Arkiv is the perfect foundation for it."

---

## Verdict

This project has **strong fundamentals** and a **genuinely novel use case**. The data model is well-designed and shows real understanding of Arkiv's entity system. The Trust Map visualization is the demo's star feature.

The main gap is **polish**: connections showing wallet addresses instead of names, the broken reject button, and missing batch operations hurt the perceived quality. A 4-6 hour polish pass addressing the P1 issues from all reviews would move this from "good entry" to "potential winner."

**Projected placement: Top 5 out of ~20 entries.** With the polish pass: **Top 3.**
