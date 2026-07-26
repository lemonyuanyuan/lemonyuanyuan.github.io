/* ==========================================================================
   Gallery behaviour — no jQuery.

   1. Filter chips on the album index.
   2. Deep-link landing: travel.html links to gallery.html#guilin, so the
      matching card is scrolled to and briefly outlined.
   3. A small lightbox for the individual album pages.
   ========================================================================== */

(function () {
  'use strict';

  /* ------------------------------------------------------------- filtering */

  function initFilters() {
    var buttons = Array.prototype.slice.call(document.querySelectorAll('.gl-filter'));
    var cards = Array.prototype.slice.call(document.querySelectorAll('.gl-card'));
    var counter = document.querySelector('.gl-count');
    var empty = document.querySelector('.gl-empty');
    if (!buttons.length || !cards.length) return;

    function apply(filter) {
      var shown = 0;

      cards.forEach(function (card) {
        var tags = (card.getAttribute('data-tags') || '').split(/\s+/);
        var match = filter === 'all' || tags.indexOf(filter) !== -1;
        card.hidden = !match;
        if (match) shown++;
      });

      buttons.forEach(function (btn) {
        var on = btn.getAttribute('data-filter') === filter;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });

      if (counter) {
        counter.textContent = shown + (shown === 1 ? ' album' : ' albums');
      }
      if (empty) empty.hidden = shown !== 0;
    }

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        apply(btn.getAttribute('data-filter') || 'all');
      });
    });

    apply('all');
  }

  /* ------------------------------------------------------- deep-link target */

  function highlightTarget() {
    var hash = window.location.hash;
    if (!hash || hash.length < 2) return;

    var id = hash.slice(1);
    var card = document.getElementById(id);
    if (!card || !card.classList.contains('gl-card')) return;

    /* A hidden card (filtered out) still has to be reachable by link. */
    card.hidden = false;

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

  function init() {
    initFilters();
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
