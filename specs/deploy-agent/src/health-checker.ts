/**
 * Health Checker - Post-deployment verification
 */

import fetch from 'node-fetch';
import { logger } from './logger';

export class HealthChecker {
  async check(
    endpoint: string,
    expectedStatus: number,
    timeoutSeconds: number,
    retries: number,
    retryDelaySeconds: number
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        logger.debug(`Health check attempt ${attempt}/${retries}`, { endpoint });
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
        
        const response = await fetch(endpoint, {
          method: 'GET',
          signal: controller.signal
        });
        
        clearTimeout(timeout);
        
        if (response.status === expectedStatus) {
          logger.info('Health check passed', { endpoint, status: response.status });
          return true;
        }
        
        logger.warn('Health check status mismatch', { 
          endpoint, 
          expected: expectedStatus, 
          actual: response.status 
        });
        
      } catch (error) {
        logger.warn('Health check failed', { endpoint, attempt, error: error.message });
      }
      
      if (attempt < retries) {
        await this.sleep(retryDelaySeconds * 1000);
      }
    }
    
    return false;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
