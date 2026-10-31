// Reliability tools: pure functions are exposed on window.DMTools so they can be unit-tested.
(function () {
  'use strict';

  var PERIODS = [
    { key: 'Per day', minutes: 24 * 60 },
    { key: 'Per week', minutes: 7 * 24 * 60 },
    { key: 'Per month (30d)', minutes: 30 * 24 * 60 },
    { key: 'Per quarter', minutes: 91.25 * 24 * 60 },
    { key: 'Per year', minutes: 365 * 24 * 60 }
  ];

  function formatDuration(minutes) {
    if (!isFinite(minutes) || minutes < 0) return '—';
    var seconds = minutes * 60;
    if (seconds < 1) return '< 1 sec';
    if (seconds < 60) return Math.round(seconds) + ' sec';
    if (minutes < 60) return (Math.round(minutes * 10) / 10) + ' min';
    var h = Math.floor(minutes / 60), m = Math.round(minutes - h * 60);
    if (m === 60) { h += 1; m = 0; }
    if (h < 24) return h + 'h ' + m + 'm';
    var d = Math.floor(h / 24), rh = h - d * 24;
    return d + 'd ' + rh + 'h';
  }

  function allowedDowntime(slo) {
    return PERIODS.map(function (p) {
      return { label: p.key, minutes: p.minutes * (1 - slo / 100) };
    });
  }

  function budgetStatus(slo, usedMinutes) {
    var total = 30 * 24 * 60 * (1 - slo / 100);
    var used = Math.max(0, usedMinutes || 0);
    var pct = total > 0 ? (used / total) * 100 : (used > 0 ? Infinity : 0);
    return { totalMinutes: total, usedMinutes: used, pct: pct, remainingMinutes: Math.max(0, total - used) };
  }

  function gb(n) {
    if (n >= 1) return (Math.round(n * 10) / 10 === Math.floor(n) ? Math.floor(n) : Math.round(n * 10) / 10) + 'GB';
    return Math.max(1, Math.round(n * 1024)) + 'MB';
  }
  function mb(n) { return Math.max(1, Math.round(n)) + 'MB'; }

  function pgConfig(o) {
    var ram = Math.max(1, +o.ramGB || 1), cpu = Math.max(1, Math.floor(+o.cpus || 1));
    var conn = Math.max(10, Math.floor(+o.maxConn || 100)), load = o.workload || 'oltp';
    var sharedBuffers = ram * 0.25;
    var cacheFrac = load === 'dw' ? 0.5 : 0.75;
    var effCache = ram * cacheFrac;
    var maintMB = Math.min(2048, ram * 1024 * 0.05);
    var gather = Math.max(1, Math.min(4, Math.floor(cpu / 2)));
    var workMB = ((ram - sharedBuffers) * 1024) / (conn * 3) / gather;
    if (load === 'dw') workMB *= 2;
    workMB = Math.min(Math.max(workMB, 4), 1024);
    var maxWal = load === 'dw' ? 16 : (load === 'mixed' ? 8 : 4);
    var lines = [
      ['max_connections', String(conn)],
      ['shared_buffers', gb(sharedBuffers)],
      ['effective_cache_size', gb(effCache)],
      ['maintenance_work_mem', mb(maintMB)],
      ['work_mem', mb(workMB)],
      ['huge_pages', ram >= 32 ? 'try' : 'off'],
      ['checkpoint_completion_target', '0.9'],
      ['wal_buffers', '16MB'],
      ['min_wal_size', '1GB'],
      ['max_wal_size', maxWal + 'GB'],
      ['default_statistics_target', load === 'dw' ? '500' : '100'],
      ['random_page_cost', '1.1'],
      ['effective_io_concurrency', '200'],
      ['max_worker_processes', String(cpu)],
      ['max_parallel_workers', String(cpu)],
      ['max_parallel_workers_per_gather', String(gather)],
      ['max_parallel_maintenance_workers', String(Math.max(1, Math.min(4, Math.floor(cpu / 2))))]
    ];
    return { lines: lines, text: '# Generated starter values (' + ram + ' GB RAM, ' + cpu + ' vCPU, ' + load + ')\n' + lines.map(function (l) { return l[0] + ' = ' + l[1]; }).join('\n') };
  }

  window.DMTools = { formatDuration: formatDuration, allowedDowntime: allowedDowntime, budgetStatus: budgetStatus, pgConfig: pgConfig };

  // ---- UI wiring ----
  var $ = function (id) { return document.getElementById(id); };
  if (!$('slo-input')) return;

  function renderSlo() {
    var slo = parseFloat($('slo-input').value);
    var used = parseFloat($('slo-used').value) || 0;
    var res = $('slo-results');
    if (!isFinite(slo) || slo < 0 || slo >= 100) {
      res.innerHTML = '<p class="tool-error">Enter a target between 0 and 99.99999.</p>';
      $('slo-budget').style.display = 'none';
      return;
    }
    $('slo-budget').style.display = '';
    res.innerHTML = allowedDowntime(slo).map(function (r) {
      return '<div class="result"><span>' + r.label + '</span><strong>' + formatDuration(r.minutes) + '</strong></div>';
    }).join('');
    var b = budgetStatus(slo, used);
    var pct = b.pct;
    var fill = $('slo-budget-fill');
    fill.style.width = Math.min(100, pct) + '%';
    fill.className = 'budget-fill ' + (pct >= 100 ? 'bad' : pct >= 70 ? 'warn' : 'ok');
    $('slo-budget-pct').textContent = (isFinite(pct) ? Math.round(pct * 10) / 10 : '∞') + '% used';
    $('slo-budget-note').textContent = pct >= 100
      ? 'Budget exhausted — time to freeze risky changes and prioritise reliability work.'
      : formatDuration(b.remainingMinutes) + ' left of ' + formatDuration(b.totalMinutes) + ' this month.';
  }
  $('slo-input').addEventListener('input', function () {
    document.querySelectorAll('[data-slo]').forEach(function (c) { c.classList.toggle('active', c.dataset.slo === $('slo-input').value); });
    renderSlo();
  });
  $('slo-used').addEventListener('input', renderSlo);
  document.querySelectorAll('[data-slo]').forEach(function (chip) {
    chip.addEventListener('click', function () {
      $('slo-input').value = chip.dataset.slo;
      document.querySelectorAll('[data-slo]').forEach(function (c) { c.classList.toggle('active', c === chip); });
      renderSlo();
    });
  });

  function renderPg() {
    var cfg = pgConfig({ ramGB: $('pg-ram').value, cpus: $('pg-cpu').value, maxConn: $('pg-conn').value, workload: $('pg-load').value });
    $('pg-output').textContent = cfg.text;
  }
  ['pg-ram', 'pg-cpu', 'pg-conn', 'pg-load'].forEach(function (id) {
    $(id).addEventListener('input', renderPg);
    $(id).addEventListener('change', renderPg);
  });
  $('pg-copy').addEventListener('click', function () {
    var btn = this, text = $('pg-output').textContent;
    var done = function (m) { btn.textContent = m; setTimeout(function () { btn.textContent = 'Copy'; }, 1200); };
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { done('Copied!'); }, function () { done('Failed'); });
  });

  renderSlo();
  renderPg();
})();
