// DB Word Guess: guess the 5-letter database/SRE term in 6 tries. Pure logic exposed on window.DMWord.
(function () {
  'use strict';
  var WORDS = [
    ['INDEX', 'Speeds up lookups but costs writes'], ['QUERY', 'What you ask a database'], ['TABLE', 'Rows and columns live here'],
    ['SHARD', 'A horizontal slice of data'], ['CACHE', 'Fast memory in front of slow storage'], ['LATCH', 'Lightweight lock inside the engine'],
    ['BLOCK', 'Fixed-size unit of storage I/O'], ['CLOUD', 'Where AWS lives'], ['ALERT', 'What wakes you at 3 a.m.'],
    ['PAGER', 'Device that ruins weekends'], ['STACK', 'Layers of technology'], ['QUEUE', 'First in, first out'],
    ['PROXY', 'Middleman between client and server'], ['NODES', 'Machines in a cluster'], ['CLONE', 'An exact copy of a database or repo'],
    ['TRACE', 'Follows a request across services'], ['FAILS', 'What a failover hopefully catches'], ['BYTES', 'Eight bits each'],
    ['BATCH', 'A group of operations run together'], ['MERGE', 'Combine rows (or branches)'], ['UNION', 'Stacks query results'],
    ['GROUP', 'The BY that aggregates'], ['ORDER', 'The BY that sorts'], ['COUNT', 'Aggregate that tallies rows'],
    ['WRITE', 'Opposite of read'], ['READS', 'Replicas serve these'], ['TOKEN', 'Credential, or a unit of text'],
    ['CRASH', 'Unplanned stop'], ['DEBUG', 'Hunt for the root cause'], ['LOGIN', 'Role attribute that lets you connect'],
    ['ROLES', 'Users and groups in PostgreSQL'], ['RANGE', 'Partitioning by span of values'], ['FETCH', 'Cursor action that gets rows'],
    ['MUTEX', 'Mutual exclusion primitive'], ['VIEWS', 'Saved queries that look like tables'], ['JOINS', 'Combine rows from tables'],
    ['ALTER', 'DDL verb that changes a table'], ['DELTA', 'Change between two states'], ['LOCKS', 'What blocked queries wait for'],
    ['STALE', 'Out-of-date data or statistics'], ['PURGE', 'Delete old data on purpose'], ['RETRY', 'Try again after a failure'],
    ['PRUNE', 'Remove old partitions or tuples'], ['FLUSH', 'Write buffers to disk'], ['RESET', 'Return stats to zero'],
    ['PATCH', 'Fix applied to software'], ['BUILD', 'What CI compiles'], ['LEASE', 'Time-limited leader claim'],
    ['VOTES', 'What a quorum counts'], ['QUOTA', 'A resource limit']
  ];
  var EPOCH = Date.UTC(2026, 0, 1);

  function evaluate(guess, answer) {
    guess = guess.toUpperCase(); answer = answer.toUpperCase();
    var res = [], left = {}, i;
    for (i = 0; i < answer.length; i++) { res.push('absent'); }
    for (i = 0; i < answer.length; i++) {
      if (guess[i] === answer[i]) res[i] = 'correct'; else left[answer[i]] = (left[answer[i]] || 0) + 1;
    }
    for (i = 0; i < answer.length; i++) {
      if (res[i] === 'correct') continue;
      if (left[guess[i]] > 0) { res[i] = 'present'; left[guess[i]]--; }
    }
    return res;
  }
  function dayIndex(date) {
    var d = date || new Date();
    var utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.floor((utc - EPOCH) / 86400000);
  }
  function dailyWord(date) { var i = ((dayIndex(date) % WORDS.length) + WORDS.length) % WORDS.length; return WORDS[i]; }
  function isValid(w) { return /^[A-Za-z]{5}$/.test(w); }

  function Game(entry) {
    this.answer = entry[0]; this.hint = entry[1]; this.guesses = []; this.results = []; this.status = 'playing'; this.maxTries = 6;
  }
  Game.prototype.submit = function (w) {
    if (this.status !== 'playing') return { ok: false, reason: 'over' };
    if (!isValid(w)) return { ok: false, reason: 'invalid' };
    w = w.toUpperCase();
    var r = evaluate(w, this.answer);
    this.guesses.push(w); this.results.push(r);
    if (w === this.answer) this.status = 'won'; else if (this.guesses.length >= this.maxTries) this.status = 'lost';
    return { ok: true, result: r, status: this.status };
  };
  Game.prototype.share = function (label) {
    var map = { correct: '🟩', present: '🟨', absent: '⬛' };
    return 'DB Word Guess ' + (label || '') + ' ' + (this.status === 'won' ? this.guesses.length : 'X') + '/6\n' +
      this.results.map(function (r) { return r.map(function (x) { return map[x]; }).join(''); }).join('\n') + '\nhttps://dishantmodh.com/word-game.html';
  };
  function letterStates(game) {
    var rank = { absent: 1, present: 2, correct: 3 }, st = {};
    game.guesses.forEach(function (g, gi) {
      for (var i = 0; i < g.length; i++) {
        var s = game.results[gi][i];
        if (!st[g[i]] || rank[s] > rank[st[g[i]]]) st[g[i]] = s;
      }
    });
    return st;
  }

  window.DMWord = { WORDS: WORDS, evaluate: evaluate, dailyWord: dailyWord, dayIndex: dayIndex, isValid: isValid, Game: Game, letterStates: letterStates };

  // ---------- UI ----------
  var board = document.getElementById('wgBoard');
  if (!board) return;
  var DMG = window.DMG, kb = document.getElementById('wgKeys'), msg = document.getElementById('wgMsg');
  var mode = 'daily', game, current = '', todayKey = 'dm_word_daily_' + dayIndex();

  function stats() { return DMG.store.get('dm_word_stats', { played: 0, won: 0, streak: 0, max: 0, dist: [0, 0, 0, 0, 0, 0] }); }
  function renderStats() {
    var s = stats();
    document.getElementById('wgPlayed').textContent = s.played;
    document.getElementById('wgWinPct').textContent = s.played ? Math.round(100 * s.won / s.played) + '%' : '-';
    document.getElementById('wgStreak').textContent = s.streak;
    document.getElementById('wgMax').textContent = s.max;
  }
  function say(t) { msg.textContent = t; }
  function build() {
    board.innerHTML = '';
    for (var r = 0; r < 6; r++) {
      var row = document.createElement('div'); row.className = 'wg-row'; row.setAttribute('role', 'row');
      for (var c = 0; c < 5; c++) { var t = document.createElement('div'); t.className = 'wg-tile'; t.setAttribute('role', 'gridcell'); row.appendChild(t); }
      board.appendChild(row);
    }
    kb.innerHTML = '';
    ['QWERTYUIOP', 'ASDFGHJKL', '+ZXCVBNM-'].forEach(function (line) {
      var d = document.createElement('div'); d.className = 'wg-krow';
      line.split('').forEach(function (k) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'wg-key'; b.dataset.k = k === '+' ? 'ENTER' : k === '-' ? 'BACK' : k;
        b.textContent = k === '+' ? 'Enter' : k === '-' ? '⌫' : k; if (k === '+' || k === '-') b.classList.add('wide');
        b.setAttribute('aria-label', b.dataset.k === 'BACK' ? 'Backspace' : b.dataset.k === 'ENTER' ? 'Enter' : k);
        d.appendChild(b);
      });
      kb.appendChild(d);
    });
  }
  function paint() {
    var rows = board.children;
    for (var r = 0; r < 6; r++) {
      for (var c = 0; c < 5; c++) {
        var tile = rows[r].children[c], g = game.guesses[r];
        tile.className = 'wg-tile';
        if (g) { tile.textContent = g[c]; tile.classList.add(game.results[r][c]); }
        else if (r === game.guesses.length && game.status === 'playing') { tile.textContent = current[c] || ''; if (current[c]) tile.classList.add('filled'); }
        else tile.textContent = '';
      }
    }
    var ls = letterStates(game);
    kb.querySelectorAll('.wg-key').forEach(function (b) { b.className = 'wg-key' + (b.dataset.k.length > 1 ? ' wide' : '') + (ls[b.dataset.k] ? ' ' + ls[b.dataset.k] : ''); });
    document.getElementById('wgHintBtn').disabled = game.guesses.length < 2 || game.status !== 'playing';
    document.getElementById('wgShare').style.display = game.status === 'playing' ? 'none' : '';
  }
  function save() { if (mode === 'daily') DMG.store.set(todayKey, { guesses: game.guesses }); }
  function finish() {
    if (mode === 'daily') {
      var s = stats(); s.played++;
      if (game.status === 'won') { s.won++; s.streak++; s.max = Math.max(s.max, s.streak); s.dist[game.guesses.length - 1]++; } else s.streak = 0;
      DMG.store.set('dm_word_stats', s); renderStats();
      if (game.status === 'won' && s.streak >= 3) DMG.award('streak3');
    }
    if (game.status === 'won') { say('Solved in ' + game.guesses.length + '! The word was ' + game.answer + '.'); DMG.confetti(); DMG.award('wordsmith'); }
    else say('Out of tries. The word was ' + game.answer + '.');
  }
  function type(k) {
    if (game.status !== 'playing') return;
    if (k === 'BACK') current = current.slice(0, -1);
    else if (k === 'ENTER') {
      if (current.length < 5) { say('Not enough letters'); return; }
      var r = game.submit(current); if (!r.ok) { say('Letters only'); return; }
      current = ''; say(''); save(); paint(); if (game.status !== 'playing') finish(); return;
    } else if (/^[A-Z]$/.test(k) && current.length < 5) current += k;
    paint();
  }
  function start(m) {
    mode = m; current = ''; say('');
    document.querySelectorAll('[data-wg-mode]').forEach(function (b) { b.classList.toggle('active', b.dataset.wgMode === m); });
    if (m === 'daily') {
      game = new Game(dailyWord());
      var saved = DMG.store.get(todayKey, null);
      if (saved && saved.guesses) saved.guesses.forEach(function (g) { game.submit(g); });
      if (game.status !== 'playing') say(game.status === 'won' ? 'You already solved today\'s puzzle! Come back tomorrow, or try Practice.' : 'Today\'s word was ' + game.answer + '. Try Practice mode!');
    } else game = new Game(WORDS[Math.floor(Math.random() * WORDS.length)]);
    paint();
  }
  build(); renderStats(); start('daily');
  kb.addEventListener('click', function (e) { var b = e.target.closest('.wg-key'); if (b) type(b.dataset.k); });
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '')) return;
    var k = e.key.toUpperCase();
    if (k === 'BACKSPACE') { e.preventDefault(); type('BACK'); } else if (k === 'ENTER') { e.preventDefault(); type('ENTER'); } else if (/^[A-Z]$/.test(k)) type(k);
  });
  document.querySelectorAll('[data-wg-mode]').forEach(function (b) { b.addEventListener('click', function () { start(b.dataset.wgMode); }); });
  document.getElementById('wgHintBtn').addEventListener('click', function () { say('Hint: ' + game.hint); });
  document.getElementById('wgShare').addEventListener('click', function () { DMG.copy(game.share(mode === 'daily' ? '#' + (dayIndex() + 1) : '(practice)'), this); });
  window.__word = { get game() { return game; }, type: type };
})();
