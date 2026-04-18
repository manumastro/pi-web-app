import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('apiRequest', () => {
  it('returns undefined for 204 no-content responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 }))); 

    await expect(apiRequest('/api/sessions/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});
