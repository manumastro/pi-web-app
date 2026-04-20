export function createProjectIdFromPath(path: string): string {
  return `project-${path.replace(/[^a-zA-Z0-9]+/g, '-')}`;
}

export function normalizeProjectPath(input: string, homeDirectory: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const home = homeDirectory.trim();
  if (!home) {
    return null;
  }

  if (trimmed === '~') {
    return home;
  }

  if (trimmed.startsWith('~/')) {
    return `${home}/${trimmed.slice(2).replace(/^\/+/, '')}`.replace(/\/+/g, '/').replace(/\/+$/, '');
  }

  const normalized = trimmed.replace(/\\/g, '/').replace(/\/+/g, '/');
  if (normalized === home) {
    return home;
  }

  if (normalized.startsWith(`${home}/`)) {
    return normalized.replace(/\/+/g, '/').replace(/\/+$/, '');
  }

  return null;
}

export function formatProjectPath(path: string, homeDirectory: string): string {
  const normalizedHome = homeDirectory.replace(/\/+$/, '');
  const normalizedPath = path.replace(/\/+$/, '');

  if (normalizedPath === normalizedHome) {
    return '~';
  }

  if (normalizedPath.startsWith(`${normalizedHome}/`)) {
    return `~${normalizedPath.slice(normalizedHome.length)}`;
  }

  return normalizedPath;
}

export function getProjectLabel(path: string, homeDirectory: string): string {
  const displayPath = formatProjectPath(path, homeDirectory);
  if (displayPath === '~') {
    return '~';
  }

  const parts = displayPath.split('/').filter(Boolean);
  return parts.at(-1) ?? displayPath;
}
