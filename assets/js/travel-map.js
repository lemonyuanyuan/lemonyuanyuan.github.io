(function () {
  'use strict';

  var MAP_CONTAINER_ID = 'travel-map';
  var PLACES_URL = 'assets/data/travel-places.json';
  var COUNTRIES_URL = 'assets/data/visited-countries.geojson';
  var MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
  var VISITED_FILL_LAYER = 'visited-countries-fill';
  var VISITED_SOURCE = 'visited-countries';
  var BOUNDARY_BEFORE_LAYER = 'boundary_country_outline';

  var SINGLE_PLACE_ZOOM = 8;
  var FALLBACK_MIN_ZOOM = 2;
  var FIT_BOUNDS_MAX_ZOOM = 5;
  var WORLD_BOUNDS = [
    [-180, -85],
    [180, 85]
  ];

  var HINT_CITIES =
    'By City: drag to pan and zoom. Click a marker for a short card and gallery link.';
  var HINT_COUNTRIES =
    'By Country: blue fill marks countries I\'ve visited; click a pin or country for cities.';

  var activeMap = null;
  var resizeTimer = null;
  var hoveredCountryId = null;
  var cityMarkers = [];
  var countryMarkers = [];
  var currentMode = 'cities';
  var allPlaces = [];
  var visitedCountryGeojson = null;
  var visitedCountryCodes = {};
  var placesByCountry = {};
  var countryCentroids = {};
  var countryNamesByCode = {};
  var cityBounds = null;
  var countryBounds = null;

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

  function createPinElement() {
    var wrap = document.createElement('div');
    wrap.className = 'travel-map-pin-wrap';
    wrap.innerHTML =
      '<span class="travel-map-pin" aria-hidden="true">' +
      '<svg viewBox="0 0 24 36" width="24" height="36" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="currentColor"/>' +
      '<circle cx="12" cy="12" r="4" fill="#fff"/>' +
      '</svg></span>';
    return wrap;
  }

  function createPopup(html) {
    return new maplibregl.Popup({
      maxWidth: '280px',
      className: 'travel-map-popup',
      closeButton: true,
      offset: 25
    }).setHTML(html);
  }

  function createMarker(lng, lat, html) {
    return new maplibregl.Marker({ element: createPinElement(), anchor: 'bottom' })
      .setLngLat([lng, lat])
      .setPopup(createPopup(html));
  }

  function buildPlacePopupContent(place) {
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

  function buildCountryPopupContent(countryCode, countryName) {
    var places = placesByCountry[countryCode] || [];
    var html = '<div class="travel-popup travel-popup-country">';
    html += '<h3 class="travel-popup-title">' + escapeHtml(countryName) + '</h3>';
    html += '<p class="travel-popup-meta">' + places.length + ' place' + (places.length === 1 ? '' : 's') + '</p>';
    html += '<ul class="travel-country-places">';

    places.forEach(function (place) {
      html += '<li>';
      if (place.galleryUrl) {
        html +=
          '<a href="' +
          escapeHtml(place.galleryUrl) +
          '">' +
          escapeHtml(place.name) +
          '</a>';
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

  function getCountryCodeFromFeature(feature) {
    var props = feature.properties || {};
    return props.ISO_A2 || props.iso_a2 || '';
  }

  function extendBounds(bounds, lng, lat) {
    if (!bounds) {
      return {
        minLng: lng,
        maxLng: lng,
        minLat: lat,
        maxLat: lat
      };
    }
    return {
      minLng: Math.min(bounds.minLng, lng),
      maxLng: Math.max(bounds.maxLng, lng),
      minLat: Math.min(bounds.minLat, lat),
      maxLat: Math.max(bounds.maxLat, lat)
    };
  }

  function boundsFromGeometry(geometry, bounds) {
    if (!geometry) return bounds;

    function walkCoords(coords) {
      if (typeof coords[0] === 'number') {
        return extendBounds(bounds, coords[0], coords[1]);
      }
      for (var i = 0; i < coords.length; i++) {
        bounds = walkCoords(coords[i]);
      }
      return bounds;
    }

    return walkCoords(geometry.coordinates);
  }

  function boundsToLngLatBounds(bounds) {
    if (!bounds) return null;
    return [
      [bounds.minLng, bounds.minLat],
      [bounds.maxLng, bounds.maxLat]
    ];
  }

  function indexCountryNames(geojson) {
    countryNamesByCode = {};
    if (!geojson || !Array.isArray(geojson.features)) return;

    geojson.features.forEach(function (feature) {
      var code = getCountryCodeFromFeature(feature);
      if (!code) return;
      var name = (feature.properties && feature.properties.name) || code;
      countryNamesByCode[code] = name;
    });
  }

  function indexPlaces(places) {
    visitedCountryCodes = {};
    placesByCountry = {};
    countryCentroids = {};
    cityBounds = null;

    places.forEach(function (place) {
      cityBounds = extendBounds(cityBounds, place.lng, place.lat);

      if (!place.countryCode) return;
      visitedCountryCodes[place.countryCode] = true;
      if (!placesByCountry[place.countryCode]) {
        placesByCountry[place.countryCode] = [];
      }
      placesByCountry[place.countryCode].push(place);
    });

    Object.keys(placesByCountry).forEach(function (code) {
      var countryPlaces = placesByCountry[code];
      countryPlaces.sort(function (a, b) {
        return (a.name || '').localeCompare(b.name || '');
      });

      var latSum = 0;
      var lngSum = 0;
      countryPlaces.forEach(function (place) {
        latSum += place.lat;
        lngSum += place.lng;
      });
      countryCentroids[code] = {
        lat: latSum / countryPlaces.length,
        lng: lngSum / countryPlaces.length,
        name: countryNamesByCode[code] || code
      };
    });
  }

  function computeCountryBounds(geojson) {
    countryBounds = null;
    if (!geojson || !Array.isArray(geojson.features)) return;

    geojson.features.forEach(function (feature) {
      countryBounds = boundsFromGeometry(feature.geometry, countryBounds);
    });
  }

  function getFillMinZoom(map) {
    var camera = map.cameraForBounds(WORLD_BOUNDS, { padding: 20 });
    if (!camera || typeof camera.zoom !== 'number' || isNaN(camera.zoom)) {
      return FALLBACK_MIN_ZOOM;
    }
    return Math.max(FALLBACK_MIN_ZOOM, camera.zoom);
  }

  function updateMinZoomToFill(map) {
    map.resize();
    var fillZoom = getFillMinZoom(map);
    map.setMinZoom(fillZoom);
    if (map.getZoom() < fillZoom) {
      map.setZoom(fillZoom);
    }
  }

  function enforceMinZoom(map) {
    if (map.getZoom() < map.getMinZoom()) {
      map.setZoom(map.getMinZoom());
    }
  }

  function bindMapResizeHandlers(map) {
    activeMap = map;

    map.on('zoomend', function () {
      enforceMinZoom(map);
    });

    window.addEventListener('resize', onWindowResize);
  }

  function onWindowResize() {
    if (!activeMap) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      updateMinZoomToFill(activeMap);
    }, 150);
  }

  function updateHint() {
    var hint = document.querySelector('.travel-map-hint');
    if (!hint) return;
    hint.textContent = currentMode === 'countries' ? HINT_COUNTRIES : HINT_CITIES;
  }

  function updateLegend() {
    var legend = document.querySelector('.travel-map-legend');
    if (!legend) return;
    legend.hidden = currentMode !== 'countries';
  }

  function updateToolbar() {
    var citiesBtn = document.getElementById('travel-map-mode-cities');
    var countriesBtn = document.getElementById('travel-map-mode-countries');
    if (citiesBtn) {
      citiesBtn.classList.toggle('is-active', currentMode === 'cities');
      citiesBtn.setAttribute('aria-pressed', currentMode === 'cities' ? 'true' : 'false');
    }
    if (countriesBtn) {
      countriesBtn.classList.toggle('is-active', currentMode === 'countries');
      countriesBtn.setAttribute('aria-pressed', currentMode === 'countries' ? 'true' : 'false');
    }
  }

  function setMarkerVisibility(markers, visible) {
    markers.forEach(function (marker) {
      var el = marker.getElement();
      if (el) {
        el.style.display = visible ? '' : 'none';
      }
    });
  }

  function setFillVisibility(map, visible) {
    if (!map.getLayer(VISITED_FILL_LAYER)) return;
    map.setLayoutProperty(VISITED_FILL_LAYER, 'visibility', visible ? 'visible' : 'none');
  }

  function fitForMode(map) {
    if (currentMode === 'cities') {
      if (allPlaces.length === 1) {
        map.flyTo({
          center: [allPlaces[0].lng, allPlaces[0].lat],
          zoom: SINGLE_PLACE_ZOOM
        });
      } else {
        var bounds = boundsToLngLatBounds(cityBounds);
        if (bounds) {
          map.fitBounds(bounds, { padding: 40, maxZoom: FIT_BOUNDS_MAX_ZOOM, duration: 0 });
        }
      }
    } else {
      var countryLngLatBounds = boundsToLngLatBounds(countryBounds);
      if (countryLngLatBounds) {
        map.fitBounds(countryLngLatBounds, { padding: 40, maxZoom: FIT_BOUNDS_MAX_ZOOM, duration: 0 });
      } else {
        map.fitBounds(WORLD_BOUNDS, { padding: 20, duration: 0 });
      }
    }
    enforceMinZoom(map);
  }

  function setMode(mode) {
    if (!activeMap) return;
    if (mode !== 'cities' && mode !== 'countries') return;
    if (currentMode === mode) return;

    currentMode = mode;

    if (mode === 'cities') {
      setFillVisibility(activeMap, false);
      setMarkerVisibility(cityMarkers, true);
      setMarkerVisibility(countryMarkers, false);
    } else {
      setFillVisibility(activeMap, true);
      setMarkerVisibility(cityMarkers, false);
      setMarkerVisibility(countryMarkers, true);
    }

    updateToolbar();
    updateHint();
    updateLegend();
    fitForMode(activeMap);
    setTimeout(function () {
      updateMinZoomToFill(activeMap);
    }, 100);
  }

  function bindToolbar() {
    var citiesBtn = document.getElementById('travel-map-mode-cities');
    var countriesBtn = document.getElementById('travel-map-mode-countries');
    if (citiesBtn) {
      citiesBtn.addEventListener('click', function () {
        setMode('cities');
      });
    }
    if (countriesBtn) {
      countriesBtn.addEventListener('click', function () {
        setMode('countries');
      });
    }
  }

  function clearHoverState(map) {
    if (hoveredCountryId === null) return;
    map.setFeatureState({ source: VISITED_SOURCE, id: hoveredCountryId }, { hover: false });
    hoveredCountryId = null;
  }

  function bindCountryFillInteractions(map) {
    map.on('click', VISITED_FILL_LAYER, function (event) {
      if (!event.features || !event.features.length) return;
      var feature = event.features[0];
      var code = getCountryCodeFromFeature(feature);
      var name = (feature.properties && feature.properties.name) || countryNamesByCode[code] || code;

      createPopup(buildCountryPopupContent(code, name))
        .setLngLat(event.lngLat)
        .addTo(map);
    });

    map.on('mousemove', VISITED_FILL_LAYER, function (event) {
      map.getCanvas().style.cursor = 'pointer';
      if (!event.features || !event.features.length) return;

      var id = event.features[0].id;
      if (id === undefined || id === null) return;
      if (hoveredCountryId === id) return;

      clearHoverState(map);
      hoveredCountryId = id;
      map.setFeatureState({ source: VISITED_SOURCE, id: id }, { hover: true });
    });

    map.on('mouseleave', VISITED_FILL_LAYER, function () {
      map.getCanvas().style.cursor = '';
      clearHoverState(map);
    });
  }

  function addVisitedCountryLayer(map) {
    map.addSource(VISITED_SOURCE, {
      type: 'geojson',
      data: visitedCountryGeojson,
      promoteId: 'ISO_A2'
    });

    var beforeLayer = map.getLayer(BOUNDARY_BEFORE_LAYER) ? BOUNDARY_BEFORE_LAYER : undefined;

    map.addLayer(
      {
        id: VISITED_FILL_LAYER,
        type: 'fill',
        source: VISITED_SOURCE,
        layout: {
          visibility: 'none'
        },
        paint: {
          'fill-color': '#2c5282',
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            0.58,
            0.45
          ]
        }
      },
      beforeLayer
    );
  }

  function buildCityMarkers(map, places) {
    cityMarkers = [];
    places.forEach(function (place) {
      var marker = createMarker(place.lng, place.lat, buildPlacePopupContent(place));
      marker.addTo(map);
      cityMarkers.push(marker);
    });
  }

  function buildCountryMarkers(map) {
    countryMarkers = [];
    Object.keys(countryCentroids).forEach(function (code) {
      var centroid = countryCentroids[code];
      var marker = createMarker(
        centroid.lng,
        centroid.lat,
        buildCountryPopupContent(code, centroid.name)
      );
      marker.addTo(map);
      marker.getElement().style.display = 'none';
      countryMarkers.push(marker);
    });
  }

  function initMap(container, places, geojson) {
    if (typeof maplibregl === 'undefined') {
      showMessage(container, 'Map library failed to load. Please refresh the page.');
      return;
    }

    visitedCountryGeojson = geojson;
    indexCountryNames(geojson);
    allPlaces = places;
    indexPlaces(places);
    computeCountryBounds(geojson);
    container.innerHTML = '';

    var map = new maplibregl.Map({
      container: container,
      style: MAP_STYLE,
      center: [0, 20],
      zoom: FALLBACK_MIN_ZOOM,
      minZoom: FALLBACK_MIN_ZOOM,
      maxZoom: 18,
      maxBounds: WORLD_BOUNDS,
      renderWorldCopies: false,
      attributionControl: true
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

    map.on('load', function () {
      addVisitedCountryLayer(map);
      bindCountryFillInteractions(map);
      buildCityMarkers(map, places);
      buildCountryMarkers(map);

      currentMode = 'cities';
      bindToolbar();
      updateToolbar();
      updateHint();
      updateLegend();
      fitForMode(map);

      setTimeout(function () {
        updateMinZoomToFill(map);
      }, 100);
    });

    bindMapResizeHandlers(map);
  }

  function loadMapData() {
    var container = document.getElementById(MAP_CONTAINER_ID);
    if (!container) return;

    Promise.all([
      fetch(PLACES_URL).then(function (response) {
        if (!response.ok) throw new Error('Failed to load places data');
        return response.json();
      }),
      fetch(COUNTRIES_URL).then(function (response) {
        if (!response.ok) throw new Error('Failed to load countries data');
        return response.json();
      })
    ])
      .then(function (results) {
        var placesData = results[0];
        var geojson = results[1];

        if (!Array.isArray(placesData)) {
          throw new Error('Places data must be an array');
        }
        if (!geojson || !Array.isArray(geojson.features)) {
          throw new Error('Countries data must be GeoJSON');
        }

        var places = placesData.filter(isValidPlace);

        if (places.length === 0) {
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
