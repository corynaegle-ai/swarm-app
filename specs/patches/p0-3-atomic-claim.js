/**
 * P0-3: Atomic Ticket Claiming with FOR UPDATE SKIP LOCKED
 * 
 * Replaces separate getReadyTickets() + claimTicket() with single atomic operation.
 * Prevents race conditions when multiple engine instances compete for tickets.
 */

/**
 * Atomic claim - single query that selects AND claims in one transaction
 * Uses CTE with FOR UPDATE SKIP LOCKED to prevent race conditions
 * 
 * @param {Pool} pgPool - PostgreSQL connection pool
 * @param {string} vmId - The VM claiming the ticket
 * @param {string|null} agentId - Optional: claim ticket for specific agent
 * @returns {Object|null} - The claimed ticket or null if none available
 */
async function atomicClaimTicket(pgPool, vmId, agentId = null) {
    // Build the filter conditions
    let whereClause = `state = 'ready' AND vm_id IS NULL AND assignee_id IS NOT NULL AND assignee_type = 'agent'`;
    const params = [vmId];
    
    if (agentId) {
        whereClause += ` AND assignee_id = $2`;
        params.push(agentId);
    }
    
    const result = await pgPool.query(`
        WITH claimable AS (
            SELECT id FROM tickets
            WHERE ${whereClause}
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
    `, params);
    
    return result.rows[0] || null;
}

/**
 * Claim multiple tickets atomically (for batch operations)
 * 
 * @param {Pool} pgPool - PostgreSQL connection pool  
 * @param {string} vmId - The VM claiming tickets
 * @param {number} limit - Max tickets to claim
 * @returns {Array} - Array of claimed tickets
 */
async function atomicClaimMultiple(pgPool, vmId, limit = 1) {
    const result = await pgPool.query(`
        WITH claimable AS (
            SELECT id FROM tickets
            WHERE state = 'ready' 
              AND vm_id IS NULL 
              AND assignee_id IS NOT NULL 
              AND assignee_type = 'agent'
            ORDER BY created_at ASC
            LIMIT $2
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
    `, [vmId, limit]);
    
    return result.rows;
}

module.exports = { atomicClaimTicket, atomicClaimMultiple };
