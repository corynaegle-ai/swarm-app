# 18-MONTH SPRINT BREAKDOWN: AGENT OPERATIONS PLATFORM

**Timeline:** January 2026 - June 2027  
**Owner:** Cory Naegle (Founder/CEO)  
**Budget:** $8.62M total  
**Goal:** Ship MVP, sign first customers, reach Series A readiness  

---

## PHASE 1: FOUNDATION & VALIDATION (Months 1-4)

### Goal
Ship working MVP + sign 3-4 design partners

### What We're Building

**Agent Deployment Service**
- Accept Docker containers + Git URLs
- Firecracker VM per agent
- Automatic startup + health checks
- Simple CLI: `swarm deploy --agent agent.yaml`

**Audit Logging**
- SQLite database (local or cloud)
- Every agent call logged
- Searchable by agent, tool, timestamp
- Export to JSON for compliance

**Secrets Injection**
- Encrypted environment variable injection
- No secrets in container image
- Simple config: `API_KEY: ${SECRET_API_KEY}`

**Basic Dashboard**
- Agent status (running, stopped, errors)
- Daily call counts
- Error rates
- Cost tracker (basic)

**CLI Tools**
- Deploy: `swarm deploy`
- Query: `swarm logs`
- Status: `swarm status`
- Scale: `swarm scale --replicas`

### Not Building (Explicitly Deprioritized)
- Code generation
- MCP server hosting (even as optional)
- Multi-tenancy
- HIPAA certification
- Auto-scaling
- Advanced observability

### Sprint Structure (4 sprints, 1 month each)

**Sprint 1 (Jan 1-31):** Deployment Service Prototype
- Express.js API skeleton
- Docker build integration
- Basic Firecracker spawning
- Deploy -> VM running in < 5 minutes

**Sprint 2 (Feb 1-28):** Audit Logging + First Design Partners
- SQLite schema + logging
- Query interface
- First 2 design partners on system (remote testing)
- CLI tools functional

**Sprint 3 (Mar 1-31):** Secrets + Stabilization
- Secrets injection working
- Error handling + retry logic
- 3-4 design partners deployed
- Performance optimization (< 2 min deploy)

**Sprint 4 (Apr 1-30):** MVP Polish + Validation
- Dashboard improvements
- Documentation
- Design partner feedback integration
- Go/no-go decision for Phase 2

### Team (3 FTE)

| Role | Person | Hours/Week | Focus |
|------|--------|-----------|-------|
| Founder/CEO | Cory | 30 sales, 10 arch | Sales + strategy |
| Engineer #1 | TBD | 40 | Deployment service |
| Engineer #2 | TBD | 40 | Audit logging + infra |

**Support:** Designer for UI (0.5 FTE shared), DevOps if needed (contract)

### Budget: $180K/month

| Category | Monthl |
|----------|--------|
| Salaries (3 FTE) | $120K |
| Infrastructure | $20K |
| Tools/Services | $15K |
| Contractor/Design | $15K |
| Buffer | $10K |
| **Total** | **$180K** |

**Phase 1 Total: $720K**

### Success Criteria

✅ Deployment service works (agents start + restart on failure)  
✅ Audit logs working (queryable, exportable)  
✅ Secrets injection functional  
✅ 3-4 design partners deployed + giving positive feedback  
✅ Zero production issues/crashes  
✅ Deployments consistent (< 2 min)  

### Design Partner Expectations

**Who:** Companies using LangGraph/CrewAI, want to move agents to prod  
**Commitment:** 30-day pilot, daily interaction, weekly calls  
**Expectation:** Help identify bugs, suggest features, provide honest feedback  
**Compensation:** Free for 3 months, then $10K/month if they continue  

---

## PHASE 2: COMPLIANCE + SCALING (Months 5-9)

### Goal
Get first paid customer + build compliance framework + auto-scaling

### What We're Building

**Compliance Features**
- HIPAA audit logs (tamper-proof, retention policies)
- PCI DSS compliance checklist
- SOC2 Type II readiness (built-in controls)
- Compliance report generator (auto-monthly)
- Encryption: at-rest + in-transit

**Auto-Scaling**
- Scale agents 1-100 instances
- Load balancing across instances
- Cost optimization (consolidate during low usage)
- Configurable scaling policies

**Enhanced Observability**
- Real-time dashboard (latency, errors, cost)
- Per-agent + per-tool breakdowns
- Performance optimization suggestions
- Alert notifications

**First Customer**
- Contract negotiation + legal
- Custom integration support
- Dedicated success manager
- Monthly check-ins

### Not Building
- Code generation
- Multi-cloud (only Firecracker)
- Advanced RBAC
- Marketplace

### Sprint Structure (5 sprints, ~1 month each)

**Sprint 5 (May 1-31):** Compliance Framework
- HIPAA audit logging
- Encryption implementation
- Compliance checklist template
- SOC2 control documentation

**Sprint 6 (Jun 1-30):** Auto-Scaling
- Load balancer implementation
- Scaling policy engine
- Cost optimization logic
- Test at 100 concurrent agents

**Sprint 7 (Jul 1-31):** Enhanced Observability
- Real-time dashboard refresh
- Per-tool cost tracking
- Performance optimization suggestions
- Alert system

**Sprint 8 (Aug 1-31):** First Customer Integration
- Contract review + legal
- Custom features (if needed)
- Dedicated support
- Production readiness audit

**Sprint 9 (Sep 1-30):** Scale to 2-3 Customers
- Sales motion playbook
- Second customer integration
- Success metrics dashboarding
- Scaling testing (10+ customers)

### Team (6 FTE)

| Role | Person | Hours/Week | Focus |
|------|--------|-----------|-------|
| Founder/CEO | Cory | 40 sales, 0 eng | Full-time sales |
| VP Sales | TBD | 40 | Sales operations |
| Engineer #1 | (continuing) | 40 | Compliance + scaling |
| Engineer #2 | (continuing) | 40 | Observability |
| Compliance Officer | TBD | 20 | HIPAA/PCI/SOC2 |
| Customer Success | TBD | 20 | Customer onboarding |

### Budget: $250K/month

| Category | Amount |
|----------|--------|
| Salaries (6 FTE) | $170K |
| Compliance audit/cert | $30K |
| Infrastructure | $25K |
| Tools/Services | $15K |
| Buffer | $10K |
| **Total** | **$250K** |

**Phase 2 Total: $1.25M (5 months × $250K)**

### Success Criteria

✅ HIPAA/PCI compliance framework documented  
✅ Auto-scaling working (1-100 agents tested)  
✅ Observability dashboard live  
✅ 1 paid customer signed + onboarded  
✅ First customer generating $10K+/month  
✅ Customer success rate: 100% (no churn)  
✅ Sales playbook repeating (2nd customer in progress)  

---

## PHASE 3: MARKET EXPANSION (Months 10-18)

### Goal
Close 10-15 customers total + reach $80-125K MRR + Series A ready

### What We're Building

**Enterprise Features**
- SSO / SAML integration
- RBAC (role-based access control)
- Multi-workspace/multi-team
- Custom compliance templates
- Audit log retention policies

**Marketplace (Optional)**
- Pre-built MCP connectors (customers share integrations)
- Revenue share model (30/70 split)
- Third-party tool marketplace

**Sales Execution**
- Sales team scale (2-3 AEs)
- Customer success team (2-3 CSMs)
- Sales ops + marketing
- Demand gen + content

**Series A Preparation**
- Financial modeling + forecasting
- Customer testimonials + case studies
- Board reporting
- Investor meetings + due diligence

### Sprint Structure (8 sprints, ~1 month each)

**Sprints 10-12 (Oct-Dec):** Sales Velocity
- 2 AEs hired + onboarded
- Close 3-5 new customers
- Implement RBAC
- Customer success processes

**Sprints 13-14 (Jan-Feb):** Product Expansion
- SSO/SAML integration
- Marketplace foundation
- Multi-workspace implementation
- Custom compliance templates

**Sprints 15-16 (Mar-Apr):** Scale Sales
- Third AE hired
- Close 3-5 more customers (total: 10-15)
- Marketing content + campaigns
- Speaking engagements / PR

**Sprints 17-18 (May-Jun):** Series A Ready
- Financial model + growth projections
- Customer case studies (5-10)
- Board deck + investor pitch
- Due diligence preparation

### Team (9-10 FTE)

| Role | Count | Hours/Week | Focus |
|------|-------|-----------|-------|
| Founder/CEO | 1 | 40 sales | Strategy + Board |
| VP Sales | 1 | 40 | Sales org + hiring |
| Account Executives (AE) | 3 | 40 each | Closing deals |
| VP Engineering | 1 | 40 | Product + roadmap |
| Engineers | 2 | 40 each | Feature + stability |
| VP Customer Success | 1 | 40 | Retention + growth |
| Marketing | 1 | 40 | Demand gen + PR |
| Finance/Admin | 1 | 20 | Reporting + ops |

### Budget: $350K/month

| Category | Amount |
|----------|--------|
| Salaries (9-10 FTE) | $240K |
| Infrastructure | $35K |
| Sales/Marketing | $40K |
| Tools/Services | $20K |
| Travel | $10K |
| Buffer | $5K |
| **Total** | **$350K** |

**Phase 3 Total: $3.15M (9 months × $350K)**

### Success Criteria

✅ 10-15 customers signed + onboarded  
✅ $80-125K MRR ($960K - $1.5M ARR)  
✅ Logo retention: > 90%  
✅ Expansion revenue: > 30% YoY  
✅ Sales team trained + productive  
✅ Series A investor meetings underway  
✅ Board support for next round  

---

## 18-MONTH SUMMARY

| Phase | Duration | Team | Monthly Burn | Total Budget | Key Milestone |
|-------|----------|------|--------------|--------------|---------------|
| 1 (Foundation) | 4 months | 3 FTE | $180K | $720K | MVP + 3-4 design partners |
| 2 (Compliance) | 5 months | 6 FTE | $250K | $1.25M | First paid customer ($10K MRR) |
| 3 (Expansion) | 9 months | 9-10 FTE | $350K | $3.15M | 10-15 customers ($100K MRR) |
| **Total** | **18 months** | **Peak 10** | **$280K avg** | **$5.12M operations** | **Series A ready** |

**Additional Budget (not in operations):**
- Contingency/Buffer: $0.5M (10%)
- Legal/Finance setup: $0.2M
- Misc. overhead: $1.8M
- **18-Month Total: $8.62M**

---

## HIRING TIMELINE

| Month | Role | Title | Purpose |
|-------|------|-------|---------|
| 4 (Apr) | Engineer | Engineer #1 (continued hiring) | Scaling capabilities |
| 5 (May) | VP Sales | VP Sales | Sales org + hiring |
| 6 (Jun) | Compliance | Compliance Officer | HIPAA/PCI documentation |
| 6 (Jun) | Sales | CS Manager | Customer success |
| 10 (Oct) | Sales | Account Executive #1 | Close customers |
| 11 (Nov) | Sales | Account Executive #2 | Close customers |
| 12 (Dec) | VP Eng | VP Engineering | Product + roadmap |
| 13 (Jan) | Marketing | Marketing Manager | Demand generation |
| 14 (Feb) | Sales | Account Executive #3 | Scale sales |

---

## REVENUE PROJECTION

| Month | Customers | MRR | ARR | Cumulative |
|-------|-----------|-----|-----|-----------|
| 1-4 (Design partners) | 0 (pilots) | $0 | $0 | $0 |
| 5 (Phase 2 start) | 1 | $10K | $120K | $120K |
| 6 | 2 | $20K | $240K | $360K |
| 7-8 | 3-4 | $35-40K | $420-480K | $840K |
| 9 (Phase 2 end) | 4-5 | $45-50K | $540-600K | $1.32M |
| 10-12 (Phase 3 early) | 7-10 | $60-80K | $720K-960K | $2.4M |
| 13-15 | 12-15 | $90-120K | $1.08M-1.44M | $4.8M |
| 16-18 (End) | 15-18 | $120-150K | $1.44M-1.8M | $7.2M |

---

(Continued in next section...)

---

**Status:** Complete 18-month plan ready for execution  
**Next:** See execution plan for month-by-month details
