#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'https://piwebapp.duckdns.org';
const PROMPT = process.env.PROMPT ?? 'Test screenshot continuo: rispondi con 10 righe numerate';
const OUT_DIR = process.env.OUT_DIR ?? path.resolve('screenshots/continuous');
const POLL_MS = Number(process.env.POLL_MS ?? 120);
const QUIET_MS = Number(process.env.QUIET_MS ?? 1200);
const MAX_DURATION_MS = Number(process.env.MAX_DURATION_MS ?? 30000);
const MAX_SHOTS = Number(process.env.MAX_SHOTS ?? 120);

function ts() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
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
    await page.waitForSelector('#prompt-textarea', { timeout: 60000 });

    const newSessionButton = page.getByRole('button', { name: /^New( session)?$/i }).first();
    const topNewButton = page.getByRole('button', { name: /^\+\s*New$/i }).first();
    if (await topNewButton.isVisible().catch(() => false)) {
      await topNewButton.click();
    } else if (await newSessionButton.isVisible().catch(() => false)) {
      await newSessionButton.click();
    }

    await page.waitForTimeout(500);
    await page.waitForSelector('#prompt-textarea:not([disabled])', { timeout: 60000 });
    await page.evaluate(() => {
      (window).__piMutationLog = [];
      const target = document.body;
      const observer = new MutationObserver(() => {
        (window).__piMutationLog.push(Date.now());
      });
      observer.observe(target, { subtree: true, childList: true, characterData: true, attributes: true });
      (window).__piMutationObserver = observer;
    });

    await page.fill('#prompt-textarea', PROMPT);
    await page.keyboard.press('Enter');

    let seenMutations = 0;
    let shots = 0;
    let lastMutationAt = Date.now();
    const startedAt = Date.now();

    while (Date.now() - startedAt < MAX_DURATION_MS && shots < MAX_SHOTS) {
      const snapshot = await page.evaluate(() => {
        const textarea = document.querySelector('#prompt-textarea');
        const statusNode = Array.from(document.querySelectorAll('*')).find((el) =>
          (el.textContent || '').includes('CLI ') && (el.textContent || '').includes('ctx window')
        );
        return {
          mutationCount: Array.isArray((window).__piMutationLog) ? (window).__piMutationLog.length : 0,
          promptDisabled: textarea instanceof HTMLTextAreaElement ? textarea.disabled : null,
          statusText: statusNode?.textContent?.trim() ?? null,
          bodyTextTail: (document.body?.innerText ?? '').slice(-500),
        };
      });

      if (snapshot.mutationCount > seenMutations) {
        const changes = snapshot.mutationCount - seenMutations;
        for (let j = 0; j < changes && shots < MAX_SHOTS; j += 1) {
          const shotPath = path.join(runDir, `${String(shots + 1).padStart(4, '0')}-${Date.now()}.png`);
          await page.screenshot({ path: shotPath, fullPage: true });
          timeline.push({ t: Date.now(), file: path.basename(shotPath), ...snapshot, mutationIndex: seenMutations + j + 1 });
          shots += 1;
        }
        seenMutations = snapshot.mutationCount;
        lastMutationAt = Date.now();
      }

      const quietFor = Date.now() - lastMutationAt;
      const inputReady = snapshot.promptDisabled === false;
      if (inputReady && quietFor >= QUIET_MS) {
        break;
      }

      await page.waitForTimeout(POLL_MS);
    }

    await page.evaluate(() => {
      const observer = (window).__piMutationObserver;
      if (observer && typeof observer.disconnect === 'function') observer.disconnect();
      delete (window).__piMutationObserver;
    });

    const metaPath = path.join(runDir, 'timeline.json');
    await fs.writeFile(metaPath, JSON.stringify({
      baseUrl: BASE_URL,
      prompt: PROMPT,
      pollMs: POLL_MS,
      quietMs: QUIET_MS,
      maxDurationMs: MAX_DURATION_MS,
      maxShots: MAX_SHOTS,
      frames: timeline.length,
      timeline,
    }, null, 2));

    console.log(JSON.stringify({ ok: true, runDir, frames: timeline.length, metaPath }, null, 2));
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
