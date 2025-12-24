/**
 * Context Gatherer Service
 * 
 * Orchestrates gathering all context from a backlog item:
 * - Attachments metadata
 * - GitHub content (README, files, PR/issues)
 * - Document text extraction (PDF, DOCX, TXT)
 * - Image descriptions via Claude Vision
 */

const { fetchGitHubContext } = require('./github-context');
const { extractDocumentText } = require('./document-extractor');
const { describeImage } = require('./image-describer');
const { queryAll } = require('../db');
const path = require('path');
const fs = require('fs');

// Token limits per content type
const LIMITS = {
  GITHUB_CONTENT: 2000,
  DOCUMENT_CONTENT: 4000,
  IMAGE_DESCRIPTION: 500,
  TOTAL_CONTEXT: 8000
};

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
const DOCUMENT_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt', '.md', '.rtf'];

function isGitHubUrl(url) {
  return url?.includes('github.com');
}

function isImageFile(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

function isDocumentFile(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  return DOCUMENT_EXTENSIONS.includes(ext);
}

function truncateToTokens(text, maxTokens) {
  if (!text) return '';
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars) + '\n\n[Content truncated...]';
}

async function gatherBacklogContext(item, tenantId) {
  const context = {
    title: item.title,
    description: item.description || '',
    repoUrl: item.repo_url || null,
    githubContent: [],
    documentContent: [],
    imageDescriptions: [],
    links: [],
    errors: []
  };

  try {
    const attachments = await queryAll(`
      SELECT id, attachment_type, name, url, mime_type, file_size, git_metadata
      FROM backlog_attachments 
      WHERE backlog_item_id = $1 AND tenant_id = $2 AND deleted_at IS NULL
      ORDER BY created_at ASC
    `, [item.id, tenantId]);

    console.log(`[ContextGatherer] Found ${attachments.length} attachments for item ${item.id}`);

    for (const attachment of attachments) {
      try {
        await processAttachment(attachment, tenantId, item.id, context);
      } catch (err) {
        console.error(`[ContextGatherer] Error processing attachment ${attachment.id}:`, err.message);
        context.errors.push({ attachment: attachment.name, error: err.message });
      }
    }
  } catch (err) {
    console.error('[ContextGatherer] Error fetching attachments:', err);
    context.errors.push({ error: 'Failed to fetch attachments' });
  }

  return context;
}

async function processAttachment(attachment, tenantId, itemId, context) {
  const { attachment_type, name, url, git_metadata } = attachment;

  if (attachment_type === 'git_link') {
    if (isGitHubUrl(url)) {
      console.log(`[ContextGatherer] Fetching GitHub content: ${url}`);
      const ghContent = await fetchGitHubContext(url, git_metadata);
      if (ghContent.success) {
        context.githubContent.push({
          source: name || url,
          url,
          type: ghContent.type,
          content: truncateToTokens(ghContent.content, LIMITS.GITHUB_CONTENT)
        });
      } else {
        context.errors.push({ attachment: name, error: ghContent.error });
      }
    }
  } 
  else if (attachment_type === 'external_link') {
    context.links.push({ name: name || url, url });
  }
  else if (attachment_type === 'file') {
    const filePath = `/opt/swarm-app${url}`;
    
    if (!fs.existsSync(filePath)) {
      console.warn(`[ContextGatherer] File not found: ${filePath}`);
      context.errors.push({ attachment: name, error: 'File not found' });
      return;
    }

    if (isImageFile(name)) {
      console.log(`[ContextGatherer] Describing image: ${name}`);
      const description = await describeImage(filePath, name);
      if (description.success) {
        context.imageDescriptions.push({
          filename: name,
          description: truncateToTokens(description.content, LIMITS.IMAGE_DESCRIPTION)
        });
      } else {
        context.errors.push({ attachment: name, error: description.error });
      }
    }
    else if (isDocumentFile(name)) {
      console.log(`[ContextGatherer] Extracting text from: ${name}`);
      const extracted = await extractDocumentText(filePath, name);
      if (extracted.success) {
        context.documentContent.push({
          filename: name,
          content: truncateToTokens(extracted.content, LIMITS.DOCUMENT_CONTENT)
        });
      } else {
        context.errors.push({ attachment: name, error: extracted.error });
      }
    }
    else {
      context.links.push({
        name,
        type: 'file',
        note: `Attached file (${attachment.mime_type || 'unknown type'})`
      });
    }
  }
}

module.exports = { gatherBacklogContext, LIMITS };
