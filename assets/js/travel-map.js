(function () {
  'use strict';

  var MAP_CONTAINER_ID = 'travel-map';
  var PLACES_URL = 'assets/data/travel-places.json';
  var COUNTRIES_URL = 'assets/data/visited-countries.geojson';
  var MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
  var LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  var LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  var TILE_URL_RASTER = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  var VISITED_FILL_LAYER = 'visited-countries-fill';
  var VISITED_SOURCE = 'visited-countries';
  var BOUNDARY_BEFORE_LAYER = 'boundary_country_outline';

  var SINGLE_PLACE_ZOOM = 8;
  var FALLBACK_MIN_ZOOM = 2;
  var FIT_BOUNDS_MAX_ZOOM = 5;
  var MAPLIBRE_LOAD_TIMEOUT_MS = 8000;
  var WORLD_BOUNDS = [
    [-180, -85],
    [180, 85]
  ];
  var LEAFLET_MAX_BOUNDS = [
    [-85, -180],
    [85, 180]
  ];

  var HINT_CITIES =
    'By City: drag to pan and zoom. Click a marker for a short card and gallery link.';
  var HINT_COUNTRIES =
    'By Country: blue fill marks countries I\'ve visited; click a pin or country for cities.';

  var activeMap = null;
  var mapEngine = null;
  var activeTileLayer = null;
  var resizeTimer = null;
  var loadTimeoutId = null;
  var setupComplete = false;
  var fallbackTriggered = false;
  var toolbarBound = false;
  var hoveredCountryId = null;

  var cityMarkers = [];
  var countryMarkers = [];
  var leafletCityLayer = null;
  var leafletCountryLayer = null;
  var leafletCountryPinLayer = null;

  var mapContainer = null;
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

  function createLeafletPinIcon() {
    return L.divIcon({
      className: 'travel-map-pin-wrap',
      html: createPinElement().innerHTML,
      iconSize: [24, 36],
      iconAnchor: [12, 36],
      popupAnchor: [0, -36]
    });
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
      return { minLng: lng, maxLng: lng, minLat: lat, maxLat: lat };
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

  function boundsToLeafletBounds(bounds) {
    if (!bounds) return null;
    return L.latLngBounds(
      [bounds.minLat, bounds.minLng],
      [bounds.maxLat, bounds.maxLng]
    );
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

  function mapIsReady(map) {
    if (!map) return false;
    if (mapEngine === 'maplibre') {
      return typeof map.loaded === 'function' && map.loaded();
    }
    return true;
  }

  function safeResize(map) {
    if (!map || !mapIsReady(map)) return;
    if (mapEngine === 'maplibre') {
      map.resize();
    } else if (mapEngine === 'leaflet') {
      map.invalidateSize();
    }
  }

  function getFillMinZoomMapLibre(map) {
    var camera = map.cameraForBounds(WORLD_BOUNDS, { padding: 20 });
    if (!camera || typeof camera.zoom !== 'number' || isNaN(camera.zoom)) {
      return FALLBACK_MIN_ZOOM;
    }
    return Math.max(FALLBACK_MIN_ZOOM, camera.zoom);
  }

  function getFillMinZoomLeaflet(map) {
    var bounds = L.latLngBounds(LEAFLET_MAX_BOUNDS);
    var zoom = map.getBoundsZoom(bounds, false);
    if (zoom === Infinity || zoom === -Infinity || isNaN(zoom)) {
      return FALLBACK_MIN_ZOOM;
    }
    return zoom;
  }

  function updateMinZoomToFill(map) {
    if (!mapIsReady(map)) return;

    var fillZoom =
      mapEngine === 'leaflet' ? getFillMinZoomLeaflet(map) : getFillMinZoomMapLibre(map);

    map.setMinZoom(fillZoom);
    if (mapEngine === 'leaflet' && activeTileLayer) {
      activeTileLayer.setMinZoom(fillZoom);
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

  function onWindowLoadResize() {
    if (activeMap) {
      safeResize(activeMap);
      if (setupComplete) {
        updateMinZoomToFill(activeMap);
      }
    }
  }

  function bindMapResizeHandlers(map) {
    activeMap = map;

    if (mapEngine === 'maplibre') {
      map.on('zoomend', function () {
        enforceMinZoom(map);
      });
    } else {
      map.on('zoomend', function () {
        enforceMinZoom(map);
      });
    }

    window.addEventListener('resize', onWindowResize);
    if (document.readyState === 'complete') {
      setTimeout(onWindowLoadResize, 150);
    } else {
      window.addEventListener('load', onWindowLoadResize);
    }
  }

  function onWindowResize() {
    if (!activeMap) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      safeResize(activeMap);
      if (setupComplete) {
        updateMinZoomToFill(activeMap);
      }
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

  function bindToolbar() {
    if (toolbarBound) return;
    toolbarBound = true;

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

  function setMarkerVisibility(markers, visible) {
    markers.forEach(function (marker) {
      if (mapEngine === 'maplibre') {
        var el = marker.getElement();
        if (el) el.style.display = visible ? '' : 'none';
      } else if (marker._icon) {
        marker._icon.style.display = visible ? '' : 'none';
      }
    });
  }

  function setFillVisibilityMapLibre(map, visible) {
    if (!map.getLayer(VISITED_FILL_LAYER)) return;
    map.setLayoutProperty(VISITED_FILL_LAYER, 'visibility', visible ? 'visible' : 'none');
  }

  function showCountryLayersLeaflet(map) {
    if (leafletCountryLayer && !map.hasLayer(leafletCountryLayer)) {
      map.addLayer(leafletCountryLayer);
    }
    if (leafletCountryPinLayer && !map.hasLayer(leafletCountryPinLayer)) {
      map.addLayer(leafletCountryPinLayer);
    }
  }

  function hideCountryLayersLeaflet(map) {
    if (leafletCountryPinLayer && map.hasLayer(leafletCountryPinLayer)) {
      map.removeLayer(leafletCountryPinLayer);
    }
    if (leafletCountryLayer && map.hasLayer(leafletCountryLayer)) {
      map.removeLayer(leafletCountryLayer);
    }
  }

  function fitForMode(map) {
    if (currentMode === 'cities') {
      if (allPlaces.length === 1) {
        if (mapEngine === 'leaflet') {
          map.setView([allPlaces[0].lat, allPlaces[0].lng], SINGLE_PLACE_ZOOM);
        } else {
          map.flyTo({
            center: [allPlaces[0].lng, allPlaces[0].lat],
            zoom: SINGLE_PLACE_ZOOM,
            duration: 0
          });
        }
      } else if (mapEngine === 'leaflet') {
        var leafletCity = boundsToLeafletBounds(cityBounds);
        if (leafletCity && leafletCity.isValid()) {
          map.fitBounds(leafletCity, { padding: [40, 40], maxZoom: FIT_BOUNDS_MAX_ZOOM });
        }
      } else {
        var bounds = boundsToLngLatBounds(cityBounds);
        if (bounds) {
          map.fitBounds(bounds, { padding: 40, maxZoom: FIT_BOUNDS_MAX_ZOOM, duration: 0 });
        }
      }
    } else if (mapEngine === 'leaflet') {
      var leafletCountry = boundsToLeafletBounds(countryBounds);
      if (leafletCountry && leafletCountry.isValid()) {
        map.fitBounds(leafletCountry, { padding: [40, 40], maxZoom: FIT_BOUNDS_MAX_ZOOM });
      } else {
        map.fitBounds(L.latLngBounds(LEAFLET_MAX_BOUNDS), { padding: [20, 20] });
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

  function applyModeVisibility(mode) {
    if (mapEngine === 'maplibre') {
      if (mode === 'cities') {
        setFillVisibilityMapLibre(activeMap, false);
        setMarkerVisibility(cityMarkers, true);
        setMarkerVisibility(countryMarkers, false);
      } else {
        setFillVisibilityMapLibre(activeMap, true);
        setMarkerVisibility(cityMarkers, false);
        setMarkerVisibility(countryMarkers, true);
      }
    } else {
      if (mode === 'cities') {
        hideCountryLayersLeaflet(activeMap);
        if (leafletCityLayer && !activeMap.hasLayer(leafletCityLayer)) {
          activeMap.addLayer(leafletCityLayer);
        }
      } else {
        if (leafletCityLayer && activeMap.hasLayer(leafletCityLayer)) {
          activeMap.removeLayer(leafletCityLayer);
        }
        showCountryLayersLeaflet(activeMap);
      }
    }
  }

  function setMode(mode) {
    if (!activeMap || !setupComplete) return;
    if (mode !== 'cities' && mode !== 'countries') return;
    if (currentMode === mode) return;

    currentMode = mode;
    applyModeVisibility(mode);

    updateToolbar();
    updateHint();
    updateLegend();
    fitForMode(activeMap);
    setTimeout(function () {
      safeResize(activeMap);
      updateMinZoomToFill(activeMap);
    }, 100);
  }

  function clearMapLibreLoadTimeout() {
    if (loadTimeoutId !== null) {
      clearTimeout(loadTimeoutId);
      loadTimeoutId = null;
    }
  }

  function destroyActiveMap() {
    clearMapLibreLoadTimeout();
    cityMarkers = [];
    countryMarkers = [];
    leafletCityLayer = null;
    leafletCountryLayer = null;
    leafletCountryPinLayer = null;
    setupComplete = false;
    hoveredCountryId = null;

    if (activeMap) {
      if (mapEngine === 'maplibre' && typeof activeMap.remove === 'function') {
        activeMap.remove();
      } else if (mapEngine === 'leaflet' && typeof activeMap.remove === 'function') {
        activeMap.remove();
      }
      activeMap = null;
    }
    mapEngine = null;
    activeTileLayer = null;
  }

  function loadStylesheet(href) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('link[href="' + href + '"]')) {
        resolve();
        return;
      }
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.crossOrigin = '';
      link.onload = function () {
        resolve();
      };
      link.onerror = reject;
      document.head.appendChild(link);
    });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) {
        resolve();
        return;
      }
      var script = document.createElement('script');
      script.src = src;
      script.crossOrigin = '';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function ensureLeafletLoaded() {
    return loadStylesheet(LEAFLET_CSS).then(function () {
      return loadScript(LEAFLET_JS);
    });
  }

  /* --- MapLibre --- */

  function createMapLibrePopup(html) {
    return new maplibregl.Popup({
      maxWidth: '280px',
      className: 'travel-map-popup',
      closeButton: true,
      offset: 25
    }).setHTML(html);
  }

  function createMapLibreMarker(lng, lat, html) {
    return new maplibregl.Marker({ element: createPinElement(), anchor: 'bottom' })
      .setLngLat([lng, lat])
      .setPopup(createMapLibrePopup(html));
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

      createMapLibrePopup(buildCountryPopupContent(code, name))
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

  function addVisitedCountryLayerMapLibre(map) {
    if (map.getSource(VISITED_SOURCE)) return;

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
        layout: { visibility: 'none' },
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

  function buildMapLibreMarkers(map, places) {
    cityMarkers = [];
    places.forEach(function (place) {
      var marker = createMapLibreMarker(place.lng, place.lat, buildPlacePopupContent(place));
      marker.addTo(map);
      cityMarkers.push(marker);
    });

    countryMarkers = [];
    Object.keys(countryCentroids).forEach(function (code) {
      var centroid = countryCentroids[code];
      var marker = createMapLibreMarker(
        centroid.lng,
        centroid.lat,
        buildCountryPopupContent(code, centroid.name)
      );
      marker.addTo(map);
      marker.getElement().style.display = 'none';
      countryMarkers.push(marker);
    });
  }

  function finishMapSetup(map) {
    setupComplete = true;
    currentMode = 'cities';
    bindToolbar();
    updateToolbar();
    updateHint();
    updateLegend();
    applyModeVisibility('cities');
    fitForMode(map);
    safeResize(map);
    updateMinZoomToFill(map);
  }

  function setupMapLibreLayers(map, places) {
    try {
      addVisitedCountryLayerMapLibre(map);
      bindCountryFillInteractions(map);
      buildMapLibreMarkers(map, places);
      finishMapSetup(map);
    } catch (err) {
      console.error('MapLibre layer setup failed:', err);
      triggerLeafletFallback(places, 'Could not add map layers.');
    }
  }

  function triggerLeafletFallback(places, reason) {
    if (fallbackTriggered) return;
    fallbackTriggered = true;
    clearMapLibreLoadTimeout();
    console.warn('Switching to Leaflet fallback:', reason);

    destroyActiveMap();
    if (!mapContainer) return;

    initLeafletFallback(mapContainer, places);
  }

  function initMapLibre(container, places, geojson) {
    if (typeof maplibregl === 'undefined') {
      triggerLeafletFallback(places, 'MapLibre failed to load');
      return;
    }

    mapContainer = container;
    visitedCountryGeojson = geojson;
    indexCountryNames(geojson);
    allPlaces = places;
    indexPlaces(places);
    computeCountryBounds(geojson);
    container.innerHTML = '';
    fallbackTriggered = false;
    setupComplete = false;

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

    mapEngine = 'maplibre';
    activeMap = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

    map.on('error', function (event) {
      console.error('MapLibre error:', event && event.error ? event.error : event);
      if (!setupComplete) {
        triggerLeafletFallback(places, 'Vector map failed to load');
      }
    });

    loadTimeoutId = setTimeout(function () {
      if (!setupComplete && !fallbackTriggered) {
        triggerLeafletFallback(places, 'Map took too long to load');
      }
    }, MAPLIBRE_LOAD_TIMEOUT_MS);

    map.once('idle', function () {
      if (setupComplete || fallbackTriggered) return;
      clearMapLibreLoadTimeout();
      setupMapLibreLayers(map, places);
    });

    bindMapResizeHandlers(map);
  }

  /* --- Leaflet fallback --- */

  function countryStyleLeaflet() {
    return {
      fillColor: '#2c5282',
      fillOpacity: 0.45,
      color: 'transparent',
      weight: 0
    };
  }

  function buildLeafletCityLayer(places) {
    var group = L.layerGroup();
    var pinIcon = createLeafletPinIcon();

    places.forEach(function (place) {
      var marker = L.marker([place.lat, place.lng], { icon: pinIcon });
      marker.bindPopup(buildPlacePopupContent(place), {
        maxWidth: 280,
        className: 'travel-map-popup'
      });
      group.addLayer(marker);
    });

    return group;
  }

  function buildLeafletCountryLayer(geojson) {
    return L.geoJSON(geojson, {
      style: countryStyleLeaflet,
      onEachFeature: function (feature, layer) {
        var code = getCountryCodeFromFeature(feature);
        var name = (feature.properties && feature.properties.name) || countryNamesByCode[code] || code;
        layer.bindPopup(buildCountryPopupContent(code, name), {
          maxWidth: 280,
          className: 'travel-map-popup'
        });
        layer.on('mouseover', function () {
          layer.setStyle({ fillOpacity: 0.58 });
        });
        layer.on('mouseout', function () {
          layer.setStyle(countryStyleLeaflet());
        });
      }
    });
  }

  function buildLeafletCountryPinLayer() {
    var group = L.layerGroup();
    var pinIcon = createLeafletPinIcon();

    Object.keys(countryCentroids).forEach(function (code) {
      var centroid = countryCentroids[code];
      var marker = L.marker([centroid.lat, centroid.lng], { icon: pinIcon });
      marker.bindPopup(buildCountryPopupContent(code, centroid.name), {
        maxWidth: 280,
        className: 'travel-map-popup'
      });
      group.addLayer(marker);
    });

    return group;
  }

  function initLeafletFallback(container, places) {
    ensureLeafletLoaded()
      .then(function () {
        if (typeof L === 'undefined') {
          showMessage(container, 'Map library failed to load. Please refresh the page.');
          return;
        }

        container.innerHTML = '';

        var map = L.map(container, {
          scrollWheelZoom: true,
          zoomControl: true,
          minZoom: FALLBACK_MIN_ZOOM,
          maxBounds: LEAFLET_MAX_BOUNDS,
          maxBoundsViscosity: 1.0,
          worldCopyJump: false
        });

        mapEngine = 'leaflet';
        activeMap = map;

        activeTileLayer = L.tileLayer(TILE_URL_RASTER, {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: 'abcd',
          minZoom: FALLBACK_MIN_ZOOM,
          maxZoom: 19,
          noWrap: true
        });
        activeTileLayer.addTo(map);

        leafletCityLayer = buildLeafletCityLayer(places);
        leafletCountryLayer = buildLeafletCountryLayer(visitedCountryGeojson);
        leafletCountryPinLayer = buildLeafletCountryPinLayer();

        map.addLayer(leafletCityLayer);

        bindMapResizeHandlers(map);

        map.whenReady(function () {
          finishMapSetup(map);
        });
      })
      .catch(function (err) {
        console.error('Leaflet fallback failed:', err);
        showMessage(container, 'Could not load the travel map. Please refresh the page.');
      });
  }

  function initMap(container, places, geojson) {
    mapContainer = container;

    if (typeof maplibregl !== 'undefined') {
      initMapLibre(container, places, geojson);
    } else {
      fallbackTriggered = true;
      visitedCountryGeojson = geojson;
      indexCountryNames(geojson);
      allPlaces = places;
      indexPlaces(places);
      computeCountryBounds(geojson);
      initLeafletFallback(container, places);
    }
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
      .catch(function (err) {
        console.error('Travel map data error:', err);
        showMessage(
          container,
          'Could not load travel map data. Check assets/data/travel-places.json and visited-countries.geojson.'
        );
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadMapData);
  } else {
    loadMapData();
  }
})();
