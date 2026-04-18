// ── ontology.ts
import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { ontologyEngine, ObjectType } from '../ontology/ontologyEngine';

const router = Router();
router.use(authenticate);

router.get('/object/:type/:id', async (req: AuthRequest, res: Response) => {
  try {
    const obj = await ontologyEngine.getObject(req.params.type as ObjectType, req.params.id);
    res.json(obj);
  } catch (err: any) { res.status(404).json({ error: err.message }); }
});

router.get('/search', async (req: AuthRequest, res: Response) => {
  try {
    const { q, types } = req.query;
    const results = await ontologyEngine.globalSearch(
      q as string,
      types ? (types as string).split(',') as ObjectType[] : undefined
    );
    res.json(results);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/digital-twin', async (req: AuthRequest, res: Response) => {
  try {
    const twin = await ontologyEngine.getDigitalTwin();
    res.json(twin);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/schema', async (req: AuthRequest, res: Response) => {
  const { ONTOLOGY_SCHEMA } = await import('../ontology/ontologyEngine');
  res.json(ONTOLOGY_SCHEMA);
});

export default router;
