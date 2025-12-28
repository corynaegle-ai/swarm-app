# SWARM PRODUCT PIVOT: AGENT OPERATIONS PLATFORM

**Date:** December 16, 2025  
**Status:** Complete product specification ready for execution  
**Target:** Enterprises building AI agents that need production infrastructure  

---

## EXECUTIVE SUMMARY

**Positioning:** Kubernetes for agents + Datadog for agents + Vault for agents

Enterprises are building AI agents with LangGraph, CrewAI, AutoGen. These agents work locally. But moving to production reveals:
- No reliable deployment (agents crash, no recovery)
- No compliance framework (HIPAA, PCI audit trails missing)
- No scaling (can't run 50 concurrent agents)
- No observability (which agent calls which tool? how much does each cost?)

Swarm solves this. We provide:
- **Reliable Deployment:** Fast boot times with snapshot restoration + self-hosted option
- **Compliance First:** Automatic audit logs, encrypted secrets, compliance reports
- **Automatic Scaling:** 1-100 agents on commodity hardware with simple config
- **Enterprise Observability:** Cost per agent, per tool, per execution + performance tracing

**Result:** Enterprises focus on building agents. Swarm handles production operations.

**Market:** LangGraph 400+ companies, CrewAI 60% Fortune 500, clear TAM $25-50B

---

## WHAT'S CHANGING (6 KEY SHIFTS)

### 1. Kill Agent Factory Code Generation
**Before:** Swarm generates agents for customers  
**After:** Don't do code generation at all  
**Why:** Claude/ChatGPT commoditize this. Our moat is operations, not code gen.

### 2. Accept Agents From Anywhere
**Before:** Only run Swarm-generated agents  
**After:** Support LangGraph, CrewAI, AutoGen, custom agents built locally  
**Why:** 10x larger addressable market. Enterprises build locally, deploy to Swarm.

### 3. MCP Hosting Becomes Optional Add-On
**Before:** Swarm-hosted MCP servers are core product  
**After:** $50-100/month optional feature, not core  
**Why:** Not a problem customers have. Agents call MCP servers anywhere (customer-hosted, AWS Lambda, Swarm-hosted).

### 4. New Pricing Model
**Before:** $500/agent/month + $75/MCP server/month  
**After:** $500/agent/month (base) + $0.01/execution (after 10K/month included)  
**Why:** Aligns with customer value. Running agents costs money; Swarm shares upside.

### 5. Founder Shifts to Sales + Strategy
**Before:** Founder = architect + engineer + CEO  
**After:** Founder = CEO (sales + strategy). Hire VP Sales month 4.  
**Why:** Sales is the real bottleneck. Great architecture gets zero revenue if we can't sell.

### 6. TAM Crystal Clear
**Before:** "Undefined, but probably big"  
**After:** $25-50B agent operations market  
**Why:** LangGraph adoption, CrewAI growth, customer conversations prove demand.

---

## WHAT'S BEING KILLED (EXPLICIT LIST)

These features are **removed** from core product:

- **Agent Factory code generation** (all of it)
- **Swarm-hosted MCP server infrastructure** (as core feature)
- **MCP server library/marketplace** (pre-built connectors)
- **Multi-cloud deployment** (focus: Firecracker only, not AWS/GCP/Azure)
- **Custom domain routing** (agents don't have public URLs)
- **Agent API Gateway** (agents don't expose APIs directly)
- **Real-time collaboration** (not a feature)
- **Agent versioning/rollback** (keep simple for MVP)
- **Advanced observability dashboards** (start minimal, expand later)

**These are deprioritized** (not killed, just not in Phase 1):
- AI-powered deployment suggestions
- Cost optimization recommendations
- Advanced RBAC/multi-tenancy
- Multi-region replication
- Compliance marketplace

---

## NEW CUSTOMER JOURNEY

### Before (Agent Factory Model)
```
Customer: "Help me build an underwriting agent"
Swarm: "We'll code-gen it + host MCP servers + deploy"
Customer: "Great. Can I run it on AWS instead?"
Swarm: "No, you're locked into our platform"
Customer: "Never mind, using ChatGPT + native Lambda"
```

### After (Operations Platform Model)
```
Customer: "I have underwriting agent built with LangGraph. Works locally."
Swarm: "Container it up (one command). We handle the rest."
Customer: "Need audit logs and cost tracking for compliance."
Swarm: "Auto-generated. Point to agent repo → we deploy → compliance reports."
Customer: "Need to scale from 1 to 50 concurrent agents."
Swarm: "One config change. We spawn replicas, balance load, track costs."
Customer: "Perfect. How much?"
Swarm: "$500/month + 1¢ per agent execution beyond 10K/month"
Customer: "Sold."
```

---

## PRODUCT SPECIFICATION

### Core Capabilities (MVP - Months 1-4)

**Agent Deployment**
- Accept Docker containers or Git URLs
- Automatic container registry (pull from customer's registry)
- Isolated execution per agent (MicroVM architecture)
- Automatic restart on failure
- Health checks + retry logic

**Audit Logging**
- Every agent call logged to SQLite (local or cloud)
- Immutable logs (append-only)
- Searchable by: agent, user, timestamp, tool, result
- Export to JSON for compliance reports

**Secrets Management**
- Encrypted environment variable injection
- Support: API keys, database creds, tokens
- No secrets in container image
- Access audit trail

**Cost Tracking**
- Cost per agent per day
- Cost per tool call
- Cost per execution
- Dashboard showing cost trends

**CLI + API**
- Deployment: `swarm deploy --agent-config agent.yaml`
- Query: `swarm logs --agent underwriting --since 1h`
- Status: `swarm status --agent underwriting`
- Scalability: Adjust replicas: `swarm scale underwriting --replicas 10`

### Phase 2 Capabilities (Months 5-9)

**Compliance Features**
- HIPAA compliance checklist
- PCI DSS compliance checklist
- SOC2 audit reports (auto-generated)
- Encrypted at-rest + in-transit
- Access control logging

**Auto-Scaling**
- Scale agents based on load (1-100 instances)
- Configurable thresholds
- Cost optimization (consolidate when quiet)

**Observability**
- Real-time dashboard
- Latency tracking per agent, per tool
- Error rates + stack traces
- Performance optimization recommendations

### Phase 3 Capabilities (Months 10-18)

**Enterprise Features**
- SSO / SAML integration
- RBAC (role-based access control)
- Multi-workspace/multi-team
- Audit log retention policies
- Custom compliance templates

**Marketplace**
- Pre-built MCP server connectors
- Revenue share model
- Third-party tool integrations

---

## TAM / SAM / SOM ANALYSIS

### TAM (Total Addressable Market): $25-50B

**Kubernetes market:** $10-15B (2024)  
**Datadog-style observability:** $15-20B  
**Secrets management (HashiCorp Vault):** $2-5B  
**Multiplier (agents are new workload):** 2-3x  

**Agents will be infrastructure workload like Kubernetes, requiring:** deployment, scaling, observability, compliance

### SAM (Serviceable Addressable Market): $900M

**Compliance-first enterprises** (regulated industries):
- Banking (20,000 institutions globally)
- Healthcare (50,000 providers)
- Insurance (5,000 companies)
- Government (500 major agencies)

**Assumed penetration:** 1-2% have AI agent deployment needs

**Per-company spend:** $50-250K/year (enterprise SaaS model)

### SOM (Serviceable Obtainable Market) - Year 5

**Customers:** 100-150 companies  
**Average spend:** $50K/year  
**Total:** $5-7.5M ARR

**Path:**
- Y1: 0-2 customers (validation)
- Y2: 2-5 customers ($50-100K MRR)
- Y3: 5-15 customers ($250-750K MRR)
- Y4: 15-40 customers ($1-2M MRR)
- Y5: 40-100 customers ($2-5M MRR)

---

## PRICING MODEL

### Base Tier: $500/agent/month
- 10,000 agent executions included
- HIPAA audit logs
- Encrypted secrets injection
- Basic dashboard
- Email support

### Usage Tier: $0.01/execution
- Applied to executions beyond 10,000/month
- Soft cap: If agent runs 100K executions/month → $500 + (90K × $0.01) = $1,400/month

### Example Customers

**Startup:** 2 agents, 50K executions/month  
→ $500 × 2 + (40K × $0.01) = $1,400/month ($16.8K/year)

**Mid-Market:** 10 agents, 500K executions/month  
→ $500 × 10 + (400K × $0.01) = $9,000/month ($108K/year)

**Enterprise:** 50 agents, 5M executions/month  
→ $500 × 50 + (4.99M × $0.01) = $74,900/month ($899K/year)

**Optional Add-Ons:**
- MCP Server Hosting: +$50-100/month per server
- Custom Compliance Templates: +$500-1K/month
- Dedicated Support: +$2K/month

---

## SUCCESS METRICS

### Product Success
- Agent deployment: < 2 minutes from Git repo to running VM
- Audit logs: 100% of calls logged, queryable within 1 second
- Compliance: SOC2/HIPAA reports auto-generated monthly
- Reliability: 99.9% uptime (agents run, don't crash)

### Market Success (Year 5)
- Customers: 100-150
- MRR: $400K-600K ($5-7.5M ARR)
- Logo retention: > 90%
- Expansion revenue: > 30% year-over-year

### Team Success
- Founder role: Full-time sales + strategy (30+ hours/week on sales)
- VP Sales: Hired month 4, closes first customers
- Engineering velocity: Ship Phase 1 MVP in 4 months
- Burn rate: Sustainable path to profitability by month 18

---

## COMPETITIVE POSITIONING

### vs AWS Lambda
**AWS Advantage:** Trusted brand, full ecosystem, proven reliability  
**Swarm Advantage:** Agent-native (not general compute), compliance automation, cost transparency  
**Positioning:** "Lambda is compute infrastructure. Swarm is agent operations infrastructure."

### vs Traditional CI/CD (Jenkins, GitLab)
**Jenkins Advantage:** Established, feature-rich  
**Swarm Advantage:** Built for agents, not pipelines; automatic scaling, compliance templates  
**Positioning:** "CI/CD pipelines are for code. Agent workflows are different. Built for agents."

### vs Kubernetes
**Kubernetes Advantage:** Powerful, mature, enterprise-standard  
**Swarm Advantage:** Radically simpler (1 file vs 10 YAML files), agent-specific defaults, compliance built-in  
**Positioning:** "Kubernetes is infrastructure for systems engineers. Swarm is infrastructure for AI agents."

---

## WHY THIS ADDRESSES ALL INVESTOR OBJECTIONS

(Detailed mapping in `analysis/pivot-comparison-before-after.md`)

**Shortened List:**

1. ✅ Code generation commodity? → Don't do code gen
2. ✅ MCP hosting non-problem? → Optional $50/month add-on
3. ✅ No lock-in? → Deep operational integration creates stickiness
4. ✅ Compliance doesn't differentiate? → Auto-compliance is unique moat
5. ✅ TAM undefined? → $25-50B agent operations market crystal clear
6. ✅ Projections unrealistic? → 100-150 Y5 customers is realistic and achievable
7. ✅ Founder stretched? → Hire VP Sales month 4
8. ✅ AWS crushes you? → Own category 18 months, then be premium alternative

---

## NEXT STEPS

1. **Confirm Market:** 3-4 design partners sign LOI by month 4
2. **Ship MVP:** Agent deployment + audit logs + secrets injection
3. **First Customer:** Paid contract by month 5 ($10K+/month)
4. **Scale:** 10-15 customers by month 18

---

**Status:** Complete specification, ready for execution  
**Owner:** Neural (Cory Naegle)  
**Created:** December 16, 2025  
