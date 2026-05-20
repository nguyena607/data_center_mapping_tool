import { DERIVED_TO_SOURCE_COLUMN } from './database.js';
import {
  VALID_BWS_LABELS,
  VALID_DASHBOARD_STATUSES,
  buildSqlPrompt,
  buildSqlUserPrompt,
  buildSummaryPrompt,
} from './sqlPrompt.js';

const MAX_MESSAGES = 10;
const SPARSE_MISSING_RATIO = 0.5;

export class ChatbotError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.name = 'ChatbotError';
    this.code = code;
    this.status = status;
  }
}

export function isGeminiRateLimit(error) {
  const message = String(error?.message || '');
  return error?.status === 429 ||
    error?.statusCode === 429 ||
    message.includes('429') ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.toLowerCase().includes('rate limit');
}

function cleanConversationMessages(messages) {
  return messages
    .slice(-MAX_MESSAGES)
    .map((message) => ({
      role: message?.role === 'assistant' ? 'assistant' : 'user',
      text: typeof message?.text === 'string' ? message.text.trim() : '',
    }))
    .filter((message) => message.text);
}

function getLatestUserMessage(messages) {
  return messages
    .reverse()
    .find((message) => message.role === 'user')
    ?.text
    || '';
}

function getConversationContext(messages) {
  const latestUserIndex = messages.findLastIndex((message) => message.role === 'user');
  const contextMessages = latestUserIndex === -1 ? messages : messages.slice(0, latestUserIndex);

  return contextMessages
    .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.text}`)
    .join('\n');
}

function validateDashboardFilter(filter) {
  if (!filter || typeof filter !== 'object') {
    return null;
  }

  const nextFilter = {};

  if (typeof filter.searchQuery === 'string') {
    nextFilter.searchQuery = filter.searchQuery.trim();
  }

  if (Array.isArray(filter.activeStatuses)) {
    const activeStatuses = filter.activeStatuses
      .filter((status) => VALID_DASHBOARD_STATUSES.includes(status));
    nextFilter.activeStatuses = activeStatuses;
  }

  if (Array.isArray(filter.activeBWSLabels)) {
    const activeBWSLabels = filter.activeBWSLabels
      .filter((label) => VALID_BWS_LABELS.includes(label));
    nextFilter.activeBWSLabels = activeBWSLabels;
  }

  return Object.keys(nextFilter).length ? nextFilter : null;
}

function parseActionResponse(text) {
  const cleaned = text.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  // If the response is not valid JSON, return nulls
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { sql: null, filter: null, message: null };
  }

  const sql = typeof parsed.sql === 'string' ? parsed.sql.trim() : null;
  const message = typeof parsed.message === 'string' ? parsed.message.trim() : null;

  return {
    sql: sql || null,
    filter: validateDashboardFilter(parsed.filter),
    message: message || null,
  };
}

function validateSql(sql, dataCenters, resultLimit) {
  let cleanSql = sql.trim();

  if (cleanSql.endsWith(';')) {
    cleanSql = cleanSql.slice(0, -1).trim();
  }

  if (!/^select\b/i.test(cleanSql)) {
    throw new Error('Only SELECT queries are allowed.');
  }

  if (cleanSql.includes(';')) {
    throw new Error('Only one SQL statement is allowed.');
  }

  if (/--|\/\*/.test(cleanSql)) {
    throw new Error('SQL comments are not allowed.');
  }

  if (/\b(drop|delete|insert|update|create|alter|attach|detach|pragma|vacuum)\b/i.test(cleanSql)) {
    throw new Error('Only read-only SELECT queries are allowed.');
  }

  if (!/\bfrom\s+["`]?\bdata_centers\b["`]?/i.test(cleanSql)) {
    throw new Error('Queries must read from data_centers.');
  }

  if (!/\blimit\b/i.test(cleanSql)) {
    cleanSql = `${cleanSql} LIMIT ${resultLimit}`;
  }

  dataCenters.db.prepare(`EXPLAIN QUERY PLAN ${cleanSql}`).all();
  return cleanSql;
}

function sqlReferencesColumn(sql, column) {
  return new RegExp(`\\b${column}\\b`, 'i').test(sql);
}

function getSparseNotes(sql, dataCenters) {
  const referencedSources = new Set();

  for (const column of dataCenters.columns) {
    if (sqlReferencesColumn(sql, column)) {
      referencedSources.add(column);
    }
  }

  for (const [derivedColumn, sourceColumn] of Object.entries(DERIVED_TO_SOURCE_COLUMN)) {
    if (sqlReferencesColumn(sql, derivedColumn)) {
      referencedSources.add(sourceColumn);
    }
  }

  return [...referencedSources]
    .map((column) => ({ column, stats: dataCenters.missingStats[column] }))
    .filter(({ stats }) => stats && stats.missingRatio > SPARSE_MISSING_RATIO)
    .map(({ column, stats }) => (
      `Note: \`${column}\` is missing for ${stats.missing.toLocaleString()} of ${stats.total.toLocaleString()} rows, so this result only reflects rows where that field is reported.`
    ));
}

function buildResult(sql, rows, notes, resultLimit) {
  return {
    sql,
    rows,
    notes,
    rowLimit: resultLimit,
  };
}

async function summarizeResult({
  ai,
  model,
  conversation,
  userQuestion,
  sql,
  rows,
  notes,
  actionMessage,
  resultLimit,
  summaryThinkingLevel,
}) {
  const summaryPrompt = buildSummaryPrompt({
    conversation,
    userQuestion,
    sql,
    rows,
    notes,
    rowLimit: resultLimit,
    actionMessage,
  });

  // console.log('Gemini summary prompt:', summaryPrompt);
  const response = await ai.models.generateContent({
    model,
    contents: summaryPrompt,
    config: {
      thinkingConfig: {
        thinkingLevel: summaryThinkingLevel,
      },
    },
  });

  console.log('Gemini summary response:', response.text || '');
  return response.text || 'I generated the SQL and results, but Gemini returned an empty summary.';
}

export async function runChatbotTurn({
  ai,
  model,
  dataCenters,
  messages,
  resultLimit,
  sqlThinkingLevel,
  summaryThinkingLevel,
}) {
  if (!ai) {
    throw new ChatbotError(
      'MISSING_API_KEY',
      'Missing GOOGLE_API_KEY. Add it to your .env file and restart the server.',
      500,
    );
  }

  const conversationMessages = cleanConversationMessages(messages);
  const conversation = getConversationContext(conversationMessages);
  const message = getLatestUserMessage([...conversationMessages]);
  if (!message) {
    throw new ChatbotError('EMPTY_MESSAGE', 'Please enter a message before sending.', 400);
  }

  const systemPrompt = buildSqlPrompt(dataCenters);
  const userPrompt = buildSqlUserPrompt({
    conversation,
    latestQuestion: message,
  });

  // console.log('Gemini action system prompt:', systemPrompt);
  // console.log('Gemini action user prompt:', userPrompt);
  const response = await ai.models.generateContent({
    model,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      thinkingConfig: {
        thinkingLevel: sqlThinkingLevel,
      },
    },
  });

  console.log('Gemini action response:', response.text || '');
  const action = parseActionResponse(response.text || '');
  const { sql, filter } = action;

  if (!sql && !filter) {
    return {
      reply: 'I can answer questions about the data center dataset. Try asking something like "How many data centers are there in Illinois?"',
    };
  }

  if (!sql) {
    return {
      reply: action.message || 'I updated the dashboard filters.',
      filter,
    };
  }

  const validSql = validateSql(sql, dataCenters, resultLimit);
  const rows = dataCenters.db.prepare(validSql).all();
  const notes = getSparseNotes(validSql, dataCenters);
  const result = buildResult(validSql, rows, notes, resultLimit);

  let reply;
  try {
    reply = await summarizeResult({
      ai,
      model,
      conversation,
      userQuestion: message,
      sql: validSql,
      rows,
      notes,
      actionMessage: action.message,
      resultLimit,
      summaryThinkingLevel,
    });
  } catch (summaryError) {
    if (isGeminiRateLimit(summaryError)) {
      reply = 'I generated the SQL and results, but ran out of Gemini requests before summarizing. Open the SQL/results panel to inspect the table.';
    } else {
      console.error('Gemini summary request failed:', summaryError);
      reply = 'I generated the SQL and results, but had trouble summarizing them. Open the SQL/results panel to inspect the table.';
    }
  }

  return {
    reply,
    result,
    filter,
  };
}
