(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var observer = null;
  if (!reduceMotion && "IntersectionObserver" in window) {
    observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var delay = entry.target.getAttribute("data-delay") || 0;
            setTimeout(function () {
              entry.target.classList.add("is-visible");
            }, Number(delay));
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
  }

  function observeRevealElements(scope) {
    var els = scope.querySelectorAll(".reveal:not([data-reveal-bound])");
    els.forEach(function (el) {
      el.setAttribute("data-reveal-bound", "true");
      if (observer) observer.observe(el);
      else el.classList.add("is-visible");
    });
  }

  observeRevealElements(document);
  document.addEventListener("ramishka:catalog-rendered", function () {
    observeRevealElements(document);
  });

  var nav = document.querySelector(".nav");
  if (nav) {
    var onScroll = function () {
      if (window.scrollY > 24) nav.classList.add("is-scrolled");
      else nav.classList.remove("is-scrolled");
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
})();
