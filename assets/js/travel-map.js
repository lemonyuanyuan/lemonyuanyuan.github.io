(function () {
  'use strict';

  var MAP_CONTAINER_ID = 'travel-map';
  var DATA_URL = 'assets/data/travel-places.json';
  var DEFAULT_CENTER = [20, 0];
  var DEFAULT_ZOOM = 2;
  var SINGLE_PLACE_ZOOM = 8;
  var FALLBACK_MIN_ZOOM = 2;
  var FIT_BOUNDS_MAX_ZOOM = 5;
  var MAP_MAX_BOUNDS = [
    [-85, -180],
    [85, 180]
  ];

  var activeMap = null;
  var activeTileLayer = null;
  var resizeTimer = null;

  function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
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

  function buildPopupContent(place) {
    var html = '<div class="travel-popup">';
    html += '<h3 class="travel-popup-title">' + escapeHtml(place.name) + '</h3>';

    var meta = [];
    if (place.region) meta.push(escapeHtml(place.region));
    if (place.date) meta.push(escapeHtml(place.date));
    if (meta.length) {
      html += '<p class="travel-popup-meta">' + meta.join(' · ') + '</p>';
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
        '<a class="travel-popup-link button small" href="' +
        escapeHtml(place.galleryUrl) +
        '"><span>View gallery</span></a>';
    }

    html += '</div>';
    return html;
  }

  function getFillMinZoom(map) {
    var zoom = map.getBoundsZoom(MAP_MAX_BOUNDS, false);
    if (zoom === Infinity || zoom === -Infinity || isNaN(zoom)) {
      return FALLBACK_MIN_ZOOM;
    }
    return zoom;
  }

  function updateMinZoomToFill(map, tileLayer) {
    map.invalidateSize();
    var fillZoom = getFillMinZoom(map);
    map.setMinZoom(fillZoom);
    if (tileLayer) {
      tileLayer.setMinZoom(fillZoom);
    }
    if (map.getZoom() < fillZoom) {
      map.setZoom(fillZoom);
    }
  }

  function enforceMinZoom(map) {
    if (map.getZoom() < map.getMinZoom()) {
      map.setZoom(map.getMinZoom());
    }
  }

  function bindMapResizeHandlers(map, tileLayer) {
    activeMap = map;
    activeTileLayer = tileLayer;

    map.on('zoomend', function () {
      enforceMinZoom(map);
    });

    window.addEventListener('resize', onWindowResize);
  }

  function onWindowResize() {
    if (!activeMap) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      updateMinZoomToFill(activeMap, activeTileLayer);
    }, 150);
  }

  function initMap(container, places) {
    if (typeof L === 'undefined') {
      showMessage(container, 'Map library failed to load. Please refresh the page.');
      return;
    }

    if (typeof L.markerClusterGroup !== 'function') {
      showMessage(container, 'Map clustering failed to load. Please refresh the page.');
      return;
    }

    container.innerHTML = '';

    var map = L.map(container, {
      scrollWheelZoom: true,
      zoomControl: true,
      minZoom: FALLBACK_MIN_ZOOM,
      maxBounds: MAP_MAX_BOUNDS,
      maxBoundsViscosity: 1.0,
      worldCopyJump: false
    });

    var tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      minZoom: FALLBACK_MIN_ZOOM,
      maxZoom: 19,
      noWrap: true
    });
    tileLayer.addTo(map);

    var bounds = L.latLngBounds([]);
    var clusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true
    });

    places.forEach(function (place) {
      var latLng = L.latLng(place.lat, place.lng);
      bounds.extend(latLng);

      var marker = L.marker(latLng);
      marker.bindPopup(buildPopupContent(place), {
        maxWidth: 280,
        className: 'travel-leaflet-popup'
      });
      clusterGroup.addLayer(marker);
    });

    map.addLayer(clusterGroup);

    if (places.length === 1) {
      map.setView([places[0].lat, places[0].lng], SINGLE_PLACE_ZOOM);
    } else if (places.length > 1) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: FIT_BOUNDS_MAX_ZOOM });
    } else {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    }

    bindMapResizeHandlers(map, tileLayer);

    setTimeout(function () {
      updateMinZoomToFill(map, tileLayer);
    }, 100);
  }

  function loadPlaces() {
    var container = document.getElementById(MAP_CONTAINER_ID);
    if (!container) return;

    fetch(DATA_URL)
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Failed to load places data');
        }
        return response.json();
      })
      .then(function (data) {
        if (!Array.isArray(data)) {
          throw new Error('Places data must be an array');
        }

        var places = data.filter(isValidPlace);

        if (places.length === 0) {
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
          'Could not load travel places. Check assets/data/travel-places.json and use a local server.'
        );
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadPlaces);
  } else {
    loadPlaces();
  }
})();
