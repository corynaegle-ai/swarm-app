/**
 * Image Describer Service
 * 
 * Uses Claude Vision API to describe images in the context
 * of software development projects.
 */

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

// Lazy-init client
let anthropicClient = null;

function getClient() {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

// Map extensions to MIME types
const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp'
};

const VISION_PROMPT = `You are analyzing an image attached to a software development project backlog item.

Describe this image concisely but thoroughly, focusing on:
1. What type of content it shows (UI mockup, diagram, screenshot, architecture, etc.)
2. Key elements visible (buttons, forms, data flows, components, etc.)
3. Any text or labels that are readable
4. Technical details that would help a developer understand the requirements

Keep your description factual and focused on what's visible. Do not speculate about implementation details.`;

async function describeImage(filePath, filename) {
  try {
    const ext = path.extname(filename || filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext];
    
    if (!mimeType) {
      return { success: false, error: `Unsupported image type: ${ext}` };
    }

    // Check file exists and size
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Image file not found' };
    }

    const stats = fs.statSync(filePath);
    if (stats.size > 20 * 1024 * 1024) {  // 20MB limit
      return { success: false, error: 'Image too large (max 20MB)' };
    }

    // Read and encode image
    const imageData = fs.readFileSync(filePath);
    const base64Data = imageData.toString('base64');

    // Call Claude Vision
    const client = getClient();
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: base64Data
              }
            },
            {
              type: 'text',
              text: VISION_PROMPT
            }
          ]
        }
      ]
    });

    // Extract text from response
    const description = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    if (!description) {
      return { success: false, error: 'No description generated' };
    }

    return { success: true, content: description };

  } catch (err) {
    console.error('[ImageDescriber] Error:', err.message);
    
    // Handle specific API errors
    if (err.status === 400) {
      return { success: false, error: 'Invalid image format or corrupted file' };
    }
    if (err.status === 413) {
      return { success: false, error: 'Image too large for API' };
    }
    
    return { success: false, error: err.message };
  }
}

module.exports = { describeImage };
