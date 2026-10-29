# Security

Plain language, because the person running this isn't an engineer.

## If a key leaks, do this first

Revoke it. Don't investigate, don't weigh it up — a revoked key is worthless to whoever has it, and making a new one takes thirty seconds.

- **Google**: aistudio.google.com/apikey → bin icon → Create API key
- **Anthropic**: console.anthropic.com → API keys → delete → Create key

Then put the new one in Vercel (Settings → Environment Variables) and **Redeploy**, or the site keeps using the dead one.

A key is leaked the moment it appears anywhere other than the provider's page and the Vercel box: a chat, a screenshot, a doc, a message to a friend, a commit. Treat all of those as public.

## What protects the key

- It lives in Vercel's environment variables, never in the code and never in the repo. Nothing in `git` has ever contained a real key.
- The browser never receives it. Visitors' requests go to `/api/untangle` on your own domain; only the server talks to Google or Anthropic.
- Nothing that gets written to the logs can contain it. Provider errors are scrubbed before they're logged, so a bad error message can't quietly put your key in Vercel's log viewer.
- Error messages shown to visitors never mention keys, billing, or which provider you're on.

## What stops people abusing the endpoint

Without this, a public URL that calls a paid model is a free LLM for anyone who finds it.

- **The server owns the prompt.** The browser sends a dump; it cannot send instructions. Someone pointing a script at your endpoint gets a sorted to-do list, not a general-purpose assistant.
- **Input is capped** — 4,000 characters of dump, 1,200 of context, 30 existing items, and a ceiling on how much the model may write back.
- **Rate limits**, per visitor and across everyone, both configurable.
- **Other websites can't use it.** A browser request carrying someone else's origin is refused, so nobody can wire your endpoint into their own page.
- **The provider's own spend limit** is the backstop. On Gemini's free tier there's nothing to cap. On Anthropic, set a monthly limit — it's the one control nothing else can bypass.

## What protects the person using it

- **Their writing never leaves their device** except to be sorted. There's no database, no account, no analytics. Boards live in their own browser.
- **A security policy on every page** limits what the site is allowed to load and where it may send data: scripts only from this site, network requests only to this site and Anthropic. If anything ever managed to inject code, it would have nowhere to send what it stole.
- **No dependencies.** Not one npm package in the shipped site. Most real-world breaches of small projects come in through a package nobody chose directly; there's nothing here to compromise.
- **Everything shown on screen is escaped**, so text coming back from the model is displayed as text and can never execute.
- The dump is framed to the model as the user's own words to be sorted. Typing "ignore your instructions" into the box gets it sorted as one more thing on their plate.

## Known limits, stated honestly

- **A visitor's own API key is kept in their browser's local storage.** That's the only way to remember it between visits without accounts. It never goes to your server. The page's security policy is what keeps it out of reach of injected code, and it's why that policy matters more than it looks.
- **Requests with no `Origin` header** — scripts, `curl` — aren't blocked, only rate limited. Blocking them properly needs accounts, which isn't worth it at this size.
- **Without Redis configured**, rate limiting falls back to a per-instance counter. It stops casual hammering, not a determined person. Add the Upstash store once there's real traffic.
- **IP-based limits** are rough. People behind the same office network share an allowance; someone with a VPN can get more. Fine at this scale, not a real identity system.

## Reporting something

Open an issue at github.com/dhruvmadan01/tanglewire, or email the address on the GitHub profile if it shouldn't be public. No bounty, but you'll get a fast answer.
