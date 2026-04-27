import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { promisify } from 'node:util';
import type { Router, Request, Response } from 'express';
import express from 'express';
import { resolveUnderHome } from './directories.js';

const execFileAsync = promisify(execFile);
const MAX_READ_BYTES = 256 * 1024;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'coverage', '.cache']);
const terminalProcesses = new Map<string, ChildProcessWithoutNullStreams>();

interface FileEntry {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modifiedAt?: string;
}

function resolveWorkspacePath(homeDir: string, cwdInput: unknown, relInput: unknown): string {
  const cwd = resolveUnderHome(homeDir, typeof cwdInput === 'string' ? cwdInput : undefined);
  const rel = typeof relInput === 'string' ? relInput : '';
  const resolved = path.resolve(cwd, rel);
  if (resolved === cwd || resolved.startsWith(`${cwd}${path.sep}`)) return resolved;
  throw new Error('Path must stay inside the selected project');
}

function relativeTo(cwd: string, absolutePath: string): string {
  const rel = path.relative(cwd, absolutePath);
  return rel.length > 0 ? rel : '.';
}

async function listDirectory(cwd: string, dirPath: string): Promise<FileEntry[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const visible = entries.filter((entry) => !entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name));
  const mapped = await Promise.all(visible.map(async (entry): Promise<FileEntry> => {
    const absolutePath = path.join(dirPath, entry.name);
    const stat = await fs.stat(absolutePath).catch(() => null);
    return {
      path: relativeTo(cwd, absolutePath),
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      ...(entry.isFile() && stat ? { size: stat.size } : {}),
      ...(stat ? { modifiedAt: stat.mtime.toISOString() } : {}),
    };
  }));

  return mapped.sort((left, right) => {
    if (left.type !== right.type) return left.type === 'directory' ? -1 : 1;
    return left.name.localeCompare(right.name, 'en', { sensitivity: 'base' });
  });
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, timeout: 10_000, maxBuffer: 1024 * 1024 });
  return stdout;
}

function parseGitStatus(raw: string): Array<{ path: string; index: string; workingTree: string }> {
  return raw.split('\n').filter(Boolean).map((line) => ({
    index: line.slice(0, 1),
    workingTree: line.slice(1, 2),
    path: line.slice(3),
  }));
}

function writeTerminalEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function createWorkspaceRouter(homeDir: string): Router {
  const router = express.Router();

  router.get('/files', async (req: Request, res: Response) => {
    try {
      const cwd = resolveUnderHome(homeDir, typeof req.query.cwd === 'string' ? req.query.cwd : undefined);
      const target = resolveWorkspacePath(homeDir, cwd, req.query.path);
      const entries = await listDirectory(cwd, target);
      res.json({ cwd, path: relativeTo(cwd, target), entries });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to list files' });
    }
  });

  router.get('/file', async (req: Request, res: Response) => {
    try {
      const cwd = resolveUnderHome(homeDir, typeof req.query.cwd === 'string' ? req.query.cwd : undefined);
      const target = resolveWorkspacePath(homeDir, cwd, req.query.path);
      const stat = await fs.stat(target);
      if (!stat.isFile()) throw new Error('Selected path is not a file');
      if (stat.size > MAX_READ_BYTES) throw new Error('File is too large for preview');
      const content = await fs.readFile(target, 'utf8');
      res.json({ cwd, path: relativeTo(cwd, target), content, size: stat.size, modifiedAt: stat.mtime.toISOString() });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to read file' });
    }
  });

  router.get('/git/status', async (req: Request, res: Response) => {
    try {
      const cwd = resolveUnderHome(homeDir, typeof req.query.cwd === 'string' ? req.query.cwd : undefined);
      const [branchRaw, statusRaw] = await Promise.all([
        git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => ''),
        git(cwd, ['status', '--porcelain=v1']).catch(() => ''),
      ]);
      res.json({ cwd, branch: branchRaw.trim() || 'not a git repo', files: parseGitStatus(statusRaw) });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to read git status' });
    }
  });

  router.get('/git/diff', async (req: Request, res: Response) => {
    try {
      const cwd = resolveUnderHome(homeDir, typeof req.query.cwd === 'string' ? req.query.cwd : undefined);
      const file = typeof req.query.path === 'string' && req.query.path.length > 0 ? req.query.path : undefined;
      if (file) resolveWorkspacePath(homeDir, cwd, file);
      const diff = await git(cwd, ['diff', '--', ...(file ? [file] : [])]).catch(() => '');
      res.json({ cwd, path: file ?? '', diff });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to read git diff' });
    }
  });

  router.get('/terminal/stream', (req: Request, res: Response) => {
    const command = typeof req.query.command === 'string' ? req.query.command.trim() : '';
    const terminalId = typeof req.query.terminalId === 'string' && req.query.terminalId.length > 0 ? req.query.terminalId : crypto.randomUUID();
    if (!command) {
      res.status(400).json({ error: 'command is required' });
      return;
    }

    try {
      const cwd = resolveUnderHome(homeDir, typeof req.query.cwd === 'string' ? req.query.cwd : undefined);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });
      const child = spawn('/bin/bash', ['-lc', command], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
      terminalProcesses.set(terminalId, child);
      writeTerminalEvent(res, 'start', { terminalId, cwd, command });
      child.stdout.on('data', (chunk: Buffer) => writeTerminalEvent(res, 'output', { stream: 'stdout', chunk: chunk.toString('utf8') }));
      child.stderr.on('data', (chunk: Buffer) => writeTerminalEvent(res, 'output', { stream: 'stderr', chunk: chunk.toString('utf8') }));
      child.on('exit', (code, signal) => {
        terminalProcesses.delete(terminalId);
        writeTerminalEvent(res, 'exit', { code, signal });
        res.end();
      });
      req.on('close', () => {
        if (!child.killed) child.kill('SIGTERM');
        terminalProcesses.delete(terminalId);
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to start terminal' });
    }
  });

  router.delete('/terminal/:terminalId', (req: Request, res: Response) => {
    const terminalId = typeof req.params.terminalId === 'string' ? req.params.terminalId : '';
    const child = terminalProcesses.get(terminalId);
    if (child) {
      child.kill('SIGTERM');
      terminalProcesses.delete(terminalId);
    }
    res.json({ ok: true });
  });

  router.post('/terminal/run', async (req: Request, res: Response) => {
    const command = typeof req.body?.command === 'string' ? req.body.command.trim() : '';
    if (!command) {
      res.status(400).json({ error: 'command is required' });
      return;
    }

    try {
      const cwd = resolveUnderHome(homeDir, typeof req.body?.cwd === 'string' ? req.body.cwd : undefined);
      const { stdout, stderr } = await execFileAsync('/bin/bash', ['-lc', command], { cwd, timeout: 30_000, maxBuffer: 1024 * 1024 });
      res.json({ cwd, command, output: `${stdout}${stderr}`, exitCode: 0 });
    } catch (error: unknown) {
      const commandError = error as { stdout?: string; stderr?: string; code?: number; message?: string };
      res.json({ command, output: `${commandError.stdout ?? ''}${commandError.stderr ?? commandError.message ?? ''}`, exitCode: commandError.code ?? 1 });
    }
  });

  return router;
}
