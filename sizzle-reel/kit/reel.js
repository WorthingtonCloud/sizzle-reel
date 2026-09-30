// The reel, as one HyperFrames composition. build.mjs writes index.html (the styles, the media tags, and the reel's
// data with every time already worked out) and inlines this file after the data; it turns that data into the DOM and
// ONE paused GSAP timeline.
// Everything is a pure function of time: seeded randomness, no Math.random, no Date.now, nothing async. The renderer
// seeks frames in any order across several workers, so a frame must never depend on the one before it.
//
// v19, the motion pass: same story, words, cut points and music as v18; the picture moves. A camera rig that punches
// on the drum hits, scenes built in 3D, segments that hand off to each other (carousel, flip, fly-through, drop), a
// collage that assembles as a 3D wall and collapses into the red point, and one emphasis move per key word.
// Words still hold as long as they did: all the extra motion is on the picture, never on reading time.
//
// Scenes are drawn in a 1080-wide design space (content in y 100..1300, centered on 540,700), then fitted: high up
// on a vertical video (titles live below), on the right of a widescreen one (titles live on the left).
(() => {
  const R = window.REEL, [W, H] = R.size, LAND = W > H, P = R.palette, B = R.beat, END = R.end;
  const FIN = { grain: 0.07, vignette: true, texture: "dots", ...(R.finish || {}) };
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const NS = "http://www.w3.org/2000/svg";
  const svg = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const div = (cls, parent, html = "", style = "") => { const d = document.createElement("div"); d.className = cls; if (html) d.innerHTML = html; if (style) d.style.cssText = style; parent.appendChild(d); return d; };
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const easeInOut = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  const tl = gsap.timeline({ paused: true });
  const ticks = [];  // per-frame work: (t) => void
  const IR = { immediateRender: false };  // later tweens must not paint their start state at load
  const TP = { transformPerspective: 1800 };
  const camrig = $("#camrig"), fx = $("#fx");

  // ───────── tilt tracks: every 3D turn a page gets is also written down here, so its reflection can be worked out
  // from the time alone (reading the live transform mid-render lags a frame, and the renderer seeks out of order)
  const TRK = new Map();
  function tw3(el, from, to, t0) {
    tl.fromTo(el, from, to, t0);
    const e = gsap.parseEase(to.ease || "power1.out"), ir = to.immediateRender !== false, m = TRK.get(el) || {};
    for (const p of ["rotationX", "rotationY"]) if (p in from || p in to) {
      (m[p] = m[p] || []).push({ t0, d: to.duration || 0.5, e, a: from[p] ?? 0, b: to[p] ?? 0, ir });
      m[p].sort((x, y) => x.t0 - y.t0);
    }
    TRK.set(el, m);
  }
  const tilt = (el, p, t) => {
    const L = TRK.get(el)?.[p]; if (!L) return 0;
    let v = L[0].ir ? L[0].a : 0;
    for (const s of L) { if (t < s.t0) break; v = s.a + (s.b - s.a) * s.e(clamp((t - s.t0) / s.d)); }
    return v;
  };

  // ───────── camera: a punch is a quick push-in that settles, on a drum hit. Words live outside the rig and never shake ─────────
  const punch = (t, a = 0.03, rot = 0) =>
    tl.fromTo(camrig, { scale: 1 + a, rotation: rot }, { scale: 1, rotation: 0, duration: 0.55, ease: "power3.out", ...IR }, t);

  // a shockwave ring at a screen point
  function shock(t0, x, y, r1 = 260, dur = 0.7, w = 5) {
    const c = svg("circle", { cx: x, cy: y, r: 1, fill: "none", stroke: P.accent, "stroke-width": w, opacity: 0 }, fx);
    ticks.push((t) => {
      const p = (t - t0) / dur;
      if (p < 0 || p > 1) { c.setAttribute("opacity", 0); return; }
      c.setAttribute("r", 4 + easeOut(p) * r1); c.setAttribute("opacity", (1 - p) * 0.9); c.setAttribute("stroke-width", w * (1 - 0.7 * p));
    });
  }

  // a spark: a red head trailing a tail, from a to b along a gentle arc; a small burst where it lands
  function spark(t0, a, b, dur = 0.3, bend = 0.22) {
    const tail = svg("path", { fill: "none", stroke: P.accent, "stroke-width": 6, "stroke-linecap": "round", opacity: 0 }, fx);
    const head = svg("circle", { r: 10, fill: P.accent, opacity: 0 }, fx);
    const mx = (a.x + b.x) / 2 - (b.y - a.y) * bend, my = (a.y + b.y) / 2 + (b.x - a.x) * bend;
    const at = (p) => ({ x: (1 - p) * (1 - p) * a.x + 2 * (1 - p) * p * mx + p * p * b.x, y: (1 - p) * (1 - p) * a.y + 2 * (1 - p) * p * my + p * p * b.y });
    ticks.push((t) => {
      const p = (t - t0) / dur;
      if (p < 0 || p > 1.4) { tail.setAttribute("opacity", 0); head.setAttribute("opacity", 0); return; }
      const ph = easeInOut(Math.min(p, 1)), pt = easeInOut(clamp((p - 0.4) / 1.0));
      let d = ""; for (let k = 0; k <= 14; k++) { const q = at(pt + (ph - pt) * k / 14); d += `${k ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`; }
      tail.setAttribute("d", d); tail.setAttribute("opacity", 0.9);
      const h = at(ph); head.setAttribute("cx", h.x); head.setAttribute("cy", h.y); head.setAttribute("opacity", p < 1 ? 1 : 0);
    });
    shock(t0 + dur, b.x, b.y, 90, 0.4, 4);
  }

  // ───────── the phone safe zone (vertical): words stay in x 11–89%, y 10–84%, and x ≤ 80% below 62% height ─────────
  const fitStage = (center) => {
    if (!LAND) { const s = Math.min(W / 1080, 0.64 * H / 1200); return { s, x: W / 2 - 540 * s, y: (center ? H / 2 : H * 0.35) - 700 * s }; }
    const s = center ? 0.92 * H / 1200 : Math.min(0.52 * W / 1080, 0.92 * H / 1200);
    return { s, x: (center ? W / 2 : W * 0.72) - 540 * s, y: H / 2 - 700 * s };
  };
  const toScreen = (f, x, y) => ({ x: f.x + x * f.s, y: f.y + y * f.s });

  // ───────── titles: "a<br>b" lines, <span class=a> = accent color, <span class=apart> = letters that drift apart ─────────
  function words(html, chars) {
    const box = document.createElement("div"); box.innerHTML = html; const out = [];
    const inner = (w) => chars ? [...w].map((c) => `<span class="ch">${c}</span>`).join("") : w;
    const push = (text, cls) => text.split(/(\s+)/).forEach((w) => { if (!w) return; out.push(/^\s+$/.test(w) ? " " : `<span class="w ${cls}">${inner(w)}</span>`); });
    box.childNodes.forEach((n) => n.nodeType === 3 ? push(n.textContent, "") : n.classList.contains("apart")
      ? out.push(`<span class="w apart ${n.classList.contains("a") ? "a" : ""}">${[...n.textContent].map((c) => `<span class="ch">${c}</span>`).join("")}</span>`)
      : push(n.textContent, n.className));
    return out.join("");
  }
  const lines = (text, chars) => text.split(/<br\s*\/?>/i).map((ln) => `<span class="line">${words(ln, chars)}</span>`).join("");
  const MASK = "inset(-60% -40% -14% -40%)";  // a line's own box, a little generous: words rise into it from below

  // one emphasis move on a title's key word, timed on the beat ("b" = beats after the title's slot starts).
  // Everything hangs off the word itself and is sized in em, never measured: the font can finish loading after this
  // runs, so a width read now is the fallback font's (v19: the marker came up short, the check mark sat on the text).
  const span = (cls, parent) => { const e = document.createElement("span"); e.className = cls; parent.appendChild(e); return e; };
  function emphasize(t, el, slotT0) {
    const em = typeof t.em === "string" ? { fx: t.em } : t.em; if (!em) return [];
    const ws = em.word ? $$(".w", el).filter((w) => w.textContent.trim() === em.word) : $$(".w.a", el);
    if (!ws.length) return [];
    const te = slotT0 + (em.b ?? 1) * B, made = [], w0 = ws[0], wl = ws[ws.length - 1];
    if (em.fx === "pulse") {
      const col = getComputedStyle(w0).color;
      // grows away from the word before it (the key word ends its line), so it never bumps into its neighbor
      tl.fromTo(ws, { scale: 1, color: col, transformOrigin: "0% 70%" }, { scale: 1.08, color: P.ink, duration: 0.14, ease: "power2.out", yoyo: true, repeat: 1, ...IR }, te);
    } else if (em.fx === "box") {  // a red marker wipes in behind the word (its own background); the word turns white on it
      const col = getComputedStyle(w0).color;
      ws.forEach((w) => w.classList.add("em-mark"));
      tl.fromTo(ws, { backgroundSize: "0% 100%" }, { backgroundSize: "100% 100%", duration: 0.34, ease: "power3.inOut", ...IR }, te);
      tl.fromTo(ws, { color: col }, { color: P.ink, duration: 0.12, ...IR }, te + 0.14);
    } else if (em.fx === "check") {  // a check mark draws itself just past the word
      wl.classList.add("em-anchor");
      const s = svg("svg", { class: "em-check", viewBox: "0 0 10 10" }, wl);
      const p = svg("path", { d: "M1.2 5.4 L4 8.1 L8.9 1.8", fill: "none", stroke: P.accent, "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-dasharray": 13, "stroke-dashoffset": 13 }, s);
      tl.to(p, { attr: { "stroke-dashoffset": 0 }, duration: 0.3, ease: "power2.out" }, te);
      tl.fromTo(s, { scale: 1.5 }, { scale: 1, duration: 0.45, ease: "back.out(3)", transformOrigin: "30% 70%", ...IR }, te + 0.2);
      made.push(s);
    } else if (em.fx === "beats") {  // "on a schedule": four dots under the word, one lighting per beat
      w0.classList.add("em-anchor");
      const row = span("em-beats", w0), dots = [0, 1, 2, 3].map(() => span("em-dot", row));
      ticks.push((tt) => {
        const lt = tt - te;
        dots.forEach((d, k) => {
          if (lt < k * 0.06) { d.style.opacity = 0; return; }
          const n = Math.floor(lt / B), ph = lt / B - n, on = n % 4 === k;
          d.style.opacity = on ? 1 : 0.45; d.style.background = on ? P.accent : P.dim;
          d.style.transform = `scale(${(on ? 1 + 0.6 * (1 - easeOut(ph * 2)) : 1).toFixed(3)})`;
        });
      });
      made.push(row);
    } else if (em.fx === "ruler") {  // a ruler draws under the word; its marker slides and snaps onto a reading on the beat
      w0.classList.add("em-anchor");
      const box = span("em-ruler", w0), base = span("em-base", box), N = 25, at = 72;
      tl.fromTo(base, { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: "power2.inOut", ...IR }, te);
      for (let k = 0; k <= N; k++) {
        const tall = k % 5 === 0, tk = span(tall ? "em-tick tall" : "em-tick", box);
        tk.style.left = (k / N * 100).toFixed(2) + "%";
        tl.fromTo(tk, { opacity: 0 }, { opacity: 1, duration: 0.08, ...IR }, te + 0.57 * easeInOut(k / N));
      }
      // the marker rides a full-width track moved by xPercent: a transform, so it glides sub-pixel (never tween "left")
      const snapAt = slotT0 + (em.snap ?? 3) * B, trk = span("em-track", box), mk = span("em-marker", trk), hit = span("em-hit", box);
      hit.style.left = at + "%";
      tl.fromTo(mk, { opacity: 0 }, { opacity: 1, duration: 0.15, ...IR }, te + 0.55);
      tl.fromTo(trk, { xPercent: 0 }, { xPercent: at + 3, duration: snapAt - te - 0.8, ease: "power2.inOut", ...IR }, te + 0.7);
      tl.fromTo(trk, { xPercent: at + 3 }, { xPercent: at, duration: 0.3, ease: "elastic.out(1.4,0.4)", ...IR }, snapAt - 0.05);
      tl.fromTo(hit, { opacity: 0 }, { opacity: 1, duration: 0.05, ...IR }, snapAt);
      punch(snapAt, 0.03);
      made.push(box);
    }
    return made;
  }

  // ───────── scenes ─────────
  const SCENES = {
    chat(stage, seg) {
      const c = R.scenes.chat || {}, cyc = c.cycles || [{ q: "Where did we leave off?", a: "I don't have any memory of past conversations." }];
      const rig = div("rig3d", stage, "", "transform-origin:540px 670px");
      const box = div("chat", rig, `<div class="chat-h"><span class="hd">${c.header || "New session"}</span></div>
        <div class="chat-b"><div class="bub-q"></div><div class="bub-a"></div></div><div class="scan"></div>
        <div class="chat-in"><span class="caret"></span><span class="ph">${c.placeholder || "Ask anything"}</span><span class="send" data-anchor></span></div>`);
      const q = $(".bub-q", box), a = $(".bub-a", box), hd = $(".hd", box), ph = $(".ph", box), caret = $(".caret", box), body = $(".chat-b", box), scan = $(".scan", box);
      // the camera drifts around the box for the whole opening (frame one already tilted: the preview looks alive)
      tl.fromTo(rig, { rotationY: -13, rotationX: 9, ...TP }, { rotationY: 10, rotationX: 2, ...TP, duration: seg.t1 - seg.t0, ease: "sine.inOut" }, seg.t0);
      // each exchange a little shorter than the last; each new one starts by a red scan line wiping the last one away
      const wts = cyc.map((_, i) => Math.pow(0.86, i)), sum = wts.reduce((x, y) => x + y, 0), live = (seg.t1 - seg.t0) * 0.86;
      const starts = [0]; cyc.forEach((_, i) => starts.push(starts[i] + live * wts[i] / sum));
      const WIPE = 0.3, JOLT = [14, -11, 7, -4, 2, 0];
      ticks.push((t) => {
        const lt0 = t - seg.t0; if (lt0 < -0.1 || t > seg.t1 + 0.1) return;
        let i = cyc.length; for (let k = 0; k < cyc.length; k++) if (lt0 < starts[k + 1]) { i = k; break; }
        const lt = lt0 - starts[i];
        if (i > 0 && lt < WIPE) {  // erase: the old exchange is cut away under the scan line; the box jolts
          const pv = cyc[i - 1], p = easeInOut(lt / WIPE);
          q.textContent = pv.q; q.style.opacity = 1; a.textContent = pv.a; ph.style.opacity = 0; caret.style.opacity = 0;
          body.style.clipPath = `inset(${(p * 100).toFixed(1)}% 0 0 0)`;
          scan.style.opacity = 1; scan.style.top = (120 + p * 560) + "px";
          box.style.transform = `translateX(${JOLT[Math.min(Math.floor(lt * 30), JOLT.length - 1)]}px)`;
          hd.style.color = P.accent;
          return;
        }
        body.style.clipPath = "none"; scan.style.opacity = 0; box.style.transform = "none";
        const off = i > 0 ? WIPE : 0, l2 = lt - off;
        if (i < cyc.length) {
          const cy = cyc[i], L = starts[i + 1] - starts[i] - off;
          const qn = Math.round(cy.q.length * clamp((l2 - 0.08) / 0.45)), an = Math.round(cy.a.length * clamp((l2 - 0.75) / (L * 0.42)));
          q.textContent = cy.q.slice(0, qn); q.style.opacity = qn ? 1 : 0; a.textContent = cy.a.slice(0, an);
          const f = clamp(1 - l2 / 0.25); hd.style.color = f > 0 ? `rgba(229,72,77,${0.45 + 0.55 * f})` : P.dim;
          ph.style.opacity = 0; caret.style.opacity = 0;
        } else {
          q.textContent = ""; q.style.opacity = 0; a.textContent = ""; ph.style.opacity = 1; hd.style.color = P.dim;
          caret.style.opacity = Math.floor(t * 2.4) % 2 ? 0 : 1;
        }
      });
    },

    hub(stage, seg, f) {
      const c = R.scenes.hub || {}, C = { x: 540, y: 700 }, step = c.step ?? 3, tstep = c.tstep ?? 0.5;
      const rings = (c.rings || ["TIER 1", "TIER 2", "TIER 3"]).slice(0, 3), nodes = (c.nodes || []).slice(0, 8);
      const toolsAt = c.tools_at ?? rings.length * step, NR = 342;
      const rig = div("rig3d", stage);
      const s = svg("svg", { width: 1080, height: 1400, viewBox: "0 0 1080 1400", style: "overflow:visible" }, rig), g = svg("g", {}, s);
      const gSpokes = svg("g", {}, g), gRings = svg("g", {}, g), gComets = svg("g", {}, g), gLabels = svg("g", {}, g), gNodes = svg("g", {}, g);
      const at = (n) => seg.t0 + n * B;
      // the camera: a tilted close-up on the core that pulls back and swings face-on as the tiers draw
      tl.fromTo(rig, { rotationX: 58, rotationZ: -26, scale: 1.85, ...TP }, { rotationX: 0, rotationZ: 0, scale: 1, ...TP, duration: at(Math.min(toolsAt, rings.length * step)) - seg.t0, ease: "power2.inOut", ...IR }, seg.t0);
      rings.forEach((label, k) => {
        const r = 132 + 64 * k, circ = 2 * Math.PI * r, t0 = at(k * step);
        const ring = svg("circle", { cx: C.x, cy: C.y, r, fill: "none", stroke: P.line, "stroke-width": 3, "stroke-dasharray": circ, "stroke-dashoffset": circ, transform: `rotate(-90 ${C.x} ${C.y})` }, gRings);
        // short labels sitting ON their ring: a long one notches the ring above it and the circles read tall
        const lab = svg("text", { x: C.x, y: C.y - r + 7, "text-anchor": "middle", fill: P.dim, "font-weight": 700, "font-size": 19, "letter-spacing": 3, opacity: 0, "paint-order": "stroke", stroke: P.ground, "stroke-width": 12, class: "mono" }, gLabels);
        lab.textContent = label;
        tl.to(ring, { attr: { "stroke-dashoffset": 0 }, duration: 0.6, ease: "power2.inOut" }, t0);
        tl.fromTo(ring, { attr: { stroke: P.accent } }, { attr: { stroke: P.line }, duration: 0.9, ease: "power1.in", ...IR }, t0 + 0.3);
        tl.fromTo(lab, { opacity: 0 }, { opacity: 1, duration: 0.3, ...IR }, t0 + 0.35);
        // a comet runs each ring once it exists: the memory is live, each tier at its own speed
        const arc = 70, comet = svg("circle", { cx: C.x, cy: C.y, r, fill: "none", stroke: P.accent, "stroke-width": 6, "stroke-linecap": "round", "stroke-dasharray": `${arc} ${circ}`, opacity: 0 }, gComets);
        const sp = [52, -38, 27][k], tOn = t0 + 0.6;
        ticks.push((t) => {
          if (t < tOn || t > seg.t1 + 0.1) { comet.setAttribute("opacity", 0); return; }
          comet.setAttribute("opacity", 0.9 * clamp((t - tOn) / 0.3)); comet.setAttribute("transform", `rotate(${-90 + sp * (t - t0)} ${C.x} ${C.y})`);
        });
      });
      // the tools fly in from off-screen along their spokes, trailing red, and land with a squash
      const rects = [];
      nodes.forEach((label, i) => {
        const ang = (-67.5 + i * 360 / Math.max(nodes.length, 1)) * Math.PI / 180, ux = Math.cos(ang), uy = Math.sin(ang);
        const sx = C.x + 266 * ux, sy = C.y + 266 * uy, ex = C.x + (NR - 34) * ux, ey = C.y + (NR - 34) * uy;
        const len = Math.hypot(ex - sx, ey - sy);
        const sp = svg("line", { x1: sx, y1: sy, x2: ex, y2: ey, stroke: P.line, "stroke-width": 3, "stroke-dasharray": len, "stroke-dashoffset": len }, gSpokes);
        const trail = svg("line", { stroke: P.accent, "stroke-width": 5, "stroke-linecap": "round", opacity: 0 }, gNodes);
        const fly = svg("g", { opacity: 0 }, gNodes), nd = svg("g", {}, fly), w = 26 + label.length * 15.5;
        const rect = svg("rect", { x: -w / 2, y: -30, width: w, height: 60, rx: 30, fill: P.card, stroke: P.line, "stroke-width": 3 }, nd);
        svg("text", { y: 10, "text-anchor": "middle", fill: P.ink, "font-weight": 600, "font-size": 27, class: "sans" }, nd).textContent = label;
        rects.push(rect);
        const t0 = at(toolsAt + i * tstep), FL = 0.42, FAR = 1250;
        const fx0 = LAND && ux < -0.2 ? 0 : ux, fy0 = LAND && ux < -0.2 ? -1 : uy;  // widescreen: never across the words
        ticks.push((t) => {
          const p = (t - t0) / FL;
          if (p < 0 || t > seg.t1 + 0.1) { fly.setAttribute("opacity", 0); trail.setAttribute("opacity", 0); return; }
          const e = easeOut(Math.min(p, 1)), k = (FAR - NR) * (1 - e), nx = C.x + NR * ux + k * fx0, ny = C.y + NR * uy + k * fy0, tr = 40 + (1 - e) * 460;
          fly.setAttribute("transform", `translate(${nx.toFixed(1)} ${ny.toFixed(1)})`); fly.setAttribute("opacity", clamp(p * 5));
          trail.setAttribute("x1", nx + 30 * fx0); trail.setAttribute("y1", ny + 30 * fy0);
          trail.setAttribute("x2", nx + tr * fx0); trail.setAttribute("y2", ny + tr * fy0);
          trail.setAttribute("opacity", p < 1 ? 0.9 : 0);
        });
        tl.fromTo(nd, { scale: 1.3, svgOrigin: "0 0" }, { scale: 1, svgOrigin: "0 0", duration: 0.45, ease: "elastic.out(1.1,0.45)", ...IR }, t0 + FL);
        tl.fromTo(rect, { attr: { stroke: P.accent } }, { attr: { stroke: P.line }, duration: 0.6, ...IR }, t0 + FL);
        tl.to(sp, { attr: { "stroke-dashoffset": 0 }, duration: 0.25, ease: "power2.out" }, t0 + FL - 0.05);
      });
      // live traffic: once a tool is wired in, red streaks run from it through all three rings into the agent and
      // back out, ping-pong, forever. Drawn over the rings and under the core, so they vanish into it.
      const tr = svg("g", {}, g), R0 = 76, R1 = NR - 34, TAIL = 120, CYC = 1.5;
      nodes.forEach((_, i) => {
        const ang = (-67.5 + i * 360 / Math.max(nodes.length, 1)) * Math.PI / 180, ux = Math.cos(ang), uy = Math.sin(ang);
        const start = at(toolsAt + i * tstep) + 0.6;
        [0, 0.5].forEach((off) => {  // two per spoke, half a cycle apart: one heading in while the other heads out
          const tail = svg("line", { stroke: P.accent, "stroke-width": 5, "stroke-linecap": "round", opacity: 0 }, tr);
          const head = svg("circle", { r: 8, fill: P.accent, opacity: 0 }, tr);
          ticks.push((t) => {
            if (t < start || t < seg.t0 || t > seg.t1 + 0.1) { tail.setAttribute("opacity", 0); head.setAttribute("opacity", 0); return; }
            const ph = ((t - start) / CYC + off) % 1, inbound = ph < 0.5, q = easeInOut(inbound ? 1 - 2 * ph : 2 * ph - 1);
            const fade = clamp((t - start) / 0.25), rh = R0 + q * (R1 - R0), rt = clamp(rh + (inbound ? TAIL : -TAIL), R0, R1);
            head.setAttribute("cx", C.x + rh * ux); head.setAttribute("cy", C.y + rh * uy); head.setAttribute("opacity", fade);
            tail.setAttribute("x1", C.x + rh * ux); tail.setAttribute("y1", C.y + rh * uy);
            tail.setAttribute("x2", C.x + rt * ux); tail.setAttribute("y2", C.y + rt * uy); tail.setAttribute("opacity", 0.8 * fade);
          });
        });
      });
      const core = svg("g", {}, svg("g", { transform: `translate(${C.x} ${C.y})` }, g));
      svg("circle", { r: 70, fill: P.card, stroke: P.accent, "stroke-width": 5, "data-anchor": "" }, core);
      svg("text", { y: 9, "text-anchor": "middle", fill: P.ink, "font-weight": 700, "font-size": 25, "letter-spacing": 3, class: "mono" }, core).textContent = c.center || "AGENT";
      tl.fromTo(core, { scale: 0, svgOrigin: "0 0" }, { scale: 1, svgOrigin: "0 0", duration: 0.5, ease: "back.out(2)", ...IR }, seg.t0);
      // "everything": the moment the last tool lands, every tool flashes, the core kicks, the camera punches
      const tAll = at(toolsAt + nodes.length * tstep);
      if (nodes.length && tAll < seg.t1 - 0.3) {  // only if the last tool lands inside the scene (else the ring fires over the next one)
        tl.fromTo(rects, { attr: { stroke: P.accent } }, { attr: { stroke: P.line }, duration: 1.0, ease: "power1.in", stagger: 0.02, ...IR }, tAll);
        tl.fromTo(core, { scale: 1.22, svgOrigin: "0 0" }, { scale: 1, svgOrigin: "0 0", duration: 0.6, ease: "elastic.out(1,0.45)", ...IR }, tAll);
        const cs = toScreen(f, C.x, C.y); shock(tAll, cs.x, cs.y, 520, 0.8, 5);
        punch(tAll, 0.03);
      }
      tl.fromTo(g, { scale: 1, svgOrigin: `${C.x} ${C.y}` }, { scale: 1.07, svgOrigin: `${C.x} ${C.y}`, duration: seg.t1 - seg.t0, ease: "sine.inOut", ...IR }, seg.t0);
      return "own-push";
    },

    sources(stage, seg) {
      const c = R.scenes.sources || {}, cards = (c.cards || []).slice(0, 6);
      const FX = 120, FY = 260, CW = 262, GAP = 27;
      const rig = div("rig3d", stage);
      // a slow orbit around the whole board
      tl.fromTo(rig, { rotationY: -14, rotationX: 7, ...TP }, { rotationY: 10, rotationX: -3, ...TP, duration: seg.t1 - seg.t0, ease: "sine.inOut", ...IR }, seg.t0);
      // footnote markers ordered by column, so no link ever crosses another
      const MARKS = [[512, 200], [672, 150], [752, 100], [552, 200], [712, 150], [790, 100]];
      const claim = div("claim", rig, `<div class="k mono">${c.heading || "CLAIM"}</div>` +
        [[700, 90], [620, 140], [460, 190]].map(([w, y]) => `<div class="bar" style="width:${w}px;top:${y}px"></div>`).join(""));
      tl.fromTo(claim, { y: -720, rotation: -7, opacity: 0 }, { y: 0, rotation: 0, opacity: 1, duration: 0.55, ease: "back.out(1.3)", ...IR }, seg.t0 - 0.05);
      const links = svg("svg", { width: 1080, height: 1400, style: "position:absolute;left:0;top:0;overflow:visible" }, rig);  // over the card
      const marks = svg("svg", { width: 1080, height: 1400, style: "position:absolute;left:0;top:0;overflow:visible" }, rig);
      // never from below: a card crossing the title area would pass behind the words
      const FROM = LAND ? [{ x: -250, y: -1150, r: -22 }, { x: 0, y: -1250, r: 14 }, { x: 1000, y: -150, r: 26 }, { x: -150, y: 1100, r: -18 }, { x: 150, y: 1150, r: -12 }, { x: 1000, y: 350, r: 20 }]
        : [{ x: -950, y: -150, r: -28 }, { x: 0, y: -1150, r: 14 }, { x: 950, y: -150, r: 26 }, { x: -1000, y: 60, r: -18 }, { x: 120, y: -1300, r: -12 }, { x: 1000, y: 60, r: 20 }];
      const paths = [];
      let tLast = seg.t0;
      cards.forEach(({ k, t }, i) => {
        const col = i % 3, row = Math.floor(i / 3), x = FX + col * (CW + GAP), y = 640 + row * 236;
        const card = div("src", rig, `<div class="k mono">${k}</div><svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="${P.ink}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${GLYPH[k] || GLYPH.PAPER}</svg><div class="t">${t}</div>`, `left:${x}px;top:${y}px;opacity:0`);
        const [mx, my] = MARKS[i], x0 = FX + mx, y0 = FY + my, x1 = x + CW / 2;
        const p = svg("path", { d: `M${x0} ${y0} C ${x0} ${y0 + 160}, ${x1} ${y - 160}, ${x1} ${y}`, fill: "none", stroke: P.accent, "stroke-width": 3 }, links);
        const len = p.getTotalLength(); p.setAttribute("stroke-dasharray", len); p.setAttribute("stroke-dashoffset", len);
        const mk = svg("circle", { cx: x0, cy: y0, r: 9, fill: P.accent, opacity: 0 }, marks);
        const t0 = seg.t0 + 0.45 + i * B / 2, fr = FROM[i];
        paths.push({ p, len, mk, x0, y0, tOn: t0 + 0.8 });
        // each source arrives from its own side of the frame
        tl.fromTo(card, { x: fr.x, y: fr.y, rotation: fr.r, opacity: 0, scale: 0.9 }, { x: 0, y: 0, rotation: 0, opacity: 1, scale: 1, duration: 0.55, ease: "power3.out", ...IR }, t0);
        tl.fromTo(mk, { scale: 0, opacity: 1, svgOrigin: `${x0} ${y0}` }, { scale: 1, opacity: 1, svgOrigin: `${x0} ${y0}`, duration: 0.25, ease: "back.out(3)", ...IR }, t0 + 0.45);
        tl.to(p, { attr: { "stroke-dashoffset": 0 }, duration: 0.35, ease: "power2.inOut" }, t0 + 0.45);
        tLast = t0 + 0.8;
      });
      // data flows: once a link is drawn, packets run up it from the source into the claim, one after another, until
      // the scene ends; each arrival kicks the footnote mark. Big enough to read on a phone: a head, a glow and a tail
      const PER = 1.05, TL = 120;
      paths.forEach(({ p, len, mk, tOn }, i) => {
        const packets = [0, 0.5].map(() => ({
          glow: svg("circle", { r: 24, fill: P.accent, opacity: 0 }, marks),
          tail: svg("polyline", { fill: "none", stroke: P.accent, "stroke-width": 7, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0 }, marks),
          head: svg("circle", { r: 12, fill: P.accent, opacity: 0 }, marks),
        }));
        ticks.push((t) => {
          let since = 9;
          packets.forEach(({ glow, tail, head }, j) => {
            const k = (t - tOn) / PER - j * 0.5 - (i % 3) * 0.12;
            if (k < 0 || t > seg.t1 + 0.1) { glow.setAttribute("opacity", 0); tail.setAttribute("opacity", 0); head.setAttribute("opacity", 0); return; }
            if (k >= 1) since = Math.min(since, (k % 1) * PER);
            const q = k % 1, at = len * (1 - easeInOut(q)), fade = Math.min(1, q / 0.08, (1 - q) / 0.06);
            const h = p.getPointAtLength(at); let pts = "";
            for (let m = 0; m <= 6; m++) { const pt = p.getPointAtLength(Math.min(len, at + TL * m / 6)); pts += `${pt.x.toFixed(1)},${pt.y.toFixed(1)} `; }
            head.setAttribute("cx", h.x); head.setAttribute("cy", h.y); head.setAttribute("opacity", fade);
            glow.setAttribute("cx", h.x); glow.setAttribute("cy", h.y); glow.setAttribute("opacity", 0.25 * fade);
            tail.setAttribute("points", pts); tail.setAttribute("opacity", 0.75 * fade);
          });
          mk.setAttribute("r", 9 + 7 * clamp(1 - since / 0.3));
        });
      });
      const tv = paths.length ? paths[paths.length - 1].tOn + PER : seg.t0 + 2;
      tl.fromTo(claim, { borderColor: P.accent }, { borderColor: P.line, duration: 0.8, ease: "power1.in", ...IR }, tv);
    },

    endcard(stage, seg, f) {
      const c = R.scenes.endcard || {}, t0 = seg.t0, land = t0 + 2 * B;  // the point lands on the beat
      const tile = div("tileicon", stage);
      if (c.mark) {  // a drawn mark: the stroke draws, then the accent point drops and lands with a squash (the motif, home)
        const m = c.mark, s = svg("svg", { width: 240, height: 240, viewBox: m.viewBox || "-3 -3 30 30" }, tile);
        const path = svg("path", { d: m.path, fill: "none", stroke: P.ink, "stroke-width": m.stroke || 2.2, "stroke-linecap": "square" }, s);
        const len = path.getTotalLength(); path.setAttribute("stroke-dasharray", len); path.setAttribute("stroke-dashoffset", len);
        tl.to(path, { attr: { "stroke-dashoffset": 0 }, duration: 0.6, ease: "power2.inOut" }, t0 + 0.15);
        if (m.point) {
          const [px, py, pw, ph] = m.point, pt = svg("rect", { x: px, y: py, width: pw, height: ph, fill: P.accent, opacity: 0 }, s);
          tl.fromTo(pt, { attr: { y: py - 26 }, opacity: 0 }, { attr: { y: py }, opacity: 1, duration: 0.3, ease: "power3.in", ...IR }, land - 0.3);
          tl.fromTo(pt, { scaleY: 0.5, scaleX: 1.4, svgOrigin: `${px + pw / 2} ${py + ph}` }, { scaleY: 1, scaleX: 1, svgOrigin: `${px + pw / 2} ${py + ph}`, duration: 0.45, ease: "elastic.out(1.2,0.45)", ...IR }, land);
          const vb = (m.viewBox || "-3 -3 30 30").split(/\s+/).map(Number), k = 240 / vb[2];
          const sc = toScreen(f, 420 + (px + pw / 2 - vb[0]) * k, 455 + (py + ph / 2 - vb[1]) * k);
          shock(land, sc.x, sc.y, 300, 0.8, 5);
          punch(land, 0.03);
        }
      } else if (c.logo) {
        div("logo", tile, `<img src="${R.media.logo}" alt="">`);
      }
      tl.fromTo(tile, { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.32, ease: "back.out(1.8)", ...IR }, t0 - 0.05);
      const word = div("word", stage, [...(c.wordmark || "")].map((ch) => `<span class="ch">${ch === " " ? "&nbsp;" : ch}</span>`).join(""));
      const url = div("url", stage, c.url || "");
      const late = c.mark ? land - t0 + 0.1 : 0.6;  // the name arrives only after the mark has landed
      tl.set(word, { opacity: 1 }, t0 + late);
      tl.fromTo($$(".ch", word), { yPercent: 110, rotation: 6 }, { yPercent: 0, rotation: 0, duration: 0.6, ease: "expo.out", stagger: 0.045 }, t0 + late);
      tl.fromTo(url, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out", ...IR }, t0 + late + 0.4);
    },
  };
  const GLYPH = {
    PAPER: '<rect x="18" y="10" width="28" height="40" rx="3"/><path d="M25 22h14M25 30h14M25 38h9"/>',
    CODE: '<path d="M24 18L12 32l12 14M40 18l12 14-12 14"/>',
    FILING: '<rect x="10" y="16" width="44" height="32" rx="3"/><path d="M10 16l22 18 22-18"/>',
    DATA: '<ellipse cx="32" cy="16" rx="18" ry="7"/><path d="M14 16v28c0 4 8 7 18 7s18-3 18-7V16M14 30c0 4 8 7 18 7s18-3 18-7"/>',
    VIDEO: '<rect x="10" y="14" width="44" height="32" rx="8"/><path d="M28 23l10 7-10 7z"/>',
    METHOD: '<circle cx="18" cy="18" r="5"/><circle cx="46" cy="46" r="5"/><path d="M23 18h14a8 8 0 0 1 0 16H27a8 8 0 0 0 0 16h14"/>',
  };
  GLYPH.DATASET = GLYPH.DATA; GLYPH.TRANSCRIPT = GLYPH.VIDEO;

  // ───────── build every segment ─────────
  const root = $("#root"), titlesBox = $("#titles");
  const segs = R.segments.map((seg, i) => ({ ...seg, i, el: $(`#seg-${i}`) }));
  const ANCH = [];  // each segment's anchor point (its red point), measured before any tween has moved anything
  for (const seg of segs) {
    const src = seg.source, cam = $(".cam", seg.el), len = seg.t1 - seg.t0;
    let ownPush = false, push = seg.push ?? 0.04;
    if (src.scene) {
      const center = src.scene === "endcard", f = fitStage(center);
      const stage = div("stage", cam, "", `transform:translate(${f.x}px,${f.y}px) scale(${f.s})`);
      if (!SCENES[src.scene]) throw new Error(`unknown scene "${src.scene}"`);
      ownPush = SCENES[src.scene](stage, seg, f) === "own-push";
    } else if (src.card) {
      const t = R.titles[src.card], wrap = div("cardwrap", cam), card = div("card", wrap, lines(t.text, src.out === "shatter"));
      card.dataset.title = src.card;
      if (t.size) card.style.fontSize = parseFloat(getComputedStyle(card).fontSize) * t.size + "px";
      const ats = src.at || [], style = src.style || "blur", hits = new Set();
      $$(".line", card).forEach((ln, k) => {
        const b = ats[k] ?? (ats.length ? ats[ats.length - 1] : 0), t0 = seg.t0 + b * B + (ats.length ? 0 : k * 0.1);
        if (seg.i === 0 && t0 === 0) return;  // frame one is the preview: the hook is already there
        // no IR here: a later line must be hidden from load until its own beat, or it shows up with the first one
        if (style === "flap") {  // each line flips down into place like a departures board
          tl.fromTo(ln, { rotationX: -105, opacity: 0, transformOrigin: "50% 0%", transformPerspective: 900 }, { rotationX: 0, opacity: 1, transformPerspective: 900, duration: 0.6, ease: "back.out(1.7)" }, t0);
        } else if (style === "slam") {  // each line lands from over the camera's shoulder
          tl.fromTo(ln, { scale: 2.6, opacity: 0, filter: "blur(22px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.4, ease: "expo.out" }, t0);
        } else {
          tl.fromTo(ln, { scale: 1.4, opacity: 0, filter: "blur(12px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.36, ease: "expo.out" }, t0);
        }
        if (!hits.has(b)) {
          hits.add(b);
          if (src.rings) shock(t0 + 0.05, W / 2, H / 2, 300 + hits.size * 150, 0.9, 4);  // one ring per tier
          if (style === "slam") punch(t0, 0.045, hits.size % 2 ? -0.8 : 0.8);
          else if (src.rings) punch(t0, 0.02);
        }
      });
      $$(".apart", card).forEach((ap) => {
        const ch = $$(".ch", ap), mid = (ch.length - 1) / 2, t0 = seg.t0 + (ats[ats.length - 1] || 0) * B + 0.4;
        tl.fromTo(ch, { x: 0 }, { x: (k) => (k - mid) * 16, duration: Math.max(0.5, seg.t1 - t0), ease: "sine.inOut", ...IR }, t0);
      });
      if (t.em) emphasize(t, card, seg.t0);
      if (src.out === "shatter") {  // "Pull it apart": at the cut, every letter flies apart toward the camera
        const rnd = mulberry32(31), TS = seg.t1 - 0.08;
        $$(".ch", card).forEach((ch) => {
          const cx = ch.offsetLeft + ch.offsetWidth / 2 - W / 2, cy = ch.offsetTop + ch.offsetHeight / 2 - H / 2;
          const n = Math.hypot(cx, cy) || 1, dist = 700 + rnd() * 900, dx = (cx / n + (rnd() - 0.5) * 0.8) * dist, dy = (cy / n + (rnd() - 0.5) * 0.8) * dist;
          tl.fromTo(ch, { xPercent: 0, yPercent: 0, rotation: 0, scale: 1 }, { xPercent: dx / ch.offsetWidth * 100, yPercent: dy / ch.offsetHeight * 100, rotation: (rnd() - 0.5) * 420, scale: 1.8 + rnd() * 1.6, duration: 0.8, ease: "power3.out", ...IR }, TS);
          tl.fromTo(ch, { opacity: 1, filter: "blur(0px)" }, { opacity: 0, filter: "blur(6px)", duration: 0.45, ease: "power1.in", ...IR }, TS + 0.2);
        });
      }
    } else if (src.grid) {  // the collage: frames of this very reel assemble into a wall in 3D while the camera sweeps over it
      const files = R.media.tiles[seg.i], n = files.length, cols = src.cols || 3, rows = Math.ceil(n / cols);
      const tw = LAND ? 330 : 300, th = Math.round(tw * H / W), gap = 26, WW = cols * tw + (cols - 1) * gap, WH = rows * th + (rows - 1) * gap;
      cam.style.perspective = "1300px";
      const wall = div("wall", cam, "", `left:${(W - WW) / 2}px;top:${(H - WH) / 2}px;width:${WW}px;height:${WH}px`);
      const rnd = mulberry32(77), T = seg.t0;
      const scan0 = T + 1.45, scanStep = Math.min(0.07, (len - 1.6) / n);
      files.forEach((file, k) => {
        const col = k % cols, row = Math.floor(k / cols), left = col * (tw + gap), top = row * (th + gap);
        const tile = div("tile", wall, `<img src="${file}" alt="">`, `left:${left}px;top:${top}px;width:${tw}px;height:${th}px`);
        tile.dataset.dx = WW / 2 - (left + tw / 2); tile.dataset.dy = WH / 2 - (top + th / 2);
        const ang = rnd() * Math.PI * 2, dist = 520 + rnd() * 560, t0 = T - 0.06 + k * 0.07;
        // from every direction, from above the wall, spinning; they land in reading order
        tl.fromTo(tile, { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, z: 260 + rnd() * 360, rotationX: (rnd() - 0.5) * 140, rotationY: (rnd() - 0.5) * 140, rotation: (rnd() - 0.5) * 120, opacity: 0 },
          { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, rotation: 0, opacity: 1, duration: 0.62, ease: "power3.out", ...IR }, t0);
        // a red playhead runs the wall in order, one tile after another
        tl.fromTo(tile, { borderColor: P.accent, filter: "brightness(1.5)" }, { borderColor: P.line, filter: "brightness(1)", duration: 0.5, ease: "power1.in", ...IR }, scan0 + k * scanStep);
      });
      // the camera: skimming low over the wall as it assembles, then rising to face it
      const settle = T + Math.min(2.1, len - 0.3);
      const S1 = LAND ? 1.0 : 0.8, S2 = LAND ? 0.93 : 0.72;  // the wall at rest: widescreen has room for it bigger
      tl.fromTo(wall, { rotationX: 58, rotationZ: -24, scale: 1.5, y: H * 0.16 }, { rotationX: 12, rotationZ: -4, scale: S1, y: 0, duration: settle - T, ease: "power2.inOut", ...IR }, T);
      tl.fromTo(wall, { rotationX: 12, rotationZ: -4, rotationY: 0, scale: S1 }, { rotationX: 3, rotationZ: 0, rotationY: -12, scale: S2, duration: 3.2, ease: "sine.inOut", ...IR }, settle);
      ownPush = true;
    }
    // footage (shot / clip / still) was written into .cam by build.mjs: its media tags must be static HTML
    const panel = $(".panel", cam);
    if (panel) {  // a real page floats like a device: a slow 3D sway, lit by one light that stays put in the room
      const dir = seg.i % 2 ? 1 : -1, mover = $(".mover", seg.el);
      if (LAND) mover.style.transformOrigin = `${panel.offsetLeft + panel.offsetWidth / 2}px ${panel.offsetTop + panel.offsetHeight / 2}px`;
      // held at its starting angle from load: the page is on screen during the hand-off, before its own slot starts
      tw3(panel, { rotationY: 7 * dir, rotationX: 4, transformPerspective: 2200 }, { rotationY: -6 * dir, rotationX: -2, transformPerspective: 2200, duration: len, ease: "sine.inOut" }, seg.t0);
      const sh = div("sheen", panel), pw = panel.offsetWidth;
      // the glare sits where that light reflects off the glass: turn the page right and it slides left, tip it back
      // and it slides a little right. The sway, the hand-offs and the flips all move it, so it never jumps
      ticks.push((t) => {
        if (t < seg.t0 - 0.6 || t > seg.t1 + 0.8) return;
        const ry = tilt(panel, "rotationY", t) + tilt(mover, "rotationY", t), rx = tilt(panel, "rotationX", t) + tilt(mover, "rotationX", t);
        const u = 0.4 - ry / 18 + rx / 40;  // the band's center across the page, 0..1 (off either edge = out of sight)
        sh.style.transform = `translateX(${((u - 0.3) * pw).toFixed(1)}px)`;
      });
    }
    if (seg.fx?.dust) {  // dust hanging in the light: two depths, drifting up, each mote on its own seeded path
      const d = seg.fx.dust, n = d.n || 40, rnd = mulberry32(4242), layer = div("dust", cam);
      const motes = [...Array(n)].map(() => {
        const z = rnd(), m = div("mote", layer), sz = 1.5 + z * 3.2;
        m.style.cssText = `width:${sz.toFixed(1)}px;height:${sz.toFixed(1)}px;filter:blur(${((1 - z) * 2.2).toFixed(1)}px)`;
        return { m, z, x: rnd(), y: rnd(), ph: rnd() * 6.283, sp: 0.35 + rnd() * 0.65 };
      });
      ticks.push((t) => {
        if (t < seg.t0 - 0.6 || t > seg.t1 + 0.1) return;
        const lt = t - seg.t0;
        motes.forEach((o) => {
          const yy = ((o.y - lt * 0.022 * o.sp * (0.5 + o.z)) % 1 + 1) % 1, xx = o.x + Math.sin(lt * 0.7 * o.sp + o.ph) * 0.03;
          const X = (d.x[0] + xx * (d.x[1] - d.x[0])) * W, Y = (d.y[0] + yy * (d.y[1] - d.y[0])) * H;
          const edge = Math.min(1, yy / 0.15, (1 - yy) / 0.15);
          o.m.style.transform = `translate(${X.toFixed(1)}px,${Y.toFixed(1)}px)`;
          o.m.style.opacity = ((0.1 + 0.35 * o.z) * (0.65 + 0.35 * Math.sin(lt * 1.9 * o.sp + o.ph * 2)) * edge).toFixed(3);
        });
      });
    }
    if (!ownPush && push) tl.fromTo(cam, { scale: 1 }, { scale: 1 + push, duration: len, ease: "sine.inOut", ...IR }, seg.t0);
    {  // the anchor as it sits at load (scene rigs haven't moved yet; the red point is at rest)
      const a = $("[data-anchor]", seg.el), r = a && a.getBoundingClientRect();
      ANCH[seg.i] = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: W / 2, y: H / 2 };
    }

    // titles over this segment
    for (const tt of seg.titles) {
      const t = R.titles[tt.id]; if (!t) throw new Error(`title "${tt.id}" not in reel.json → titles`);
      const el = div(t.kind === "stat" ? "stat" : "lower", titlesBox);
      el.dataset.title = tt.id;
      if (t.size) el.style.fontSize = parseFloat(getComputedStyle(el).fontSize) * t.size + "px";  // one long line: shrink just this title
      if (t.kind === "stat") el.innerHTML = `<div class="num">${t.text}</div><div class="sub">${t.sub || ""}</div>`;
      else el.innerHTML = `<span class="rule"></span>${lines(t.text)}`;
      const t0 = tt.t0 + (seg.in === "fade" && tt.t0 === seg.t0 ? 0.3 : 0) + (t.spark ? 0.3 : 0);
      const ws = $$(".w", el), lns = $$(".line", el), num = $(".num", el), sub = $(".sub", el), rule = $(".rule", el);
      tl.set(el, { opacity: 1 }, t0);
      if (t0 > 0) {
        if (t.kind === "stat") {
          if (t.spark) {  // the number is fired out of the diagram: a spark from the core lands where the number slams in
            const a = ANCH[seg.i] || { x: W / 2, y: H * 0.35 }, r = num.getBoundingClientRect();
            spark(t0 - 0.3, { x: a.x, y: a.y + 40 }, { x: r.left + r.width * 0.3, y: r.top + r.height * 0.5 }, 0.3);
          }
          tl.fromTo(num, { scale: 1.6, opacity: 0, filter: "blur(16px)", transformOrigin: "0% 60%" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.5, ease: "expo.out" }, t0);
          tl.fromTo(sub, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, t0 + 0.15);
          const n = +String(t.text).replace(/,/g, "");
          if (Number.isFinite(n)) ticks.push((tt2) => { if (tt2 >= t0 - 0.2 && tt2 <= tt.t1 + 0.2) num.textContent = Math.round(n * easeOut((tt2 - t0 - 0.05) / 0.75)).toLocaleString("en-US"); });
        } else {  // words rise into place through their own line, one at a time
          tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.35, ease: "power3.out" }, t0);
          tl.set(lns, { clipPath: MASK }, t0);
          tl.fromTo(ws, { yPercent: 125, rotation: 7, opacity: 0 }, { yPercent: 0, rotation: 0, opacity: 1, duration: 0.6, ease: "expo.out", stagger: 0.07, transformOrigin: "0% 100%" }, t0);
          tl.set(lns, { clipPath: "none" }, t0 + 0.7 + 0.07 * ws.length);
        }
      }
      const made = emphasize(t, el, tt.t0);
      if (tt.t1 < END - 0.01) {  // out: words drop back out through the top of their line
        if (t.kind === "stat") {
          tl.to([num, sub], { yPercent: -35, opacity: 0, filter: "blur(8px)", duration: 0.22, ease: "power2.in", stagger: 0.04 }, tt.t1 - 0.26);
        } else {
          const te = tt.t1 - (0.24 + 0.02 * ws.length);
          tl.set(lns, { clipPath: MASK }, te);
          tl.to(ws, { yPercent: -125, duration: 0.24, ease: "power2.in", stagger: 0.02 }, te);
          tl.to(rule, { scaleX: 0, duration: 0.2, ease: "power2.in" }, te);
          if (made.length) tl.to(made, { opacity: 0, duration: 0.15 }, te - 0.15);
        }
        tl.set(el, { opacity: 0 }, tt.t1);
      }
    }
  }

  // ───────── transitions: every switch lands exactly on the grid ─────────
  const dot = $("#dot"), ring = $("#ring");
  const mv = (s) => $(".mover", s.el);
  const hitDot = (t, x, y, big = 16) => {  // the red point lands and rings out
    tl.fromTo(dot, { x: x - 28, y: y - 28, opacity: 1, scale: 2.3 }, { x: x - 28, y: y - 28, opacity: 1, scale: 0, duration: 0.34, ease: "power3.in", ...IR }, t);
    tl.fromTo(ring, { x: x - 28, y: y - 28, opacity: 1, scale: 1 }, { x: x - 28, y: y - 28, opacity: 0, scale: big, duration: 0.75, ease: "expo.out", ...IR }, t);
  };
  segs.forEach((cur, i) => {
    if (!i) return;
    const prev = segs[i - 1], T = cur.t0, kind = cur.in || "whip", d = Math.round(H * 0.09);
    const shatterOut = prev.source.out === "shatter";
    if (kind === "fade") {
      tl.to(prev.el, { opacity: 0, filter: "blur(10px)", duration: 0.22, ease: "power2.in" }, T - 0.22);
      tl.fromTo(cur.el, { opacity: 0 }, { opacity: 1, duration: 0.45, ease: "power1.out", ...IR }, T - 0.1);
      return;
    }
    if (kind === "over") {  // this card lands ON the last segment: it dims and keeps moving under the first line,
      // then collapses into the red point on the second line's beat
      tl.set(cur.el, { opacity: 1 }, T);
      const pcam = $(".cam", prev.el), hit = T + ((cur.source.at || [])[1] ?? 2) * B, tiles = $$(".tile", prev.el);
      tl.fromTo(pcam, { filter: "brightness(1) blur(0px)" }, { filter: "brightness(0.28) blur(5px)", duration: 0.35, ease: "power2.out", ...IR }, T - 0.05);
      tl.fromTo(pcam, { filter: "brightness(0.28) blur(5px)" }, { filter: "brightness(0.85) blur(0px)", duration: 0.2, ease: "power1.out", ...IR }, hit - 0.62);
      if (tiles.length) {
        const each = 0.012, dur = 0.42, s0 = hit - dur - each * (tiles.length - 1);
        tl.fromTo(tiles, { x: 0, y: 0, z: 0, scale: 1, opacity: 1, rotation: 0 },
          { x: (k, el) => +el.dataset.dx, y: (k, el) => +el.dataset.dy, z: 0, scale: 0.04, opacity: 0.2, rotation: (k) => (k % 2 ? 40 : -40), duration: dur, ease: "power3.in", stagger: { each, from: "edges" }, ...IR }, s0);
      }
      tl.set(prev.el, { opacity: 0 }, hit + 0.02);
      hitDot(hit, W / 2, H / 2, 20);
      punch(hit, 0.05);
      return;
    }
    const s0 = ["swing", "depth"].includes(kind) ? T - 0.3 : kind === "drop" ? T - 0.25 : kind === "rise" ? T - 0.12 : T;
    const hideAt = shatterOut ? T + 0.85 : kind === "swing" ? s0 + 0.62 : kind === "depth" ? s0 + 0.45 : kind === "drop" ? T + 0.3 : T;
    tl.set(cur.el, { opacity: 1 }, s0); tl.set(prev.el, { opacity: 0 }, hideAt);
    if (shatterOut) tl.set(prev.el, { zIndex: 5 }, T - 0.2);  // the flying letters pass in front of what's arriving
    if (kind === "whip") {  // out accelerates up into a blur, in decelerates out of it: one continuous move
      tl.to(prev.el, { y: -d, filter: "blur(26px)", duration: 0.2, ease: "power2.in" }, T - 0.2);
      tl.fromTo(cur.el, { y: d, filter: "blur(26px)" }, { y: 0, filter: "blur(0px)", duration: 0.5, ease: "power3.out", ...IR }, T);
    } else if (kind === "whipx") {  // the same, sideways
      tl.to(prev.el, { x: -2 * d, filter: "blur(26px)", duration: 0.2, ease: "power2.in" }, T - 0.2);
      tl.fromTo(cur.el, { x: 2 * d, filter: "blur(26px)" }, { x: 0, filter: "blur(0px)", duration: 0.5, ease: "power3.out", ...IR }, T);
    } else if (kind === "zoom") {  // the camera dollies through the outgoing frame
      tl.to(prev.el, { scale: 5, opacity: 0, filter: "blur(14px)", transformOrigin: "50% 50%", duration: 0.32, ease: "power2.in" }, T - 0.32);
    } else if (kind === "flash") {
      tl.fromTo(cur.el, { filter: "brightness(3.2)" }, { filter: "brightness(1)", duration: 0.35, ease: "power2.out", ...IR }, T);
    } else if (kind === "rise") {  // the outgoing scene whips up and away; the page swings up into view like a phone raised to the eye
      tl.to(prev.el, { y: -d, filter: "blur(26px)", duration: 0.2, ease: "power2.in" }, T - 0.2);
      tw3(mv(cur), { y: H * 0.5, rotationX: 58, scale: 0.85, ...(LAND ? {} : { transformOrigin: "50% 70%" }), ...TP }, { y: 0, rotationX: 0, scale: 1, ...TP, duration: 0.7, ease: "power4.out", ...IR }, T - 0.12);
      punch(T + 0.1, 0.02);
    } else if (kind === "swing") {  // a carousel: both pages travel together, curving away as they go
      tw3(mv(prev), { x: 0, rotationY: 0, ...TP }, { x: -W * 1.02, rotationY: 50, ...TP, duration: 0.62, ease: "power3.inOut", ...IR }, s0);
      tw3(mv(cur), { x: W * 1.02, rotationY: -50, ...TP }, { x: 0, rotationY: 0, ...TP, duration: 0.62, ease: "power3.inOut", ...IR }, s0);
    } else if (kind === "depth") {  // the outgoing page flies past the camera; the next rushes in from far away
      tl.set(prev.el, { zIndex: 5 }, s0);
      tw3(mv(prev), { z: 0, rotationY: 0, opacity: 1, filter: "blur(0px)", ...TP }, { z: 1000, rotationY: -14, opacity: 0, filter: "blur(14px)", ...TP, duration: 0.45, ease: "power2.in", ...IR }, s0);
      tw3(mv(cur), { z: -2800, x: W * 0.4, y: -H * 0.12, rotationY: 30, opacity: 0, ...TP }, { z: 0, x: 0, y: 0, rotationY: 0, opacity: 1, ...TP, duration: 0.7, ease: "power3.out", ...IR }, s0);
    } else if (kind === "flip") {  // turned over like a card
      tw3(mv(prev), { rotationY: 0, ...TP }, { rotationY: -90, ...TP, duration: 0.26, ease: "power2.in", ...IR }, T - 0.26);
      tw3(mv(cur), { rotationY: 90, ...TP }, { rotationY: 0, ...TP, duration: 0.45, ease: "back.out(1.4)", ...IR }, T);
    } else if (kind === "drop") {  // the old page sinks back; the new one drops in from above and lands
      tw3(mv(prev), { y: 0, z: 0, rotationX: 0, opacity: 1, ...TP }, { y: H * 0.25, z: -900, rotationX: -22, opacity: 0, ...TP, duration: 0.55, ease: "power2.in", ...IR }, s0);
      tw3(mv(cur), { y: -H * 1.1, rotation: -9, rotationX: -25, ...TP }, { y: 0, rotation: 0, rotationX: 0, ...TP, duration: 0.75, ease: "back.out(1.25)", ...IR }, s0);
      punch(s0 + 0.42, 0.025);
    } else if (kind === "dot") {  // the outgoing frame collapses into its accent point, which flies to center and hits
      tl.seek(T - 0.34); frame(T - 0.34);  // where the point really is at that moment (the scene's camera has moved)
      const el = $("[data-anchor]", prev.el), r = el && el.getBoundingClientRect(), a = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : ANCH[i - 1];
      tl.to(prev.el, { scale: 0.04, opacity: 0, transformOrigin: `${a.x}px ${a.y}px`, duration: 0.34, ease: "power3.in" }, T - 0.34);
      tl.fromTo(dot, { x: a.x - 28, y: a.y - 28, opacity: 1, scale: 1 }, { x: W / 2 - 28, y: H / 2 - 28, opacity: 1, scale: 1, duration: 0.34, ease: "power3.in", ...IR }, T - 0.34);
      hitDot(T, W / 2, H / 2);
      punch(T, 0.05);
    }
  });
  (R.punches || []).forEach((p) => Array.isArray(p) ? punch(p[0], p[1] ?? 0.03) : punch(p, 0.03));

  // ───────── the finish: drifting texture, vignette, seeded grain ─────────
  if (FIN.texture === "dots") tl.fromTo("#paper", { x: 0, y: 0 }, { x: -30, y: -90, duration: END, ease: "none" }, 0);
  const grain = [];
  if (FIN.grain) for (let k = 0; k < 6; k++) {
    const cv = document.createElement("canvas"); cv.width = Math.round(W / 3); cv.height = Math.round(H / 3); cv.className = "grain";
    const cx = cv.getContext("2d"), img = cx.createImageData(cv.width, cv.height), rnd = mulberry32(1000 + k);
    for (let p = 0; p < img.data.length; p += 4) { const v = 128 + (rnd() - 0.5) * 150; img.data[p] = img.data[p + 1] = img.data[p + 2] = v; img.data[p + 3] = 255; }
    cx.putImageData(img, 0, 0); $("#grain").appendChild(cv); grain.push(cv);
  }
  ticks.push((t) => { const gi = Math.floor(t * R.fps) % Math.max(grain.length, 1); grain.forEach((cv, k) => { cv.style.opacity = k === gi ? FIN.grain : 0; }); });

  function frame(t) { ticks.forEach((f) => f(t)); }
  const drv = { t: 0 };
  tl.fromTo(drv, { t: 0 }, { t: END, duration: END, ease: "none", onUpdate: () => frame(drv.t) }, 0);
  tl.seek(0);
  frame(0);
  window.__reelTimeline = tl;  // index.html registers it: the lint only reads the page's own scripts
})();
