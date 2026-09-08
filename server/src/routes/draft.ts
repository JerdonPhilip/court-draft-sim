import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDraftPool, spinForDraftPool, rerollDraftPool, getFranchiseInfo, getDecadeInfo, generateAllDraftPools, MIN_POOL_SIZE } from '../services/draftPool.js';
import { FRANCHISES, DECADES } from '../data/constants.js';

const router = Router();

const franchiseIds = FRANCHISES.map(f => f.id) as unknown as [string, ...string[]];
const decadeIds = DECADES.map(d => d.id) as unknown as [string, ...string[]];

const spinSchema = z.object({
  excludeFranchise: z.enum(franchiseIds).optional(),
  excludeDecade: z.enum(decadeIds).optional(),
  neededPositions: z.array(z.enum(['PG', 'SG', 'SF', 'PF', 'C'])).min(1).max(10).optional(),
});

const rerollSchema = z.object({
  keep: z.enum(['franchise', 'decade']),
  franchise: z.enum(franchiseIds),
  decade: z.enum(decadeIds),
  neededPositions: z.array(z.enum(['PG', 'SG', 'SF', 'PF', 'C'])).min(1).max(10).optional(),
});

router.get('/pools', (req: Request, res: Response) => {
  // Only advertise pools that meet the minimum size so the client never
  // gets a 1-2 player "full" pool.
  const pools = generateAllDraftPools().map(pool => {
    const franchiseInfo = getFranchiseInfo(pool.franchise);
    const decadeInfo = getDecadeInfo(pool.decade);
    return {
      franchise: pool.franchise,
      decade: pool.decade,
      franchiseName: franchiseInfo?.name,
      decadeLabel: decadeInfo?.label,
      era: decadeInfo?.era,
      playerCount: pool.players.length,
    };
  });
  res.json({ pools, minPoolSize: MIN_POOL_SIZE });
});

router.get('/franchises', (req: Request, res: Response) => {
  res.json({ franchises: FRANCHISES });
});

router.get('/decades', (req: Request, res: Response) => {
  res.json({ decades: DECADES });
});

router.post('/spin', (req: Request, res: Response) => {
  const result = spinSchema.safeParse(req.body ?? {});
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid request', details: result.error.flatten() });
  }

  const pool = spinForDraftPool(result.data.excludeFranchise, result.data.excludeDecade, result.data.neededPositions);

  const franchiseInfo = getFranchiseInfo(pool.franchise);
  const decadeInfo = getDecadeInfo(pool.decade);

  res.json({
    pool: {
      ...pool,
      franchiseName: franchiseInfo?.name,
      franchiseColor: franchiseInfo?.color,
      decadeLabel: decadeInfo?.label,
      era: decadeInfo?.era,
    },
  });
});

router.post('/reroll', (req: Request, res: Response) => {
  const result = rerollSchema.safeParse(req.body ?? {});
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid request', details: result.error.flatten() });
  }

  const { keep, franchise, decade, neededPositions } = result.data;
  const pool = rerollDraftPool(keep, franchise, decade, neededPositions);

  if (!pool) {
    return res.status(404).json({ error: `No alternative ${keep === 'franchise' ? 'decade' : 'franchise'} available for this pool` });
  }

  const franchiseInfo = getFranchiseInfo(pool.franchise);
  const decadeInfo = getDecadeInfo(pool.decade);

  res.json({
    pool: {
      ...pool,
      franchiseName: franchiseInfo?.name,
      franchiseColor: franchiseInfo?.color,
      decadeLabel: decadeInfo?.label,
      era: decadeInfo?.era,
    },
  });
});

router.get('/pool/:franchise/:decade', (req: Request, res: Response) => {
  const { franchise, decade } = req.params;

  const franchiseInfo = getFranchiseInfo(franchise as string);
  const decadeInfo = getDecadeInfo(decade as string);

  if (!franchiseInfo || !decadeInfo) {
    return res.status(404).json({ error: 'Invalid franchise or decade' });
  }

  const pool = getDraftPool(franchise as string, decade as string);
  if (!pool) {
    return res.status(404).json({ error: 'Pool not found or too few players', minPoolSize: MIN_POOL_SIZE });
  }

  res.json({
    pool: {
      ...pool,
      franchiseName: franchiseInfo?.name,
      franchiseColor: franchiseInfo?.color,
      decadeLabel: decadeInfo?.label,
      era: decadeInfo?.era,
    },
  });
});

export default router;
