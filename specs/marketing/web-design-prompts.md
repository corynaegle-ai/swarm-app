# Web Design Prompts

Concise prompts for SwarmStack landing page development phases.

---

## Phase 2 Prompt

**Goal:** Convert visitors with email capture

**Tasks:**
1. Add waitlist email form to hero section (POST to SwarmStack API, store in SQLite)
2. Create `/signup` page as waitlist landing with "Join the Beta" messaging
3. Create `/signin` placeholder with "Coming Soon" and link to waitlist

**Design:** Dark theme (#0F172A), amber (#F59E0B), Inter font, glass morphism

**Deploy:** `scp -i ~/.ssh/swarm_key [file] root@146.190.35.235:/var/www/swarmstack/`

---

## Phase 3 Prompt

**Goal:** Add credibility pages required before collecting emails

**Tasks:**
1. Create `/terms` - Terms of Service page
2. Create `/privacy` - Privacy Policy page
3. Create `/pricing` - Three tiers: Free (Beta), Pro, Enterprise (Contact)

**Design:** Match existing design system. Simple, readable layouts.

**Deploy:** Same SCP method. Update footer links.

---

## Phase 4 Prompt

**Goal:** Build documentation section

**Tasks:**
1. Create `/docs` index page with navigation
2. Create Getting Started guide
3. Create API Reference (reference `/opt/swarm-api` on server)
4. Create Authentication & Tokens page

**Design:** Static HTML matching design system. Code blocks with syntax highlighting.

**Deploy:** Create `/var/www/swarmstack/docs/` directory structure.

---

## Phase 5 Prompt

**Goal:** Visual polish and social proof

**Tasks:**
1. Add animated hex grid background with floating particles (CSS/canvas, performance-conscious)
2. Add testimonials section placeholder ("What developers are saying")
3. Add GitHub stars counter and "Trusted by X developers" badges

**Design:** Subtle animations, don't distract from content. Amber glow effects.

**Deploy:** Update index.html with new sections and scripts.
