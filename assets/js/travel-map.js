/* ==========================================================================
   Travel map — MapLibre GL globe.

   Click a marker for a short card; if that place has photos, the card links
   straight to its album in the gallery.
   ========================================================================== */

(function () {
  'use strict';

  var MAP_CONTAINER_ID = 'travel-map';
  var PLACES_URL = 'assets/data/travel-places.json';
  var STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

  var START_CENTER = [-25, 40];
  var START_ZOOM = 2.5;
  var REFERENCE_SIDE = 440; /* frame height the zoom above was tuned against */
  var GLOBE_DIAMETER_AT_REF_ZOOM = 950; /* px the globe spans at START_ZOOM */

  var map = null;

  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    var div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function showMessage(container, message) {
    container.innerHTML =
      '<div class="travel-map-message" role="status">' + escapeHtml(message) + '</div>';
  }

  function isValidPlace(place) {
    return (
      place &&
      typeof place.name === 'string' &&
      place.name.length > 0 &&
      typeof place.lat === 'number' &&
      typeof place.lng === 'number' &&
      !isNaN(place.lat) &&
      !isNaN(place.lng)
    );
  }

  /* ---------------------------------------------------------------- popups */

  function buildPlacePopupContent(place) {
    var html = '<div class="travel-popup">';
    html += '<h3 class="travel-popup-title">' + escapeHtml(place.name) + '</h3>';

    var meta = [];
    if (place.region) meta.push(escapeHtml(place.region));
    if (place.date) meta.push(escapeHtml(place.date));
    if (meta.length) {
      html += '<p class="travel-popup-meta">' + meta.join(' &middot; ') + '</p>';
    }

    if (place.thumbnail) {
      html +=
        '<img class="travel-popup-thumb" src="' +
        escapeHtml(place.thumbnail) +
        '" alt="" loading="lazy" />';
    }

    if (place.summary) {
      html += '<p class="travel-popup-summary">' + escapeHtml(place.summary) + '</p>';
    }

    if (place.galleryUrl) {
      html +=
        '<a class="travel-popup-link" href="' +
        escapeHtml(place.galleryUrl) +
        '">View gallery &rarr;</a>';
    }

    html += '</div>';
    return html;
  }

  /* --------------------------------------------------------------- markers */

  function addMarkers(places) {
    places.forEach(function (place) {
      var popup = new maplibregl.Popup({
        offset: 28,
        maxWidth: '260px',
        className: 'travel-maplibre-popup',
        closeButton: true
      }).setHTML(buildPlacePopupContent(place));

      new maplibregl.Marker({ color: '#1a1a1a' })
        .setLngLat([place.lng, place.lat])
        .setPopup(popup)
        .addTo(map);
    });
  }

  /* ------------------------------------------------------------------ init */

  /* Pick the opening zoom from the frame's shape.

     The reference site's look — globe larger than the frame, cropped top and
     bottom — only reads as a globe on a wide landscape frame. On a phone the
     same zoom fills the frame with a patch of ocean, so narrow frames get the
     whole globe instead. */
  function startZoomFor(container) {
    var rect = container.getBoundingClientRect();
    var w = rect.width || GLOBE_DIAMETER_AT_REF_ZOOM;
    var h = rect.height || REFERENCE_SIDE;
    if (!w || !h) return START_ZOOM;

    var wide = w / h >= 1.5;
    var targetDiameter = wide ? w * 0.98 : Math.min(w, h) * 0.92;

    var zoom =
      START_ZOOM + Math.log(targetDiameter / GLOBE_DIAMETER_AT_REF_ZOOM) / Math.LN2;
    return Math.max(0, Math.min(4, zoom));
  }

  /* Dark space, bright rim — this is what gives the reference map its look. */
  function applySky() {
    if (!map.setSky) return;
    map.setSky({
      'sky-color': '#1b3a57',
      'sky-horizon-blend': 0.6,
      'horizon-color': '#ffffff',
      'horizon-fog-blend': 0.6,
      'fog-color': '#ffffff',
      'fog-ground-blend': 0.0,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0]
    });
  }

  function initMap(container, places) {
    if (typeof maplibregl === 'undefined') {
      showMessage(container, 'Map library failed to load. Please refresh the page.');
      return;
    }

    container.innerHTML = '';

    map = new maplibregl.Map({
      container: container,
      style: STYLE_URL,
      center: START_CENTER,
      zoom: startZoomFor(container),
      minZoom: 0,
      attributionControl: { compact: true }
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.scrollZoom.enable();

    map.on('style.load', function () {
      if (map.setProjection) map.setProjection({ type: 'globe' });
      applySky();
      addMarkers(places);
    });

    map.on('error', function (e) {
      if (e && e.error && /style|sprite|glyphs/i.test(String(e.error.message || ''))) {
        showMessage(container, 'Could not load the base map. Please try again later.');
      }
    });
  }

  function loadMapData() {
    var container = document.getElementById(MAP_CONTAINER_ID);
    if (!container) return;

    fetch(PLACES_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('Failed to load places data');
        return r.json();
      })
      .then(function (placesData) {
        if (!Array.isArray(placesData)) throw new Error('Places data must be an array');

        var places = placesData.filter(isValidPlace);
        if (!places.length) {
          showMessage(
            container,
            'No places on the map yet. Add entries to assets/data/travel-places.json.'
          );
          return;
        }

        initMap(container, places);
      })
      .catch(function () {
        showMessage(
          container,
          'Could not load travel map data. Check the JSON file and use a local server.'
        );
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadMapData);
  } else {
    loadMapData();
  }
})();
