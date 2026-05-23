(function () {
  var container = document.querySelector(".name-rotate");
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
})();
