/* ==========================================================================
   Travel map — Leaflet map with a two-way synced place index.

   - Monochrome basemap; places render as accent dots, album places heavier.
   - Right-hand index groups places by year, filters by search, and is wired
     to the map both ways (hover to highlight, click to fly + open card).
   - "View photos" links land on the matching card in gallery.html.
   ========================================================================== */

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
  var FLY_ZOOM = 6;
  var MAP_MAX_BOUNDS = [
    [-85, -180],
    [85, 180]
  ];
  var TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  var HINT_CITIES =
    'Drag to pan, scroll to zoom. Click a dot — or any place in the list — for the story and its photos.';
  var HINT_COUNTRIES =
    'Shaded countries are ones I’ve set foot in. Click a country for everywhere I went there.';

  /* ISO 3166-1 alpha-2 -> continent, used for the "continents" stat. */
  var CONTINENT_BY_CODE = {
    AF: 'AS', AL: 'EU', DZ: 'AF', AD: 'EU', AO: 'AF', AG: 'NA', AR: 'SA', AM: 'AS',
    AU: 'OC', AT: 'EU', AZ: 'AS', BS: 'NA', BH: 'AS', BD: 'AS', BB: 'NA', BY: 'EU',
    BE: 'EU', BZ: 'NA', BJ: 'AF', BT: 'AS', BO: 'SA', BA: 'EU', BW: 'AF', BR: 'SA',
    BN: 'AS', BG: 'EU', BF: 'AF', BI: 'AF', KH: 'AS', CM: 'AF', CA: 'NA', CV: 'AF',
    CF: 'AF', TD: 'AF', CL: 'SA', CN: 'AS', CO: 'SA', KM: 'AF', CG: 'AF', CD: 'AF',
    CR: 'NA', CI: 'AF', HR: 'EU', CU: 'NA', CY: 'EU', CZ: 'EU', DK: 'EU', DJ: 'AF',
    DM: 'NA', DO: 'NA', EC: 'SA', EG: 'AF', SV: 'NA', GQ: 'AF', ER: 'AF', EE: 'EU',
    SZ: 'AF', ET: 'AF', FJ: 'OC', FI: 'EU', FR: 'EU', GA: 'AF', GM: 'AF', GE: 'AS',
    DE: 'EU', GH: 'AF', GR: 'EU', GD: 'NA', GT: 'NA', GN: 'AF', GW: 'AF', GY: 'SA',
    HT: 'NA', HN: 'NA', HK: 'AS', HU: 'EU', IS: 'EU', IN: 'AS', ID: 'AS', IR: 'AS',
    IQ: 'AS', IE: 'EU', IL: 'AS', IT: 'EU', JM: 'NA', JP: 'AS', JO: 'AS', KZ: 'AS',
    KE: 'AF', KI: 'OC', KP: 'AS', KR: 'AS', KW: 'AS', KG: 'AS', LA: 'AS', LV: 'EU',
    LB: 'AS', LS: 'AF', LR: 'AF', LY: 'AF', LI: 'EU', LT: 'EU', LU: 'EU', MO: 'AS',
    MG: 'AF', MW: 'AF', MY: 'AS', MV: 'AS', ML: 'AF', MT: 'EU', MH: 'OC', MR: 'AF',
    MU: 'AF', MX: 'NA', FM: 'OC', MD: 'EU', MC: 'EU', MN: 'AS', ME: 'EU', MA: 'AF',
    MZ: 'AF', MM: 'AS', NA: 'AF', NR: 'OC', NP: 'AS', NL: 'EU', NZ: 'OC', NI: 'NA',
    NE: 'AF', NG: 'AF', MK: 'EU', NO: 'EU', OM: 'AS', PK: 'AS', PW: 'OC', PA: 'NA',
    PG: 'OC', PY: 'SA', PE: 'SA', PH: 'AS', PL: 'EU', PT: 'EU', QA: 'AS', RO: 'EU',
    RU: 'EU', RW: 'AF', KN: 'NA', LC: 'NA', VC: 'NA', WS: 'OC', SM: 'EU', ST: 'AF',
    SA: 'AS', SN: 'AF', RS: 'EU', SC: 'AF', SL: 'AF', SG: 'AS', SK: 'EU', SI: 'EU',
    SB: 'OC', SO: 'AF', ZA: 'AF', SS: 'AF', ES: 'EU', LK: 'AS', SD: 'AF', SR: 'SA',
    SE: 'EU', CH: 'EU', SY: 'AS', TW: 'AS', TJ: 'AS', TZ: 'AF', TH: 'AS', TL: 'AS',
    TG: 'AF', TO: 'OC', TT: 'NA', TN: 'AF', TR: 'AS', TM: 'AS', TV: 'OC', UG: 'AF',
    UA: 'EU', AE: 'AS', GB: 'EU', US: 'NA', UY: 'SA', UZ: 'AS', VU: 'OC', VA: 'EU',
    VE: 'SA', VN: 'AS', YE: 'AS', ZM: 'AF', ZW: 'AF'
  };

  var activeMap = null;
  var activeTileLayer = null;
  var resizeTimer = null;
  var cityLayer = null;
  var countryLayer = null;
  var currentMode = 'cities';
  var allPlaces = [];
  var visitedCountryCodes = {};
  var placesByCountry = {};
  var countryNamesByCode = {};
  var cityBounds = null;
  var countryBounds = null;
  var markersById = {};
  var indexItemsById = {};
  var activePlaceId = null;

  /* ---------------------------------------------------------------- utils */

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

  /* "2025/5" -> {year: 2025, month: 5}; undated places sort to the end. */
  function parseDate(value) {
    if (!value || typeof value !== 'string') return null;
    var parts = value.split('/');
    var year = parseInt(parts[0], 10);
    if (isNaN(year)) return null;
    var month = parts.length > 1 ? parseInt(parts[1], 10) : 0;
    return { year: year, month: isNaN(month) ? 0 : month };
  }

  function sortValue(place) {
    var d = parseDate(place.date);
    if (!d) return -1;
    return d.year * 100 + d.month;
  }

  function formatDate(value) {
    var d = parseDate(value);
    if (!d) return '';
    if (!d.month) return String(d.year);
    return d.year + '.' + (d.month < 10 ? '0' + d.month : d.month);
  }

  /* -------------------------------------------------------------- markers */

  function createDotIcon(place) {
    var hasAlbum = Boolean(place.galleryUrl);
    var size = hasAlbum ? 18 : 13;
    return L.divIcon({
      className: 'travel-map-pin-wrap',
      html: '<span class="travel-dot' + (hasAlbum ? ' travel-dot--album' : '') + '"></span>',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -(size / 2) - 2]
    });
  }

  function buildPlacePopupContent(place) {
    var html = '<div class="travel-popup">';

    if (place.thumbnail) {
      html +=
        '<img class="travel-popup-thumb" src="' +
        escapeHtml(place.thumbnail) +
        '" alt="" loading="lazy" />';
    }

    html += '<div class="travel-popup-body">';

    var meta = [];
    if (place.region) meta.push(escapeHtml(place.region));
    var dateLabel = formatDate(place.date);
    if (dateLabel) meta.push(escapeHtml(dateLabel));
    if (meta.length) {
      html += '<p class="travel-popup-meta">' + meta.join(' &middot; ') + '</p>';
    }

    html += '<h3 class="travel-popup-title">' + escapeHtml(place.name) + '</h3>';

    if (place.summary) {
      html += '<p class="travel-popup-summary">' + escapeHtml(place.summary) + '</p>';
    }

    if (place.galleryUrl) {
      html +=
        '<a class="travel-popup-link" href="' +
        escapeHtml(place.galleryUrl) +
        '">View photos &rarr;</a>';
    } else {
      html += '<span class="travel-popup-note">No photos yet</span>';
    }

    html += '</div></div>';
    return html;
  }

  function buildCountryPopupContent(countryCode, countryName) {
    var places = placesByCountry[countryCode] || [];
    var html = '<div class="travel-popup"><div class="travel-popup-body">';
    html +=
      '<p class="travel-popup-meta">' +
      places.length +
      ' place' +
      (places.length === 1 ? '' : 's') +
      '</p>';
    html += '<h3 class="travel-popup-title">' + escapeHtml(countryName) + '</h3>';
    html += '<ul class="travel-country-places">';

    places.forEach(function (place) {
      html += '<li><span>';
      if (place.galleryUrl) {
        html +=
          '<a href="' + escapeHtml(place.galleryUrl) + '">' + escapeHtml(place.name) + '</a>';
      } else {
        html += escapeHtml(place.name);
      }
      html += '</span>';
      var dateLabel = formatDate(place.date);
      if (dateLabel) {
        html += '<span class="travel-country-date">' + escapeHtml(dateLabel) + '</span>';
      }
      html += '</li>';
    });

    html += '</ul></div></div>';
    return html;
  }

  /* ------------------------------------------------------------ selection */

  function setMarkerState(placeId, className, on) {
    var marker = markersById[placeId];
    if (!marker) return;
    var el = marker.getElement();
    if (!el) return;
    el.classList.toggle(className, Boolean(on));
  }

  function setActivePlace(placeId, options) {
    var opts = options || {};

    if (activePlaceId && activePlaceId !== placeId) {
      setMarkerState(activePlaceId, 'is-active', false);
      var prevItem = indexItemsById[activePlaceId];
      if (prevItem) prevItem.classList.remove('is-active');
    }

    activePlaceId = placeId;
    if (!placeId) return;

    setMarkerState(placeId, 'is-active', true);

    var item = indexItemsById[placeId];
    if (item) {
      item.classList.add('is-active');
      if (opts.scrollIndex) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  /* ------------------------------------------------------------ map setup */

  /* Zoom at which the whole world just fits the container — the floor we clamp
     to, so you can never zoom out into empty space. */
  function getWorldFitZoom(map) {
    var zoom = map.getBoundsZoom(MAP_MAX_BOUNDS, false);
    if (zoom === Infinity || zoom === -Infinity || isNaN(zoom)) {
      return FALLBACK_MIN_ZOOM;
    }
    return zoom;
  }

  /* The tile layer serves from zoom 0, so only the map's minZoom needs moving.
     (L.TileLayer has no setMinZoom method — calling one throws.) */
  function updateWorldMinZoom(map) {
    map.invalidateSize();
    var floorZoom = getWorldFitZoom(map);
    map.setMinZoom(floorZoom);
    if (map.getZoom() < floorZoom) map.setZoom(floorZoom);
  }

  function enforceMinZoom(map) {
    if (map.getZoom() < map.getMinZoom()) {
      map.setZoom(map.getMinZoom());
    }
  }

  function onWindowResize() {
    if (!activeMap) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      updateWorldMinZoom(activeMap);
    }, 150);
  }

  function fitPadding(map) {
    var size = map.getSize();
    var pad = Math.round(Math.min(size.x, size.y) * 0.08);
    return [Math.max(14, Math.min(50, pad)), Math.max(14, Math.min(50, pad))];
  }

  function fitForMode(map) {
    var padding = fitPadding(map);

    if (currentMode === 'cities') {
      if (allPlaces.length === 1) {
        map.setView([allPlaces[0].lat, allPlaces[0].lng], SINGLE_PLACE_ZOOM);
      } else if (cityBounds && cityBounds.isValid()) {
        map.fitBounds(cityBounds, { padding: padding, maxZoom: FIT_BOUNDS_MAX_ZOOM });
      }
    } else if (countryBounds && countryBounds.isValid()) {
      map.fitBounds(countryBounds, { padding: padding, maxZoom: FIT_BOUNDS_MAX_ZOOM });
    } else {
      map.fitBounds(L.latLngBounds(MAP_MAX_BOUNDS), { padding: [20, 20] });
    }
    enforceMinZoom(map);
  }

  function countryStyle() {
    return {
      fillColor: '#2c5282',
      fillOpacity: 0.32,
      color: '#2c5282',
      opacity: 0.55,
      weight: 0.75,
      className: 'travel-country-visited'
    };
  }

  function getCountryCodeFromFeature(feature) {
    var props = feature.properties || {};
    return props.ISO_A2 || props.iso_a2 || props.ISO_A2_EH || '';
  }

  function indexCountryNames(geojson) {
    countryNamesByCode = {};
    if (!geojson || !Array.isArray(geojson.features)) return;
    geojson.features.forEach(function (feature) {
      var code = getCountryCodeFromFeature(feature);
      if (!code) return;
      countryNamesByCode[code] = (feature.properties && feature.properties.name) || code;
    });
  }

  function indexPlaces(places) {
    visitedCountryCodes = {};
    placesByCountry = {};

    places.forEach(function (place) {
      if (!place.countryCode) return;
      visitedCountryCodes[place.countryCode] = true;
      if (!placesByCountry[place.countryCode]) placesByCountry[place.countryCode] = [];
      placesByCountry[place.countryCode].push(place);
    });

    Object.keys(placesByCountry).forEach(function (code) {
      placesByCountry[code].sort(function (a, b) {
        return sortValue(a) - sortValue(b);
      });
    });
  }

  function buildCityLayer(places) {
    var group = L.layerGroup();
    var bounds = L.latLngBounds([]);
    markersById = {};

    places.forEach(function (place) {
      var latLng = L.latLng(place.lat, place.lng);
      bounds.extend(latLng);

      var marker = L.marker(latLng, {
        icon: createDotIcon(place),
        riseOnHover: true,
        title: place.name
      });

      marker.bindPopup(buildPlacePopupContent(place), {
        maxWidth: 260,
        minWidth: 244,
        className: 'travel-leaflet-popup',
        autoPanPadding: [30, 30]
      });

      marker.bindTooltip(place.name, {
        direction: 'top',
        offset: [0, -10],
        className: 'travel-tip',
        opacity: 1
      });

      marker.on('popupopen', function () {
        setActivePlace(place.id, { scrollIndex: true });
      });
      marker.on('popupclose', function () {
        if (activePlaceId === place.id) setActivePlace(null);
      });

      markersById[place.id] = marker;
      group.addLayer(marker);
    });

    cityBounds = bounds;
    return group;
  }

  function buildCountryLayer(geojson) {
    var visitedBounds = L.latLngBounds([]);

    var layer = L.geoJSON(geojson, {
      filter: function (feature) {
        var code = getCountryCodeFromFeature(feature);
        return Boolean(code && visitedCountryCodes[code]);
      },
      style: countryStyle,
      onEachFeature: function (feature, layerRef) {
        var code = getCountryCodeFromFeature(feature);
        var name =
          (feature.properties && feature.properties.name) || countryNamesByCode[code] || code;

        if (layerRef.getBounds) visitedBounds.extend(layerRef.getBounds());

        layerRef.bindPopup(buildCountryPopupContent(code, name), {
          maxWidth: 260,
          minWidth: 244,
          className: 'travel-leaflet-popup'
        });
        layerRef.bindTooltip(name, { sticky: true, className: 'travel-tip', opacity: 1 });
        layerRef.on('mouseover', function () {
          layerRef.setStyle({ fillOpacity: 0.5 });
        });
        layerRef.on('mouseout', function () {
          layerRef.setStyle(countryStyle());
        });
      }
    });

    countryBounds = visitedBounds.isValid() ? visitedBounds : L.latLngBounds(MAP_MAX_BOUNDS);
    return layer;
  }

  /* ------------------------------------------------------------- chrome UI */

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

  function updateBadge() {
    var badge = document.querySelector('.travel-map-badge');
    if (!badge) return;
    if (currentMode === 'countries') {
      var n = Object.keys(visitedCountryCodes).length;
      badge.textContent = n + (n === 1 ? ' country' : ' countries');
    } else {
      badge.textContent = allPlaces.length + ' places mapped';
    }
  }

  function updateToolbar() {
    var citiesBtn = document.getElementById('travel-map-mode-cities');
    var countriesBtn = document.getElementById('travel-map-mode-countries');
    [[citiesBtn, 'cities'], [countriesBtn, 'countries']].forEach(function (pair) {
      var btn = pair[0];
      if (!btn) return;
      var on = currentMode === pair[1];
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function setMode(mode) {
    if (!activeMap || !cityLayer || !countryLayer) return;
    if (mode !== 'cities' && mode !== 'countries') return;
    if (currentMode === mode) return;

    currentMode = mode;

    if (mode === 'cities') {
      if (activeMap.hasLayer(countryLayer)) activeMap.removeLayer(countryLayer);
      if (!activeMap.hasLayer(cityLayer)) activeMap.addLayer(cityLayer);
    } else {
      activeMap.closePopup();
      setActivePlace(null);
      if (activeMap.hasLayer(cityLayer)) activeMap.removeLayer(cityLayer);
      if (!activeMap.hasLayer(countryLayer)) activeMap.addLayer(countryLayer);
    }

    updateToolbar();
    updateHint();
    updateLegend();
    updateBadge();
    fitForMode(activeMap);
    setTimeout(function () {
      updateWorldMinZoom(activeMap);
    }, 100);
  }

  function focusPlace(place) {
    if (!activeMap) return;
    if (currentMode !== 'cities') setMode('cities');

    var marker = markersById[place.id];
    if (!marker) return;

    activeMap.flyTo([place.lat, place.lng], Math.max(activeMap.getZoom(), FLY_ZOOM), {
      duration: 0.7
    });
    activeMap.once('moveend', function () {
      marker.openPopup();
    });
    setActivePlace(place.id, { scrollIndex: false });
  }

  function bindToolbar() {
    var citiesBtn = document.getElementById('travel-map-mode-cities');
    var countriesBtn = document.getElementById('travel-map-mode-countries');
    var resetBtn = document.getElementById('travel-map-reset');

    if (citiesBtn) citiesBtn.addEventListener('click', function () { setMode('cities'); });
    if (countriesBtn) countriesBtn.addEventListener('click', function () { setMode('countries'); });
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        if (!activeMap) return;
        activeMap.closePopup();
        setActivePlace(null);
        fitForMode(activeMap);
      });
    }
  }

  /* ---------------------------------------------------------- place index */

  function renderIndex(places) {
    var scroll = document.getElementById('travel-index-scroll');
    if (!scroll) return;

    scroll.innerHTML = '';
    indexItemsById = {};

    if (!places.length) {
      var empty = document.createElement('p');
      empty.className = 'travel-index__empty';
      empty.textContent = 'No places match that search.';
      scroll.appendChild(empty);
      return;
    }

    var lastGroup = null;

    places.forEach(function (place) {
      var d = parseDate(place.date);
      var group = d ? String(d.year) : 'Someday';

      if (group !== lastGroup) {
        var heading = document.createElement('div');
        heading.className = 'travel-index__year';
        heading.textContent = group;
        scroll.appendChild(heading);
        lastGroup = group;
      }

      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'travel-index__item';
      item.setAttribute('data-place-id', place.id);

      var name = document.createElement('span');
      name.className = 'travel-index__name';
      name.textContent = place.name;
      item.appendChild(name);

      var sub = document.createElement('span');
      sub.className = 'travel-index__sub';

      var region = document.createElement('span');
      region.className = 'travel-index__region';
      region.textContent = place.region || '';
      sub.appendChild(region);

      if (place.galleryUrl) {
        var album = document.createElement('span');
        album.className = 'travel-index__album';
        album.textContent = 'Photos';
        sub.appendChild(album);
      }

      item.appendChild(sub);

      item.addEventListener('click', function () { focusPlace(place); });
      item.addEventListener('mouseenter', function () {
        if (currentMode === 'cities') setMarkerState(place.id, 'is-hover', true);
      });
      item.addEventListener('mouseleave', function () {
        setMarkerState(place.id, 'is-hover', false);
      });

      if (place.id === activePlaceId) item.classList.add('is-active');

      indexItemsById[place.id] = item;
      scroll.appendChild(item);
    });
  }

  function bindSearch(sortedPlaces) {
    var input = document.getElementById('travel-index-search');
    if (!input) return;

    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      if (!q) {
        renderIndex(sortedPlaces);
        return;
      }
      renderIndex(
        sortedPlaces.filter(function (place) {
          return (
            (place.name || '').toLowerCase().indexOf(q) !== -1 ||
            (place.region || '').toLowerCase().indexOf(q) !== -1
          );
        })
      );
    });
  }

  /* ------------------------------------------------------------- hero stats */

  function renderStats(places) {
    var countries = {};
    var continents = {};
    var years = [];

    places.forEach(function (place) {
      if (place.countryCode) {
        countries[place.countryCode] = true;
        var continent = CONTINENT_BY_CODE[place.countryCode];
        if (continent) continents[continent] = true;
      }
      var d = parseDate(place.date);
      if (d) years.push(d.year);
    });

    years.sort(function (a, b) { return a - b; });

    var span = years.length
      ? years[0] === years[years.length - 1]
        ? String(years[0])
        : years[0] + '–' + String(years[years.length - 1]).slice(2)
      : '—';

    var values = {
      'stat-places': places.length,
      'stat-countries': Object.keys(countries).length,
      'stat-continents': Object.keys(continents).length,
      'stat-span': span
    };

    Object.keys(values).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = values[id];
    });
  }

  /* ------------------------------------------------------------------ init */

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
      minZoom: 0,
      maxBounds: MAP_MAX_BOUNDS,
      maxBoundsViscosity: 1.0,
      worldCopyJump: false,
      attributionControl: true
    });

    var tileLayer = L.tileLayer(TILE_URL, {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      minZoom: 0,
      maxZoom: 19,
      noWrap: true,
      /* noWrap alone still lets Leaflet ask for x=-1/x=1 at zoom 0; an explicit
         bounds is what actually stops the 400s. */
      bounds: MAP_MAX_BOUNDS
    });
    tileLayer.addTo(map);

    cityLayer = buildCityLayer(places);
    countryLayer = buildCountryLayer(geojson);

    currentMode = 'cities';
    map.addLayer(cityLayer);

    activeMap = map;
    activeTileLayer = tileLayer;

    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    updateWorldMinZoom(map);

    map.on('zoomend', function () { enforceMinZoom(map); });
    window.addEventListener('resize', onWindowResize);

    bindToolbar();
    updateToolbar();
    updateHint();
    updateLegend();
    updateBadge();
    fitForMode(map);

    setTimeout(function () {
      updateWorldMinZoom(map);
      fitForMode(map);
    }, 120);
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

        var places = placesData.filter(isValidPlace).map(function (place, i) {
          if (!place.id) place.id = 'place-' + i;
          return place;
        });

        if (!places.length) {
          showMessage(
            container,
            'No places on the map yet. Add entries to assets/data/travel-places.json.'
          );
          return;
        }

        /* Newest first — the index reads like a journal. */
        var sorted = places.slice().sort(function (a, b) {
          return sortValue(b) - sortValue(a) || (a.name || '').localeCompare(b.name || '');
        });

        renderStats(places);
        initMap(container, places, geojson);
        renderIndex(sorted);
        bindSearch(sorted);
      })
      .catch(function () {
        showMessage(
          container,
          'Could not load travel map data. Check the JSON/GeoJSON files and serve the site over http.'
        );
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadMapData);
  } else {
    loadMapData();
  }
})();
