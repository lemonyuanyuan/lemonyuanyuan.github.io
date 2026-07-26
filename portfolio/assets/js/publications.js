/* Publications: All / Selected toggle.
   The filter bar only renders when at least one entry has `selected: true`,
   so this is a no-op until then. */
(function () {
  'use strict';

  function init() {
    var buttons = Array.prototype.slice.call(document.querySelectorAll('.pub-filter'));
    var items = Array.prototype.slice.call(document.querySelectorAll('.pub-item'));
    var groups = Array.prototype.slice.call(document.querySelectorAll('.pub-year-group'));
    var count = document.querySelector('.pub-filters__count');
    if (!buttons.length || !items.length) return;

    function apply(mode) {
      var shown = 0;

      items.forEach(function (item) {
        var visible = mode === 'all' || item.classList.contains('is-selected');
        item.hidden = !visible;
        if (visible) shown++;
      });

      /* Hide a year heading once every paper under it is filtered out. */
      groups.forEach(function (group) {
        var any = group.querySelector('.pub-item:not([hidden])');
        group.hidden = !any;
      });

      buttons.forEach(function (btn) {
        var on = btn.getAttribute('data-pub-filter') === mode;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });

      if (count) count.textContent = shown + (shown === 1 ? ' paper' : ' papers');
    }

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        apply(btn.getAttribute('data-pub-filter') || 'all');
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
