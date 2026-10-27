// Website reader. On wide screens the A4 pages are a book, two facing pages fitted to the window,
// turned by StPageFlip (vendor/page-flip-2.0.7.js, MIT): drag a corner, click a page, or use the
// arrows and keys. On narrow screens the pages scroll, one under the other. ?print=1 prints.
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
    var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var PW = 794, PH = 1123;  // A4 at 96 dpi
    var WIDE = 900, TURN = 900;  // narrowest window that shows the book; ms per turn
    pages.forEach(function (p, i) { p.id = "p" + (i + 1); });

    var prevBtn = document.createElement("button"), nextBtn = document.createElement("button");
    prevBtn.className = "cx-turn cx-turn-prev"; prevBtn.type = "button"; prevBtn.setAttribute("aria-label", "Previous pages"); prevBtn.textContent = "‹";
    nextBtn.className = "cx-turn cx-turn-next"; nextBtn.type = "button"; nextBtn.setAttribute("aria-label", "Next pages"); nextBtn.textContent = "›";
    document.body.appendChild(prevBtn); document.body.appendChild(nextBtn);

    var at = 0, flip = null;  // the current page (first of the spread in the book); the book, while shown
    var canBook = pages.length > 1 && window.St && window.St.PageFlip;

    function mark(i, per) {
      at = i;
      links.forEach(function (a, k) {
        var here = k >= i && k < i + per;
        a.classList.toggle("on", here);
        a.setAttribute("aria-current", here ? "page" : "false");
      });
      prevBtn.disabled = i === 0;
      nextBtn.disabled = i + per >= pages.length;
    }

    // Take the book apart: the pages go back into the page flow, as the template made them.
    function unbook() {
      if (!flip) return;
      pages.forEach(function (p) { root.appendChild(p); });
      flip.destroy();
      flip = null;
    }

    // Build the book at the window's size. The library works in screen pixels, so it gets the zoomed
    // page size; each page keeps its own fixed layout inside a sheet, scaled by --cx-zoom.
    function book() {
      unbook();
      var top = bar ? bar.offsetHeight : 0, foot = tk ? tk.offsetHeight : 0;
      var w = document.documentElement.clientWidth, h = window.innerHeight - top - foot;
      var z = Math.min(1, (w - 120) / (2 * PW), (h - 32) / PH);
      var pw = Math.floor(PW * z), ph = Math.floor(PH * z);
      document.documentElement.style.setProperty("--cx-zoom", z.toFixed(4));
      root.style.height = h + "px";
      var box = document.createElement("div");
      box.className = "cx-flip";
      box.style.width = 2 * pw + "px"; box.style.height = ph + "px";
      var sheets = pages.map(function (p) {
        var s = document.createElement("div");
        s.className = "cx-sheet";
        s.appendChild(p);
        box.appendChild(s);
        return s;
      });
      root.appendChild(box);
      flip = new St.PageFlip(box, {
        width: pw, height: ph, size: "fixed", autoSize: false, usePortrait: false, showCover: false,
        startPage: at - at % 2, flippingTime: still ? 1 : TURN, drawShadow: true, maxShadowOpacity: 0.45,
        showPageCorners: true, mobileScrollSupport: false, clickEventForward: true, disableFlipByClick: false
      });
      flip.loadFromHTML(sheets);
      soften(flip, box);
      edges(flip, box, pw);
      flip.on("flip", function (e) {
        mark(e.data - e.data % 2, 2);
        history.replaceState(null, "", "#p" + (at + 1));
      });
      mark(at - at % 2, 2);
    }

    // StPageFlip moves the corner straight to the pointer, lifts it from a wide area, lands pages at
    // an even speed and shades the fold like gloss. This wraps its controller on the live instance
    // (the vendored file stays as published): only a small area at each corner lifts the page; the
    // curl starts flat and eases after the pointer, eases back flat when the pointer leaves, and picks
    // up from where it is if the pointer returns; releases and turns glide and slow as they land.
    // The fold shading becomes one soft falloff, like matte paper.
    function soften(flip, box) {
      var fc = flip.getFlipController(), render = flip.getRender();
      var mode = null, cur = null, target = null, raf = 0, last = 0;  // "corner" (hover) or "drag"
      var EASE = { corner: 120, drag: 60 };  // ms for the curl to close most of the gap to the pointer

      function rect() { return fc.getBoundsRect(); }
      function here() { return render.convertToGlobal(fc.getCalculation().getPosition()); }
      // where a fold starts flat: the page's outer edge, at the corner or level with the pointer
      function edge(pos, corner) {
        var r = rect(), fwd = pos.x > r.left + r.width / 2;
        var y = corner ? (pos.y < r.top + r.height / 2 ? r.top + 1 : r.top + r.height - 1)
                       : Math.max(r.top + 1, Math.min(r.top + r.height - 1, pos.y));
        return { x: fwd ? r.left + r.width - 1 : r.left + 1, y: y };
      }
      function halt() { if (raf) cancelAnimationFrame(raf); raf = 0; mode = null; }
      function freeze() { if (glide) cancelAnimationFrame(glide); glide = 0; }  // stop a settle where it is
      var glide = 0;

      // Only a small quarter-circle at each outer corner lifts the page on hover, so links near the
      // foot of a page can be reached without the corner coming to the pointer.
      fc.isPointOnCorners = function (pos) {
        var r = rect(), b = render.convertToBook(pos), reach = Math.max(60, r.pageWidth * 0.165);
        if (b.x <= 0 || b.y <= 0 || b.x >= r.width || b.y >= r.height) return false;
        var dx = Math.min(b.x, r.width - b.x), dy = Math.min(b.y, r.height - b.y);
        return Math.sqrt(dx * dx + dy * dy) < reach;
      };
      function tick(now) {
        raf = 0;
        if (!mode || !fc.getCalculation()) { mode = null; return; }
        var k = 1 - Math.exp(-Math.min(64, now - last) / EASE[mode]);
        last = now;
        cur = { x: cur.x + (target.x - cur.x) * k, y: cur.y + (target.y - cur.y) * k };
        var pt = render.convertToPage(cur);
        try { fc.do({ x: Math.round(pt.x), y: Math.round(pt.y) }); } catch (_) {}
        raf = requestAnimationFrame(tick);
      }
      function run(m, from, to) {
        mode = m; cur = from; target = to;
        if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
      }
      // Let go of a hover or a drag, or turn: the page settles back flat, or over if it is past the
      // spine. The library moves at an even speed and stops dead; this glides and slows as it lands.
      function settle(over) {
        halt(); freeze();
        var calc = fc.getCalculation();
        if (!calc) return;
        var r = rect(), from = calc.getPosition();
        var to = { x: over ? -r.pageWidth : r.pageWidth, y: calc.getCorner() === "bottom" ? r.height : 0 };
        var span = Math.abs(to.x - from.x) / (2 * r.pageWidth);  // share of a full turn left to go
        var ms = still ? 1 : 420 + 900 * span, t0 = null;
        fc.setState(over ? "flipping" : "fold_corner");
        function land(now) {
          glide = 0;
          if (!fc.getCalculation()) return;
          if (t0 === null) t0 = now;
          var q = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - q, 3);  // fast off the hand, slow at the end
          // whole pixels, as the library's own animations use; it has no answer for some fractional points
          try { fc.do({ x: Math.round(from.x + (to.x - from.x) * e), y: Math.round(from.y + (to.y - from.y) * e) }); } catch (_) {}
          if (q < 1) { glide = requestAnimationFrame(land); return; }
          if (over) { if (calc.getDirection() === 1) flip.turnToPrevPage(); else flip.turnToNextPage(); }
          render.setBottomPage(null);
          render.setFlippingPage(null);
          render.clearShadow();
          fc.setState("read");
          fc.reset();
        }
        glide = requestAnimationFrame(land);
      }

      fc.showCorner = function (pos) {
        if (!fc.checkState("read", "fold_corner")) return;
        var on = fc.isPointOnCorners(pos);
        if (mode === "corner") { if (on) target = pos; else settle(false); return; }
        if (!on) return;
        if (fc.getCalculation() && fc.checkState("fold_corner")) {  // came back while it was settling
          freeze();
          run("corner", here(), pos);
          return;
        }
        var from = edge(pos, true);
        if (!fc.start(from)) return;
        fc.setState("fold_corner");
        fc.do(render.convertToPage(from));
        run("corner", from, pos);
      };
      fc.fold = function (pos) {
        if (mode === "drag") { target = pos; return; }
        var from;
        if (fc.getCalculation() && fc.checkState("fold_corner", "user_fold")) { freeze(); from = mode === "corner" ? cur : here(); }
        else {
          from = edge(pos, false);
          if (!fc.start(from)) return;
          fc.do(render.convertToPage(from));
        }
        halt();
        fc.setState("user_fold");
        run("drag", from, pos);
      };
      fc.stopMove = function () {
        if (mode !== "drag") { var calc = fc.getCalculation(); if (calc) settle(calc.getPosition().x <= 0); return; }
        // decide by where the pointer is, but move from where the paper is
        settle(render.convertToPage(target).x <= 0);
      };
      fc.fold = (function (fold) {
        return function (pos) { if (!fc.checkState("flipping")) fold(pos); };  // a turn in progress finishes first
      })(fc.fold);
      fc.flip = function (pos) {
        if (fc.checkState("flipping")) return;
        if (mode === "corner" && fc.getCalculation()) { settle(true); return; }
        // a click, button or key: lift the corner a little, then glide it over like a release
        halt(); freeze();
        if (!fc.start(pos)) return;
        var r = rect(), lift = r.height / 10, bottom = fc.getCalculation().getCorner() === "bottom";
        fc.do({ x: r.pageWidth - lift, y: bottom ? r.height - lift : lift });
        settle(true);
      };
      box.addEventListener("mouseleave", function () { if (mode === "corner") settle(false); });

      var inner = render.drawInnerShadow.bind(render);
      render.drawInnerShadow = function () {
        inner();
        var el = render.innerShadow, dir = /linear-gradient\(\s*([^,]+),/.exec(el.style.cssText);
        if (!dir) return;
        var o = render.shadow.opacity;
        el.style.background = "linear-gradient(" + dir[1] + ", rgba(17,18,20," + (o * 0.55).toFixed(3) + ") 0%, rgba(17,18,20," +
          (o * 0.22).toFixed(3) + ") 22%, rgba(17,18,20,0) 70%)";
      };
    }

    // A gray shade fades in along the book's outer edge under the mouse, where a click turns the
    // page, and the pointer becomes a hand. Edges with no page to turn to stay plain, and the shade
    // gives way while a corner is lifted or a page is turning.
    function edges(flip, box, pw) {
      var band = Math.max(56, pw * 0.16);
      var shades = ["l", "r"].map(function (side) {
        var el = document.createElement("div");
        el.className = "cx-edge cx-edge-" + side;
        el.style.width = band + "px";
        box.appendChild(el);
        return el;
      });
      function show(side) {
        shades[0].classList.toggle("on", side < 0);
        shades[1].classList.toggle("on", side > 0);
        box.style.cursor = side ? "pointer" : "";
      }
      box.addEventListener("mousemove", function (ev) {
        var r = box.getBoundingClientRect(), x = ev.clientX - r.left;
        var side = x > r.width - band && at + 2 < pages.length ? 1 : x < band && at > 0 ? -1 : 0;
        show(flip.getState() === "read" ? side : 0);
      });
      box.addEventListener("mouseleave", function () { show(0); });
      flip.on("changeState", function (e) { if (e.data !== "read") show(0); });
    }

    // zoom only after the template has measured and fixed its boxes at full size
    function fit() {
      var wide = canBook && document.documentElement.clientWidth >= WIDE;
      var was = !!flip;
      document.body.classList.toggle("cx-book", wide);
      if (wide) { book(); return; }
      unbook();
      root.style.height = "";
      document.documentElement.style.setProperty("--cx-zoom", Math.min(1, (document.documentElement.clientWidth - 24) / PW).toFixed(3));
      mark(at, 1);
      if (was) pages[at].scrollIntoView();
    }

    // scrolling: the page in view is the current one
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        if (flip) return;
        entries.forEach(function (e) { if (e.isIntersecting) mark(pages.indexOf(e.target), 1); });
      }, { rootMargin: "-45% 0px -50% 0px" });
      pages.forEach(function (p) { io.observe(p); });
    }

    function go(i) {
      i = Math.max(0, Math.min(pages.length - 1, i));
      if (flip) {
        if (i - i % 2 !== at) flip.flip(i, "top");
        return;
      }
      pages[i].scrollIntoView({ behavior: "smooth" });
      history.replaceState(null, "", "#p" + (i + 1));
    }
    function step(fwd) {
      if (flip) { if (fwd) flip.flipNext("top"); else flip.flipPrev("top"); return; }
      go(fwd ? at + 1 : at - 1);
    }

    var t = /^#p(\d+)$/.exec(location.hash);
    if (t) at = Math.max(0, Math.min(pages.length - 1, +t[1] - 1));
    fit();
    if (t && !flip) pages[at].scrollIntoView();
    var timer, lastW = document.documentElement.clientWidth, lastH = window.innerHeight;
    window.addEventListener("resize", function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var w = document.documentElement.clientWidth, h = window.innerHeight;
        if (w === lastW && h === lastH) return;
        lastW = w; lastH = h;
        fit();
      }, 150);
    });
    window.addEventListener("hashchange", function () {
      var m = /^#p(\d+)$/.exec(location.hash);
      if (m) go(+m[1] - 1);
    });
    prevBtn.addEventListener("click", function () { step(false); });
    nextBtn.addEventListener("click", function () { step(true); });
    links.forEach(function (a, k) { a.addEventListener("click", function (ev) { ev.preventDefault(); go(k); }); });
    document.addEventListener("keydown", function (ev) {
      if (ev.metaKey || ev.ctrlKey || ev.altKey || /INPUT|TEXTAREA/.test(ev.target.tagName)) return;
      if (ev.key === "j" || ev.key === "ArrowRight" || ev.key === "PageDown" || (flip && ev.key === " ")) { step(true); ev.preventDefault(); }
      else if (ev.key === "k" || ev.key === "ArrowLeft" || ev.key === "PageUp") { step(false); ev.preventDefault(); }
      else if (ev.key === "Home") { go(0); }
      else if (ev.key === "End") { go(pages.length - 1); }
      else if (ev.key === "p") { window.print(); }
      else if (/^[1-8]$/.test(ev.key)) { go(+ev.key - 1); }
    });

    // print the plain pages, not the book
    window.addEventListener("beforeprint", function () { if (flip) { unbook(); document.body.classList.remove("cx-book"); } });
    window.addEventListener("afterprint", fit);
    if (/[?&]print=1/.test(location.search)) {
      history.replaceState(null, "", location.pathname);
      setTimeout(function () { window.print(); }, 300);
    }
  });
})();
