const db = require('../models/db');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

const ERROR_CATEGORIES = {
  LLM_ERROR: 'llm_error',
  VALIDATION_ERROR: 'validation_error',
  SECURITY_ERROR: 'security_error',
  SYSTEM_ERROR: 'system_error',
};

function categorizeError(error, nodeName) {
  if (!error) return null;
  const msg = (error.message || String(error)).toLowerCase();
  if (msg.includes('syntax') || msg.includes('parse') || msg.includes('json') || msg.includes('malformed')) return ERROR_CATEGORIES.VALIDATION_ERROR;
  if (msg.includes('unsafe') || msg.includes('dangerous') || msg.includes('security') || msg.includes('cookie') || msg.includes('iframe') || msg.includes('script')) return ERROR_CATEGORIES.SECURITY_ERROR;
  if (msg.includes('api') || msg.includes('openai') || msg.includes('rate') || msg.includes('token') || msg.includes('model') || msg.includes('timeout') || msg.includes('connection') || msg.includes('network')) return ERROR_CATEGORIES.LLM_ERROR;
  return ERROR_CATEGORIES.SYSTEM_ERROR;
}

function createTrace({ userId, userPrompt, imageUrls = [] }) {
  const id = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO generation_traces (id, user_id, user_prompt, image_urls, status, node_executions, started_at)
    VALUES (?, ?, ?, ?, 'started', '[]', ?)
  `).run(id, userId, userPrompt, JSON.stringify(imageUrls), now);

  return id;
}

function updateTraceState(traceId, updates) {
  const sets = [];
  const params = [];

  if (updates.status !== undefined) { sets.push('status = ?'); params.push(updates.status); }
  if (updates.error !== undefined) { sets.push('error = ?'); params.push(updates.error); }
  if (updates.errorCategory !== undefined) { sets.push('error_category = ?'); params.push(updates.errorCategory); }
  if (updates.errorNode !== undefined) { sets.push('error_node = ?'); params.push(updates.errorNode); }
  if (updates.gameId !== undefined) { sets.push('game_id = ?'); params.push(updates.gameId); }
  if (updates.gameDesign !== undefined) { sets.push('game_design = ?'); params.push(JSON.stringify(updates.gameDesign)); }
  if (updates.totalDurationMs !== undefined) { sets.push('total_duration_ms = ?'); params.push(updates.totalDurationMs); }
  if (updates.totalTokens !== undefined) { sets.push('total_tokens = ?'); params.push(updates.totalTokens); }
  if (updates.retryCount !== undefined) { sets.push('retry_count = ?'); params.push(updates.retryCount); }
  if (updates.completedAt !== undefined) { sets.push('completed_at = ?'); params.push(updates.completedAt); }
  if (updates.nodeExecutions !== undefined) { sets.push('node_executions = ?'); params.push(JSON.stringify(updates.nodeExecutions)); }

  if (sets.length === 0) return;

  params.push(traceId);
  db.prepare(`UPDATE generation_traces SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

function appendNodeExecution(traceId, nodeExecution) {
  const row = db.prepare('SELECT node_executions FROM generation_traces WHERE id = ?').get(traceId);
  if (!row) return;

  let nodeExecutions;
  try {
    nodeExecutions = JSON.parse(row.node_executions);
  } catch {
    nodeExecutions = [];
  }
  nodeExecutions.push(nodeExecution);
  db.prepare('UPDATE generation_traces SET node_executions = ? WHERE id = ?')
    .run(JSON.stringify(nodeExecutions), traceId);
}

function getTrace(traceId) {
  const row = db.prepare('SELECT * FROM generation_traces WHERE id = ?').get(traceId);
  if (!row) return null;
  return formatRow(row);
}

function listTraces({ userId, status, page = 1, pageSize = 20 }) {
  const conditions = [];
  const params = [];

  if (userId) { conditions.push('user_id = ?'); params.push(userId); }
  if (status) { conditions.push('status = ?'); params.push(status); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * pageSize;

  const rows = db.prepare(`
    SELECT * FROM generation_traces ${where}
    ORDER BY started_at DESC LIMIT ? OFFSET ?
  `).all(...params, pageSize, offset);

  const { total } = db.prepare(`SELECT COUNT(*) as total FROM generation_traces ${where}`).get(...params);

  return {
    traces: rows.map(formatRow),
    total,
    page,
    pageSize,
  };
}

function getFailedTraces({ userId, page = 1, pageSize = 20 }) {
  return listTraces({ userId, status: 'failed', page, pageSize });
}

function getTraceStats() {
  const total = db.prepare('SELECT COUNT(*) as c FROM generation_traces').get().c;
  const failed = db.prepare("SELECT COUNT(*) as c FROM generation_traces WHERE status = 'failed'").get().c;
  const completed = db.prepare("SELECT COUNT(*) as c FROM generation_traces WHERE status = 'completed'").get().c;
  const avgDuration = db.prepare("SELECT AVG(total_duration_ms) as c FROM generation_traces WHERE status = 'completed' AND total_duration_ms > 0").get().c || 0;

  const errorBreakdown = db.prepare(`
    SELECT error_category, COUNT(*) as count
    FROM generation_traces
    WHERE status = 'failed' AND error_category IS NOT NULL
    GROUP BY error_category ORDER BY count DESC
  `).all();

  const nodeFailureBreakdown = db.prepare(`
    SELECT error_node, COUNT(*) as count
    FROM generation_traces
    WHERE status = 'failed' AND error_node IS NOT NULL
    GROUP BY error_node ORDER BY count DESC
  `).all();

  return {
    total, failed, completed,
    failureRate: total > 0 ? ((failed / total) * 100).toFixed(1) + '%' : '0%',
    avgDurationMs: Math.round(avgDuration),
    errorBreakdown,
    nodeFailureBreakdown,
  };
}

function formatRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userPrompt: row.user_prompt,
    imageUrls: row.image_urls ? JSON.parse(row.image_urls) : [],
    status: row.status,
    error: row.error,
    errorCategory: row.error_category,
    errorNode: row.error_node,
    gameId: row.game_id,
    gameDesign: row.game_design ? JSON.parse(row.game_design) : null,
    nodeExecutions: row.node_executions ? JSON.parse(row.node_executions) : [],
    totalDurationMs: row.total_duration_ms,
    totalTokens: row.total_tokens,
    retryCount: row.retry_count,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

module.exports = {
  createTrace,
  updateTraceState,
  appendNodeExecution,
  getTrace,
  listTraces,
  getFailedTraces,
  getTraceStats,
  categorizeError,
  ERROR_CATEGORIES,
};
