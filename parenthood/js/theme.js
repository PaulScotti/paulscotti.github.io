// Runs before first paint: apply a saved light/dark override and language so the page doesn't flash.
(function () {
  try {
    var th = localStorage.getItem('ph.theme');
    if (th === 'light' || th === 'dark') document.documentElement.setAttribute('data-theme', th);
    var lang = localStorage.getItem('ph.lang');
    if (lang === 'ko' || lang === 'en') document.documentElement.lang = lang;
  } catch (e) { /* storage unavailable */ }
})();
