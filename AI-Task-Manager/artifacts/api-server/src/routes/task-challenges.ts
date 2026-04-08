import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

interface Challenge {
  id: string;
  test: string;
  expected: unknown;
}

const challenges: Challenge[] = [
  { id: "sum", test: "sum(1, 2)", expected: 3 },
  { id: "reverse", test: "reverseString('hello')", expected: "olleh" },
  { id: "factorial", test: "factorial(5)", expected: 120 },
];

router.post("/task-challenges/test", async (req: Request, res: Response) => {
  const { challengeId, code } = req.body;
  const challenge = challenges.find((c: Challenge) => c.id === challengeId);
  if (!challenge) {
    res.status(404).json({ error: "Challenge not found" });
    return;
  }
  let passed = false, output: unknown = "", feedback = "", score = 0;
  try {
    const fn = new Function(code + "\nreturn " + challenge.test);
    output = fn();
    if (JSON.stringify(output) === JSON.stringify(challenge.expected)) {
      passed = true;
      score = 100;
      feedback = "כל הכבוד!";
    } else {
      feedback = `פלט שגוי. ציפינו ל: ${JSON.stringify(challenge.expected)} קיבלנו: ${JSON.stringify(output)}`;
      score = 30;
    }
  } catch (e: unknown) {
    output = e instanceof Error ? e.message : String(e);
    feedback = "שגיאת הרצה";
    score = 0;
  }
  res.json({ passed, output, feedback, score });
});

export default router;
