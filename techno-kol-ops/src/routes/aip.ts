// ── aip.ts
import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { aipEngine } from '../aip/aipEngine';

const aipRouter = Router();
aipRouter.use(authenticate);

aipRouter.post('/query', async (req: AuthRequest, res: Response) => {
  try {
    const response = await aipEngine.query({
      question: req.body.question,
      context: req.body.context,
      user_id: req.user?.id
    });
    res.json(response);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

aipRouter.get('/suggestions', async (req: AuthRequest, res: Response) => {
  res.json({
    suggestions: [
      'כמה הכנסות הייתה לנו החודש?',
      'מה מצב המלאי עכשיו?',
      'איזה הזמנות מאוחרות?',
      'מי בשטח עכשיו?',
      'מה תחזית החודש הבא?',
      'מי הלקוח הגדול ביותר?',
      'כמה עובדים חולים היום?',
      'מה הרווח הגולמי שלנו?',
      'איזה חומרים הולכים להיגמר?',
      'מה ביצועי הצוות החודש?'
    ]
  });
});

export { aipRouter };
