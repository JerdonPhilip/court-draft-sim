import type { DraftPool, EraInfo, HistoricalTeam, Player, Position, SimulationResult, VSModeMatchup, PlayoffGameResult } from '../types/game';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '/api';

/** Error carrying HTTP status + server Retry-After so callers can back off. */
export class ApiError extends Error {
  status: number;
  retryAfterMs: number | null;
  constructor(message: string, status: number, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function retryAfterMs(response: Response): number | null {
  const raw = response.headers.get('Retry-After');
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(raw);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

/** Retry throttled/transient failures with backoff (honors Retry-After). */
async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  let last: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const retryable = err instanceof ApiError && (err.status === 429 || err.status >= 500);
      if (!retryable || attempt === retries) throw err;
      const backoff =
        err instanceof ApiError && err.retryAfterMs != null
          ? Math.min(15000, err.retryAfterMs)
          : Math.min(8000, 500 * 2 ** attempt);
      await new Promise((resolve) => setTimeout(resolve, backoff + Math.random() * 250));
    }
  }
  throw last;
}

/** Flatten zod-style `{ fieldErrors, formErrors }` so toasts show WHY a request was rejected. */
function withValidationDetails(msg: string, details: unknown): string {
  if (!details || typeof details !== 'object') return msg;
  const parts: string[] = [];
  const d = details as { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
  for (const errs of Object.values(d.fieldErrors ?? {})) {
    for (const e of errs ?? []) if (e && !parts.includes(e)) parts.push(e);
  }
  for (const e of d.formErrors ?? []) if (e && !parts.includes(e)) parts.push(e);
  return parts.length > 0 ? `${msg} — ${parts.join('; ')}` : msg;
}

async function fetchAPI<T>(endpoint: string, options: RequestInit = {}, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: controller.signal,
      ...options,
    });

    const text = await response.text();
    let data: Record<string, unknown> = {};
    if (text) {
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new Error(`API error ${response.status}: invalid JSON response`);
      }
    } else if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    if (!response.ok) {
      const msg = typeof data.error === 'string' ? data.error : `API error: ${response.status}`;
      throw new ApiError(
        withValidationDetails(msg, (data as { details?: unknown }).details),
        response.status,
        retryAfterMs(response),
      );
    }

    return data as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  draft: {
    getPools: () => fetchAPI<{ pools: Array<{ franchise: string; decade: string; franchiseName: string; decadeLabel: string; era: string; playerCount: number }> }>('/draft/pools'),
    getFranchises: () => fetchAPI<{ franchises: HistoricalTeam[] }>('/draft/franchises'),
    getDecades: () => fetchAPI<{ decades: Array<{ id: string; label: string; era: string; range: string }> }>('/draft/decades'),
    spin: (excludeFranchise?: string, excludeDecade?: string, neededPositions?: Position[]) =>
      fetchAPI<{ pool: DraftPool }>('/draft/spin', {
        method: 'POST',
        body: JSON.stringify({ excludeFranchise, excludeDecade, neededPositions }),
      }),
    reroll: (keep: 'franchise' | 'decade', franchise: string, decade: string, neededPositions?: Position[]) =>
      fetchAPI<{ pool: DraftPool }>('/draft/reroll', {
        method: 'POST',
        body: JSON.stringify({ keep, franchise, decade, neededPositions }),
      }),
    getPool: (franchise: string, decade: string) =>
      fetchAPI<{ pool: DraftPool }>(`/draft/pool/${encodeURIComponent(franchise)}/${encodeURIComponent(decade)}`),
  },

  players: {
    getAll: (params?: { franchise?: string; decade?: string; position?: string; limit?: number; offset?: number }) => {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined) searchParams.append(key, String(value));
        });
      }
      const qs = searchParams.toString();
      return fetchAPI<{ players: Player[]; total: number; offset: number; limit: number }>(`/players${qs ? `?${qs}` : ''}`);
    },
    getByFranchiseAndDecade: (franchise: string, decade: string) =>
      fetchAPI<{ franchise: unknown; decade: unknown; players: Player[]; count: number }>(`/players/by-franchise-decade/${encodeURIComponent(franchise)}/${encodeURIComponent(decade)}`),
    getRandom: (franchise: string, decade: string, count = 5) =>
      fetchAPI<{ players: Player[] }>(`/players/random/${encodeURIComponent(franchise)}/${encodeURIComponent(decade)}?count=${count}`),
    getByDecade: (decade: string) =>
      fetchAPI<{ decade: unknown; players: Player[]; count: number }>(`/players/decade/${encodeURIComponent(decade)}`),
    getByFranchise: (franchise: string) =>
      fetchAPI<{ franchise: unknown; players: Player[]; count: number }>(`/players/franchise/${encodeURIComponent(franchise)}`),
    getById: (id: string) =>
      fetchAPI<{ player: Player }>(`/players/${encodeURIComponent(id)}`),
    search: (query: string) =>
      fetchAPI<{ players: Player[]; count: number }>(`/players/search?q=${encodeURIComponent(query)}`),
  },

  simulation: {
    runSeason: (lineup: Player[], config?: Record<string, number>, era?: string | null) =>
      fetchAPI<{ result: SimulationResult }>('/simulation/season', {
        method: 'POST',
        body: JSON.stringify({ lineup, config, ...(era ? { era } : {}) }),
      }, 30000),
    runGame: (homeTeam: Player[], awayTeam: Player[]) =>
      withRetry(() =>
        fetchAPI<{ result: PlayoffGameResult }>('/simulation/game', {
          method: 'POST',
          body: JSON.stringify({ homeTeam, awayTeam }),
        }),
      ),
    runVSMode: (userLineup: Player[], historicalTeamId: string, seriesLength: 1 | 7) =>
      fetchAPI<{ result: VSModeMatchup }>('/simulation/vs-mode', {
        method: 'POST',
        body: JSON.stringify({ userLineup, historicalTeamId, seriesLength }),
      }, 30000),
    getHistoricalTeams: () =>
      fetchAPI<{ teams: HistoricalTeam[] }>('/simulation/historical-teams'),
    getEras: () =>
      fetchAPI<{ eras: EraInfo[] }>('/simulation/eras'),
  },
};
