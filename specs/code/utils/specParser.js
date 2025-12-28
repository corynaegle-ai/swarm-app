/**
 * Spec Parser Utility - Parse uploaded markdown spec files
 * Location: swarm-dashboard/src/utils/specParser.js
 */

/**
 * Parse a markdown spec file and extract structured sections
 * @param {string} content - Raw markdown content
 * @returns {ParsedSections}
 */
export function parseSpecFile(content) {
  const sections = {};
  
  // Extract ## Goals section
  const goalsMatch = content.match(/##\s*Goals?\s*\n([\s\S]*?)(?=##|$)/i);
  if (goalsMatch) {
    sections.goals = goalsMatch[1].trim();
  }
  
  // Extract ## Features section (as bullet list)
  const featuresMatch = content.match(/##\s*Features?\s*\n([\s\S]*?)(?=##|$)/i);
  if (featuresMatch) {
    sections.features = extractBulletPoints(featuresMatch[1]);
  }
  
  // Extract ## Constraints section
  const constraintsMatch = content.match(/##\s*Constraints?\s*\n([\s\S]*?)(?=##|$)/i);
  if (constraintsMatch) {
    sections.constraints = constraintsMatch[1].trim();
  }
  
  // Extract ## Technical Requirements section
  const techMatch = content.match(/##\s*Technical\s*Requirements?\s*\n([\s\S]*?)(?=##|$)/i);
  if (techMatch) {
    sections.technicalRequirements = techMatch[1].trim();
  }
  
  // Extract ## Out of Scope section
  const oosMatch = content.match(/##\s*Out\s*of\s*Scope\s*\n([\s\S]*?)(?=##|$)/i);
  if (oosMatch) {
    sections.outOfScope = oosMatch[1].trim();
  }

  // Extract ## Summary or ## Overview as description
  const summaryMatch = content.match(/##\s*(Summary|Overview|Description)\s*\n([\s\S]*?)(?=##|$)/i);
  if (summaryMatch) {
    sections.summary = summaryMatch[2].trim();
  }

  // Extract project name from # Title
  const titleMatch = content.match(/^#\s+([^\n]+)/m);
  if (titleMatch) {
    sections.title = titleMatch[1].trim();
  }
  
  return sections;
}

/**
 * Extract bullet points from markdown text
 * @param {string} text - Markdown text with bullets
 * @returns {string[]} - Array of bullet point contents
 */
function extractBulletPoints(text) {
  return text
    .split('\n')
    .filter(line => line.match(/^[\s]*[-*]\s/))
    .map(line => line.replace(/^[\s]*[-*]\s/, '').trim())
    .filter(item => item.length > 0);
}

/**
 * Merge natural language description with parsed file sections
 * @param {string} naturalLanguage - User-typed description
 * @param {ParsedSections} parsedSections - Extracted from file
 * @returns {string} - Merged description
 */
export function mergeSpecContent(naturalLanguage, parsedSections) {
  const parts = [];

  // Start with title if available
  if (parsedSections.title) {
    parts.push(`# ${parsedSections.title}\n`);
  }

  // Add summary/overview from file
  if (parsedSections.summary) {
    parts.push(`## Overview\n${parsedSections.summary}\n`);
  }

  // Add goals
  if (parsedSections.goals) {
    parts.push(`## Goals\n${parsedSections.goals}\n`);
  }

  // Add features
  if (parsedSections.features && parsedSections.features.length > 0) {
    parts.push(`## Features\n${parsedSections.features.map(f => `- ${f}`).join('\n')}\n`);
  }

  // Add technical requirements
  if (parsedSections.technicalRequirements) {
    parts.push(`## Technical Requirements\n${parsedSections.technicalRequirements}\n`);
  }

  // Add constraints
  if (parsedSections.constraints) {
    parts.push(`## Constraints\n${parsedSections.constraints}\n`);
  }

  // Add out of scope
  if (parsedSections.outOfScope) {
    parts.push(`## Out of Scope\n${parsedSections.outOfScope}\n`);
  }

  // Add natural language as additional context
  if (naturalLanguage && naturalLanguage.trim()) {
    parts.push(`## Additional Context\n${naturalLanguage.trim()}\n`);
  }

  return parts.join('\n').trim();
}

/**
 * Validate uploaded spec file
 * @param {File} file - File object from input
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateSpecFile(file) {
  const MAX_SIZE = 1 * 1024 * 1024; // 1MB
  const ALLOWED_EXTENSIONS = ['.md', '.txt', '.markdown'];

  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { 
      valid: false, 
      error: `Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` 
    };
  }

  if (file.size > MAX_SIZE) {
    return { 
      valid: false, 
      error: `File too large. Maximum size: 1MB` 
    };
  }

  return { valid: true };
}

/**
 * Read file content as text
 * @param {File} file - File object
 * @returns {Promise<string>} - File content
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export default {
  parseSpecFile,
  mergeSpecContent,
  validateSpecFile,
  readFileAsText
};
