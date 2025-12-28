# Deploy TicketDetail CSS Fix to Production

## Context
The TicketDetail page had a CSS layout bug where content appeared behind the sidebar navigation. This was fixed on DEV by changing incorrect class names (`layout-container`, `main-content`) to the correct ones (`page-container`, `page-main`).

**DEV Commit**: `fe89819` - fix(dashboard): TicketDetail use correct layout classes

## Pre-Deployment Checklist
- [ ] Verify fix works on DEV: https://dashboard.dev.swarmstack.net/tickets/8428aeca-cf19-4bf8-bc2f-92943b831246
- [ ] Content should be positioned to the right of the 260px sidebar
- [ ] Activity timeline panel should be visible on the right

## Deployment Steps

### 1. SSH to Production Droplet
```bash
ssh -i ~/.ssh/swarm_key root@146.190.35.235
export PATH=/root/.nvm/versions/node/v22.12.0/bin:$PATH
```

### 2. Pull Latest Code
```bash
cd /opt/swarm-app
git fetch origin
git log --oneline -3  # Verify current state
git pull origin main
git log --oneline -3  # Confirm fe89819 is present
```

### 3. Rebuild Dashboard
```bash
cd /opt/swarm-app/apps/dashboard
npm run build
```

### 4. Verify Build Output
- Should see `dist/` folder updated
- No build errors

### 5. Restart Services (if needed)
```bash
pm2 restart swarm-platform-prod  # If platform serves static files
# OR just verify nginx is serving the new dist/
ls -la /opt/swarm-app/apps/dashboard/dist/
```

## Post-Deployment Validation

### Test URLs
| Page | URL | Expected |
|------|-----|----------|
| Ticket Detail | https://dashboard.swarmstack.net/tickets/{any-ticket-id} | Content right of sidebar |
| Tickets List | https://dashboard.swarmstack.net/tickets | Should still work |
| Kanban | https://dashboard.swarmstack.net/tickets/kanban | Should still work |

### Visual Checks
1. Open any ticket detail page
2. Verify sidebar is on left (260px wide)
3. Verify main content is NOT behind sidebar
4. Verify Activity Timeline panel visible on right side
5. Check responsive behavior (resize browser)

### Console Checks
- Open browser DevTools (F12)
- No CSS errors in console
- No 404s for assets

## Rollback Plan
If issues occur:
```bash
cd /opt/swarm-app
git log --oneline -5  # Find previous commit
git reset --hard <previous-commit>
cd apps/dashboard && npm run build
```

## Environment Reference
| Env | Dashboard URL | API URL | Droplet IP |
|-----|---------------|---------|------------|
| DEV | dashboard.dev.swarmstack.net | api.dev.swarmstack.net | 134.199.235.140 |
| PROD | dashboard.swarmstack.net | api.swarmstack.net | 146.190.35.235 |

## Success Criteria
- [ ] TicketDetail page content properly offset from sidebar
- [ ] No visual regressions on other pages
- [ ] Activity timeline renders correctly
- [ ] All existing functionality intact
