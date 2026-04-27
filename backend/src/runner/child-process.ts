import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRunnerEventLine, serializeRunnerCommand, type RunnerCommand, type RunnerEvent } from './protocol.js';

export interface RunnerProcessOptions {
  command?: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  requestTimeoutMs?: number;
}

export interface RunnerCommandResult {
  ok: boolean;
  error?: string;
  data?: unknown;
}

interface PendingRequest {
  resolve: (result: RunnerCommandResult) => void;
  reject: (cause: Error) => void;
  timer: NodeJS.Timeout;
}

export class RunnerProcessClient extends EventEmitter {
  private readonly requestTimeoutMs: number;
  private child: ChildProcessWithoutNullStreams | null = null;
  private readonly pending = new Map<string, PendingRequest>();

  constructor(private readonly options: RunnerProcessOptions = {}) {
    super();
    this.requestTimeoutMs = options.requestTimeoutMs ?? 120_000;
  }

  start(): void {
    if (this.child) return;

    const defaultSpawn = this.defaultRunnerSpawn();
    const command = this.options.command ?? defaultSpawn.command;
    const args = this.options.args ?? defaultSpawn.args;
    const child = spawn(command, args, {
      cwd: this.options.cwd ?? process.cwd(),
      env: { ...process.env, ...this.options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child = child;

    const stdout = readline.createInterface({ input: child.stdout });
    stdout.on('line', (line) => this.handleLine(line));

    child.stderr.on('data', (chunk) => {
      this.emit('stderr', String(chunk));
    });

    child.on('error', (cause) => {
      this.emit('error', cause);
    });

    let terminated = false;
    const terminate = (code: number | null, signal: NodeJS.Signals | null) => {
      if (terminated) {
        return;
      }
      terminated = true;
      this.child = null;
      const error = new Error(`Pi runner exited with code ${String(code)} signal ${String(signal)}`);
      for (const [, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(error);
      }
      this.pending.clear();
      this.emit('exit', { code, signal });
    };

    child.on('exit', terminate);
    child.on('close', terminate);
  }

  async stop(): Promise<void> {
    if (!this.child) return;
    const child = this.child;
    try {
      await this.send({ type: 'shutdown', requestId: crypto.randomUUID() });
    } catch {
      // fall through to terminate
    }
    child.kill('SIGTERM');
  }

  send(command: RunnerCommand): Promise<RunnerCommandResult> {
    this.start();
    const child = this.child;
    if (!child) {
      return Promise.reject(new Error('Pi runner is not running'));
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      return Promise.reject(new Error(`Pi runner exited with code ${String(child.exitCode)} signal ${String(child.signalCode)}`));
    }

    return new Promise<RunnerCommandResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(command.requestId);
        reject(new Error(`Pi runner command timed out: ${command.type}`));
      }, this.requestTimeoutMs);

      this.pending.set(command.requestId, { resolve, reject, timer });
      child.stdin.write(serializeRunnerCommand(command), (cause) => {
        if (cause) {
          clearTimeout(timer);
          this.pending.delete(command.requestId);
          reject(cause);
        }
      });
    });
  }

  private handleLine(line: string): void {
    if (!line.trim()) return;
    try {
      const event = parseRunnerEventLine(line);
      if (event.type === 'command_result') {
        const pending = this.pending.get(event.requestId);
        if (pending) {
          this.pending.delete(event.requestId);
          clearTimeout(pending.timer);
          pending.resolve({
            ok: event.ok,
            ...(event.error !== undefined ? { error: event.error } : {}),
            ...(event.data !== undefined ? { data: event.data } : {}),
          });
        }
      }
      this.emit('event', event);
    } catch (cause) {
      this.emit('error', cause instanceof Error ? cause : new Error(String(cause)));
    }
  }

  private defaultRunnerSpawn(): { command: string; args: string[] } {
    const dirname = path.dirname(fileURLToPath(import.meta.url));
    const compiledEntry = path.resolve(dirname, '../runner-process/main.js');
    if (fs.existsSync(compiledEntry)) {
      return { command: process.execPath, args: [compiledEntry] };
    }

    const sourceEntry = path.resolve(dirname, '../runner-process/main.ts');
    if (fs.existsSync(sourceEntry)) {
      return { command: process.execPath, args: [...process.execArgv, sourceEntry] };
    }

    return { command: process.execPath, args: [compiledEntry] };
  }
}

export function onRunnerEvent(client: RunnerProcessClient, listener: (event: RunnerEvent) => void): () => void {
  client.on('event', listener);
  return () => client.off('event', listener);
}
