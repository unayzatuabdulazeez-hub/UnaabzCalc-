"""
Opens every page rendered by render-pages.ts in a real browser (Chromium) at six widths and checks layout and basic accessibility.
Usage: python3 scripts/render/render-check.py <rendered-dir> [<screenshot-dir>]
Limits: static HTML only. Nothing here clicks, submits or signs in; it does not prove the pages work against a live server.
"""
import json, os, sys
from playwright.sync_api import sync_playwright
D = sys.argv[1]; SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
WIDTHS = [360, 412, 768, 1024, 1280, 1920]
pages = sorted(f[:-5] for f in os.listdir(D) if f.endswith(".html"))
JS = """() => {
  const vw = document.documentElement.clientWidth, out = {issues: []};
  out.scrollW = document.documentElement.scrollWidth; out.vw = vw;
  // elements that stick out of the viewport and are not inside a scrollable wrapper
  const scrollers = (el) => { for (let p = el; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  const wide = [];
  document.querySelectorAll('body *').forEach(el => { const r = el.getBoundingClientRect(); if (r.width > 0 && (r.right > vw + 1 || r.left < -1) && !scrollers(el)) wide.push(el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '') + ' ' + Math.round(r.left) + '..' + Math.round(r.right)); });
  out.wide = wide.slice(0, 5);
  // tap targets: visible buttons, links styled as buttons, inputs
  const small = [];
  document.querySelectorAll('button, input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea, a.btn').forEach(el => { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0 && r.height < 36) small.push(el.tagName.toLowerCase() + (el.name ? '[' + el.name + ']' : '') + ' h=' + Math.round(r.height)); });
  out.small = small.slice(0, 5);
  // form fields must have a label
  const unl = [];
  document.querySelectorAll('input:not([type=hidden]):not([type=submit]), select, textarea').forEach(el => { const ok = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.id && document.querySelector('label[for="' + el.id + '"]')) || el.closest('label'); if (!ok) unl.push(el.tagName.toLowerCase() + '[' + (el.name || el.id) + ']'); });
  out.unlabelled = unl;
  const ids = {}; document.querySelectorAll('[id]').forEach(e => { ids[e.id] = (ids[e.id] || 0) + 1; });
  out.dupIds = Object.keys(ids).filter(k => ids[k] > 1 && k !== '_R_');
  out.h1 = document.querySelectorAll('h1').length;
  out.lang = document.documentElement.lang;
  const fs = []; document.querySelectorAll('p, li, td, th, label, span, a, b, div').forEach(el => { if (el.children.length === 0 && el.textContent.trim()) { const s = parseFloat(getComputedStyle(el).fontSize); if (s < 13) fs.push(el.tagName + ' ' + s); } });
  out.tinyText = fs.slice(0, 3);
  return out; }"""
bad = 0; rows = []
with sync_playwright() as p:
    br = p.chromium.launch()
    for name in pages:
        for w in WIDTHS:
            ctx = br.new_context(viewport={"width": w, "height": 900}); pg = ctx.new_page(); errs = []
            pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None); pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto("file://" + os.path.abspath(f"{D}/{name}.html")); r = pg.evaluate(JS)
            probs = []
            if r["scrollW"] > r["vw"] + 1: probs.append(f"page scrolls sideways ({r['scrollW']} > {r['vw']})")
            if r["wide"]: probs.append("sticks out: " + "; ".join(r["wide"]))
            if r["small"]: probs.append("small tap targets: " + "; ".join(r["small"]))
            if r["unlabelled"]: probs.append("unlabelled fields: " + ", ".join(r["unlabelled"]))
            if r["dupIds"]: probs.append("duplicate ids: " + ", ".join(r["dupIds"]))
            if r["h1"] != 1: probs.append(f"{r['h1']} h1 headings")
            if r["lang"] != "en": probs.append("html lang missing")
            if r["tinyText"]: probs.append("tiny text: " + "; ".join(r["tinyText"]))
            if errs: probs.append("console errors: " + "; ".join(errs[:2]))
            if SHOTS and w in (360, 1280) and name in ("business-home-premium", "admin-users", "admin-home", "calc-new-estimator", "jobs", "upgrade", "billing-premium", "analysis", "admin-user-detail", "pricing"):
                os.makedirs(SHOTS, exist_ok=True); pg.screenshot(path=f"{SHOTS}/{name}-{w}.png", full_page=True)
            rows.append((name, w, probs)); bad += bool(probs); ctx.close()
    br.close()
for name in pages:
    pw = [(w, pr) for n, w, pr in rows if n == name and pr]
    print(("PASS " if not pw else "FAIL ") + name + ("" if not pw else "  " + " | ".join(f"{w}px: {', '.join(pr)}" for w, pr in pw[:2])))
print(f"\n{len(pages)} pages x {len(WIDTHS)} widths = {len(rows)} checks, {len(rows) - bad} clean, {bad} with problems")
sys.exit(1 if bad else 0)
