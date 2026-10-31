// Shared helpers for the games: safe storage, confetti, badges. Exposed as window.DMG.
(function () {
  'use strict';
  var store = {
    get: function (key, fallback) {
      try { var v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set: function (key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } }
  };

  var BADGES = {
    wordsmith: { icon: '🔤', name: 'Wordsmith', desc: 'Solve a DB Word Guess puzzle' },
    streak3: { icon: '🔥', name: 'On a Roll', desc: 'Win 3 word puzzles in a row' },
    vacuum: { icon: '🧹', name: 'Vacuum Runner', desc: 'Score 10+ in Vacuum Snake' },
    bloat: { icon: '🏆', name: 'Bloat Buster', desc: 'Score 25+ in Vacuum Snake' },
    typist: { icon: '⌨️', name: 'Fast Fingers', desc: 'Reach 40+ WPM in SQL Sprint' },
    speed: { icon: '⚡', name: 'Query Ninja', desc: 'Reach 60+ WPM in SQL Sprint' },
    memory: { icon: '🧠', name: 'Memory Master', desc: 'Finish Infra Memory Match' }
  };
  function badges() { return store.get('dm_badges', []); }
  function award(id) {
    if (!BADGES[id]) return false;
    var have = badges();
    if (have.indexOf(id) !== -1) return false;
    have.push(id); store.set('dm_badges', have);
    toast('Badge unlocked: ' + BADGES[id].icon + ' ' + BADGES[id].name);
    return true;
  }

  function toast(msg) {
    if (typeof document === 'undefined') return;
    var t = document.createElement('div');
    t.className = 'gx-toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('out'); }, 2400);
    setTimeout(function () { t.remove(); }, 2900);
  }

  function confetti() {
    if (typeof document === 'undefined' || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    var c = document.createElement('canvas');
    c.className = 'gx-confetti'; c.width = window.innerWidth; c.height = window.innerHeight;
    document.body.appendChild(c);
    var ctx = c.getContext('2d'), colors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
    var parts = [];
    for (var i = 0; i < 140; i++) parts.push({ x: c.width / 2, y: c.height / 3, vx: (Math.random() - .5) * 14, vy: Math.random() * -12 - 3, s: 4 + Math.random() * 6, r: Math.random() * 6, c: colors[i % colors.length] });
    var start = performance.now();
    (function frame(now) {
      var t = now - start;
      ctx.clearRect(0, 0, c.width, c.height);
      parts.forEach(function (p) { p.vy += .35; p.x += p.vx; p.y += p.vy; p.r += .2; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(0, 1 - t / 2200); ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .6); ctx.restore(); });
      if (t < 2200) requestAnimationFrame(frame); else c.remove();
    })(start);
  }

  function copy(text, btn, label) {
    var done = function (m) { if (btn) { var o = label || btn.textContent; btn.textContent = m; setTimeout(function () { btn.textContent = o; }, 1400); } };
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { done('Copied!'); }, function () { done('Copy failed'); });
  }

  window.DMG = { store: store, BADGES: BADGES, badges: badges, award: award, toast: toast, confetti: confetti, copy: copy };
})();
