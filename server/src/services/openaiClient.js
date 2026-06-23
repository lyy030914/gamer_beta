const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

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
    ...options,
  });
  return response.choices[0].message.content;
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
  });

  return response.choices[0].message.content;
}

module.exports = { openai, chat, chatWithImages, loadImageAsBase64, MODEL };
