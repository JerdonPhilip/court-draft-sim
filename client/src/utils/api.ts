import type { DraftPool, HistoricalTeam, Player, Position, SimulationResult, VSModeMatchup } from '../types/game';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '/api';

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
      throw new Error(msg);
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
    runSeason: (lineup: Player[], config?: Record<string, number>) =>
      fetchAPI<{ result: SimulationResult }>('/simulation/season', {
        method: 'POST',
        body: JSON.stringify({ lineup, config }),
      }, 30000),
    runGame: (homeTeam: Player[], awayTeam: Player[]) =>
      fetchAPI<{ result: unknown }>('/simulation/game', {
        method: 'POST',
        body: JSON.stringify({ homeTeam, awayTeam }),
      }),
    runVSMode: (userLineup: Player[], historicalTeamId: string, seriesLength: 1 | 7) =>
      fetchAPI<{ result: VSModeMatchup }>('/simulation/vs-mode', {
        method: 'POST',
        body: JSON.stringify({ userLineup, historicalTeamId, seriesLength }),
      }, 30000),
    getHistoricalTeams: () =>
      fetchAPI<{ teams: HistoricalTeam[] }>('/simulation/historical-teams'),
  },
};
