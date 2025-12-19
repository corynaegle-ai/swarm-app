/**
 * Executor - Safe shell command runner
 */

import { exec } from 'child_process';
import { logger } from './logger';

export interface ExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

// Full paths for node/npm
const NODE_BIN = '/root/.nvm/versions/node/v22.21.1/bin';

// Wrap command to source nvm first
function wrapCommand(cmd: string): string {
  return `export PATH=${NODE_BIN}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && ${cmd}`;
}

export class Executor {
  async run(command: string, timeout: number = 60): Promise<ExecResult> {
    const timeoutMs = timeout * 1000;
    const wrappedCmd = wrapCommand(command);
    
    return new Promise((resolve) => {
      logger.debug('Executing command', { command, timeout });
      
      exec(wrappedCmd, { 
        timeout: timeoutMs,
        shell: '/bin/bash'
      }, (error, stdout, stderr) => {
        const exitCode = error ? (error.code || 1) : 0;
        
        const result: ExecResult = {
          success: exitCode === 0,
          stdout: stdout.toString().trim(),
          stderr: stderr.toString().trim(),
          exitCode
        };
        
        if (exitCode !== 0) {
          logger.error('Command failed', { 
            command, 
            exitCode,
            stderr: result.stderr.slice(0, 500)
          });
        } else {
          logger.debug('Command completed', { 
            command, 
            stdout: result.stdout.slice(0, 200) 
          });
        }
        
        resolve(result);
      });
    });
  }
}
