#!/usr/bin/env node
import { Command } from 'commander';
import { SwarmEngine } from '../lib/engine.js';

const program = new Command();

program
    .name('swarm-engine')
    .description('Swarm Execution Engine')
    .version('1.0.0');

program.command('start')
    .description('Start the execution engine')
    .option('-p, --poll-interval <ms>', 'Polling interval in ms', '5000')
    .option('-m, --max-vms <count>', 'Max concurrent VMs', '10')
    .action(async (options) => {
        try {
            const engine = new SwarmEngine({
                pollInterval: parseInt(options.pollInterval),
                maxVMs: parseInt(options.maxVms)
            });

            console.log('Starting Swarm Engine...');
            await engine.init();
            await engine.start();

            // Handle graceful shutdown signals are already set up in engine.start()
            // But we can keep the process alive here if needed, 
            // though engine.start() runs a loop so it awaits.

        } catch (err) {
            console.error('Fatal error:', err);
            process.exit(1);
        }
    });

program.parse();
