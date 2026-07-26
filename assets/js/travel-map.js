/* ==========================================================================
   Travel map — MapLibre GL globe.

   - By City (default): black pins, hover for the place name, click for a card.
   - By Country: visited countries shaded; click one for everywhere I went.
   - A card links straight to that place's album in the gallery.
   ========================================================================== */

(function () {
  'use strict';

  var MAP_CONTAINER_ID = 'travel-map';
  var PLACES_URL = 'assets/data/travel-places.json';
  var COUNTRIES_URL = 'assets/data/world-countries.geojson';
  var STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

  var START_CENTER = [-25, 40];
  var START_ZOOM = 2.5;
  var REFERENCE_SIDE = 440; /* frame height the zoom above was tuned against */
  var GLOBE_DIAMETER_AT_REF_ZOOM = 950; /* px the globe spans at START_ZOOM */

  var FILL_LAYER = 'visited-countries-fill';
  var LINE_LAYER = 'visited-countries-line';

  var map = null;
  var markers = [];
  var currentMode = 'cities';
  var placesByCountry = {};
  var visitedCodes = [];
  var countryGeojson = null;
  var layersReady = false;
  var modeButtons = {};
  var legendEl = null;

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
    var html = '<div class="travel-card">';

    if (place.thumbnail) {
      html +=
        '<img class="travel-card__thumb" src="' +
        escapeHtml(place.thumbnail) +
        '" alt="" loading="lazy" />';
    }

    html += '<div class="travel-card__body">';

    var meta = [];
    if (place.region) meta.push(escapeHtml(place.region));
    if (place.date) meta.push(escapeHtml(place.date));
    if (meta.length) {
      html += '<p class="travel-card__meta">' + meta.join(' &middot; ') + '</p>';
    }

    html += '<h3 class="travel-card__title">' + escapeHtml(place.name) + '</h3>';

    if (place.summary) {
      html += '<p class="travel-card__text">' + escapeHtml(place.summary) + '</p>';
    }

    if (place.galleryUrl) {
      html +=
        '<a class="travel-card__link" href="' +
        escapeHtml(place.galleryUrl) +
        '">View gallery <span aria-hidden="true">&rarr;</span></a>';
    }

    html += '</div></div>';
    return html;
  }

  function buildCountryPopupContent(code, name) {
    var places = placesByCountry[code] || [];
    var html = '<div class="travel-card"><div class="travel-card__body">';
    html +=
      '<p class="travel-card__meta">' +
      places.length +
      ' place' +
      (places.length === 1 ? '' : 's') +
      '</p>';
    html += '<h3 class="travel-card__title">' + escapeHtml(name) + '</h3>';
    html += '<ul class="travel-card__list">';

    places.forEach(function (place) {
      html += '<li>';
      if (place.galleryUrl) {
        html +=
          '<a href="' + escapeHtml(place.galleryUrl) + '">' + escapeHtml(place.name) + '</a>';
      } else {
        html += '<span>' + escapeHtml(place.name) + '</span>';
      }
      if (place.date) {
        html += '<em>' + escapeHtml(place.date) + '</em>';
      }
      html += '</li>';
    });

    html += '</ul></div></div>';
    return html;
  }

  /* --------------------------------------------------------------- markers */

  function addMarkers(places) {
    places.forEach(function (place) {
      var popup = new maplibregl.Popup({
        offset: 30,
        maxWidth: '218px',
        className: 'travel-card-popup',
        closeButton: true
      }).setHTML(buildPlacePopupContent(place));

      var marker = new maplibregl.Marker({ color: '#1a1a1a' })
        .setLngLat([place.lng, place.lat])
        .setPopup(popup)
        .addTo(map);

      /* Hover label: the default marker element is just a wrapper around the
         pin SVG, so a positioned child rides along with it for free. */
      var el = marker.getElement();
      el.classList.add('travel-pin');
      el.setAttribute('aria-label', place.name);

      var label = document.createElement('span');
      label.className = 'travel-pin__label';
      label.textContent = place.name;
      el.appendChild(label);

      markers.push(marker);
    });
  }

  function setMarkersVisible(visible) {
    markers.forEach(function (marker) {
      var el = marker.getElement();
      if (el) el.style.display = visible ? '' : 'none';
      var popup = marker.getPopup();
      if (!visible && popup && popup.isOpen()) marker.togglePopup();
    });
  }

  /* -------------------------------------------------------- country layers */

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

  function normaliseCountries(geojson) {
    if (!geojson || !Array.isArray(geojson.features)) return;
    geojson.features.forEach(function (feature) {
      var props = feature.properties || {};
      var code = props.ISO_A2 || props.iso_a2 || props.ISO_A2_EH || '';
      /* One property name keeps the layer filter simple. */
      props._code = code;
      props._name = props.name || code;
      feature.properties = props;
    });
  }

  function addCountryLayers() {
    if (!countryGeojson) return;

    /* generateId gives each feature an id, which setFeatureState needs. */
    map.addSource('visited-countries', {
      type: 'geojson',
      data: countryGeojson,
      generateId: true
    });
    var filter = ['in', ['get', '_code'], ['literal', visitedCodes]];

    map.addLayer({
      id: FILL_LAYER,
      type: 'fill',
      source: 'visited-countries',
      filter: filter,
      layout: { visibility: 'none' },
      paint: {
        'fill-color': '#1b3a57',
        'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.62, 0.42]
      }
    });

    map.addLayer({
      id: LINE_LAYER,
      type: 'line',
      source: 'visited-countries',
      filter: filter,
      layout: { visibility: 'none' },
      paint: { 'line-color': '#12293f', 'line-width': 0.8, 'line-opacity': 0.85 }
    });

    var hoveredId = null;

    map.on('mousemove', FILL_LAYER, function (e) {
      if (currentMode !== 'countries') return;
      map.getCanvas().style.cursor = 'pointer';
      var feature = e.features && e.features[0];
      if (!feature) return;
      if (hoveredId !== null) {
        map.setFeatureState({ source: 'visited-countries', id: hoveredId }, { hover: false });
      }
      hoveredId = feature.id;
      if (hoveredId !== undefined && hoveredId !== null) {
        map.setFeatureState({ source: 'visited-countries', id: hoveredId }, { hover: true });
      }
    });

    map.on('mouseleave', FILL_LAYER, function () {
      map.getCanvas().style.cursor = '';
      if (hoveredId !== null) {
        map.setFeatureState({ source: 'visited-countries', id: hoveredId }, { hover: false });
      }
      hoveredId = null;
    });

    map.on('click', FILL_LAYER, function (e) {
      if (currentMode !== 'countries') return;
      var feature = e.features && e.features[0];
      if (!feature) return;
      new maplibregl.Popup({
        maxWidth: '218px',
        className: 'travel-card-popup',
        closeButton: true
      })
        .setLngLat(e.lngLat)
        .setHTML(
          buildCountryPopupContent(feature.properties._code, feature.properties._name)
        )
        .addTo(map);
    });

    layersReady = true;
  }

  function setCountryLayersVisible(visible) {
    if (!layersReady) return;
    [FILL_LAYER, LINE_LAYER].forEach(function (id) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      }
    });
  }

  /* ----------------------------------------------------------------- modes */

  function updateModeUI() {
    Object.keys(modeButtons).forEach(function (mode) {
      var btn = modeButtons[mode];
      if (!btn) return;
      var on = currentMode === mode;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (legendEl) legendEl.style.display = currentMode === 'countries' ? '' : 'none';
  }

  function setMode(mode) {
    if (mode !== 'cities' && mode !== 'countries') return;
    if (currentMode === mode) return;
    currentMode = mode;

    if (map) map.getCanvas().style.cursor = '';

    if (mode === 'cities') {
      setCountryLayersVisible(false);
      setMarkersVisible(true);
    } else {
      setMarkersVisible(false);
      setCountryLayersVisible(true);
    }

    updateModeUI();
  }

  /* A segmented control sitting on the map reads better than chunky buttons
     stacked above it. */
  function makeModeControl() {
    return {
      onAdd: function () {
        var wrap = document.createElement('div');
        wrap.className = 'maplibregl-ctrl travel-modes';
        wrap.setAttribute('role', 'group');
        wrap.setAttribute('aria-label', 'Map view');

        [['cities', 'By City'], ['countries', 'By Country']].forEach(function (pair) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'travel-modes__btn';
          btn.textContent = pair[1];
          btn.setAttribute('aria-pressed', pair[0] === currentMode ? 'true' : 'false');
          if (pair[0] === currentMode) btn.classList.add('is-active');
          btn.addEventListener('click', function () { setMode(pair[0]); });
          modeButtons[pair[0]] = btn;
          wrap.appendChild(btn);
        });

        return wrap;
      },
      onRemove: function () {}
    };
  }

  function makeLegendControl() {
    return {
      onAdd: function () {
        var div = document.createElement('div');
        div.className = 'maplibregl-ctrl travel-legend';
        div.innerHTML =
          '<span class="travel-legend__swatch" aria-hidden="true"></span>' +
          '<span>Countries I&rsquo;ve visited</span>';
        div.style.display = 'none';
        legendEl = div;
        return div;
      },
      onRemove: function () {}
    };
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
      'sky-color': '#0f2a44',
      'sky-horizon-blend': 0.5,
      'horizon-color': '#cfe4f2',
      'horizon-fog-blend': 0.4,
      'fog-color': '#ffffff',
      /* 0 would paint the globe itself with the white fog colour, which is what
         made it look washed out / see-through. 1 keeps the map's own colours. */
      'fog-ground-blend': 1,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.9, 4, 0.7, 7, 0]
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
    map.addControl(makeModeControl(), 'top-left');
    map.addControl(makeLegendControl(), 'bottom-left');
    map.scrollZoom.enable();

    map.on('style.load', function () {
      if (map.setProjection) map.setProjection({ type: 'globe' });
      applySky();
      addCountryLayers();
      addMarkers(places);
      updateModeUI();
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
      /* The country outlines are only needed for By Country — a failure there
         should not take the pins down with it. */
      fetch(COUNTRIES_URL)
        .then(function (r) {
          if (!r.ok) throw new Error('Failed to load countries data');
          return r.json();
        })
        .catch(function () { return null; })
    ])
      .then(function (results) {
        var placesData = results[0];
        countryGeojson = results[1];

        if (!Array.isArray(placesData)) throw new Error('Places data must be an array');

        var places = placesData.filter(isValidPlace);
        if (!places.length) {
          showMessage(
            container,
            'No places on the map yet. Add entries to assets/data/travel-places.json.'
          );
          return;
        }

        indexPlaces(places);
        if (countryGeojson && Array.isArray(countryGeojson.features)) {
          normaliseCountries(countryGeojson);
        } else {
          countryGeojson = null;
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
