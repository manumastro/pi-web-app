#!/usr/bin/env node
import process from 'node:process';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3211';
const MODEL_KEY = process.env.MODEL_KEY ?? 'opencode-go/deepseek-v4-flash';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 180_000);
const PROMPT_TOKEN = process.env.PROMPT_TOKEN ?? 'MODEL_THINKING_FLOW_OK';

const PREFERRED_THINKING = 'medium';
const FALLBACK_THINKING = ['minimal', 'low', 'medium', 'high', 'xhigh'];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(method, pathname, body) {
  const url = new URL(pathname, BASE_URL);
  const res = await fetch(url.toString(), {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = text;
  }

  if (!res.ok) {
    throw new Error(`${method} ${pathname} -> ${res.status} ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`);
  }
  return payload;
}

function parseModelKey(key) {
  const [providerID, ...rest] = key.split('/');
  return { providerID, modelID: rest.join('/') };
}

function pickThinkingLevel(variants) {
  if (variants.includes(PREFERRED_THINKING)) return PREFERRED_THINKING;
  if (variants.length > 0) return variants[Math.floor(Math.random() * variants.length)];
  return FALLBACK_THINKING[Math.floor(Math.random() * FALLBACK_THINKING.length)];
}

async function main() {
  console.log('=== Model + Thinking E2E Flow ===');
  console.log('Base URL:', BASE_URL);
  console.log('Model   :', MODEL_KEY);

  const health = await api('GET', '/health');
  console.log('Health  :', health.ok === true ? 'ok' : 'fail');

  const { providerID, modelID } = parseModelKey(MODEL_KEY);

  const providersResp = await api('GET', '/api/config/providers');
  const providers = Array.isArray(providersResp.providers) ? providersResp.providers : [];
  const provider = providers.find((p) => p?.id === providerID);
  const model = (provider?.models || []).find((m) => m?.id === modelID);

  if (!provider || !model) {
    throw new Error(`Model not found in /api/config/providers: ${MODEL_KEY}`);
  }

  const variantKeys = Object.keys(model.variants || {});
  const selectedThinking = pickThinkingLevel(variantKeys);
  console.log('Thinking:', selectedThinking, `(available variants: ${variantKeys.join(', ') || 'none'})`);

  const session = await api('POST', '/api/session', { directory: process.cwd(), title: '' });
  const sessionId = session.id;
  if (!sessionId) throw new Error('No sessionId returned by POST /api/session');
  console.log('Session :', sessionId);

  const prompt = `Rispondi esattamente con: ${PROMPT_TOKEN}`;
  await api('POST', `/api/session/${encodeURIComponent(sessionId)}/prompt_async`, {
    messageID: `thinking-e2e-${Date.now()}`,
    parts: [{ type: 'text', text: prompt }],
    model: { providerID, modelID, variant: selectedThinking },
    variant: selectedThinking,
  });
  console.log('Prompt  : dispatched');

  const deadline = Date.now() + TIMEOUT_MS;
  let assistantText = '';

  while (Date.now() < deadline) {
    const messages = await api('GET', `/api/session/${encodeURIComponent(sessionId)}/message`);
    const arr = Array.isArray(messages) ? messages : [];
    const assistantMessages = arr.filter((m) => m?.info?.role === 'assistant');
    assistantText = assistantMessages
      .flatMap((m) => (m.parts || []).filter((p) => p?.type === 'text').map((p) => p?.text || ''))
      .join('\n')
      .trim();

    if (assistantText.length > 0) break;
    await sleep(1200);
  }

  const sessionAfter = await api('GET', `/api/session/${encodeURIComponent(sessionId)}`);
  const levelsAfter = await api('GET', `/api/session/${encodeURIComponent(sessionId)}/thinking-levels`);

  const okText = assistantText.includes(PROMPT_TOKEN);
  const okThinking = sessionAfter.thinkingLevel === selectedThinking;

  console.log('Session thinkingLevel :', sessionAfter.thinkingLevel ?? null);
  console.log('Thinking levels route :', Array.isArray(levelsAfter.levels) ? levelsAfter.levels.join(', ') : 'n/a');
  console.log('Assistant response    :', assistantText.slice(0, 160));

  if (!okText) throw new Error('Assistant response does not include expected token');
  if (!okThinking) throw new Error(`Session thinkingLevel mismatch. expected=${selectedThinking} actual=${sessionAfter.thinkingLevel}`);

  console.log('✅ Flow OK: model selection + thinking selection + prompt + response');
}

main().catch((error) => {
  console.error('❌ E2E flow failed:', error.message || error);
  process.exit(1);
});
