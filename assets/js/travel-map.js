/* ==========================================================================
   Travel map — MapLibre GL globe.

   Click a marker for a short card; if that place has photos, the card links
   straight to its album in the gallery.
   ========================================================================== */

(function () {
  'use strict';

  var MAP_CONTAINER_ID = 'travel-map';
  var PLACES_URL = 'assets/data/travel-places.json';
  var COUNTRIES_URL = 'assets/data/world-countries.geojson';
  var STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

  var START_CENTER = [10, 25];
  var START_ZOOM = 2.05;
  var REFERENCE_SIDE = 560; /* frame height the zoom above was tuned against */

  var map = null;
  var markers = [];
  var currentMode = 'cities';
  var allPlaces = [];
  var placesByCountry = {};
  var countryNamesByCode = {};
  var visitedCodes = [];
  var countryLayersReady = false;

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
        '<a class="travel-popup-link button small" href="' +
        escapeHtml(place.galleryUrl) +
        '"><span>View gallery</span></a>';
    }

    html += '</div>';
    return html;
  }

  function buildCountryPopupContent(code, name) {
    var places = placesByCountry[code] || [];
    var html = '<div class="travel-popup travel-popup-country">';
    html += '<h3 class="travel-popup-title">' + escapeHtml(name) + '</h3>';
    html +=
      '<p class="travel-popup-meta">' +
      places.length +
      ' place' +
      (places.length === 1 ? '' : 's') +
      '</p>';
    html += '<ul class="travel-country-places">';

    places.forEach(function (place) {
      html += '<li>';
      if (place.galleryUrl) {
        html +=
          '<a href="' + escapeHtml(place.galleryUrl) + '">' + escapeHtml(place.name) + '</a>';
      } else {
        html += escapeHtml(place.name);
      }
      if (place.date) {
        html += ' <span class="travel-country-date">(' + escapeHtml(place.date) + ')</span>';
      }
      html += '</li>';
    });

    html += '</ul></div>';
    return html;
  }

  /* --------------------------------------------------------------- indexing */

  function getCountryCode(feature) {
    var props = feature.properties || {};
    return props.ISO_A2 || props.iso_a2 || props.ISO_A2_EH || '';
  }

  function indexCountries(geojson) {
    countryNamesByCode = {};
    if (!geojson || !Array.isArray(geojson.features)) return;

    geojson.features.forEach(function (feature) {
      var code = getCountryCode(feature);
      if (!code) return;
      countryNamesByCode[code] = (feature.properties && feature.properties.name) || code;
      /* Normalise onto one property name so the layer filter is simple. */
      feature.properties = feature.properties || {};
      feature.properties._code = code;
      feature.properties._name = countryNamesByCode[code];
    });
  }

  function indexPlaces(places) {
    placesByCountry = {};
    places.forEach(function (place) {
      if (!place.countryCode) return;
      if (!placesByCountry[place.countryCode]) placesByCountry[place.countryCode] = [];
      placesByCountry[place.countryCode].push(place);
    });

    visitedCodes = Object.keys(placesByCountry);
    visitedCodes.forEach(function (code) {
      placesByCountry[code].sort(function (a, b) {
        return (a.name || '').localeCompare(b.name || '');
      });
    });
  }

  /* --------------------------------------------------------------- markers */

  function addMarkers(places) {
    places.forEach(function (place) {
      var popup = new maplibregl.Popup({
        offset: 26,
        maxWidth: '280px',
        className: 'travel-maplibre-popup',
        closeButton: true
      }).setHTML(buildPlacePopupContent(place));

      var marker = new maplibregl.Marker({ color: '#1a1a1a' })
        .setLngLat([place.lng, place.lat])
        .setPopup(popup)
        .addTo(map);

      markers.push(marker);
    });
  }

  function setMarkersVisible(visible) {
    markers.forEach(function (marker) {
      var el = marker.getElement();
      if (el) el.style.display = visible ? '' : 'none';
      if (!visible && marker.getPopup() && marker.getPopup().isOpen()) {
        marker.togglePopup();
      }
    });
  }

  /* -------------------------------------------------------- country layers */

  function addCountryLayers(geojson) {
    map.addSource('visited-countries', { type: 'geojson', data: geojson });

    var filter = ['in', ['get', '_code'], ['literal', visitedCodes]];

    map.addLayer({
      id: 'visited-countries-fill',
      type: 'fill',
      source: 'visited-countries',
      filter: filter,
      layout: { visibility: 'none' },
      paint: { 'fill-color': '#2c5282', 'fill-opacity': 0.45 }
    });

    map.addLayer({
      id: 'visited-countries-line',
      type: 'line',
      source: 'visited-countries',
      filter: filter,
      layout: { visibility: 'none' },
      paint: { 'line-color': '#2c5282', 'line-width': 1, 'line-opacity': 0.7 }
    });

    map.on('click', 'visited-countries-fill', function (e) {
      if (currentMode !== 'countries') return;
      var feature = e.features && e.features[0];
      if (!feature) return;
      var code = feature.properties._code;
      new maplibregl.Popup({ maxWidth: '280px', className: 'travel-maplibre-popup' })
        .setLngLat(e.lngLat)
        .setHTML(buildCountryPopupContent(code, feature.properties._name || code))
        .addTo(map);
    });

    map.on('mouseenter', 'visited-countries-fill', function () {
      if (currentMode === 'countries') map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'visited-countries-fill', function () {
      map.getCanvas().style.cursor = '';
    });

    countryLayersReady = true;
  }

  function setCountryLayersVisible(visible) {
    if (!countryLayersReady) return;
    var value = visible ? 'visible' : 'none';
    ['visited-countries-fill', 'visited-countries-line'].forEach(function (id) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', value);
    });
  }

  /* ----------------------------------------------------------------- modes */

  function updateToolbar() {
    [['travel-map-mode-cities', 'cities'], ['travel-map-mode-countries', 'countries']].forEach(
      function (pair) {
        var btn = document.getElementById(pair[0]);
        if (!btn) return;
        var on = currentMode === pair[1];
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    );

    var legend = document.querySelector('.travel-map-legend');
    if (legend) legend.hidden = currentMode !== 'countries';
  }

  function setMode(mode) {
    if (mode !== 'cities' && mode !== 'countries') return;
    if (currentMode === mode) return;
    currentMode = mode;

    if (mode === 'cities') {
      setCountryLayersVisible(false);
      setMarkersVisible(true);
    } else {
      setMarkersVisible(false);
      setCountryLayersVisible(true);
    }

    updateToolbar();
  }

  function bindToolbar() {
    var cities = document.getElementById('travel-map-mode-cities');
    var countries = document.getElementById('travel-map-mode-countries');
    if (cities) cities.addEventListener('click', function () { setMode('cities'); });
    if (countries) countries.addEventListener('click', function () { setMode('countries'); });
  }

  /* ------------------------------------------------------------------ init */

  /* START_ZOOM is tuned for a desktop-sized frame. On a phone the same zoom
     crops the globe into a flat-looking map, so scale it to the container. */
  function startZoomFor(container) {
    var rect = container.getBoundingClientRect();
    var side = Math.min(rect.width || REFERENCE_SIDE, rect.height || REFERENCE_SIDE);
    if (!side) return START_ZOOM;
    var zoom = START_ZOOM + Math.log(side / REFERENCE_SIDE) / Math.LN2;
    return Math.max(0, Math.min(3, zoom));
  }

  function initMap(container, places, geojson) {
    if (typeof maplibregl === 'undefined') {
      showMessage(container, 'Map library failed to load. Please refresh the page.');
      return;
    }

    indexCountries(geojson);
    allPlaces = places;
    indexPlaces(places);
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
      /* The globe is what makes the reference map read the way it does. */
      if (map.setProjection) map.setProjection({ type: 'globe' });
      addCountryLayers(geojson);
      addMarkers(places);
      bindToolbar();
      updateToolbar();
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

    Promise.all([
      fetch(PLACES_URL).then(function (r) {
        if (!r.ok) throw new Error('Failed to load places data');
        return r.json();
      }),
      fetch(COUNTRIES_URL).then(function (r) {
        if (!r.ok) throw new Error('Failed to load countries data');
        return r.json();
      })
    ])
      .then(function (results) {
        var placesData = results[0];
        var geojson = results[1];

        if (!Array.isArray(placesData)) throw new Error('Places data must be an array');
        if (!geojson || !Array.isArray(geojson.features)) {
          throw new Error('Countries data must be GeoJSON');
        }

        var places = placesData.filter(isValidPlace);
        if (!places.length) {
          showMessage(
            container,
            'No places on the map yet. Add entries to assets/data/travel-places.json.'
          );
          return;
        }

        initMap(container, places, geojson);
      })
      .catch(function () {
        showMessage(
          container,
          'Could not load travel map data. Check JSON/GeoJSON files and use a local server.'
        );
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadMapData);
  } else {
    loadMapData();
  }
})();
