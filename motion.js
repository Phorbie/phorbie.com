/* Scroll reveals, light parallax and pointer tilt. Everything is skipped when the viewer prefers reduced motion. */
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var root = document.documentElement;
  if (reduce || !("IntersectionObserver" in window)) return;
  root.classList.add("motion");

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  document.querySelectorAll(".reveal").forEach(function (el, i) {
    var sib = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
    el.style.setProperty("--d", Math.min(sib, 5) * 80 + "ms");
    io.observe(el);
  });

  var par = document.querySelectorAll("[data-parallax]");
  var ticking = false;
  function onScroll() {
    ticking = false;
    var vh = window.innerHeight;
    par.forEach(function (el) {
      var r = el.getBoundingClientRect();
      var c = (r.top + r.height / 2 - vh / 2);
      el.style.transform = "translate3d(0," + (-c * parseFloat(el.dataset.parallax)).toFixed(1) + "px,0)";
    });
  }
  if (par.length) {
    window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    onScroll();
  }

  if (window.matchMedia("(hover: hover)").matches) {
    document.querySelectorAll(".tilt, .pcard").forEach(function (el) {
      el.addEventListener("pointermove", function (ev) {
        var r = el.getBoundingClientRect();
        var x = (ev.clientX - r.left) / r.width - 0.5, y = (ev.clientY - r.top) / r.height - 0.5;
        el.style.setProperty("--rx", (-y * 5).toFixed(2) + "deg");
        el.style.setProperty("--ry", (x * 7).toFixed(2) + "deg");
        el.style.setProperty("--mx", ((x + 0.5) * 100).toFixed(1) + "%");
        el.style.setProperty("--my", ((y + 0.5) * 100).toFixed(1) + "%");
      });
      el.addEventListener("pointerleave", function () {
        el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg");
      });
    });
  }
})();
