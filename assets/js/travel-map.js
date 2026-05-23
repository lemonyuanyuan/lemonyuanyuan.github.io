(function () {
  'use strict';

  var MAP_CONTAINER_ID = 'travel-map';
  var DATA_URL = 'assets/data/travel-places.json';
  var worldBounds = null;
  var MIN_ZOOM = 2;
  var MAX_ZOOM = 18;
  var SINGLE_PLACE_ZOOM = 9;
  var FIT_BOUNDS_MAX_ZOOM = 8;

  var pinIcon = null;

  function getWorldBounds() {
    if (!worldBounds) {
      worldBounds = L.latLngBounds(L.latLng(-85, -180), L.latLng(85, 180));
    }
    return worldBounds;
  }

  function getPinIcon() {
    if (pinIcon) return pinIcon;
    pinIcon = L.divIcon({
      className: 'travel-marker-wrap',
      html: '<span class="travel-marker-pin" aria-hidden="true"></span>',
      iconSize: [30, 38],
      iconAnchor: [15, 38],
      popupAnchor: [0, -34]
    });
    return pinIcon;
  }

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

  function addTileLayer(map) {
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
        '&copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
      minZoom: MIN_ZOOM,
      noWrap: true,
      bounds: getWorldBounds()
    }).addTo(map);
  }

  function clampView(map) {
    if (map.getZoom() < MIN_ZOOM) {
      map.setZoom(MIN_ZOOM);
    }
    map.panInsideBounds(getWorldBounds(), { animate: false });
  }

  function initMap(container, places) {
    if (typeof L === 'undefined') {
      showMessage(container, 'Map library failed to load. Please refresh the page.');
      return;
    }

    container.innerHTML = '';

    var map = L.map(container, {
      scrollWheelZoom: true,
      zoomControl: true,
      worldCopyJump: false,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      maxBounds: getWorldBounds(),
      maxBoundsViscosity: 1.0
    });

    addTileLayer(map);

    var bounds = L.latLngBounds([]);
    var icon = getPinIcon();

    places.forEach(function (place) {
      var latLng = L.latLng(place.lat, place.lng);
      bounds.extend(latLng);

      var marker = L.marker(latLng, { icon: icon }).addTo(map);
      marker.bindPopup(buildPopupContent(place), {
        maxWidth: 280,
        className: 'travel-leaflet-popup'
      });
    });

    if (places.length === 1) {
      map.setView([places[0].lat, places[0].lng], SINGLE_PLACE_ZOOM);
    } else if (places.length > 1) {
      map.fitBounds(bounds, {
        padding: [48, 48],
        maxZoom: FIT_BOUNDS_MAX_ZOOM
      });
    }

    clampView(map);

    map.on('zoomend', function () {
      clampView(map);
    });

    setTimeout(function () {
      map.invalidateSize();
      clampView(map);
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
