/**
 * Swarm Dev API - Mobile/Claude Development Access
 * Provides file, git, shell, and system operations for remote development
 * 
 * All endpoints require Bearer token auth via SWARM_DEV_KEY
 */

const express = require('express');
const router = express.Router();
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Dev API key - set via environment or generate
const DEV_KEY = process.env.SWARM_DEV_KEY || 'sk-swarm-dev-2024';

// Allowed path roots for file operations (security)
const ALLOWED_ROOTS = [
  '/opt/swarm',
  '/opt/swarm-platform',
  '/opt/swarm-specs',
  '/opt/swarm-tickets',
  '/opt/swarm-dashboard',
  '/var/log',
  '/tmp/swarm'
];

// Whitelisted commands for shell exec
const ALLOWED_COMMANDS = [
  'systemctl', 'pm2', 'node', 'npm', 'git',
  'cat', 'head', 'tail', 'grep', 'find', 'ls', 'tree',
  'df', 'free', 'ps', 'uptime', 'whoami', 'pwd', 'date', 'hostname',
  'wc', 'sort', 'uniq', 'awk', 'sed',
  'chmod', 'mkdir', 'touch', 'cp', 'mv', 'rm',
  'pgrep', 'pkill', 'kill',
  'curl', 'wget',
  'ip', 'ss', 'netstat',
  'swarm-', 'firecracker'
];

// Auth middleware for dev endpoints
function requireDevAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }
  const token = authHeader.slice(7);
  if (token !== DEV_KEY) {
    return res.status(403).json({ error: 'Invalid dev API key' });
  }
  next();
}

// Apply auth to all routes
router.use(requireDevAuth);

// Path validation helper
function validatePath(inputPath) {
  if (!inputPath) return { valid: false, error: 'Path required' };
  const resolved = path.resolve(inputPath);
  const isAllowed = ALLOWED_ROOTS.some(root => resolved.startsWith(root));
  if (!isAllowed) {
    return { valid: false, error: `Path not in allowed roots: ${resolved}` };
  }
  return { valid: true, path: resolved };
}

// Command validation helper
function validateCommand(cmd) {
  const trimmed = cmd.trim();
  const isAllowed = ALLOWED_COMMANDS.some(prefix =>
    trimmed.startsWith(prefix) || trimmed.startsWith('./' + prefix)
  );
  return isAllowed;
}


// ============ SYSTEM INFO ============

// GET /api/dev/status - System overview
router.get('/status', (req, res) => {
  try {
    const uptime = execSync('uptime -p').toString().trim();
    const disk = execSync("df -h / | tail -1 | awk '{print $4}'").toString().trim();
    const memory = execSync("free -h | grep Mem | awk '{print $4}'").toString().trim();
    const loadAvg = execSync("cat /proc/loadavg | awk '{print $1, $2, $3}'").toString().trim();

    res.json({
      status: 'online',
      uptime,
      diskFree: disk,
      memoryFree: memory,
      loadAverage: loadAvg,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/dev/processes - Running processes
router.get('/processes', (req, res) => {
  try {
    const { filter } = req.query;
    let cmd = 'ps aux --sort=-%mem | head -20';
    if (filter) {
      cmd = `ps aux | grep -i "${filter}" | grep -v grep | head -20`;
    }
    const output = execSync(cmd).toString();
    res.json({ processes: output.split('\n').filter(l => l.trim()) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/dev/services - PM2 services status
router.get('/services', (req, res) => {
  try {
    const output = execSync('pm2 jlist 2>/dev/null').toString();
    const services = JSON.parse(output);
    res.json({
      services: services.map(s => ({
        name: s.name,
        status: s.pm2_env.status,
        pid: s.pid,
        memory: Math.round(s.monit?.memory / 1024 / 1024) + 'MB',
        uptime: s.pm2_env.pm_uptime,
        restarts: s.pm2_env.restart_time
      }))
    });
  } catch (e) {
    res.json({ services: [], error: e.message });
  }
});

// POST /api/dev/services/:name/restart - Restart PM2 service
router.post('/services/:name/restart', (req, res) => {
  try {
    execSync(`pm2 restart ${req.params.name}`);
    res.json({ success: true, restarted: req.params.name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ============ FILE OPERATIONS ============

// GET /api/dev/files/read - Read file contents
router.get('/files/read', (req, res) => {
  const { path: filePath, offset = 0, lines = 100 } = req.query;
  const validation = validatePath(filePath);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    if (!fs.existsSync(validation.path)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stat = fs.statSync(validation.path);
    if (stat.isDirectory()) {
      return res.status(400).json({ error: 'Path is a directory, use /ls instead' });
    }

    // Read with offset/lines support
    const content = fs.readFileSync(validation.path, 'utf8');
    const allLines = content.split('\n');
    const start = parseInt(offset);
    const count = parseInt(lines);
    const slice = allLines.slice(start, start + count);

    res.json({
      path: validation.path,
      content: slice.join('\n'),
      totalLines: allLines.length,
      offset: start,
      linesReturned: slice.length,
      truncated: allLines.length > start + count
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/dev/files/write - Write file contents
router.post('/files/write', (req, res) => {
  const { path: filePath, content, append = false } = req.body;
  const validation = validatePath(filePath);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    // Ensure parent directory exists
    const dir = path.dirname(validation.path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (append) {
      fs.appendFileSync(validation.path, content);
    } else {
      fs.writeFileSync(validation.path, content);
    }

    const stat = fs.statSync(validation.path);
    res.json({
      success: true,
      path: validation.path,
      size: stat.size,
      mode: append ? 'append' : 'write'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/dev/ls - Directory listing
router.get('/ls', (req, res) => {
  const { path: dirPath = '/opt', depth = 1, showHidden = false } = req.query;
  const validation = validatePath(dirPath);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const hiddenFlag = showHidden === 'true' ? '-a' : '';
    const cmd = `find "${validation.path}" -maxdepth ${depth} ${hiddenFlag} -printf '%y %s %T@ %p\n' 2>/dev/null | head -200`;
    const output = execSync(cmd).toString();

    const items = output.split('\n').filter(l => l.trim()).map(line => {
      const [type, size, mtime, ...pathParts] = line.split(' ');
      const itemPath = pathParts.join(' ');
      return {
        type: type === 'd' ? 'directory' : 'file',
        size: parseInt(size),
        modified: new Date(parseFloat(mtime) * 1000).toISOString(),
        path: itemPath,
        name: path.basename(itemPath)
      };
    });

    res.json({ path: validation.path, items, count: items.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// GET /api/dev/files/search - Search for files
router.get('/files/search', (req, res) => {
  const { path: searchPath = '/opt', pattern, type, content } = req.query;
  const validation = validatePath(searchPath);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    let cmd;
    if (content) {
      // Search file contents
      cmd = `grep -rl "${content}" "${validation.path}" 2>/dev/null | head -50`;
    } else {
      // Search by filename pattern
      const typeFlag = type === 'f' ? '-type f' : type === 'd' ? '-type d' : '';
      const namePattern = pattern ? `-name "${pattern}"` : '';
      cmd = `find "${validation.path}" ${typeFlag} ${namePattern} 2>/dev/null | head -100`;
    }

    const output = execSync(cmd).toString();
    const matches = output.split('\n').filter(l => l.trim());
    res.json({ matches, count: matches.length, searchPath: validation.path });
  } catch (e) {
    res.json({ matches: [], count: 0, error: e.message });
  }
});

// GET /api/dev/files/info - File/directory info
router.get('/files/info', (req, res) => {
  const { path: filePath } = req.query;
  const validation = validatePath(filePath);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    if (!fs.existsSync(validation.path)) {
      return res.status(404).json({ error: 'Path not found' });
    }

    const stat = fs.statSync(validation.path);
    const info = {
      path: validation.path,
      name: path.basename(validation.path),
      type: stat.isDirectory() ? 'directory' : 'file',
      size: stat.size,
      created: stat.birthtime,
      modified: stat.mtime,
      permissions: (stat.mode & 0o777).toString(8)
    };

    if (stat.isFile()) {
      const lineCount = execSync(`wc -l < "${validation.path}" 2>/dev/null || echo 0`).toString().trim();
      info.lines = parseInt(lineCount);
    }

    res.json(info);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/dev/files - Delete file or directory
router.delete('/files', (req, res) => {
  const { path: filePath, recursive = false } = req.query;
  const validation = validatePath(filePath);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    if (!fs.existsSync(validation.path)) {
      return res.status(404).json({ error: 'Path not found' });
    }

    const stat = fs.statSync(validation.path);
    if (stat.isDirectory()) {
      if (recursive === 'true') {
        fs.rmSync(validation.path, { recursive: true });
      } else {
        fs.rmdirSync(validation.path);
      }
    } else {
      fs.unlinkSync(validation.path);
    }

    res.json({ success: true, deleted: validation.path });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/dev/mkdir - Create directory
router.post('/mkdir', (req, res) => {
  const { path: dirPath } = req.body;
  const validation = validatePath(dirPath);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    fs.mkdirSync(validation.path, { recursive: true });
    res.json({ success: true, created: validation.path });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ============ SHELL EXECUTION ============

// POST /api/dev/exec - Execute shell command
router.post('/exec', (req, res) => {
  const { command, cwd = '/opt', timeout = 30000 } = req.body;

  if (!command) {
    return res.status(400).json({ error: 'Command required' });
  }

  if (!validateCommand(command)) {
    return res.status(403).json({
      error: 'Command not in whitelist',
      allowed: ALLOWED_COMMANDS
    });
  }

  try {
    const output = execSync(command, {
      cwd,
      timeout: Math.min(timeout, 60000),
      maxBuffer: 5 * 1024 * 1024,
      encoding: 'utf8'
    });
    res.json({
      success: true,
      output: output.toString(),
      command,
      cwd
    });
  } catch (e) {
    res.status(500).json({
      error: e.message,
      stderr: e.stderr?.toString(),
      stdout: e.stdout?.toString(),
      code: e.status
    });
  }
});

// ============ GIT OPERATIONS ============

// GET /api/dev/git/status - Git status
router.get('/git/status', (req, res) => {
  const { repo } = req.query;
  const validation = validatePath(repo);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const status = execSync('git status --porcelain', { cwd: validation.path }).toString();
    const branch = execSync('git branch --show-current', { cwd: validation.path }).toString().trim();
    const ahead = execSync('git rev-list --count @{u}..HEAD 2>/dev/null || echo 0', { cwd: validation.path }).toString().trim();
    const behind = execSync('git rev-list --count HEAD..@{u} 2>/dev/null || echo 0', { cwd: validation.path }).toString().trim();

    res.json({
      repo: validation.path,
      branch,
      ahead: parseInt(ahead),
      behind: parseInt(behind),
      clean: status.trim() === '',
      changes: status.split('\n').filter(l => l.trim()).map(l => ({
        status: l.substring(0, 2).trim(),
        file: l.substring(3)
      }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/dev/git/log - Git log
router.get('/git/log', (req, res) => {
  const { repo, count = 10 } = req.query;
  const validation = validatePath(repo);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const log = execSync(
      `git log --oneline -${count} --format="%h|%s|%an|%ar"`,
      { cwd: validation.path }
    ).toString();

    const commits = log.split('\n').filter(l => l.trim()).map(l => {
      const [hash, message, author, date] = l.split('|');
      return { hash, message, author, date };
    });

    res.json({ repo: validation.path, commits });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/dev/git/diff - Git diff
router.get('/git/diff', (req, res) => {
  const { repo, file, staged = false } = req.query;
  const validation = validatePath(repo);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const stagedFlag = staged === 'true' ? '--staged' : '';
    const fileArg = file ? `-- "${file}"` : '';
    const diff = execSync(
      `git diff ${stagedFlag} ${fileArg} | head -500`,
      { cwd: validation.path }
    ).toString();

    res.json({ repo: validation.path, diff, truncated: diff.split('\n').length >= 500 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// POST /api/dev/git/add - Stage files
router.post('/git/add', (req, res) => {
  const { repo, files = ['.'] } = req.body;
  const validation = validatePath(repo);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const fileList = Array.isArray(files) ? files.join(' ') : files;
    execSync(`git add ${fileList}`, { cwd: validation.path });
    res.json({ success: true, repo: validation.path, staged: files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/dev/git/commit - Commit changes
router.post('/git/commit', (req, res) => {
  const { repo, message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Commit message required' });
  }

  const validation = validatePath(repo);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const output = execSync(
      `git commit -m "${message.replace(/"/g, '\\"')}"`,
      { cwd: validation.path }
    ).toString();
    res.json({ success: true, repo: validation.path, output });
  } catch (e) {
    res.status(500).json({ error: e.message, stderr: e.stderr?.toString() });
  }
});

// POST /api/dev/git/push - Push to remote
router.post('/git/push', (req, res) => {
  const { repo, force = false } = req.body;
  const validation = validatePath(repo);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const forceFlag = force ? '--force' : '';
    const output = execSync(
      `git push ${forceFlag} 2>&1`,
      { cwd: validation.path, timeout: 60000 }
    ).toString();
    res.json({ success: true, repo: validation.path, output });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/dev/git/pull - Pull from remote
router.post('/git/pull', (req, res) => {
  const { repo, rebase = false } = req.body;
  const validation = validatePath(repo);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const rebaseFlag = rebase ? '--rebase' : '';
    const output = execSync(
      `git pull ${rebaseFlag} 2>&1`,
      { cwd: validation.path, timeout: 60000 }
    ).toString();
    res.json({ success: true, repo: validation.path, output });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/dev/git/branches - List branches
router.get('/git/branches', (req, res) => {
  const { repo } = req.query;
  const validation = validatePath(repo);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const local = execSync('git branch', { cwd: validation.path }).toString();
    const current = execSync('git branch --show-current', { cwd: validation.path }).toString().trim();

    const branches = local.split('\n')
      .filter(l => l.trim())
      .map(l => l.replace(/^\*?\s*/, '').trim());

    res.json({ repo: validation.path, current, branches });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/dev/git/checkout - Switch branch
router.post('/git/checkout', (req, res) => {
  const { repo, branch, create = false } = req.body;
  const validation = validatePath(repo);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const createFlag = create ? '-b' : '';
    execSync(`git checkout ${createFlag} ${branch}`, { cwd: validation.path });
    res.json({ success: true, repo: validation.path, branch });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
module.exports = router;
