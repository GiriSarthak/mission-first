/**
 * The single AI gateway (BRIEF §1.4). Feature code never imports the Anthropic
 * SDK directly — everything goes through `complete`, `completeJson`, and
 * `completeWithDocument`, which stay provider-neutral so a second provider can
 * be added later without touching features.
 *
 * Every call is logged to `AiCallLog`.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";
import { db } from "@/lib/db";

export type AiMessage = { role: "user" | "assistant"; content: string };

export type AiOptions = {
  /** heavy = extraction/insights, light = classification/chat */
  tier: "heavy" | "light";
  purpose: string; // logged to AiCallLog
  system?: string;
  maxTokens?: number;
  projectId?: string;
  jobId?: string;
};

// Defaults verified against the Anthropic docs (Aug 2026): Opus 5 for heavy
// extraction/insight work, Haiku 4.5 for classification/chat.
const DEFAULT_HEAVY = "claude-opus-5";
const DEFAULT_LIGHT = "claude-haiku-4-5";

let _client: Anthropic | null = null;
function sdk(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set — add it to .env");
    }
    _client = new Anthropic();
  }
  return _client;
}

export function modelFor(tier: "heavy" | "light"): string {
  return tier === "heavy"
    ? process.env.AI_MODEL_HEAVY || DEFAULT_HEAVY
    : process.env.AI_MODEL_LIGHT || DEFAULT_LIGHT;
}

type ContentBlock =
  | { type: "text"; text: string }
  | {
      type: "document";
      source: { type: "base64"; media_type: "application/pdf"; data: string };
    };

async function call(
  blocksOrMessages: Array<{ role: "user" | "assistant"; content: string | ContentBlock[] }>,
  opts: AiOptions
): Promise<string> {
  const model = modelFor(opts.tier);
  const started = Date.now();
  try {
    const stream = sdk().messages.stream({
      model,
      max_tokens: opts.maxTokens ?? (opts.tier === "heavy" ? 32000 : 8000),
      ...(opts.system && { system: opts.system }),
      messages: blocksOrMessages as Anthropic.MessageParam[],
    });
    const response = await stream.finalMessage();
    const latencyMs = Date.now() - started;
    await logCall(opts, model, response.usage.input_tokens, response.usage.output_tokens, latencyMs);

    if (response.stop_reason === "refusal") {
      throw new Error(`The model declined this request (${opts.purpose}).`);
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error(
        `The model hit the output limit for "${opts.purpose}" — try smaller input chunks.`
      );
    }
    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      await logCall(opts, model, 0, 0, Date.now() - started).catch(() => {});
      throw new Error(`AI call failed (${opts.purpose}): ${err.status} ${err.message}`);
    }
    throw err;
  }
}

async function logCall(
  opts: AiOptions,
  model: string,
  inputTokens: number,
  outputTokens: number,
  latencyMs: number
): Promise<void> {
  await db.aiCallLog.create({
    data: {
      projectId: opts.projectId,
      jobId: opts.jobId,
      purpose: opts.purpose,
      model,
      inputTokens,
      outputTokens,
      latencyMs,
    },
  });
}

/** Plain text completion. */
export async function complete(messages: AiMessage[], opts: AiOptions): Promise<string> {
  return call(messages, opts);
}

/**
 * Structured completion validated against a zod schema. The prompt must ask
 * for JSON only; on validation failure the call is retried once with the
 * validation error appended, then fails with a readable message.
 */
export async function completeJson<T>(
  schema: ZodType<T>,
  messages: AiMessage[],
  opts: AiOptions & { documentBase64?: string }
): Promise<T> {
  const built = withDocument(messages, opts.documentBase64);

  const first = await call(built, opts);
  const attempt1 = tryParse(schema, first);
  if (attempt1.ok) return attempt1.value;

  const retryMessages = [
    ...built,
    { role: "assistant" as const, content: first.slice(0, 50_000) },
    {
      role: "user" as const,
      content:
        `Your previous response failed validation: ${attempt1.error}\n` +
        `Respond again with ONLY the corrected JSON — no prose, no markdown fences.`,
    },
  ];
  const second = await call(retryMessages, { ...opts, purpose: `${opts.purpose}:retry` });
  const attempt2 = tryParse(schema, second);
  if (attempt2.ok) return attempt2.value;
  throw new Error(
    `AI returned invalid JSON for "${opts.purpose}" after one retry: ${attempt2.error}`
  );
}

/** Completion over a base64 PDF document block plus a text prompt. */
export async function completeWithDocument(
  pdfBase64: string,
  prompt: string,
  opts: AiOptions
): Promise<string> {
  return call(
    [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
    opts
  );
}

function withDocument(
  messages: AiMessage[],
  documentBase64: string | undefined
): Array<{ role: "user" | "assistant"; content: string | ContentBlock[] }> {
  if (!documentBase64) return messages;
  const [head, ...rest] = messages;
  return [
    {
      role: head.role,
      content: [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: documentBase64 },
        },
        { type: "text", text: typeof head.content === "string" ? head.content : "" },
      ],
    },
    ...rest,
  ];
}

function tryParse<T>(
  schema: ZodType<T>,
  raw: string
): { ok: true; value: T } | { ok: false; error: string } {
  const text = extractJson(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `not valid JSON (${(e as Error).message})` };
  }
  const result = schema.safeParse(parsed);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    error: result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; "),
  };
}

/** Strips markdown fences / prose around the outermost JSON value. */
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.search(/[[{]/);
  if (start === -1) return body.trim();
  const open = body[start];
  const close = open === "[" ? "]" : "}";
  const end = body.lastIndexOf(close);
  if (end > start) return body.slice(start, end + 1);
  return body.trim();
}
