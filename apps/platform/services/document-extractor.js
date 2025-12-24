/**
 * Document Text Extractor
 * 
 * Extracts text from various document formats:
 * - PDF (using pdf-parse)
 * - DOCX (using mammoth)
 * - TXT/MD (direct read)
 */

const fs = require('fs');
const path = require('path');

// Lazy-load these to avoid startup errors if not installed
let pdfParse = null;
let mammoth = null;

async function getPdfParse() {
  if (!pdfParse) {
    try {
      pdfParse = require('pdf-parse');
    } catch (err) {
      console.warn('[DocumentExtractor] pdf-parse not installed');
      return null;
    }
  }
  return pdfParse;
}

async function getMammoth() {
  if (!mammoth) {
    try {
      mammoth = require('mammoth');
    } catch (err) {
      console.warn('[DocumentExtractor] mammoth not installed');
      return null;
    }
  }
  return mammoth;
}

async function extractDocumentText(filePath, filename) {
  try {
    const ext = path.extname(filename || filePath).toLowerCase();

    if (ext === '.txt' || ext === '.md') {
      return await extractTextFile(filePath);
    } else if (ext === '.pdf') {
      return await extractPdfText(filePath);
    } else if (ext === '.docx' || ext === '.doc') {
      return await extractDocxText(filePath);
    } else if (ext === '.rtf') {
      // RTF is complex, just read raw for now
      return await extractTextFile(filePath);
    } else {
      return { success: false, error: `Unsupported document type: ${ext}` };
    }
  } catch (err) {
    console.error('[DocumentExtractor] Error:', err.message);
    return { success: false, error: err.message };
  }
}

async function extractTextFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, content };
  } catch (err) {
    return { success: false, error: `Failed to read file: ${err.message}` };
  }
}

async function extractPdfText(filePath) {
  const parser = await getPdfParse();
  if (!parser) {
    return { 
      success: false, 
      error: 'PDF parsing not available (pdf-parse not installed)' 
    };
  }

  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await parser(dataBuffer);
    
    if (!data.text || data.text.trim().length === 0) {
      return { 
        success: true, 
        content: '[PDF appears to contain only images or no extractable text]' 
      };
    }

    return { success: true, content: data.text };
  } catch (err) {
    return { success: false, error: `PDF extraction failed: ${err.message}` };
  }
}

async function extractDocxText(filePath) {
  const docxParser = await getMammoth();
  if (!docxParser) {
    return { 
      success: false, 
      error: 'DOCX parsing not available (mammoth not installed)' 
    };
  }

  try {
    const result = await docxParser.extractRawText({ path: filePath });
    
    if (!result.value || result.value.trim().length === 0) {
      return { 
        success: true, 
        content: '[Document appears to be empty]' 
      };
    }

    return { success: true, content: result.value };
  } catch (err) {
    return { success: false, error: `DOCX extraction failed: ${err.message}` };
  }
}

module.exports = { extractDocumentText };
