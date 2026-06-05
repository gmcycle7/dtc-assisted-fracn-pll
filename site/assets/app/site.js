/* site.js — shared UI: KaTeX render, auto TOC, back-to-top, mobile nav.
   Loaded on every page (after KaTeX + auto-render). */
(function () {
  function ready(fn){ document.readyState!=="loading" ? fn() : document.addEventListener("DOMContentLoaded", fn); }

  ready(function () {
    // --- KaTeX (vendored) ---
    if (window.renderMathInElement) {
      renderMathInElement(document.body, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\[", right: "\\]", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false },
        ],
        throwOnError: false,
      });
    }
    if (window.Prism) Prism.highlightAll();

    var article = document.querySelector("main .article") || document.querySelector("main");

    // --- auto Table of Contents from h2/h3 ---
    var rail = document.querySelector("aside.toc-rail");
    if (rail && article) {
      var heads = article.querySelectorAll("h2, h3");
      if (heads.length >= 3) {
        var html = '<div class="toc-title">On this page</div>';
        heads.forEach(function (h, i) {
          if (!h.id) h.id = "s" + i + "-" + (h.textContent || "").toLowerCase()
            .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
          var cls = h.tagName === "H3" ? "h3" : "h2";
          html += '<a class="' + cls + '" href="#' + h.id + '">' +
            (h.textContent || "").replace(/\s+/g, " ").trim() + "</a>";
        });
        rail.innerHTML = html;

        // scroll-spy
        var links = rail.querySelectorAll("a");
        var byId = {};
        links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
        var spy = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) {
              links.forEach(function (a) { a.classList.remove("current"); });
              var a = byId[e.target.id]; if (a) a.classList.add("current");
            }
          });
        }, { rootMargin: "0px 0px -75% 0px", threshold: 0 });
        heads.forEach(function (h) { spy.observe(h); });
      } else {
        rail.style.display = "none";
      }
    }

    // --- back to top ---
    var toTop = document.getElementById("toTop");
    if (toTop) {
      window.addEventListener("scroll", function () {
        toTop.classList.toggle("show", window.scrollY > 600);
      });
      toTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
    }

    // --- mobile hamburger ---
    var ham = document.querySelector(".topbar .ham");
    var nav = document.querySelector("nav.side");
    var scrim = document.querySelector(".scrim");
    function closeNav(){ if(nav) nav.classList.remove("open"); if(scrim) scrim.classList.remove("show"); }
    if (ham && nav) {
      ham.addEventListener("click", function () {
        nav.classList.toggle("open");
        if (scrim) scrim.classList.toggle("show");
      });
      if (scrim) scrim.addEventListener("click", closeNav);
      nav.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", closeNav); });
    }
  });
})();
