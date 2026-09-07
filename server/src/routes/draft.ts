import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { generateDraftPool, spinForDraftPool, getFranchiseInfo, getDecadeInfo } from '../services/draftPool';
import { FRANCHISES, DECADES } from '../data/constants';

const router = Router();

const spinSchema = z.object({
  excludeFranchise: z.string().optional(),
  excludeDecade: z.string().optional(),
});

router.get('/pools', (req: Request, res: Response) => {
  const pools = [];
  for (const franchise of FRANCHISES) {
    for (const decade of DECADES) {
      pools.push({
        franchise: franchise.id,
        decade: decade.id,
        franchiseName: franchise.name,
        decadeLabel: decade.label,
        era: decade.era,
      });
    }
  }
  res.json({ pools });
});

router.get('/franchises', (req: Request, res: Response) => {
  res.json({ franchises: FRANCHISES });
});

router.get('/decades', (req: Request, res: Response) => {
  res.json({ decades: DECADES });
});

router.post('/spin', (req: Request, res: Response) => {
  const result = spinSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: 'Invalid request', details: result.error.flatten() });
  }

  const pool = spinForDraftPool(result.data.excludeFranchise, result.data.excludeDecade);

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
  const pool = generateDraftPool();

  if (pool.franchise !== franchise || pool.decade !== decade) {
    return res.status(404).json({ error: 'Pool not found' });
  }

  const franchiseInfo = getFranchiseInfo(franchise);
  const decadeInfo = getDecadeInfo(decade);

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