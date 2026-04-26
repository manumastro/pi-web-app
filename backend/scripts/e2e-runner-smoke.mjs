#!/usr/bin/env node
const baseUrl = process.env.PI_WEB_BASE_URL ?? 'http://127.0.0.1:3210';
const cwd = process.env.PI_WEB_E2E_CWD ?? process.cwd();
const prompt = process.env.PI_WEB_E2E_PROMPT ?? 'Rispondi solo PI_WEB_RUNNER_SMOKE_OK';
const expected = process.env.PI_WEB_E2E_EXPECT ?? 'PI_WEB_RUNNER_SMOKE_OK';

async function json(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : undefined;
  if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${path} -> ${response.status}: ${text}`);
  return payload;
}

async function main() {
  const health = await json('/health');
  if (!health.ok) throw new Error('health check failed');

  const modelsPayload = await json('/api/models');
  const models = modelsPayload.models ?? [];
  if (models.length === 0) throw new Error('/api/models returned no models');
  const modelKey = models[0].key;

  const sessionPayload = await json('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ cwd, model: modelKey }),
  });
  const sessionId = sessionPayload.session.id;

  const controller = new AbortController();
  const seenEvents = [];
  const sseDone = (async () => {
    const response = await fetch(`${baseUrl}/api/events?sessionId=${encodeURIComponent(sessionId)}`, { signal: controller.signal });
    if (!response.ok || !response.body) throw new Error(`SSE failed: ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const dataLine = block.split('\n').find((line) => line.startsWith('data: '));
        if (!dataLine) continue;
        const event = JSON.parse(dataLine.slice(6));
        seenEvents.push(event);
        if (event.type === 'done' || event.type === 'error') return event;
      }
    }
  })();

  await json('/api/models/session/model', {
    method: 'PUT',
    body: JSON.stringify({ sessionId, modelId: modelKey }),
  });

  await json('/api/models/session/thinking', {
    method: 'PUT',
    body: JSON.stringify({ sessionId, thinkingLevel: 'medium' }),
  });

  await json('/api/messages/prompt', {
    method: 'POST',
    body: JSON.stringify({ sessionId, cwd, model: modelKey, message: prompt, thinkingLevel: 'medium' }),
  });

  const terminalEvent = await Promise.race([
    sseDone,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timed out waiting for SSE done/error')), 120_000)),
  ]);
  controller.abort();
  if (terminalEvent.type === 'error') throw new Error(`runner emitted error: ${terminalEvent.message}`);

  const messagesPayload = await json(`/api/sessions/${encodeURIComponent(sessionId)}/messages`);
  const assistant = [...messagesPayload.messages].reverse().find((message) => message.role === 'assistant');
  if (!assistant?.content?.includes(expected)) {
    throw new Error(`assistant response did not include ${expected}: ${assistant?.content ?? '<missing>'}`);
  }

  await json('/api/messages/abort', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });

  console.log(JSON.stringify({ ok: true, baseUrl, sessionId, modelKey, events: seenEvents.map((event) => event.type) }, null, 2));
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.stack : cause);
  process.exit(1);
});
