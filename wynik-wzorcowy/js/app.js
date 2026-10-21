/* Logika strony: mapa Leaflet, nawigacja, checklista. Dane: window.GUIDE (js/data.js). */
(function () {
  "use strict";
  var G = window.GUIDE;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- checklista z localStorage (opcjonalna) ---------- */
  var KEY = "argentyna2027-checklist-v1";
  function loadState() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
  function saveState(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* strona działa bez zapisu */ } }
  (function checklist() {
    var st = loadState();
    var boxes = $$(".chk input[type=checkbox]");
    function count() {
      var n = boxes.filter(function (b) { return b.checked; }).length;
      var out = $("#chk-count"); if (out) out.textContent = n + " / " + boxes.length;
    }
    boxes.forEach(function (b) {
      if (st[b.dataset.id]) b.checked = true;
      b.addEventListener("change", function () {
        var s = loadState(); if (b.checked) s[b.dataset.id] = 1; else delete s[b.dataset.id];
        saveState(s); count();
      });
    });
    var reset = $("#chk-reset");
    if (reset) reset.addEventListener("click", function () {
      boxes.forEach(function (b) { b.checked = false; }); saveState({}); count();
    });
    count();
  })();

  /* ---------- aktywna sekcja w nawigacji ---------- */
  (function nav() {
    var links = $$(".snav a");
    var secs = links.map(function (a) { return $(a.getAttribute("href")); }).filter(Boolean);
    function onScroll() {
      var y = window.scrollY + 90, cur = null;
      secs.forEach(function (s) { if (s.offsetTop <= y) cur = s.id; });
      links.forEach(function (a) { a.classList.toggle("on", a.getAttribute("href") === "#" + cur); });
    }
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
  })();

  /* ---------- mapa ---------- */
  var wrap = $("#mapwrap");
  function fallback(reason) {
    if (!wrap) return;
    wrap.classList.add("is-fallback");
    var n = $("#fallback-note"); if (n) n.textContent = reason;
  }
  if (typeof L === "undefined") {
    fallback("Biblioteka mapy (Leaflet) się nie załadowała, więc pokazujemy schemat trasy offline. Lista atrakcji i noclegów jest w sekcjach poniżej.");
    $$(".chip[data-day]").forEach(function (c) { c.disabled = true; });
    return;
  }

  var segColor = {}; Object.keys(G.segments).forEach(function (k) { segColor[k] = G.segments[k][1]; });
  var map = L.map("map", { scrollWheelZoom: false, worldCopyJump: false });
  /* tile.openstreetmap.org blokuje strony otwierane z pliku (brak nagłówka Referer), a CARTO wymaga teraz klucza API.
     Dlatego: na stronie udostępnionej przez http(s) domyślny jest OpenStreetMap (jasne zasady użycia, atrybucja poniżej),
     a przy otwarciu z pliku (file://) domyślny jest Esri World Street Map (bez klucza). OpenTopoMap (poziomice) jest do wyboru zawsze. */
  var osmAttr = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  var naSerwerze = /^https?:$/.test(location.protocol);
  var bases = {
    "OpenStreetMap": L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: osmAttr
    }),
    "Mapa drogowa (Esri)": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      attribution: 'Tiles &copy; <a href="https://www.esri.com">Esri</a> &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, HERE, OpenStreetMap contributors'
    }),
    "Topograficzna (OpenTopoMap)": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 17, subdomains: "abc",
      attribution: 'Dane: ' + osmAttr + ', SRTM | Styl: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'
    })
  };
  var tiles = bases[naSerwerze ? "OpenStreetMap" : "Mapa drogowa (Esri)"].addTo(map);
  L.control.layers(bases, null, { position: "topright", collapsed: true }).addTo(map);
  var loaded = 0, errors = 0;
  Object.keys(bases).forEach(function (k) {
    bases[k].on("tileload", function () { loaded++; });
    bases[k].on("tileerror", function () {
      errors++;
      if (loaded === 0 && errors >= 4) fallback("Kafelki mapy nie załadowały się (brak sieci lub blokada), więc pokazujemy schemat trasy offline.");
    });
  });
  setTimeout(function () { if (loaded === 0) fallback("Kafelki mapy nie załadowały się, więc pokazujemy schemat trasy offline."); }, 12000);

  var layers = { route: L.layerGroup(), sights: L.layerGroup(), lodging: L.layerGroup() };
  var byId = {};

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function popup(p) {
    var h = "";
    if (p.img) h += '<img class="zoom" tabindex="0" role="button" aria-label="Powiększ zdjęcie: ' + esc(p.alt || p.name) + '" data-full="img/' + p.img + '.jpg" src="img/t/' + p.img + '.jpg" alt="' + esc(p.alt || p.name) + '" loading="lazy" width="240" height="110">';
    if (p.credit) h += '<div class="cr">' + p.credit + "</div>";
    h += "<h4>" + p.name + "</h4>";
    if (p.tags && p.tags.length) h += p.tags.map(function (t) { return '<span class="tag tag-warn">' + t + "</span> "; }).join("");
    h += '<div class="pp">' + p.desc + "</div>";
    if (p.price) h += '<div class="pp"><strong>' + p.price + "</strong></div>";
    var src = "";
    if (p.src && p.src[1]) src += '<a href="' + p.src[1] + '" target="_blank" rel="noopener">Źródło: ' + p.src[0] + "</a>";
    else if (p.src) src += "Źródło informacji: " + p.src[0];
    if (p.osm) src += (src ? " · " : "") + '<a href="' + p.osm + '" target="_blank" rel="noopener">współrzędne: OSM</a>';
    h += '<div class="src">' + src + "</div>";
    return h;
  }
  function icon(p) {
    var shape = p.layer === "lodging" ? "mk-sq" : (p.layer === "route" ? "mk-dia" : "mk-circle");
    var cls = "mk " + shape + (p.conf === "low" ? " mk-hollow" : "") + (p.conf === "medium" ? " mk-approx" : "");
    return L.divIcon({ className: "", html: '<span class="' + cls + '" style="--c:' + segColor[p.seg] + '"></span>', iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -10] });
  }
  /* ceny w dymkach i podpowiedziach powstają dynamicznie: renderuj je w aktualnej walucie po otwarciu */
  function renderPrices(e) {
    var node = (e.popup || e.tooltip || {}).getElement && (e.popup || e.tooltip).getElement();
    if (node && window.GuidePrices) { window.GuidePrices.renderIn(node); if (e.popup && e.popup._updateLayout) { e.popup._updateLayout(); e.popup._updatePosition(); } }
  }
  map.on("popupopen", renderPrices);
  map.on("tooltipopen", renderPrices);
  G.places.forEach(function (p) {
    var m = L.marker([p.lat, p.lon], { icon: icon(p), title: p.name.replace(/&amp;/g, "&"), keyboard: true, alt: p.name.replace(/&amp;/g, "&") });
    m.bindPopup(popup(p), { maxWidth: 260 });
    m.addTo(layers[p.layer]);
    byId[p.id] = m;
  });

  /* łuki lotów (krzywe Béziera 2. rzędu) i autobus */
  var lines = {};
  function arc(a, b, bend) {
    var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1];
    var cx = mx - dy * bend, cy = my + dx * bend, pts = [];
    for (var i = 0; i <= 48; i++) {
      var t = i / 48, u = 1 - t;
      pts.push([u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]]);
    }
    return pts;
  }
  function labelAt(pts, text) {
    var mid = pts[Math.floor(pts.length / 2)];
    return L.marker(mid, { opacity: 0, interactive: false, keyboard: false }).bindTooltip(text, { permanent: true, direction: "center", className: "lbl", opacity: 1 });
  }
  G.routes.forEach(function (r) {
    var pts = r.type === "flight" ? arc(r.from, r.to, r.bend || 0.22) : (r.bend ? arc(r.from, r.to, r.bend) : [r.from, r.to]);
    var style = r.type === "flight" ? { color: "#0b6580", weight: 3, opacity: .9 } : { color: "#555e70", weight: 3, opacity: .95, dashArray: "8 8" };
    var pl = L.polyline(pts, style).bindTooltip(r.tip, { sticky: true });
    pl.addTo(layers.route); labelAt(pts, r.label).addTo(layers.route);
    lines[r.id] = { line: pl, base: style };
  });

  var boxes = $$("#layer-ctl input[data-layer]");
  boxes.forEach(function (b) {
    var g = layers[b.dataset.layer];
    if (b.checked) g.addTo(map);
    b.addEventListener("change", function () { if (b.checked) g.addTo(map); else map.removeLayer(g); });
  });

  var allLL = G.places.map(function (p) { return [p.lat, p.lon]; });
  function fitAll() { map.fitBounds(allLL, { padding: [30, 30] }); }
  fitAll();

  function focusDay(n) {
    var d = G.days.filter(function (x) { return x.n === n; })[0]; if (!d) return;
    var ll = (d.focus || []).filter(function (id) { return byId[id]; }).map(function (id) { return byId[id].getLatLng(); });
    map.closePopup();
    Object.keys(lines).forEach(function (k) { lines[k].line.setStyle(lines[k].base); });
    if (d.route && lines[d.route]) lines[d.route].line.setStyle({ weight: 6, opacity: 1 });
    if (ll.length > 1) map.fitBounds(ll, { padding: [50, 50], maxZoom: 13 });
    else if (ll.length === 1) map.setView(ll[0], 11);
    else fitAll();
    $$(".chip[data-day]").forEach(function (c) { c.classList.toggle("on", +c.dataset.day === n); });
    var first = d.focus && byId[d.focus[d.focus.length > 2 ? 1 : 0]];
    if (first && ll.length) first.openPopup();
  }
  window.focusDay = focusDay;
  $$("[data-focus]").forEach(function (b) {
    b.addEventListener("click", function () {
      var n = +b.dataset.focus;
      var mb = $("#mapwrap"); if (mb) mb.scrollIntoView({ behavior: "smooth", block: "start" });
      focusDay(n);
    });
  });
  var resetBtn = $("#map-reset");
  if (resetBtn) resetBtn.addEventListener("click", function () {
    Object.keys(lines).forEach(function (k) { lines[k].line.setStyle(lines[k].base); });
    $$(".chip[data-day]").forEach(function (c) { c.classList.remove("on"); }); fitAll();
  });
  window.__guideMap = { map: map, byId: byId, layers: layers, lines: lines };
  setTimeout(function () { map.invalidateSize(); }, 300);
})();
