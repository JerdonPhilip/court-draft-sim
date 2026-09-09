import { Player, SeasonSimulationResult } from '../types/game.js';
import { SIMULATION_CONSTANTS } from './constants.js';

/**
 * Shape the raw engine season output into the API/UI result contract.
 * Shared by the Express route and the offline browser engine so both
 * produce byte-identical result shapes.
 */
export function formatSeasonResult(args: {
  seasonResult: SeasonSimulationResult;
  players: Player[];
  opponentPool: Player[][];
  projectedWins: number;
  teamStrength: number;
  eraMeta: { id: string; label: string } | null;
}) {
  const { seasonResult, players, opponentPool, projectedWins, teamStrength, eraMeta } = args;
  return {
    wins: seasonResult.wins,
    losses: seasonResult.losses,
    winPct: Number((seasonResult.wins / SIMULATION_CONSTANTS.MAX_GAMES).toFixed(3)),
    projectedWins,
    teamStrength,
    era: eraMeta,
    games: seasonResult.games.map(g => ({
      gameNumber: g.gameNumber,
      opponent: g.opponent,
      isHome: g.isHome,
      result: g.result,
      score: g.score,
      otPeriods: g.otPeriods,
      playerPerformances: Object.entries(g.playerStats).map(([playerId, stats]) => {
        const player = players.find(p => p.id === playerId);
        return {
          playerId,
          playerName: player?.name ?? playerId,
          stats,
          minutes: g.userMinutes[playerId] ?? 40,
          position: player?.position,
          secondaryPositions: player?.secondaryPositions,
          overall: player?.overall,
          heightIn: player?.heightIn,
          team: 'Your Team',
          baseStats: player?.stats,
        };
      }),
      opponentPerformances: Object.entries(g.opponentPlayerStats).map(([playerId, stats]) => {
        const player = g.opponentRoster.find(p => p.playerId === playerId);
        return {
          playerId,
          playerName: player?.playerName ?? playerId,
          stats,
          minutes: g.opponentMinutes?.[playerId] ?? 40,
          position: player?.position,
          secondaryPositions: player?.secondaryPositions,
          overall: player?.overall,
          heightIn: player?.heightIn,
          team: g.opponent,
          baseStats: player?.baseStats,
        };
      }),
    })),
    playerStats: Object.values(seasonResult.playerSeasonStats).map(s => {
      const base = players.find(p => p.id === s.playerId);
      return {
        playerId: s.playerId,
        playerName: s.playerName,
        gamesPlayed: s.gamesPlayed,
        minutesPerGame: s.minutesPerGame,
        averages: s.averages,
        totals: s.totals,
        highGames: s.highGames,
        position: base?.position,
        secondaryPositions: base?.secondaryPositions,
        overall: base?.overall,
        heightIn: base?.heightIn,
        team: 'Your Team',
        baseStats: base?.stats,
      };
    }),
    teamStats: seasonResult.teamStats,
    standings: seasonResult.standings,
    opponentPlayerStats: Object.values(seasonResult.opponentPlayerSeasonStats).map(s => {
      const player = opponentPool.flat().find(p => p.id === s.playerId);
      return {
        playerId: s.playerId,
        playerName: s.playerName,
        gamesPlayed: s.gamesPlayed,
        minutesPerGame: s.minutesPerGame,
        averages: s.averages,
        totals: s.totals,
        highGames: s.highGames,
        position: player?.position,
        secondaryPositions: player?.secondaryPositions,
        overall: player?.overall,
        heightIn: player?.heightIn,
        team: player?.team ?? 'Opponent',
        baseStats: player?.stats,
      };
    }),
  };
}
