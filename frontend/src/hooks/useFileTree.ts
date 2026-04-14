import { useState, useCallback } from 'react';

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: number;
}

export interface FileTreeData {
  path: string;
  entries: FileEntry[];
}

export function useFileTree(initialPath?: string) {
  const [currentPath, setCurrentPath] = useState(initialPath || '/home/manu');
  const [data, setData] = useState<FileTreeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = useCallback(async (dirPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(dirPath)}`);
      if (!res.ok) throw new Error('Failed to load directory');
      const result = await res.json();
      setData(result);
      setCurrentPath(dirPath);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const goUp = useCallback(() => {
    const parts = currentPath.split('/').filter(Boolean);
    if (parts.length <= 1) {
      // Already at root, go to home
      loadDirectory('/home/manu');
    } else {
      parts.pop();
      loadDirectory('/' + parts.join('/'));
    }
  }, [currentPath, loadDirectory]);

  const navigateTo = useCallback((entry: FileEntry) => {
    if (entry.isDirectory) {
      loadDirectory(entry.path);
    }
  }, [loadDirectory]);

  return {
    currentPath,
    data,
    loading,
    error,
    loadDirectory,
    goUp,
    navigateTo,
  };
}