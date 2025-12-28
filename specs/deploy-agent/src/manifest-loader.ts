/**
 * Manifest Loader - Loads YAML service manifests
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { ServiceManifest } from './types';
import { logger } from './logger';

export class ManifestLoader {
  private manifestsDir: string;
  
  constructor(manifestsDir: string) {
    this.manifestsDir = manifestsDir;
  }
  
  async loadAll(): Promise<Record<string, ServiceManifest>> {
    const manifests: Record<string, ServiceManifest> = {};
    
    try {
      const files = readdirSync(this.manifestsDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
      
      for (const file of files) {
        const filePath = join(this.manifestsDir, file);
        const content = readFileSync(filePath, 'utf-8');
        const manifest = parseYaml(content) as ServiceManifest;
        
        if (manifest.service?.name) {
          manifests[manifest.service.name] = manifest;
          logger.debug('Loaded manifest', { service: manifest.service.name, file });
        } else {
          logger.warn('Invalid manifest (missing service.name)', { file });
        }
      }
    } catch (error) {
      logger.error('Failed to load manifests', { dir: this.manifestsDir, error: error.message });
    }
    
    return manifests;
  }
  
  async load(serviceName: string): Promise<ServiceManifest | null> {
    const filePath = join(this.manifestsDir, `${serviceName}.yaml`);
    
    try {
      const content = readFileSync(filePath, 'utf-8');
      return parseYaml(content) as ServiceManifest;
    } catch (error) {
      logger.error('Failed to load manifest', { service: serviceName, error: error.message });
      return null;
    }
  }
}
