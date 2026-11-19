// quartz-photo-view: lightbox + opt-in filmstrip view for Quartz v5.
//
// 1. Lightbox: every content image opens full-size on click, with prev/next
//    (buttons, arrow keys, swipe) across the page's images. The <dialog>
//    approach follows vazome/quartz-image-zoom (MIT), but the dialog is
//    re-created after SPA navigation, because Quartz morphs <body> and drops it.
// 2. Filmstrip: pages with `filmstrip: true` in their frontmatter get a
//    "Filmstrip view" button. It opens every photo full-height in one horizontal row. Each
//    visitor chooses it; the choice is remembered in their browser only and
//    is off by default.
//
// Plain ESM with no dependencies and no build step: the file in dist/ is the
// source.

const DEFAULTS = { frontmatterKey: "filmstrip" }

function hasClass(node, name) {
  const c = node.properties?.className
  return Array.isArray(c) ? c.includes(name) : c === name
}

function walk(node, inLink, fn) {
  if (node.type === "element") {
    fn(node, inLink)
    inLink = inLink || node.tagName === "a"
  }
  for (const child of node.children ?? []) walk(child, inLink, fn)
}

function wantsFilmstrip(file, key) {
  const v = file.data?.frontmatter?.[key]
  return v === true || (typeof v === "string" && ["true", "yes", "on"].includes(v.toLowerCase()))
}

const CSS = `
img.pv-img { cursor: zoom-in; }

.pv-open {
  display: inline-flex; align-items: center; gap: .4em;
  margin: 0 0 1rem; padding: .35em .8em;
  font: inherit; font-family: var(--font-interface, inherit); font-size: .9em;
  color: var(--darkgray); background: transparent;
  border: 1px solid var(--lightgray); border-radius: 6px; cursor: pointer;
}
.pv-open:hover { color: var(--secondary); border-color: var(--secondary); }
.pv-open svg { width: 1.1em; height: 1.1em; }

/* ---- lightbox ---- */
dialog.pv-lightbox {
  padding: 0; border: 0; background: none;
  width: 100%; height: 100%; max-width: none; max-height: none; overflow: hidden;
}
dialog.pv-lightbox[open] { display: grid; place-items: center; }
dialog.pv-lightbox::backdrop { background: rgba(0, 0, 0, .92); }
dialog.pv-lightbox, dialog.pv-lightbox::backdrop { transition: opacity .2s ease; opacity: 1; }
@starting-style {
  dialog.pv-lightbox[open], dialog.pv-lightbox[open]::backdrop { opacity: 0; }
}
/* An explicit viewport-sized box + object-fit, rather than intrinsic sizing:
   iOS Safari shrank the auto-sized image to about half the screen width. */
dialog.pv-lightbox img {
  box-sizing: border-box; display: block;
  width: 100vw; height: 100vh; height: 100dvh;
  max-width: none; max-height: none; margin: 0; border-radius: 0; box-shadow: none;
  padding: 3vh 3vw; object-fit: contain; cursor: zoom-out;
  touch-action: pan-y pinch-zoom;
}
@media (max-width: 800px) { dialog.pv-lightbox img { padding: 0; } }
.pv-btn {
  position: fixed; z-index: 2; display: grid; place-items: center;
  width: 44px; height: 44px; padding: 0; border: 0; border-radius: 50%;
  background: rgba(0, 0, 0, .45); color: #eee; font-size: 1.6rem; line-height: 1;
  cursor: pointer;
}
.pv-btn:hover, .pv-btn:focus-visible { background: rgba(0, 0, 0, .8); }
.pv-btn[hidden] { display: none; }
.pv-close { top: 14px; right: 14px; }
.pv-prev { left: 14px; top: 50%; translate: 0 -50%; }
.pv-next { right: 14px; top: 50%; translate: 0 -50%; }
.pv-count {
  position: fixed; left: 50%; bottom: 12px; translate: -50% 0;
  color: #aaa; font: 12px/1 var(--font-interface, sans-serif); letter-spacing: .05em;
}
@media (hover: none) { .pv-prev, .pv-next { display: none; } }

/* ---- filmstrip ---- */
.pv-strip {
  position: fixed; inset: 0; z-index: 900;
  background: #1a1a1a; color: #999;
}
.pv-track {
  display: flex; height: 100%; overflow-x: auto; overflow-y: hidden;
  overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #444 transparent;
  outline: none;
}
.pv-track img {
  flex: none; display: block; height: 100%; width: auto;
  max-width: none; max-height: none; margin: 0; border-radius: 0; /* beat theme img rules */
  aspect-ratio: 3 / 2; /* placeholder until loaded, so lazy-loading works */
  object-fit: contain; background: #222;
}
.pv-track img.pv-loaded { aspect-ratio: auto; background: none; }
.pv-strip-title {
  position: fixed; top: 12px; left: 16px; z-index: 2; max-width: 60vw;
  padding: .3em .6em; border-radius: 4px; background: rgba(0, 0, 0, .7); color: #ddd;
  font: 12px/1.3 var(--font-interface, sans-serif); letter-spacing: .05em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

@media (prefers-reduced-motion: reduce) {
  dialog.pv-lightbox, dialog.pv-lightbox::backdrop { transition: none; }
}
`

const SCRIPT = `
if (!window.__photoView) {
  window.__photoView = true;
  const PREF = "photo-view:filmstrip";
  const getPref = () => { try { return localStorage.getItem(PREF) === "1"; } catch (e) { return false; } };
  const setPref = (on) => { try { localStorage.setItem(PREF, on ? "1" : "0"); } catch (e) {} };
  const el = (tag, cls, attrs) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };
  const pageImages = () => Array.from(document.querySelectorAll("img.pv-img"));
  const srcOf = (img) => img.currentSrc || img.src;

  // ---------- lightbox ----------
  let dlg = null, list = [], idx = 0;
  function dialog() {
    if (dlg && dlg.isConnected) return dlg;
    dlg = el("dialog", "pv-lightbox", { "aria-label": "Image viewer" });
    const close = el("button", "pv-btn pv-close", { "aria-label": "Close", type: "button" });
    close.innerHTML = "&times;";
    const prev = el("button", "pv-btn pv-prev", { "aria-label": "Previous image", type: "button" });
    prev.innerHTML = "&#8249;";
    const next = el("button", "pv-btn pv-next", { "aria-label": "Next image", type: "button" });
    next.innerHTML = "&#8250;";
    const img = el("img", "", { alt: "" });
    const count = el("div", "pv-count");
    dlg.append(img, prev, next, close, count);
    document.body.appendChild(dlg);
    dlg.addEventListener("click", (e) => {
      if (e.target === prev) return show(idx - 1);
      if (e.target === next) return show(idx + 1);
      if (e.target === dlg || e.target === img || e.target === close) dlg.close();
    });
    dlg.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); show(idx - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); show(idx + 1); }
    });
    let x0 = null;
    dlg.addEventListener("touchstart", (e) => { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
    dlg.addEventListener("touchend", (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1));
    });
    dlg.addEventListener("close", () => { document.documentElement.style.overflow = ""; });
    return dlg;
  }
  async function show(i) {
    if (i < 0 || i >= list.length) return;
    idx = i;
    const d = dialog(), img = d.querySelector("img");
    img.src = srcOf(list[i]);
    img.alt = list[i].alt || "";
    d.querySelector(".pv-prev").hidden = i === 0;
    d.querySelector(".pv-next").hidden = i === list.length - 1;
    d.querySelector(".pv-count").textContent = list.length > 1 ? (i + 1) + " / " + list.length : "";
    try { await img.decode(); } catch (e) {}
    if (!d.open) { document.documentElement.style.overflow = "hidden"; d.showModal(); }
    // warm the next image so stepping through feels instant
    if (list[i + 1]) { const pre = new Image(); pre.src = srcOf(list[i + 1]); }
  }
  document.addEventListener("click", (e) => {
    const t = e.target && e.target.closest ? e.target.closest("img.pv-img") : null;
    if (!t) return;
    list = pageImages();
    show(Math.max(0, list.indexOf(t)));
  });

  // ---------- filmstrip ----------
  let strip = null, opener = null;
  function closeStrip(remember) {
    if (!strip) return;
    if (strip.isConnected) strip.remove();
    strip = null;
    document.documentElement.style.overflow = "";
    document.removeEventListener("keydown", stripKeys);
    if (remember) setPref(false);
    if (opener && opener.isConnected) opener.focus();
  }
  function step(track, dir) {
    const imgs = Array.from(track.children), left = track.scrollLeft;
    const target = dir > 0
      ? imgs.find((im) => im.offsetLeft > left + 2)
      : imgs.slice().reverse().find((im) => im.offsetLeft < left - 2);
    if (target) track.scrollTo({ left: target.offsetLeft, behavior: "smooth" });
  }
  function stripKeys(e) {
    if (!strip || (dlg && dlg.open)) return;
    const track = strip.querySelector(".pv-track");
    if (e.key === "Escape") { e.preventDefault(); closeStrip(true); }
    else if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); step(track, 1); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); step(track, -1); }
    else if (e.key === "Home") { e.preventDefault(); track.scrollTo({ left: 0 }); }
    else if (e.key === "End") { e.preventDefault(); track.scrollTo({ left: track.scrollWidth }); }
  }
  function openStrip() {
    const imgs = pageImages();
    if (!imgs.length) return;
    closeStrip(false);
    strip = el("div", "pv-strip", { role: "dialog", "aria-modal": "true", "aria-label": "Filmstrip view" });
    const title = el("div", "pv-strip-title");
    title.textContent = (document.querySelector("article h1, h1.article-title")?.textContent || document.title).trim();
    const close = el("button", "pv-btn pv-close", { "aria-label": "Close filmstrip view", type: "button" });
    close.innerHTML = "&times;";
    close.addEventListener("click", () => closeStrip(true));
    const track = el("div", "pv-track", { tabindex: "0" });
    for (const src of imgs) {
      const im = el("img", "", { alt: src.alt || "", loading: "lazy", decoding: "async" });
      if (src.naturalWidth) { im.style.aspectRatio = src.naturalWidth + " / " + src.naturalHeight; }
      im.addEventListener("load", () => { im.classList.add("pv-loaded"); im.style.aspectRatio = ""; }, { once: true });
      im.src = srcOf(src);
      track.appendChild(im);
    }
    // a vertical mouse wheel scrolls the row sideways, like amiwheel
    track.addEventListener("wheel", (e) => {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      track.scrollLeft += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
    }, { passive: false });
    strip.append(track, title, close);
    document.body.appendChild(strip);
    document.documentElement.style.overflow = "hidden";
    document.addEventListener("keydown", stripKeys);
    track.focus({ preventScroll: true });
  }
  document.addEventListener("click", (e) => {
    const b = e.target && e.target.closest ? e.target.closest(".pv-open") : null;
    if (!b) return;
    opener = b;
    setPref(true);
    openStrip();
  });

  // SPA: Quartz replaces <body> contents on navigation, so reset and re-check.
  function onPage() {
    closeStrip(false);
    if (dlg && !dlg.isConnected) dlg = null;
    document.documentElement.style.overflow = "";
    const b = document.querySelector(".pv-open");
    if (b && getPref()) { opener = b; openStrip(); }
  }
  document.addEventListener("prenav", () => closeStrip(false));
  document.addEventListener("nav", onPage);
  if (document.readyState !== "loading") onPage();
  else document.addEventListener("DOMContentLoaded", onPage, { once: true });
}
`

const ICON = {
  type: "element",
  tagName: "svg",
  properties: { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, ariaHidden: "true" },
  children: [
    { type: "element", tagName: "rect", properties: { x: 2, y: 5, width: 20, height: 14, rx: 1 }, children: [] },
    { type: "element", tagName: "path", properties: { d: "M2 8h20M2 16h20M8 5v14M16 5v14" }, children: [] },
  ],
}

export const PhotoView = (userOpts) => {
  const opts = { ...DEFAULTS, ...userOpts }
  return {
    name: "PhotoView",
    htmlPlugins() {
      return [
        () => (tree, file) => {
          let count = 0
          walk(tree, false, (node, inLink) => {
            // Linked images keep their link (vazome issue #2).
            if (node.tagName !== "img" || !node.properties?.src || inLink) return
            if (hasClass(node, "pv-img")) return
            const c = node.properties.className
            node.properties.className = [...(Array.isArray(c) ? c : c ? [c] : []), "pv-img"]
            node.properties.loading = "lazy"
            node.properties.decoding = "async"
            count++
          })
          if (count > 0 && wantsFilmstrip(file, opts.frontmatterKey)) {
            tree.children.unshift({
              type: "element",
              tagName: "button",
              properties: {
                className: ["pv-open"],
                type: "button",
                title: "Every photo full-height in one scrolling row. Your choice is remembered on this device.",
              },
              children: [
                structuredClone(ICON),
                { type: "text", value: "Filmstrip view" },
              ],
            })
          }
        },
      ]
    },
    externalResources() {
      return {
        css: [{ inline: true, content: CSS }],
        js: [{ loadTime: "afterDOMReady", contentType: "inline", script: SCRIPT }],
      }
    },
  }
}

export default PhotoView
