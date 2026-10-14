import { CONFIG } from '../config';

/** Error with a player-friendly message (from the server when it sent one). */
export class ServerError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** JSON call to the community server. */
export async function serverApi<T>(path: string, opts: { method?: string; body?: unknown; token?: string; timeoutMs?: number } = {}): Promise<T> {
  if (!CONFIG.server.url) throw new ServerError(0, 'no_server', 'This feature isn’t available yet.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12_000);
  let res: Response;
  try {
    res = await fetch(CONFIG.server.url + path, {
      method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
      headers: { ...(opts.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: ctrl.signal,
    });
  } catch {
    throw new ServerError(0, 'offline', 'Can’t reach the game server. Check your internet connection.');
  } finally {
    clearTimeout(timer);
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ServerError(res.status, String(json.error ?? 'error'), String(json.message ?? 'Something went wrong. Please try again.'));
  return json as T;
}

/** ws(s):// URL for a server path. */
export function serverSocketUrl(path: string): string {
  return CONFIG.server.url.replace(/^http/, 'ws') + path;
}
