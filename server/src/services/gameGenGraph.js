const { StateGraph, END } = require('@langchain/langgraph');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const db = require('../models/db');
const { designGame } = require('./gameDesigner');
const { generateGameCode } = require('./codeGenerator');
const { validateGeneratedCode, sanitizeHtmlCode } = require('./security');

const uploadsDir = path.resolve(process.env.UPLOAD_DIR || './uploads');

function createGameGenGraph() {
  const graph = new StateGraph({
    channels: {
      userId: { value: (a, b) => b || a },
      userPrompt: { value: (a, b) => b || a },
      imageUrls: { reducer: (a, b) => b || a },
      gameDesign: { value: (a, b) => b || a },
      gameCode: { value: (a, b) => b || a },
      validation: { value: (a, b) => b || a },
      gameId: { value: (a, b) => b || a },
      gameUrl: { value: (a, b) => b || a },
      coverUrl: { value: (a, b) => b || a },
      steps: { reducer: (a, b) => { a.push(b); return a; } },
      status: { value: (a, b) => b || a, default: () => 'running' },
      error: { value: (a, b) => b || a },
      retryCount: { value: (a, b) => (b !== undefined ? b : (a || 0)) },
      version: { value: (a, b) => b || a, default: () => 1 },
    }
  });

  // Node 1: Game Designer
  graph.addNode('gameDesigner', async (state) => {
    console.log('[LangGraph] gameDesigner node');
    const step = { agent: 'Game Designer', status: 'running', message: state.imageUrls?.length ? 'Analyzing images...' : 'Designing game...', timestamp: Date.now() };
    const steps = [...state.steps, step];

    try {
      const gameDesign = await designGame(state.userPrompt, state.imageUrls || []);
      return {
        gameDesign,
        steps: [...steps, { ...step, status: 'done', message: `${gameDesign.title} (${gameDesign.genre})` }],
        status: 'designing'
      };
    } catch (e) {
      return {
        steps: [...steps, { ...step, status: 'failed', message: e.message }],
        error: e.message,
        status: 'failed'
      };
    }
  });

  // Node 2: Code Generator
  graph.addNode('codeGenerator', async (state) => {
    console.log('[LangGraph] codeGenerator node');
    const step = { agent: 'Code Generator', status: 'running', message: 'Generating HTML5 game...', timestamp: Date.now() };
    const steps = [...state.steps, step];

    try {
      const gameCode = await generateGameCode(state.gameDesign);
      return {
        gameCode,
        steps: [...steps, { ...step, status: 'done', message: `${gameCode.length} chars` }],
        retryCount: 0,
        status: 'generating'
      };
    } catch (e) {
      return {
        steps: [...steps, { ...step, status: 'failed', message: e.message }],
        error: e.message,
        status: 'failed'
      };
    }
  });

  // Node 3: Code Validator
  graph.addNode('codeValidator', async (state) => {
    console.log('[LangGraph] codeValidator node');
    const step = { agent: 'Validator', status: 'running', message: 'Validating code...', timestamp: Date.now() };
    const steps = [...state.steps, step];

    const validation = validateGeneratedCode(state.gameCode);

    if (validation.safe) {
      return {
        validation,
        steps: [...steps, { ...step, status: 'done', message: 'Passed' }],
        status: 'validated'
      };
    }

    const retryCount = (state.retryCount || 0) + 1;
    if (retryCount <= 2) {
      console.log(`[LangGraph] Validation failed (attempt ${retryCount}), sanitizing...`);
      const sanitized = sanitizeHtmlCode(state.gameCode);
      return {
        gameCode: sanitized,
        validation,
        retryCount,
        steps: [...steps, { ...step, status: 'running', message: `Retry ${retryCount}/2 after sanitization` }],
        status: 'retrying'
      };
    }

    return {
      validation,
      retryCount,
      steps: [...steps, { ...step, status: 'failed', message: validation.reason }],
      error: validation.reason,
      status: 'failed'
    };
  });

  // Node 4: File Storage
  graph.addNode('fileStorage', async (state) => {
    console.log('[LangGraph] fileStorage node');
    const step = { agent: 'File Storage', status: 'running', message: 'Saving...', timestamp: Date.now() };
    const steps = [...state.steps, step];

    const filename = `${uuidv4()}.html`;
    const gameDir = path.join(uploadsDir, 'games');
    if (!fs.existsSync(gameDir)) fs.mkdirSync(gameDir, { recursive: true });
    fs.writeFileSync(path.join(gameDir, filename), state.gameCode, 'utf-8');

    const gameUrl = `/uploads/games/${filename}`;
    const coverUrl = state.imageUrls?.length > 0 ? state.imageUrls[0] : '';

    return {
      gameUrl,
      coverUrl,
      steps: [...steps, { ...step, status: 'done', message: filename }],
      status: 'saving'
    };
  });

  // Node 5: Database
  graph.addNode('dbStorage', async (state) => {
    console.log('[LangGraph] dbStorage node');
    const step = { agent: 'Database', status: 'running', message: 'Saving metadata...', timestamp: Date.now() };
    const steps = [...state.steps, step];

    const result = db.prepare(`
      INSERT INTO games (title, description, cover_url, game_url, tags, author_id, status)
      VALUES (?, ?, ?, ?, ?, ?, 'published')
    `).run(
      state.gameDesign?.title, state.gameDesign?.description, state.coverUrl, state.gameUrl,
      (state.gameDesign?.tags || []).join(','), state.userId
    );

    const gameId = result.lastInsertRowid;

    db.prepare('INSERT INTO game_meta (game_id, meta_json) VALUES (?, ?)').run(gameId, JSON.stringify({
      genre: state.gameDesign?.genre,
      mechanics: state.gameDesign?.mechanics,
      controls: state.gameDesign?.controls,
      winCondition: state.gameDesign?.winCondition,
      loseCondition: state.gameDesign?.loseCondition,
      visualStyle: state.gameDesign?.visualStyle,
      features: state.gameDesign?.features || [],
      referenceImages: state.imageUrls || [],
      graphSteps: state.steps.map(s => ({ agent: s.agent, status: s.status, message: s.message })),
      generatedAt: new Date().toISOString()
    }));

    return {
      gameId,
      steps: [...steps, { ...step, status: 'done', message: `Game #${gameId}` }],
      status: 'completed'
    };
  });

  // Define graph edges
  graph.addEdge('gameDesigner', 'codeGenerator');
  graph.addEdge('fileStorage', 'dbStorage');
  graph.addEdge('dbStorage', END);

  // Conditional edge: codeGenerator → validate and branch
  graph.addConditionalEdges('codeGenerator', (state) => {
    if (state.status === 'failed') return END;
    return 'codeValidator';
  });

  // Conditional edge: codeValidator → validate result
  graph.addConditionalEdges('codeValidator', (state) => {
    if (state.status === 'failed') return END;
    if (state.status === 'retrying') return 'codeGenerator';
    return 'fileStorage';
  });

  graph.setEntryPoint('gameDesigner');

  return graph.compile();
}

async function runGameGeneration(userPrompt, userId, imageUrls = []) {
  const graph = createGameGenGraph();
  const initialState = { userId, userPrompt, imageUrls: imageUrls || [], steps: [], status: 'started' };

  const stream = await graph.stream(initialState);
  let finalState = initialState;

  for await (const chunk of stream) {
    console.log('[LangGraph] Step:', Object.keys(chunk).join(', '));
    finalState = { ...finalState, ...Object.values(chunk)[0] };
  }

  return {
    game: {
      id: finalState.gameId,
      title: finalState.gameDesign?.title,
      description: finalState.gameDesign?.description,
      genre: finalState.gameDesign?.genre,
      tags: finalState.gameDesign?.tags || [],
      gameUrl: finalState.gameUrl,
      coverUrl: finalState.coverUrl,
      features: finalState.gameDesign?.features || [],
      controls: finalState.gameDesign?.controls,
      visualStyle: finalState.gameDesign?.visualStyle,
    },
    steps: finalState.steps,
    status: finalState.status,
    error: finalState.error
  };
}

module.exports = { runGameGeneration, createGameGenGraph };
