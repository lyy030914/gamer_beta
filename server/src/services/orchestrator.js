const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { designGame } = require('./gameDesigner');
const { generateGameCode } = require('./codeGenerator');
const db = require('../models/db');

const uploadsDir = path.resolve(process.env.UPLOAD_DIR || './uploads');

async function orchestrateGameGeneration(userPrompt, userId, imageUrls = []) {
  console.log(`[Orchestrator] Starting game generation for user ${userId}`);
  console.log(`[Orchestrator] Prompt: "${userPrompt.slice(0, 100)}${userPrompt.length > 100 ? '...' : ''}"`);
  if (imageUrls.length > 0) console.log(`[Orchestrator] Reference images: ${imageUrls.length}`);

  const steps = [];

  // Step 1: Game Designer Agent
  console.log('[Orchestrator] Step 1: Game Designer Agent - Designing game...');
  steps.push({ agent: 'Game Designer', status: 'running', message: imageUrls.length ? 'Analyzing images...' : 'Designing game mechanics...' });

  let gameDesign;
  try {
    gameDesign = await designGame(userPrompt, imageUrls);
    steps[0].status = 'done';
    steps[0].message = `Game "${gameDesign.title}" designed (${gameDesign.genre})`;
    console.log('[Orchestrator] Game design complete:', JSON.stringify(gameDesign).slice(0, 200));
  } catch (e) {
    steps[0].status = 'failed';
    steps[0].message = 'Failed to design game: ' + e.message;
    throw new Error('Game design failed: ' + e.message);
  }

  // Step 2: Code Generator Agent
  console.log('[Orchestrator] Step 2: Code Generator Agent - Generating code...');
  steps.push({ agent: 'Code Generator', status: 'running', message: 'Generating game code...' });

  let gameCode;
  try {
    gameCode = await generateGameCode(gameDesign);
    steps[1].status = 'done';
    steps[1].message = `Game code generated (${gameCode.length} chars)`;
    console.log(`[Orchestrator] Code generated: ${gameCode.length} chars`);
  } catch (e) {
    steps[1].status = 'failed';
    steps[1].message = 'Failed to generate code: ' + e.message;
    throw new Error('Code generation failed: ' + e.message);
  }

  // Step 3: Save game file
  console.log('[Orchestrator] Step 3: Saving game file...');
  steps.push({ agent: 'File Storage', status: 'running', message: 'Saving game file...' });

  const filename = `${uuidv4()}.html`;
  const gameDir = path.join(uploadsDir, 'games');
  if (!fs.existsSync(gameDir)) {
    fs.mkdirSync(gameDir, { recursive: true });
  }
  const filePath = path.join(gameDir, filename);
  fs.writeFileSync(filePath, gameCode, 'utf-8');

  const gameUrl = `/uploads/games/${filename}`;
  steps[2].status = 'done';
  steps[2].message = `Saved as ${filename}`;

  // Step 4: Save to database
  console.log('[Orchestrator] Step 4: Saving to database...');
  steps.push({ agent: 'Database', status: 'running', message: 'Saving to database...' });

  const coverUrl = imageUrls.length > 0 ? imageUrls[0] : '';

  const result = db.prepare(`
    INSERT INTO games (title, description, cover_url, game_url, tags, author_id, status)
    VALUES (?, ?, ?, ?, ?, ?, 'published')
  `).run(
    gameDesign.title,
    gameDesign.description,
    coverUrl,
    gameUrl,
    (gameDesign.tags || []).join(','),
    userId
  );

  const gameId = result.lastInsertRowid;

  // Save meta
  db.prepare('INSERT INTO game_meta (game_id, meta_json) VALUES (?, ?)').run(
    gameId,
    JSON.stringify({
      genre: gameDesign.genre,
      mechanics: gameDesign.mechanics,
      controls: gameDesign.controls,
      winCondition: gameDesign.winCondition,
      loseCondition: gameDesign.loseCondition,
      visualStyle: gameDesign.visualStyle,
      features: gameDesign.features || [],
      referenceImages: imageUrls,
      generatedAt: new Date().toISOString()
    })
  );

  steps[3].status = 'done';
  steps[3].message = `Game #${gameId} saved to database`;

  console.log(`[Orchestrator] Game generation complete! Game ID: ${gameId}`);

  return {
    game: {
      id: gameId,
      title: gameDesign.title,
      description: gameDesign.description,
      genre: gameDesign.genre,
      tags: gameDesign.tags || [],
      gameUrl: gameUrl,
      features: gameDesign.features || [],
      controls: gameDesign.controls,
      winCondition: gameDesign.winCondition,
      loseCondition: gameDesign.loseCondition,
      visualStyle: gameDesign.visualStyle,
      mechanics: gameDesign.mechanics,
    },
    steps
  };
}

module.exports = { orchestrateGameGeneration };
