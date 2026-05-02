#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3210';
const CWD_PATH = process.env.CWD_PATH ?? '/home/manu/pi-web-app';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 45_000);
const REPLAY_DELAY_MS = Number(process.env.REPLAY_DELAY_MS ?? 350);

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

const partialAssistantText = 'The root package.json uses npm workspaces.';
const finalAssistantText = `${partialAssistantText} The backend workspace handles the runner.`;

const sessionA = {
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
      content: partialAssistantText,
      timestamp: iso(40),
    },
  },
];

const lateEvents = [
  {
    id: 5,
    event: 'text_chunk',
    payload: {
      type: 'text_chunk',
      sessionId: sessionAId,
      messageId: turnId,
      content: ' The backend workspace handles the runner.',
      timestamp: iso(50),
    },
  },
  {
    id: 6,
    event: 'done',
    payload: {
      type: 'done',
      sessionId: sessionAId,
      messageId: turnId,
      aborted: false,
      timestamp: iso(60),
    },
  },
];

const idleSessionEvents = [
  {
    id: 1,
    event: 'status',
    payload: {
      type: 'status',
      sessionId: sessionBId,
      status: 'idle',
      message: 'CLI idle',
      timestamp: iso(10),
    },
  },
  {
    id: 2,
    event: 'done',
    payload: {
      type: 'done',
      sessionId: sessionBId,
      messageId: `turn-${sessionBId}`,
      aborted: false,
      timestamp: iso(20),
    },
  },
];

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
      await jsonResponse(route, 200, {
        homeDir: CWD_PATH,
        piCwd: CWD_PATH,
        sessionsDir: `${CWD_PATH}/.pi/agent/sessions`,
        systemd: { restartEnabled: false },
      });
      return;
    }

    if (pathname === '/api/sessions' && method === 'GET') {
      await jsonResponse(route, 200, { sessions: [sessionA, sessionB] });
      return;
    }

    if (pathname === `/api/sessions/${sessionAId}` && method === 'GET') {
      await jsonResponse(route, 200, { session: sessionA });
      return;
    }

    if (pathname === `/api/sessions/${sessionBId}` && method === 'GET') {
      await jsonResponse(route, 200, { session: sessionB });
      return;
    }

    if (pathname === '/api/models' && method === 'GET') {
      await jsonResponse(route, 200, {
        models: [
          {
            key: 'mock/replay-model',
            id: 'replay-model',
            name: 'Replay model',
            available: true,
            isSelected: true,
            provider: 'mock',
            reasoning: true,
            input: ['text'],
            contextWindow: 200000,
            maxTokens: 8192,
          },
        ],
      });
      return;
    }

    if (pathname === '/api/models/session/thinking' && method === 'GET') {
      await jsonResponse(route, 200, {
        currentLevel: 'medium',
        availableLevels: ['minimal', 'low', 'medium', 'high'],
      });
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
          body: sseStream(earlyEvents),
        });
        return;
      }

      if (targetSessionId === sessionAId && replay === '1' && lastEventId === '4') {
        await new Promise((resolve) => setTimeout(resolve, REPLAY_DELAY_MS));
        sessionA.status = 'idle';
        sessionA.statusMessage = 'CLI idle';
        sessionA.updatedAt = iso(70);
        sessionA.messages = [
          sessionA.messages[0],
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
        ];
        await route.fulfill({
          status: 200,
          headers: {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache, no-transform',
            connection: 'keep-alive',
          },
          body: sseStream(lateEvents),
        });
        return;
      }

      if (targetSessionId === sessionBId) {
        await route.fulfill({
          status: 200,
          headers: {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache, no-transform',
            connection: 'keep-alive',
          },
          body: sseStream(idleSessionEvents),
        });
        return;
      }
    }

    if (pathname === '/api/messages/prompt' && method === 'POST') {
      await jsonResponse(route, 202, { sessionId: sessionAId, assistantMessage: '' });
      return;
    }

    await route.fulfill({
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: `Unhandled route: ${method} ${pathname}` }),
    });
  });

  try {
    await page.goto(`${BASE_URL}/?cwd=${encodeURIComponent(CWD_PATH)}&sessionId=${encodeURIComponent(sessionAId)}`, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT_MS,
    });

    await page.waitForSelector('.message-assistant-turn .tool-block', { timeout: TIMEOUT_MS });
    await page.waitForSelector('.message-assistant-turn .reasoning-timeline-block', { timeout: TIMEOUT_MS });

    const beforeSwitchText = normalizeText(await page.locator('.message-assistant-turn').textContent());
    const beforeToolCount = await page.locator('.message-assistant-turn .tool-block').count();
    const beforeReasoningCount = await page.locator('.message-assistant-turn .reasoning-timeline-block').count();

    if (beforeToolCount !== 1 || beforeReasoningCount !== 1) {
      throw new Error(JSON.stringify({ beforeToolCount, beforeReasoningCount, beforeSwitchText }, null, 2));
    }

    await page.locator(`button.session-item[title="Idle session"]`).click();
    await page.waitForFunction((selectedSessionId) => {
      const params = new URLSearchParams(window.location.search);
      return params.get('sessionId') === selectedSessionId;
    }, sessionBId, { timeout: TIMEOUT_MS });

    await page.locator(`button.session-item[title="Running session"]`).click();
    await page.waitForFunction((selectedSessionId) => {
      const params = new URLSearchParams(window.location.search);
      return params.get('sessionId') === selectedSessionId;
    }, sessionAId, { timeout: TIMEOUT_MS });

    await page.waitForTimeout(Math.max(100, REPLAY_DELAY_MS / 2));

    const afterReturnText = normalizeText(await page.locator('.message-assistant-turn').textContent());
    const afterToolCount = await page.locator('.message-assistant-turn .tool-block').count();
    const afterReasoningCount = await page.locator('.message-assistant-turn .reasoning-timeline-block').count();
    const turnCountAfterReturn = await page.locator('.message-assistant-turn').count();

    if (afterReturnText !== beforeSwitchText) {
      throw new Error(JSON.stringify({ beforeSwitchText, afterReturnText }, null, 2));
    }
    if (afterToolCount !== 1 || afterReasoningCount !== 1 || turnCountAfterReturn !== 1) {
      throw new Error(JSON.stringify({ afterToolCount, afterReasoningCount, turnCountAfterReturn }, null, 2));
    }

    await page.waitForFunction((expected) => {
      const turn = document.querySelector('.message-assistant-turn');
      return Boolean(turn?.textContent?.includes(expected));
    }, finalAssistantText, { timeout: TIMEOUT_MS });

    const finalText = normalizeText(await page.locator('.message-assistant-turn').textContent());
    const finalToolCount = await page.locator('.message-assistant-turn .tool-block').count();
    const finalReasoningCount = await page.locator('.message-assistant-turn .reasoning-timeline-block').count();
    const finalTurnCount = await page.locator('.message-assistant-turn').count();

    if (!finalText.includes('workspace scripts') || !finalText.includes('The backend workspace handles the runner.')) {
      throw new Error(JSON.stringify({ finalText }, null, 2));
    }
    if (finalToolCount !== 1 || finalReasoningCount !== 1 || finalTurnCount !== 1) {
      throw new Error(JSON.stringify({ finalToolCount, finalReasoningCount, finalTurnCount }, null, 2));
    }

    const eventRequests = requestLog.filter((entry) => entry.pathname === '/api/events');
    const replayRequest = eventRequests.find((entry) => entry.query.sessionId === sessionAId && entry.query.replay === '1' && entry.query.lastEventId === '4');

    if (!replayRequest) {
      throw new Error(JSON.stringify({ eventRequests }, null, 2));
    }

    console.log(JSON.stringify({
      ok: true,
      sessionAId,
      sessionBId,
      beforeSwitchText,
      afterReturnText,
      finalText,
      eventRequests,
      pageErrors,
      consoleErrors,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.stack : cause);
  process.exit(1);
});
