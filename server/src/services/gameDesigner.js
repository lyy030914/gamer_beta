const { chat } = require('./openaiClient');

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
  "features": ["feature1", "feature2", "feature3", "feature4", "feature5"]
}

Make the game design practical and implementable as a single-page HTML5 Canvas game.
Respond ONLY with valid JSON, no markdown code fences or additional text.`;

async function designGame(userPrompt, uploadedFiles = []) {
  const userMessage = uploadedFiles.length > 0
    ? `User's game idea: ${userPrompt}\n\nNote: The user also uploaded ${uploadedFiles.length} reference file(s). Consider these as visual/style inspiration.`
    : `User's game idea: ${userPrompt}`;

  const response = await chat([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage }
  ], { temperature: 0.8 });

  try {
    const cleanJson = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (e) {
    console.error('Failed to parse Game Designer output:', e.message);
    const fallback = {
      title: userPrompt.slice(0, 40),
      genre: 'casual',
      description: userPrompt,
      tags: ['game'],
      mechanics: 'Interactive game based on user description',
      controls: 'Keyboard and mouse',
      winCondition: 'Achieve the highest score',
      loseCondition: 'Game over when health reaches zero',
      visualStyle: 'Colorful 2D graphics with particle effects',
      features: ['Score tracking', 'Sound effects', 'Responsive design', 'Restart button']
    };
    return fallback;
  }
}

module.exports = { designGame };
