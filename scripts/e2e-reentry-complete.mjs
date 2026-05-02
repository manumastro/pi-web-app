#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3210';
const CWD_PATH = process.env.CWD_PATH ?? '/home/manu/pi-web-app';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 45_000);

function findAgentBrowserChrome() {
  const root = `${process.env.HOME ?? ''}/.agent-browser/browsers`;
  if (!fs.existsSync(root)) return undefined;
  const dirs = fs.readdirSync(root).filter((name) => name.startsWith('chrome-')).sort().reverse();
  for (const dir of dirs) {
    const candidate = path.join(root, dir, 'chrome');
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function iso(msOffset = 0) {
  return new Date(Date.UTC(2026, 4, 1, 12, 0, 0, msOffset)).toISOString();
}

function sseEvent(id, event, payload) {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function sseStream(events) {
  return events.map((entry) => sseEvent(entry.id, entry.event, entry.payload)).join('');
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

async function jsonResponse(route, status, payload) {
  await route.fulfill({
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
}

const sessionAId = `session-a-${Date.now()}`;
const sessionBId = `session-b-${Date.now()}`;
const turnId = `turn-${Date.now()}`;
const toolCallId = `tool-${Date.now()}`;
const finalAssistantText = 'The root package.json uses npm workspaces. The backend workspace handles the runner.';

const sessionAInitial = {
  id: sessionAId,
  cwd: CWD_PATH,
  title: 'Running session',
  model: 'mock/replay-model',
  status: 'busy',
  statusMessage: 'Working',
  messages: [
    {
      id: `user-${Date.now()}`,
      role: 'user',
      content: 'Inspect package.json and explain the workspace layout.',
      timestamp: iso(0),
      messageId: turnId,
    },
    {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: 'streaming',
      messageId: turnId,
    },
  ],
  createdAt: iso(-60_000),
  updatedAt: iso(0),
};

const sessionAFinal = {
  ...sessionAInitial,
  status: 'idle',
  statusMessage: 'CLI idle',
  messages: [
    {
      id: `user-${Date.now()}`,
      role: 'user',
      content: 'Inspect package.json and explain the workspace layout.',
      timestamp: iso(0),
      messageId: turnId,
    },
    {
      id: `tool-call-${toolCallId}`,
      role: 'tool_call',
      content: '{"path":"package.json"}',
      timestamp: iso(20),
      messageId: turnId,
      toolName: 'read',
      toolCallId,
    },
    {
      id: `tool-result-${toolCallId}`,
      role: 'tool_result',
      content: '{"content":[{"type":"text","text":"workspace scripts"}]}',
      timestamp: iso(30),
      messageId: turnId,
      toolCallId,
      success: true,
    },
    {
      id: `assistant-final-${Date.now()}`,
      role: 'assistant',
      content: finalAssistantText,
      timestamp: iso(60),
      messageId: turnId,
    },
  ],
  updatedAt: iso(70),
};

const sessionB = {
  id: sessionBId,
  cwd: CWD_PATH,
  title: 'Idle session',
  model: 'mock/replay-model',
  status: 'idle',
  messages: [],
  createdAt: iso(-120_000),
  updatedAt: iso(0),
};

const requestLog = [];
const pageErrors = [];
const consoleErrors = [];
let sessionAReentered = false;
const earlyEvents = [
  {
    id: 1,
    event: 'thinking',
    payload: {
      type: 'thinking',
      sessionId: sessionAId,
      messageId: turnId,
      content: '**Investigating live re-entry**\nChecking the workspace scripts.',
      done: false,
      timestamp: iso(10),
    },
  },
  {
    id: 2,
    event: 'tool_call',
    payload: {
      type: 'tool_call',
      sessionId: sessionAId,
      messageId: turnId,
      toolCallId,
      toolName: 'read',
      input: { path: 'package.json' },
      timestamp: iso(20),
    },
  },
  {
    id: 3,
    event: 'tool_result',
    payload: {
      type: 'tool_result',
      sessionId: sessionAId,
      messageId: turnId,
      toolCallId,
      result: '{"content":[{"type":"text","text":"workspace scripts"}]}',
      success: true,
      timestamp: iso(30),
    },
  },
  {
    id: 4,
    event: 'text_chunk',
    payload: {
      type: 'text_chunk',
      sessionId: sessionAId,
      messageId: turnId,
      content: 'The root package.json uses npm workspaces.',
      timestamp: iso(40),
    },
  },
];

const finalDoneEvent = [{
  id: 5,
  event: 'done',
  payload: {
    type: 'done',
    sessionId: sessionAId,
    messageId: turnId,
    aborted: false,
    timestamp: iso(60),
  },
}];

async function main() {
  const executablePath = process.env.CHROME_PATH ?? findAgentBrowserChrome();
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const page = await browser.newPage();

  page.on('pageerror', (error) => pageErrors.push(String(error?.message ?? error)));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();
    requestLog.push({ method, pathname, query: Object.fromEntries(url.searchParams.entries()) });

    if (pathname === '/api/config' && method === 'GET') {
      await jsonResponse(route, 200, { homeDir: CWD_PATH, piCwd: CWD_PATH, sessionsDir: `${CWD_PATH}/.pi/agent/sessions`, systemd: { restartEnabled: false } });
      return;
    }
    if (pathname === '/api/sessions' && method === 'GET') {
      await jsonResponse(route, 200, { sessions: [sessionAInitial, sessionB] });
      return;
    }
    if (pathname === `/api/sessions/${sessionAId}` && method === 'GET') {
      await jsonResponse(route, 200, { session: sessionAReentered ? sessionAFinal : sessionAInitial });
      return;
    }
    if (pathname === `/api/sessions/${sessionBId}` && method === 'GET') {
      await jsonResponse(route, 200, { session: sessionB });
      return;
    }
    if (pathname === '/api/models' && method === 'GET') {
      await jsonResponse(route, 200, { models: [{ key: 'mock/replay-model', id: 'replay-model', label: 'Replay model', available: true, active: true, provider: 'mock', reasoning: true, input: ['text'], contextWindow: 200000, maxTokens: 8192 }] });
      return;
    }
    if (pathname === '/api/models/session/thinking' && method === 'GET') {
      await jsonResponse(route, 200, { currentLevel: 'medium', availableLevels: ['minimal', 'low', 'medium', 'high'] });
      return;
    }
    if (pathname === '/api/preferences/models') {
      if (method === 'GET') {
        await jsonResponse(route, 200, { preferences: { favorites: [], recents: [], collapsedProviders: [] } });
        return;
      }
      if (method === 'PUT') {
        await jsonResponse(route, 200, { preferences: JSON.parse(await request.postData() || '{}') });
        return;
      }
    }
    if (pathname === '/api/directories' && method === 'GET') {
      await jsonResponse(route, 200, { path: CWD_PATH, directories: [] });
      return;
    }
    if (pathname === '/api/events' && method === 'GET') {
      const targetSessionId = url.searchParams.get('sessionId') ?? '';
      const replay = url.searchParams.get('replay') ?? '0';
      const lastEventId = url.searchParams.get('lastEventId') ?? '';

      if (targetSessionId === sessionAId && replay === '0') {
        await route.fulfill({
          status: 200,
          headers: {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache, no-transform',
            connection: 'keep-alive',
          },
          body: sessionAReentered ? '' : sseStream(earlyEvents),
        });
        return;
      }

      if (targetSessionId === sessionAId && replay === '1' && lastEventId === '4') {
        await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' }, body: sseStream(finalDoneEvent) });
        return;
      }

      if (targetSessionId === sessionBId) {
        sessionAReentered = true;
        await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' }, body: '' });
        return;
      }
    }
    if (pathname === '/api/messages/prompt' && method === 'POST') {
      await jsonResponse(route, 202, { sessionId: sessionAId, assistantMessage: '' });
      return;
    }

    await route.fulfill({ status: 404, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ error: `Unhandled route: ${method} ${pathname}` }) });
  });

  try {
    await page.goto(`${BASE_URL}/?cwd=${encodeURIComponent(CWD_PATH)}&sessionId=${encodeURIComponent(sessionAId)}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    await page.waitForSelector('.message-assistant-turn .tool-block', { timeout: TIMEOUT_MS });
    await page.waitForSelector('.message-assistant-turn .reasoning-timeline-block', { timeout: TIMEOUT_MS });

    const partialText = normalizeText(await page.locator('.message-assistant-turn').textContent());
    if (!partialText.includes('The root package.json uses npm workspaces.')) {
      throw new Error(JSON.stringify({ partialText }, null, 2));
    }

    await page.goto(`${BASE_URL}/?cwd=${encodeURIComponent(CWD_PATH)}&sessionId=${encodeURIComponent(sessionBId)}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    await page.waitForTimeout(150);
    sessionAReentered = true;

    await page.goto(`${BASE_URL}/?cwd=${encodeURIComponent(CWD_PATH)}&sessionId=${encodeURIComponent(sessionAId)}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    await page.waitForFunction((expected) => {
      const turn = document.querySelector('.message-assistant-turn');
      return Boolean(turn?.textContent?.includes(expected));
    }, finalAssistantText, { timeout: TIMEOUT_MS });
    const afterReturnText = normalizeText(await page.locator('.message-assistant-turn').textContent());
    if (!afterReturnText.includes('The backend workspace handles the runner.')) {
      throw new Error(JSON.stringify({ afterReturnText }, null, 2));
    }
    const turnCountAfterReturn = await page.locator('.message-assistant-turn').count();
    const toolCountAfterReturn = await page.locator('.message-assistant-turn .tool-block').count();
    const reasoningCountAfterReturn = await page.locator('.message-assistant-turn .reasoning-timeline-block').count();
    if (turnCountAfterReturn !== 1 || toolCountAfterReturn !== 1 || reasoningCountAfterReturn !== 1) {
      throw new Error(JSON.stringify({ turnCountAfterReturn, toolCountAfterReturn, reasoningCountAfterReturn }, null, 2));
    }

    const finalText = normalizeText(await page.locator('.message-assistant-turn').textContent());
    const eventRequests = requestLog.filter((entry) => entry.pathname === '/api/events');

    console.log(JSON.stringify({ ok: true, sessionAId, sessionBId, partialText, finalText, eventRequests, pageErrors, consoleErrors }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.stack : cause);
  process.exit(1);
});
