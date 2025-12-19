/**
 * Repository Analysis Service
 * Clones and analyzes repositories for Build Feature workflow
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { queryOne } = require('../db');

/**
 * Get authenticated clone URL using system GitHub PAT
 */
async function getAuthenticatedUrl(repoUrl) {
  try {
    const secret = await queryOne('SELECT value FROM secrets WHERE type = $1', ['SYSTEM_GITHUB_PAT']);
    
    if (!secret) {
      console.warn('No GitHub PAT found, attempting unauthenticated clone');
      return repoUrl;
    }
    
    // Convert https://github.com/owner/repo to https://PAT@github.com/owner/repo
    const pat = secret.value;
    const url = new URL(repoUrl);
    return `https://${pat}@${url.host}${url.pathname}`;
  } catch (e) {
    console.error('Failed to get authenticated URL:', e.message);
    return repoUrl;
  }
}

/**
 * Main entry point - clone, analyze, cleanup
 */
async function analyzeRepository(repoUrl) {
  const tempDir = `/tmp/repo-analysis-${Date.now()}`;
  
  try {
    // Get authenticated URL for private repos
    const cloneUrl = await getAuthenticatedUrl(repoUrl);
    
    // Clone repo (shallow for speed)
    execSync(`git clone --depth 1 ${cloneUrl} ${tempDir}`, { 
      timeout: 60000,
      stdio: 'pipe'
    });
    
    // Analyze structure
    const analysis = {
      files: scanDirectory(tempDir, tempDir),
      techStack: detectTechStack(tempDir),
      entryPoints: findEntryPoints(tempDir),
      patterns: detectPatterns(tempDir),
      analyzedAt: new Date().toISOString()
    };
    
    return analysis;
  } finally {
    // Cleanup
    try {
      execSync(`rm -rf ${tempDir}`, { stdio: 'pipe' });
    } catch (e) {
      console.error('Cleanup failed:', e.message);
    }
  }
}

/**
 * Scan directory structure (max 3 levels, skip node_modules/.git)
 */
function scanDirectory(dir, rootDir, depth = 0, maxDepth = 3) {
  if (depth > maxDepth) return [];
  
  const results = [];
  const skipDirs = ['node_modules', '.git', 'dist', 'build', 'coverage', '__pycache__', '.next'];
  
  let items;
  try {
    items = fs.readdirSync(dir);
  } catch (e) {
    return results;
  }
  
  for (const item of items) {
    if (skipDirs.includes(item) || item.startsWith('.')) continue;
    
    const fullPath = path.join(dir, item);
    const relativePath = path.relative(rootDir, fullPath);
    
    try {
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        results.push({ type: 'directory', name: item, path: relativePath });
        results.push(...scanDirectory(fullPath, rootDir, depth + 1, maxDepth));
      } else {
        results.push({ 
          type: 'file', 
          name: item,
          path: relativePath,
          size: stat.size
        });
      }
    } catch (e) {
      // Skip unreadable files
    }
  }
  
  return results;
}

/**
 * Detect tech stack from config files
 */
function detectTechStack(dir) {
  const stack = { 
    languages: [], 
    frameworks: [], 
    databases: [],
    tools: []
  };
  
  // Node.js / JavaScript
  const pkgPath = path.join(dir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    stack.languages.push('JavaScript/Node.js');
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      if (deps.react) stack.frameworks.push('React');
      if (deps.vue) stack.frameworks.push('Vue');
      if (deps.express) stack.frameworks.push('Express');
      if (deps.fastify) stack.frameworks.push('Fastify');
      if (deps.next) stack.frameworks.push('Next.js');
      
      if (deps['better-sqlite3'] || deps.sqlite3) stack.databases.push('SQLite');
      if (deps.pg || deps.postgres) stack.databases.push('PostgreSQL');
      if (deps.mongodb || deps.mongoose) stack.databases.push('MongoDB');
      
      if (deps.typescript) stack.tools.push('TypeScript');
      if (deps.tailwindcss) stack.tools.push('Tailwind CSS');
    } catch (e) {}
  }
  
  // Python
  if (fs.existsSync(path.join(dir, 'requirements.txt')) || 
      fs.existsSync(path.join(dir, 'pyproject.toml'))) {
    stack.languages.push('Python');
  }
  
  // Go
  if (fs.existsSync(path.join(dir, 'go.mod'))) {
    stack.languages.push('Go');
  }
  
  // Rust
  if (fs.existsSync(path.join(dir, 'Cargo.toml'))) {
    stack.languages.push('Rust');
  }
  
  return stack;
}

/**
 * Find main entry points
 */
function findEntryPoints(dir) {
  const entryPoints = [];
  const commonEntries = [
    'index.js', 'index.ts', 'main.js', 'main.ts', 'app.js', 'app.ts',
    'server.js', 'server.ts', 'src/index.js', 'src/index.ts', 'src/main.js',
    'src/app.js', 'app.py', 'main.py', 'manage.py', 'main.go', 'cmd/main.go'
  ];
  
  for (const entry of commonEntries) {
    if (fs.existsSync(path.join(dir, entry))) {
      entryPoints.push(entry);
    }
  }
  
  return entryPoints;
}

/**
 * Detect architectural patterns
 */
function detectPatterns(dir) {
  const patterns = [];
  
  // Check for common patterns
  if (fs.existsSync(path.join(dir, 'src/routes')) || 
      fs.existsSync(path.join(dir, 'routes'))) {
    patterns.push('Route-based API');
  }
  
  if (fs.existsSync(path.join(dir, 'src/components')) ||
      fs.existsSync(path.join(dir, 'components'))) {
    patterns.push('Component-based UI');
  }
  
  if (fs.existsSync(path.join(dir, 'src/models')) ||
      fs.existsSync(path.join(dir, 'models'))) {
    patterns.push('MVC/Model layer');
  }
  
  if (fs.existsSync(path.join(dir, 'src/services')) ||
      fs.existsSync(path.join(dir, 'services'))) {
    patterns.push('Service layer');
  }
  
  if (fs.existsSync(path.join(dir, 'tests')) ||
      fs.existsSync(path.join(dir, '__tests__')) ||
      fs.existsSync(path.join(dir, 'spec'))) {
    patterns.push('Test suite');
  }
  
  return patterns;
}

module.exports = { 
  analyzeRepository,
  scanDirectory,
  detectTechStack,
  findEntryPoints,
  detectPatterns
};
