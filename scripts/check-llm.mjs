import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});

const model = process.env.LLM_MODEL || "muse-spark-1.3-contributor";
const apiKey = process.env.MODEL_API_KEY;

if (!apiKey) {
  console.error("MODEL_API_KEY is missing from the project .env or environment.");
  process.exit(1);
}

try {
  const response = await fetch("https://api.meta.ai/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    redirect: "error",
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model,
      input: "Connection test. Reply with only the word OK.",
      reasoning: { effort: "minimal" },
      max_output_tokens: 128,
    }),
  });

  // Do not log request headers or raw provider errors: they can expose secrets.
  if (!response.ok) {
    console.error(`Meta Model API connection failed (HTTP ${response.status}).`);
    process.exit(1);
  }

  const result = await response.json();
  const text = (result.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text")
    .map((content) => content.text)
    .join("")
    .trim();

  if (result.status !== "completed" || !/^OK[.!]?$/.test(text)) {
    console.error("Meta Model API returned an unexpected or incomplete test response.");
    process.exit(1);
  }

  console.log(JSON.stringify({
    provider: "meta",
    model: result.model ?? model,
    status: "ok",
    input_tokens: result.usage?.input_tokens ?? null,
    output_tokens: result.usage?.output_tokens ?? null,
  }, null, 2));
} catch (error) {
  console.error(error.name === "TimeoutError"
    ? "Meta Model API connection timed out."
    : "Meta Model API connection failed; check network access and credentials.");
  process.exit(1);
}
