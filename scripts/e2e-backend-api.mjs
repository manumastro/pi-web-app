#!/usr/bin/env node
/**
 * Backend-only E2E test — no browser, no frontend.
 * Tests the full chat lifecycle via REST API + SSE (global event stream).
 *
 * Routes used (OpenChamber SDK compatible):
 *   POST /api/session              → create session
 *   GET  /api/session/:id          → get session
 *   GET  /api/session/:id/message  → get messages
 *   GET  /api/models               → list models
 *   POST /api/session/:id/prompt_async → send prompt
 *   GET  /api/global/event         → SSE stream (receives all session events)
 *
 * Usage:
 *   node scripts/e2e-backend-api.mjs
 *
 * Env vars:
 *   BASE_URL     — backend base URL (default http://localhost:3211)
 *   MODEL_KEY    — model to use (default opencode-go/deepseek-v4-pro)
 *   PROMPT       — prompt to send
 *   THINKING     — thinking level (minimal|low|medium|high|xhigh, default minimal)
 *   TIMEOUT_MS   — timeout in ms (default 180_000)
 */

import process from 'node:process';
import http from 'node:http';

// ── Config ──────────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3211';
const MODEL_KEY = process.env.MODEL_KEY ?? 'opencode-go/deepseek-v4-pro';
const PROMPT = process.env.PROMPT ?? 'Rispondi esattamente con: BACKEND_E2E_OK';
const THINKING_LEVEL = process.env.THINKING ?? 'minimal';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 180_000);

// ── Helpers ─────────────────────────────────────────────────
async function api(method, pathname, body) {
  const url = new URL(pathname, BASE_URL);
  const options = { method, headers: { 'Content-Type': 'application/json', Accept: 'application/json' } };
  if (body !== undefined) options.body = JSON.stringify(body);
  const res = await fetch(url.toString(), options);
  const text = await res.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = text; }
  if (!res.ok) throw new Error(`${method} ${pathname} -> ${res.status} ${typeof payload === 'string' ? payload.slice(0, 200) : JSON.stringify(payload)}`);
  return payload;
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

// ── SSE Client (global event stream) ────────────────────────
function connectGlobalSSE() {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/global/event', BASE_URL);
    const req = http.get(url.toString(), {
      headers: { Accept: 'text/event-stream' },
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`SSE connect failed: ${res.statusCode}`));
        return;
      }
      const events = [];
      const listeners = [];
      let buffer = '';

      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              events.push(event);
              for (const fn of listeners) {
                try { fn(event); } catch { /* ignore */ }
              }
            } catch { /* ignore malformed */ }
          }
        }
      });

      res.on('error', reject);
      resolve({
        close: () => { req.destroy(); },
        events,
        onEvent: (fn) => listeners.push(fn),
      });
    });
    req.on('error', reject);
  });
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  console.log('=== Backend API E2E Test ===');
  console.log(`Base URL : ${BASE_URL}`);
  console.log(`Model    : ${MODEL_KEY}`);
  console.log(`Prompt   : ${PROMPT}`);
  console.log(`Thinking : ${THINKING_LEVEL}`);
  console.log(`Timeout  : ${TIMEOUT_MS}ms`);
  console.log('');

  const assertions = [];
  let sessionId = '';

  // 1. Health check
  console.log('[1] Health check...');
  const health = await api('GET', '/health');
  console.log(`    ✓ ok=${health.ok}, clients=${health.clients}`);

  // 2. System info
  console.log('[2] System info...');
  const info = await api('GET', '/api/system/info');
  console.log(`    ✓ piVersion: ${info.piVersion}`);

  // 3. Config
  console.log('[3] Config...');
  const config = await api('GET', '/api/config');
  console.log(`    ✓ homeDir: ${config.homeDir}`);

  // 4. List models
  console.log('[4] List models...');
  const modelsPayload = await api('GET', '/api/models');
  const models = modelsPayload.models || modelsPayload || [];
  const modelCount = Array.isArray(models) ? models.length : 0;
  console.log(`    ✓ ${modelCount} models available`);
  assertions.push({ name: 'models available', pass: modelCount > 0, detail: `${modelCount}` });

  // 5. Create session
  console.log('[5] Create session...');
  const create = await api('POST', '/api/session', { directory: process.cwd(), title: '' });
  sessionId = create.id;
  if (!sessionId) throw new Error('No session ID returned');
  console.log(`    ✓ sessionId: ${sessionId}`);

  // 6. Connect SSE BEFORE prompt
  console.log('[6] Connect SSE...');
  const sse = await connectGlobalSSE();
  console.log('    ✓ SSE connected');

  // Wait for server.connected
  await sleep(500);

  // 7. Send prompt
  console.log('[7] Send prompt...');
  const promptBody = {
    parts: [{ type: 'text', text: PROMPT }],
    messageID: `e2e-msg-${Date.now()}`,
    thinkingLevel: THINKING_LEVEL,
  };
  if (MODEL_KEY.includes('/')) {
    const [provider, ...rest] = MODEL_KEY.split('/');
    promptBody.model = { providerID: provider, modelID: rest.join('/') };
  }

  const promptRes = await api('POST', `/api/session/${encodeURIComponent(sessionId)}/prompt_async`, promptBody);
  console.log(`    ✓ prompt dispatched: ${JSON.stringify(promptRes).slice(0, 80)}`);

  // 8. Wait for completion via SSE + polling
  console.log('[8] Wait for assistant response...');
  const deadline = Date.now() + TIMEOUT_MS;
  let assistantContent = '';
  let sessionDone = false;

  while (Date.now() < deadline && !sessionDone) {
    // Check session messages
    try {
      const msgsPayload = await api('GET', `/api/session/${encodeURIComponent(sessionId)}/message`);
      const messages = Array.isArray(msgsPayload) ? msgsPayload : (msgsPayload.messages || []);
      // Each message has { info: { role, ... }, parts: [...] }
      const assistantMsgs = messages.filter((m) => m.info?.role === 'assistant');
      if (assistantMsgs.length > 0) {
        assistantContent = assistantMsgs
          .flatMap((m) => (m.parts || []).filter((p) => p.type === 'text').map((p) => p.text || ''))
          .join('\n');
      }
      // Also check session status
      const session = await api('GET', `/api/session/${encodeURIComponent(sessionId)}`);
      const statusMsg = session.statusMessage || '';
      if (assistantContent && (statusMsg === 'Context usage updated' || statusMsg === 'Done')) {
        sessionDone = true;
      }
    } catch (e) {
      // retry
    }
    await sleep(500);
  }

  console.log(`    session messages: ${assistantContent.length > 0 ? 'present' : 'MISSING'} (${assistantContent.length} chars)`);

  // 9. Verify persisted messages via the /message endpoint
  console.log('[9] Verify persisted messages...');
  const msgsPayload = await api('GET', `/api/session/${encodeURIComponent(sessionId)}/message`);
  const messages = Array.isArray(msgsPayload) ? msgsPayload : (msgsPayload.messages || []);
  const userMsgs = messages.filter((m) => m.info?.role === 'user');
  const assistantMsgs = messages.filter((m) => m.info?.role === 'assistant');
  const allContent = messages
    .flatMap((m) => (m.parts || []).filter((p) => p.type === 'text').map((p) => p.text || ''))
    .join('\n');

  console.log(`    messages: ${messages.length} total, ${userMsgs.length} user, ${assistantMsgs.length} assistant`);

  assertions.push({ name: 'user message present', pass: userMsgs.length > 0, detail: `${userMsgs.length}` });
  assertions.push({ name: 'assistant message present', pass: assistantMsgs.length > 0, detail: `${assistantMsgs.length}` });
  assertions.push({ name: 'assistant has content', pass: assistantContent.length > 0, detail: `${assistantContent.length} chars` });
  assertions.push({ name: 'prompt echoed in messages', pass: allContent.includes(PROMPT), detail: allContent.includes(PROMPT) ? 'found' : 'NOT FOUND' });
  assertions.push({ name: 'session completed response', pass: assistantContent.length > 0, detail: 'ok' });

  // 10. SSE events analysis
  console.log('[10] Analyze SSE events...');
  // Filter events for our session — sessionID can be in several places
  const sessionEvents = sse.events.filter((e) => {
    const props = e?.properties || {};
    // Direct sessionID
    if (props.sessionID === sessionId) return true;
    // Inside info object (message.updated, session.updated)
    if (props.info?.sessionID === sessionId) return true;
    // Inside part object (message.part.updated)
    if (props.part?.sessionID === sessionId) return true;
    // Legacy
    if (e?.sessionId === sessionId) return true;
    return false;
  });

  const eventTypes = [...new Set(sse.events.map((e) => e.type))];
  const sessionEventTypes = [...new Set(sessionEvents.map((e) => e.type))];

  const textDeltas = sessionEvents.filter((e) => e.type === 'message.part.delta' && e.properties?.partID?.endsWith('-text'));
  const thinkingDeltas = sessionEvents.filter((e) => e.type === 'message.part.delta' && e.properties?.partID?.endsWith('-reasoning'));
  const statusEvents = sessionEvents.filter((e) => e.type === 'session.status' || e.type === 'session.idle');
  const messageCreated = sessionEvents.filter((e) => e.type === 'message.created');

  console.log(`    total SSE events: ${sse.events.length}`);
  console.log(`    session events: ${sessionEvents.length}`);
  console.log(`    event types: ${eventTypes.join(', ')}`);
  console.log(`    session event types: ${sessionEventTypes.join(', ')}`);
  console.log(`    text deltas: ${textDeltas.length}`);
  console.log(`    thinking deltas: ${thinkingDeltas.length}`);
  console.log(`    status events: ${statusEvents.length}`);

  assertions.push({ name: 'SSE events received', pass: sse.events.length > 0, detail: `${sse.events.length}` });
  const allDeltas = sessionEvents.filter((e) => e.type === 'message.part.delta');
  const partUpdatedEvents = sessionEvents.filter((e) => e.type === 'message.part.updated');
  assertions.push({
    name: 'SSE content events received',
    pass: allDeltas.length > 0 || partUpdatedEvents.length > 0,
    detail: `${allDeltas.length} deltas + ${partUpdatedEvents.length} part-updates (text:${textDeltas.length} reasoning:${thinkingDeltas.length})`,
  });
  assertions.push({ name: 'SSE status transitions', pass: statusEvents.length > 0, detail: `${statusEvents.length}` });

  // 11. Multi-turn chat
  console.log('[11] Multi-turn chat (2nd prompt)...');
  const prompt2 = 'Rispondi esattamente con: BACKEND_E2E_TURN2_OK';
  await api('POST', `/api/session/${encodeURIComponent(sessionId)}/prompt_async`, {
    parts: [{ type: 'text', text: prompt2 }],
    messageID: `e2e-msg2-${Date.now()}`,
    thinkingLevel: THINKING_LEVEL,
  });

  const deadline2 = Date.now() + TIMEOUT_MS;
  let turn2Done = false;
  let turn2Content = '';
  while (Date.now() < deadline2 && !turn2Done) {
    try {
      const mp = await api('GET', `/api/session/${encodeURIComponent(sessionId)}/message`);
      const msgs = Array.isArray(mp) ? mp : (mp.messages || []);
      turn2Content = msgs
        .flatMap((m) => (m.parts || []).filter((p) => p.type === 'text').map((p) => p.text || ''))
        .join('\n');
      const s = await api('GET', `/api/session/${encodeURIComponent(sessionId)}`);
      const statusMsg = s.statusMessage || '';
      const isIdle = !statusMsg || statusMsg === 'Context usage updated' || statusMsg === 'Done';
      const hasBothPrompts = turn2Content.includes(PROMPT) && turn2Content.includes(prompt2);
      if (hasBothPrompts && isIdle) {
        // Give extra time for message persistence to complete
        await sleep(2000);
        turn2Done = true;
      }
    } catch { /* retry */ }
    await sleep(500);
  }

  const mp2 = await api('GET', `/api/session/${encodeURIComponent(sessionId)}/message`);
  const messagesTurn2 = Array.isArray(mp2) ? mp2 : (mp2.messages || []);
  const contentTurn2 = messagesTurn2
    .flatMap((m) => (m.parts || []).filter((p) => p.type === 'text').map((p) => p.text || ''))
    .join('\n');

  assertions.push({ name: 'turn 2: prompt echoed', pass: contentTurn2.includes(prompt2), detail: contentTurn2.includes(prompt2) ? 'found' : 'NOT FOUND' });
  assertions.push({ name: 'turn 2: both prompts in history', pass: contentTurn2.includes(PROMPT) && contentTurn2.includes(prompt2), detail: `t1:${contentTurn2.includes(PROMPT)} t2:${contentTurn2.includes(prompt2)}` });

  const userCount2 = messagesTurn2.filter((m) => m.info?.role === 'user').length;
  const asstCount2 = messagesTurn2.filter((m) => m.info?.role === 'assistant').length;
  // Give a small extra wait for final message to persist
  await sleep(1000);
  const mpFinal = await api('GET', `/api/session/${encodeURIComponent(sessionId)}/message`);
  const msgsFinal = Array.isArray(mpFinal) ? mpFinal : (mpFinal.messages || []);
  const userCountF = msgsFinal.filter((m) => m.info?.role === 'user').length;
  const asstCountF = msgsFinal.filter((m) => m.info?.role === 'assistant').length;
  assertions.push({ name: 'message counts after 2 turns', pass: userCountF >= 2 && asstCountF >= 2, detail: `${userCountF}u/${asstCountF}a` });

  // 12. Session listing
  console.log('[12] Session listing...');
  const sessionsList = await api('GET', '/api/session');
  const found = (Array.isArray(sessionsList) ? sessionsList : []).some((s) => s.id === sessionId);
  assertions.push({ name: 'session in listing', pass: found, detail: found ? 'found' : 'NOT FOUND' });

  // 13. Session title auto-rename
  console.log('[13] Session title...');
  const finalSessionCheck = await api('GET', `/api/session/${encodeURIComponent(sessionId)}`);
  const title = finalSessionCheck.title || '';
  const hasAutoTitle = title && title !== 'Session' && title !== 'New session';
  assertions.push({ name: 'session has auto-renamed title', pass: hasAutoTitle, detail: title || '(empty)' });
  console.log(`    title: "${title}"`);

  // 14. Messages endpoint (redundant check, already verified above)
  console.log('[14] Messages endpoint...');
  assertions.push({ name: 'messages data retrieved', pass: messages.length > 0, detail: `${messages.length}` });

  // 15. Session status endpoint
  console.log('[15] Session status endpoint...');
  const statusPayload = await api('GET', '/api/session/status');
  const sessionStatus = statusPayload[sessionId];
  assertions.push({ name: 'status endpoint includes session', pass: !!sessionStatus, detail: sessionStatus ? sessionStatus.type : 'MISSING' });

  // ── Summary ──────────────────────────────────────────────
  console.log('');
  console.log('=== Results ===');
  const passed = assertions.filter((a) => a.pass).length;
  const failed = assertions.filter((a) => !a.pass).length;
  for (const a of assertions) {
    const icon = a.pass ? '✓' : '✗';
    console.log(`  ${icon} ${a.name}: ${a.detail}`);
  }
  console.log('');
  console.log(`${passed}/${assertions.length} passed, ${failed} failed`);

  // Cleanup
  sse.close();

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
