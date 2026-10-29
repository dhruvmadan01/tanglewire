# TangleWire

A chief of staff for founders. You dump everything that's on you. TangleWire hands back **one live wire**, the strands that actually hold, and the slack you can drop.

The problem it attacks is decision fatigue: a founder burning their best hours on twenty small calls that don't move anything. TangleWire's opinion is that a list with twelve priorities has none, so it is willing to tell you something is noise.

## How it works

1. **Dump.** Type everything — half-thoughts, the thing you keep not doing, who's waiting on you.
2. **Untangle.** Claude splits it into strands and sorts each one:
   - **Load-bearing** — the company is measurably worse in thirty days without it
   - **Fraying** — a hard deadline or a person waiting; it snaps if ignored
   - **Slack** — real, but costs nothing to leave for weeks
   - **Cut** — feels like work, changes nothing
3. **Pull.** One strand is marked live: the highest-leverage thing you can start now, with the smallest physical first move and how long it takes.

Each strand also carries a **tension** reading of 1–5 — how hard it's pulling on your attention, which is deliberately not the same as how important it is. A nagging trivial thing can be a 5, and seeing that is the point.

## Running it

No build step, no dependencies, no server.

```bash
git clone https://github.com/dhruvmadan01/tanglewire.git
cd tanglewire
open index.html        # or: python3 -m http.server 8000
```

Then open settings (top right) and paste an Anthropic API key from [console.anthropic.com](https://console.anthropic.com/settings/keys). Without a key you can still load a sample tangle to see the shape of it.

The **standing context** field in settings is worth filling in — what the company is, what stage, what you're trying to hit this quarter. It's sent with every untangle and it's the difference between generic advice and a ranking that knows what matters to you.

## Putting it online

Settings → Pages → Source: **Deploy from a branch**, branch `main`, folder `/ (root)`. It'll be live at `https://dhruvmadan01.github.io/tanglewire/` in a minute or two.

## About the API key

The browser calls the Anthropic API directly, using the `anthropic-dangerous-direct-browser-access` header. The key is stored in `localStorage` and never leaves the device except to go to Anthropic — there is no backend here to send it to.

That is fine for a personal tool. It is **not** fine the moment other people use your deployment, because the key travels with the page. When TangleWire gets its first user who isn't you, the fix is a thin proxy — a serverless function that holds the key server-side and forwards `/api/untangle` to Anthropic. The front end changes by one line: point `API_URL` in `assets/app.js` at your own endpoint and drop the key headers.

## Files

```
index.html          markup and copy
assets/style.css    tokens, patch-panel layout, light + dark
assets/app.js       state, rendering, the untangle prompt and API call
```

The prompt lives in the `SYSTEM` constant at the top of `app.js`. That prompt is most of the product — if the rankings feel wrong, edit it there rather than anywhere else.

## Not built yet

- A proxy so the key isn't client-side
- Morning re-rank on a schedule instead of a button
- Pulling the dump from somewhere real (inbox, Slack, calendar) instead of typing it
- History: what you cut, and whether cutting it cost anything

## Licence

MIT

## Launch film

`media/tanglewire-launch.mp4` — 48 seconds, the real product, voiceover. Script and the rendering pipeline that built it are not in this repo; the file is the deliverable.
