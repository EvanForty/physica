// Vercel Routing Middleware: handles POST /api/theory at the project root (no folders needed).
// Requires the ANTHROPIC_API_KEY environment variable (Vercel → Project → Settings → Environment Variables).
// Optional: ANTHROPIC_MODEL to override the default model.

export const config = { matcher: "/api/theory" };

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const MAX_INPUT = 1200;

function theoryPrompt(question, known) {
  return `You are the theory notebook in Physica, a virtual physics laboratory. A user asked a physics question. Propose one testable hypothesis as a mathematical relationship, and a computational experiment to test it in a simulation. Be accurate: if the answer is established physics, say so and give the known law. Never claim a simulation result is a physical discovery. If the question is not about physics, say so briefly in the hypothesis and keep other fields short.

Question: ${question}
${known ? "What the user already knows: " + known : ""}

Reply with only a JSON object, no prose or code fences:
{"title": "short title, under 9 words",
 "hypothesis": "2-3 sentences stating the hypothesis in plain words",
 "equation": "the candidate equation in plain Unicode text, e.g. T² ∝ r³",
 "variables": [{"symbol": "T", "meaning": "orbital period"}],
 "experiment": ["3-5 short steps of a computational experiment"],
 "prediction": "one sentence with the specific outcome expected",
 "falsify": "one sentence on which result would rule the hypothesis out",
 "limitations": "1-2 sentences on what a simulation cannot establish here",
 "lab": "the closest Physica experiment: gravity, collider, quantum, cosmos, or null"}`;
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

export default async function middleware(request) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json({ error: "Server is missing ANTHROPIC_API_KEY" }, 500);

  let body = {};
  try { body = await request.json(); } catch { body = {}; }
  const q = String(body.question || "").trim(), k = String(body.known || "").trim();
  if (body.kind !== "theory" || !q || q.length > MAX_INPUT || k.length > MAX_INPUT) return json({ error: "Invalid input" }, 400);

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1200, messages: [{ role: "user", content: theoryPrompt(q, k) }] })
    });
    if (r.status === 429) return json({ error: "Rate limited", code: "rate_limited" }, 429);
    if (!r.ok) return json({ error: "Upstream error" }, 502);
    const data = await r.json();
    const text = (data.content || []).map((b) => (b.type === "text" ? b.text : "")).join("").replace(/```json|```/g, "").trim();
    const result = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    return json({ result });
  } catch (e) {
    return json({ error: "Could not generate a response" }, 502);
  }
}
