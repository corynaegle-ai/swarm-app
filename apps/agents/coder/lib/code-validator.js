/**
 * Code Validation Module for FORGE Agent Retry Logic
 * 
 * Validates generated code for syntax errors, lint issues, and TypeScript types
 * to enable self-correction before committing.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Try to load acorn for syntax validation
let acorn = null;
try {
  acorn = require('acorn');
} catch (err) {
  console.warn('Warning: acorn not available, syntax validation will use Node --check');
}

/**
 * Validate JavaScript/TypeScript syntax using acorn parser or Node --check
 * @param {Array} files - Array of {path, content} objects
 * @returns {Array} Array of error objects {type, file, line, column, message}
 */
async function validateSyntax(files) {
  const errors = [];
  
  for (const file of files) {
    // Skip non-JS/TS files
    if (!file.path.match(/\.(js|jsx|ts|tsx|mjs|cjs)$/i)) {
      continue;
    }
    
    // Skip TypeScript for now - let validateTypes handle it
    if (file.path.match(/\.tsx?$/i)) {
      continue;
    }
    
    try {
      if (acorn) {
        // Use acorn for fast in-memory parsing
        acorn.parse(file.content, {
          ecmaVersion: 'latest',
          sourceType: 'module',
          allowHashBang: true,
          locations: true
        });
      } else {
        // Fallback: write temp file and use Node --check
        const tmpPath = `/tmp/syntax-check-${Date.now()}-${path.basename(file.path)}`;
        fs.writeFileSync(tmpPath, file.content);
        try {
          execSync(`node --check "${tmpPath}"`, { stdio: 'pipe' });
        } finally {
          try { fs.unlinkSync(tmpPath); } catch {}
        }
      }
    } catch (err) {
      const loc = err.loc || {};
      errors.push({
        type: 'syntax',
        file: file.path,
        line: loc.line || err.lineNumber || 1,
        column: loc.column || err.column || 0,
        message: err.message || String(err)
      });
    }
  }
  
  return errors;
}

/**
 * Run ESLint on changed files (if eslint is available)
 * @param {string} repoDir - Repository directory path
 * @param {Array} changedFiles - Array of file paths relative to repoDir
 * @returns {Array} Array of error objects
 */
async function validateLint(repoDir, changedFiles) {
  const errors = [];
  
  // Filter to JS/JSX files only (ESLint doesn't handle TS without config)
  const jsFiles = changedFiles.filter(f => f.match(/\.(js|jsx|mjs|cjs)$/i));
  if (jsFiles.length === 0) return errors;
  
  // Check if eslint is available
  const eslintPath = path.join(repoDir, 'node_modules', '.bin', 'eslint');
  const hasLocalEslint = fs.existsSync(eslintPath);
  
  // Check if there's an eslint config
  const hasConfig = fs.existsSync(path.join(repoDir, '.eslintrc.js')) ||
                    fs.existsSync(path.join(repoDir, '.eslintrc.json')) ||
                    fs.existsSync(path.join(repoDir, '.eslintrc.yml')) ||
                    fs.existsSync(path.join(repoDir, 'eslint.config.js')) ||
                    fs.existsSync(path.join(repoDir, 'eslint.config.mjs'));
  
  if (!hasLocalEslint || !hasConfig) {
    // No ESLint available - skip lint validation
    return errors;
  }
  
  try {
    const filePaths = jsFiles.map(f => path.join(repoDir, f)).join(' ');
    const result = execSync(
      `cd "${repoDir}" && ./node_modules/.bin/eslint --format json ${filePaths}`,
      { stdio: 'pipe', timeout: 30000 }
    );
    
    // ESLint returns exit 0 for no errors
    return errors;
  } catch (err) {
    // ESLint exits non-zero when there are errors
    if (err.stdout) {
      try {
        const results = JSON.parse(err.stdout.toString());
        for (const fileResult of results) {
          for (const msg of (fileResult.messages || [])) {
            if (msg.severity >= 2) { // 2 = error
              errors.push({
                type: 'lint',
                file: path.relative(repoDir, fileResult.filePath),
                line: msg.line || 1,
                column: msg.column || 0,
                message: `${msg.ruleId || 'eslint'}: ${msg.message}`
              });
            }
          }
        }
      } catch (parseErr) {
        // Couldn't parse ESLint output
        errors.push({
          type: 'lint',
          file: 'unknown',
          line: 1,
          column: 0,
          message: `ESLint failed: ${err.message}`
        });
      }
    }
  }
  
  return errors;
}

/**
 * Run TypeScript type checking (if tsconfig.json exists)
 * @param {string} repoDir - Repository directory path
 * @returns {Array} Array of error objects
 */
async function validateTypes(repoDir) {
  const errors = [];
  
  // Check if TypeScript is configured
  const tsconfigPath = path.join(repoDir, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) {
    return errors; // No TypeScript, skip
  }
  
  // Check if tsc is available
  const tscPath = path.join(repoDir, 'node_modules', '.bin', 'tsc');
  if (!fs.existsSync(tscPath)) {
    return errors; // No TypeScript compiler
  }
  
  try {
    execSync(
      `cd "${repoDir}" && ./node_modules/.bin/tsc --noEmit`,
      { stdio: 'pipe', timeout: 60000 }
    );
    return errors; // No errors
  } catch (err) {
    // TypeScript outputs errors to stdout
    const output = (err.stdout?.toString() || '') + (err.stderr?.toString() || '');
    
    // Parse TypeScript error format: file(line,col): error TSxxxx: message
    const errorRegex = /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+TS\d+:\s*(.+)$/gm;
    let match;
    while ((match = errorRegex.exec(output)) !== null) {
      if (match[4] === 'error') {
        errors.push({
          type: 'typecheck',
          file: path.relative(repoDir, match[1]),
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          message: match[5]
        });
      }
    }
    
    // If no matches but there was an error, add generic error
    if (errors.length === 0 && output.includes('error')) {
      errors.push({
        type: 'typecheck',
        file: 'unknown',
        line: 1,
        column: 0,
        message: 'TypeScript compilation failed: ' + output.substring(0, 200)
      });
    }
  }
  
  return errors;
}

/**
 * Run all validations based on project config
 * @param {string} repoDir - Repository directory
 * @param {Array} files - Generated files [{path, content}]
 * @param {string} level - 'minimal'|'standard'|'strict'
 * @returns {{passed: boolean, errors: Array}}
 */
async function validateAll(repoDir, files, level = 'standard') {
  const allErrors = [];
  const changedFiles = files.map(f => f.path);
  
  // Always run syntax validation
  const syntaxErrors = await validateSyntax(files);
  allErrors.push(...syntaxErrors);
  
  // Standard and strict levels include lint
  if (level === 'standard' || level === 'strict') {
    const lintErrors = await validateLint(repoDir, changedFiles);
    allErrors.push(...lintErrors);
  }
  
  // Strict level includes type checking
  if (level === 'strict') {
    const typeErrors = await validateTypes(repoDir);
    allErrors.push(...typeErrors);
  }
  
  return {
    passed: allErrors.length === 0,
    errors: allErrors
  };
}

/**
 * Format validation errors for inclusion in retry prompt
 * @param {Array} errors - Array of validation errors
 * @returns {string} Formatted error string for LLM prompt
 */
function formatErrorsForPrompt(errors) {
  if (errors.length === 0) return '';
  
  const lines = ['## Validation Errors to Fix\n'];
  
  // Group by file
  const byFile = {};
  for (const err of errors) {
    const key = err.file || 'unknown';
    if (!byFile[key]) byFile[key] = [];
    byFile[key].push(err);
  }
  
  for (const [file, fileErrors] of Object.entries(byFile)) {
    lines.push(`### ${file}\n`);
    for (const err of fileErrors) {
      lines.push(`- **Line ${err.line}** [${err.type}]: ${err.message}`);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

module.exports = {
  validateSyntax,
  validateLint,
  validateTypes,
  validateAll,
  formatErrorsForPrompt
};
