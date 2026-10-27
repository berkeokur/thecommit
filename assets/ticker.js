// Archive ticker: latest-issue headlines, refreshed from site/news.json, then market prices
// from site/quotes.json (written by quotes.py on the server once a day).
(function () {
  "use strict";
  var tk = document.querySelector(".tk");
  if (!tk) return;
  var turkish = document.documentElement.lang === 'tr';
  var SPEED = 60, POLL = 5 * 60 * 1000;  // pixels per second; how often to look for news and prices
  var STALE = 30 * 60 * 60 * 1000;       // prices older than this are hidden: the daily refresh has stopped
  var base = tk.getAttribute("data-base") || "", src = tk.getAttribute("data-src");
  var view = tk.querySelector(".tk-view"), track = tk.querySelector(".tk-track");
  var news = Array.prototype.map.call(track.querySelector(".tk-run").children, function (el) { return el.cloneNode(true); });
  var prices = [], pending = null;
  var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Fill one run until it is wider than the view, copy it, and time the loop by its width.
  // A run is all the news, then all the prices, so the two never mix.
  function lay() {
    var runs = track.querySelectorAll(".tk-run"), run = runs[0], items = news.concat(prices);
    run.textContent = "";
    if (!items.length) return;
    do {
      items.forEach(function (el) { run.appendChild(el.cloneNode(true)); });
    } while (run.scrollWidth < view.clientWidth && run.children.length < 200);
    runs[1].innerHTML = run.innerHTML;
    track.style.setProperty("--tk-dur", Math.max(12, run.scrollWidth / SPEED).toFixed(1) + "s");
  }

  // New content waits for the end of a loop, where both runs line up, so the strip never jumps;
  // just after the page opens the strip has barely moved, so the first prices go straight in.
  var opened = Date.now();
  function update(change) {
    if (still || Date.now() - opened < 5000 || !track.querySelector(".tk-run").children.length) { change(); lay(); }
    else pending = change;
  }
  track.addEventListener("animationiteration", function () {
    if (pending) { pending(); pending = null; lay(); }
  });

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function item(i) {
    var e = el("span", "tk-item"), a = el("a", null, i.text);
    a.href = base + i.href;
    e.appendChild(el("time", null, i.when)); e.appendChild(a);
    return e;
  }

  function quoteItems(q) {
    if (!q || !q.items || !q.items.length || Date.now() - q.stamp * 1000 > STALE) return [];
    var hhmm = new Date(q.stamp * 1000).toLocaleString(turkish ? 'tr-TR' : 'en-GB', { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    var head = el("span", "tk-item tk-mkt");
    head.appendChild(el("time", null, turkish ? "Piyasalar" : "Markets"));
    head.appendChild(el("span", "tk-note", (turkish ? "güncelleme " : "updated ") + hhmm));
    return [head].concat(q.items.map(function (x) {
      var e = el("span", "tk-item tk-q"), up = x.change >= 0;
      e.appendChild(el("b", null, x.name));
      e.appendChild(el("span", "px", x.price.toLocaleString("en-US", { minimumFractionDigits: x.price < 1000 ? 2 : 0, maximumFractionDigits: x.price < 1000 ? 2 : 0 })));
      e.appendChild(el("span", up ? "up" : "down", (up ? "▲ +" : "▼ −") + Math.abs(x.change).toFixed(2) + "%"));
      return e;
    }));
  }

  function show(feed) {
    tk.setAttribute("data-stamp", feed.stamp);
    tk.setAttribute("aria-label", feed.label + (turkish ? " haberler ve piyasalar" : " news and markets"));
    tk.querySelector(".tk-label").lastChild.textContent = feed.label;
    update(function () { news = (feed.items || []).map(item); });
  }

  function get(url) {
    return fetch(url, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  var quoteStamp = null;
  function poll() {
    if (!window.fetch || document.hidden) return;
    if (src) get(src).then(function (feed) {
      if (feed && feed.stamp && feed.stamp !== tk.getAttribute("data-stamp")) show(feed);
    });
    get(base + "quotes.json").then(function (q) {
      var stamp = q && q.stamp, fresh = quoteItems(q);
      // a missing or stale file clears the prices; an unchanged one is left alone
      if (stamp === quoteStamp && fresh.length) return;
      quoteStamp = fresh.length ? stamp : null;
      if (fresh.length || prices.length) update(function () { prices = fresh; });
    });
  }

  var timer;
  window.addEventListener("resize", function () { clearTimeout(timer); timer = setTimeout(lay, 150); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) poll(); });
  setInterval(poll, POLL);
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () { lay(); poll(); });
})();
