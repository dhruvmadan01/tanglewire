/* The untangle endpoint.
 *
 * Holds the Anthropic key server-side so visitors need nothing of their own,
 * and owns the prompt so this cannot be used as a free, general-purpose LLM.
 * Everything the browser sends is treated as untrusted text to be sorted.
 */

const { TANGLEWIRE_SYSTEM } = require("../assets/prompt.js");

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";

// Free visitors get the cheap model. Bring-your-own-key users never reach
// this file — their browser talks to Anthropic directly.
const MODEL = process.env.TW_MODEL || "claude-haiku-5-5";

const PER_VISITOR_PER_DAY = int(process.env.TW_PER_VISITOR_PER_DAY, 6);
const GLOBAL_PER_DAY = int(process.env.TW_GLOBAL_PER_DAY, 600);

const MAX_DUMP = 4000;
const MAX_CONTEXT = 1200;
const MAX_EXISTING = 30;
const MAX_TOKENS = 2600;

function int(v, d) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : d;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function visitorKey(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "");
  const ip = fwd.split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
  return ip;
}

/* ---- rate limiting -----------------------------------------------------
 * Uses Upstash Redis over REST when configured. Without it the endpoint
 * still works but counts nothing, which is fine locally and a bad idea in
 * production — the README says so.
 */
/* Fallback counter used when no Redis is configured. It only sees one warm
 * serverless instance, so it is a speed bump rather than a limit — enough to
 * stop a script hammering a single instance, not enough to be the only guard.
 * The Anthropic console's own spend cap is the real backstop.
 */
function memBump(day, visitor) {
  const m = globalThis.__tw_mem || (globalThis.__tw_mem = { day: "", seen: new Map(), total: 0 });
  if (m.day !== day) { m.day = day; m.seen.clear(); m.total = 0; }
  if (m.seen.size > 5000) m.seen.clear();
  m.total += 1;
  const v = (m.seen.get(visitor) || 0) + 1;
  m.seen.set(visitor, v);
  return { visitor: v, total: m.total };
}

async function bump(keys) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const cmds = [];
  for (const k of keys) {
    cmds.push(["INCR", k]);
    cmds.push(["EXPIRE", k, "172800", "NX"]);
  }
  try {
    const res = await fetch(url.replace(/\/$/, "") + "/pipeline", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(cmds)
    });
    if (!res.ok) return null;
    const rows = await res.json();
    const counts = {};
    keys.forEach((k, i) => { counts[k] = Number(rows[i * 2]?.result ?? 0); });
    return counts;
  } catch (e) {
    return null;   // never let the limiter take the product down
  }
}

function bad(res, status, message) {
  res.status(status).json({ error: message });
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") return bad(res, 405, "Use POST.");

  if (!process.env.ANTHROPIC_API_KEY) {
    return bad(res, 503, "This deployment has no API key configured yet.");
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { return bad(res, 400, "Could not read that request."); }
  }
  if (!body || typeof body !== "object") return bad(res, 400, "Could not read that request.");

  const dump = String(body.dump || "").slice(0, MAX_DUMP).trim();
  if (!dump) return bad(res, 400, "Nothing to sort.");

  const context = String(body.context || "").slice(0, MAX_CONTEXT).trim();
  const existing = Array.isArray(body.existing) ? body.existing.slice(0, MAX_EXISTING) : [];

  // --- limits ---
  const day = today();
  const vkey = `tw:v:${day}:${visitorKey(req)}`;
  const gkey = `tw:g:${day}`;
  const counts = await bump([vkey, gkey]);

  const used = counts
    ? { visitor: counts[vkey], total: counts[gkey] }
    : memBump(day, visitorKey(req));

  if (used.total > GLOBAL_PER_DAY) {
    return bad(res, 429, "TangleWire has hit its shared limit for today. Add your own API key in settings to keep going.");
  }
  if (used.visitor > PER_VISITOR_PER_DAY) {
    return bad(res, 429, `That's your ${PER_VISITOR_PER_DAY} free untangles for today. Add your own API key in settings for unlimited use.`);
  }

  // --- build the message ---
  const parts = [];
  if (context) parts.push("Standing context on the founder and company:\n" + context);
  if (existing.length) {
    const lines = existing
      .map((s) => {
        const title = String(s && s.title || "").slice(0, 120);
        const kind = String(s && s.kind || "").slice(0, 20);
        const tension = Number(s && s.tension) || 0;
        return title ? `- ${title} [${kind}, tension ${tension}]` : "";
      })
      .filter(Boolean);
    if (lines.length) {
      parts.push("Already on the board (re-rank these together with anything new, keep titles stable where the thing is the same):\n" + lines.join("\n"));
    }
  }
  parts.push("Today's dump:\n" + dump);

  try {
    const upstream = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": API_VERSION
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: TANGLEWIRE_SYSTEM,
        messages: [{ role: "user", content: parts.join("\n\n") }]
      })
    });

    const text = await upstream.text();

    if (!upstream.ok) {
      console.error("anthropic", upstream.status, text.slice(0, 400));
      if (upstream.status === 429 || upstream.status === 529) {
        return bad(res, 503, "Anthropic is busy right now. Try again in a moment.");
      }
      // never leak upstream key or billing detail to the browser
      return bad(res, 502, "The sorting service is having a problem. Try again shortly.");
    }

    const data = JSON.parse(text);
    let out = "";
    for (const block of data.content || []) {
      if (block.type === "text") out += block.text;
    }

    res.setHeader("cache-control", "no-store");
    res.status(200).json({ raw: out, model: MODEL });
  } catch (err) {
    console.error("untangle", err);
    return bad(res, 502, "Could not reach the sorting service. Try again shortly.");
  }
};
