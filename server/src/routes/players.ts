import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ALL_PLAYERS, getPlayersByFranchiseAndDecade, getPlayersByDecade, getPlayersByFranchise, getPlayerById, getRandomPlayersByFranchiseAndDecade } from '../data/players';
import { FRANCHISES, DECADES } from '../data/constants';

const router = Router();

const playerQuerySchema = z.object({
  franchise: z.string().optional(),
  decade: z.string().optional(),
  position: z.enum(['PG', 'SG', 'SF', 'PF', 'C']).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

router.get('/', (req: Request, res: Response) => {
  const result = playerQuerySchema.safeParse(req.query);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid query', details: result.error.flatten() });
  }

  let players = ALL_PLAYERS;

  if (result.data.franchise) {
    players = players.filter(p => p.team === result.data.franchise);
  }
  if (result.data.decade) {
    players = players.filter(p => p.decade === result.data.decade);
  }
  if (result.data.position) {
    players = players.filter(p => p.position === result.data.position);
  }

  const total = players.length;
  const offset = result.data.offset || 0;
  const limit = result.data.limit || 50;

  players = players.slice(offset, offset + limit);

  res.json({ players, total, offset, limit });
});

router.get('/by-franchise-decade/:franchise/:decade', (req: Request, res: Response) => {
  const { franchise, decade } = req.params;

  const franchiseInfo = FRANCHISES.find(f => f.id === franchise);
  const decadeInfo = DECADES.find(d => d.id === decade);

  if (!franchiseInfo || !decadeInfo) {
    return res.status(404).json({ error: 'Invalid franchise or decade' });
  }

  const players = getPlayersByFranchiseAndDecade(franchise, decade);

  res.json({
    franchise: franchiseInfo,
    decade: decadeInfo,
    players,
    count: players.length,
  });
});

router.get('/random/:franchise/:decade', (req: Request, res: Response) => {
  const { franchise, decade } = req.params;
  const count = parseInt(req.query.count as string) || 5;

  const franchiseInfo = FRANCHISES.find(f => f.id === franchise);
  const decadeInfo = DECADES.find(d => d.id === decade);

  if (!franchiseInfo || !decadeInfo) {
    return res.status(404).json({ error: 'Invalid franchise or decade' });
  }

  const players = getRandomPlayersByFranchiseAndDecade(franchise, decade, count);

  res.json({ players });
});

router.get('/decade/:decade', (req: Request, res: Response) => {
  const { decade } = req.params;
  const decadeInfo = DECADES.find(d => d.id === decade);

  if (!decadeInfo) {
    return res.status(404).json({ error: 'Invalid decade' });
  }

  const players = getPlayersByDecade(decade);

  res.json({ decade: decadeInfo, players, count: players.length });
});

router.get('/franchise/:franchise', (req: Request, res: Response) => {
  const { franchise } = req.params;
  const franchiseInfo = FRANCHISES.find(f => f.id === franchise);

  if (!franchiseInfo) {
    return res.status(404).json({ error: 'Invalid franchise' });
  }

  const players = getPlayersByFranchise(franchise);

  res.json({ franchise: franchiseInfo, players, count: players.length });
});

router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const player = getPlayerById(id);

  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }

  res.json({ player });
});

router.get('/search/:query', (req: Request, res: Response) => {
  const { query } = req.params;
  const lowerQuery = query.toLowerCase();

  const players = ALL_PLAYERS.filter(p =>
    p.name.toLowerCase().includes(lowerQuery) ||
    p.team.toLowerCase().includes(lowerQuery) ||
    p.decade.includes(lowerQuery)
  );

  res.json({ players, count: players.length });
});

export default router;