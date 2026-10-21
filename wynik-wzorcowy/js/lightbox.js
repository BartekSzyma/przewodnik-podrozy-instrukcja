/* Lightbox zdjęć: bez bibliotek, role="dialog" aria-modal, pułapka fokusu, zwrot fokusu, Esc / tło / przycisk / przeciągnięcie w dół,
   strzałki i przeciągnięcie w poziomie, bez przewijania strony. Zdjęcia (img.zoom[data-full]) otwierane przez delegację zdarzeń (faza przechwytywania),
   więc działa też dla dymków Leaflet tworzonych dynamicznie (Leaflet zatrzymuje propagację kliknięć wewnątrz dymka). Dane podpisu: window.GUIDE.images. */
(function () {
  "use strict";
  var IM = (window.GUIDE && window.GUIDE.images) || {};
  var root, fig, imgEl, capAlt, capCr, cnt, bX, bP, bN, loadEl;
  var items = [], idx = 0, opener = null, open = false, tx = 0, ty = 0, tOn = false, gen = 0;
  var SEL = "img.zoom[data-full]";

  function keyOf(src) { var m = /([a-z0-9_]+)\.jpg/i.exec(src || ""); return m ? m[1] : null; }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; }

  function collect() {
    var seen = {}, out = [];
    Array.prototype.forEach.call(document.querySelectorAll(SEL), function (im) {
      if (im.closest(".leaflet-popup")) return;
      var k = keyOf(im.getAttribute("data-full"));
      if (!k || seen[k]) return;
      seen[k] = 1;
      out.push({ key: k, src: im.getAttribute("data-full"), alt: im.getAttribute("alt") || "" });
    });
    return out;
  }

  function build() {
    if (root) return;
    root = el("div", "lb"); root.hidden = true;
    root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", "Podgląd zdjęcia");
    bX = el("button", "lb-x", "×"); bX.type = "button"; bX.setAttribute("aria-label", "Zamknij podgląd zdjęcia");
    bP = el("button", "lb-nav lb-prev", "‹"); bP.type = "button"; bP.setAttribute("aria-label", "Poprzednie zdjęcie");
    bN = el("button", "lb-nav lb-next", "›"); bN.type = "button"; bN.setAttribute("aria-label", "Następne zdjęcie");
    fig = el("figure", "lb-fig");
    var wrap = el("div", "lb-imgwrap");
    imgEl = el("img", "lb-img"); imgEl.alt = "";
    loadEl = el("span", "lb-load", "Ładowanie zdjęcia…"); loadEl.setAttribute("role", "status");
    wrap.appendChild(imgEl); wrap.appendChild(loadEl);
    var cap = el("figcaption", "lb-cap"); cap.id = "lb-cap";
    capAlt = el("p", "lb-alt"); capCr = el("p", "lb-cr");
    cap.appendChild(capAlt); cap.appendChild(capCr);
    fig.appendChild(wrap); fig.appendChild(cap);
    cnt = el("div", "lb-count"); cnt.setAttribute("aria-live", "polite");
    root.appendChild(bX); root.appendChild(bP); root.appendChild(fig); root.appendChild(bN); root.appendChild(cnt);
    document.body.appendChild(root);
    root.setAttribute("aria-describedby", "lb-cap");

    bX.addEventListener("click", close);
    bP.addEventListener("click", function () { step(-1); });
    bN.addEventListener("click", function () { step(1); });
    root.addEventListener("click", function (e) {
      if (e.target === root || e.target === fig || e.target.classList.contains("lb-imgwrap")) close();
    });
    root.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) { tOn = false; return; }
      tOn = true; tx = e.touches[0].clientX; ty = e.touches[0].clientY;
    }, { passive: true });
    root.addEventListener("touchend", function (e) {
      if (!tOn || !e.changedTouches.length) return;
      tOn = false;
      var dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
      if (dy > 70 && dy > Math.abs(dx) * 1.5) close();
      else if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
    }, { passive: true });
    root.addEventListener("touchcancel", function () { tOn = false; }, { passive: true });
    imgEl.addEventListener("load", function () { root.classList.remove("is-loading"); });
    imgEl.addEventListener("error", function () {
      root.classList.remove("is-loading");
      var it = items[idx];
      if (it && !imgEl.dataset.fb) { imgEl.dataset.fb = "1"; imgEl.src = "img/t/" + it.key + ".jpg"; }
      else loadEl.textContent = "Nie udało się wczytać zdjęcia.";
    });
  }

  function caption(it) {
    var m = IM[it.key] || {};
    capAlt.textContent = m.alt || it.alt;
    capCr.textContent = "";
    if (m.author) {
      capCr.appendChild(document.createTextNode("Zdjęcie: " + m.author + " / "));
      if (m.licUrl) { var a = el("a", null, m.lic); a.href = m.licUrl; a.target = "_blank"; a.rel = "noopener"; capCr.appendChild(a); }
      else capCr.appendChild(document.createTextNode(m.lic || ""));
      capCr.appendChild(document.createTextNode(" / "));
      var c = el("a", null, "Wikimedia Commons"); c.href = m.page; c.target = "_blank"; c.rel = "noopener"; capCr.appendChild(c);
    }
  }

  function show(i) {
    var n = items.length;
    idx = ((i % n) + n) % n;
    var it = items[idx];
    gen++;
    delete imgEl.dataset.fb;
    root.classList.add("is-loading");
    loadEl.textContent = "Ładowanie zdjęcia…";
    imgEl.alt = (IM[it.key] && IM[it.key].alt) || it.alt;
    imgEl.src = it.src;                       // pełny plik (do 1600 px) wczytywany dopiero teraz
    caption(it);
    cnt.textContent = (idx + 1) + " / " + n;
    bP.hidden = bN.hidden = n < 2;
  }
  function step(d) { if (open && items.length > 1) show(idx + d); }

  function focusables() {
    return Array.prototype.filter.call(root.querySelectorAll("button, a[href]"), function (e) { return !e.hidden && e.offsetParent !== null; });
  }
  function openAt(img) {
    build();
    var key = keyOf(img.getAttribute("data-full"));
    items = collect();
    var i = -1;
    items.forEach(function (it, k) { if (it.key === key) i = k; });
    if (i < 0) { items.push({ key: key, src: img.getAttribute("data-full"), alt: img.getAttribute("alt") || "" }); i = items.length - 1; }
    opener = img;
    open = true;
    root.hidden = false;
    document.documentElement.classList.add("lb-open");
    show(i);
    requestAnimationFrame(function () { root.classList.add("is-on"); });
    bX.focus();
  }
  function close() {
    if (!open) return;
    open = false;
    root.classList.remove("is-on");
    root.hidden = true;
    imgEl.removeAttribute("src");
    document.documentElement.classList.remove("lb-open");
    var o = opener; opener = null;
    if (o && document.contains(o)) { try { o.focus({ preventScroll: true }); } catch (e) { o.focus(); } }
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t && t.nodeType === 1 && t.matches && t.matches(SEL) && !(root && root.contains(t))) { e.preventDefault(); openAt(t); }
  }, true);
  document.addEventListener("keydown", function (e) {
    var t = e.target;
    if (!open) {
      if ((e.key === "Enter" || e.key === " ") && t && t.matches && t.matches(SEL)) { e.preventDefault(); openAt(t); }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    else if (e.key === "Tab") {
      var f = focusables();
      if (!f.length) { e.preventDefault(); return; }
      var first = f[0], last = f[f.length - 1], a = document.activeElement;
      if (!root.contains(a)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    }
  }, true);
  document.addEventListener("focusin", function (e) {
    if (open && !root.contains(e.target)) { var f = focusables(); if (f.length) f[0].focus(); }
  });

  window.GuideLightbox = { close: close, isOpen: function () { return open; }, count: function () { return items.length; }, index: function () { return idx; } };
})();
