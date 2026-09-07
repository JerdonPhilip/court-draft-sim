const API_BASE = '/api';

async function fetchAPI<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `API error: ${response.status}`);
  }

  return data;
}

export const api = {
  draft: {
    getPools: () => fetchAPI<{ pools: Array<{ franchise: string; decade: string; franchiseName: string; decadeLabel: string; era: string }> }>('/draft/pools'),
    getFranchises: () => fetchAPI<{ franchises: Array<{ id: string; name: string; abbreviation: string; color: string; secondary: string }> }>('/draft/franchises'),
    getDecades: () => fetchAPI<{ decades: Array<{ id: string; label: string; era: string; range: string }> }>('/draft/decades'),
    spin: (excludeFranchise?: string, excludeDecade?: string) =>
      fetchAPI<{ pool: any }>('/draft/spin', {
        method: 'POST',
        body: JSON.stringify({ excludeFranchise, excludeDecade }),
      }),
    getPool: (franchise: string, decade: string) =>
      fetchAPI<{ pool: any }>(`/draft/pool/${franchise}/${decade}`),
  },

  players: {
    getAll: (params?: { franchise?: string; decade?: string; position?: string; limit?: number; offset?: number }) => {
      const searchParams = new URLSearchParams();
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined) searchParams.append(key, String(value));
        });
      }
      return fetchAPI<{ players: any[]; total: number; offset: number; limit: number }>(`/players?${searchParams}`);
    },
    getByFranchiseAndDecade: (franchise: string, decade: string) =>
      fetchAPI<{ franchise: any; decade: any; players: any[]; count: number }>(`/players/by-franchise-decade/${franchise}/${decade}`),
    getRandom: (franchise: string, decade: string, count: number = 5) =>
      fetchAPI<{ players: any[] }>(`/players/random/${franchise}/${decade}?count=${count}`),
    getByDecade: (decade: string) =>
      fetchAPI<{ decade: any; players: any[]; count: number }>(`/players/decade/${decade}`),
    getByFranchise: (franchise: string) =>
      fetchAPI<{ franchise: any; players: any[]; count: number }>(`/players/franchise/${franchise}`),
    getById: (id: string) =>
      fetchAPI<{ player: any }>(`/players/${id}`),
    search: (query: string) =>
      fetchAPI<{ players: any[]; count: number }>(`/players/search/${encodeURIComponent(query)}`),
  },

  simulation: {
    runSeason: (lineup: any[], config?: any) =>
      fetchAPI<{ result: any }>('/simulation/season', {
        method: 'POST',
        body: JSON.stringify({ lineup, config }),
      }),
    runGame: (homeTeam: any[], awayTeam: any[]) =>
      fetchAPI<{ result: any }>('/simulation/game', {
        method: 'POST',
        body: JSON.stringify({ homeTeam, awayTeam }),
      }),
    runVSMode: (userLineup: any[], historicalTeamId: string, seriesLength: 1 | 7) =>
      fetchAPI<{ result: any }>('/simulation/vs-mode', {
        method: 'POST',
        body: JSON.stringify({ userLineup, historicalTeamId, seriesLength }),
      }),
    getHistoricalTeams: () =>
      fetchAPI<{ teams: any[] }>('/simulation/historical-teams'),
  },
};