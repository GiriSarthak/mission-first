/** Milestone 6 smoke test: one trivial light-model call through the AI client. */
import { complete, modelFor } from "../src/lib/ai/client";
import { db } from "../src/lib/db";

async function main() {
  console.log(`light model: ${modelFor("light")}`);
  const text = await complete(
    [{ role: "user", content: "Reply with exactly the single word OK." }],
    { tier: "light", purpose: "verify-ai-client", maxTokens: 64 }
  );
  console.log(`response: ${text.trim()}`);
  const log = await db.aiCallLog.findFirst({
    where: { purpose: "verify-ai-client" },
    orderBy: { createdAt: "desc" },
  });
  console.log(
    `logged: model=${log?.model} in=${log?.inputTokens} out=${log?.outputTokens} latency=${log?.latencyMs}ms`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
