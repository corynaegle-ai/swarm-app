# Swarm Notion Document Migration Tracker

**Created:** 2025-12-11  
**Last Updated:** 2025-12-11  
**Purpose:** Track migration of Notion documents to git repository

---

## Migration Commands Reference

```bash
# Notion fetch using Claude Notion tool:
notion-fetch --id <page_id>

# Git workflow (local Mac):
cd ~/repos/swarm-specs
git add .
git commit -m "docs: migrate <document-name> from Notion"
git push origin main
```

---

## Documents Inventory

### Already Migrated ✅

| Document | Notion ID | Git Path | Status |
|----------|-----------|----------|--------|
| Infrastructure Reference | 2c4c56ed45a781ea9f51c06d46221229 | references/infrastructure.md | ✅ Done |
| Agents List | 2c4c56ed45a78137a91ee9b9ba39d250 | references/agents-list.md | ✅ Done |
| Design Agent Pipeline | 2c4c56ed45a781da9c71f7c03c16b1f3 | architecture/design-agent-pipeline.md | ✅ Done |
| Agent-Pull Architecture | 2c4c56ed45a781578740fef1de6b0fa6 | architecture/agent-pull.md | ✅ Done |
| Anti-Freeze Protocol | 2c4c56ed45a781f8b82ffd8bf01204ec | runbooks/anti-freeze-protocol.md | ✅ Done |
| Dev/Prod Environment | 2c4c56ed45a78183b7bcd65e66efa176 | architecture/dev-prod-environment.md | ✅ Done |
| Ticketing System Architecture | 2c1c56ed45a781ce87a2dba2b3666c2a | architecture/ticketing-system.md | ✅ Done |
| CLI Design Specification | 2c5c56ed45a781b2a244d03b6ec7b9bd | design-docs/cli-design.md | ✅ Done |
| Swarm Dev API | 2c5c56ed45a781318658c508dbbbf598 | specs/api/dev-api.md | ✅ Done |
| Database Schema Reference | 2c5c56ed45a781ed96c5d9a668b443d3 | specs/schemas/database-schema.md | ✅ Done |
| MCP Factory Design | 2c5c56ed45a781908570db6a03bbd4e7 | design-docs/mcp-factory/design.md | ✅ Done |
| Runtime Implementation Prompt | 2c5c56ed45a781e6846ec4a202d5d1f7 | prompts/runtime-implementation.md | ✅ Done |
| Swarm Engine Code Review Issues | 2c5c56ed45a781a8b714d2c565f6d7de | code-reviews/swarm-engine-issues.md | ✅ Done |
| Feature Roadmap: Zapier | 2c5c56ed45a78171b7d4c7cc0ecc309a | planning/zapier-feature-roadmap.md | ✅ Done |
| Investor Pitch (Agent Factory) | 2c5c56ed45a7811c8d43ed40719d60e8 | business/investor-pitch-agent-factory.md | ✅ Done |
| Swarm vs Docker Analysis | 2c5c56ed45a78181b221f0751bcb17a9 | business/swarm-vs-docker-analysis.md | ✅ Done |
| Swarm Capabilities Audit | 2c5c56ed45a7815e8cebdf4a0dba6335 | references/capabilities-audit.md | ✅ Done |
| CLI Implementation Prompt | 2c5c56ed45a7810aa988fb57d2769e3b | prompts/cli-implementation.md | ✅ Done |
| Design Interface Spec v2 | 2c4c56ed45a781e4bac4d1c1b355af5a | design-docs/ui-hitl/specification.md | ✅ Done |
| Swarm Code Review Dec 2025 | 2c5c56ed45a7810cb78df7699da5c2c7 | code-reviews/swarm-code-review-dec2025.md | ✅ Done |
| Swarm Infrastructure Code Review | 2c5c56ed45a781108a3dc0b1f9369861 | code-reviews/infrastructure-review.md | ✅ Done |
| Investor Pitch (Security) | 2c5c56ed45a781b8986ad18f0b3e5c98 | business/investor-pitch-security.md | ✅ Done |
| CLI Bug Fixes Prompt | 2c5c56ed45a781be941fcc4d0b1ee89b | prompts/cli-bug-fixes.md | ✅ Done |
| Register Templates Prompt | 2c5c56ed45a781ddb15ccd8babbb6d07 | prompts/register-templates.md | ✅ Done |
| SwarmStack Landing Roadmap | 2c5c56ed45a781acab74ed28e57e9714 | marketing/landing-page-roadmap.md | ✅ Done |
| Web Design Prompts | 2c5c56ed45a78159a628d2fa1635f3cd | marketing/web-design-prompts.md | ✅ Done |
| Visual Web Design Persona | 2c5c56ed45a7816fadb3d990b3ead81a | marketing/web-design-persona.md | ✅ Done |


---

### Marked "Moved" But File Missing ⚠️

These documents claim to be moved in Notion but the files don't exist in git. Content may be lost.

| Document | Notion ID | Claimed Git Path | Action Needed |
|----------|-----------|------------------|---------------|
| CLI Scripts Code Review | 2c5c56ed45a781e0a352fc98c0a9bdc4 | code-reviews/cli-scripts-issues.md | Verify if content exists |
| Swarm Ticketing Code Review | 2c5c56ed45a781fbbbc9f3c6096023a4 | code-reviews/ticketing-review.md | Verify if content exists |
| Agent-Foreman Analysis | 2c5c56ed45a7811295e8f1ba78ccca00 | analysis/agent-foreman-adoption.md | Verify if content exists |

---

### Empty/Delete 🗑️

| Document | Notion ID | Reason |
|----------|-----------|--------|
| Design Interface Spec v1 | e475c27ddc9e483988d63564107d502b | Blank page - no content |

---

### Keep in Notion Only 🔒

| Document | Notion ID | Reason |
|----------|-----------|--------|
| Creds | 2c1c56ed45a78085a167c06233cca4b6 | Contains sensitive credentials |
| Session Archive | 2c4c56ed45a781cc92e0dd9734be6d76 | Historical archive, too large |
| Project Swarm (main) | 2c0c56ed45a781948aa1dd00eb1c6b2b | Navigation page, stays as Notion index |
| Session Notes (live) | 2c0c56ed45a78189b0ead18565ccbeaf | Active working document in Notion |

---

### Non-Swarm (Different Projects) 🚫

| Document | Notion ID | Project |
|----------|-----------|---------|
| ChoreChomper Project | 2c0c56ed45a781fc88abfea7d5833bfd | ChoreChomper |
| Technical Architecture | cc464864d2e84937b01c069d2b86d11a | ChoreChomper |
| Database Schema | 0d870e26a3864b49a45a05fcd19a33e9 | ChoreChomper |
| Requirements & Features | a3ae6ad8025a4ee786b2152f7055887e | ChoreChomper |
| API Endpoints | f94efa1c84734140864c05c2af73be1a | ChoreChomper |
| Development Phases | 2e9433d44f9e43079788060febe7d394 | ChoreChomper |
| Deployment & Infrastructure | d105cc6cad9748e294e9dbc3b10db582 | ChoreChomper |
| Feature Designs | 2c4c56ed45a7811ab76ede8ac96ecf24 | ChoreChomper |
| Session Notes (CC) | 2c1c56ed45a78114... | ChoreChomper |
| Session Archive (CC) | 2c4c56ed45a7818b... | ChoreChomper |

---

## Migration Log

| Date | Document | Action |
|------|----------|--------|
| 2025-12-11 | Capabilities Audit | Migrated to references/ |
| 2025-12-11 | CLI Implementation Prompt | Migrated to prompts/ |
| 2025-12-11 | Swarm Code Review Dec 2025 | Migrated to code-reviews/ |
| 2025-12-11 | SwarmStack Landing Roadmap | Migrated to marketing/ |
| 2025-12-11 | Web Design Prompts | Migrated to marketing/ |
| 2025-12-11 | Visual Web Design Persona | Migrated to marketing/ |
| 2025-12-11 | Tracker audit | Full inventory verified against git |

---

## Quick Stats

- **Total Identified:** 38 documents
- **Migrated:** 27 documents
- **Missing (marked moved but file absent):** 3 documents
- **Empty/Delete:** 1 document
- **Keep in Notion:** 4 documents
- **Non-Swarm (skipped):** 10 documents

---

## Directory Structure

```
swarm-specs/
├── architecture/          # System architecture docs
├── business/              # Investor pitches, market analysis
├── code-reviews/          # Code review findings
├── design-docs/           # Design specifications
│   ├── mcp-factory/
│   └── ui-hitl/
├── docs/                  # General documentation
├── marketing/             # Landing page, design assets
├── planning/              # Feature roadmaps
├── prompts/               # Implementation prompts
├── references/            # Reference docs, audits
├── runbooks/              # Operational guides
├── session-notes/         # Development session notes
│   └── archive/
└── specs/                 # Technical specifications
    ├── api/
    └── schemas/
```
