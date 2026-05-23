(function () {
  'use strict';

  var MAP_CONTAINER_ID = 'travel-map';
  var PLACES_URL = 'assets/data/travel-places.json';
  var COUNTRIES_URL = 'assets/data/world-countries.geojson';
  var DEFAULT_CENTER = [20, 0];
  var DEFAULT_ZOOM = 2;
  var SINGLE_PLACE_ZOOM = 8;
  var FALLBACK_MIN_ZOOM = 2;
  var FIT_BOUNDS_MAX_ZOOM = 5;
  var MAP_MAX_BOUNDS = [
    [-85, -180],
    [85, 180]
  ];
  var TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  var HINT_CITIES =
    'By City: drag to pan and zoom. Click a marker for a short card and gallery link.';
  var HINT_COUNTRIES =
    'By Country: blue fill marks countries I\'ve visited; click a pin or country for cities.';

  var activeMap = null;
  var activeTileLayer = null;
  var resizeTimer = null;
  var travelPinIcon = null;
  var cityLayer = null;
  var countryLayer = null;
  var countryPinLayer = null;
  var currentMode = 'cities';
  var allPlaces = [];
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

  function createTravelPinIcon() {
    if (travelPinIcon) return travelPinIcon;

    travelPinIcon = L.divIcon({
      className: 'travel-map-pin-wrap',
      html:
        '<span class="travel-map-pin" aria-hidden="true">' +
        '<svg viewBox="0 0 24 36" width="24" height="36" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="currentColor"/>' +
        '<circle cx="12" cy="12" r="4" fill="#fff"/>' +
        '</svg></span>',
      iconSize: [24, 36],
      iconAnchor: [12, 36],
      popupAnchor: [0, -36]
    });

    return travelPinIcon;
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
    return props.ISO_A2 || props.iso_a2 || props.ISO_A2_EH || '';
  }

  function countryStyle() {
    return {
      fillColor: '#2c5282',
      fillOpacity: 0.45,
      color: 'transparent',
      weight: 0,
      className: 'travel-country-visited'
    };
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

    places.forEach(function (place) {
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

  function fitForMode(map) {
    if (currentMode === 'cities') {
      if (allPlaces.length === 1) {
        map.setView([allPlaces[0].lat, allPlaces[0].lng], SINGLE_PLACE_ZOOM);
      } else if (cityBounds && cityBounds.isValid()) {
        map.fitBounds(cityBounds, { padding: [40, 40], maxZoom: FIT_BOUNDS_MAX_ZOOM });
      }
    } else if (countryBounds && countryBounds.isValid()) {
      map.fitBounds(countryBounds, { padding: [40, 40], maxZoom: FIT_BOUNDS_MAX_ZOOM });
    } else {
      map.fitBounds(L.latLngBounds(MAP_MAX_BOUNDS), { padding: [20, 20] });
    }
    enforceMinZoom(map);
  }

  function showCountryLayers() {
    if (!activeMap || !countryLayer || !countryPinLayer) return;
    if (!activeMap.hasLayer(countryLayer)) activeMap.addLayer(countryLayer);
    if (!activeMap.hasLayer(countryPinLayer)) activeMap.addLayer(countryPinLayer);
    countryPinLayer.bringToFront();
  }

  function hideCountryLayers() {
    if (!activeMap || !countryLayer || !countryPinLayer) return;
    if (activeMap.hasLayer(countryPinLayer)) activeMap.removeLayer(countryPinLayer);
    if (activeMap.hasLayer(countryLayer)) activeMap.removeLayer(countryLayer);
  }

  function setMode(mode) {
    if (!activeMap || !cityLayer || !countryLayer || !countryPinLayer) return;
    if (mode !== 'cities' && mode !== 'countries') return;
    if (currentMode === mode) return;

    currentMode = mode;

    if (mode === 'cities') {
      hideCountryLayers();
      if (!activeMap.hasLayer(cityLayer)) activeMap.addLayer(cityLayer);
    } else {
      if (activeMap.hasLayer(cityLayer)) activeMap.removeLayer(cityLayer);
      showCountryLayers();
    }

    updateToolbar();
    updateHint();
    updateLegend();
    fitForMode(activeMap);
    setTimeout(function () {
      updateMinZoomToFill(activeMap, activeTileLayer);
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

  function buildCityLayer(places) {
    var group = L.layerGroup();
    var bounds = L.latLngBounds([]);
    var pinIcon = createTravelPinIcon();

    places.forEach(function (place) {
      var latLng = L.latLng(place.lat, place.lng);
      bounds.extend(latLng);

      var marker = L.marker(latLng, { icon: pinIcon });
      marker.bindPopup(buildPlacePopupContent(place), {
        maxWidth: 280,
        className: 'travel-leaflet-popup'
      });
      group.addLayer(marker);
    });

    cityBounds = bounds;
    return group;
  }

  function buildCountryPinLayer() {
    var group = L.layerGroup();
    var pinIcon = createTravelPinIcon();

    Object.keys(countryCentroids).forEach(function (code) {
      var centroid = countryCentroids[code];
      var latLng = L.latLng(centroid.lat, centroid.lng);
      var marker = L.marker(latLng, { icon: pinIcon });
      marker.bindPopup(buildCountryPopupContent(code, centroid.name), {
        maxWidth: 280,
        className: 'travel-leaflet-popup'
      });
      group.addLayer(marker);
    });

    return group;
  }

  function buildCountryLayer(geojson) {
    var visitedBounds = L.latLngBounds([]);
    var layer = L.geoJSON(geojson, {
      filter: function (feature) {
        var code = getCountryCodeFromFeature(feature);
        return Boolean(code && visitedCountryCodes[code]);
      },
      style: function () {
        return countryStyle();
      },
      onEachFeature: function (feature, layerRef) {
        var code = getCountryCodeFromFeature(feature);
        var name = (feature.properties && feature.properties.name) || countryNamesByCode[code] || code;

        if (layerRef.getBounds) {
          visitedBounds.extend(layerRef.getBounds());
        }

        layerRef.options.className = 'travel-country-visited';
        layerRef.bindPopup(buildCountryPopupContent(code, name), {
          maxWidth: 280,
          className: 'travel-leaflet-popup'
        });
        layerRef.on('mouseover', function () {
          layerRef.setStyle({ fillOpacity: 0.58 });
        });
        layerRef.on('mouseout', function () {
          layerRef.setStyle(countryStyle());
        });
      }
    });

    countryBounds = visitedBounds.isValid() ? visitedBounds : L.latLngBounds(MAP_MAX_BOUNDS);
    return layer;
  }

  function initMap(container, places, geojson) {
    if (typeof L === 'undefined') {
      showMessage(container, 'Map library failed to load. Please refresh the page.');
      return;
    }

    indexCountryNames(geojson);
    allPlaces = places;
    indexPlaces(places);
    container.innerHTML = '';

    var map = L.map(container, {
      scrollWheelZoom: true,
      zoomControl: true,
      minZoom: FALLBACK_MIN_ZOOM,
      maxBounds: MAP_MAX_BOUNDS,
      maxBoundsViscosity: 1.0,
      worldCopyJump: false
    });

    var tileLayer = L.tileLayer(TILE_URL, {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        minZoom: FALLBACK_MIN_ZOOM,
        maxZoom: 19,
        noWrap: true
      }
    );
    tileLayer.addTo(map);

    cityLayer = buildCityLayer(places);
    countryLayer = buildCountryLayer(geojson);
    countryPinLayer = buildCountryPinLayer();

    currentMode = 'cities';
    map.addLayer(cityLayer);

    bindMapResizeHandlers(map, tileLayer);
    bindToolbar();
    updateToolbar();
    updateHint();
    updateLegend();
    fitForMode(map);

    setTimeout(function () {
      updateMinZoomToFill(map, tileLayer);
    }, 100);
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
