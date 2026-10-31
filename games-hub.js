// Games hub: shows personal bests and badges from localStorage.
(function () {
  'use strict';
  var DMG = window.DMG;
  if (!DMG || !document.getElementById('gxBadges')) return;
  function setBest(key, text) { var el = document.querySelector('[data-best="' + key + '"]'); if (el && text) el.textContent = text; }
  function render() {
    var w = DMG.store.get('dm_word_stats', null);
    if (w && w.played) setBest('wins', 'Won ' + w.won + '/' + w.played + ' · streak ' + w.streak);
    var sn = DMG.store.get('dm_snake_best', 0); if (sn) setBest('snake', 'Best score ' + sn);
    var tp = DMG.store.get('dm_typing_best', null); if (tp && tp.wpm) setBest('typing', 'Best ' + tp.wpm + ' WPM');
    var mem = DMG.store.get('infra_memory_best_moves', 0); if (mem) setBest('memory', 'Best ' + mem + ' moves');
    var have = DMG.badges(), grid = document.getElementById('gxBadges'); grid.innerHTML = '';
    Object.keys(DMG.BADGES).forEach(function (id) {
      var b = DMG.BADGES[id], on = have.indexOf(id) !== -1;
      var d = document.createElement('div'); d.className = 'gx-badge' + (on ? ' on' : ''); d.dataset.badge = id;
      d.innerHTML = '<span>' + b.icon + '</span><strong>' + b.name + '</strong><em>' + b.desc + '</em>';
      d.title = on ? 'Unlocked' : 'Locked'; grid.appendChild(d);
    });
    document.getElementById('gxBadgeCount').textContent = have.length + ' of ' + Object.keys(DMG.BADGES).length + ' unlocked';
  }
  document.getElementById('gxReset').addEventListener('click', function () {
    if (!confirm('Reset all game scores and badges in this browser?')) return;
    ['dm_word_stats', 'dm_snake_best', 'dm_typing_best', 'dm_badges', 'infra_memory_best_moves'].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
    document.querySelectorAll('.gx-best').forEach(function (e) { e.innerHTML = '&nbsp;'; });
    render();
  });
  render();
})();
