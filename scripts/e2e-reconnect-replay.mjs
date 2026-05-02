#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3210';
const CWD_PATH = process.env.CWD_PATH ?? '/home/manu/pi-web-app';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 45000);
const REPLAY_DELAY_MS = Number(process.env.REPLAY_DELAY_MS ?? 300);

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

async function jsonResponse(route, status, payload, headers = {}) {
  await route.fulfill({
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}

const { chromium } = await import('playwright');

const sessionId = `session-reconnect-${Date.now()}`;
const turnId = `turn-${Date.now()}`;
const toolCallId = `tool-read-${Date.now()}`;
const baseAssistantText = 'The root package.json uses npm workspaces.';
const finalAssistantText = `${baseAssistantText} The backend workspace handles the runner.`;

const sessionState = {
  id: sessionId,
  cwd: CWD_PATH,
  title: 'Reconnect replay live-turn',
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

const requestLog = [];
const pageErrors = [];
const consoleErrors = [];

const earlyEvents = [
  {
    id: 1,
    event: 'thinking',
    payload: {
      type: 'thinking',
      sessionId,
      messageId: turnId,
      content: '**Investigating live reload**\nChecking the workspace scripts.',
      done: false,
      timestamp: iso(10),
    },
  },
  {
    id: 2,
    event: 'tool_call',
    payload: {
      type: 'tool_call',
      sessionId,
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
      sessionId,
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
      sessionId,
      messageId: turnId,
      content: baseAssistantText,
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
      sessionId,
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
      sessionId,
      messageId: turnId,
      aborted: false,
      timestamp: iso(60),
    },
  },
];

async function main() {
  const executablePath = process.env.CHROME_PATH ?? await findAgentBrowserChrome();
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const page = await browser.newPage();

  page.on('pageerror', (err) => pageErrors.push(String(err?.message ?? err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
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
      await jsonResponse(route, 200, { sessions: [sessionState] });
      return;
    }

    if (pathname === `/api/sessions/${sessionId}` && method === 'GET') {
      await jsonResponse(route, 200, { session: sessionState });
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
        await jsonResponse(route, 200, {
          preferences: { favorites: [], recents: [], collapsedProviders: [] },
        });
        return;
      }
      if (method === 'PUT') {
        await jsonResponse(route, 200, {
          preferences: JSON.parse(await request.postData() || '{}'),
        });
        return;
      }
    }

    if (pathname === '/api/relay/status' && method === 'GET') {
      await jsonResponse(route, 200, { viewers: 0 });
      return;
    }

    if (pathname === '/api/directories' && method === 'GET') {
      const requestedPath = url.searchParams.get('path') ?? CWD_PATH;
      await jsonResponse(route, 200, {
        path: requestedPath,
        directories: [],
      });
      return;
    }

    if (pathname === '/api/messages/prompt' && method === 'POST') {
      await jsonResponse(route, 202, {
        sessionId,
        assistantMessage: '',
      });
      return;
    }

    if (pathname === '/api/events' && method === 'GET') {
      const lastEventId = url.searchParams.get('lastEventId') ?? '';
      const replay = url.searchParams.get('replay') ?? '0';
      const isReplay = replay === '1' || lastEventId.length > 0;

      if (!isReplay) {
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

      if (lastEventId !== '4') {
        consoleErrors.push(`unexpected lastEventId=${lastEventId}`);
      }

      sessionState.status = 'idle';
      sessionState.statusMessage = 'CLI idle';
      sessionState.updatedAt = iso(70);
      sessionState.messages = [
        sessionState.messages[0],
        {
          id: `tool-${toolCallId}`,
          role: 'tool_call',
          content: '{"path":"package.json"}',
          timestamp: iso(20),
          messageId: turnId,
          toolName: 'read',
          toolCallId,
        },
        {
          id: `result-${toolCallId}`,
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

      await new Promise((resolve) => setTimeout(resolve, REPLAY_DELAY_MS));
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

    await route.fulfill({
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: `Unhandled route: ${method} ${pathname}` }),
    });
  });

  try {
    const url = `${BASE_URL}/?cwd=${encodeURIComponent(CWD_PATH)}&sessionId=${encodeURIComponent(sessionId)}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });

    await page.waitForSelector('.message-assistant-turn .tool-block', { timeout: TIMEOUT_MS });
    await page.waitForSelector('.message-assistant-turn .reasoning-timeline-block', { timeout: TIMEOUT_MS });
    await page.waitForSelector('.message-assistant-turn', { timeout: TIMEOUT_MS });

    const beforeReload = normalizeText(await page.locator('.message-assistant-turn').textContent());
    const toolBlocksBefore = await page.locator('.message-assistant-turn .tool-block').count();
    const reasoningBlocksBefore = await page.locator('.message-assistant-turn .reasoning-timeline-block').count();

    if (toolBlocksBefore !== 1 || reasoningBlocksBefore !== 1) {
      throw new Error(JSON.stringify({ toolBlocksBefore, reasoningBlocksBefore, beforeReload }, null, 2));
    }

    await page.reload({ waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });

    await page.waitForSelector('.message-assistant-turn .tool-block', { timeout: TIMEOUT_MS });
    await page.waitForSelector('.message-assistant-turn .reasoning-timeline-block', { timeout: TIMEOUT_MS });

    const afterReload = normalizeText(await page.locator('.message-assistant-turn').textContent());
    const toolBlocksAfter = await page.locator('.message-assistant-turn .tool-block').count();
    const reasoningBlocksAfter = await page.locator('.message-assistant-turn .reasoning-timeline-block').count();
    const turnCountAfter = await page.locator('.message-assistant-turn').count();

    if (beforeReload !== afterReload) {
      throw new Error(JSON.stringify({ beforeReload, afterReload }, null, 2));
    }
    if (toolBlocksAfter !== 1 || reasoningBlocksAfter !== 1 || turnCountAfter !== 1) {
      throw new Error(JSON.stringify({ toolBlocksAfter, reasoningBlocksAfter, turnCountAfter }, null, 2));
    }

    await page.waitForFunction((expected) => {
      const turn = document.querySelector('.message-assistant-turn');
      return Boolean(turn?.textContent?.includes(expected));
    }, finalAssistantText, { timeout: TIMEOUT_MS });

    await page.waitForFunction((expected) => {
      const turn = document.querySelector('.message-assistant-turn');
      return Boolean(turn?.textContent?.includes(expected));
    }, 'workspace scripts', { timeout: TIMEOUT_MS });

    const finalText = normalizeText(await page.locator('.message-assistant-turn').textContent());
    const finalToolBlocks = await page.locator('.message-assistant-turn .tool-block').count();
    const finalReasoningBlocks = await page.locator('.message-assistant-turn .reasoning-timeline-block').count();
    const finalTurnCount = await page.locator('.message-assistant-turn').count();

    if (!finalText.includes('workspace scripts') || !finalText.includes('The backend workspace handles the runner.')) {
      throw new Error(JSON.stringify({ finalText }, null, 2));
    }
    if (finalToolBlocks !== 1 || finalReasoningBlocks !== 1 || finalTurnCount !== 1) {
      throw new Error(JSON.stringify({ finalToolBlocks, finalReasoningBlocks, finalTurnCount }, null, 2));
    }

    const eventRequests = requestLog.filter((entry) => entry.pathname === '/api/events');
    const replayRequest = eventRequests.find((entry) => entry.query.lastEventId === '4');
    if (!replayRequest) {
      throw new Error(JSON.stringify({ eventRequests }, null, 2));
    }

    const result = {
      ok: true,
      sessionId,
      turnId,
      beforeReload,
      afterReload,
      finalText,
      eventRequests,
      pageErrors,
      consoleErrors,
    };

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.stack : cause);
  process.exit(1);
});
