#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const BASE_URL = process.env.BASE_URL ?? 'https://piwebapp.duckdns.org';
const CWD_PATH = process.env.CWD_PATH ?? '/home/manu/pi-web-app';
const MODEL_KEY = process.env.MODEL_KEY ?? 'openai-codex/gpt-5.3-codex';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 45000);
const PROMPT_COUNT = Number(process.env.PROMPT_COUNT ?? 3);

function findAgentBrowserChrome() {
  const root = path.join(process.env.HOME ?? '', '.agent-browser', 'browsers');
  if (!fs.existsSync(root)) return undefined;
  const dirs = fs.readdirSync(root).filter((name) => name.startsWith('chrome-')).sort().reverse();
  for (const dir of dirs) {
    const candidate = path.join(root, dir, 'chrome');
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

async function api(pathname, init) {
  const res = await fetch(`${BASE_URL}${pathname}`, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  const text = await res.text();
  const payload = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${pathname} -> ${res.status} ${JSON.stringify(payload)}`);
  return payload;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const { chromium } = await import('playwright');

const create = await api('/api/sessions', {
  method: 'POST',
  body: JSON.stringify({ cwd: CWD_PATH, title: 'e2e-fullstack-stream' }),
});
const sessionId = create.session.id;
const forensicStartAt = new Date().toISOString();

await api('/api/models/session/model', {
  method: 'PUT',
  body: JSON.stringify({ sessionId, modelId: MODEL_KEY }),
});

const executablePath = process.env.CHROME_PATH ?? findAgentBrowserChrome();
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const page = await browser.newPage();

const runtimeErrors = [];
const consoleErrors = [];
const gapSignals = [];

page.on('pageerror', (err) => runtimeErrors.push(String(err?.message ?? err)));
page.on('console', (msg) => {
  const text = msg.text();
  if (msg.type() === 'error') consoleErrors.push(text);
  if (/Recovery stream gap/i.test(text)) gapSignals.push(`console:${text}`);
});

try {
  const url = `${BASE_URL}/?cwd=${encodeURIComponent(CWD_PATH)}&sessionId=${encodeURIComponent(sessionId)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
  await page.waitForLoadState('load', { timeout: TIMEOUT_MS }).catch(() => undefined);

  const attachGapObserver = async () => {
    await page.evaluate(() => {
      window.__E2E = { gapSeen: false, gapTexts: [] };
      const check = () => {
        const txt = document.body?.innerText ?? '';
        if (/Recovery stream gap/i.test(txt)) {
          window.__E2E.gapSeen = true;
          window.__E2E.gapTexts.push(txt.slice(Math.max(0, txt.indexOf('Recovery stream gap') - 60), txt.indexOf('Recovery stream gap') + 120));
        }
      };
      check();
      const obs = new MutationObserver(check);
      obs.observe(document.body, { subtree: true, childList: true, characterData: true });
      window.__E2EObserver = obs;
    });
  };

  try {
    await attachGapObserver();
  } catch {
    await page.waitForLoadState('domcontentloaded', { timeout: TIMEOUT_MS });
    await attachGapObserver();
  }

  const promptBox = page.getByRole('textbox', { name: 'Prompt' });
  await promptBox.waitFor({ timeout: TIMEOUT_MS });

  const tokens = [];

  for (let i = 0; i < PROMPT_COUNT; i += 1) {
    const token = `STREAM_RENDER_OK_${Date.now()}_${i}`;
    tokens.push(token);
    const prompt = `Rispondi esattamente con: ${token}`;

    await page.waitForFunction(() => {
      const el = document.querySelector('#prompt-textarea');
      return !!el && !el.hasAttribute('disabled');
    }, undefined, { timeout: TIMEOUT_MS });

    await promptBox.fill(prompt);
    await page.getByRole('button', { name: 'Send' }).click();

    // Ensure streaming state appears.
    await page.waitForFunction(() => {
      const txt = document.body.innerText;
      return txt.includes('Working') || txt.includes('Writing') || txt.includes('Connecting');
    }, undefined, { timeout: 10_000 });

    // Ensure assistant rendered in UI without reload (token appears twice: user + assistant).
    try {
      await page.waitForFunction((tkn) => {
        const txt = document.body.innerText;
        return txt.split(tkn).length - 1 >= 2;
      }, token, { timeout: TIMEOUT_MS });
    } catch (error) {
      const screenshotPath = path.resolve(process.cwd(), 'screenshots', `e2e-fullstack-timeout-${Date.now()}.png`);
      await fs.promises.mkdir(path.dirname(screenshotPath), { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: true });
      const bodyText = await page.evaluate(() => document.body.innerText.slice(-4000));
      throw new Error(JSON.stringify({
        sessionId,
        phase: 'assistant-render-without-reload',
        token,
        error: String(error),
        screenshotPath,
        bodyTail: bodyText,
      }, null, 2));
    }

    await sleep(500);
  }

  // Verify persisted session contains assistant echoes for all tokens.
  const deadline = Date.now() + TIMEOUT_MS;
  let messages = [];
  while (Date.now() < deadline) {
    const session = await api(`/api/sessions/${encodeURIComponent(sessionId)}`);
    messages = session.session?.messages ?? [];
    const content = messages.map((m) => String(m.content ?? '')).join('\n');
    const allPresent = tokens.every((t) => content.includes(t));
    if (allPresent) break;
    await sleep(800);
  }

  const content = messages.map((m) => String(m.content ?? '')).join('\n');
  const missing = tokens.filter((t) => !content.includes(t));

  const domGap = await page.evaluate(() => window.__E2E ?? { gapSeen: false, gapTexts: [] });
  if (domGap.gapSeen) {
    gapSignals.push(...(domGap.gapTexts ?? []).map((t) => `dom:${t}`));
  }

  const forensicTail = await api('/api/forensics/tail');
  const forensicEvents = (forensicTail.events ?? []).filter((event) =>
    event
    && event.sessionId === sessionId
    && (!event.timestamp || String(event.timestamp) >= forensicStartAt)
  );

  const forensicGaps = forensicEvents.filter((event) => event.type === 'sse_gap_detected');
  const forensicTextChunks = forensicEvents.filter((event) => event.type === 'sse_text_chunk');
  const chunkEventIds = forensicTextChunks
    .map((event) => Number.parseInt(String(event.eventId ?? ''), 10))
    .filter((value) => Number.isFinite(value));
  const hasOutOfOrderChunkIds = chunkEventIds.some((id, index) => index > 0 && id < chunkEventIds[index - 1]);

  if (runtimeErrors.length || consoleErrors.length || gapSignals.length || missing.length || forensicGaps.length || hasOutOfOrderChunkIds) {
    const screenshotPath = path.resolve(process.cwd(), 'screenshots', `e2e-fullstack-fail-${Date.now()}.png`);
    await fs.promises.mkdir(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    throw new Error(JSON.stringify({
      sessionId,
      runtimeErrors,
      consoleErrors,
      gapSignals,
      missingTokensInPersistedSession: missing,
      forensic: {
        eventsCount: forensicEvents.length,
        gapEvents: forensicGaps,
        chunkEventIds,
        hasOutOfOrderChunkIds,
      },
      screenshotPath,
    }, null, 2));
  }

  console.log(JSON.stringify({
    ok: true,
    sessionId,
    promptsTested: PROMPT_COUNT,
    tokens,
    forensic: {
      eventsCount: forensicEvents.length,
      chunkEventIds,
      gapEvents: 0,
    },
  }, null, 2));
} finally {
  await browser.close();
}
