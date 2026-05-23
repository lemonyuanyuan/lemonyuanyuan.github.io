(function () {
  'use strict';

  var MAP_CONTAINER_ID = 'travel-map';
  var DATA_URL = 'assets/data/travel-places.json';
  var DEFAULT_CENTER = [20, 0];
  var DEFAULT_ZOOM = 2;
  var SINGLE_PLACE_ZOOM = 8;

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

  function initMap(container, places) {
    if (typeof L === 'undefined') {
      showMessage(container, 'Map library failed to load. Please refresh the page.');
      return;
    }

    container.innerHTML = '';

    var map = L.map(container, {
      scrollWheelZoom: true,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    var bounds = L.latLngBounds([]);
    var markers = [];

    places.forEach(function (place) {
      var latLng = L.latLng(place.lat, place.lng);
      bounds.extend(latLng);

      var marker = L.marker(latLng).addTo(map);
      marker.bindPopup(buildPopupContent(place), {
        maxWidth: 280,
        className: 'travel-leaflet-popup'
      });
      markers.push(marker);
    });

    if (places.length === 1) {
      map.setView([places[0].lat, places[0].lng], SINGLE_PLACE_ZOOM);
    } else if (places.length > 1) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
    } else {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    }

    setTimeout(function () {
      map.invalidateSize();
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
