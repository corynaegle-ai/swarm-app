// P0-3: Insert atomicClaimNext method and modify engine.js for distributed locking
const fs = require('fs');

const enginePath = '/opt/swarm/engine/lib/engine.js';
let content = fs.readFileSync(enginePath, 'utf8');

// The new atomicClaimNext method
const atomicClaimMethod = `
    /**
     * P0-3: Atomic claim - SELECT and UPDATE in single locked transaction
     * Uses FOR UPDATE SKIP LOCKED to prevent race conditions
     * @returns {Object|null} Claimed ticket or null if none available
     */
    async atomicClaimNext(vmId) {
        const result = await this.pgPool.query(\`
            WITH claimable AS (
                SELECT id FROM tickets
                WHERE state = 'ready' 
                  AND vm_id IS NULL 
                  AND assignee_id IS NOT NULL 
                  AND assignee_type = 'agent'
                ORDER BY created_at ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            UPDATE tickets t
            SET state = 'in_progress', 
                vm_id = $1, 
                started_at = NOW(), 
                updated_at = NOW()
            FROM claimable c
            WHERE t.id = c.id
            RETURNING t.*
        \`, [vmId]);
        
        if (result.rows[0]) {
            notifyTicketStateChange(result.rows[0].id.toString(), "in_progress", { vmId });
        }
        return result.rows[0] || null;
    }
`;

// Find the end of claimTicket method
const claimTicketEnd = `        return result.rowCount;
    }
    
    /**
     * Complete ticket`;

if (!content.includes(claimTicketEnd)) {
    console.error('Could not find claimTicket method end marker');
    process.exit(1);
}

// Insert after claimTicket's closing brace
const insertPoint = `        return result.rowCount;
    }
${atomicClaimMethod}
    /**
     * Complete ticket`;

content = content.replace(claimTicketEnd, insertPoint);
console.log('✓ Added atomicClaimNext() method');

// Modify _pollOnce to use atomic claiming
const oldPollOnce = `    async _pollOnce() {
        // Check capacity
        const activeCount = this.activeExecutions.size;
        const available = this.maxConcurrentVMs - activeCount;
        
        if (available <= 0) {
            return 0;
        }
        
        // Get ready tickets from PostgreSQL
        const tickets = await this.getReadyTickets(available);
        
        if (tickets.length === 0) {
            return 0;
        }
        
        log('INFO', \`Found \${tickets.length} ready tickets (capacity: \${available})\`);
        
        // Dispatch each ticket
        let dispatched = 0;
        for (const ticket of tickets) {
            if (this.shuttingDown) break;
            
            try {
                await this.executeTicket(ticket);
                dispatched++;
            } catch (e) {
                log('ERROR', \`Failed to dispatch ticket \${ticket.id}: \${e.message}\`);
            }
        }
        
        return dispatched;
    }`;

const newPollOnce = `    async _pollOnce() {
        // Check capacity
        const activeCount = this.activeExecutions.size;
        const available = this.maxConcurrentVMs - activeCount;
        
        if (available <= 0) {
            return 0;
        }
        
        // P0-3: Atomic claim loop - prevents race conditions with FOR UPDATE SKIP LOCKED
        let dispatched = 0;
        while (dispatched < available && !this.shuttingDown) {
            // Atomically claim next available ticket (vmId=0 is placeholder)
            const ticket = await this.atomicClaimNext(0);
            
            if (!ticket) {
                break;  // No more claimable tickets
            }
            
            log('INFO', \`Atomically claimed ticket \${ticket.id}: \${ticket.title}\`);
            
            try {
                // Execute with alreadyClaimed=true to skip redundant claim
                await this.executeTicket(ticket, true);
                dispatched++;
            } catch (e) {
                log('ERROR', \`Failed to execute ticket \${ticket.id}: \${e.message}\`);
            }
        }
        
        return dispatched;
    }`;

if (!content.includes('const tickets = await this.getReadyTickets(available);')) {
    console.error('Could not find _pollOnce method');
    process.exit(1);
}

content = content.replace(oldPollOnce, newPollOnce);
console.log('✓ Modified _pollOnce() to use atomic claiming');

// Modify executeTicket to accept alreadyClaimed parameter
const oldExecuteTicketSig = `    async executeTicket(ticket) {`;
const newExecuteTicketSig = `    async executeTicket(ticket, alreadyClaimed = false) {`;
content = content.replace(oldExecuteTicketSig, newExecuteTicketSig);

// Modify the claim block in executeTicket to skip if alreadyClaimed
const oldClaimBlock = `        // Claim ticket atomically
        const claimed = await this.claimTicket(vmId, ticketId);
        if (claimed === 0) {
            // Race condition - another process claimed it
            log('WARN', \`Ticket \${ticketId} already claimed\`);
            return;
        }`;

const newClaimBlock = `        // P0-3: Skip claim if already claimed atomically by _pollOnce
        if (!alreadyClaimed) {
            const claimed = await this.claimTicket(vmId, ticketId);
            if (claimed === 0) {
                log('WARN', \`Ticket \${ticketId} already claimed\`);
                return;
            }
        }`;

if (!content.includes('// Claim ticket atomically')) {
    console.error('Could not find claim block in executeTicket');
    process.exit(1);
}

content = content.replace(oldClaimBlock, newClaimBlock);
console.log('✓ Modified executeTicket() to accept alreadyClaimed flag');

fs.writeFileSync(enginePath, content);
console.log('');
console.log('=== P0-3: Distributed Locking Applied ===');
