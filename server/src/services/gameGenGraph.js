const { StateGraph, END } = require('@langchain/langgraph');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const path = require('path');
const fs = require('fs');
const db = require('../models/db');
const { designGame } = require('./gameDesigner');
const { generateGameCode, validateHtmlGame } = require('./codeGenerator');
const { validateGeneratedCode, sanitizeHtmlCode } = require('./security');
const { createTrace, updateTraceState, appendNodeExecution, categorizeError } = require('./traceService');

const uploadsDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function makeNodeExecution(nodeName, overrides = {}) {
  return {
    node: nodeName,
    startedAt: new Date().toISOString(),
    endedAt: null,
    durationMs: 0,
    tokensUsed: 0,
    status: 'running',
    error: null,
    errorCategory: null,
    summary: '',
    ...overrides,
  };
}

function finishNodeExecution(exec, status, summary, tokensUsed = 0, error = null) {
  exec.endedAt = new Date().toISOString();
  exec.durationMs = Date.now() - new Date(exec.startedAt).getTime();
  exec.status = status;
  exec.summary = summary;
  exec.tokensUsed = tokensUsed;
  if (error) {
    exec.error = error.message || String(error);
    exec.errorCategory = categorizeError(error, exec.node);
  }
  return exec;
}

function createGameGenGraph(traceId) {
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
      totalTokens: { reducer: (a, b) => (a || 0) + (b || 0), default: () => 0 },
      nodeExecutions: { reducer: (a, b) => { a.push(b); return a; }, default: () => [] },
      traceId: { value: (a, b) => b || a },
      startTime: { value: (a, b) => a || b },
    }
  });

  // Node 1: Game Designer
  graph.addNode('gameDesigner', async (state) => {
    console.log(`[LangGraph][${traceId}] gameDesigner node`);
    const nodeExec = makeNodeExecution('gameDesigner');
    const step = { agent: 'Game Designer', status: 'running', message: state.imageUrls?.length ? 'Analyzing images...' : 'Designing game...', timestamp: Date.now() };
    const steps = [...state.steps, step];

    try {
      const gameDesign = await designGame(state.userPrompt, state.imageUrls || []);
      finishNodeExecution(nodeExec, 'done', `${gameDesign.title} (${gameDesign.genre})`);

      updateTraceState(traceId, { status: 'designing', gameDesign });
      appendNodeExecution(traceId, nodeExec);

      return {
        gameDesign,
        steps: [...steps, { ...step, status: 'done', message: `${gameDesign.title} (${gameDesign.genre})` }],
        status: 'designing',
        nodeExecutions: [nodeExec],
      };
    } catch (e) {
      console.error(`[LangGraph][${traceId}] gameDesigner failed:`, e.message);
      finishNodeExecution(nodeExec, 'failed', '', 0, e);

      updateTraceState(traceId, {
        status: 'failed',
        error: e.message,
        errorCategory: categorizeError(e, 'gameDesigner'),
        errorNode: 'gameDesigner',
        completedAt: new Date().toISOString(),
        totalDurationMs: Date.now() - (state.startTime || Date.now()),
      });
      appendNodeExecution(traceId, nodeExec);

      return {
        steps: [...steps, { ...step, status: 'failed', message: e.message }],
        error: e.message,
        status: 'failed',
        nodeExecutions: [nodeExec],
      };
    }
  });

  // Node 2: Code Generator
  graph.addNode('codeGenerator', async (state) => {
    console.log(`[LangGraph][${traceId}] codeGenerator node`);
    const nodeExec = makeNodeExecution('codeGenerator');
    const step = { agent: 'Code Generator', status: 'running', message: 'Generating HTML5 game...', timestamp: Date.now() };
    const steps = [...state.steps, step];
    const retryCount = state.retryCount || 0;

    try {
      const gameCode = await generateGameCode(state.gameDesign);
      finishNodeExecution(nodeExec, 'done', `${gameCode.length} chars`);

      updateTraceState(traceId, { status: 'generating', retryCount });
      appendNodeExecution(traceId, nodeExec);

      return {
        gameCode,
        steps: [...steps, { ...step, status: 'done', message: `${gameCode.length} chars` }],
        retryCount,
        status: 'generating',
        nodeExecutions: [nodeExec],
      };
    } catch (e) {
      console.error(`[LangGraph][${traceId}] codeGenerator failed:`, e.message);
      finishNodeExecution(nodeExec, 'failed', '', 0, e);

      updateTraceState(traceId, {
        status: 'failed',
        error: e.message,
        errorCategory: categorizeError(e, 'codeGenerator'),
        errorNode: 'codeGenerator',
        completedAt: new Date().toISOString(),
        totalDurationMs: Date.now() - (state.startTime || Date.now()),
      });
      appendNodeExecution(traceId, nodeExec);

      return {
        steps: [...steps, { ...step, status: 'failed', message: e.message }],
        error: e.message,
        status: 'failed',
        nodeExecutions: [nodeExec],
      };
    }
  });

  // Node 3: Code Validator (with retry + exponential backoff)
  graph.addNode('codeValidator', async (state) => {
    console.log(`[LangGraph][${traceId}] codeValidator node`);
    const nodeExec = makeNodeExecution('codeValidator');
    const step = { agent: 'Validator', status: 'running', message: 'Validating code...', timestamp: Date.now() };
    const steps = [...state.steps, step];

    const validation = validateGeneratedCode(state.gameCode);

    if (validation.safe) {
      finishNodeExecution(nodeExec, 'done', 'Passed');

      updateTraceState(traceId, { status: 'validated' });
      appendNodeExecution(traceId, nodeExec);

      return {
        validation,
        steps: [...steps, { ...step, status: 'done', message: 'Passed' }],
        status: 'validated',
        nodeExecutions: [nodeExec],
      };
    }

    const retryCount = (state.retryCount || 0) + 1;
    if (retryCount <= MAX_RETRIES) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, retryCount - 1);
      console.log(`[LangGraph][${traceId}] Validation failed (attempt ${retryCount}), sanitizing, waiting ${delay}ms...`);

      finishNodeExecution(nodeExec, 'running', `Retry ${retryCount}/${MAX_RETRIES} - sanitization`);

      appendNodeExecution(traceId, nodeExec);

      await sleep(delay);

      const sanitized = sanitizeHtmlCode(state.gameCode);
      return {
        gameCode: sanitized,
        validation,
        retryCount,
        steps: [...steps, { ...step, status: 'running', message: `Retry ${retryCount}/${MAX_RETRIES} after sanitization` }],
        status: 'retrying',
        nodeExecutions: [nodeExec],
      };
    }

    finishNodeExecution(nodeExec, 'failed', validation.reason, 0, new Error(validation.reason));

    updateTraceState(traceId, {
      status: 'failed',
      error: validation.reason,
      errorCategory: 'security_error',
      errorNode: 'codeValidator',
      retryCount,
      completedAt: new Date().toISOString(),
      totalDurationMs: Date.now() - (state.startTime || Date.now()),
    });
    appendNodeExecution(traceId, nodeExec);

    return {
      validation,
      retryCount,
      steps: [...steps, { ...step, status: 'failed', message: validation.reason }],
      error: validation.reason,
      status: 'failed',
      nodeExecutions: [nodeExec],
    };
  });

  // Node 4: File Storage
  graph.addNode('fileStorage', async (state) => {
    console.log(`[LangGraph][${traceId}] fileStorage node`);
    const nodeExec = makeNodeExecution('fileStorage');
    const step = { agent: 'File Storage', status: 'running', message: 'Saving...', timestamp: Date.now() };
    const steps = [...state.steps, step];

    try {
      const filename = `${uuidv4()}.html`;
      const gameDir = path.join(uploadsDir, 'games');
      if (!fs.existsSync(gameDir)) fs.mkdirSync(gameDir, { recursive: true });
      fs.writeFileSync(path.join(gameDir, filename), state.gameCode, 'utf-8');

      const gameUrl = `/uploads/games/${filename}`;
      const coverUrl = state.imageUrls?.length > 0 ? state.imageUrls[0] : '';

      finishNodeExecution(nodeExec, 'done', filename);

      updateTraceState(traceId, { status: 'saving' });
      appendNodeExecution(traceId, nodeExec);

      return {
        gameUrl,
        coverUrl,
        steps: [...steps, { ...step, status: 'done', message: filename }],
        status: 'saving',
        nodeExecutions: [nodeExec],
      };
    } catch (e) {
      console.error(`[LangGraph][${traceId}] fileStorage failed:`, e.message);
      finishNodeExecution(nodeExec, 'failed', '', 0, e);

      updateTraceState(traceId, {
        status: 'failed',
        error: e.message,
        errorCategory: 'system_error',
        errorNode: 'fileStorage',
        completedAt: new Date().toISOString(),
        totalDurationMs: Date.now() - (state.startTime || Date.now()),
      });
      appendNodeExecution(traceId, nodeExec);

      return {
        steps: [...steps, { ...step, status: 'failed', message: e.message }],
        error: e.message,
        status: 'failed',
        nodeExecutions: [nodeExec],
      };
    }
  });

  // Node 5: Database
  graph.addNode('dbStorage', async (state) => {
    console.log(`[LangGraph][${traceId}] dbStorage node`);
    const nodeExec = makeNodeExecution('dbStorage');
    const step = { agent: 'Database', status: 'running', message: 'Saving metadata...', timestamp: Date.now() };
    const steps = [...state.steps, step];

    try {
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

      const totalDurationMs = Date.now() - (state.startTime || Date.now());

      finishNodeExecution(nodeExec, 'done', `Game #${gameId}`);

      updateTraceState(traceId, {
        status: 'completed',
        gameId,
        completedAt: new Date().toISOString(),
        totalDurationMs,
        retryCount: state.retryCount || 0,
      });
      appendNodeExecution(traceId, nodeExec);

      return {
        gameId,
        steps: [...steps, { ...step, status: 'done', message: `Game #${gameId}` }],
        status: 'completed',
        nodeExecutions: [nodeExec],
      };
    } catch (e) {
      console.error(`[LangGraph][${traceId}] dbStorage failed:`, e.message);
      finishNodeExecution(nodeExec, 'failed', '', 0, e);

      updateTraceState(traceId, {
        status: 'failed',
        error: e.message,
        errorCategory: 'system_error',
        errorNode: 'dbStorage',
        completedAt: new Date().toISOString(),
        totalDurationMs: Date.now() - (state.startTime || Date.now()),
      });
      appendNodeExecution(traceId, nodeExec);

      return {
        steps: [...steps, { ...step, status: 'failed', message: e.message }],
        error: e.message,
        status: 'failed',
        nodeExecutions: [nodeExec],
      };
    }
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
  const traceId = createTrace({ userId, userPrompt, imageUrls: imageUrls || [] });
  console.log(`[LangGraph] Starting generation trace: ${traceId}`);

  const graph = createGameGenGraph(traceId);
  const initialState = {
    userId,
    userPrompt,
    imageUrls: imageUrls || [],
    steps: [],
    status: 'started',
    traceId,
    startTime: Date.now(),
  };

  let finalState = initialState;
  const allNodeExecutions = [];

  try {
    const stream = await graph.stream(initialState);

    for await (const chunk of stream) {
      const nodeName = Object.keys(chunk)[0];
      const nodeState = Object.values(chunk)[0];
      console.log(`[LangGraph][${traceId}] Step: ${nodeName} → ${nodeState.status}`);

      if (nodeState.nodeExecutions) {
        allNodeExecutions.push(...nodeState.nodeExecutions);
      }

      finalState = { ...finalState, ...nodeState };
    }

    // Persist all node executions to the trace
    updateTraceState(traceId, { nodeExecutions: allNodeExecutions });

    return {
      traceId,
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
      error: finalState.error,
    };
  } catch (e) {
    console.error(`[LangGraph][${traceId}] Graph execution error:`, e.message);
    updateTraceState(traceId, {
      status: 'failed',
      error: e.message,
      errorCategory: categorizeError(e, 'orchestrator'),
      errorNode: 'orchestrator',
      completedAt: new Date().toISOString(),
      totalDurationMs: Date.now() - (finalState.startTime || Date.now()),
      nodeExecutions: allNodeExecutions,
    });

    return {
      traceId,
      game: null,
      steps: finalState.steps || [],
      status: 'failed',
      error: e.message,
    };
  }
}

module.exports = { runGameGeneration, createGameGenGraph };
