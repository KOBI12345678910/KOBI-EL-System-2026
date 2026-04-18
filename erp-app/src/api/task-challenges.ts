import { authFetch } from "@/lib/utils";

export async function runChallengeTest({ challengeId, code }: { challengeId: string; code: string }) {
  const res = await authFetch("/api/task-challenges/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId, code }),
  });
  return await res.json();
}
