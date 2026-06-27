const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.5';
const BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const SUPPORTS_IMAGE_INPUT = /(^|\.)openai\.com\/v1\/?$/i.test(BASE_URL);

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.webp': 'image/webp',
    '.gif': 'image/gif', '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
  };
  return map[ext] || 'image/png';
}

function loadImageAsBase64(imageUrl) {
  const uploadsDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
  const relativePath = imageUrl.replace(/^\/uploads\//, '');
  const fullPath = path.join(uploadsDir, relativePath);

  if (!fs.existsSync(fullPath)) {
    console.warn(`[OpenAI] Image not found: ${fullPath}`);
    return null;
  }

  const buffer = fs.readFileSync(fullPath);
  const base64 = buffer.toString('base64');
  const mime = getMimeType(fullPath);
  return `data:${mime};base64,${base64}`;
}

async function chat(messages, options = {}) {
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 4096,
    thinking: { type: 'disabled' },
    ...options,
  });
  return {
    content: response.choices[0].message.content,
    usage: response.usage ? {
      promptTokens: response.usage.prompt_tokens || 0,
      completionTokens: response.usage.completion_tokens || 0,
      totalTokens: response.usage.total_tokens || 0,
    } : null,
  };
}

function loadTextFile(fileUrl, maxChars = 12000) {
  const uploadsDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
  const relativePath = fileUrl.replace(/^\/uploads\//, '');
  const fullPath = path.join(uploadsDir, relativePath);

  if (!fs.existsSync(fullPath)) {
    console.warn(`[OpenAI] File not found: ${fullPath}`);
    return null;
  }

  const buffer = fs.readFileSync(fullPath);
  return buffer.toString('utf-8').slice(0, maxChars);
}

async function chatWithImages(systemPrompt, userText, imageUrls = []) {
  const userContent = [{ type: 'text', text: userText }];

  for (const imageUrl of imageUrls) {
    const dataUri = loadImageAsBase64(imageUrl);
    if (dataUri) {
      userContent.push({
        type: 'image_url',
        image_url: { url: dataUri, detail: 'auto' }
      });
      console.log(`[OpenAI] Attached image: ${imageUrl} (${(dataUri.length / 1024).toFixed(0)}KB base64)`);
    }
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages,
    temperature: 0.8,
    max_tokens: 4096,
    thinking: { type: 'disabled' },
  });

  return {
    content: response.choices[0].message.content,
    usage: response.usage ? {
      promptTokens: response.usage.prompt_tokens || 0,
      completionTokens: response.usage.completion_tokens || 0,
      totalTokens: response.usage.total_tokens || 0,
    } : null,
  };
}

async function chatWithAttachments(systemPrompt, userText, attachments = []) {
  const userContent = [{ type: 'text', text: userText }];

  if (SUPPORTS_IMAGE_INPUT) {
    for (const attachment of attachments) {
      if (attachment.kind === 'image') {
        const dataUri = loadImageAsBase64(attachment.url);
        if (dataUri) {
          userContent.push({
            type: 'image_url',
            image_url: { url: dataUri, detail: 'auto' }
          });
          console.log(`[OpenAI] Attached image: ${attachment.url} (${(dataUri.length / 1024).toFixed(0)}KB base64)`);
        }
      }
    }
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: SUPPORTS_IMAGE_INPUT ? userContent : userText }
  ];

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages,
    temperature: 0.8,
    max_tokens: 4096,
    thinking: { type: 'disabled' },
  });

  return {
    content: response.choices[0].message.content,
    usage: response.usage ? {
      promptTokens: response.usage.prompt_tokens || 0,
      completionTokens: response.usage.completion_tokens || 0,
      totalTokens: response.usage.total_tokens || 0,
    } : null,
  };
}

module.exports = { openai, chat, chatWithImages, chatWithAttachments, loadImageAsBase64, loadTextFile, MODEL, SUPPORTS_IMAGE_INPUT };
