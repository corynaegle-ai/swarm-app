# SwarmStack Landing Page Roadmap

**Status:** Landing page deployed to https://swarmstack.net ✅  
**Last Updated:** December 10, 2025  
**Session:** December 10, 2025 - Phase 1 Complete

---

## Current State

Professional landing page is live with:
- Dark theme (#0F172A) with amber accents (#F59E0B)
- Hero: "Orchestrate AI Agents at Scale"
- Stats: <268ms boot time, 1000+ agents, 99.9% uptime
- 6 feature cards (Firecracker, Orchestration, Security, Observability, Edge, API)
- Sign In / Sign Up buttons in nav (links to non-existent pages)
- Mobile responsive layout
- Google Fonts (Inter)

**Deployment Details:**
- Server: 146.190.35.235 (Digital Ocean)
- Path: `/var/www/swarmstack/index.html`
- SSH Key: `~/.ssh/swarm_key`
- Backup: `index.html.backup`

---

## High Priority (Functional)

- [ ] **Sign In / Sign Up Pages**
  - Buttons currently link to `/signin` and `/signup` which don't exist
  - Options:
    - Implement auth (Firebase, Auth0, Supabase)
    - Create waitlist form (capture emails for beta)
    - Add simple "Coming Soon" placeholder pages
  - Recommendation: Start with waitlist, add auth later

- [ ] **Waitlist / Email Capture**
  - Add email form to hero section
  - Since site says "Beta", this converts visitors
  - Options: Buttondown, ConvertKit, or POST to SwarmStack API
  - Store in SQLite on droplet or use third-party service

- [x] **404 Page** ✅ *Completed Dec 10*
  - Branded 404 page deployed to `/var/www/swarmstack/404.html`
  - Caddyfile updated with `handle_errors` directive
  - Live at any invalid URL (e.g., swarmstack.net/nonexistent)

---

## Medium Priority (Credibility)

- [ ] **Pricing Page**
  - Even simple tiers help visitors understand offering
  - Suggested structure:
    - Free (during beta)
    - Pro ($X/month)
    - Enterprise (Contact us)

- [ ] **Documentation**
  - API reference
  - Getting started guide
  - Could use existing `/opt/swarm-api` as reference
  - Consider: Mintlify, GitBook, or simple static pages

- [ ] **Terms of Service / Privacy Policy**
  - Required for any real service
  - Required before collecting emails
  - Can use generator then customize

---

## Nice to Have (Polish)

- [ ] **Animated Background**
  - Hex grid pattern with floating particles
  - Was in original design, stripped for simplicity
  - Adds visual interest

- [x] **Mobile Menu** ✅ *Already functional*
  - JavaScript was already implemented in index.html
  - Roadmap was outdated - verified working Dec 10

- [ ] **Testimonials Section**
  - Add once there are beta users
  - "What developers are saying"

- [ ] **Blog / Content**
  - SEO benefits
  - Thought leadership on AI agents
  - Could integrate Ghost CMS or static markdown

- [ ] **Social Proof**
  - GitHub stars counter
  - "Trusted by X developers"
  - Company logos (once applicable)

---

## Technical Notes

**To deploy updates:**
```bash
scp -i ~/.ssh/swarm_key /path/to/index.html root@146.190.35.235:/var/www/swarmstack/index.html
```

**Current stack:**
- Caddy (reverse proxy / SSL)
- Static HTML served from `/var/www/swarmstack/`
- API at `api.swarmstack.net` (Node.js on port 8080)

**Design System:**
- Primary: #F59E0B (amber)
- Dark: #0F172A
- Font: Inter
- Border radius: 10-16px
- Glass morphism effects with backdrop-filter
