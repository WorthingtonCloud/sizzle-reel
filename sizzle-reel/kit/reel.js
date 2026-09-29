// The reel, as one HyperFrames composition. build.mjs writes index.html (the styles, the media tags, and the reel's
// data with every time already worked out) and inlines this file after the data; it turns that data into the DOM and
// ONE paused GSAP timeline.
// Everything is a pure function of time: seeded grain, no Math.random, no Date.now, nothing async. The renderer
// seeks frames in any order across several workers, so a frame must never depend on the one before it.
//
// Scenes are drawn in a 1080-wide design space (content in y 100..1300, centered on 540,700), then fitted: high up
// on a vertical video (titles live below), on the right of a widescreen one (titles live on the left).
(() => {
  const R = window.REEL, [W, H] = R.size, LAND = W > H, P = R.palette, B = R.beat, END = R.end;
  const FIN = { grain: 0.07, vignette: true, texture: "dots", ...(R.finish || {}) };
  const $ = (s, el = document) => el.querySelector(s);
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

  // ───────── the phone safe zone (vertical): words stay in x 11–89%, y 10–84%, and x ≤ 80% below 62% height ─────────
  const fitStage = (center) => {
    if (!LAND) { const s = Math.min(W / 1080, 0.64 * H / 1200); return { s, x: W / 2 - 540 * s, y: (center ? H / 2 : H * 0.35) - 700 * s }; }
    const s = center ? 0.92 * H / 1200 : Math.min(0.52 * W / 1080, 0.92 * H / 1200);
    return { s, x: (center ? W / 2 : W * 0.72) - 540 * s, y: H / 2 - 700 * s };
  };

  // ───────── titles: "a<br>b" lines, <span class=a> = accent color, <span class=apart> = letters that drift apart ─────────
  function words(html) {
    const box = document.createElement("div"); box.innerHTML = html; const out = [];
    const push = (text, cls) => text.split(/(\s+)/).forEach((w) => { if (!w) return; out.push(/^\s+$/.test(w) ? " " : `<span class="w ${cls}">${w}</span>`); });
    box.childNodes.forEach((n) => n.nodeType === 3 ? push(n.textContent, "") : n.classList.contains("apart")
      ? out.push(`<span class="w apart ${n.classList.contains("a") ? "a" : ""}">${[...n.textContent].map((c) => `<span class="ch">${c}</span>`).join("")}</span>`)
      : push(n.textContent, n.className));
    return out.join("");
  }
  const lines = (text) => text.split(/<br\s*\/?>/i).map((ln) => `<span class="line">${words(ln)}</span>`).join("");

  // ───────── scenes ─────────
  const SCENES = {
    chat(stage, seg) {
      const c = R.scenes.chat || {}, cyc = c.cycles || [{ q: "Where did we leave off?", a: "I don't have any memory of past conversations." }];
      const box = div("chat", stage, `<div class="chat-h"><span class="hd">${c.header || "New session"}</span></div>
        <div class="chat-b"><div class="bub-q"></div><div class="bub-a"></div></div>
        <div class="chat-in"><span class="caret"></span><span class="ph">${c.placeholder || "Ask anything"}</span><span class="send" data-anchor></span></div>`);
      const q = $(".bub-q", box), a = $(".bub-a", box), hd = $(".hd", box), ph = $(".ph", box), caret = $(".caret", box);
      // each exchange a little shorter than the last; the final stretch is an empty box and a blinking cursor
      const wts = cyc.map((_, i) => Math.pow(0.86, i)), sum = wts.reduce((x, y) => x + y, 0), live = (seg.t1 - seg.t0) * 0.86;
      ticks.push((t) => {
        const lt0 = t - seg.t0; if (lt0 < -0.1 || t > seg.t1 + 0.1) return;
        let t0 = 0, cy = null, lt = 0, L = 0;
        for (let i = 0; i < cyc.length; i++) { L = live * wts[i] / sum; if (lt0 < t0 + L) { cy = cyc[i]; lt = lt0 - t0; break; } t0 += L; }
        if (cy) {
          const qn = Math.round(cy.q.length * clamp((lt - 0.08) / 0.45)), an = Math.round(cy.a.length * clamp((lt - 0.75) / (L * 0.42)));
          q.textContent = cy.q.slice(0, qn); q.style.opacity = qn ? 1 : 0; a.textContent = cy.a.slice(0, an);
          const f = clamp(1 - lt / 0.25); hd.style.color = f > 0 ? `rgba(229,72,77,${0.45 + 0.55 * f})` : P.dim;
          ph.style.opacity = 0; caret.style.opacity = 0;
        } else {
          q.textContent = ""; q.style.opacity = 0; a.textContent = ""; ph.style.opacity = 1; hd.style.color = P.dim;
          caret.style.opacity = Math.floor(t * 2.4) % 2 ? 0 : 1;
        }
      });
    },

    hub(stage, seg) {
      const c = R.scenes.hub || {}, C = { x: 540, y: 700 }, step = c.step ?? 3, tstep = c.tstep ?? 0.5;
      const rings = (c.rings || ["TIER 1", "TIER 2", "TIER 3"]).slice(0, 3), nodes = (c.nodes || []).slice(0, 8);
      const toolsAt = c.tools_at ?? rings.length * step, NR = 342;
      const s = svg("svg", { width: 1080, height: 1400, viewBox: "0 0 1080 1400" }, stage), g = svg("g", {}, s);
      const at = (n) => seg.t0 + n * B;
      nodes.forEach((label, i) => {
        const ang = (-67.5 + i * 360 / Math.max(nodes.length, 1)) * Math.PI / 180, x = C.x + NR * Math.cos(ang), y = C.y + NR * Math.sin(ang);
        const sx = C.x + 266 * Math.cos(ang), sy = C.y + 266 * Math.sin(ang), ex = C.x + (NR - 34) * Math.cos(ang), ey = C.y + (NR - 34) * Math.sin(ang);
        const len = Math.hypot(ex - sx, ey - sy);
        const sp = svg("line", { x1: sx, y1: sy, x2: ex, y2: ey, stroke: P.line, "stroke-width": 3, "stroke-dasharray": len, "stroke-dashoffset": len }, g);
        const nd = svg("g", { opacity: 0 }, svg("g", { transform: `translate(${x} ${y})` }, g)), w = 26 + label.length * 15.5;
        svg("rect", { x: -w / 2, y: -30, width: w, height: 60, rx: 30, fill: P.card, stroke: P.line, "stroke-width": 3 }, nd);
        svg("text", { y: 10, "text-anchor": "middle", fill: P.ink, "font-weight": 600, "font-size": 27, class: "sans" }, nd).textContent = label;
        const pl = svg("circle", { cx: sx, cy: sy, r: 7, fill: P.accent, opacity: 0 }, g);
        const t0 = at(toolsAt + i * tstep);
        tl.to(sp, { attr: { "stroke-dashoffset": 0 }, duration: 0.25, ease: "power2.out" }, t0);
        tl.fromTo(nd, { opacity: 0, scale: 0.6, svgOrigin: "0 0" }, { opacity: 1, scale: 1, svgOrigin: "0 0", duration: 0.4, ease: "back.out(2.2)", ...IR }, t0 + 0.12);
        tl.fromTo(pl, { opacity: 1 }, { opacity: 0, duration: 0.4, ease: "power1.in", ...IR }, t0);  // a pulse leaves the core
      });
      rings.forEach((label, k) => {
        const r = 132 + 64 * k, circ = 2 * Math.PI * r, t0 = at(k * step);
        const ring = svg("circle", { cx: C.x, cy: C.y, r, fill: "none", stroke: P.line, "stroke-width": 3, "stroke-dasharray": circ, "stroke-dashoffset": circ, transform: `rotate(-90 ${C.x} ${C.y})` }, g);
        // short labels sitting ON their ring: a long one notches the ring above it and the circles read tall
        const lab = svg("text", { x: C.x, y: C.y - r + 7, "text-anchor": "middle", fill: P.dim, "font-weight": 700, "font-size": 19, "letter-spacing": 3, opacity: 0, "paint-order": "stroke", stroke: P.ground, "stroke-width": 12, class: "mono" }, g);
        lab.textContent = label;
        tl.to(ring, { attr: { "stroke-dashoffset": 0 }, duration: 0.6, ease: "power2.inOut" }, t0);
        tl.fromTo(ring, { attr: { stroke: P.accent } }, { attr: { stroke: P.line }, duration: 0.9, ease: "power1.in", ...IR }, t0 + 0.3);
        tl.fromTo(lab, { opacity: 0 }, { opacity: 1, duration: 0.3, ...IR }, t0 + 0.35);
      });
      // live traffic: once a tool is wired in, red streaks run from it through all three rings into the agent and
      // back out, ping-pong, forever. Drawn over the rings and under the core, so they vanish into it.
      const tr = svg("g", {}, g), R0 = 76, R1 = NR - 34, TAIL = 120, CYC = 1.5;
      nodes.forEach((_, i) => {
        const ang = (-67.5 + i * 360 / Math.max(nodes.length, 1)) * Math.PI / 180, ux = Math.cos(ang), uy = Math.sin(ang);
        const start = at(toolsAt + i * tstep) + 0.3;
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
      svg("circle", { r: 70, fill: P.card, stroke: P.accent, "stroke-width": 5 }, core);
      svg("text", { y: 9, "text-anchor": "middle", fill: P.ink, "font-weight": 700, "font-size": 25, "letter-spacing": 3, class: "mono" }, core).textContent = c.center || "AGENT";
      tl.fromTo(core, { scale: 0, svgOrigin: "0 0" }, { scale: 1, svgOrigin: "0 0", duration: 0.5, ease: "back.out(2)", ...IR }, seg.t0);
      tl.fromTo(g, { scale: 1, svgOrigin: `${C.x} ${C.y}` }, { scale: 1.07, svgOrigin: `${C.x} ${C.y}`, duration: seg.t1 - seg.t0, ease: "sine.inOut", ...IR }, seg.t0);
      return "own-push";
    },

    sources(stage, seg) {
      const c = R.scenes.sources || {}, cards = (c.cards || []).slice(0, 6);
      const FX = 120, FY = 260, CW = 262, GAP = 27;
      // footnote markers ordered by column, so no link ever crosses another
      const MARKS = [[512, 200], [672, 150], [752, 100], [552, 200], [712, 150], [790, 100]];
      const links = svg("svg", { width: 1080, height: 1400, style: "position:absolute;left:0;top:0" }, stage);
      div("claim", stage, `<div class="k mono">${c.heading || "CLAIM"}</div>` +
        [[700, 90], [620, 140], [460, 190]].map(([w, y]) => `<div class="bar" style="width:${w}px;top:${y}px"></div>`).join(""));
      const marks = svg("svg", { width: 1080, height: 1400, style: "position:absolute;left:0;top:0" }, stage);
      cards.forEach(({ k, t }, i) => {
        const col = i % 3, row = Math.floor(i / 3), x = FX + col * (CW + GAP), y = 640 + row * 236;
        const card = div("src", stage, `<div class="k mono">${k}</div><svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="${P.ink}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${GLYPH[k] || GLYPH.PAPER}</svg><div class="t">${t}</div>`, `left:${x}px;top:${y}px;opacity:0`);
        const [mx, my] = MARKS[i], x0 = FX + mx, y0 = FY + my, x1 = x + CW / 2;
        const p = svg("path", { d: `M${x0} ${y0} C ${x0} ${y0 + 160}, ${x1} ${y - 160}, ${x1} ${y}`, fill: "none", stroke: P.accent, "stroke-width": 3 }, links);
        const len = p.getTotalLength(); p.setAttribute("stroke-dasharray", len); p.setAttribute("stroke-dashoffset", len);
        const mk = svg("circle", { cx: x0, cy: y0, r: 9, fill: P.accent, opacity: 0 }, marks);
        const t0 = seg.t0 + 0.2 + i * B / 2;
        tl.fromTo(mk, { scale: 0, opacity: 1, svgOrigin: `${x0} ${y0}` }, { scale: 1, opacity: 1, svgOrigin: `${x0} ${y0}`, duration: 0.25, ease: "back.out(3)", ...IR }, t0);
        tl.to(p, { attr: { "stroke-dashoffset": 0 }, duration: 0.35, ease: "power2.inOut" }, t0 + 0.05);
        tl.fromTo(card, { opacity: 0, y: 40, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "back.out(1.8)", ...IR }, t0 + 0.3);
      });
    },

    endcard(stage, seg) {
      const c = R.scenes.endcard || {}, t0 = seg.t0;
      const tile = div("tileicon", stage);
      if (c.mark) {  // a drawn mark: the stroke draws, then the accent point lands with a squash (the motif, home)
        const m = c.mark, s = svg("svg", { width: 240, height: 240, viewBox: m.viewBox || "-3 -3 30 30" }, tile);
        const path = svg("path", { d: m.path, fill: "none", stroke: P.ink, "stroke-width": m.stroke || 2.2, "stroke-linecap": "square" }, s);
        const len = path.getTotalLength(); path.setAttribute("stroke-dasharray", len); path.setAttribute("stroke-dashoffset", len);
        tl.to(path, { attr: { "stroke-dashoffset": 0 }, duration: 0.6, ease: "power2.inOut" }, t0 + 0.15);
        if (m.point) {
          const [px, py, pw, ph] = m.point, pt = svg("rect", { x: px, y: py, width: pw, height: ph, fill: P.accent, opacity: 0 }, s);
          tl.fromTo(pt, { attr: { y: py - 20 }, opacity: 0 }, { attr: { y: py }, opacity: 1, duration: 0.32, ease: "power3.in", ...IR }, t0 + 0.72);
          tl.fromTo(pt, { scaleY: 0.55, scaleX: 1.35, svgOrigin: `${px + pw / 2} ${py + ph}` }, { scaleY: 1, scaleX: 1, svgOrigin: `${px + pw / 2} ${py + ph}`, duration: 0.4, ease: "elastic.out(1.2,0.45)", ...IR }, t0 + 1.04);
        }
      } else if (c.logo) {
        div("logo", tile, `<img src="${R.media.logo}" alt="">`);
      }
      tl.fromTo(tile, { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.32, ease: "back.out(1.8)", ...IR }, t0 - 0.05);
      const word = div("word", stage, c.wordmark || ""), url = div("url", stage, c.url || "");
      const late = c.mark ? 1.15 : 0.6;  // the name arrives only after the mark has landed
      tl.fromTo(word, { y: 40, opacity: 0, scale: 1.08 }, { y: 0, opacity: 1, scale: 1, duration: 0.6, ease: "expo.out", ...IR }, t0 + late);
      tl.fromTo(url, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out", ...IR }, t0 + late + 0.35);
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
  for (const seg of segs) {
    const src = seg.source, cam = $(".cam", seg.el) || div("cam", seg.el);
    let ownPush = false, push = seg.push ?? 0.04;
    if (src.scene) {
      const center = src.scene === "endcard", f = fitStage(center);
      const stage = div("stage", cam, "", `transform:translate(${f.x}px,${f.y}px) scale(${f.s})`);
      if (!SCENES[src.scene]) throw new Error(`unknown scene "${src.scene}"`);
      ownPush = SCENES[src.scene](stage, seg) === "own-push";
    } else if (src.card) {
      const t = R.titles[src.card], wrap = div("cardwrap", cam), card = div("card", wrap, lines(t.text));
      card.dataset.title = src.card;
      if (t.size) card.style.fontSize = parseFloat(getComputedStyle(card).fontSize) * t.size + "px";
      const ats = src.at || [];
      card.querySelectorAll(".line").forEach((ln, k) => {
        const t0 = seg.t0 + (ats[k] ?? (ats.length ? ats[ats.length - 1] : 0)) * B + (ats.length ? 0 : k * 0.1);
        if (seg.i === 0 && t0 === 0) return;  // frame one is the preview: the hook is already there
        // no IR here: a later line must be hidden from load until its own beat, or it shows up with the first one
        tl.fromTo(ln, { scale: 1.4, opacity: 0, filter: "blur(12px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.36, ease: "expo.out" }, t0);
      });
      card.querySelectorAll(".apart").forEach((ap) => {
        const ch = ap.querySelectorAll(".ch"), mid = (ch.length - 1) / 2, t0 = seg.t0 + (ats[ats.length - 1] || 0) * B + 0.4;
        tl.fromTo(ch, { x: 0 }, { x: (k) => (k - mid) * 16, duration: Math.max(0.5, seg.t1 - t0), ease: "sine.inOut", ...IR }, t0);
      });
    } else if (src.grid) {
      const n = src.grid.length, rows = Math.ceil(n / 3), gap = Math.round(Math.min(W, H) * 0.028);
      let tw = LAND ? Math.round(W * 0.29) : Math.floor((Math.round(W * 0.78) - 2 * gap) / 3), th = Math.round(tw * H / W);
      const top = LAND ? 0 : Math.round(H * 0.10), band = LAND ? H : Math.round(H * 0.74);  // portrait: the safe band
      while (rows * th + (rows + 1) * gap > band) { tw = Math.round(tw * 0.95); th = Math.round(th * 0.95); }
      const x0 = (W - 3 * tw - 2 * gap) / 2, y0 = top + (band - rows * th - (rows - 1) * gap) / 2;
      R.media.tiles[seg.i].forEach((srcFile, k) => {
        const tile = div("tile", cam, `<img src="${srcFile}" alt="">`, `left:${x0 + (k % 3) * (tw + gap)}px;top:${y0 + Math.floor(k / 3) * (th + gap)}px;width:${tw}px;height:${th}px`);
        // a third of a beat apart, so every tile has landed and holds well before the segment ends
        tl.fromTo(tile, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.28, ease: "back.out(1.7)", ...IR }, seg.t0 + k * B / 3);
      });
      ownPush = true;
    }
    // footage (shot / clip / still) was written into .cam by build.mjs: its media tags must be static HTML
    if (!ownPush && push) tl.fromTo(cam, { scale: 1 }, { scale: 1 + push, duration: seg.t1 - seg.t0, ease: "sine.inOut", ...IR }, seg.t0);

    // titles over this segment
    for (const tt of seg.titles) {
      const t = R.titles[tt.id]; if (!t) throw new Error(`title "${tt.id}" not in reel.json → titles`);
      const el = div(t.kind === "stat" ? "stat" : "lower", titlesBox);
      el.dataset.title = tt.id;
      if (t.size) el.style.fontSize = parseFloat(getComputedStyle(el).fontSize) * t.size + "px";  // one long line: shrink just this title
      if (t.kind === "stat") el.innerHTML = `<div class="num">${t.text}</div><div class="sub">${t.sub || ""}</div>`;
      else el.innerHTML = `<span class="rule"></span>${lines(t.text)}`;
      const t0 = tt.t0 + (seg.in === "fade" && tt.t0 === seg.t0 ? 0.3 : 0);
      tl.set(el, { opacity: 1 }, t0);
      if (t0 > 0) {
        if (t.kind === "stat") {
          tl.fromTo($(".num", el), { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "expo.out", ...IR }, t0);
          tl.fromTo($(".sub", el), { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "power3.out", ...IR }, t0 + 0.12);
          const n = +String(t.text).replace(/,/g, "");
          if (Number.isFinite(n)) ticks.push((tt2) => { if (tt2 >= t0 - 0.2 && tt2 <= tt.t1 + 0.2) $(".num", el).textContent = Math.round(n * easeOut((tt2 - t0 - 0.05) / 0.75)).toLocaleString("en-US"); });
        } else {
          tl.fromTo($(".rule", el), { scaleX: 0 }, { scaleX: 1, duration: 0.35, ease: "power3.out", ...IR }, t0);
          tl.fromTo(el.querySelectorAll(".w"), { y: 46, opacity: 0, filter: "blur(10px)" }, { y: 0, opacity: 1, filter: "blur(0px)", duration: 0.5, ease: "expo.out", stagger: 0.06, ...IR }, t0 + 0.04);
        }
      }
      if (tt.t1 < END - 0.01) { tl.to(el, { opacity: 0, y: -18, duration: 0.14, ease: "power2.in" }, tt.t1 - 0.14); tl.set(el, { y: 0 }, tt.t1); }
    }
  }

  // ───────── transitions: every switch lands exactly on the grid ─────────
  const dot = $("#dot"), ring = $("#ring");
  const anchorOf = (el) => { const a = $("[data-anchor]", el); if (!a) return { x: W / 2, y: H / 2 }; const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const ANCH = segs.map((s) => anchorOf(s.el));  // measured once, before any tween has moved anything
  segs.forEach((cur, i) => {
    if (!i) return;
    const prev = segs[i - 1], T = cur.t0, kind = cur.in || "whip", d = Math.round(H * 0.09);
    if (kind === "fade") {
      tl.to(prev.el, { opacity: 0, filter: "blur(10px)", duration: 0.22, ease: "power2.in" }, T - 0.22);
      tl.fromTo(cur.el, { opacity: 0 }, { opacity: 1, duration: 0.45, ease: "power1.out", ...IR }, T - 0.1);
      return;
    }
    tl.set(prev.el, { opacity: 0 }, T); tl.set(cur.el, { opacity: 1 }, T);
    if (kind === "whip") {  // out accelerates up into a blur, in decelerates out of it: one continuous move
      tl.to(prev.el, { y: -d, filter: "blur(26px)", duration: 0.2, ease: "power2.in" }, T - 0.2);
      tl.fromTo(cur.el, { y: d, filter: "blur(26px)" }, { y: 0, filter: "blur(0px)", duration: 0.5, ease: "power3.out", ...IR }, T);
    } else if (kind === "zoom") {  // the camera dollies through the outgoing frame
      tl.to(prev.el, { scale: 5, opacity: 0, filter: "blur(14px)", transformOrigin: "50% 50%", duration: 0.32, ease: "power2.in" }, T - 0.32);
    } else if (kind === "flash") {
      tl.fromTo(cur.el, { filter: "brightness(3.2)" }, { filter: "brightness(1)", duration: 0.35, ease: "power2.out", ...IR }, T);
    } else if (kind === "dot") {  // the outgoing frame collapses into its accent point, which flies to center and hits
      const a = ANCH[i - 1];
      tl.to(prev.el, { scale: 0.04, opacity: 0, transformOrigin: `${a.x}px ${a.y}px`, duration: 0.34, ease: "power3.in" }, T - 0.34);
      tl.set(dot, { x: a.x - 28, y: a.y - 28, opacity: 1, scale: 1 }, T - 0.34);
      tl.to(dot, { x: W / 2 - 28, y: H / 2 - 28, duration: 0.34, ease: "power3.in" }, T - 0.34);
      tl.to(dot, { scale: 2.2, duration: 0.08, ease: "power2.out" }, T);
      tl.to(dot, { scale: 0, duration: 0.3, ease: "power3.in" }, T + 0.08);
      tl.set(ring, { x: W / 2 - 28, y: H / 2 - 28, opacity: 1, scale: 1 }, T);
      tl.to(ring, { scale: 16, opacity: 0, duration: 0.7, ease: "expo.out" }, T);
    }
  });

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

  const drv = { t: 0 }, frame = (t) => ticks.forEach((f) => f(t));
  tl.fromTo(drv, { t: 0 }, { t: END, duration: END, ease: "none", onUpdate: () => frame(drv.t) }, 0);
  frame(0);
  tl.seek(0);
  window.__reelTimeline = tl;  // index.html registers it: the lint only reads the page's own scripts
})();
