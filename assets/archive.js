// Archive: filter issues by any headline, repo, topic or region.
(function () {
  "use strict";
  var q = document.getElementById("q"), none = document.getElementById("none");
  if (!q) return;
  var cards = Array.prototype.slice.call(document.querySelectorAll("[data-q]"));
  q.addEventListener("input", function () {
    var terms = q.value.toLocaleLowerCase(document.documentElement.lang || 'en').trim().split(/\s+/).filter(Boolean), shown = 0;
    cards.forEach(function (c) {
      var hit = terms.every(function (t) { return c.getAttribute("data-q").indexOf(t) !== -1; });
      c.hidden = !hit; if (hit) shown++;
    });
    document.querySelectorAll(".s-month").forEach(function (m) {
      m.hidden = !m.querySelector("[data-q]:not([hidden])");
    });
    none.hidden = shown > 0;
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "/" && document.activeElement !== q) { ev.preventDefault(); q.focus(); }
  });
})();
