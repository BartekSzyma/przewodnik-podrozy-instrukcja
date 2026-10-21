/* Kursy NBP, ceny w kilku walutach, kalkulator i budżet liczony z pozycji. Bez bibliotek.
   Ceny w HTML to <span class="price" data-cur data-min [data-max] [data-from] [data-approx] [data-exact] [data-b]>;
   tekst domyślny (PLN główna, kursy awaryjne) generuje _build/prices.py, a ten plik renderuje go ponownie po każdej zmianie kursów lub waluty. */
(function () {
  "use strict";
  var G = window.GUIDE || {};
  var NB = " ";
  var FB = G.fx || { rates: { USD: 3.8889, EUR: 4.3641, ARS: 0.00255 }, date: "2026-10-21", tables: { A: "205/A/NBP/2026", B: "042/B/NBP/2026" } };
  var KEY_RATES = "argentyna2027-nbp-v1", KEY_CUR = "argentyna2027-fxcur-v1", KEY_CALC = "argentyna2027-fxcalc-v1";
  var NBP = "https://api.nbp.pl/api/exchangerates/rates/";
  var TIMEOUT = 6000;
  var CURS = ["PLN", "ARS", "USD", "EUR"];
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- localStorage zawsze w try/catch ---------- */
  function sget(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* strona działa bez zapisu */ } }

  var S = { rates: { PLN: 1 }, eff: {}, table: {}, source: "fallback", fetchedOn: null, notice: "", primary: "PLN" };

  /* ---------- pomocnicze ---------- */
  function hu(x) { return Math.floor(x + 0.5); }
  function groupInt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NB); }
  function fmtN(n) { return groupInt(n); }
  function fmtOrig(x) {
    if (x === Math.floor(x)) return groupInt(x);
    var i = Math.floor(x);
    return groupInt(i) + "," + x.toFixed(2).slice(-2);
  }
  function fmtDec(x, dec) {
    var s = Math.abs(x).toFixed(dec), p = s.split(".");
    return (x < 0 ? "−" : "") + groupInt(p[0]) + (p[1] ? "," + p[1] : "");
  }
  function unit(cur, txt) { return cur === "PLN" ? txt + NB + "zł" : cur + NB + txt; }
  function roundTo(cur, v, exact) {
    if (cur === "PLN") return exact ? hu(v) : (v > 1000 ? hu(v / 10) * 10 : hu(v));
    if (cur === "ARS") return v >= 10000 ? hu(v / 1000) * 1000 : hu(v / 100) * 100;
    return hu(v);
  }
  function rate(c) { return S.rates[c]; }
  function ymd(s) { var m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(s || ""); return m ? m[3] + "." + m[2] + "." + m[1] : "?"; }
  function todayStr() {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function isRate(c, x) {
    if (typeof x !== "number" || !isFinite(x) || x <= 0) return false;
    return c === "ARS" ? (x > 1e-5 && x < 1) : (x > 0.5 && x < 50);
  }
  function isDate(s) { return typeof s === "string" && /^\d{4}-\d\d-\d\d$/.test(s); }

  /* ---------- renderowanie ceny (lustro _build/prices.py: render_text) ---------- */
  function renderSpan(el) {
    var d = el.dataset, cur = d.cur, a = parseFloat(d.min), b = d.max !== undefined ? parseFloat(d.max) : null;
    if (!isFinite(a) || !rate(cur)) return;
    var exact = d.exact === "1", approx = d.approx === "1", od = d.from === "1" ? "od" + NB : "";
    var P = S.primary, plnv = [a * rate(cur)];
    if (b !== null) plnv.push(b * rate(cur));
    var shown = [P].concat(["PLN", "ARS"].filter(function (c) { return c !== P; }));
    function part(c, first) {
      var txt, conv;
      if (c === cur) { txt = (b !== null ? [a, b] : [a]).map(fmtOrig).join("–"); conv = false; }
      else {
        var vals = plnv.map(function (p) { return roundTo(c, p / rate(c), exact); });
        if (vals.length === 2 && vals[0] === vals[1]) vals = vals.slice(0, 1);
        txt = vals.map(fmtN).join("–"); conv = true;
      }
      var s = unit(c, txt);
      if (first && (conv || approx)) s = "ok." + NB + s;
      return od + s;
    }
    var main = part(P, true), rest = shown.slice(1).map(function (c) { return part(c, false); });
    if (shown.indexOf(cur) < 0) rest.push("(oryginał: " + od + unit(cur, (b !== null ? [a, b] : [a]).map(fmtOrig).join("–")) + ")");
    var html = '<span class="pm">' + main + '</span><span class="ps">' + (rest.length ? " · " + rest.join(" · ") : "") + "</span>";
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  /* ---------- budżet ---------- */
  var B = null;
  function budget() {
    var tbl = $("#budget-table");
    if (!tbl) return;
    var res = { A: [0, 0, 0], B: [0, 0, 0], T: [0, 0, 0], split: {} };
    $$("tr.brow", tbl).forEach(function (tr) {
      $$("td.bud", tr).forEach(function (td) {
        var col = +td.dataset.col, pln = hu(parseFloat(td.dataset.v) * rate(td.dataset.cur));
        td._pln = pln;
        res[tr.dataset.grp][col] += pln;
        if (col === 1) res.split[tr.dataset.status] = (res.split[tr.dataset.status] || 0) + pln;
      });
    });
    for (var i = 0; i < 3; i++) res.T[i] = res.A[i] + res.B[i];
    var mc = tbl.dataset.magCur, mr = rate(mc), base = hu(parseFloat(tbl.dataset.magBase) * mr);
    res.mag = [hu(parseFloat(tbl.dataset.magLo) * mr) - base, hu(parseFloat(tbl.dataset.magHi) * mr) - base];
    B = res;
    function cell(td, cur, v, pln) {
      var P = S.primary, txt;
      txt = (cur === P) ? fmtOrig(v) : fmtN(roundTo(P, pln / rate(P), true));
      var rest = ["PLN", "ARS"].filter(function (c) { return c !== P; }).map(function (c) {
        return unit(c, c === cur ? fmtOrig(v) : fmtN(roundTo(c, pln / rate(c), true)));
      });
      var html = '<span class="pm">' + unit(P, txt) + '</span><span class="ps">' + rest.join(" · ") + "</span>";
      if (td.innerHTML !== html) td.innerHTML = html;
    }
    $$("td.bud", tbl).forEach(function (td) { cell(td, td.dataset.cur, parseFloat(td.dataset.v), td._pln); });
    $$("td.bsum", tbl).forEach(function (td) { var v = res[td.dataset.sum][+td.dataset.col]; cell(td, "PLN", v, v); });
    $$(".price[data-b]").forEach(function (el) {
      var k = el.dataset.b, mn, mx = null;
      if (k === "tl") mn = res.T[0]; else if (k === "tm") mn = res.T[1]; else if (k === "th") mn = res.T[2];
      else if (k === "mag") { mn = res.mag[0]; mx = res.mag[1]; }
      else if (k === "tm_mag") { mn = res.T[1] + res.mag[0]; mx = res.T[1] + res.mag[1]; }
      else if (k.indexOf("split:") === 0) mn = res.split[k.slice(6)] || 0;
      else return;
      el.dataset.min = String(mn);
      if (mx !== null) el.dataset.max = String(mx);
    });
  }

  /* ---------- panel kursów, kalkulator ---------- */
  function fxText() {
    var e = S.eff, same = e.USD === e.EUR;
    var d = "Kursy NBP z dnia " + ymd(e.USD) + (same ? "" : " (USD) i " + ymd(e.EUR) + " (EUR)") + " (tabela A" + (S.table.A ? ", nr " + S.table.A : "") + "); ARS z dnia " + ymd(e.ARS) + " (tabela B" + (S.table.B ? ", nr " + S.table.B : "") + ").";
    var how = S.source === "live" ? " Pobrano z NBP dziś." : (S.source === "cache" ? " Z pamięci przeglądarki (pobrano " + ymd(S.fetchedOn) + ")." : (S.source === "cache-old" ? " Z pamięci przeglądarki (pobrano " + ymd(S.fetchedOn) + ")." : " Kursy awaryjne wbudowane w stronę."));
    return d + how;
  }
  function pl(x) { return String(x).replace(".", ","); }
  function widget() {
    var fx = $("#fx");
    if (!fx) return;
    var set = function (id, txt) { var el = $(id); if (el && el.textContent !== txt) el.textContent = txt; };
    set("#fx-short", S.source === "fallback" ? "(awaryjne)" : ymd(S.eff.USD));
    set("#fx-dates", fxText());
    var ul = $("#fx-rates");
    if (ul) {
      var li = ["USD", "EUR", "ARS"].map(function (c) { return "1 " + c + " = " + pl(S.rates[c]) + " zł"; });
      li.push("1 USD = " + fmtN(hu(S.rates.USD / S.rates.ARS)) + " ARS (wynik z kursów NBP)");
      var html = li.map(function (t) { return "<li>" + t + "</li>"; }).join("");
      if (ul.innerHTML !== html) ul.innerHTML = html;
    }
    var w = $("#fx-warn");
    if (w) { w.textContent = S.notice; w.hidden = !S.notice; }
    $$(".fx-b", fx).forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.cur === S.primary ? "true" : "false"); });
    calc();
  }
  function parseAmt(s) {
    var t = String(s).replace(/[\s ]/g, "").replace(",", ".");
    if (!/^\d+(\.\d*)?$|^\.\d+$/.test(t)) return NaN;
    return parseFloat(t);
  }
  function calc(save) {
    var amt = $("#fx-amt"), from = $("#fx-from"), to = $("#fx-to"), out = $("#fx-out");
    if (!amt || !out) return null;
    var a = parseAmt(amt.value), res = null;
    if (!isFinite(a)) { out.textContent = "Wpisz kwotę (liczbę)."; out.dataset.value = ""; return null; }
    res = a * S.rates[from.value] / S.rates[to.value];
    var dec = to.value === "ARS" && res >= 100 ? 0 : 2;
    var lab = function (c) { return c === "PLN" ? "zł" : c; };
    out.textContent = fmtDec(a, a === Math.floor(a) ? 0 : 2) + NB + lab(from.value) + " = " + fmtDec(res, dec) + NB + lab(to.value) + " (kurs średni NBP)";
    out.dataset.value = String(res);
    if (save) sset(KEY_CALC, JSON.stringify({ a: amt.value, f: from.value, t: to.value }));
    return res;
  }

  function renderIn(root) {
    $$(".price", root || document).forEach(renderSpan);
  }
  function renderAll() {
    budget();
    renderIn(document);
    widget();
  }

  /* ---------- kursy: pamięć podręczna, pobieranie ---------- */
  function validEntry(e) {
    if (!e || typeof e !== "object" || !isDate(e.fetchedOn) || !e.rates || !e.eff) return false;
    return ["USD", "EUR", "ARS"].every(function (c) { return isRate(c, e.rates[c]) && isDate(e.eff[c]); });
  }
  function readCache() {
    var raw = sget(KEY_RATES);
    if (!raw) return null;
    try { var e = JSON.parse(raw); return validEntry(e) ? e : null; } catch (x) { return null; }
  }
  function fallbackEntry() {
    return { fetchedOn: null, rates: FB.rates, eff: { USD: FB.date, EUR: FB.date, ARS: FB.date }, table: FB.tables };
  }
  function apply(e, source) {
    S.rates = { PLN: 1, USD: e.rates.USD, EUR: e.rates.EUR, ARS: e.rates.ARS };
    S.eff = e.eff; S.table = e.table || {}; S.source = source; S.fetchedOn = e.fetchedOn;
    S.notice = source === "fallback" ? "kursy awaryjne z " + ymd(FB.date) + " – brak połączenia z NBP" : "";
  }
  function fetchOne(base, tbl, code) {
    var url = base + tbl + "/" + code.toLowerCase() + "/last/1/?format=json";
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer, tp = new Promise(function (_, rej) { timer = setTimeout(function () { if (ctrl) ctrl.abort(); rej(new Error("timeout")); }, TIMEOUT); });
    var req = fetch(url, ctrl ? { signal: ctrl.signal } : {}).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (j) {
      var r = j && Array.isArray(j.rates) && j.rates.length ? j.rates[j.rates.length - 1] : null;
      if (!j || String(j.code).toUpperCase() !== code || !r || !isRate(code, r.mid) || !isDate(r.effectiveDate)) throw new Error("zły format odpowiedzi NBP");
      return { mid: r.mid, date: r.effectiveDate, no: typeof r.no === "string" ? r.no : "" };
    });
    return Promise.race([req, tp]).then(function (v) { clearTimeout(timer); return v; }, function (e) { clearTimeout(timer); throw e; });
  }
  function load(opts) {
    opts = opts || {};
    var base = opts.base || NBP, cached = readCache();
    if (cached && cached.fetchedOn === todayStr() && !opts.force) { apply(cached, "cache"); renderAll(); return Promise.resolve(S); }
    if (cached) apply(cached, "cache-old"); else apply(fallbackEntry(), "fallback");
    renderAll();
    return Promise.all([fetchOne(base, "a", "USD"), fetchOne(base, "a", "EUR"), fetchOne(base, "b", "ARS")]).then(function (r) {
      var e = { fetchedOn: todayStr(), rates: { USD: r[0].mid, EUR: r[1].mid, ARS: r[2].mid },
        eff: { USD: r[0].date, EUR: r[1].date, ARS: r[2].date }, table: { A: r[0].no, B: r[2].no } };
      sset(KEY_RATES, JSON.stringify(e));
      apply(e, "live"); renderAll();
      return S;
    }).catch(function (err) {
      if (cached) S.notice = "Nie udało się odświeżyć kursów NBP – używam kursów z " + ymd(cached.fetchedOn) + ".";
      S.lastError = String(err && err.message || err);
      renderAll();
      return S;
    });
  }

  function setPrimary(c) {
    if (CURS.indexOf(c) < 0) return;
    S.primary = c; sset(KEY_CUR, c);
    renderAll();
  }

  /* ---------- start ---------- */
  function init() {
    apply(fallbackEntry(), "fallback");
    var saved = sget(KEY_CUR);
    if (saved && CURS.indexOf(saved) >= 0) S.primary = saved;
    var fx = $("#fx");
    if (fx) {
      fx.hidden = false;
      $$(".fx-b", fx).forEach(function (b) { b.addEventListener("click", function () { setPrimary(b.dataset.cur); }); });
      var tg = $("#fx-toggle"), panel = $("#fx-panel");
      var toggle = function (open) {
        panel.hidden = !open; tg.setAttribute("aria-expanded", open ? "true" : "false");
        $("#fx .fx-caret").textContent = open ? "▴" : "▾";
      };
      tg.addEventListener("click", function () { toggle(panel.hidden); });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden && !document.querySelector(".lb:not([hidden])")) { toggle(false); tg.focus(); } });
      document.addEventListener("click", function (e) { if (!panel.hidden && !fx.contains(e.target)) toggle(false); });
      var raw = sget(KEY_CALC);
      if (raw) {
        try {
          var c = JSON.parse(raw);
          if (c && typeof c.a === "string" && CURS.indexOf(c.f) >= 0 && CURS.indexOf(c.t) >= 0) { $("#fx-amt").value = c.a; $("#fx-from").value = c.f; $("#fx-to").value = c.t; }
        } catch (x) { /* ignoruj */ }
      }
      ["input", "change"].forEach(function (ev) { $("#fx-calc").addEventListener(ev, function () { calc(true); }); });
      $("#fx-calc").addEventListener("submit", function (e) { e.preventDefault(); });
      var nav = $(".snav");
      var setNav = function () { if (nav) document.documentElement.style.setProperty("--navbox", nav.offsetHeight + "px"); };
      setNav(); window.addEventListener("resize", setNav);
      if (window.ResizeObserver && nav) new ResizeObserver(setNav).observe(nav);
    }
    load();
  }

  window.GuidePrices = { renderIn: renderIn, renderAll: renderAll, load: load, setPrimary: setPrimary, calc: calc, state: S, budget: function () { return B; }, version: 1 };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
