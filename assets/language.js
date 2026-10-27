// Explicit language choices apply to archive visits too; direct reader URLs keep their language.
(function () {
  'use strict';
  var root = document.documentElement, language = root.lang === 'tr' ? 'tr' : 'en';
  document.querySelectorAll('[data-site-language]').forEach(function (link) {
    link.addEventListener('click', function () {
      try { localStorage.setItem('commit-language', link.getAttribute('data-site-language')); } catch (_) {}
    });
  });
  var links = document.querySelectorAll('[data-site-language]');
  if (root.getAttribute('data-language-home') === 'true' && links.length) {
    var preferred;
    try { preferred = localStorage.getItem('commit-language'); } catch (_) {}
    if (preferred && preferred !== language && /^(en|tr)$/.test(preferred)) {
      var target = document.querySelector('[data-site-language="' + preferred + '"]');
      if (target) location.replace(target.href);
    }
  }
})();
