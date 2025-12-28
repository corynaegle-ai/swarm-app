// P0-4: Add Heartbeat + Stale Ticket Reaper to Engine
const fs = require('fs');

const enginePath = '/opt/swarm/engine/lib/engine.js';
let content = fs.readFileSync(enginePath, 'utf8');

// 1. Update atomicClaimNext to set initial heartbeat
const oldAtomicClaim = `SET state = 'in_progress', 
                vm_id = $1, 
                started_at = NOW(), 
                updated_at = NOW()`;

const newAtomicClaim = `SET state = 'in_progress', 
                vm_id = $1, 
                started_at = NOW(), 
                last_heartbeat = NOW(),
                updated_at = NOW()`;

if (content.includes(oldAtomicClaim)) {
    content = content.replace(oldAtomicClaim, newAtomicClaim);
    console.log('✓ Updated atomicClaimNext to set initial heartbeat');
} else {
    console.log('⚠ atomicClaimNext already has heartbeat or pattern not found');
}

// 2. Add heartbeat config to constructor after activeExecutions
const afterActiveExec = `this.activeExecutions = new Map(); // ticketId → { vmId, startTime, executor }`;
const withHeartbeat = `this.activeExecutions = new Map(); // ticketId → { vmId, startTime, executor }
        this.heartbeatInterval = null;
        this.reaperInterval = null;
        this.HEARTBEAT_INTERVAL_MS = 30000;  // 30 seconds
        this.STALE_THRESHOLD_MINUTES = 5;    // 5 minutes without heartbeat = stale
        this.REAPER_INTERVAL_MS = 60000;     // Check for stale every 60 seconds`;

if (content.includes(afterActiveExec) && !content.includes('this.heartbeatInterval')) {
    content = content.replace(afterActiveExec, withHeartbeat);
    console.log('✓ Added heartbeat config to constructor');
} else if (content.includes('this.heartbeatInterval')) {
    console.log('⚠ Heartbeat config already exists');
}

// 3. Add startHeartbeat() call in start() method
const startLogLine = "log('INFO', `Engine started (PID ${process.pid})`);";
const startWithHeartbeat = "log('INFO', `Engine started (PID ${process.pid})`);\n            this.startHeartbeat();";

if (content.includes(startLogLine) && !content.includes('this.startHeartbeat()')) {
    content = content.replace(startLogLine, startWithHeartbeat);
    console.log('✓ Added startHeartbeat() to start()');
}

// 4. Add stopHeartbeat() call in stop() method  
const stopLogLine = "log('INFO', 'Engine stopped');";
const stopWithHeartbeat = "this.stopHeartbeat();\n        log('INFO', 'Engine stopped');";

if (content.includes(stopLogLine) && !content.includes('this.stopHeartbeat()')) {
    content = content.replace(stopLogLine, stopWithHeartbeat);
    console.log('✓ Added stopHeartbeat() to stop()');
}

// 5. Add heartbeat methods before class closing brace
const heartbeatMethods = `
    /**
     * P0-4: Update heartbeat for all active tickets
     */
    async heartbeatActiveTickets() {
        const ticketIds = Array.from(this.activeExecutions.keys());
        if (ticketIds.length === 0) return;
        
        try {
            const result = await this.pgPool.query(\`
                UPDATE tickets 
                SET last_heartbeat = NOW(), heartbeat_count = COALESCE(heartbeat_count, 0) + 1
                WHERE id = ANY($1::text[]) AND state = 'in_progress'
            \`, [ticketIds]);
            log('DEBUG', \`Heartbeat updated for \${result.rowCount} tickets\`);
        } catch (e) {
            log('WARN', \`Heartbeat update failed: \${e.message}\`);
        }
    }
    
    /**
     * P0-4: Reclaim tickets stuck in_progress with stale heartbeat
     * Uses FOR UPDATE SKIP LOCKED to prevent conflicts with other reapers
     */
    async reclaimStaleTickets() {
        try {
            const result = await this.pgPool.query(\`
                WITH stale AS (
                    SELECT id FROM tickets
                    WHERE state = 'in_progress'
                      AND last_heartbeat < NOW() - INTERVAL '5 minutes'
                    FOR UPDATE SKIP LOCKED
                )
                UPDATE tickets t
                SET state = 'ready', 
                    vm_id = NULL, 
                    started_at = NULL, 
                    last_heartbeat = NULL,
                    heartbeat_count = 0,
                    updated_at = NOW()
                FROM stale s
                WHERE t.id = s.id
                RETURNING t.id, t.title
            \`);
            
            if (result.rows.length > 0) {
                for (const row of result.rows) {
                    log('WARN', \`Reclaimed stale ticket \${row.id}: \${row.title}\`);
                    notifyTicketStateChange(row.id.toString(), 'ready', { reclaimed: true });
                }
            }
            return result.rows.length;
        } catch (e) {
            log('ERROR', \`Stale ticket reaper failed: \${e.message}\`);
            return 0;
        }
    }
    
    /**
     * P0-4: Start heartbeat and reaper intervals
     */
    startHeartbeat() {
        if (this.heartbeatInterval) return;
        
        this.heartbeatInterval = setInterval(() => {
            this.heartbeatActiveTickets().catch(e => 
                log('ERROR', \`Heartbeat loop error: \${e.message}\`)
            );
        }, this.HEARTBEAT_INTERVAL_MS);
        
        this.reaperInterval = setInterval(() => {
            this.reclaimStaleTickets().catch(e =>
                log('ERROR', \`Reaper loop error: \${e.message}\`)
            );
        }, this.REAPER_INTERVAL_MS);
        
        log('INFO', \`Heartbeat started (interval=\${this.HEARTBEAT_INTERVAL_MS}ms, stale=\${this.STALE_THRESHOLD_MINUTES}min)\`);
    }
    
    /**
     * P0-4: Stop heartbeat and reaper intervals
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        if (this.reaperInterval) {
            clearInterval(this.reaperInterval);
            this.reaperInterval = null;
        }
        log('INFO', 'Heartbeat stopped');
    }`;

// Find the class closing: "    }\n}\n\nexport default SwarmEngine;"
const classEndMarker = `    }
}

export default SwarmEngine;`;

if (content.includes(classEndMarker) && !content.includes('heartbeatActiveTickets')) {
    content = content.replace(classEndMarker, `    }
${heartbeatMethods}
}

export default SwarmEngine;`);
    console.log('✓ Added heartbeat methods to class');
} else if (content.includes('heartbeatActiveTickets')) {
    console.log('⚠ Heartbeat methods already exist');
} else {
    console.log('⚠ Could not find class end pattern');
}

fs.writeFileSync(enginePath, content);
console.log('');
console.log('=== P0-4: Heartbeat + Reaper Applied ===');
