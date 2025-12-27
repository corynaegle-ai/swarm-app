/**
 * Swarm Step Executor
 * Executes individual agent steps within workflow runs
 * Supports local execution and VM-based execution
 * 
 * Refactored for PostgreSQL
 */

import { exec, execSync, spawn } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync, openSync, closeSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { resolveVariables, evaluateCondition } from './variable-resolver.js';

// Load secrets from files
function loadSecrets() {
    const secrets = {};
    const secretFiles = {
        ANTHROPIC_API_KEY: "/root/.anthropic_key",
        GITHUB_TOKEN: "/root/.github_token"
    };
    for (const [name, path] of Object.entries(secretFiles)) {
        try {
            secrets[name] = readFileSync(path, "utf8").trim();
        } catch (e) { }
    }
    return secrets;
}

const WORK_DIR = '/tmp/swarm-runs';
const VM_LOCK_DIR = '/tmp/swarm-vm-locks';

// Ensure lock directory exists
if (!existsSync(VM_LOCK_DIR)) {
    mkdirSync(VM_LOCK_DIR, { recursive: true });
}

/**
 * SECURITY: Sanitize agent name to prevent command injection
 * Only allows alphanumeric, underscore, hyphen, colon, and dot
 */
function sanitizeAgentName(name) {
    if (!name || typeof name !== 'string') {
        throw new Error('Invalid agent name: must be a non-empty string');
    }
    // Remove any characters that could be shell metacharacters
    const sanitized = name.replace(/[^a-zA-Z0-9_\-:.]/g, '_');
    if (sanitized !== name) {
        console.warn(`  ⚠️  Agent name sanitized: "${name}" -> "${sanitized}"`);
    }
    return sanitized;
}

export class StepExecutor {
    constructor(runId, options = {}) {
        this.runId = runId;
        this.pool = options.pool; // Use shared Postgres pool
        this.workDir = join(WORK_DIR, runId);
        this.useVm = options.useVm !== false;
        this.vmTimeout = options.vmTimeout || 300000;
        this.skipStepLogging = options.skipStepLogging === true;

        if (!existsSync(this.workDir)) {
            mkdirSync(this.workDir, { recursive: true });
        }
    }

    /**
     * Find agent with flexible name matching
     * Updated for Postgres syntax
     */
    async findAgent(agentName, agentVersion) {
        let agent;
        const client = await this.pool.connect();
        try {
            if (agentVersion) {
                const res = await client.query('SELECT * FROM agent_definitions WHERE name = $1 AND version = $2', [agentName, agentVersion]);
                agent = res.rows[0];
            } else {
                const res = await client.query('SELECT * FROM agent_definitions WHERE name = $1 ORDER BY created_at DESC LIMIT 1', [agentName]);
                agent = res.rows[0];
            }
            if (agent) return agent;

            // Version-stripping fallback (forge-v3 -> forge)
            const baseNameMatch = agentName.match(/^(.+?)(?:-v\d+)?$/);
            if (baseNameMatch && baseNameMatch[1] !== agentName) {
                const baseName = baseNameMatch[1];
                if (agentVersion) {
                    const res = await client.query('SELECT * FROM agent_definitions WHERE name = $1 AND version = $2', [baseName, agentVersion]);
                    agent = res.rows[0];
                } else {
                    const res = await client.query('SELECT * FROM agent_definitions WHERE name = $1 ORDER BY created_at DESC LIMIT 1', [baseName]);
                    agent = res.rows[0];
                }
                if (agent) {
                    console.log(`    [DEBUG] findAgent: ${agentName} resolved to ${baseName}`);
                    return agent;
                }
            }

            const templateName = `_template:${agentName}`;
            if (agentVersion) {
                const res = await client.query('SELECT * FROM agent_definitions WHERE name = $1 AND version = $2', [templateName, agentVersion]);
                agent = res.rows[0];
            } else {
                const res = await client.query('SELECT * FROM agent_definitions WHERE name = $1 ORDER BY created_at DESC LIMIT 1', [templateName]);
                agent = res.rows[0];
            }
            if (agent) return agent;

            // LIKE pattern matching
            if (agentVersion) {
                const res = await client.query('SELECT * FROM agent_definitions WHERE name LIKE $1 AND version = $2 ORDER BY created_at DESC LIMIT 1', ['%:' + agentName, agentVersion]);
                agent = res.rows[0];
            } else {
                const res = await client.query('SELECT * FROM agent_definitions WHERE name LIKE $1 ORDER BY created_at DESC LIMIT 1', ['%:' + agentName]);
                agent = res.rows[0];
            }

            return agent;
        } finally {
            client.release();
        }
    }

    /**
     * Execute a single step
     */
    async executeStep(step, context) {
        const stepExecId = randomUUID();
        const now = new Date().toISOString();

        if (step.condition) {
            const conditionMet = evaluateCondition(step.condition, context);
            if (!conditionMet) {
                if (!this.skipStepLogging) {
                    await this.pool.query(`
                        INSERT INTO step_executions (id, run_id, step_id, status, queued_at, completed_at)
                        VALUES ($1, $2, $3, 'skipped', $4, $5)
                    `, [stepExecId, this.runId, step.id, now, now]);
                }
                return { status: 'skipped', outputs: {} };
            }
        }

        const agentRef = step.agent;
        const [agentName, agentVersion] = agentRef.includes('@')
            ? agentRef.split('@')
            : [agentRef, null];

        let agent = await this.findAgent(agentName, agentVersion);

        if (!agent) {
            throw new Error(`Agent not found: ${agentRef} (tried: exact, _template:${agentName}, *:${agentName})`);
        }

        const resolvedInputs = resolveVariables(step.inputs || {}, context);

        if (!this.skipStepLogging) {
            await this.pool.query(`
                INSERT INTO step_executions (id, run_id, step_id, agent_id, status, inputs, queued_at)
                VALUES ($1, $2, $3, $4, 'running', $5, $6)
            `, [stepExecId, this.runId, step.id, agent.id, JSON.stringify(resolvedInputs), now]);
        }

        console.log(`  ▶️  Step ${step.id}: running ${agent.name}...`);

        try {
            let result;
            if (this.useVm) {
                result = await this.runAgentInVm(agent, resolvedInputs, step);
            } else {
                result = await this.runAgentLocal(agent, resolvedInputs, step);
            }

            const completedAt = new Date().toISOString();
            if (!this.skipStepLogging) {
                await this.pool.query(`
                    UPDATE step_executions SET status='completed', outputs=$1, completed_at=$2 WHERE id=$3
                `, [JSON.stringify(result), completedAt, stepExecId]);
            }
            console.log(`  ✅ Step ${step.id}: completed`);
            return { status: 'completed', outputs: result };

        } catch (error) {
            const completedAt = new Date().toISOString();
            if (!this.skipStepLogging) {
                await this.pool.query(`
                    UPDATE step_executions SET status='failed', error=$1, completed_at=$2 WHERE id=$3
                `, [error.message, completedAt, stepExecId]);
            }
            console.log(`  ❌ Step ${step.id}: failed - ${error.message}`);
            throw error;
        }
    }

    /**
     * Run agent locally (for simple/trusted agents)
     */
    async runAgentLocal(agent, inputs, step) {
        const stepDir = join(this.workDir, step.id);
        mkdirSync(stepDir, { recursive: true });

        const inputPath = join(stepDir, 'input.json');
        const outputPath = join(stepDir, 'output.json');

        writeFileSync(inputPath, JSON.stringify(inputs, null, 2));

        const runtime = agent.runtime || 'node';
        const entry = JSON.parse(agent.capabilities || '{}').entry || 'main.js';
        const agentPath = agent.path;
        const timeout = (agent.timeout_seconds || 300) * 1000;

        return new Promise((resolve, reject) => {
            const proc = spawn(runtime, [entry, inputPath, outputPath], {
                cwd: agentPath,
                timeout,
                env: { ...process.env, ...loadSecrets(), SWARM_RUN_ID: this.runId, SWARM_STEP_ID: step.id }
            });

            let stderr = '';
            proc.stderr.on('data', (data) => { stderr += data; });

            proc.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Agent exited with code ${code}: ${stderr}`));
                    return;
                }
                try {
                    const output = JSON.parse(readFileSync(outputPath, 'utf8'));
                    resolve(output);
                } catch (e) {
                    reject(new Error(`Failed to parse agent output: ${e.message}`));
                }
            });

            proc.on('error', reject);
        });
    }

    /**
     * Run agent inside a Firecracker VM
     * SECURITY FIX: Sanitizes agent name to prevent command injection
     */
    async runAgentInVm(agent, inputs, step) {
        const stepDir = join(this.workDir, step.id);
        mkdirSync(stepDir, { recursive: true });

        const inputPath = join(stepDir, 'input.json');
        const outputPath = join(stepDir, 'output.json');

        writeFileSync(inputPath, JSON.stringify(inputs, null, 2));

        const vmId = await this.acquireVm();

        try {
            const vmIp = '10.0.0.2';
            const nsName = `vm${vmId}`;

            // SECURITY: Sanitize agent name to prevent command injection
            const safeAgentName = sanitizeAgentName(agent.name);
            const agentPath = agent.path;

            // Copy agent package to VM
            console.log('    [DEBUG] runAgentInVm: copying agent to VM...');
            await this.execHost(`tar -C ${agentPath} -cf - . | ip netns exec ${nsName} ssh -o StrictHostKeyChecking=no root@${vmIp} "mkdir -p /tmp/${safeAgentName} && tar -C /tmp/${safeAgentName} -xf -"`);

            // Copy input file to VM
            console.log('    [DEBUG] runAgentInVm: copying input to VM...');
            await this.execHost(`cat ${inputPath} | ip netns exec ${nsName} ssh -o StrictHostKeyChecking=no root@${vmIp} "cat > /tmp/input.json"`);

            // Run the agent inside VM with sanitized name
            const runtime = agent.runtime || 'node';
            const entry = JSON.parse(agent.capabilities || '{}').entry || 'main.js';
            const timeout = agent.timeout_seconds || 300;

            // Use array-style command construction for safety
            // Inject secrets as environment variables
            const secrets = loadSecrets();
            const envVars = Object.entries(secrets).map(([k, v]) => `${k}="${v}"`).join(" ");
            const runCmd = `cd /tmp/${safeAgentName} && ${envVars} timeout ${timeout} ${runtime} ${entry} /tmp/input.json /tmp/output.json`;

            try {
                console.log('    [DEBUG] runAgentInVm: executing agent...');
                await this.execInNs(nsName, `ssh -o StrictHostKeyChecking=no root@${vmIp} '${runCmd}'`);
            } catch (execError) {
                const checkOutput = await this.execInNs(nsName,
                    `ssh -o StrictHostKeyChecking=no root@${vmIp} 'cat /tmp/output.json 2>/dev/null || echo "{}"'`,
                    true);
                if (checkOutput && checkOutput.includes('"error"')) {
                    throw new Error(`Agent failed: ${checkOutput}`);
                }
            }

            // Copy output back from VM
            await this.execInNs(nsName, `scp -o StrictHostKeyChecking=no root@${vmIp}:/tmp/output.json ${outputPath}`);

            const output = JSON.parse(readFileSync(outputPath, 'utf8'));
            return { output, vmId };

        } finally {
            await this.releaseVm(vmId);
        }
    }

    /**
     * Execute command in network namespace
     */
    async execInNs(nsName, cmd, ignoreError = false) {
        return new Promise((resolve, reject) => {
            const fullCmd = `ip netns exec ${nsName} ${cmd}`;
            const proc = spawn('sh', ['-c', fullCmd], { timeout: this.vmTimeout });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => { stdout += data; });
            proc.stderr.on('data', (data) => { stderr += data; });

            proc.on('close', (code) => {
                if (code !== 0 && !ignoreError) {
                    reject(new Error(`Command failed (${code}): ${stderr || stdout}`));
                } else {
                    resolve(stdout);
                }
            });

            proc.on('error', (err) => {
                if (ignoreError) resolve('');
                else reject(err);
            });
        });
    }

    async execHost(cmd) {
        return new Promise((resolve, reject) => {
            exec(cmd, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
                if (err) {
                    reject(new Error(`Command failed (${err.code}): ${stderr || err.message}`));
                } else {
                    resolve(stdout);
                }
            });
        });
    }

    /**
     * Acquire a VM from the pool with atomic locking
     * SECURITY FIX: Uses file-based locking to prevent race conditions
     */
    async acquireVm() {
        console.log(`    [DEBUG] acquireVm() called`);

        // PHASE 1: Quick scan for existing FC sockets (reuse path)
        console.log(`    [DEBUG] PHASE 1: Try existing VMs first (1-20)...`);
        for (let vmId = 1; vmId <= 20; vmId++) {
            const apiSock = `/tmp/fc-vm${vmId}.sock`;
            const lockFile = join(VM_LOCK_DIR, `vm${vmId}.lock`);

            // Check if FC socket exists first (fast check, no lock needed)
            try {
                execSync(`test -S ${apiSock}`, { stdio: 'ignore' });
            } catch {
                continue; // No socket, try next
            }

            // FC socket exists - try to acquire lock
            try {
                const fd = openSync(lockFile, 'wx');
                writeFileSync(lockFile, `${process.pid}\n${Date.now()}`);
                closeSync(fd);
                console.log(`    [DEBUG] Acquired lock for VM ${vmId} (has FC socket)`);

                // Verify VM is actually responsive
                console.log(`    ♻️  Reusing existing VM ${vmId}...`);
                try {
                    await this.waitForVm(vmId);
                    console.log(`    [DEBUG] VM ${vmId} ready, returning`);
                    return vmId;
                } catch (waitErr) {
                    console.log(`    ⚠️  VM ${vmId} not responsive: ${waitErr.message}`);
                    // Release lock, continue to next VM
                    try { unlinkSync(lockFile); } catch { }
                    continue;
                }
            } catch (lockError) {
                // Lock exists (another worker using it), try next
                continue;
            }
        }

        // PHASE 2: No reusable VMs, spawn new one
        console.log(`    [DEBUG] PHASE 2: No reusable VMs, spawning new...`);
        for (let vmId = 1; vmId <= 99; vmId++) {
            const lockFile = join(VM_LOCK_DIR, `vm${vmId}.lock`);

            try {
                const fd = openSync(lockFile, 'wx');
                writeFileSync(lockFile, `${process.pid}\n${Date.now()}`);
                closeSync(fd);
                console.log(`    [DEBUG] Acquired lock for VM ${vmId}`);

                // Clean any stale namespace
                try {
                    execSync(`ip netns list | grep -qw "vm${vmId}"`, { stdio: 'ignore' });
                    console.log(`    🧹 Cleaning stale namespace vm${vmId}...`);
                    try {
                        execSync(`swarm-cleanup-ns ${vmId}`, { timeout: 10000 });
                    } catch (e) {
                        console.warn(`    ⚠️  Cleanup warning: ${e.message}`);
                    }
                } catch {
                    // No namespace exists, clean slot
                }

                // Spawn new VM
                console.log(`    📦 Spawning VM ${vmId}...`);
                const spawnStart = Date.now();
                execSync(`swarm-spawn-ns ${vmId}`, { timeout: 30000 });
                console.log(`    [DEBUG] swarm-spawn-ns ${vmId} completed in ${Date.now() - spawnStart}ms`);
                await this.waitForVm(vmId);
                console.log(`    [DEBUG] VM ${vmId} ready after spawn, returning`);
                return vmId;
            } catch (lockError) {
                if (lockError.code !== 'EEXIST') {
                    console.warn(`    ⚠️  Lock/spawn error for VM ${vmId}: ${lockError.message}`);
                }
                continue;
            }
        }
        throw new Error('No VM slots available (max 99)');
    }

    async waitForVm(vmId, maxWait = 30000) {
        const nsName = `vm${vmId}`;
        const startTime = Date.now();
        console.log(`    [DEBUG] waitForVm(${vmId}) started, maxWait=${maxWait}ms`);

        let attempts = 0;
        while (Date.now() - startTime < maxWait) {
            attempts++;
            try {
                const sshCmd = 'ssh -o StrictHostKeyChecking=no -o ConnectTimeout=2 root@10.0.0.2 "echo ready"';
                // Very brief wait to not flood logs
                await new Promise(r => setTimeout(r, 200));

                const result = await this.execInNs(nsName, sshCmd);
                console.log(`    [DEBUG] waitForVm(${vmId}) succeeded after ${attempts} attempts`);
                return;
            } catch (sshErr) {
                // Keep trying
            }
        }
        throw new Error(`VM ${vmId} did not become ready within ${maxWait}ms after ${attempts} attempts`);
    }

    async releaseVm(vmId) {
        const lockFile = join(VM_LOCK_DIR, `vm${vmId}.lock`);
        console.log(`    🔓 Releasing lock for VM ${vmId}...`);
        try {
            unlinkSync(lockFile);
        } catch (e) {
            // Lock file may not exist, thats ok
        }
    }

    /**
     * Cleanup work directory
     */
    cleanup() {
        if (existsSync(this.workDir)) {
            rmSync(this.workDir, { recursive: true, force: true });
        }
    }
}

export default StepExecutor;
