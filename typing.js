// SQL Sprint: type SQL/CLI snippets against the clock. Pure helpers on window.DMTyping.
(function () {
  'use strict';
  var SNIPPETS = [
    "SELECT * FROM pg_stat_activity WHERE state = 'active';",
    "CREATE INDEX CONCURRENTLY idx_orders_user ON orders (user_id);",
    "VACUUM (ANALYZE, VERBOSE) public.orders;",
    "EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM events;",
    "ALTER TABLE orders SET (autovacuum_vacuum_scale_factor = 0.02);",
    "SELECT pg_size_pretty(pg_database_size(current_database()));",
    "SHOW max_connections;",
    "SELECT * FROM pg_locks WHERE NOT granted;",
    "SET lock_timeout = '5s';",
    "REINDEX INDEX CONCURRENTLY idx_orders_user;",
    "SELECT slot_name, active FROM pg_replication_slots;",
    "SELECT datname, age(datfrozenxid) FROM pg_database;",
    "SELECT now() - pg_postmaster_start_time() AS uptime;",
    "ANALYZE orders;",
    "CHECKPOINT;",
    "patronictl list",
    "pg_dump -Fc -j 4 -f backup.dump mydb",
    "terraform plan -detailed-exitcode -out=tfplan",
    "aws rds describe-db-instances --query 'DBInstances[].DBInstanceIdentifier'",
    "kubectl get pods -n prod --field-selector=status.phase!=Running",
    "journalctl -u postgresql -n 100 --no-pager",
    "df -h /var/lib/postgresql",
    "db.orders.createIndex({ status: 1, createdAt: -1 })",
    "git commit -m 'fix: tune autovacuum on orders'"
  ];
  function compare(target, typed) {
    var correct = 0, wrong = 0, i;
    for (i = 0; i < typed.length; i++) { if (i < target.length && typed[i] === target[i]) correct++; else wrong++; }
    return { correct: correct, wrong: wrong };
  }
  function wpm(correctChars, seconds) { return seconds > 0 ? Math.round((correctChars / 5) / (seconds / 60)) : 0; }
  function accuracy(correct, total) { return total > 0 ? Math.round(100 * correct / total) : 100; }
  function shuffle(a, rng) { a = a.slice(); rng = rng || Math.random; for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  window.DMTyping = { SNIPPETS: SNIPPETS, compare: compare, wpm: wpm, accuracy: accuracy, shuffle: shuffle };

  // ---------- UI ----------
  var target = document.getElementById('tpTarget');
  if (!target) return;
  var DMG = window.DMG, input = document.getElementById('tpInput');
  var queue = [], cur = '', totalCorrect = 0, totalTyped = 0, done = 0, left = 60, duration = 60, running = false, iv = null, t0 = 0;
  var best = DMG.store.get('dm_typing_best', { wpm: 0, acc: 0 });
  var $ = function (id) { return document.getElementById(id); };

  function next() { if (!queue.length) queue = shuffle(SNIPPETS); cur = queue.pop(); input.value = ''; render(); }
  function render() {
    var typed = input.value, html = '';
    for (var i = 0; i < cur.length; i++) {
      var c = cur[i].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      var cls = i < typed.length ? (typed[i] === cur[i] ? 'ok' : 'bad') : (i === typed.length ? 'cur' : '');
      html += '<span class="' + cls + '">' + c + '</span>';
    }
    target.innerHTML = html;
  }
  function liveStats() {
    var elapsed = running ? (performance.now() - t0) / 1000 : duration - left;
    var pc = compare(cur, input.value);
    var c = totalCorrect + pc.correct, t = totalTyped + input.value.length;
    $('tpWpm').textContent = wpm(c, Math.max(elapsed, 3)); $('tpAcc').textContent = accuracy(c, t) + '%'; $('tpDone').textContent = done; $('tpTime').textContent = Math.max(0, Math.ceil(left)) + 's';
  }
  function end() {
    running = false; clearInterval(iv); input.disabled = true;
    var pc = compare(cur, input.value); totalCorrect += pc.correct; totalTyped += input.value.length;
    var w = wpm(totalCorrect, duration), a = accuracy(totalCorrect, totalTyped);
    $('tpWpm').textContent = w; $('tpAcc').textContent = a + '%'; $('tpTime').textContent = '0s';
    var newBest = w > best.wpm;
    if (newBest) { best = { wpm: w, acc: a }; DMG.store.set('dm_typing_best', best); if (w > 0) DMG.confetti(); }
    if (w >= 40) DMG.award('typist'); if (w >= 60) DMG.award('speed');
    $('tpBest').textContent = best.wpm;
    $('tpResult').innerHTML = '<strong>' + w + ' WPM</strong> at ' + a + '% accuracy &middot; ' + done + ' snippet' + (done === 1 ? '' : 's') + (newBest ? ' &middot; new personal best!' : '');
    $('tpShare').style.display = ''; $('tpShare').dataset.text = 'SQL Sprint: ' + w + ' WPM at ' + a + '% accuracy (' + duration + 's). Beat me: https://dishantmodh.com/typing-game.html';
    $('tpStart').textContent = 'Try again'; $('tpStart').disabled = false;
  }
  function start() {
    duration = +$('tpLen').value; left = duration; totalCorrect = 0; totalTyped = 0; done = 0; queue = shuffle(SNIPPETS);
    input.disabled = false; $('tpShare').style.display = 'none'; $('tpResult').textContent = ''; $('tpStart').disabled = true;
    next(); input.focus(); running = true; t0 = performance.now();
    clearInterval(iv);
    iv = setInterval(function () { left = duration - (performance.now() - t0) / 1000; if (left <= 0) { left = 0; end(); } else liveStats(); }, 100);
    liveStats();
  }
  input.addEventListener('input', function () {
    if (!running) return;
    if (input.value === cur) { totalCorrect += cur.length; totalTyped += cur.length; done++; next(); } else render();
    liveStats();
  });
  $('tpStart').addEventListener('click', start);
  $('tpShare').addEventListener('click', function () { DMG.copy(this.dataset.text, this); });
  $('tpBest').textContent = best.wpm;
  cur = SNIPPETS[0]; render();
  window.__typing = { end: end, get running() { return running; } };
})();
