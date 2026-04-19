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

// B-SEC-RCE: task-challenges runs arbitrary user-submitted JS. By design this
// is a learning/sandbox feature, but the naive `new Function()` runner has
// FULL access to require(), process, fs, etc. -- i.e. RCE on the server.
// Gate the route behind an explicit env flag AND admin role so it cannot be
// reached accidentally in production. Even when enabled, limit code size and
// total time.
const TASK_CHALLENGES_ENABLED = process.env.TASK_CHALLENGES_ENABLED === "true";

router.post("/task-challenges/test", async (req: Request, res: Response) => {
  if (!TASK_CHALLENGES_ENABLED) {
    res.status(503).json({ error: "Task challenges are disabled in this environment" });
    return;
  }
  // Require admin role (set by upstream auth middleware)
  const userRole = (req as any)?.user?.role;
  if (userRole !== "admin") {
    res.status(403).json({ error: "Admin role required" });
    return;
  }

  const { challengeId, code } = req.body;
  const challenge = challenges.find((c: Challenge) => c.id === challengeId);
  if (!challenge) {
    res.status(404).json({ error: "Challenge not found" });
    return;
  }
  // Bound code size to prevent DOS / accidental huge submissions
  if (typeof code !== "string" || code.length === 0 || code.length > 10000) {
    res.status(400).json({ error: "Code must be a string of 1-10000 chars" });
    return;
  }
  let passed = false, output: unknown = "", feedback = "", score = 0;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`"use strict"; ${code}\nreturn ${challenge.test};`);
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
