(function () {
  "use strict";

  var FLOATERS_URL = "assets/data/home-bubbles.json";
  var MOBILE_BREAKPOINT = 768;
  var SAFE_ZONE_PADDING = 24;
  var SPEED_MIN = 0.15;
  var SPEED_MAX = 0.35;

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function randomSpeed() {
    var speed = randomBetween(SPEED_MIN, SPEED_MAX);
    return Math.random() > 0.5 ? speed : -speed;
  }

  function initNameRotate() {
    var container = document.querySelector(".hero-landing .name-rotate");
    if (!container) return;

    var items = container.querySelectorAll(".name-rotate__item");
    if (items.length < 2) return;

    var index = 0;
    var intervalMs = 3500;

    setInterval(function () {
      items[index].classList.remove("is-active");
      index = (index + 1) % items.length;
      items[index].classList.add("is-active");
    }, intervalMs);
  }

  function FloatEngine(heroEl, floatersContainer, centerEl) {
    this.heroEl = heroEl;
    this.floatersContainer = floatersContainer;
    this.centerEl = centerEl;
    this.items = [];
    this.rafId = null;
    this.running = false;
    this.reducedMotion = prefersReducedMotion();
  }

  FloatEngine.prototype.getBounds = function () {
    return {
      width: this.heroEl.clientWidth,
      height: this.heroEl.clientHeight,
    };
  };

  FloatEngine.prototype.getSafeZone = function () {
    if (!this.centerEl) return null;

    var heroRect = this.heroEl.getBoundingClientRect();
    var centerRect = this.centerEl.getBoundingClientRect();

    return {
      left: centerRect.left - heroRect.left - SAFE_ZONE_PADDING,
      top: centerRect.top - heroRect.top - SAFE_ZONE_PADDING,
      right: centerRect.right - heroRect.left + SAFE_ZONE_PADDING,
      bottom: centerRect.bottom - heroRect.top + SAFE_ZONE_PADDING,
    };
  };

  FloatEngine.prototype.addItem = function (config, wrapper, img) {
    var isMobile = window.innerWidth < MOBILE_BREAKPOINT;
    var displayWidth = config.size;
    if (isMobile) {
      displayWidth = Math.round(displayWidth * 0.72);
    }

    var aspectRatio =
      img.naturalWidth && img.naturalHeight
        ? img.naturalHeight / img.naturalWidth
        : 1;
    var displayHeight = displayWidth * aspectRatio;

    wrapper.style.setProperty("--floater-size", displayWidth + "px");

    var item = {
      config: config,
      el: wrapper,
      width: displayWidth,
      height: displayHeight,
      x: 0,
      y: 0,
      vx: config.vx != null ? config.vx : randomSpeed(),
      vy: config.vy != null ? config.vy : randomSpeed(),
      paused: false,
    };

    this.items.push(item);
    this.randomizePosition(item);
    this.renderItem(item);
    this.bindHover(item);
  };

  FloatEngine.prototype.randomizePosition = function (item) {
    var bounds = this.getBounds();
    var maxX = Math.max(0, bounds.width - item.width);
    var maxY = Math.max(0, bounds.height - item.height);
    var safeZone = this.getSafeZone();
    var attempts = 0;
    var maxAttempts = 40;

    do {
      item.x = maxX > 0 ? Math.random() * maxX : 0;
      item.y = maxY > 0 ? Math.random() * maxY : 0;
      attempts++;
    } while (
      attempts < maxAttempts &&
      safeZone &&
      this.intersectsSafeZone(item, safeZone)
    );
  };

  FloatEngine.prototype.intersectsSafeZone = function (item, zone) {
    var itemRight = item.x + item.width;
    var itemBottom = item.y + item.height;

    return !(
      itemRight <= zone.left ||
      item.x >= zone.right ||
      itemBottom <= zone.top ||
      item.y >= zone.bottom
    );
  };

  FloatEngine.prototype.clampPosition = function (item) {
    var bounds = this.getBounds();
    var maxX = Math.max(0, bounds.width - item.width);
    var maxY = Math.max(0, bounds.height - item.height);

    item.x = Math.min(Math.max(0, item.x), maxX);
    item.y = Math.min(Math.max(0, item.y), maxY);
  };

  FloatEngine.prototype.renderItem = function (item) {
    item.el.style.transform =
      "translate(" + item.x + "px, " + item.y + "px)";
  };

  FloatEngine.prototype.bindHover = function (item) {
    var self = this;

    item.el.addEventListener("mouseenter", function () {
      item.paused = true;
    });

    item.el.addEventListener("mouseleave", function () {
      item.paused = false;
    });

    item.el.addEventListener("focusin", function () {
      item.paused = true;
    });

    item.el.addEventListener("focusout", function () {
      item.paused = false;
    });
  };

  FloatEngine.prototype.resolveEdgeCollision = function (item, bounds) {
    if (item.x <= 0) {
      item.x = 0;
      item.vx = Math.abs(item.vx);
    } else if (item.x + item.width >= bounds.width) {
      item.x = bounds.width - item.width;
      item.vx = -Math.abs(item.vx);
    }

    if (item.y <= 0) {
      item.y = 0;
      item.vy = Math.abs(item.vy);
    } else if (item.y + item.height >= bounds.height) {
      item.y = bounds.height - item.height;
      item.vy = -Math.abs(item.vy);
    }
  };

  FloatEngine.prototype.resolveSafeZoneCollision = function (item, zone) {
    var itemRight = item.x + item.width;
    var itemBottom = item.y + item.height;

    var overlapLeft = itemRight - zone.left;
    var overlapRight = zone.right - item.x;
    var overlapTop = itemBottom - zone.top;
    var overlapBottom = zone.bottom - item.y;

    if (
      overlapLeft <= 0 ||
      overlapRight <= 0 ||
      overlapTop <= 0 ||
      overlapBottom <= 0
    ) {
      return;
    }

    var minOverlap = Math.min(
      overlapLeft,
      overlapRight,
      overlapTop,
      overlapBottom
    );

    if (minOverlap === overlapLeft) {
      item.x = zone.left - item.width;
      item.vx = -Math.abs(item.vx);
    } else if (minOverlap === overlapRight) {
      item.x = zone.right;
      item.vx = Math.abs(item.vx);
    } else if (minOverlap === overlapTop) {
      item.y = zone.top - item.height;
      item.vy = -Math.abs(item.vy);
    } else {
      item.y = zone.bottom;
      item.vy = Math.abs(item.vy);
    }
  };

  FloatEngine.prototype.tick = function () {
    var bounds = this.getBounds();
    var safeZone = this.getSafeZone();

    for (var i = 0; i < this.items.length; i++) {
      var item = this.items[i];
      if (item.paused) continue;

      item.x += item.vx;
      item.y += item.vy;

      this.resolveEdgeCollision(item, bounds);

      if (safeZone) {
        this.resolveSafeZoneCollision(item, safeZone);
      }

      this.renderItem(item);
    }
  };

  FloatEngine.prototype.loop = function () {
    if (!this.running) return;
    this.tick();
    this.rafId = window.requestAnimationFrame(this.loop.bind(this));
  };

  FloatEngine.prototype.start = function () {
    if (this.reducedMotion || this.running) return;
    this.running = true;
    this.loop();
  };

  FloatEngine.prototype.stop = function () {
    this.running = false;
    if (this.rafId != null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  };

  FloatEngine.prototype.onResize = function () {
    for (var i = 0; i < this.items.length; i++) {
      this.clampPosition(this.items[i]);
      this.renderItem(this.items[i]);
    }
  };

  function createFloaterElement(config) {
    var wrapper = document.createElement(config.link ? "a" : "div");
    wrapper.className =
      "hero-floater" + (config.link ? " hero-floater--link" : "");

    if (config.link) {
      wrapper.href = config.link;
      if (config.link.indexOf("http") === 0) {
        wrapper.target = "_blank";
        wrapper.rel = "noopener noreferrer";
      }
    } else {
      wrapper.setAttribute("role", "img");
      wrapper.setAttribute("aria-label", config.intro);
      wrapper.tabIndex = 0;
    }

    var img = document.createElement("img");
    img.className = "hero-floater__img";
    img.src = config.image;
    img.alt = config.id;
    img.loading = "eager";
    img.draggable = false;

    var tooltip = document.createElement("span");
    tooltip.className = "hero-floater__tooltip";
    tooltip.textContent = config.intro;
    tooltip.setAttribute("role", "tooltip");

    wrapper.appendChild(img);
    wrapper.appendChild(tooltip);

    return { wrapper: wrapper, img: img };
  }

  function loadImage(img) {
    return new Promise(function (resolve) {
      if (img.complete && img.naturalWidth > 0) {
        resolve();
        return;
      }
      img.addEventListener("load", resolve, { once: true });
      img.addEventListener("error", resolve, { once: true });
    });
  }

  function initFloaters() {
    var heroEl = document.querySelector(".hero-landing");
    var floatersContainer = document.querySelector(".hero-landing__floaters");
    var centerEl = document.querySelector(".hero-landing__center");

    if (!heroEl || !floatersContainer) return;

    function startEngine() {
      fetch(FLOATERS_URL)
        .then(function (response) {
          if (!response.ok) throw new Error("Failed to load floaters");
          return response.json();
        })
        .then(function (floaters) {
          var isMobile = window.innerWidth < MOBILE_BREAKPOINT;
          var engine = new FloatEngine(heroEl, floatersContainer, centerEl);
          var pending = [];

          floaters.forEach(function (config) {
            if (isMobile && config.mobile === false) return;

            var created = createFloaterElement(config);
            floatersContainer.appendChild(created.wrapper);
            pending.push(
              loadImage(created.img).then(function () {
                engine.addItem(config, created.wrapper, created.img);
              })
            );
          });

          return Promise.all(pending).then(function () {
            return engine;
          });
        })
        .then(function (engine) {
          if (!engine || !engine.items.length) return;

          if (!engine.reducedMotion) {
            engine.start();
          }

          window.addEventListener("resize", function () {
            engine.onResize();
          });

          document.addEventListener("visibilitychange", function () {
            if (document.hidden) {
              engine.stop();
            } else if (!engine.reducedMotion) {
              engine.start();
            }
          });
        })
        .catch(function (err) {
          console.warn("Home floaters:", err);
        });
    }

    if (document.readyState === "complete") {
      window.requestAnimationFrame(startEngine);
    } else {
      window.addEventListener(
        "load",
        function () {
          window.requestAnimationFrame(startEngine);
        },
        { once: true }
      );
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initNameRotate();
      initFloaters();
    });
  } else {
    initNameRotate();
    initFloaters();
  }
})();
