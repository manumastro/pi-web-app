function parseHiddenModelKeys(raw: string | undefined): Set<string> {
  if (!raw) {
    return new Set();
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return new Set();
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter((entry) => entry.length > 0));
    }
  } catch {
    // fall back to CSV parsing below
  }

  return new Set(
    trimmed
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
}

export function getHiddenModelKeysFromEnv(): Set<string> {
  return parseHiddenModelKeys(process.env.PIZZAPI_HIDDEN_MODELS ?? process.env.PI_WEB_HIDDEN_MODELS);
}

export function isHiddenModelKey(key: string, hiddenKeys = getHiddenModelKeysFromEnv()): boolean {
  return hiddenKeys.has(key);
}
