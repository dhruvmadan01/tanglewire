/* TangleWire — a chief of staff for founders.
 * Everything runs in the browser. Strands, key and context live in
 * localStorage; the only network call goes to the Anthropic API.
 */
(function () {
  "use strict";

  var API_URL = "https://api.anthropic.com/v1/messages";
  var API_VERSION = "2023-06-01";

  var KIND = {
    "load-bearing": { label: "Do these",   cls: "k-hold",  rank: 0 },
    "frayed":       { label: "Deadlines",  cls: "k-fray",  rank: 1 },
    "slack":        { label: "Can wait",   cls: "k-slack", rank: 2 },
    "cut":          { label: "Noise",      cls: "k-cut",   rank: 3 }
  };

  /* ---------- storage ---------- */

  var KEYS = {
    strands: "tanglewire.strands",
    apiKey:  "tanglewire.key",
    model:   "tanglewire.model",
    context: "tanglewire.context",
    theme:   "tanglewire.theme",
    seen:    "tanglewire.seen",
    live:    "tanglewire.live"
  };

  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* private window, blocked storage — the page still works for this session */
    }
  }

  var state = {
    strands: load(KEYS.strands, []),
    liveId:  load(KEYS.live, null),
    apiKey:  load(KEYS.apiKey, ""),
    model:   load(KEYS.model, "claude-sonnet-5-5"),
    context: load(KEYS.context, ""),
    seen:    load(KEYS.seen, false),
    busy:    false
  };

  function persist() {
    save(KEYS.strands, state.strands);
    save(KEYS.live, state.liveId);
  }

  /* ---------- helpers ---------- */

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function uid() {
    return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function clamp(n, lo, hi) {
    n = Math.round(Number(n));
    if (!isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3400);
  }

  function openStrands() {
    return state.strands.filter(function (s) { return s.status !== "pulled"; });
  }

  function byId(id) {
    for (var i = 0; i < state.strands.length; i++) {
      if (state.strands[i].id === id) return state.strands[i];
    }
    return null;
  }

  /* ---------- the wire strip ----------
   * Seven wires across the top. Knotted when the board is empty,
   * writhing while Claude reads the dump, combed straight with one
   * live wire picked out once it comes back.
   */

  var Wires = (function () {
    var cv, ctx, raf = null, w = 0, h = 0, running = false;
    var N = 7, seeds = [], col = {};
    var prog = 0, target = 0, speed = 1, targetSpeed = 1, liveLane = 3;
    var reduce = false, lastMode = null;

    for (var i = 0; i < N; i++) {
      seeds.push({
        f1: 0.7 + Math.random() * 1.5,
        f2: 1.6 + Math.random() * 2.2,
        p1: Math.random() * Math.PI * 2,
        p2: Math.random() * Math.PI * 2,
        amp: 0.55 + Math.random() * 0.5,
        sp: 0.16 + Math.random() * 0.2
      });
    }

    function readColors() {
      var cs = getComputedStyle(document.documentElement);
      function v(name, fallback) {
        return (cs.getPropertyValue(name) || fallback).trim();
      }
      var green = v("--green", "#0B7554");
      var slate = v("--slate", "#44607A");
      var gold = v("--gold", "#9C6100");
      col.live = v("--hot", "#DC4A1E");
      col.pal = [green, slate, gold, green, slate, gold, v("--muted", "#5C6862")];
    }

    function resize() {
      if (!cv) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var r = cv.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (reduce) frame(0);
    }

    function frame(now) {
      if (!ctx) return;
      var t = now / 1000;

      if (reduce) { prog = target; speed = 0; }
      else {
        prog += (target - prog) * 0.055;
        speed += (targetSpeed - speed) * 0.05;
      }

      ctx.clearRect(0, 0, w, h);
      var pad = 13;
      var span = Math.max(10, h - pad * 2);

      for (var i = 0; i < N; i++) {
        var s = seeds[i];
        var lane = pad + span * ((i + 0.5) / N);
        var amp = (1 - prog) * s.amp * (span * 0.46);
        var lit = prog > 0.55 && i === liveLane;

        ctx.beginPath();
        for (var x = -12; x <= w + 12; x += 5) {
          var u = x / (w || 1);
          var y = lane +
            amp * Math.sin(u * s.f1 * Math.PI * 2 + s.p1 + t * s.sp * speed) +
            amp * 0.55 * Math.sin(u * s.f2 * Math.PI * 2 + s.p2 - t * s.sp * 0.7 * speed) +
            prog * 2.4 * Math.sin(u * Math.PI * 2 + s.p1 + t * 0.22 * speed);
          if (x === -12) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = lit ? col.live : col.pal[i % col.pal.length];
        ctx.lineWidth = lit ? 2.4 : 1.3;
        ctx.globalAlpha = lit ? 1 : 0.42 + 0.3 * (1 - prog);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      if (!reduce && running) raf = requestAnimationFrame(frame);
    }

    function start() {
      if (reduce || running) return;
      running = true;
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    }

    return {
      init: function () {
        cv = $("wires");
        if (!cv || !cv.getContext) return;
        ctx = cv.getContext("2d");
        try {
          reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        } catch (e) { reduce = false; }
        readColors();
        resize();
        window.addEventListener("resize", resize);
        document.addEventListener("visibilitychange", function () {
          if (document.hidden) stop(); else start();
        });
        start();
      },
      recolor: function () { if (ctx) { readColors(); if (reduce) frame(0); } },
      mode: function (m) {
        if (!ctx || m === lastMode) return;
        lastMode = m;
        liveLane = 2 + Math.floor(Math.random() * 3);
        if (m === "working") { target = 0; targetSpeed = 5.5; }
        else if (m === "resolved") { target = 1; targetSpeed = 0.75; }
        else { target = 0; targetSpeed = 1; }
        if (reduce) frame(0);
      }
    };
  })();

  function flashIn() {
    try {
      var nodes = document.querySelectorAll(".live-card, .strand");
      for (var i = 0; i < nodes.length && i < 14; i++) {
        nodes[i].classList.add("just-in");
        nodes[i].style.animationDelay = (i * 45) + "ms";
      }
    } catch (e) { /* decoration only */ }
  }

  /* ---------- the untangle prompt ---------- */

  // the prompt lives in assets/prompt.js, shared with the server
  var SYSTEM = (typeof window !== "undefined" && window.TANGLEWIRE_SYSTEM) || "";

  function buildUserMessage(dump, existing) {
    var parts = [];
    if (state.context && state.context.trim()) {
      parts.push("Standing context on the founder and company:\n" + state.context.trim());
    }
    if (existing && existing.length) {
      parts.push(
        "Strands already on the board (re-rank these together with anything new, keep titles stable where the thing is the same):\n" +
        existing.map(function (s) {
          return "- " + s.title + " [" + s.kind + ", tension " + s.tension + "]";
        }).join("\n")
      );
    }
    parts.push("Today's dump:\n" + dump.trim());
    return parts.join("\n\n");
  }

  function extractJson(text) {
    var t = String(text || "").trim();
    var fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) t = fence[1].trim();
    var start = t.indexOf("{");
    var end = t.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) throw new Error("No JSON in the reply.");
    return JSON.parse(t.slice(start, end + 1));
  }

  function callViaProxy(dump, existing) {
    return fetch("api/untangle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dump: dump,
        context: state.context || "",
        existing: (existing || []).map(function (s) {
          return { title: s.title, kind: s.kind, tension: s.tension };
        })
      })
    }).then(function (res) {
      return res.text().then(function (body) {
        var j = null;
        try { j = JSON.parse(body); } catch (e) { /* non-JSON error page */ }
        if (!res.ok) {
          throw new Error((j && j.error) ||
            "The sorting service is unavailable right now.");
        }
        if (!j || !j.raw) throw new Error("Nothing came back. Try again.");
        return extractJson(j.raw);
      });
    });
  }

  function callDirect(dump, existing) {
    return fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": state.apiKey,
        "anthropic-version": API_VERSION,
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: state.model,
        max_tokens: 3000,
        system: SYSTEM,
        messages: [{ role: "user", content: buildUserMessage(dump, existing) }]
      })
    }).then(function (res) {
      return res.text().then(function (body) {
        if (!res.ok) {
          var msg = "Anthropic returned " + res.status + ".";
          try {
            var j = JSON.parse(body);
            if (j && j.error && j.error.message) msg = j.error.message;
          } catch (e) { /* keep the status message */ }
          if (res.status === 401) msg = "That API key was rejected. Check it in settings.";
          if (res.status === 429) msg = "Rate limited. Wait a moment and try again.";
          throw new Error(msg);
        }
        var data = JSON.parse(body);
        var text = "";
        (data.content || []).forEach(function (block) {
          if (block.type === "text") text += block.text;
        });
        return extractJson(text);
      });
    });
  }

  function callClaude(dump, existing) {
    return state.apiKey ? callDirect(dump, existing) : callViaProxy(dump, existing);
  }

  /* ---------- turning a reply into strands ---------- */

  function normalise(raw) {
    var list = (raw && raw.strands) || [];
    var out = [];
    var liveSeen = false;

    list.forEach(function (s) {
      var kind = KIND[s.kind] ? s.kind : "slack";
      var strand = {
        id: uid(),
        title: String(s.title || "Untitled strand").slice(0, 120),
        kind: kind,
        tension: clamp(s.tension, 1, 5),
        why: String(s.why || "").slice(0, 400),
        firstStep: kind === "cut" ? "" : String(s.firstStep || "").slice(0, 400),
        minutes: clamp(s.minutes, 1, 480),
        status: "open",
        example: false
      };
      if (s.live && !liveSeen && kind !== "cut") {
        strand.live = true;
        liveSeen = true;
      }
      out.push(strand);
    });

    if (!liveSeen) {
      var best = null;
      out.forEach(function (s) {
        if (s.kind === "cut") return;
        if (!best || KIND[s.kind].rank < KIND[best.kind].rank ||
           (KIND[s.kind].rank === KIND[best.kind].rank && s.tension > best.tension)) best = s;
      });
      if (best) best.live = true;
    }
    return out;
  }

  /* ---------- rendering ---------- */

  function meterHtml(n) {
    var bars = "";
    for (var i = 1; i <= 5; i++) bars += '<i class="' + (i <= n ? "on" : "") + '"></i>';
    return '<span class="meter" role="img" aria-label="Pulling at you: ' + n + ' of 5">' + bars + "</span>";
  }

  function renderLive() {
    var sec = $("live");
    var s = state.liveId ? byId(state.liveId) : null;
    if (!s || s.status === "pulled" || s.kind === "cut") {
      sec.hidden = true;
      return;
    }
    sec.hidden = false;
    $("liveBody").innerHTML =
      '<div class="live-card">' +
        "<h3>" + esc(s.title) + "</h3>" +
        (s.why ? '<p class="live-why">' + esc(s.why) + "</p>" : "") +
        (s.firstStep
          ? '<div class="live-step"><span class="lbl">First move · ' + s.minutes + " min</span><p>" + esc(s.firstStep) + "</p></div>"
          : "") +
        '<div class="live-actions">' +
          '<button type="button" class="btn btn-primary" data-act="pull" data-id="' + s.id + '">Done</button>' +
          '<button type="button" class="btn" data-act="next" data-id="' + s.id + '">Not this one</button>' +
          '<button type="button" class="btn" data-act="coil" data-id="' + s.id + '">Later</button>' +
        "</div>" +
      "</div>";
  }

  function strandHtml(s) {
    var tag = s.example ? '<span class="example-tag">Example</span>' : "";
    var actions = [];
    if (s.kind === "cut") {
      actions.push('<button type="button" class="chip chip-go" data-act="restore" data-id="' + s.id + '">Put it back</button>');
      actions.push('<button type="button" class="chip" data-act="delete" data-id="' + s.id + '">Delete</button>');
    } else {
      if (s.id !== state.liveId) {
        actions.push('<button type="button" class="chip chip-go" data-act="live" data-id="' + s.id + '">Do this first</button>');
      }
      actions.push('<button type="button" class="chip" data-act="pull" data-id="' + s.id + '">Done</button>');
      actions.push('<button type="button" class="chip chip-cut" data-act="cut" data-id="' + s.id + '">Cut</button>');
    }

    return '<article class="strand">' +
      tag +
      '<div class="strand-top"><h4>' + esc(s.title) + "</h4>" + meterHtml(s.tension) + "</div>" +
      (s.why ? "<p>" + esc(s.why) + "</p>" : "") +
      (s.firstStep
        ? '<div class="step">' + esc(s.firstStep) + '<span class="mins">' + s.minutes + " min to start</span></div>"
        : "") +
      '<div class="strand-actions">' + actions.join("") + "</div>" +
    "</article>";
  }

  function emptyHtml() {
    return '<div class="empty">' +
      "<p>Nothing here yet. Put everything that's on you into the box above and hit " +
      "<strong>Untangle</strong>. You get back one thing to start now, the rest sorted by " +
      "what actually matters, and a pile of what doesn't.</p>" +
      '<div class="empty-actions">' +
        '<button type="button" class="btn" data-act="sample">Show me an example</button>' +
      "</div>" +
    "</div>";
  }

  function renderBundle() {
    var open = openStrands();
    var body = $("bundleBody");
    var count = $("bundleCount");

    if (!open.length) {
      body.innerHTML = emptyHtml();
      count.textContent = "";
      return;
    }

    var live = open.filter(function (s) { return s.kind !== "cut"; }).length;
    var cut = open.length - live;
    count.textContent = live + " to deal with" + (cut ? " · " + cut + " noise" : "");

    var order = ["load-bearing", "frayed", "slack", "cut"];
    var html = "";

    order.forEach(function (kind) {
      var group = open.filter(function (s) { return s.kind === kind; });
      if (!group.length) return;
      group.sort(function (a, b) { return b.tension - a.tension; });
      html += '<section class="group ' + KIND[kind].cls + '">' +
        '<div class="group-hd"><span>' + KIND[kind].label + '</span><span class="rule"></span>' +
        '<span class="n">' + group.length + "</span></div>" +
        group.map(strandHtml).join("") +
      "</section>";
    });

    html += '<div class="dump-row"><button type="button" class="btn btn-quiet" data-act="rerank">Re-sort everything</button></div>';
    body.innerHTML = html;
  }

  function renderPulled() {
    var done = state.strands.filter(function (s) { return s.status === "pulled"; });
    var sec = $("pulled");
    if (!done.length) { sec.hidden = true; return; }
    sec.hidden = false;
    $("pulledBody").innerHTML =
      "<ul>" + done.slice().reverse().map(function (s) {
        return '<li><span class="tick">&times;</span><span class="t">' + esc(s.title) + "</span>" +
               '<button type="button" class="chip" data-act="restore" data-id="' + s.id + '">Undo</button></li>';
      }).join("") + "</ul>";
  }

  function setWireLabel(txt) {
    var el = $("wireLabel");
    if (el) el.textContent = txt;
  }

  function syncWires() {
    var open = openStrands().filter(function (s) { return s.kind !== "cut"; });
    if (open.length) {
      Wires.mode("resolved");
      setWireLabel(open.length + " thing" + (open.length === 1 ? "" : "s") +
        (state.liveId ? " · 1 to start now" : ""));
    } else {
      Wires.mode("tangled");
      setWireLabel("Nothing here yet");
    }
  }

  function hasRealStrands() {
    return state.strands.some(function (s) { return !s.example; });
  }

  function showingExample() {
    return openStrands().some(function (s) { return s.example; });
  }

  function renderIntro() {
    var first = !state.seen && !hasRealStrands() && openStrands().length === 0;
    $("intro").hidden = !first;
    $("steps").hidden = !first;
    $("exampleBar").hidden = !showingExample();
    $("exampleBtn").hidden = openStrands().length > 0;
    return first;
  }

  function render() {
    var first = renderIntro();
    renderLive();
    renderBundle();
    renderPulled();
    // on a cold visit the board is empty, so its empty state would just
    // repeat what the intro already says
    $("bundle").hidden = first;
    if (!state.busy) syncWires();
  }

  /* ---------- actions ---------- */

  function setLive(id) {
    state.strands.forEach(function (s) { s.live = (s.id === id); });
    state.liveId = id;
  }

  function pickNextLive(skipId) {
    var open = openStrands().filter(function (s) {
      return s.kind !== "cut" && s.id !== skipId;
    });
    open.sort(function (a, b) {
      var d = KIND[a.kind].rank - KIND[b.kind].rank;
      return d !== 0 ? d : b.tension - a.tension;
    });
    setLive(open.length ? open[0].id : null);
  }

  function handleAction(act, id) {
    var s = id ? byId(id) : null;

    if (act === "sample") { loadSample(); return; }
    if (act === "rerank") { rerank(); return; }
    if (act === "clearexample") {
      state.strands = state.strands.filter(function (x) { return !x.example; });
      if (!byId(state.liveId)) state.liveId = null;
      persist();
      render();
      note("Your turn. What's on you?");
      $("dumpText").focus();
      return;
    }
    if (!s) return;

    if (act === "pull") {
      s.status = "pulled";
      if (state.liveId === s.id) pickNextLive(s.id);
      toast("Done: " + s.title);
    } else if (act === "cut") {
      s.kind = "cut";
      s.firstStep = "";
      if (state.liveId === s.id) pickNextLive(s.id);
      toast("Gone. One less thing on you.");
    } else if (act === "coil") {
      s.kind = "slack";
      if (state.liveId === s.id) pickNextLive(s.id);
      toast("Parked. It'll keep.");
    } else if (act === "live") {
      setLive(s.id);
    } else if (act === "next") {
      pickNextLive(s.id);
    } else if (act === "restore") {
      s.status = "open";
      if (s.kind === "cut") s.kind = "slack";
      if (!state.liveId) setLive(s.id);
    } else if (act === "delete") {
      state.strands = state.strands.filter(function (x) { return x.id !== id; });
      if (state.liveId === id) pickNextLive(id);
    }

    persist();
    render();
  }

  /* ---------- untangle ---------- */

  function setBusy(on, label) {
    state.busy = on;
    var btn = $("untangleBtn");
    btn.disabled = on;
    btn.textContent = on ? (label || "Untangling…") : "Untangle";
  }

  function note(msg, bad) {
    var el = $("dumpNote");
    el.textContent = msg || "";
    el.className = "note" + (bad ? " bad" : "");
  }

  var LOADING = [
    "Reading it all…",
    "Pulling the pieces apart…",
    "Working out what actually matters…",
    "Spotting what's just noise…",
    "Picking the one to start with…"
  ];

  var loadTimer = null;

  function startLoading() {
    var i = 0;
    note(LOADING[0]);
    clearInterval(loadTimer);
    loadTimer = setInterval(function () {
      i = (i + 1) % LOADING.length;
      note(LOADING[i]);
    }, 1700);
  }

  function stopLoading() { clearInterval(loadTimer); loadTimer = null; }

  function untangle() {
    if (state.busy) return;
    var text = $("dumpText").value.trim();
    if (!text) { note("Put something in the box first.", true); $("dumpText").focus(); return; }

    setBusy(true);
    startLoading();
    Wires.mode("working");
    setWireLabel("Sorting…");

    var existing = openStrands().filter(function (s) { return !s.example && s.kind !== "cut"; });

    callClaude(text, existing).then(function (raw) {
      var fresh = normalise(raw);
      if (!fresh.length) throw new Error("Nothing came back. Try again with a bit more detail.");

      // the reply re-ranks everything, so the old open board is replaced
      var pulled = state.strands.filter(function (s) { return s.status === "pulled"; });
      state.strands = pulled.concat(fresh);

      var live = fresh.filter(function (s) { return s.live; })[0];
      state.liveId = live ? live.id : null;

      $("dumpText").value = "";
      state.busy = false;
      state.seen = true;
      save(KEYS.seen, true);
      stopLoading();
      persist();
      render();
      flashIn();
      var cut = fresh.filter(function (s) { return s.kind === "cut"; }).length;
      note(fresh.length + " things, one to start now" + (cut ? ", " + cut + " you can drop" : "") + ".");
      $("live").scrollIntoView({ behavior: "smooth", block: "start" });
    }).catch(function (err) {
      stopLoading();
      var msg = err && err.message ? err.message : "Something went wrong.";
      if (/Failed to fetch|NetworkError/i.test(msg)) {
        msg = state.apiKey
          ? "Couldn't reach Anthropic. Check the connection and the key."
          : "Couldn't reach the server. If you opened this file directly, add your own API key in settings.";
      }
      note(msg, true);
    }).then(function () {
      setBusy(false);
      stopLoading();
      syncWires();
    });
  }

  function rerank() {
    var open = openStrands().filter(function (s) { return s.kind !== "cut"; });
    if (!open.length) return;
    var dump = "Nothing new has come in. Re-rank what is already on the board as it stands today, " +
      "cutting anything that no longer earns its place:\n" +
      open.map(function (s) {
        return "- " + s.title + (s.why ? " — " + s.why : "");
      }).join("\n");

    setBusy(true, "Re-sorting…");
    startLoading();
    Wires.mode("working");
    setWireLabel("Re-sorting…");

    callClaude(dump, []).then(function (raw) {
      var fresh = normalise(raw);
      if (!fresh.length) throw new Error("Nothing came back.");
      var pulled = state.strands.filter(function (s) { return s.status === "pulled"; });
      state.strands = pulled.concat(fresh);
      var live = fresh.filter(function (s) { return s.live; })[0];
      state.liveId = live ? live.id : null;
      state.busy = false;
      stopLoading();
      persist();
      render();
      flashIn();
      note("Re-sorted.");
    }).catch(function (err) {
      stopLoading();
      note(err && err.message ? err.message : "Re-rank failed.", true);
    }).then(function () {
      setBusy(false);
      stopLoading();
      syncWires();
    });
  }

  /* ---------- sample ---------- */

  var SAMPLE = [
    { title: "Close the two signed pilots", kind: "load-bearing", tension: 4,
      why: "Both are verbally in and neither has a contract. Until they sign you have no revenue story for the raise.",
      firstStep: "Send both the same one-page agreement today, unchanged, with a Friday date on it.", minutes: 25 },
    { title: "Hire the second engineer", kind: "load-bearing", tension: 3,
      why: "You are the bottleneck on every ship. Every week without a second pair of hands costs a release.",
      firstStep: "Write the role in four lines and post it in the two Slack groups you already belong to.", minutes: 20 },
    { title: "Investor update is nine days late", kind: "frayed", tension: 5,
      why: "Three people are waiting and the silence is being read as bad news.",
      firstStep: "Open a blank email, write the three numbers and one ask, send without editing.", minutes: 15 },
    { title: "Reply to the accelerator", kind: "frayed", tension: 4,
      why: "Their deadline is Thursday and the form takes twenty minutes.",
      firstStep: "Open the form and fill only the company description field.", minutes: 20 },
    { title: "Redo the website copy", kind: "slack", tension: 2,
      why: "Nobody has bounced because of the copy. It can wait until the pilots sign.",
      firstStep: "Park it. Revisit after the two contracts are back.", minutes: 5 },
    { title: "Rebuild the pitch deck template", kind: "cut", tension: 4,
      why: "This is the thing you do when you don't want to send the investor update. The deck is fine.", minutes: 0 }
  ];

  function loadSample() {
    var pulled = state.strands.filter(function (s) { return s.status === "pulled"; });
    var fresh = SAMPLE.map(function (s, i) {
      return {
        id: uid(),
        title: s.title, kind: s.kind, tension: s.tension, why: s.why,
        firstStep: s.firstStep || "", minutes: s.minutes,
        status: "open", example: true, live: i === 2
      };
    });
    state.strands = pulled.concat(fresh);
    state.liveId = fresh[2].id;
    persist();
    render();
    flashIn();
    note("That's an example. Add your key to do a real one.");
  }

  /* ---------- theme ---------- */

  function applyTheme(mode) {
    if (mode === "dark" || mode === "light") {
      document.documentElement.setAttribute("data-theme", mode);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }

  function cycleTheme() {
    var cur = load(KEYS.theme, "system");
    var next = cur === "system" ? "dark" : cur === "dark" ? "light" : "system";
    save(KEYS.theme, next);
    applyTheme(next);
    Wires.recolor();
    toast("Theme: " + next);
  }

  /* ---------- wiring ---------- */

  function init() {
    applyTheme(load(KEYS.theme, "system"));
    Wires.init();

    $("apiKey").value = state.apiKey;
    $("model").value = state.model;
    $("context").value = state.context;

    $("apiKey").addEventListener("change", function () {
      state.apiKey = this.value.trim();
      save(KEYS.apiKey, state.apiKey);
      if (state.apiKey) toast("Key saved in this browser.");
    });
    $("model").addEventListener("change", function () {
      state.model = this.value;
      save(KEYS.model, state.model);
    });
    $("context").addEventListener("change", function () {
      state.context = this.value;
      save(KEYS.context, state.context);
    });

    $("settingsBtn").addEventListener("click", function () {
      var panel = $("settings");
      var open = panel.hidden;
      panel.hidden = !open;
      this.setAttribute("aria-expanded", String(open));
      if (open) $("apiKey").focus();
    });

    $("themeBtn").addEventListener("click", cycleTheme);
    $("untangleBtn").addEventListener("click", untangle);

    $("dumpText").addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); untangle(); }
    });

    $("wipeBtn").addEventListener("click", function () {
      Object.keys(KEYS).forEach(function (k) {
        try { localStorage.removeItem(KEYS[k]); } catch (e) {}
      });
      state.strands = []; state.liveId = null; state.apiKey = ""; state.context = "";
      state.seen = false;
      $("apiKey").value = ""; $("context").value = "";
      render();
      toast("Wiped. Nothing left on this device.");
    });

    document.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-act]") : null;
      if (!btn) return;
      handleAction(btn.getAttribute("data-act"), btn.getAttribute("data-id"));
    });

    note("");

    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
