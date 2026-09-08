import { Position } from '../types/game';

export const FRANCHISES = [
  { id: 'lakers', name: 'Los Angeles Lakers', abbreviation: 'LAL', color: '#552583', secondary: '#FDB927' },
  { id: 'celtics', name: 'Boston Celtics', abbreviation: 'BOS', color: '#007A33', secondary: '#BA9653' },
  { id: 'bulls', name: 'Chicago Bulls', abbreviation: 'CHI', color: '#CE1141', secondary: '#000000' },
  { id: 'warriors', name: 'Golden State Warriors', abbreviation: 'GSW', color: '#1D428A', secondary: '#FFC72C' },
  { id: 'heat', name: 'Miami Heat', abbreviation: 'MIA', color: '#98002E', secondary: '#F9A01B' },
  { id: 'spurs', name: 'San Antonio Spurs', abbreviation: 'SAS', color: '#C4CED4', secondary: '#000000' },
  { id: 'nets', name: 'Brooklyn Nets', abbreviation: 'BKN', color: '#000000', secondary: '#FFFFFF' },
  { id: 'knicks', name: 'New York Knicks', abbreviation: 'NYK', color: '#006BB6', secondary: '#F58426' },
  { id: 'mavericks', name: 'Dallas Mavericks', abbreviation: 'DAL', color: '#00538C', secondary: '#002B5E' },
  { id: 'suns', name: 'Phoenix Suns', abbreviation: 'PHX', color: '#1D1160', secondary: '#E56020' },
  { id: 'bucks', name: 'Milwaukee Bucks', abbreviation: 'MIL', color: '#00471B', secondary: '#EEE1C6' },
  { id: 'nuggets', name: 'Denver Nuggets', abbreviation: 'DEN', color: '#0E2240', secondary: '#FEC524' },
  { id: 'clippers', name: 'LA Clippers', abbreviation: 'LAC', color: '#C8102E', secondary: '#1D428A' },
  { id: 'sixers', name: 'Philadelphia 76ers', abbreviation: 'PHI', color: '#006BB6', secondary: '#ED174C' },
  { id: 'raptors', name: 'Toronto Raptors', abbreviation: 'TOR', color: '#CE1141', secondary: '#000000' },
  { id: 'pistons', name: 'Detroit Pistons', abbreviation: 'DET', color: '#C8102E', secondary: '#1D428A' },
  { id: 'cavaliers', name: 'Cleveland Cavaliers', abbreviation: 'CLE', color: '#6F263D', secondary: '#FFB81C' },
  { id: 'rockets', name: 'Houston Rockets', abbreviation: 'HOU', color: '#CE1141', secondary: '#000000' },
  { id: 'thunder', name: 'Oklahoma City Thunder', abbreviation: 'OKC', color: '#007AC1', secondary: '#EF3B24' },
  { id: 'jazz', name: 'Utah Jazz', abbreviation: 'UTA', color: '#002B5C', secondary: '#00471B' },
  { id: 'kings', name: 'Sacramento Kings', abbreviation: 'SAC', color: '#5A2D81', secondary: '#63727A' },
  { id: 'hawks', name: 'Atlanta Hawks', abbreviation: 'ATL', color: '#E03A3E', secondary: '#26282A' },
  { id: 'wizards', name: 'Washington Wizards', abbreviation: 'WAS', color: '#002B5C', secondary: '#E31837' },
  { id: 'pacers', name: 'Indiana Pacers', abbreviation: 'IND', color: '#002D62', secondary: '#FDBB30' },
  { id: 'magic', name: 'Orlando Magic', abbreviation: 'ORL', color: '#0077C0', secondary: '#C4CED4' },
  { id: 'hornets', name: 'Charlotte Hornets', abbreviation: 'CHA', color: '#1D1160', secondary: '#00788C' },
  { id: 'grizzlies', name: 'Memphis Grizzlies', abbreviation: 'MEM', color: '#5D76A9', secondary: '#12173F' },
  { id: 'pelicans', name: 'New Orleans Pelicans', abbreviation: 'NOP', color: '#0C2340', secondary: '#85714D' },
  { id: 'trailblazers', name: 'Portland Trail Blazers', abbreviation: 'POR', color: '#E03A3E', secondary: '#000000' },
  { id: 'timberwolves', name: 'Minnesota Timberwolves', abbreviation: 'MIN', color: '#0C2340', secondary: '#236192' },
  { id: 'supersonics', name: 'Seattle SuperSonics', abbreviation: 'SEA', color: '#00653A', secondary: '#FFC72C' },
] as const;

export const DECADES = [
  { id: '1960s', label: '1960s', era: 'Foundation Era', range: '1960-1969' },
  { id: '1970s', label: '1970s', era: 'ABA Merger Era', range: '1970-1979' },
  { id: '1980s', label: '1980s', era: 'Showtime Era', range: '1980-1989' },
  { id: '1990s', label: '1990s', era: 'Jordan Era', range: '1990-1999' },
  { id: '2000s', label: '2000s', era: 'Dynasty Era', range: '2000-2009' },
  { id: '2010s', label: '2010s', era: 'Modern Era', range: '2010-2019' },
  { id: '2020s', label: '2020s', era: 'Positionless Era', range: '2020-Present' },
] as const;

export const POSITIONS: Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

/** 10-man roster: 5 starters + 5 backups (PG-C each). First 5 = starters. */
export const ROSTER_SLOTS: Array<{ position: Position; role: 'starter' | 'bench'; label: string }> = [
  ...POSITIONS.map(pos => ({ position: pos, role: 'starter' as const, label: `Starter ${pos}` })),
  ...POSITIONS.map(pos => ({ position: pos, role: 'bench' as const, label: `Backup ${pos}` })),
];

export const MAX_ROSTER_SIZE = 10;

// Rerolls granted per axis (franchise / decade) at the start of each draft.
export const MAX_REROLLS_PER_AXIS = 3;

// Manual SPIN presses granted per draft. Automatic spins (first pool of the
// draft and the pool dealt after each pick) are always free.
export const MAX_MANUAL_SPINS = 4;

export const ARCHETYPES: Record<Position, string[]> = {
  PG: ['Floor General', 'Scoring PG', 'Playmaker', 'Defensive PG', 'Two-Way PG'],
  SG: ['Sharpshooter', 'Slashing SG', '3-and-D', 'Score-First SG', 'Playmaking SG'],
  SF: ['Wing Scorer', '3-and-D Wing', 'Playmaking Wing', 'Defensive Stopper', 'Two-Way Wing'],
  PF: ['Stretch Four', 'Post Scorer', 'Defensive Anchor', 'Playmaking PF', 'Two-Way PF'],
  C: ['Rim Protector', 'Post Dominator', 'Stretch Five', 'Playmaking Big', 'Two-Way Center'],
};

export function getArchetypesForPosition(position: Position): string[] {
  return ARCHETYPES[position];
}