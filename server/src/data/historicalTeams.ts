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
      'deshawn-stevenson-00s',
      'brendan-haywood-10s',
      'peja-stojakovic-10s',
      'ian-mahinmi-10s',
      'dominique-jones-10s',
    ],
    '57-25',
    1,
    'Dirk\'s masterpiece. Beat the Big 3 Heat. The ultimate underdog story.'
  ),
  buildHistoricalTeam(
    'warriors-16',
    '2015-16 Golden State Warriors',
    '2015-16',
    [
      'stephen-curry-10s',
      'klay-thompson-10s',
      'harrison-barnes-10s',
      'draymond-green-10s',
      'festus-ezeli-10s',
      'andre-iguodala-10s',
      'david-lee-10s',
      'carl-landry-10s',
      'kent-bazemore-10s',
      'zaza-pachulia-10s',
    ],
    '73-9',
    0,
    'Best regular season ever (73-9). Unanimous MVP Curry with 402 threes. Fell 3-1 up in the Finals.'
  ),
  buildHistoricalTeam(
    'cavs-16',
    '2015-16 Cleveland Cavaliers',
    '2015-16',
    [
      'kyrie-irving-10s',
      'dion-waiters-10s',
      'lebron-james-10s',
      'tristan-thompson-10s',
      'anderson-varejao-10s',
      'kevin-love-10s',
      'jarrett-jack-10s',
      'cj-miles-10s',
      'alonzo-gee-10s',
      'daniel-gibson-10s',
    ],
    '57-25',
    1,
    'The Block. The Shot. 3-1 comeback over 73 wins. Cleveland\'s first title.'
  ),
  buildHistoricalTeam(
    'bucks-21',
    '2020-21 Milwaukee Bucks',
    '2020-21',
    [
      'jrue-holiday-20s',
      'malik-beasley-20s',
      'khris-middleton-20s',
      'giannis-antetokounmpo-20s',
      'brook-lopez-20s',
      'bobby-portis-20s',
      'pat-connaughton-20s',
      'jevon-carter-20s',
      'thanasis-antetokounmpo-20s',
      'marjon-beauchamp-20s',
    ],
    '46-26',
    1,
    'Giannis 50 in the clincher. Worst to first on defense. Milwaukee\'s first in 50 years.'
  ),
  buildHistoricalTeam(
    'nuggets-23',
    '2022-23 Denver Nuggets',
    '2022-23',
    [
      'jamal-murray-20s',
      'kentavious-caldwell-pope-20s',
      'michael-porter-jr-20s',
      'aaron-gordon-20s',
      'nikola-jokic-20s',
      'bruce-brown-20s',
      'jeff-green-20s',
      'reggie-jackson-20s',
      'christian-braun-20s',
      'peyton-watson-20s',
    ],
    '53-29',
    1,
    'Jokic\'s coronation. Unstoppable two-man game humbled the league 16-4.'
  ),
  buildHistoricalTeam(
    'lakers-20',
    '2019-20 Los Angeles Lakers',
    '2019-20',
    [
      'dangelo-russell-20s',
      'austin-reaves-20s',
      'lebron-james-20s',
      'anthony-davis-20s',
      'dwight-howard-20s',
      'rui-hachimura-20s',
      'jarred-vanderbilt-20s',
      'gabe-vincent-20s',
      'jaxson-hayes-20s',
      'max-christie-20s',
    ],
    '52-19',
    1,
    'Bubble champs. LeBron + AD switching everything. Mamba forever run.'
  ),
  buildHistoricalTeam(
    'sixers-83',
    '1982-83 Philadelphia 76ers',
    '1982-83',
    [
      'maurice-cheeks-80s',
      'andrew-toney-80s',
      'julius-erving-80s',
      'charles-barkley-80s',
      'moses-malone-80s',
      'bobby-jones-80s',
      'sedale-threatt-80s',
      'clint-richardson-80s',
      'marc-iavaroni-80s',
      'caldwell-jones-80s',
    ],
    '65-17',
    1,
    'Fo\' Fo\' Fo\'. Moses + Dr. J swept the league 12-1. Near-perfect dominance.'
  ),
  buildHistoricalTeam(
    'rockets-94',
    '1993-94 Houston Rockets',
    '1993-94',
    [
      'kenny-smith-90s',
      'vernon-maxwell-90s',
      'robert-horry-90s',
      'otis-thorpe-90s',
      'hakeem-olajuwon-90s',
      'mario-elie-90s',
      'chucky-brown-90s',
      'pete-chilcutt-90s',
      'matt-maloney-90s',
      'scott-brooks-90s',
    ],
    '58-24',
    1,
    'Hakeem\'s Dream Shake title. DPOY + MVP. Clutch City over Ewing\'s Knicks in 7.'
  ),
];

export function getHistoricalTeamById(id: string): HistoricalTeam | undefined {
  return HISTORICAL_TEAMS.find(t => t.id === id);
}

export function getAllHistoricalTeams(): HistoricalTeam[] {
  return HISTORICAL_TEAMS;
}
