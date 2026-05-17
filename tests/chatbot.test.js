import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleGenAI } from '@google/genai';
import { runChatbotTurn } from '../backend/chatbot.js';
import { loadDataCenters } from '../backend/database.js';
import 'dotenv/config';

const MODEL = 'gemini-3.1-flash-lite';
const DATA_PATH = new URL('../public/data_centers.csv', import.meta.url);
const THINKING_LEVEL = 'minimal';

if (!process.env.GOOGLE_API_KEY) {
  throw new Error('Missing GOOGLE_API_KEY. Add it to your .env file before running npm run test:chatbot.');
}

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
const dataCenters = loadDataCenters(DATA_PATH);

function rowHasNumber(row, expected) {
  return Object.values(row).some((value) => Number(value) === expected);
}

function runTurn(text) {
  return runChatbotTurn({
    ai,
    model: MODEL,
    dataCenters,
    messages: [
      { role: 'user', text },
    ],
    resultLimit: 50,
    sqlThinkingLevel: THINKING_LEVEL,
    summaryThinkingLevel: THINKING_LEVEL,
  });
}

test('How many data centers are there in Illinois that are operating?', async () => {
  const response = await runTurn('How many data centers are there in Illinois that are operating?');

  assert.ok(response.reply);
  assert.ok(response.result);
  assert.equal(response.result.rows.length, 1);
  assert.ok(rowHasNumber(response.result.rows[0], 4));
});

test('How many more data centers does Illinois have than California?', async () => {
  const response = await runTurn('How many more data centers does Illinois have than California?');

  assert.ok(response.reply);
  assert.ok(response.result);
  assert.equal(response.result.rows.length, 1);
  assert.ok(rowHasNumber(response.result.rows[0], 6));
});

test('Show high water stress areas on the map, only operating and proposed.', async () => {
  const response = await runTurn('Show high water stress areas on the map, only operating and proposed.');

  assert.ok(response.reply);
  assert.ok(response.filter);
  assert.ok(response.filter.activeBWSLabels.includes('High (40-80%)'));
  assert.deepEqual(response.filter.activeStatuses, ['Operating', 'Proposed']);
});

test('Show Microsoft data centers on the map.', async () => {
  const response = await runTurn('Show Microsoft data centers on the map.');

  assert.ok(response.reply);
  assert.ok(response.filter);
  assert.equal(response.filter.searchQuery, 'Microsoft');
});

test('Filter the dashboard to California and count how many data centers are there.', async () => {
  const response = await runTurn('Filter the dashboard to California and count how many data centers are there.');

  assert.ok(response.reply);
  assert.ok(response.filter);
  assert.equal(response.filter.searchQuery, 'California');
  assert.ok(response.result);
  assert.equal(response.result.rows.length, 1);
  assert.ok(rowHasNumber(response.result.rows[0], 25));
});

test('Show proposed data centers in California on the map and count them.', async () => {
  const response = await runTurn('Show proposed data centers in California on the map and count them.');

  assert.ok(response.reply);
  assert.ok(response.filter);
  assert.equal(response.filter.searchQuery, 'California');
  assert.deepEqual(response.filter.activeStatuses, ['Proposed']);
  assert.ok(response.result);
  assert.equal(response.result.rows.length, 1);
  assert.ok(rowHasNumber(response.result.rows[0], 11));
});

test('Explain the central limit theorem.', async () => {
  const response = await runTurn('Explain the central limit theorem.');

  assert.ok(response.reply);
  assert.equal(response.result, undefined);
  assert.equal(response.filter, undefined);
});
