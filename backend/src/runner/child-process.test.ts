import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunnerProcessClient } from './child-process.js';

async function writeRunner(source: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-runner-test-'));
  const file = path.join(dir, 'runner.mjs');
  await fs.writeFile(file, source);
  return file;
}

describe('RunnerProcessClient', () => {
  const clients: RunnerProcessClient[] = [];

  afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(clients.map((client) => client.stop().catch(() => undefined)));
    clients.length = 0;
  });

  function clientFor(script: string, requestTimeoutMs = 500): RunnerProcessClient {
    const client = new RunnerProcessClient({ command: process.execPath, args: [script], requestTimeoutMs });
    clients.push(client);
    return client;
  }

  it('correlates command_result events by requestId and emits runner events', async () => {
    const script = await writeRunner(`
      import readline from 'node:readline';
      const rl = readline.createInterface({ input: process.stdin });
      console.log(JSON.stringify({ type: 'ready', runnerId: 'fake', pid: process.pid, version: 'test' }));
      rl.on('line', line => {
        const command = JSON.parse(line);
        console.log(JSON.stringify({ type: 'command_result', requestId: command.requestId, ok: true, data: { echoed: command.type } }));
      });
    `);
    const client = clientFor(script);
    const events: string[] = [];
    client.on('event', (event) => events.push(event.type));

    const result = await client.send({ type: 'get_capabilities', requestId: 'req-1' });

    expect(result).toEqual({ ok: true, data: { echoed: 'get_capabilities' } });
    expect(events).toContain('command_result');
  });

  it('emits errors for invalid JSONL events', async () => {
    const script = await writeRunner(`
      console.log('not-json');
      setTimeout(() => {}, 5000);
    `);
    const client = clientFor(script);
    const error = await new Promise<Error>((resolve) => {
      client.once('error', (cause) => resolve(cause as Error));
      client.start();
    });

    expect(error.message).toBeTruthy();
  });

  it('rejects pending requests when the child exits', async () => {
    const script = await writeRunner(`
      import readline from 'node:readline';
      const rl = readline.createInterface({ input: process.stdin });
      rl.on('line', () => process.exit(7));
    `);
    const client = clientFor(script);

    await expect(client.send({ type: 'get_capabilities', requestId: 'req-exit' })).rejects.toThrow(/exited/);
  });

  it('times out unanswered requests', async () => {
    const script = await writeRunner(`
      import readline from 'node:readline';
      readline.createInterface({ input: process.stdin });
      setTimeout(() => {}, 5000);
    `);
    const client = clientFor(script, 25);

    await expect(client.send({ type: 'get_capabilities', requestId: 'req-timeout' })).rejects.toThrow(/timed out/);
  });

  it('forwards stderr output', async () => {
    const script = await writeRunner(`
      console.error('runner stderr smoke');
      setTimeout(() => {}, 5000);
    `);
    const client = clientFor(script);
    const stderr = await new Promise<string>((resolve) => {
      client.once('stderr', (chunk) => resolve(String(chunk)));
      client.start();
    });

    expect(stderr).toContain('runner stderr smoke');
  });
});
