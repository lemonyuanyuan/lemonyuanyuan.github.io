(function () {
  "use strict";

  var FLOATERS_URL = "assets/data/home-bubbles.json";
  var MOBILE_BREAKPOINT = 768;
  var SAFE_ZONE_PADDING = 12;
  var SPEED_MIN = 0.02;
  var SPEED_MAX = 0.05;
  var BURST_DURATION_MS = 900;
  var BURST_SPEED = 1.2;
  var PORTRAIT_ORIGIN_Y_RATIO = 0.58;

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

  function FloatEngine(heroEl, floatersContainer, portraitEl, introImgEl, footerWrapEl, stageEl) {
    this.heroEl = heroEl;
    this.floatersContainer = floatersContainer;
    this.portraitEl = portraitEl;
    this.introImgEl = introImgEl;
    this.footerWrapEl = footerWrapEl;
    this.stageEl = stageEl;
    this.items = [];
    this.rafId = null;
    this.running = false;
    this.bursting = false;
    this.burstStart = 0;
    this.reducedMotion = prefersReducedMotion();
  }

  FloatEngine.prototype.getBounds = function () {
    return {
      width: this.heroEl.clientWidth,
      height: this.heroEl.clientHeight,
    };
  };

  FloatEngine.prototype.getPortraitOrigin = function () {
    if (!this.portraitEl) {
      var bounds = this.getBounds();
      return { x: bounds.width / 2, y: bounds.height / 2 };
    }

    var heroRect = this.heroEl.getBoundingClientRect();
    var portraitRect = this.portraitEl.getBoundingClientRect();

    return {
      x: portraitRect.left - heroRect.left + portraitRect.width / 2,
      y:
        portraitRect.top -
        heroRect.top +
        portraitRect.height * PORTRAIT_ORIGIN_Y_RATIO,
    };
  };

  FloatEngine.prototype.getBlockedZones = function () {
    var heroRect = this.heroEl.getBoundingClientRect();
    var zones = [];

    if (this.portraitEl) {
      var p = this.portraitEl.getBoundingClientRect();
      zones.push({
        left: p.left - heroRect.left - SAFE_ZONE_PADDING,
        top: p.top - heroRect.top - SAFE_ZONE_PADDING,
        right: p.right - heroRect.left + SAFE_ZONE_PADDING,
        bottom: p.bottom - heroRect.top + SAFE_ZONE_PADDING,
      });
    }

    if (this.introImgEl) {
      var i = this.introImgEl.getBoundingClientRect();
      zones.push({
        left: i.left - heroRect.left - SAFE_ZONE_PADDING,
        top: i.top - heroRect.top - SAFE_ZONE_PADDING,
        right: i.right - heroRect.left + SAFE_ZONE_PADDING,
        bottom: i.bottom - heroRect.top + SAFE_ZONE_PADDING,
      });
    }

    return zones;
  };

  FloatEngine.prototype.addItem = function (config, wrapper, img, index) {
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
      index: index,
    };

    this.items.push(item);
    this.bindHover(item);

    if (this.reducedMotion) {
      this.randomizePosition(item);
      wrapper.classList.add("is-visible");
      this.renderItem(item);
    }
  };

  FloatEngine.prototype.resolveAllZoneCollisions = function (item) {
    var zones = this.getBlockedZones();
    for (var z = 0; z < zones.length; z++) {
      this.resolveZoneCollision(item, zones[z]);
    }
  };

  FloatEngine.prototype.isPositionValid = function (item, x, y) {
    var savedX = item.x;
    var savedY = item.y;
    item.x = x;
    item.y = y;
    var zones = this.getBlockedZones();
    var valid = true;
    for (var z = 0; z < zones.length; z++) {
      if (this.intersectsZone(item, zones[z])) {
        valid = false;
        break;
      }
    }
    item.x = savedX;
    item.y = savedY;
    return valid;
  };

  FloatEngine.prototype.randomizePosition = function (item) {
    var bounds = this.getBounds();
    var maxX = Math.max(0, bounds.width - item.width);
    var maxY = Math.max(0, bounds.height - item.height);

    for (var attempt = 0; attempt < 80; attempt++) {
      var x = maxX > 0 ? Math.random() * maxX : 0;
      var y = maxY > 0 ? Math.random() * maxY : 0;
      if (this.isPositionValid(item, x, y)) {
        item.x = x;
        item.y = y;
        return;
      }
    }

    item.x = maxX > 0 ? Math.random() * maxX : 0;
    item.y = 0;
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
    item.el.addEventListener("mouseenter", function () {
      if (!item.bursting) item.paused = true;
    });

    item.el.addEventListener("mouseleave", function () {
      item.paused = false;
    });

    item.el.addEventListener("focusin", function () {
      if (!item.bursting) item.paused = true;
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

  FloatEngine.prototype.intersectsZone = function (item, zone) {
    var itemRight = item.x + item.width;
    var itemBottom = item.y + item.height;

    return !(
      itemRight <= zone.left ||
      item.x >= zone.right ||
      itemBottom <= zone.top ||
      item.y >= zone.bottom
    );
  };

  FloatEngine.prototype.resolveZoneCollision = function (item, zone) {
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

  FloatEngine.prototype.setupBurst = function () {
    var origin = this.getPortraitOrigin();
    var count = this.items.length;
    var angleStep = (Math.PI * 2) / Math.max(count, 1);

    for (var i = 0; i < this.items.length; i++) {
      var item = this.items[i];
      var angle = angleStep * i + randomBetween(-0.25, 0.25);
      var speed = BURST_SPEED * randomBetween(0.85, 1.15);

      item.x = origin.x - item.width / 2;
      item.y = origin.y - item.height / 2;
      item.vx = Math.cos(angle) * speed;
      item.vy = Math.sin(angle) * speed;
      item.bursting = true;
      item.el.classList.add("is-visible");
      this.renderItem(item);
    }

    this.bursting = true;
    this.burstStart = performance.now();
  };

  FloatEngine.prototype.tickBurst = function (elapsed) {
    var bounds = this.getBounds();
    var progress = Math.min(elapsed / BURST_DURATION_MS, 1);
    var damping = 1 - progress * 0.35;

    for (var i = 0; i < this.items.length; i++) {
      var item = this.items[i];
      item.x += item.vx * damping;
      item.y += item.vy * damping;
      this.clampPosition(item);
      this.renderItem(item);
    }

    if (progress >= 1) {
      this.bursting = false;
      for (var j = 0; j < this.items.length; j++) {
        this.items[j].bursting = false;
      }
    }
  };

  FloatEngine.prototype.tick = function () {
    if (this.bursting) {
      var elapsed = performance.now() - this.burstStart;
      this.tickBurst(elapsed);
      return;
    }

    var bounds = this.getBounds();

    for (var i = 0; i < this.items.length; i++) {
      var item = this.items[i];
      if (item.paused) continue;

      item.x += item.vx;
      item.y += item.vy;

      this.resolveEdgeCollision(item, bounds);
      this.resolveAllZoneCollisions(item);

      this.renderItem(item);
    }
  };

  FloatEngine.prototype.loop = function () {
    if (!this.running) return;
    this.tick();
    this.rafId = window.requestAnimationFrame(this.loop.bind(this));
  };

  FloatEngine.prototype.start = function () {
    if (this.running) return;
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

  FloatEngine.prototype.playIntro = function () {
    var self = this;

    if (this.stageEl) {
      this.stageEl.classList.add("is-visible");
    }

    if (this.reducedMotion) {
      return Promise.resolve();
    }

    return new Promise(function (resolve) {
      window.requestAnimationFrame(function () {
        self.setupBurst();
        self.start();
        setTimeout(resolve, BURST_DURATION_MS + 50);
      });
    });
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

  function initHeroClickScroll(heroEl) {
    function scrollToFirstSection() {
      var target = document.getElementById("first");
      if (!target) return;

      var top =
        target.getBoundingClientRect().top + window.pageYOffset;
      var offset = (window.innerHeight - target.offsetHeight) / 2;

      window.scrollTo({
        top: Math.max(top - offset, 0),
        behavior: "smooth",
      });
    }

    heroEl.addEventListener("click", function (e) {
      if (e.target.closest("a, button, .hero-floater")) return;
      scrollToFirstSection();
    });
  }

  function initFloaters() {
    var heroEl = document.querySelector(".hero-landing");
    var floatersContainer = document.querySelector(".hero-landing__floaters");
    var portraitEl = document.querySelector(".hero-landing__portrait");
    var introImgEl = document.querySelector(".hero-landing__intro-img");
    var footerWrapEl = document.querySelector(".hero-landing__footer-wrap");
    var stageEl = document.querySelector(".hero-landing__stage");

    if (!heroEl || !floatersContainer) return;

    initHeroClickScroll(heroEl);

    function startEngine() {
      fetch(FLOATERS_URL)
        .then(function (response) {
          if (!response.ok) throw new Error("Failed to load floaters");
          return response.json();
        })
        .then(function (floaters) {
          var isMobile = window.innerWidth < MOBILE_BREAKPOINT;
          var engine = new FloatEngine(
            heroEl,
            floatersContainer,
            portraitEl,
            introImgEl,
            footerWrapEl,
            stageEl
          );
          var pending = [
            loadImage(portraitEl),
            introImgEl ? loadImage(introImgEl) : Promise.resolve(),
          ];

          floaters.forEach(function (config, index) {
            if (isMobile && config.mobile === false) return;

            var created = createFloaterElement(config);
            floatersContainer.appendChild(created.wrapper);
            pending.push(
              loadImage(created.img).then(function () {
                engine.addItem(config, created.wrapper, created.img, index);
              })
            );
          });

          return Promise.all(pending).then(function () {
            return engine;
          });
        })
        .then(function (engine) {
          if (!engine || !engine.items.length) {
            if (stageEl) stageEl.classList.add("is-visible");
            return;
          }

          engine.playIntro().then(function () {
            if (!engine.reducedMotion && !engine.running) {
              engine.start();
            }
          });

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
          if (stageEl) stageEl.classList.add("is-visible");
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
    document.addEventListener("DOMContentLoaded", initFloaters);
  } else {
    initFloaters();
  }
})();
