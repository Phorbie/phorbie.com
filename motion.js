/* Scroll reveals and keys. Skipped when the viewer prefers reduced motion. */
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) return;
  document.documentElement.classList.add("motion");

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  document.querySelectorAll(".reveal").forEach(function (el) {
    var sib = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
    el.style.setProperty("--d", Math.min(sib, 5) * 60 + "ms");
    io.observe(el);
  });

  // Keys settle into place one after another, each travelling down by its own depth.
  var groups = Array.prototype.slice.call(document.querySelectorAll(".keys"));
  groups.forEach(function (g) {
    Array.prototype.forEach.call(g.children, function (k, i) { k.style.setProperty("--kd", 120 + i * 90 + "ms"); });
    io.observe(g);
  });

  // Depth: bigger keys sit closer, so they drift a little further as the page scrolls (at most about 10px).
  var keys = [];
  groups.forEach(function (g) {
    Array.prototype.forEach.call(g.children, function (k) {
      var t = parseFloat(getComputedStyle(k).getPropertyValue("--t")) || 6;
      keys.push({ el: k, group: g, depth: t / 16 });
    });
  });
  if (!keys.length) return;
  var ticking = false;
  function drift() {
    ticking = false;
    var vh = window.innerHeight;
    keys.forEach(function (k) {
      var r = k.group.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) return;
      var p = ((r.top + r.height / 2) - vh / 2) / vh;          // -0.5 .. 0.5 across the viewport
      k.el.style.setProperty("--drift", (p * 20 * k.depth).toFixed(1) + "px");
    });
  }
  window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(drift); } }, { passive: true });
  window.addEventListener("resize", drift);
  drift();
})();
