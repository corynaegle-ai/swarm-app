#!/bin/bash
# P0-3: Apply Distributed Locking to Engine
# Replaces TOCTOU race condition with atomic FOR UPDATE SKIP LOCKED

set -e
ENGINE_FILE="/opt/swarm/engine/lib/engine.js"

echo "=== P0-3: Applying Distributed Locking ==="

# Backup current file
cp "$ENGINE_FILE" "$ENGINE_FILE.bak.p0-3"
echo "✓ Backed up to $ENGINE_FILE.bak.p0-3"

# Step 1: Replace getReadyTickets with atomicClaimNext
# This new method both selects AND claims in one atomic operation

cat > /tmp/p0-3-getReadyTickets.js << 'PATCH1'
    /**
     * Get ready tickets (for display/monitoring only - NOT for claiming)
     */
    async getReadyTickets(limit) {
        const result = await this.pgPool.query(`
            SELECT * FROM tickets 
            WHERE state = 'ready' 
              AND assignee_id IS NOT NULL
              AND assignee_type = 'agent'
              AND vm_id IS NULL
            ORDER BY created_at ASC
            LIMIT $1
        `, [limit]);
        return result.rows;
    }
    
    /**
     * P0-3: Atomic claim - SELECT and UPDATE in single locked transaction
     * Uses FOR UPDATE SKIP LOCKED to prevent race conditions
     * @returns {Object|null} Claimed ticket or null if none available
     */
    async atomicClaimNext(vmId) {
        const result = await this.pgPool.query(`
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
        `, [vmId]);
        
        if (result.rows[0]) {
            notifyTicketStateChange(result.rows[0].id.toString(), "in_progress", { vmId });
        }
        return result.rows[0] || null;
    }
PATCH1

echo "✓ Prepared atomicClaimNext method"

# Step 2: Create new pollAndDispatch that uses atomic claiming
cat > /tmp/p0-3-pollAndDispatch.js << 'PATCH2'
    /**
     * P0-3: Atomic poll and dispatch - claims tickets one at a time atomically
     * Prevents race conditions when multiple engines run concurrently
     */
    async pollAndDispatch() {
        const activeCount = this.activeExecutions.size;
        const available = this.maxConcurrentVMs - activeCount;
        
        if (available <= 0) {
            return 0;
        }
        
        // Atomically claim and dispatch tickets one at a time
        let dispatched = 0;
        while (dispatched < available && !this.shuttingDown) {
            // vmId=0 is placeholder, actual VM assigned by executor
            const ticket = await this.atomicClaimNext(0);
            
            if (!ticket) {
                // No more claimable tickets
                break;
            }
            
            log('INFO', `Claimed ticket ${ticket.id}: ${ticket.title}`);
            
            try {
                // Execute without re-claiming (already claimed atomically)
                await this.executeTicketDirect(ticket);
                dispatched++;
            } catch (e) {
                log('ERROR', `Failed to execute ticket ${ticket.id}: ${e.message}`);
                // Already claimed but failed - let failTicket handle it
            }
        }
        
        if (dispatched > 0) {
            log('INFO', `Dispatched ${dispatched} tickets this cycle`);
        }
        
        return dispatched;
    }
PATCH2

echo "✓ Prepared atomic pollAndDispatch"

# Step 3: Create executeTicketDirect (skips claim since already done atomically)
cat > /tmp/p0-3-executeTicketDirect.js << 'PATCH3'
    /**
     * P0-3: Execute ticket that was already claimed atomically
     * Skips the claim step since atomicClaimNext already did it
     */
    async executeTicketDirect(ticket) {
        const ticketId = ticket.id.toString();
        log('INFO', `Executing pre-claimed ticket ${ticketId}: ${ticket.title}`);
        
        // Parse inputs
        let inputs = {};
        try {
            inputs = ticket.inputs ? JSON.parse(ticket.inputs) : {};
        } catch (e) {
            inputs = {};
        }
        
        // Create executor
        const runId = randomUUID();
        const executor = new StepExecutor(runId, { 
            db: this.registryDb, 
            useVm: process.env.SWARM_USE_VM !== "false",
            vmTimeout: this.ticketTimeoutMs,
            skipStepLogging: true
        });
        
        const vmId = ticket.vm_id || 0;
        
        // Track assignment in registry (SQLite) - ticket already claimed in PG
        this.registryStmts.assignVm.run(vmId, ticketId);
        this.activeExecutions.set(ticketId, { 
            ticketId, 
            vmId, 
            runId, 
            executor,
            startTime: Date.now() 
        });
        
        // Run async, don't await
        this.runTicketExecution(ticket, executor, runId, vmId, inputs)
            .catch(e => log('ERROR', `Ticket ${ticketId} execution error: ${e.message}`));
    }
PATCH3

echo "✓ Prepared executeTicketDirect method"

echo ""
echo "=== Patch files ready in /tmp/p0-3-*.js ==="
echo "Manual integration required into engine.js"
echo ""
echo "Key changes:"
echo "  1. Add atomicClaimNext() method after getReadyTickets()"
echo "  2. Replace pollAndDispatch() with atomic version"
echo "  3. Add executeTicketDirect() for pre-claimed tickets"
