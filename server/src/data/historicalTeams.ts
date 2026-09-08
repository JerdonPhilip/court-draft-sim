import { HistoricalTeam } from '../types/game.js';
import { getPlayerById } from './players.js';

const buildHistoricalTeam = (id: string, name: string, season: string, playerIds: string[], record: string, championships: number, description: string): HistoricalTeam => {
  const players = playerIds
    .map(pid => getPlayerById(pid))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);
  if (players.length !== 10) {
    console.warn(`Historical team ${id} resolved to ${players.length}/10 players: ${playerIds.join(', ')}`);
  }
  return { id, name, season, players, record, championships, description };
};

export const HISTORICAL_TEAMS: HistoricalTeam[] = [
  buildHistoricalTeam(
    'bulls-96',
    '1995-96 Chicago Bulls',
    '1995-96',
    [
      'ron-harper-90s',
      'michael-jordan-90s',
      'scottie-pippen-90s',
      'dennis-rodman-90s',
      'luc-longley-90s',
      'toni-kukoc-90s',
      'steve-kerr-90s',
      'bill-wennington-90s',
      'john-paxson-90s',
      'bj-armstrong-90s',
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
      'draymond-green-10s',
      'zaza-pachulia-10s',
      'andre-iguodala-10s',
      'david-lee-10s',
      'festus-ezeli-10s',
      'carl-landry-10s',
      'kent-bazemore-10s',
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
      'derek-fisher-00s',
      'kobe-bryant-00s',
      'rick-fox-00s',
      'horace-grant-00s',
      'shaquille-oneal-00s',
      'robert-horry-00s',
      'brian-shaw-00s',
      'devean-george-00s',
      'slava-medvedenko-00s',
      'mark-madsen-00s',
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
      'dennis-johnson-80s',
      'danny-ainge-80s',
      'larry-bird-80s',
      'kevin-mchale-80s',
      'robert-parish-80s',
      'cedric-maxwell-80s',
      'gerald-henderson-80s',
      'rick-robey-80s',
      'ml-carr-80s',
      'greg-kite-80s',
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
      'dwyane-wade-10s',
      'ray-allen-10s',
      'lebron-james-10s',
      'chris-bosh-10s',
      'shane-battier-10s',
      'mario-chalmers-10s',
      'udonis-haslem-10s',
      'norris-cole-10s',
      'joel-anthony-10s',
      'james-jones-10s',
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
      'tony-parker-10s',
      'manu-ginobili-10s',
      'kawhi-leonard-10s',
      'boris-diaw-10s',
      'tim-duncan-00s',
      'danny-green-10s',
      'tiago-splitter-10s',
      'gary-neal-10s',
      'matt-bonner-10s',
      'patty-mills-10s',
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
      'byron-scott-80s',
      'james-worthy-80s',
      'ac-green-80s',
      'kareem-abdul-jabbar-80s',
      'bob-mcadoo-80s',
      'michael-cooper-80s',
      'kurt-rambis-80s',
      'jamal-wilkes-80s',
      'mitch-kupchak-80s',
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
      'rajon-rondo-00s',
      'ray-allen-00s',
      'paul-pierce-00s',
      'kevin-garnett-00s',
      'kendrick-perkins-00s',
      'tony-allen-00s',
      'delonte-west-00s',
      'ryan-gomes-00s',
      'gerald-green-00s',
      'sebastian-telfair-00s',
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
      'chauncey-billups-00s',
      'richard-hamilton-00s',
      'tayshaun-prince-00s',
      'rasheed-wallace-00s',
      'ben-wallace-00s',
      'lindsey-hunter-00s',
      'antonio-mcdyess-00s',
      'dale-davis-00s',
      'carlos-arroyo-00s',
      'darvin-ham-00s',
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
      'jason-kidd-00s',
      'jason-terry-10s',
      'shawn-marion-10s',
      'dirk-nowitzki-10s',
      'tyson-chandler-10s',
      'jason-kidd-10s',
      'brendan-haywood-10s',
      'peja-stojakovic-10s',
      'ian-mahinmi-10s',
      'dominique-jones-10s',
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
