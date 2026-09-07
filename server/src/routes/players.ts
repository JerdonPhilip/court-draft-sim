import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ALL_PLAYERS, getPlayersByFranchiseAndDecade, getPlayersByDecade, getPlayersByFranchise, getPlayerById, getRandomPlayersByFranchiseAndDecade } from '../data/players.js';
import { FRANCHISES, DECADES } from '../data/constants.js';

const router = Router();

const playerQuerySchema = z.object({
  franchise: z.string().max(50).optional(),
  decade: z.string().max(20).optional(),
  position: z.enum(['PG', 'SG', 'SF', 'PF', 'C']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(10000).optional(),
});

const countQuerySchema = z.object({
  count: z.coerce.number().int().min(1).max(25).optional(),
});

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).optional(),
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
  const offset = result.data.offset ?? 0;
  const limit = result.data.limit ?? 50;

  players = players.slice(offset, offset + limit);

  res.json({ players, total, offset, limit });
});

// Search via query string so spaces/slashes work: /players/search?q=jordan
router.get('/search', (req: Request, res: Response) => {
  const result = searchQuerySchema.safeParse(req.query);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid query', details: result.error.flatten() });
  }
  const lowerQuery = result.data.q.toLowerCase();
  const limit = result.data.limit ?? 25;

  const players = ALL_PLAYERS.filter(p =>
    p.name.toLowerCase().includes(lowerQuery) ||
    p.team.toLowerCase().includes(lowerQuery) ||
    p.decade.toLowerCase().includes(lowerQuery) ||
    p.archetype.toLowerCase().includes(lowerQuery)
  ).slice(0, limit);

  res.json({ players, count: players.length });
});

router.get('/by-franchise-decade/:franchise/:decade', (req: Request, res: Response) => {
  const { franchise, decade } = req.params;

  const franchiseInfo = FRANCHISES.find(f => f.id === franchise);
  const decadeInfo = DECADES.find(d => d.id === decade);

  if (!franchiseInfo || !decadeInfo) {
    return res.status(404).json({ error: 'Invalid franchise or decade' });
  }

  const players = getPlayersByFranchiseAndDecade(franchise as string, decade as string);

  res.json({
    franchise: franchiseInfo,
    decade: decadeInfo,
    players,
    count: players.length,
  });
});

router.get('/random/:franchise/:decade', (req: Request, res: Response) => {
  const { franchise, decade } = req.params;
  const parsed = countQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid count', details: parsed.error.flatten() });
  }
  const count = parsed.data.count ?? 5;

  const franchiseInfo = FRANCHISES.find(f => f.id === franchise);
  const decadeInfo = DECADES.find(d => d.id === decade);

  if (!franchiseInfo || !decadeInfo) {
    return res.status(404).json({ error: 'Invalid franchise or decade' });
  }

  const players = getRandomPlayersByFranchiseAndDecade(franchise as string, decade as string, count);

  res.json({ players });
});

router.get('/decade/:decade', (req: Request, res: Response) => {
  const { decade } = req.params;
  const decadeInfo = DECADES.find(d => d.id === decade);

  if (!decadeInfo) {
    return res.status(404).json({ error: 'Invalid decade' });
  }

  const players = getPlayersByDecade(decade as string);

  res.json({ decade: decadeInfo, players, count: players.length });
});

router.get('/franchise/:franchise', (req: Request, res: Response) => {
  const { franchise } = req.params;
  const franchiseInfo = FRANCHISES.find(f => f.id === franchise);

  if (!franchiseInfo) {
    return res.status(404).json({ error: 'Invalid franchise' });
  }

  const players = getPlayersByFranchise(franchise as string);

  res.json({ franchise: franchiseInfo, players, count: players.length });
});

// Keep /:id last so it can't shadow more specific routes.
router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const player = getPlayerById(id as string);

  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }

  res.json({ player });
});

// Back-compat for old /search/:query path (no slashes). Prefer /search?q=.
router.get('/search/:query', (req: Request, res: Response) => {
  const raw = (req.params.query as string ?? '').trim().slice(0, 100);
  if (!raw) {
    return res.status(400).json({ error: 'Missing query' });
  }
  const lowerQuery = raw.toLowerCase();

  const players = ALL_PLAYERS.filter(p =>
    p.name.toLowerCase().includes(lowerQuery) ||
    p.team.toLowerCase().includes(lowerQuery) ||
    p.decade.toLowerCase().includes(lowerQuery)
  ).slice(0, 25);

  res.json({ players, count: players.length });
});

export default router;
