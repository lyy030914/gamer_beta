const { chat } = require('./openaiClient');

const SYSTEM_PROMPT = `You are an expert Game Developer Agent specializing in creating complete, polished single-file HTML5 games. 

Your task: Generate a COMPLETE, FULLY FUNCTIONAL HTML file that implements the game design specification provided.

CRITICAL REQUIREMENTS:
1. The entire game MUST be a SINGLE self-contained HTML file with all CSS and JS inline
2. Use HTML5 Canvas for rendering the game
3. Implement ALL features listed in the design spec
4. The game must be FULLY PLAYABLE - no placeholder code, no TODOs, no "implement later"
5. Include proper game loop (requestAnimationFrame)
6. Handle keyboard AND mouse/touch input appropriately
7. Include score tracking, game states (start, playing, game over)
8. Add responsive design that works on different screen sizes
9. Use vibrant colors and smooth animations
10. Include sound effects via Web Audio API (simple beeps/tones)
11. Add particle effects for visual polish
12. The game canvas should adapt to the container size
13. Include a clean UI overlay with score, lives/health, and controls info
14. Add a start screen and game over screen with restart functionality

CODE QUALITY:
- Clean, well-structured JavaScript
- Meaningful variable names
- Proper game loop with deltaTime
- Collision detection where applicable
- Smooth 60fps performance

OUTPUT FORMAT:
Output ONLY the complete HTML file content. Start with <!DOCTYPE html>.
Do NOT include any markdown code fences, explanations, or additional text.
The output must be directly savable as an .html file and immediately playable.`;

async function generateGameCode(gameDesign) {
  const designPrompt = `
GAME DESIGN SPECIFICATION:
- Title: ${gameDesign.title}
- Genre: ${gameDesign.genre}
- Description: ${gameDesign.description}
- Mechanics: ${gameDesign.mechanics}
- Controls: ${gameDesign.controls}
- Win Condition: ${gameDesign.winCondition}
- Lose Condition: ${gameDesign.loseCondition}
- Visual Style: ${gameDesign.visualStyle}
- Features: ${(gameDesign.features || []).join(', ')}

Generate a complete, playable HTML5 game implementing this design.
Make sure it's FUN, POLISHED, and FULLY FUNCTIONAL.
The game should be immediately enjoyable and have good replay value.`;

  const response = await chat([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: designPrompt }
  ], { temperature: 0.7, max_tokens: 8192 });

  let code = response;
  code = code.replace(/^```html?\n?/i, '').replace(/^```\n?/i, '').replace(/```\n?$/i, '').trim();

  if (!code.startsWith('<!DOCTYPE html>') && !code.startsWith('<html')) {
    code = code.replace(/^[\s\S]*?(<!DOCTYPE html>)/, '$1');
  }

  return code;
}

module.exports = { generateGameCode };
