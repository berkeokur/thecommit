// Website reader. On wide screens the A4 pages are a book, two facing pages fitted to the window,
// turned as bending paper: with the arrows, the keys, a click on a page's outer edge, or by taking
// hold of the page and dragging it. On narrow screens the pages scroll, one under the other.
// ?print=1 prints.
(function () {
  "use strict";
  function ready(fn) {
    (function wait() { window.__ready ? fn() : setTimeout(wait, 50); })();
  }
  ready(function () {
    var root = document.getElementById("root");
    var pages = Array.prototype.slice.call(document.querySelectorAll(".page"));
    var links = Array.prototype.slice.call(document.querySelectorAll(".cx-pages a"));
    var bar = document.querySelector(".cx-bar"), tk = document.querySelector(".tk");
    document.querySelectorAll('.cx-language').forEach(function (link) {
      link.addEventListener('click', function () {
        link.setAttribute('href', link.getAttribute('href').split('#')[0] +
          (window.location.hash || '#p' + (at + 1)));
      });
    });
    var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var PW = 794, PH = 1123, GAP = 0;  // A4 at 96 dpi
    var TURN = 850, STRIPS = 14, BEND = 70;  // ms per turn; strips the sheet bends at; most curl, in degrees
    var EDGE = 0.09;  // share of a page's width, at its outer edge, that turns it when clicked
    var WIDE = 900;  // narrowest window that shows the book
    pages.forEach(function (p, i) { p.id = "p" + (i + 1); });

    var prevBtn = document.createElement("button"), nextBtn = document.createElement("button");
    prevBtn.className = "cx-turn cx-turn-prev"; prevBtn.type = "button"; prevBtn.setAttribute("aria-label", document.documentElement.lang === "tr" ? "Önceki sayfalar" : "Previous pages"); prevBtn.textContent = "‹";
    nextBtn.className = "cx-turn cx-turn-next"; nextBtn.type = "button"; nextBtn.setAttribute("aria-label", document.documentElement.lang === "tr" ? "Sonraki sayfalar" : "Next pages"); nextBtn.textContent = "›";
    document.body.appendChild(prevBtn); document.body.appendChild(nextBtn);
    var hint = document.createElement("div");
    hint.className = "cx-edge";
    document.body.appendChild(hint);

    var per = 2, at = 0, busy = false, book = false;  // pages per view; first page in view; book or scroll
    function view(i) { return i - i % per; }
    function shown(first) { return pages.slice(first, first + per); }

    // zoom only after the template has measured and fixed its boxes at full size
    function fit() {
      var w = document.documentElement.clientWidth, top = bar ? bar.offsetHeight : 0, foot = tk ? tk.offsetHeight : 0;
      var was = book;
      book = w >= WIDE && pages.length > 1;
      document.body.classList.toggle("cx-book", book);
      document.body.classList.toggle("cx-two", book);
      if (!book) {
        per = 1;
        document.documentElement.style.setProperty("--cx-zoom", Math.min(1, (w - 24) / PW).toFixed(3));
        root.style.height = "";
        pages.forEach(function (p) { p.style.gridColumn = ""; });
        showHint(null);
        mark(at);
        if (was) pages[at].scrollIntoView();
        return;
      }
      per = 2;
      var h = window.innerHeight - top - foot - 32;
      var z = Math.min(1, (w - 120) / (PW * per + GAP), h / PH);
      document.documentElement.style.setProperty("--cx-zoom", z.toFixed(3));
      root.style.height = (window.innerHeight - top - foot) + "px";
      pages.forEach(function (p, i) { p.style.gridColumn = String(i % 2 + 1); });
      show(view(at));
    }

    // scrolling: the page in view is the current one
    function mark(i) {
      at = i;
      links.forEach(function (a, k) { a.classList.toggle("on", k === i); a.setAttribute("aria-current", k === i ? "page" : "false"); });
    }
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        if (book) return;
        entries.forEach(function (e) { if (e.isIntersecting) mark(pages.indexOf(e.target)); });
      }, { rootMargin: "-45% 0px -50% 0px" });
      pages.forEach(function (p) { io.observe(p); });
    }

    function show(first) {
      at = first;
      var on = shown(first);
      pages.forEach(function (p) { p.classList.toggle("cx-on", on.indexOf(p) >= 0); p.classList.remove("cx-under", "cx-over"); });
      links.forEach(function (a, k) {
        var here = k >= first && k < first + per;
        a.classList.toggle("on", here);
        a.setAttribute("aria-current", here ? "page" : "false");
      });
      prevBtn.disabled = first === 0;
      nextBtn.disabled = first + per >= pages.length;
    }

    // One face of the turning sheet: a strip-sized window onto a copy of a page (or blank paper).
    function face(src, offset, back) {
      var f = document.createElement("div"), shade = document.createElement("i");
      f.className = "cx-face" + (back ? " cx-back" : "");
      if (src) {
        var hold = document.createElement("div"), copy = src.cloneNode(true);
        copy.removeAttribute("id");
        copy.classList.remove("cx-under", "cx-over");
        copy.classList.add("cx-on");
        hold.className = "cx-at"; hold.style.left = offset + "px";
        hold.appendChild(copy); f.appendChild(hold);
      }
      shade.className = "cx-shade"; f.appendChild(shade);
      return { el: f, shade: shade };
    }

    // The sheet is cut into strips hinged one to the next; each bends a little more than the last,
    // so the free edge leads and the paper curls rather than swinging as one board.
    // draw(e) poses it: 0 lying flat where it started, 1 turned over onto the other side.
    function leaf(front, back, hinge) {
      var r = front.getBoundingClientRect(), W = r.width, H = r.height, w = W / STRIPS, left = hinge === "left";
      var box = document.createElement("div"), cast = document.createElement("i");
      box.className = "cx-leaf";
      box.style.cssText = "left:" + r.left + "px;top:" + r.top + "px;width:" + W + "px;height:" + H + "px;perspective:" +
        Math.round(W * 3) + "px;perspective-origin:" + (left ? "0" : W + "px") + " 50%";
      cast.className = "cx-cast" + (left ? "" : " cx-cast-r");
      box.appendChild(cast);
      var parent = box, strips = [];
      for (var k = 0; k < STRIPS; k++) {
        var s = document.createElement("div");
        s.className = "cx-strip";
        s.style.cssText = "width:" + w + "px;height:" + H + "px;left:" + (k === 0 ? (left ? 0 : W - w) : (left ? w : -w)) +
          "px;transform-origin:" + (left ? "left" : "right") + " center";
        var f = face(front, left ? -k * w : -(W - (k + 1) * w), false);
        var b = face(back, left ? -(W - (k + 1) * w) : -k * w, true);
        s.appendChild(f.el); s.appendChild(b.el);
        parent.appendChild(s);
        strips.push({ el: s, front: f.shade, back: b.shade });
        parent = s;
      }
      document.body.appendChild(box);
      var sign = left ? -1 : 1;
      return {
        el: box, width: W, left: left,
        draw: function (e) {
          var bend = BEND * Math.sin(Math.PI * e), acc = 0, prev = 0;
          strips.forEach(function (st, k) {
            var g = Math.pow((k + 1) / STRIPS, 2);
            var rel = (k === 0 ? 180 * e - bend / 2 : 0) + bend * (g - prev);
            prev = g; acc += rel;
            st.el.style.transform = "rotateY(" + (sign * rel).toFixed(2) + "deg)";
            var c = Math.cos(acc * Math.PI / 180);
            st.front.style.opacity = (0.32 * (1 - c)).toFixed(3);
            st.back.style.opacity = (0.32 * (1 + c)).toFixed(3);
          });
          cast.style.opacity = Math.sin(Math.PI * e).toFixed(3);
        }
      };
    }

    // Lift the page for a turn to `first`: in a spread the leaving page curls over the spine and its
    // back is the arriving page; one page at a time, the page peels away to the left (or back in from it).
    // Returns the turn, posed at its start (t.from); t.to is where it ends.
    function lift(first, fwd) {
      var old = shown(at), neu = shown(first), t = { first: first, from: 0, to: 1 };
      if (per === 2) {
        var front = fwd ? old[1] : old[0], behind = fwd ? neu[1] : neu[0];
        if (!front) return null;
        t.sheet = leaf(front, fwd ? neu[0] : neu[1], fwd ? "left" : "right");
        if (behind) behind.classList.add("cx-under");
        front.classList.remove("cx-on");
      } else if (fwd) {
        t.sheet = leaf(old[0], null, "left");
        neu[0].classList.add("cx-under");
        old[0].classList.remove("cx-on");
      } else {
        t.sheet = leaf(neu[0], null, "left");
        t.from = 1; t.to = 0;
      }
      t.sheet.draw(t.from);
      return t;
    }

    // Move a lifted page from pose e to its end (commit) or back to its start, then put the book right.
    function settle(t, e, commit, ms, ease) {
      var goal = commit ? t.to : t.from, t0 = null;
      function tick(now) {
        if (t0 === null) t0 = now;
        var q = ms ? Math.min(1, (now - t0) / ms) : 1;
        t.sheet.draw(e + (goal - e) * ease(q));
        if (q < 1) { requestAnimationFrame(tick); return; }
        if (commit) history.replaceState(null, "", "#p" + (t.first + 1));
        show(commit ? t.first : at);
        t.sheet.el.remove();
        busy = false;
      }
      busy = true;
      requestAnimationFrame(tick);
    }
    function inOut(q) { return 0.5 - 0.5 * Math.cos(Math.PI * q); }
    function out(q) { return 1 - Math.pow(1 - q, 3); }

    function go(i) {
      i = Math.max(0, Math.min(pages.length - 1, i));
      if (!book) {
        pages[i].scrollIntoView({ behavior: "smooth" });
        history.replaceState(null, "", "#p" + (i + 1));
        return;
      }
      var first = view(i);
      if (first === at || busy) return;
      if (still || !document.body.animate) {
        history.replaceState(null, "", "#p" + (first + 1));
        show(first);
        return;
      }
      var t = lift(first, first > at);
      if (t) settle(t, t.from, true, TURN, inOut); else show(first);
    }
    function step(fwd) { go(fwd ? at + per : at - per); }

    // Which page the point is on, and whether it is that page's outer edge (+1 next, -1 back, 0 neither).
    function spot(x, y) {
      var on = shown(at);
      for (var k = 0; k < on.length; k++) {
        var r = on[k].getBoundingClientRect();
        if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
        var zone = r.width * EDGE, idx = at + k, dir = 0;
        var outerRight = per === 1 || idx % 2 === 1, outerLeft = per === 1 || idx % 2 === 0;
        if (outerRight && x > r.right - zone && at + per < pages.length) dir = 1;
        else if (outerLeft && x < r.left + zone && at > 0) dir = -1;
        return { page: on[k], rect: r, dir: dir };
      }
      return null;
    }

    function showHint(s) {
      if (!s || !s.dir || busy) { hint.classList.remove("on"); root.style.cursor = ""; return; }
      var r = s.rect, zone = r.width * EDGE;
      hint.style.cssText = "top:" + r.top + "px;height:" + r.height + "px;width:" + zone + "px;left:" +
        (s.dir > 0 ? r.right - zone : r.left) + "px";
      hint.classList.toggle("cx-edge-l", s.dir < 0);
      hint.classList.add("on");
      root.style.cursor = "pointer";
    }

    // Taking hold of the page: on touch anywhere on it, with a mouse at its outer edge. The sheet
    // follows the pointer; letting go past halfway (or with a flick) turns it, otherwise it falls back.
    var hold = null, swallow = false;
    root.addEventListener("pointerdown", function (ev) {
      if (!book || busy || ev.button > 0 || still) return;
      if (window.visualViewport && visualViewport.scale > 1.05) return;  // pinch-zoomed in to read: leave it
      var s = spot(ev.clientX, ev.clientY);
      if (!s) return;
      var touch = ev.pointerType !== "mouse";
      if (!touch && !s.dir) return;
      if (!touch && ev.target.closest && ev.target.closest("a")) return;
      hold = { id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, edge: s.dir, touch: touch, t: null, moved: false,
               trail: [{ x: ev.clientX, at: ev.timeStamp }] };
    });
    root.addEventListener("pointermove", function (ev) {
      if (!hold) { if (book && ev.pointerType === "mouse") showHint(spot(ev.clientX, ev.clientY)); return; }
      if (ev.pointerId !== hold.id) return;
      var dx = ev.clientX - hold.x0, dy = ev.clientY - hold.y0;
      if (!hold.t) {
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) {
          if (Math.abs(dy) > 12) hold = null;  // a vertical move is not a page turn
          return;
        }
        var fwd = dx < 0, first = fwd ? at + per : at - per;
        if (hold.edge && fwd !== hold.edge > 0) { hold = null; return; }  // an edge only turns its own way
        if (first < 0 || first >= pages.length) { hold = null; return; }
        hold.t = lift(view(first), fwd);
        if (!hold.t) { hold = null; return; }
        hold.fwd = fwd; hold.moved = true; busy = true;
        showHint(null);
        try { root.setPointerCapture(ev.pointerId); } catch (_) {}
        document.body.classList.add("cx-dragging");
      }
      hold.trail.push({ x: ev.clientX, at: ev.timeStamp });
      if (hold.trail.length > 6) hold.trail.shift();
      hold.t.sheet.draw(pose(hold, dx));
      ev.preventDefault();
    });
    // How far over the sheet is for a drag of dx: in a spread the free edge stays under the finger;
    // a single page turns over the width of the screen.
    function pose(h, dx) {
      var W = h.t.sheet.width, d = h.fwd ? -dx : dx, e;
      if (per === 2) e = Math.acos(Math.max(-1, Math.min(1, 1 - d / W))) / Math.PI;
      else e = Math.max(0, Math.min(1, d / (0.9 * W)));
      e = Math.max(0, Math.min(1, e));
      return h.t.from === 0 ? e : 1 - e;
    }
    function release(ev) {
      if (!hold || ev.pointerId !== hold.id) return;
      var h = hold;
      hold = null;
      document.body.classList.remove("cx-dragging");
      if (!h.t) {
        // a tap or click on the outer edge turns the page
        if (ev.type === "pointerup" && h.edge && Math.abs(ev.clientX - h.x0) < 8 && Math.abs(ev.clientY - h.y0) < 8) {
          swallow = true;
          step(h.edge > 0);
        }
        return;
      }
      swallow = true;
      var e = pose(h, ev.clientX - h.x0), done = Math.abs(e - h.t.from);
      var a = h.trail[0], b = h.trail[h.trail.length - 1], v = (b.x - a.x) / Math.max(1, b.at - a.at);  // px per ms
      var flick = (h.fwd ? -v : v) > 0.35, back = (h.fwd ? -v : v) < -0.35;
      var commit = ev.type === "pointerup" && !back && (done > 0.5 || (flick && done > 0.04));
      var left = Math.abs((commit ? h.t.to : h.t.from) - e);
      settle(h.t, e, commit, Math.max(140, TURN * 0.8 * left), out);
    }
    root.addEventListener("pointerup", release);
    root.addEventListener("pointercancel", release);
    root.addEventListener("pointerleave", function (ev) { if (!hold && ev.pointerType === "mouse") showHint(null); });
    // after a drag or an edge tap, the click that follows must not also follow a link
    root.addEventListener("click", function (ev) {
      if (swallow) { swallow = false; ev.preventDefault(); ev.stopPropagation(); }
    }, true);

    fit();
    var t = /^#p(\d+)$/.exec(location.hash);
    if (t) {
      var i = Math.max(0, Math.min(pages.length - 1, +t[1] - 1));
      if (book) show(view(i)); else { mark(i); pages[i].scrollIntoView(); }
    }
    var timer;
    window.addEventListener("resize", function () { clearTimeout(timer); timer = setTimeout(function () { if (!busy) fit(); }, 100); });
    window.addEventListener("hashchange", function () {
      var m = /^#p(\d+)$/.exec(location.hash);
      if (m) go(+m[1] - 1);
    });
    prevBtn.addEventListener("click", function () { step(false); });
    nextBtn.addEventListener("click", function () { step(true); });
    links.forEach(function (a, k) { a.addEventListener("click", function (ev) { ev.preventDefault(); go(k); }); });
    document.addEventListener("keydown", function (ev) {
      if (ev.metaKey || ev.ctrlKey || ev.altKey || /INPUT|TEXTAREA/.test(ev.target.tagName)) return;
      if (ev.key === "j" || ev.key === "ArrowRight" || ev.key === "PageDown" || ev.key === " ") { step(true); ev.preventDefault(); }
      else if (ev.key === "k" || ev.key === "ArrowLeft" || ev.key === "PageUp") { step(false); ev.preventDefault(); }
      else if (ev.key === "Home") { go(0); }
      else if (ev.key === "End") { go(pages.length - 1); }
      else if (ev.key === "p") { window.print(); }
      else if (/^[1-8]$/.test(ev.key)) { go(+ev.key - 1); }
    });

    if (/[?&]print=1/.test(location.search)) {
      history.replaceState(null, "", location.pathname);
      setTimeout(function () { window.print(); }, 300);
    }
  });
})();
