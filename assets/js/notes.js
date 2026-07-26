/* Notes index — hides the empty-state block once there are entries. */
(function () {
  'use strict';

  function init() {
    var entries = document.querySelectorAll('.nt-entry');
    var empty = document.querySelector('.nt-empty');
    if (empty) empty.hidden = entries.length > 0;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
