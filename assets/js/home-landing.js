(function () {
  "use strict";

  var BUBBLES_URL = "assets/data/home-bubbles.json";
  var MOBILE_BREAKPOINT = 768;

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

  function createBubbleElement(bubble, isMobile) {
    var size = bubble.size;
    if (isMobile) {
      size = Math.round(size * 0.72);
    }

    var wrapper = document.createElement(bubble.link ? "a" : "div");
    wrapper.className = "hero-bubble" + (bubble.link ? " hero-bubble--link" : "");
    wrapper.style.left = bubble.x + "%";
    wrapper.style.top = bubble.y + "%";
    wrapper.style.setProperty("--bubble-size", size + "px");
    wrapper.style.setProperty("--bubble-delay", (bubble.delay || 0) + "s");
    wrapper.style.setProperty(
      "--bubble-duration",
      (4.5 + ((bubble.delay || 0) % 2)) + "s"
    );

    if (bubble.link) {
      wrapper.href = bubble.link;
      if (bubble.link.startsWith("http")) {
        wrapper.target = "_blank";
        wrapper.rel = "noopener noreferrer";
      }
    } else {
      wrapper.setAttribute("role", "img");
      wrapper.setAttribute("aria-label", bubble.intro);
      wrapper.tabIndex = 0;
    }

    var img = document.createElement("img");
    img.className = "hero-bubble__img";
    img.src = bubble.image;
    img.alt = bubble.id;
    img.loading = "lazy";
    img.draggable = false;

    var tooltip = document.createElement("span");
    tooltip.className = "hero-bubble__tooltip";
    tooltip.textContent = bubble.intro;
    tooltip.setAttribute("role", "tooltip");

    wrapper.appendChild(img);
    wrapper.appendChild(tooltip);

    return wrapper;
  }

  function renderBubbles(bubbles) {
    var container = document.querySelector(".hero-landing__bubbles");
    if (!container) return;

    var isMobile = window.innerWidth < MOBILE_BREAKPOINT;

    bubbles.forEach(function (bubble) {
      if (isMobile && bubble.mobile === false) return;
      container.appendChild(createBubbleElement(bubble, isMobile));
    });
  }

  function initBubbles() {
    fetch(BUBBLES_URL)
      .then(function (response) {
        if (!response.ok) throw new Error("Failed to load bubbles");
        return response.json();
      })
      .then(renderBubbles)
      .catch(function (err) {
        console.warn("Home bubbles:", err);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initNameRotate();
      initBubbles();
    });
  } else {
    initNameRotate();
    initBubbles();
  }
})();
