export function queryStr(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0) return String(value[0]);
  return '';
}

export function paramStr(value: unknown): string {
  return queryStr(value);
}
