// Textbook page behaviour. Loaded with `defer`; no inline scripts, no network.
(function () {
  "use strict";

  if (window.mermaid) {
    window.mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default",
    });
    window.mermaid.run({ querySelector: "pre.mermaid" }).catch(function () {
      document.querySelectorAll("pre.mermaid:not([data-processed])").forEach(function (el) {
        el.classList.add("mermaid-failed");
      });
    });
  }

  var root = document.body.getAttribute("data-root") || "";
  var input = document.getElementById("search");
  var list = document.getElementById("search-results");
  var index = null;

  function load(done) {
    if (index) return done();
    // Loaded as a script (search-index.js) so file:// works without fetch.
    var s = document.createElement("script");
    s.src = root + "_assets/search-index.js";
    s.onload = function () {
      index = window.__BOOK_INDEX__ || [];
      done();
    };
    s.onerror = function () {
      index = [];
      done();
    };
    document.head.appendChild(s);
  }

  function show(query) {
    var q = query.trim().toLowerCase();
    list.textContent = "";
    if (!q) {
      list.hidden = true;
      return;
    }
    var hits = index
      .map(function (page) {
        var heading = page.headings.find(function (h) {
          return h.toLowerCase().indexOf(q) >= 0;
        });
        var inTitle = page.title.toLowerCase().indexOf(q) >= 0;
        return inTitle || heading ? { page: page, heading: inTitle ? null : heading } : null;
      })
      .filter(Boolean)
      .slice(0, 12);
    hits.forEach(function (hit) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = root + hit.page.url;
      a.textContent = hit.page.title + (hit.heading ? " › " + hit.heading : "");
      li.appendChild(a);
      list.appendChild(li);
    });
    if (!hits.length) {
      var empty = document.createElement("li");
      empty.textContent = "결과 없음";
      list.appendChild(empty);
    }
    list.hidden = false;
  }

  if (input && list) {
    input.addEventListener("input", function () {
      load(function () {
        show(input.value);
      });
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        var first = list.querySelector("a");
        if (first) window.location.href = first.href;
      }
      if (e.key === "Escape") {
        input.value = "";
        show("");
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && document.activeElement !== input) {
        e.preventDefault();
        input.focus();
      }
    });
  }
})();
