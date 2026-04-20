import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listChildDirectories, resolveUnderHome } from './directories.js';

describe('directories api helpers', () => {
  it('resolves project paths under the home directory only', () => {
    const home = '/home/manu';
    expect(resolveUnderHome(home, '~')).toBe(home);
    expect(resolveUnderHome(home, '~/openchamber')).toBe(path.join(home, 'openchamber'));
    expect(() => resolveUnderHome(home, '/tmp')).toThrow('Path must be inside the home directory');
  });

  it('lists child directories and filters hidden ones', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-web-app-dir-'));
    fs.mkdirSync(path.join(tmpDir, 'visible'));
    fs.mkdirSync(path.join(tmpDir, '.hidden'));
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'nope');

    expect(listChildDirectories(tmpDir, false)).toEqual([
      { path: path.join(tmpDir, 'visible'), name: 'visible' },
    ]);

    expect(listChildDirectories(tmpDir, true)).toEqual([
      { path: path.join(tmpDir, '.hidden'), name: '.hidden' },
      { path: path.join(tmpDir, 'visible'), name: 'visible' },
    ]);
  });
});
