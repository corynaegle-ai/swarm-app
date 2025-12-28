# Continue: Swarm Verifier - Dashboard UI Phase 8

## Context
Phases 1-7 complete. Verifier service running on port 8090 with full agent integration. Need to add verification status visualization to the dashboard.

## Phase 8: Dashboard Verification UI (P1)

### Tasks
1. **TicketCard.jsx** - Add verification_status badge
   - Color-coded: green=passed, yellow=verifying, red=failed/blocked, gray=unverified
   - Show rejection_count if > 0

2. **TicketDetail.jsx** - Verification details panel
   - SENTINEL score display (0-100)
   - SENTINEL decision (APPROVE/REJECT/REVIEW)
   - feedback_for_agent array (collapsible list)
   - Verification timestamp

3. **API updates** - Include verification fields
   - Ensure /api/tickets returns verification_status, verification_evidence
   - Add /api/tickets/:id/verification-history endpoint (query verification_attempts)

4. **Verification History View**
   - Table of past verification attempts
   - Columns: attempt#, timestamp, phases_completed, status, sentinel_score

### Database Schema Reference
```sql
-- tickets table
verification_status TEXT DEFAULT 'unverified'  -- unverified|passed|failed|verifying
verification_evidence TEXT                      -- JSON blob from verifier
rejection_count INTEGER DEFAULT 0

-- verification_attempts table (in swarm-platform/data/swarm.db)
ticket_id, attempt_number, status, phases_completed, 
sentinel_result, sentinel_decision, sentinel_score, created_at
```

### Files to Modify
- /opt/swarm-dashboard/src/components/TicketCard.jsx
- /opt/swarm-dashboard/src/pages/TicketDetail.jsx (create if needed)
- /opt/swarm-dashboard/src/api/tickets.js
- /opt/swarm-platform/routes/tickets.js (API)

### Badge Component Example
```jsx
const VerificationBadge = ({ status, rejectionCount }) => {
  const colors = {
    passed: 'bg-green-100 text-green-800',
    verifying: 'bg-yellow-100 text-yellow-800', 
    failed: 'bg-red-100 text-red-800',
    blocked: 'bg-red-200 text-red-900',
    unverified: 'bg-gray-100 text-gray-600'
  };
  return (
    <span className={`px-2 py-1 rounded text-xs ${colors[status]}`}>
      {status} {rejectionCount > 0 && `(${rejectionCount})`}
    </span>
  );
};
```

## SSH
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
```

## CRITICAL
- Never use heredoc for file transfers
- Use scp or git for file deployment
- Dashboard is React SPA at /opt/swarm-dashboard
- Rebuild with: cd /opt/swarm-dashboard && npm run build && pm2 restart swarm-dashboard

## Verification
- Test badge rendering with different states
- Verify API returns verification fields
- Check verification_attempts query works
