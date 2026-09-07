import { HistoricalTeam, Player } from '../types/game';
import { getPlayerById } from './players';

const buildHistoricalTeam = (id: string, name: string, season: string, playerIds: string[], record: string, championships: number, description: string): HistoricalTeam => {
  const players = playerIds.map(id => getPlayerById(id)!).filter(Boolean);
  return { id, name, season, players, record, championships, description };
};

export const HISTORICAL_TEAMS: HistoricalTeam[] = [
  buildHistoricalTeam(
    'bulls-96',
    '1995-96 Chicago Bulls',
    '1995-96',
    [
      'michael-jordan-90s',
      'scottie-pippen-90s',
      'john-stockton-90s', // Using as proxy for Ron Harper
      'dennis-rodman-90s', // Need to add
      'luc-longley-90s', // Need to add
    ],
    '72-10',
    1,
    'Greatest regular season team ever. Jordan, Pippen, and Rodman formed the ultimate two-way trio.'
  ),
  buildHistoricalTeam(
    'warriors-17',
    '2016-17 Golden State Warriors',
    '2016-17',
    [
      'stephen-curry-10s',
      'klay-thompson-10s',
      'kevin-durant-10s',
      'draymond-green-10s', // Need to add
      'andrew-bogut-10s', // Need to add
    ],
    '67-15',
    1,
    'Added KD to a 73-win team. Unfair offensive firepower with historic spacing.'
  ),
  buildHistoricalTeam(
    'lakers-01',
    '2000-01 Los Angeles Lakers',
    '2000-01',
    [
      'shaquille-oneal-00s',
      'kobe-bryant-00s',
      'derek-fisher-00s', // Need to add
      'rick-fox-00s', // Need to add
      'horace-grant-00s', // Need to add
    ],
    '56-26',
    1,
    'Shaq at his most dominant. 15-1 playoff record, most dominant postseason run ever.'
  ),
  buildHistoricalTeam(
    'celtics-86',
    '1985-86 Boston Celtics',
    '1985-86',
    [
      'larry-bird-80s',
      'kevin-mchale-80s',
      'robert-parish-80s',
      'dennis-johnson-80s', // Need to add
      'danny-ainge-80s', // Need to add
    ],
    '67-15',
    1,
    'Bird\'s peak. 40-1 at home. The quintessential fundamental basketball team.'
  ),
  buildHistoricalTeam(
    'heat-13',
    '2012-13 Miami Heat',
    '2012-13',
    [
      'lebron-james-10s',
      'dwyane-wade-10s',
      'chris-bosh-10s', // Need to add
      'ray-allen-10s',
      'shane-battier-10s', // Need to add
    ],
    '66-16',
    1,
    'LeBron\'s peak. 27-game win streak. Positionless basketball before it was cool.'
  ),
  buildHistoricalTeam(
    'spurs-14',
    '2013-14 San Antonio Spurs',
    '2013-14',
    [
      'tim-duncan-00s',
      'kawhi-leonard-10s',
      'tony-parker-10s', // Need to add
      'manu-ginobili-10s', // Need to add
      'boris-diaw-10s', // Need to add
    ],
    '62-20',
    1,
    'Beautiful ball movement. The ultimate team-first basketball. Revenge tour.'
  ),
  buildHistoricalTeam(
    'lakers-87',
    '1986-87 Los Angeles Lakers',
    '1986-87',
    [
      'magic-johnson-80s',
      'kareem-abdul-jabbar-80s',
      'james-worthy-80s',
      'byron-scott-80s', // Need to add
      'ac-green-80s', // Need to add
    ],
    '65-17',
    1,
    'Showtime at its peak. Magic\'s MVP year. Fastest, most entertaining basketball ever.'
  ),
  buildHistoricalTeam(
    'celtics-08',
    '2007-08 Boston Celtics',
    '2007-08',
    [
      'paul-pierce-00s',
      'kevin-garnett-00s',
      'ray-allen-00s',
      'rajondo-rondo-00s', // Need to add
      'kendrick-perkins-00s', // Need to add
    ],
    '66-16',
    1,
    'The original Big 3. Elite defense. Ubuntu - "I am because we are."'
  ),
  buildHistoricalTeam(
    'pistons-04',
    '2003-04 Detroit Pistons',
    '2003-04',
    [
      'chauncey-billups-00s', // Need to add
      'richard-hamilton-00s', // Need to add
      'tayshaun-prince-00s', // Need to add
      'rasheed-wallace-00s', // Need to add
      'ben-wallace-00s', // Need to add
    ],
    '54-28',
    1,
    'No superstars, just five All-Stars. Defense wins championships. Beat the Lakers 4-1.'
  ),
  buildHistoricalTeam(
    'mavericks-11',
    '2010-11 Dallas Mavericks',
    '2010-11',
    [
      'dirk-nowitzki-00s',
      'jason-kidd-00s',
      'jason-terry-00s', // Need to add
      'shawn-marion-00s', // Need to add
      'tyson-chandler-10s', // Need to add
    ],
    '57-25',
    1,
    'Dirk\'s masterpiece. Beat the Big 3 Heat. The ultimate underdog story.'
  ),
];

export function getHistoricalTeamById(id: string): HistoricalTeam | undefined {
  return HISTORICAL_TEAMS.find(t => t.id === id);
}

export function getAllHistoricalTeams(): HistoricalTeam[] {
  return HISTORICAL_TEAMS;
}