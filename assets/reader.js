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
    var aim = null;  // while picking a story to read (below): the story under a press, or "miss"
    var canBook = pages.length > 1 && window.St && window.St.PageFlip;
    // Switching language keeps the reader on the same page.
    document.querySelectorAll(".cx-language").forEach(function (link) {
      link.addEventListener("click", function () {
        link.setAttribute("href", link.getAttribute("href").split("#")[0] + (/^#p\d+$/.test(location.hash) ? location.hash : "#p" + (at + 1)));
      });
    });

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
        if (fc.checkState("flipping") || aim) return;  // while picking a story, a click on the page picks
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
      onEdge = function (ev) {
        var r = box.getBoundingClientRect(), x = ev.clientX - r.left;
        return x > r.width - band && at + 2 < pages.length || x < band && at > 0;
      };
    }
    var onEdge = function () { return false; };  // whether a click there turns the page; set by edges()

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

    // Read a story: picked with the Read tool, it opens in a panel over the pages, reflowed in one
    // column at a size set by the reader. The arrows walk through the paper story by story; closing
    // lands on the last story's page.
    var tr = document.documentElement.lang === "tr";
    var say = function (en, t) { return tr ? t : en; };
    var STORY = ".page article.story, .page .grid2 > .card, .page aside.joke, .page article.ghdive, .page .ghrow";
    var stories = Array.prototype.slice.call(document.querySelectorAll(STORY));
    var SIZES = [16, 18, 20, 23, 26], size = 2, reading = -1, before = null, down = null;
    try { var kept = +localStorage.getItem("cx-read-size"); if (kept >= 0 && kept < SIZES.length) size = kept; } catch (_) {}

    var panel = document.createElement("div");
    panel.className = "cx-read"; panel.hidden = true;
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); panel.setAttribute("aria-label", say("Story", "Haber"));
    panel.innerHTML = '<div class="cx-read-card"><div class="cx-read-bar">' +
      '<span class="cx-read-where"></span><span class="cx-sp"></span>' +
      '<button type="button" class="cx-read-btn" data-do="smaller" aria-label="' + say("Smaller text", "Daha küçük yazı") + '">A−</button>' +
      '<button type="button" class="cx-read-btn" data-do="larger" aria-label="' + say("Larger text", "Daha büyük yazı") + '">A+</button>' +
      '<button type="button" class="cx-read-btn" data-do="prev" aria-label="' + say("Previous story", "Önceki haber") + '">‹</button>' +
      '<button type="button" class="cx-read-btn" data-do="next" aria-label="' + say("Next story", "Sonraki haber") + '">›</button>' +
      '<button type="button" class="cx-read-btn cx-read-x" data-do="close" aria-label="' + say("Close", "Kapat") + '">×</button>' +
      '</div><div class="cx-read-story"></div></div>';
    document.body.appendChild(panel);
    var card = panel.querySelector(".cx-read-card"), body = panel.querySelector(".cx-read-story");
    var where = panel.querySelector(".cx-read-where");
    function btn(name) { return panel.querySelector('[data-do="' + name + '"]'); }

    // a copy of the story without the page's fitting: inline sizes, column wrappers, section heads
    function copy(s) {
      var out = document.createDocumentFragment();
      if (s.classList.contains("ghrow")) {
        var name = s.querySelector(".name"), h = document.createElement("h3"), meta = document.createElement("span");
        h.appendChild(name.cloneNode(true));
        meta.className = "meta";
        meta.textContent = [".lang", ".stars", ".gain"].map(function (c) { var e = s.querySelector(c); return e ? e.textContent : ""; })
          .filter(Boolean).join(" · ");
        out.appendChild(h); out.appendChild(meta);
        var about = s.querySelector(".about");
        if (about) out.appendChild(about.cloneNode(true));
        return out;
      }
      var c = s.cloneNode(true);
      while (c.firstChild) out.appendChild(c.firstChild);
      Array.prototype.forEach.call(out.querySelectorAll(".sechead"), function (n) { n.remove(); });
      Array.prototype.forEach.call(out.querySelectorAll(".cols"), function (n) { n.replaceWith.apply(n, n.childNodes); });
      Array.prototype.forEach.call(out.querySelectorAll("[style], [id], [data-fit]"), function (n) {
        n.removeAttribute("style"); n.removeAttribute("id"); n.removeAttribute("data-fit");
      });
      return out;
    }
    function resize(by) {
      size = Math.max(0, Math.min(SIZES.length - 1, size + by));
      card.style.fontSize = SIZES[size] + "px";
      btn("smaller").disabled = size === 0;
      btn("larger").disabled = size === SIZES.length - 1;
      try { localStorage.setItem("cx-read-size", size); } catch (_) {}
    }
    function show(i) {
      reading = i;
      var s = stories[i], pg = pages.indexOf(s.closest(".page"));
      body.textContent = "";
      body.appendChild(copy(s));
      where.textContent = say("Page ", "Sayfa ") + (pg + 1) + " · " + (i + 1) + " / " + stories.length;
      btn("prev").disabled = i === 0;
      btn("next").disabled = i === stories.length - 1;
      panel.scrollTop = 0;
    }
    function open(i) {
      if (!stories.length) return;
      if (reading < 0) {
        before = document.activeElement;
        panel.hidden = false;
        document.body.classList.add("cx-reading");
        void panel.offsetWidth;  // lay it out hidden first, so it fades in
        panel.classList.add("on");
      }
      show(Math.max(0, Math.min(stories.length - 1, i)));
      btn("close").focus({ preventScroll: true });
    }
    function close() {
      if (reading < 0) return;
      var pg = pages.indexOf(stories[reading].closest(".page"));
      reading = -1;
      panel.classList.remove("on"); panel.hidden = true;
      document.body.classList.remove("cx-reading");
      if (before && before.focus) before.focus({ preventScroll: true });
      if (flip ? pg - pg % 2 !== at : pg !== at) go(pg);
    }
    // The book lays a layer over its pages, so the story is found by where the pointer is.
    function inside(el, ev) {
      var r = el.getBoundingClientRect();
      return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
    }
    function storyAt(ev) {
      if (!root.contains(ev.target) || ev.target.closest("a, button") || (flip && (flip.getState() !== "read" || onEdge(ev)))) return null;
      for (var k = 0; k < stories.length; k++) {
        var s = stories[k], pg = pages.indexOf(s.closest(".page"));
        if (flip && pg - pg % 2 !== at || !inside(s, ev)) continue;
        return Array.prototype.some.call(s.querySelectorAll("a[href]"), function (a) { return inside(a, ev); }) ? null : s;
      }
      return null;
    }
    resize(0);
    panel.addEventListener("click", function (ev) {
      var act = ev.target.closest("[data-do]");
      if (!card.contains(ev.target)) { close(); return; }
      if (!act) return;
      ({ smaller: function () { resize(-1); }, larger: function () { resize(1); }, close: close,
         prev: function () { show(reading - 1); }, next: function () { show(reading + 1); } })[act.dataset.do]();
    });
    // Picking: after the Read tool, the story under the pointer is marked and a click opens it. A click
    // elsewhere on the pages, Esc or the tool again stops picking; the book's edges still turn pages.
    var picking = false, readBtn = null, hot = null;
    function light(s) {
      if (s === hot) return;
      if (hot) hot.classList.remove("cx-hot");
      hot = s;
      if (hot) hot.classList.add("cx-hot");
    }
    function pick(on) {
      picking = on;
      document.body.classList.toggle("cx-picking", on);
      if (!on) light(null);
      if (readBtn) {
        var tip = on ? say("Click a story · Esc to cancel", "Bir habere tıklayın · İptal için Esc") : say("Read in large type · R", "Büyük yazıyla oku · R");
        readBtn.setAttribute("aria-pressed", on ? "true" : "false");
        readBtn.setAttribute("aria-label", tip); readBtn.dataset.tip = tip;
      }
    }
    document.addEventListener("pointerdown", function (ev) {
      down = { x: ev.clientX, y: ev.clientY };
      aim = picking && ev.button === 0 && root.contains(ev.target) && !(flip && onEdge(ev)) ? storyAt(ev) || "miss" : null;
    }, true);
    document.addEventListener("pointerup", function () { setTimeout(function () { aim = null; }, 0); }, true);
    root.addEventListener("click", function (ev) {
      var s = aim;
      aim = null;
      if (!s || (down && Math.abs(ev.clientX - down.x) + Math.abs(ev.clientY - down.y) > 6)) return;
      pick(false);
      if (s === "miss") return;
      ev.preventDefault();
      open(stories.indexOf(s));
    });
    root.addEventListener("mousemove", function (ev) { if (picking) light(storyAt(ev)); });
    root.addEventListener("mouseleave", function () { light(null); });
    window.addEventListener("keydown", function (ev) {
      if (picking && ev.key === "Escape") { pick(false); ev.preventDefault(); return; }
      if (reading < 0) return;
      var k = ev.key, used = true;
      if (k === "Escape") close();
      else if (k === "ArrowRight" || k === "j") { if (reading < stories.length - 1) show(reading + 1); }
      else if (k === "ArrowLeft" || k === "k") { if (reading > 0) show(reading - 1); }
      else if (k === "+" || k === "=") resize(1);
      else if (k === "-" || k === "_") resize(-1);
      else if (k === "Tab") {  // keep focus inside the panel
        var f = Array.prototype.filter.call(card.querySelectorAll("button:not(:disabled), a[href]"), function (e) { return e.offsetParent; });
        var a = f.indexOf(document.activeElement);
        if (ev.shiftKey ? a <= 0 : a === f.length - 1) f[ev.shiftKey ? f.length - 1 : 0].focus();
        else used = false;
      }
      else if (/^(PageUp|PageDown|Home|End| )$/.test(k)) { ev.stopImmediatePropagation(); return; }  // scroll the story, not the pages
      else used = /^[1-8p]$/.test(k);
      if (used) { ev.preventDefault(); ev.stopImmediatePropagation(); }
    }, true);

    // Reading tools: a column of icons in the margin beside the pages, each named on hover.
    // Read starts picking a story to open; Full screen gives the pages the whole display.
    if (stories.length) {
      var ICON = {
        read: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21M10.5 7.5v6M7.5 10.5h6"/>',
        full: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
        exit: '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>'
      };
      var svg = function (name) {
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" ' +
          'stroke-linecap="square" aria-hidden="true">' + ICON[name] + "</svg>";
      };
      var rail = document.createElement("div");
      rail.className = "cx-rail";
      rail.setAttribute("role", "toolbar"); rail.setAttribute("aria-orientation", "vertical");
      rail.setAttribute("aria-label", say("Reading tools", "Okuma araçları"));
      var tool = function (name, tip, act) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "cx-tool";
        b.innerHTML = svg(name);
        b.setAttribute("aria-label", tip); b.dataset.tip = tip;
        b.addEventListener("click", act);
        rail.appendChild(b);
        return b;
      };
      readBtn = tool("read", "", function () { pick(!picking); });
      pick(false);
      var full = document.documentElement;
      if (document.fullscreenEnabled && full.requestFullscreen) {
        var fsBtn = tool("full", "", function () {
          if (document.fullscreenElement) document.exitFullscreen(); else full.requestFullscreen().catch(function () {});
        });
        fsBtn.classList.add("cx-fs");
        var label = function () {
          var on = !!document.fullscreenElement, tip = on ? say("Exit full screen · F", "Tam ekrandan çık · F") : say("Full screen · F", "Tam ekran · F");
          fsBtn.innerHTML = svg(on ? "exit" : "full");
          fsBtn.setAttribute("aria-label", tip); fsBtn.dataset.tip = tip;
          fsBtn.setAttribute("aria-pressed", on ? "true" : "false");
        };
        label();
        document.addEventListener("fullscreenchange", label);
      }
      document.body.appendChild(rail);
      var place = function () { if (bar) rail.style.top = bar.offsetHeight + 16 + "px"; };
      place();
      window.addEventListener("resize", place);
      document.addEventListener("keydown", function (ev) {
        if (reading >= 0 || ev.metaKey || ev.ctrlKey || ev.altKey || /INPUT|TEXTAREA/.test(ev.target.tagName)) return;
        if (ev.key === "r") { pick(!picking); ev.preventDefault(); }
        else if (ev.key === "f" && fsBtn) fsBtn.click();
      });
    }

    // print the plain pages, not the book
    window.addEventListener("beforeprint", function () { if (flip) { unbook(); document.body.classList.remove("cx-book"); } });
    window.addEventListener("afterprint", fit);
    if (/[?&]print=1/.test(location.search)) {
      history.replaceState(null, "", location.pathname);
      setTimeout(function () { window.print(); }, 300);
    }
  });
})();
