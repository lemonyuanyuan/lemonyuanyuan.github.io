/* Paper rows: rows with both an image and a video show the image at rest and
   play the video on hover, like Jon Barron's template. Rows with only a video
   autoplay from the markup and need nothing here. */
(function () {
  'use strict';

  function init() {
    var rows = Array.prototype.slice.call(document.querySelectorAll('.paper-row'));

    rows.forEach(function (row) {
      var video = row.querySelector('.paper-row__hover-video');
      if (!video) return;

      row.addEventListener('mouseenter', function () {
        row.classList.add('is-playing');
        var playing = video.play();
        if (playing && playing.catch) playing.catch(function () {});
      });

      row.addEventListener('mouseleave', function () {
        row.classList.remove('is-playing');
        video.pause();
        video.currentTime = 0;
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
