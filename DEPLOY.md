# Putting TangleWire online

Written for someone who doesn't write code. No terminal, no commands, **no credit card.** About ten minutes, and you can do all of it from a phone.

---

## Step 1 — get a free key from Google

TangleWire needs a model to do the sorting. Google's Gemini has a genuinely free tier — no payment details, no trial that expires. It's the right place to start.

1. Go to **aistudio.google.com/apikey** and sign in with a Google account.
2. Press **Create API key**. If it asks for a project, let it make one.
3. **Copy the key.** It's a long string of letters and numbers.

That's it. There's no billing page to get through, and nothing can charge you.

The free tier has a daily cap. If TangleWire gets popular enough to hit it, people see a "busy right now, try again" message — nothing breaks and nothing bills you. That's the moment to think about paying for capacity, not before.

---

## Step 2 — put the site online

1. Go to **vercel.com/new** and sign in **with GitHub**. Same account the code is in.
2. You'll see a list of your repositories. Find **tanglewire** and press **Import**.
3. Leave every setting alone. Framework, build command, output directory — the defaults are correct.
4. Find the **Environment Variables** section and open it. Two boxes:
   - Name: `GEMINI_API_KEY` — exactly that, capitals and underscores included
   - Value: the key you copied in step 1
   
   Press **Add**.
5. Press **Deploy** and wait a minute or two.

You'll get a URL like `tanglewire.vercel.app`. Open it on your phone and try it — type a real mess into the box and press Untangle. If something sensible comes back, you're live.

---

## Later: switching to Claude

Gemini is free and good enough to launch on. Claude is better at the specific thing TangleWire does — being willing to tell someone their work is noise — and once people are actually using this, the quality of that call is the product.

When you want to switch:

1. **console.anthropic.com** → add a payment method, **set a monthly spend limit** (start at $20 — nothing can cost you more than that), then **API keys → Create key** and copy it.
2. In Vercel: **Settings → Environment Variables → Add**, name `ANTHROPIC_API_KEY`, paste the value.
3. Add a second variable, name `TW_PROVIDER`, value `anthropic`.
4. **Deployments → Redeploy** the latest one.

To go back to free, change `TW_PROVIDER` to `gemini` and redeploy. Both keys can sit there; only the one you name is used.

---

## Later: proper rate limiting

Skip this until people are actually using it. Right now a basic counter is doing the job and the free tier can't bill you.

Once there's traffic, so one person can't eat everyone's allowance:

1. In your Vercel project, open the **Storage** tab.
2. **Create Database → Upstash → Redis**. Free tier.
3. Connect it to the project. Vercel fills in the settings itself; you type nothing.
4. **Deployments → Redeploy.**

---

## What visitors get

**6 untangles a day each**, with **600 a day across everyone**. Anyone who wants more is asked to add their own Anthropic key in settings — that costs you nothing, their browser talks to Anthropic directly, and it's the easiest moment to convert someone who's already felt the thing work.

To change those numbers: Vercel → Settings → Environment Variables → add `TW_PER_VISITOR_PER_DAY` or `TW_GLOBAL_PER_DAY` with the number you want, then redeploy.

---

## If something goes wrong

**"This deployment has no model key configured yet"** — the variable name is spelled wrong, or you added it after deploying. Check it, then **Redeploy** from the Deployments tab. Adding a variable does not update the live site on its own.

**"This deployment's API key isn't working"** — the key is wrong, or it was deleted at the provider.

**"The free allowance is busy right now"** — you've hit Google's daily free cap. It resets; nothing is broken and nothing was charged.

**The site loads but Untangle does nothing** — you're probably opening `index.html` from your own computer instead of the Vercel URL. There's no server there. Use the `.vercel.app` address.

---

## Afterwards

The old GitHub Pages address still works but has no server behind it, so Untangle will fail there. Turn it off (repo **Settings → Pages → Source → None**) so nobody finds the broken one, and send people the Vercel URL.
