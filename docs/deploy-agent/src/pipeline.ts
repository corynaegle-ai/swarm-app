/**
 * Pipeline - Deployment Orchestration
 * 
 * Coordinates the full deployment workflow:
 * 1. Trigger → 2. Gate → 3. Prepare → 4. Build → 5. Deploy → 6. Verify → 7. Finalize
 */

import { v4 as uuidv4 } from 'uuid';
import { Database } from './db';
import { Executor } from './executor';
import { HealthChecker } from './health-checker';
import { logger } from './logger';
import { ServiceManifest, DeploymentTrigger, DeploymentStatus } from './types';

export class Pipeline {
  private db: Database;
  private manifests: Record<string, ServiceManifest>;
  private executor: Executor;
  private healthChecker: HealthChecker;
  
  // SAFETY: Only allow dev deployments
  private readonly ALLOWED_TARGETS = ['dev'];
  
  constructor(db: Database, manifests: Record<string, ServiceManifest>) {
    this.db = db;
    this.manifests = manifests;
    this.executor = new Executor();
    this.healthChecker = new HealthChecker();
  }
  
  async trigger(trigger: DeploymentTrigger): Promise<string> {
    const deploymentId = uuidv4();
    const manifest = this.manifests[trigger.service];
    
    if (!manifest) {
      throw new Error(`No manifest found for service: ${trigger.service}`);
    }
    
    // SAFETY: Validate target environment
    if (!this.ALLOWED_TARGETS.includes(manifest.environment.target)) {
      throw new Error(`BLOCKED: Cannot deploy to ${manifest.environment.target}. Only dev allowed.`);
    }
    
    // Create deployment record
    this.db.createDeployment({
      id: deploymentId,
      service: trigger.service,
      commit_sha: trigger.commit_sha,
      triggered_by: trigger.triggered_by,
      trigger_type: trigger.trigger_type,
      status: 'pending'
    });
    
    // Execute pipeline asynchronously
    this.executePipeline(deploymentId, manifest, trigger).catch((error) => {
      logger.error('Pipeline execution failed', { deploymentId, error: error.message });
    });
    
    return deploymentId;
  }
  
  private async executePipeline(
    deploymentId: string, 
    manifest: ServiceManifest, 
    trigger: DeploymentTrigger
  ): Promise<void> {
    const stages = ['prepare', 'build', 'deploy', 'verify', 'finalize'];
    
    try {
      // Stage 1: Prepare (git pull)
      await this.stagePrepare(deploymentId, manifest);
      
      // Stage 2: Build
      await this.stageBuild(deploymentId, manifest);
      
      // Stage 3: Deploy
      await this.stageDeploy(deploymentId, manifest);
      
      // Stage 4: Verify (health check)
      await this.stageVerify(deploymentId, manifest);
      
      // Stage 5: Finalize
      await this.stageFinalize(deploymentId, manifest, 'success');
      
    } catch (error) {
      logger.error('Pipeline failed', { deploymentId, error: error.message });
      
      // Attempt rollback if enabled
      if (manifest.rollback?.enabled) {
        await this.executeRollback(deploymentId, manifest);
      }
      
      await this.stageFinalize(deploymentId, manifest, 'failed', error.message);
    }
  }
  
  private async stagePrepare(deploymentId: string, manifest: ServiceManifest): Promise<void> {
    this.logStage(deploymentId, 'prepare', 'running', 'Pulling latest code...');
    this.db.updateDeploymentStatus(deploymentId, 'preparing');
    
    const commands = [
      `cd ${manifest.repository.path}`,
      `git fetch origin ${manifest.repository.branch}`,
      `git reset --hard origin/${manifest.repository.branch}`
    ];
    
    const result = await this.executor.run(commands.join(' && '), manifest.build.timeout);
    this.logStage(deploymentId, 'prepare', 'completed', result.stdout);
  }
  
  private async stageBuild(deploymentId: string, manifest: ServiceManifest): Promise<void> {
    this.logStage(deploymentId, 'build', 'running', 'Executing build commands...');
    this.db.updateDeploymentStatus(deploymentId, 'building');
    
    // Run pre-checks
    for (const check of manifest.build.pre_checks || []) {
      const checkResult = await this.executor.run(
        `cd ${manifest.repository.path} && ${check}`,
        30
      );
      if (checkResult.exitCode !== 0) {
        throw new Error(`Pre-check failed: ${check}`);
      }
    }
    
    // Run build commands
    for (const cmd of manifest.build.commands) {
      const result = await this.executor.run(
        `cd ${manifest.build.working_dir || manifest.repository.path} && ${cmd}`,
        manifest.build.timeout
      );
      if (result.exitCode !== 0) {
        throw new Error(`Build command failed: ${cmd}\n${result.stderr}`);
      }
    }
    
    this.logStage(deploymentId, 'build', 'completed', 'Build successful');
  }
  
  private async stageDeploy(deploymentId: string, manifest: ServiceManifest): Promise<void> {
    this.logStage(deploymentId, 'deploy', 'running', 'Deploying service...');
    this.db.updateDeploymentStatus(deploymentId, 'deploying');
    
    for (const cmd of manifest.deploy.commands) {
      const result = await this.executor.run(cmd, manifest.deploy.timeout);
      if (result.exitCode !== 0) {
        throw new Error(`Deploy command failed: ${cmd}\n${result.stderr}`);
      }
    }
    
    this.logStage(deploymentId, 'deploy', 'completed', 'Service deployed');
  }
  
  private async stageVerify(deploymentId: string, manifest: ServiceManifest): Promise<void> {
    this.logStage(deploymentId, 'verify', 'running', 'Running health checks...');
    this.db.updateDeploymentStatus(deploymentId, 'verifying');
    
    const healthConfig = manifest.health_check;
    const healthy = await this.healthChecker.check(
      healthConfig.endpoint,
      healthConfig.expected_status,
      healthConfig.timeout,
      healthConfig.retries,
      healthConfig.retry_delay
    );
    
    if (!healthy) {
      throw new Error(`Health check failed for ${healthConfig.endpoint}`);
    }
    
    this.logStage(deploymentId, 'verify', 'completed', 'Health check passed');
  }
  
  private async stageFinalize(
    deploymentId: string, 
    manifest: ServiceManifest, 
    status: 'success' | 'failed',
    error?: string
  ): Promise<void> {
    this.db.updateDeploymentStatus(deploymentId, status);
    this.db.completeDeployment(deploymentId);
    
    this.logStage(deploymentId, 'finalize', 'completed', 
      status === 'success' ? 'Deployment completed successfully' : `Deployment failed: ${error}`
    );
    
    logger.info(`Deployment ${status}`, { 
      deploymentId, 
      service: manifest.service.name,
      status 
    });
  }
  
  private async executeRollback(deploymentId: string, manifest: ServiceManifest): Promise<void> {
    logger.warn('Executing rollback', { deploymentId, service: manifest.service.name });
    this.logStage(deploymentId, 'rollback', 'running', 'Rolling back...');
    
    try {
      for (const cmd of manifest.rollback.commands) {
        await this.executor.run(cmd, 300);
      }
      this.db.setRollbackReason(deploymentId, 'Auto-rollback after deployment failure');
      this.logStage(deploymentId, 'rollback', 'completed', 'Rollback successful');
    } catch (rollbackError) {
      logger.error('Rollback failed', { deploymentId, error: rollbackError.message });
      this.logStage(deploymentId, 'rollback', 'failed', rollbackError.message);
    }
  }
  
  private logStage(deploymentId: string, stage: string, status: string, message: string): void {
    this.db.addDeploymentEvent(deploymentId, stage, status, message);
    logger.info(`[${deploymentId}] ${stage}: ${status}`, { message });
  }
}
