#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:3210';
const OUT_DIR = process.env.OUT_DIR ?? path.resolve('screenshots/continuous-3prompts');
const POLL_MS = Number(process.env.POLL_MS ?? 120);
const QUIET_MS = Number(process.env.QUIET_MS ?? 1500);
const MAX_DURATION_MS = Number(process.env.MAX_DURATION_MS ?? 40000);
const MAX_SHOTS_PER_PROMPT = Number(process.env.MAX_SHOTS_PER_PROMPT ?? 140);
const PROMPTS = [
  'E2E seq p1: rispondi solo "ok p1"',
  'E2E seq p2: rispondi solo "ok p2"',
  'E2E seq p3: rispondi solo "ok p3"',
];

const ts = () => new Date().toISOString().replace(/[:.]/g, '-');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function waitInputReady(page, timeout = 60000) {
  await page.waitForSelector('#prompt-textarea', { timeout });
  await page.waitForFunction(() => {
    const ta = document.querySelector('#prompt-textarea');
    return ta instanceof HTMLTextAreaElement && !ta.disabled;
  }, { timeout });
}

async function main() {
  await ensureDir(OUT_DIR);
  const runDir = path.join(OUT_DIR, `run-${ts()}`);
  await ensureDir(runDir);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const timeline = [];

  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitInputReady(page);

    await page.evaluate(() => {
      window.__piMutationLog = [];
      const observer = new MutationObserver(() => {
        window.__piMutationLog.push(Date.now());
      });
      observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
      window.__piMutationObserver = observer;
    });

    let seenMutations = 0;
    let globalShot = 0;

    for (let pi = 0; pi < PROMPTS.length; pi += 1) {
      const prompt = PROMPTS[pi];
      const phase = `p${pi + 1}`;

      await waitInputReady(page);
      await page.fill('#prompt-textarea', prompt);
      await page.keyboard.press('Enter');

      let phaseShots = 0;
      let lastMutationAt = Date.now();
      const startedAt = Date.now();

      while (Date.now() - startedAt < MAX_DURATION_MS && phaseShots < MAX_SHOTS_PER_PROMPT) {
        const snap = await page.evaluate(() => {
          const ta = document.querySelector('#prompt-textarea');
          return {
            mutationCount: Array.isArray(window.__piMutationLog) ? window.__piMutationLog.length : 0,
            promptDisabled: ta instanceof HTMLTextAreaElement ? ta.disabled : null,
            bodyTextTail: (document.body?.innerText ?? '').slice(-1200),
          };
        });

        if (snap.mutationCount > seenMutations) {
          const changes = snap.mutationCount - seenMutations;
          for (let j = 0; j < changes && phaseShots < MAX_SHOTS_PER_PROMPT; j += 1) {
            globalShot += 1;
            phaseShots += 1;
            const file = `${String(globalShot).padStart(4, '0')}-${phase}-${Date.now()}.png`;
            const shotPath = path.join(runDir, file);
            await page.screenshot({ path: shotPath, fullPage: true });
            timeline.push({
              t: Date.now(),
              file,
              phase,
              prompt,
              mutationIndex: seenMutations + j + 1,
              promptDisabled: snap.promptDisabled,
            });
          }
          seenMutations = snap.mutationCount;
          lastMutationAt = Date.now();
        }

        const quietFor = Date.now() - lastMutationAt;
        const ready = snap.promptDisabled === false;
        if (ready && quietFor >= QUIET_MS) {
          break;
        }

        await page.waitForTimeout(POLL_MS);
      }
    }

    await page.evaluate(() => {
      const observer = window.__piMutationObserver;
      if (observer && typeof observer.disconnect === 'function') observer.disconnect();
      delete window.__piMutationObserver;
    });

    const metaPath = path.join(runDir, 'timeline.json');
    await fs.writeFile(metaPath, JSON.stringify({ baseUrl: BASE_URL, prompts: PROMPTS, frames: timeline.length, timeline }, null, 2));

    console.log(JSON.stringify({ ok: true, runDir, frames: timeline.length, metaPath }, null, 2));
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
