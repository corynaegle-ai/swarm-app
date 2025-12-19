# Model Configuration Bugfix Prompt

## Context
We implemented complexity-based model selection for VM agents. Code review found several issues that need fixing.

## Files to Edit
- `/opt/swarm/agents/pull-agent.js`
- `/opt/swarm-tickets/api-server.js`

## TODO List

### 🚨 CRITICAL (Must Fix)

- [ ] **Fix claim status check** - `pull-agent.js` line ~111
  ```javascript
  // CHANGE FROM:
  if (res.status === 200 && res.data.status === 'ok') {
  
  // CHANGE TO:
  if (res.status === 200 && res.data.status === 'claimed') {
  ```
  **Why:** API returns `"status": "claimed"`, not `"ok"`. Agents currently can never claim tickets.

---

### ⚠️ MEDIUM (Should Fix)

- [ ] **Use structured logger in selectModel** - `pull-agent.js` lines 46-54
  ```javascript
  // CHANGE FROM:
  console.log('Model: Using project-level override', { model: projectSettings.default_model });
  console.log('Model: Using ticket-level override', { model: ticket.model });
  console.log('Model: Selected by scope', { scope, model });
  
  // CHANGE TO:
  log.info('Model selected', { source: 'project-override', model: projectSettings.default_model });
  log.info('Model selected', { source: 'ticket-override', model: ticket.model });
  log.info('Model selected', { source: 'scope', scope, model });
  ```

- [ ] **Add model validation** - `pull-agent.js` - add after MODEL_BY_SCOPE definition
  ```javascript
  const VALID_MODELS = new Set(Object.values(MODEL_BY_SCOPE));
  
  // Then in selectModel(), wrap project override:
  if (projectSettings?.default_model) {
    if (VALID_MODELS.has(projectSettings.default_model)) {
      log.info('Model selected', { source: 'project-override', model: projectSettings.default_model });
      return projectSettings.default_model;
    }
    log.error('Invalid project model, ignoring', { invalid: projectSettings.default_model });
  }
  ```

---

### 📋 MINOR (Nice to Have)

- [ ] **Use optional chaining** - `pull-agent.js` line 44
  ```javascript
  // CHANGE FROM:
  if (projectSettings && projectSettings.default_model) {
  
  // CHANGE TO:
  if (projectSettings?.default_model) {
  ```

- [ ] **Add ticket null check** - `pull-agent.js` line 50
  ```javascript
  // CHANGE FROM:
  if (ticket.model) {
  
  // CHANGE TO:
  if (ticket?.model) {
  ```

- [ ] **Add safe JSON parsing** - `api-server.js` - add helper function before routes
  ```javascript
  function safeParse(str, fallback, fieldName) {
    try {
      return JSON.parse(str || JSON.stringify(fallback));
    } catch (e) {
      console.error(`JSON parse error in ${fieldName}:`, str?.substring(0, 100));
      return fallback;
    }
  }
  ```
  Then use in claim response:
  ```javascript
  acceptance_criteria: safeParse(ticket.acceptance_criteria, [], 'acceptance_criteria'),
  files_hint: safeParse(ticket.files_hint, [], 'files_hint'),
  project_settings: safeParse(ticket.project_settings, {}, 'project_settings')
  ```

---

## Verification Steps

After fixes, run these tests:

```bash
# SSH to droplet
ssh -i ~/.ssh/swarm_key root@146.190.35.235

# Set PATH
export PATH=/usr/bin:/usr/local/bin:/bin

# 1. Syntax check pull-agent
node --check /opt/swarm/agents/pull-agent.js && echo "✅ Syntax OK"

# 2. Restart ticket API
pkill -f 'node.*api-server' ; cd /opt/swarm-tickets && node api-server.js &

# 3. Test claim returns 'claimed' and agent parses it
curl -s -X POST localhost:8080/claim -H 'Content-Type: application/json' \
  -d '{"agent_id":"test"}' | jq .status
# Should output: "claimed"

# 4. Release test ticket
curl -s -X POST localhost:8080/release -H 'Content-Type: application/json' \
  -d '{"ticket_id":"<ID_FROM_ABOVE>","agent_id":"test"}'

# 5. Commit fixes
cd /opt/swarm && git add -A && git commit -m "fix: critical claim status check and code review items"
cd /opt/swarm-tickets && git add -A && git commit -m "fix: add safe JSON parsing for claim response"
git push (both repos)
```

## Success Criteria
- [ ] `node --check` passes on both files
- [ ] Claim endpoint returns ticket successfully  
- [ ] No unstructured console.log in selectModel output
- [ ] Invalid model in project_settings logs error but doesn't crash
