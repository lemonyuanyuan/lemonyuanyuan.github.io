/* ==========================================================================
   Gallery behaviour — no jQuery.

   1. Deep-link landing: the travel map links to gallery.html#guilin, so the
      matching card is scrolled to and briefly outlined.
   2. A small lightbox for the individual album pages.
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------- deep-link target */

  function highlightTarget() {
    var hash = window.location.hash;
    if (!hash || hash.length < 2) return;

    var id = hash.slice(1);
    var card = document.getElementById(id);
    if (!card || !card.classList.contains('gl-card')) return;

    window.requestAnimationFrame(function () {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('is-target');
      setTimeout(function () {
        card.classList.remove('is-target');
      }, 3000);
    });
  }

  /* --------------------------------------------------------------- lightbox */

  function initLightbox() {
    var triggers = Array.prototype.slice.call(document.querySelectorAll('.gl-photo'));
    if (!triggers.length) return;

    var sources = triggers.map(function (btn) {
      return {
        src: btn.getAttribute('data-full') || btn.querySelector('img').getAttribute('src'),
        alt: btn.querySelector('img').getAttribute('alt') || ''
      };
    });

    var box = document.createElement('div');
    box.className = 'gl-lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Photo viewer');
    box.innerHTML =
      '<button type="button" class="gl-lightbox__close" aria-label="Close">Close &times;</button>' +
      '<button type="button" class="gl-lightbox__nav gl-lightbox__nav--prev" aria-label="Previous photo">&#8249;</button>' +
      '<img alt="" />' +
      '<button type="button" class="gl-lightbox__nav gl-lightbox__nav--next" aria-label="Next photo">&#8250;</button>' +
      '<span class="gl-lightbox__counter"></span>';
    document.body.appendChild(box);

    var img = box.querySelector('img');
    var counter = box.querySelector('.gl-lightbox__counter');
    var prevBtn = box.querySelector('.gl-lightbox__nav--prev');
    var nextBtn = box.querySelector('.gl-lightbox__nav--next');
    var closeBtn = box.querySelector('.gl-lightbox__close');
    var current = 0;
    var lastFocus = null;

    var single = sources.length < 2;
    prevBtn.hidden = single;
    nextBtn.hidden = single;

    function show(i) {
      current = (i + sources.length) % sources.length;
      img.setAttribute('src', sources[current].src);
      img.setAttribute('alt', sources[current].alt);
      counter.textContent = current + 1 + ' / ' + sources.length;
    }

    function open(i) {
      lastFocus = document.activeElement;
      show(i);
      box.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      closeBtn.focus();
    }

    function close() {
      box.classList.remove('is-open');
      document.body.style.overflow = '';
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    triggers.forEach(function (btn, i) {
      btn.addEventListener('click', function () { open(i); });
    });

    closeBtn.addEventListener('click', close);
    prevBtn.addEventListener('click', function () { show(current - 1); });
    nextBtn.addEventListener('click', function () { show(current + 1); });

    box.addEventListener('click', function (e) {
      if (e.target === box) close();
    });

    document.addEventListener('keydown', function (e) {
      if (!box.classList.contains('is-open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft' && !single) show(current - 1);
      else if (e.key === 'ArrowRight' && !single) show(current + 1);
    });
  }

  /* ------------------------------------------------------------------ rails */

  function initRails() {
    var wraps = Array.prototype.slice.call(document.querySelectorAll('.gl-rail-wrap'));

    wraps.forEach(function (wrap) {
      var rail = wrap.querySelector('.gl-rail');
      if (!rail) return;

      function update() {
        var more = rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 2;
        wrap.classList.toggle('has-more', more);
      }

      rail.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
      update();
    });
  }

  /* --------------------------------------------------------------- masonry */

  function initMasonry() {
    var wall = document.querySelector('.gl-photos');
    if (!wall) return;

    var items = Array.prototype.slice.call(wall.children);
    if (!items.length) return;

    var GAP = 10;
    var MIN_TWO_COL = 700;
    var timer = null;

    function reset() {
      wall.classList.remove('is-masonry');
      wall.style.height = '';
      items.forEach(function (li) {
        li.style.position = '';
        li.style.width = '';
        li.style.left = '';
        li.style.top = '';
      });
    }

    /* Split the photos between two columns, then pick column widths that make
       both columns finish at the same height.

       Filling the shortest column is the usual trick, but it is greedy and can
       end badly out of balance. Even a perfect split cannot level two columns
       of EQUAL width — with these photos the best possible still left a ~290px
       hole, because the heights are fixed by the aspect ratios. Letting the two
       columns differ slightly in width solves it exactly: a column of tall
       portraits gets narrower, one of wide landscapes gets broader, and the
       bottoms line up. Nothing is cropped and the gutters stay uniform. */
    function split(ratios) {
      var n = ratios.length;

      if (n > 40) {
        var acc = [0, 0];
        return ratios.map(function (r) {
          var c = acc[0] <= acc[1] ? 0 : 1;
          acc[c] += r;
          return c;
        });
      }

      /* key -> { diff, path } ; diff = aspectSum(col0) - aspectSum(col1).
         Keying by the running difference keeps the state space tiny. */
      var states = { '0': { diff: 0, path: [] } };

      for (var i = 0; i < n; i++) {
        var next = {};
        for (var key in states) {
          var st = states[key];
          for (var col = 0; col < 2; col++) {
            var diff = col === 0 ? st.diff + ratios[i] : st.diff - ratios[i];
            var k = diff.toFixed(3);
            if (!(k in next)) next[k] = { diff: diff, path: st.path.concat(col) };
          }
        }
        states = next;
      }

      var best = null;
      for (var k2 in states) {
        if (best === null || Math.abs(states[k2].diff) < Math.abs(best.diff)) {
          best = states[k2];
        }
      }
      return best.path;
    }

    /* Solve a0*w0 + gaps0 == a1*(total - w0) + gaps1 for w0,
       clamped so neither column becomes a sliver. */
    function widthFor(a0, a1, gaps0, gaps1, total) {
      if (a0 + a1 === 0) return total / 2;
      var w0 = (a1 * total + gaps1 - gaps0) / (a0 + a1);
      return Math.max(total * 0.3, Math.min(total * 0.7, w0));
    }


    function layout() {
      var width = wall.clientWidth;

      /* Single column: let normal flow handle it. */
      if (width < MIN_TWO_COL) {
        reset();
        return;
      }

      wall.classList.add('is-masonry');

      var total = width - GAP;

      /* height / width per photo. Both attributes are on every <img>, so this
         is known before the files load and the wall never reflows. */
      var ratios = items.map(function (li) {
        var img = li.querySelector('img');
        var w = parseFloat(img && img.getAttribute('width')) || 3;
        var h = parseFloat(img && img.getAttribute('height')) || 2;
        return h / w;
      });

      var assignment = split(ratios);

      var sums = [0, 0];
      var counts = [0, 0];
      assignment.forEach(function (col, i) {
        sums[col] += ratios[i];
        counts[col] += 1;
      });

      var w0 = widthFor(
        sums[0], sums[1],
        Math.max(0, counts[0] - 1) * GAP,
        Math.max(0, counts[1] - 1) * GAP,
        total
      );
      var widths = [w0, total - w0];

      var heights = [0, 0];
      items.forEach(function (li, i) {
        var col = assignment[i];
        li.style.position = 'absolute';
        li.style.width = widths[col] + 'px';
        li.style.left = (col === 0 ? 0 : widths[0] + GAP) + 'px';
        li.style.top = heights[col] + 'px';
        heights[col] += widths[col] * ratios[i] + GAP;
      });

      wall.style.height = Math.max(heights[0], heights[1]) - GAP + 'px';
    }


    layout();
    window.addEventListener('resize', function () {
      clearTimeout(timer);
      timer = setTimeout(layout, 120);
    });
  }

  function init() {
    initRails();
    initMasonry();
    initLightbox();
    highlightTarget();
    window.addEventListener('hashchange', highlightTarget);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
