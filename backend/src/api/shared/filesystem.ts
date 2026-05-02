import fs from 'node:fs';
import path from 'node:path';

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymbolicLink: boolean;
}

export function listDirectoryEntries(targetPath: string): FileEntry[] {
  const names = fs.readdirSync(targetPath);
  return names.map((name) => {
    const fullPath = path.join(targetPath, name);
    try {
      const stat = fs.statSync(fullPath);
      return {
        name,
        path: fullPath,
        isDirectory: stat.isDirectory(),
        isFile: stat.isFile(),
        isSymbolicLink: stat.isSymbolicLink(),
      };
    } catch {
      return { name, path: fullPath, isDirectory: false, isFile: false, isSymbolicLink: false };
    }
  });
}

export function readTextFileOrEmpty(targetPath: string): string {
  try {
    return fs.readFileSync(targetPath, 'utf8');
  } catch {
    return '';
  }
}
