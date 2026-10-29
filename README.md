# TangleWire

A chief of staff for founders. You dump everything that's on you. TangleWire hands back **one thing to start now**, the rest sorted by what actually matters, and a pile of what doesn't.

The problem it attacks is decision fatigue: a founder burning their best hours on twenty small calls that don't move anything. TangleWire's opinion is that a list with twelve priorities has none, so it is willing to tell you something is noise.

## How it works

1. **Dump.** Type everything — half-thoughts, the thing you keep not doing, who's waiting on you. Don't tidy it up first. Tidying it up is the job.
2. **Untangle.** Claude splits it into separate things and sorts each one:
   - **Do these** — the company is measurably worse in thirty days without it
   - **Deadlines** — a hard date or a person waiting; it snaps if ignored
   - **Can wait** — real, but costs nothing to leave for weeks
   - **Noise** — feels like work, changes nothing
3. **Start.** One item is the live wire: the highest-leverage thing you can begin right now, with the smallest physical first move and how long that move takes.

Each item also carries a **pull** reading of 1–5 — how hard it's tugging at your attention, which is deliberately *not* how important it is. A nagging trivial thing can be a 5, and seeing that is the point.

## Visitors don't need anything

The deployed app works with no sign-up and no key. Requests go to `/api/untangle`, which holds the model key server-side, owns the prompt, and caps what each visitor can spend. It runs on Gemini's free tier or on Claude, whichever key the deployment has.

Anyone who wants unlimited use can paste their own Anthropic key in settings. Their browser then talks to Anthropic directly and never touches the server.

## Deploying it

**[DEPLOY.md](DEPLOY.md) is the step-by-step version, written for someone who doesn't write code.** The short version follows.

The site is static files plus one serverless function. Vercel runs both from the repo with no build step.

1. **Import the repo** at [vercel.com/new](https://vercel.com/new). No framework, no build command, no output directory — Vercel serves the root and treats `api/` as functions.
2. **Add one model key** in Project → Settings → Environment Variables: `GEMINI_API_KEY` (free tier, no card) or `ANTHROPIC_API_KEY` (pay as you go). Whichever is present is used; set `TW_PROVIDER` to pick when both are.
3. **On Anthropic, set a monthly spend limit.** On Gemini's free tier there is nothing to cap — it cannot bill you.
4. **Add rate limiting once there's traffic.** Vercel's Storage tab → Upstash Redis → connect. Without it the endpoint falls back to a per-instance counter, which stops casual hammering but is not a real limit.

`.env.example` lists every variable. Redeploy after changing any of them.

### The limits, and where to change them

| Variable | Default | What it does |
| --- | --- | --- |
| `TW_PROVIDER` | whichever key is set | `gemini` or `anthropic`. |
| `TW_MODEL` | `gemini-2.5-flash` / `claude-haiku-5-5` | Model for free visitors. |
| `TW_PER_VISITOR_PER_DAY` | `6` | Untangles per IP per day before they're asked for their own key. |
| `TW_GLOBAL_PER_DAY` | `600` | Ceiling across everyone. Your actual daily spend cap. |

Visitors who hit either limit get a clear message pointing at the settings panel, which is also the cheapest conversion path you have.

## Running it locally

```bash
git clone https://github.com/dhruvmadan01/tanglewire.git
cd tanglewire
open index.html
```

Opened as a file there's no server, so paste your own key in settings. For the full thing including the endpoint, `npx vercel dev` with a `.env` file.

## Files

```
index.html          markup and copy
assets/prompt.js    THE PROMPT — shared by the browser and the server
assets/style.css    tokens, layout, light and dark
assets/app.js       state, rendering, the two ways of calling Claude
api/untangle.js     the endpoint: holds the key, owns the prompt, rate limits
```

`assets/prompt.js` is most of the product. It is loaded as a `<script>` in the browser and `require`d by the function, so there is one copy and it cannot drift. If the sorting feels wrong, edit that file and nothing else.

## Not built yet

- Morning re-sort on a schedule instead of a button
- Pulling the dump from somewhere real (inbox, calendar) instead of typing it
- History: what you cut, and whether cutting it cost anything
- Putting the live wire on your calendar and defending the block

That last one is the difference between a tool that gives advice and a tool people pay for.

## Launch film

`media/tanglewire-launch.mp4` — 48 seconds, the real product, voiceover. Shot against the earlier dark look.

## Licence

MIT
