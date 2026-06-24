const { chat, chatWithAttachments, loadTextFile, SUPPORTS_IMAGE_INPUT } = require('./openaiClient');

const SYSTEM_PROMPT = `You are a Game Designer Agent. Your job is to take a user's game idea and create a detailed game design specification.

Given a user's game description, output a structured game design document in JSON format with the following fields:
{
  "title": "A catchy game title (max 40 chars)",
  "genre": "Game genre (e.g., action, puzzle, platformer, shooter, racing, rpg, simulation, etc.)",
  "description": "A compelling 1-2 sentence game description",
  "tags": ["tag1", "tag2", "tag3"],
  "mechanics": "Detailed description of core game mechanics and rules",
  "controls": "How the player controls the game (keyboard, mouse, touch, etc.)",
  "winCondition": "How to win",
  "loseCondition": "How to lose or game over condition",
  "visualStyle": "Description of the visual style, colors, and UI elements",
  "features": ["feature1", "feature2", "feature3", "feature4", "feature5"],
  "assetUsage": "If uploaded assets are available, describe how to use them as background, player, enemy, platform, collectible, UI, or mood references"
}

Make the game design practical and implementable as a single-page HTML5 Canvas game.
When uploaded images are listed, explicitly plan to display them in gameplay instead of only using them as abstract inspiration.
Respond ONLY with valid JSON, no markdown code fences or additional text.`;

function normalizeAttachment(attachment) {
  if (typeof attachment === 'string') {
    return { url: attachment, name: attachment.split('/').pop() || 'image', type: 'image', kind: 'image' };
  }

  const type = attachment.mimetype || attachment.type || '';
  const url = attachment.url || '';
  const name = attachment.originalName || attachment.filename || url.split('/').pop() || 'attachment';

  let kind = attachment.kind;
  if (!kind) {
    if (type.startsWith('image/')) kind = 'image';
    else if (type.startsWith('video/')) kind = 'video';
    else kind = 'file';
  }

  return { ...attachment, url, name, type, kind };
}

function buildAttachmentContext(attachments) {
  if (!attachments.length) return '';

  const lines = ['Uploaded creative references:'];

  for (const attachment of attachments) {
    lines.push(`- ${attachment.name} (${attachment.type || attachment.kind})`);

    const looksTextLike =
      attachment.kind === 'file' &&
      (
        attachment.type.startsWith('text/') ||
        attachment.type === 'application/json' ||
        attachment.name.endsWith('.txt') ||
        attachment.name.endsWith('.md') ||
        attachment.name.endsWith('.json') ||
        attachment.name.endsWith('.csv')
      );

    if (looksTextLike) {
      const content = loadTextFile(attachment.url);
      if (content) {
        lines.push(`  Content excerpt:\n${content}`);
      }
    } else if (attachment.kind === 'image' && !SUPPORTS_IMAGE_INPUT) {
      lines.push('  Current model endpoint cannot inspect image pixels, so use this image filename/type as a visual direction together with the user prompt.');
    } else if (attachment.kind === 'video') {
      lines.push('  Treat this uploaded video as motion, pacing, visual-style, character, or mechanic inspiration based on its filename and user prompt. Do not claim to have inspected frames unless visible image references are also supplied.');
    } else if (attachment.kind === 'file') {
      lines.push('  Use this file as a high-level creative reference based on its filename and type.');
    }
  }

  return `\n\n${lines.join('\n')}`;
}

async function designGame(userPrompt, attachments = []) {
  const normalizedAttachments = attachments.map(normalizeAttachment).filter(a => a.url);
  const imageAttachments = normalizedAttachments.filter(a => a.kind === 'image');
  const attachmentContext = buildAttachmentContext(normalizedAttachments);
  let response;

  if (normalizedAttachments.length > 0) {
    console.log(`[GameDesigner] Using multimodal mode with ${normalizedAttachments.length} attachment(s), ${imageAttachments.length} image(s)`);
    const userText = `User's game idea: ${userPrompt}${attachmentContext}\n\nUse uploaded images as direct visual references. Use uploaded files and videos as auxiliary creative references for theme, mechanics, pacing, controls, and polish.`;
    response = await chatWithAttachments(SYSTEM_PROMPT, userText, normalizedAttachments);
  } else {
    const userMessage = `User's game idea: ${userPrompt}`;
    response = await chat([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage }
    ], { temperature: 0.8 });
  }

  try {
    const cleanJson = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (e) {
    console.error('[GameDesigner] Failed to parse output:', e.message);
    return {
      title: userPrompt.slice(0, 40),
      genre: 'casual',
      description: userPrompt,
      tags: ['game'],
      mechanics: 'Interactive game based on user description',
      controls: 'Keyboard and mouse',
      winCondition: 'Achieve the highest score',
      loseCondition: 'Game over when health reaches zero',
      visualStyle: 'Colorful 2D graphics',
      features: ['Score tracking', 'Responsive design', 'Restart button']
    };
  }
}

module.exports = { designGame };
