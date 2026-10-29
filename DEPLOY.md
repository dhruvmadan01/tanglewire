# Putting TangleWire online

Written for someone who doesn't write code. No terminal, no commands. About ten minutes, and you can do all of it from a phone.

You need two accounts. Both are free to create; only the first one needs a card.

---

## Step 1 — get a key from Anthropic

This is the thing that pays for everyone who uses TangleWire. A "key" is just a long password that lets your site talk to Claude.

1. Go to **console.anthropic.com** and sign in.
2. **Billing → add a payment method**, and put a small amount of credit on it. Start with the minimum. You will not get through it quickly.
3. While you're on that page, **set a monthly spend limit.** Pick a number you'd be relaxed about losing — $20 is plenty to start. This is your safety net, and it matters more than anything else in this document. Nothing can cost you more than this number.
4. Go to **API keys → Create key**. Name it `tanglewire`.
5. **Copy it now.** It's shown once and never again. If you lose it, delete it and make another — no harm done.

It starts with `sk-ant-`. Treat it like a password: don't paste it into a chat, a doc, or a screenshot.

---

## Step 2 — put the site online

1. Go to **vercel.com/new** and sign in **with GitHub**. Same account the code is in.
2. You'll see a list of your repositories. Find **tanglewire** and press **Import**.
3. Leave every setting alone. Framework, build command, output directory — all of it. The defaults are correct.
4. Find the **Environment Variables** section and open it. Two boxes:
   - Name: `ANTHROPIC_API_KEY` — exactly that, capitals and underscores included
   - Value: the key you copied in step 1
   
   Press **Add**.
5. Press **Deploy** and wait. A minute, maybe two.

You'll get a URL like `tanglewire.vercel.app`. Open it on your phone and try it — type a real mess into the box and press Untangle. If something comes back, you're live.

---

## Step 3 — when people actually start using it

Skip this until you have real traffic. Right now your Anthropic spend limit is doing the protecting, and that's fine.

Once people are using it, the free allowance needs a proper counter so one person can't use everyone's:

1. In your Vercel project, open the **Storage** tab.
2. **Create Database → Upstash → Redis**. Free tier.
3. Connect it to the project. Vercel fills in the settings itself; you don't type anything.
4. Open the **Deployments** tab and **Redeploy** the latest one.

---

## What it costs you

Visitors get **6 untangles a day each**, with **600 a day across everyone**, running on Claude Haiku — the cheap, fast model. Anyone who wants more is asked to add their own key, which costs you nothing and is also the easiest moment to convert someone who's already felt it work.

To change those numbers: Vercel project → Settings → Environment Variables → add `TW_PER_VISITOR_PER_DAY` or `TW_GLOBAL_PER_DAY` with the number you want, then redeploy.

---

## If something goes wrong

**"This deployment has no API key configured yet"** — the environment variable name is wrong, or you added it after deploying. Check the spelling, then redeploy from the Deployments tab. Adding a variable does not update the live site by itself.

**"That API key was rejected"** — the key is wrong, or there's no credit on the Anthropic account.

**"The sorting service is having a problem"** — usually no credit left, or the spend limit was reached. Check the Anthropic console.

**The site loads but Untangle does nothing** — you're probably opening `index.html` from your own computer rather than the Vercel URL. There's no server there. Use the `.vercel.app` address.

---

## Afterwards

The old GitHub Pages address still works but has no server behind it, so Untangle will fail there. Turn it off (repo Settings → Pages → Source → None) so nobody finds the broken one, and send people the Vercel URL instead.
