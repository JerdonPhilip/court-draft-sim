import type { DraftPool, EraInfo, HistoricalTeam, Player, Position, SimulationResult, VSModeMatchup, PlayoffGameResult, MinutesMap } from '../types/game';
// Lazy: the 1.3MB offline engine chunk downloads only when the API is
// unreachable (or the browser reports offline) — online play never pays it.
const loadEngine = () => import('./localEngine');
type Engine = Awaited<ReturnType<typeof loadEngine>>;
// All local engine entries are synchronous; the wrapper defers the chunk load.
function lazy<A extends unknown[], R>(pick: (m: Engine) => (...args: A) => R): (...args: A) => Promise<R> {
  return async (...args) => pick(await loadEngine())(...args);
}
const localSpin = lazy((m) => m.localSpin);
const localReroll = lazy((m) => m.localReroll);
const localGetPool = lazy((m) => m.localGetPool);
const localGetPools = lazy((m) => m.localGetPools);
const localGetFranchises = lazy((m) => m.localGetFranchises);
const localGetDecades = lazy((m) => m.localGetDecades);
const localGetHistoricalTeams = lazy((m) => m.localGetHistoricalTeams);
const localGetEras = lazy((m) => m.localGetEras);
const localRunSeason = lazy((m) => m.localRunSeason);
const localRunGame = lazy((m) => m.localRunGame);
const localRunVSMode = lazy((m) => m.localRunVSMode);

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '/api';

/** True for transport failures (offline, DNS, CORS-blocked, timeout) — safe to serve locally. */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true; // fetch() rejects with TypeError on network failure
  const msg = err instanceof Error ? err.message : String(err);
  return /failed to fetch|networkerror|load failed|timed out|network request failed/i.test(msg);
}

/** Online-first with local-engine fallback: instant local when the browser knows it's offline. */
async function onlineOrLocal<T>(fetchFn: () => Promise<T>, localFn: () => T | Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return localFn();
  }
  try {
    return await fetchFn();
  } catch (err) {
    if (isNetworkError(err)) return localFn();
    throw err;
  }
}
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
    getPools: () => onlineOrLocal(
      () => fetchAPI<{ pools: Array<{ franchise: string; decade: string; franchiseName: string; decadeLabel: string; era: string; playerCount: number }> }>('/draft/pools'),
      () => localGetPools(),
    ),
    getFranchises: () => onlineOrLocal(
      () => fetchAPI<{ franchises: HistoricalTeam[] }>('/draft/franchises'),
      () => localGetFranchises() as unknown as { franchises: HistoricalTeam[] },
    ),
    getDecades: () => onlineOrLocal(
      () => fetchAPI<{ decades: Array<{ id: string; label: string; era: string; range: string }> }>('/draft/decades'),
      () => localGetDecades() as unknown as { decades: Array<{ id: string; label: string; era: string; range: string }> },
    ),
    spin: (excludeFranchise?: string, excludeDecade?: string, neededPositions?: Position[]) =>
      onlineOrLocal(
        () => fetchAPI<{ pool: DraftPool }>('/draft/spin', {
          method: 'POST',
          body: JSON.stringify({ excludeFranchise, excludeDecade, neededPositions }),
        }),
        () => localSpin(excludeFranchise, excludeDecade, neededPositions),
      ),
    reroll: (keep: 'franchise' | 'decade', franchise: string, decade: string, neededPositions?: Position[]) =>
      onlineOrLocal(
        () => fetchAPI<{ pool: DraftPool }>('/draft/reroll', {
          method: 'POST',
          body: JSON.stringify({ keep, franchise, decade, neededPositions }),
        }),
        () => localReroll(keep, franchise, decade, neededPositions),
      ),
    getPool: (franchise: string, decade: string) =>
      onlineOrLocal(
        () => fetchAPI<{ pool: DraftPool }>(`/draft/pool/${encodeURIComponent(franchise)}/${encodeURIComponent(decade)}`),
        () => localGetPool(franchise, decade),
      ),
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
    runSeason: (lineup: Player[], config?: Record<string, number>, era?: string | null, sixthManId?: string | null, options?: { first?: string | null; second?: string | null; third?: string | null } | null, minutes?: MinutesMap | null) =>
      onlineOrLocal(
        () => fetchAPI<{ result: SimulationResult }>('/simulation/season', {
          method: 'POST',
          body: JSON.stringify({ lineup, config, ...(era ? { era } : {}), ...(sixthManId ? { sixthManId } : {}), ...(options ? { options } : {}), ...(minutes ? { minutes } : {}) }),
        }, 30000),
        () => localRunSeason(lineup, config, era, sixthManId, options, minutes),
      ),
    runGame: (homeTeam: Player[], awayTeam: Player[], seriesGameNumber?: number, homeSixthManId?: string | null, awaySixthManId?: string | null, homeOptions?: { first?: string | null; second?: string | null; third?: string | null } | null, awayOptions?: { first?: string | null; second?: string | null; third?: string | null } | null, homeMinutes?: MinutesMap | null, awayMinutes?: MinutesMap | null) =>
      onlineOrLocal(
        () => withRetry(() =>
          fetchAPI<{ result: PlayoffGameResult }>('/simulation/game', {
            method: 'POST',
            body: JSON.stringify({ homeTeam, awayTeam, ...(seriesGameNumber !== undefined ? { seriesGameNumber } : {}), ...(homeSixthManId ? { homeSixthManId } : {}), ...(awaySixthManId ? { awaySixthManId } : {}), ...(homeOptions ? { homeOptions } : {}), ...(awayOptions ? { awayOptions } : {}), ...(homeMinutes ? { homeMinutes } : {}), ...(awayMinutes ? { awayMinutes } : {}) }),
          }),
        ),
        () => localRunGame(homeTeam, awayTeam, seriesGameNumber, homeSixthManId, awaySixthManId, homeOptions, awayOptions, homeMinutes, awayMinutes),
      ),
    runVSMode: (userLineup: Player[], historicalTeamId: string, seriesLength: 1 | 7, sixthManId?: string | null, options?: { first?: string | null; second?: string | null; third?: string | null } | null, userMinutes?: MinutesMap | null) =>
      onlineOrLocal(
        () => fetchAPI<{ result: VSModeMatchup }>('/simulation/vs-mode', {
          method: 'POST',
          body: JSON.stringify({ userLineup, historicalTeamId, seriesLength, ...(sixthManId ? { sixthManId } : {}), ...(options ? { options } : {}), ...(userMinutes ? { userMinutes } : {}) }),
        }, 30000),
        () => localRunVSMode(userLineup, historicalTeamId, seriesLength, sixthManId, options, userMinutes),
      ),
    getHistoricalTeams: () =>
      onlineOrLocal(
        () => fetchAPI<{ teams: HistoricalTeam[] }>('/simulation/historical-teams'),
        () => localGetHistoricalTeams(),
      ),
    getEras: () =>
      onlineOrLocal(
        () => fetchAPI<{ eras: EraInfo[] }>('/simulation/eras'),
        () => localGetEras(),
      ),
  },
};
