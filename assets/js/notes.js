/* ==========================================================================
   Notes index — filter chips, counter, and the empty state.
   Entries are plain HTML in notes.html; this just reacts to what is there.
   ========================================================================== */

(function () {
  'use strict';

  function init() {
    var buttons = Array.prototype.slice.call(document.querySelectorAll('.nt-filter'));
    var entries = Array.prototype.slice.call(document.querySelectorAll('.nt-entry'));
    var counter = document.querySelector('.nt-count');
    var empty = document.querySelector('.nt-empty');
    var filters = document.querySelector('.nt-filters');

    /* Nothing written yet — the chips would only be decoration. */
    if (!entries.length) {
      if (filters) filters.hidden = true;
      if (empty) empty.hidden = false;
      return;
    }

    function apply(filter) {
      var shown = 0;

      entries.forEach(function (entry) {
        var tags = (entry.getAttribute('data-tags') || '').split(/\s+/);
        var match = filter === 'all' || tags.indexOf(filter) !== -1;
        entry.hidden = !match;
        if (match) shown++;
      });

      buttons.forEach(function (btn) {
        var on = btn.getAttribute('data-filter') === filter;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });

      if (counter) counter.textContent = shown + (shown === 1 ? ' note' : ' notes');
      if (empty) empty.hidden = shown !== 0;
    }

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        apply(btn.getAttribute('data-filter') || 'all');
      });
    });

    apply('all');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
