// Article helpers: table of contents, heading anchors, code copy buttons.
(function () {
  'use strict';
  var body = document.querySelector('.post-body');
  if (!body) return;
  var toc = document.getElementById('toc');
  var heads = body.querySelectorAll('h2[id]');
  if (toc) {
    heads.forEach(function (h) {
      var li = document.createElement('li'), a = document.createElement('a');
      a.href = '#' + h.id; a.textContent = h.textContent.replace(/^\d+\.\s*/, '');
      li.appendChild(a); toc.appendChild(li);
      var anchor = document.createElement('a');
      anchor.href = '#' + h.id; anchor.className = 'h-anchor'; anchor.setAttribute('aria-label', 'Link to this section'); anchor.textContent = '#';
      h.appendChild(anchor);
    });
    if (!heads.length) toc.closest('.toc').style.display = 'none';
  }
  body.querySelectorAll('pre').forEach(function (pre) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'copy-btn code-copy'; b.textContent = 'Copy';
    b.addEventListener('click', function () {
      var t = pre.querySelector('code') ? pre.querySelector('code').innerText : pre.innerText;
      var done = function (m) { b.textContent = m; setTimeout(function () { b.textContent = 'Copy'; }, 1200); };
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { done('Copied!'); }, function () { done('Failed'); });
    });
    pre.appendChild(b);
  });
  // highlight current section in the TOC
  if ('IntersectionObserver' in window && toc) {
    var links = {};
    toc.querySelectorAll('a').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { Object.keys(links).forEach(function (k) { links[k].classList.remove('on'); }); links[en.target.id].classList.add('on'); }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    heads.forEach(function (h) { io.observe(h); });
  }
})();
