// Vacuum Snake: eat dead tuples, avoid walls and yourself. Pure logic on window.DMSnake for testing.
(function () {
  'use strict';
  var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  var OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

  function Snake(opts) {
    opts = opts || {};
    this.cols = opts.cols || 20; this.rows = opts.rows || 20;
    this.rng = opts.rng || Math.random;
    this.reset();
  }
  Snake.prototype.reset = function () {
    var cx = Math.floor(this.cols / 2), cy = Math.floor(this.rows / 2);
    this.body = [[cx, cy], [cx - 1, cy], [cx - 2, cy]];
    this.dir = 'right'; this.nextDir = 'right';
    this.score = 0; this.eaten = 0; this.alive = true; this.golden = false;
    this.placeFood();
  };
  Snake.prototype.occupied = function (x, y) {
    return this.body.some(function (s) { return s[0] === x && s[1] === y; });
  };
  Snake.prototype.placeFood = function () {
    var free = [];
    for (var y = 0; y < this.rows; y++) for (var x = 0; x < this.cols; x++) if (!this.occupied(x, y)) free.push([x, y]);
    if (!free.length) { this.food = null; this.alive = false; return; }
    this.food = free[Math.floor(this.rng() * free.length)];
    this.golden = (this.eaten + 1) % 5 === 0; // every 5th item is a golden "index" worth 3
  };
  Snake.prototype.setDir = function (d) {
    if (!DIRS[d] || !this.alive) return false;
    if (d === OPPOSITE[this.dir]) return false;
    this.nextDir = d; return true;
  };
  Snake.prototype.step = function () {
    if (!this.alive) return false;
    this.dir = this.nextDir;
    var h = this.body[0], v = DIRS[this.dir], nx = h[0] + v[0], ny = h[1] + v[1];
    if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) { this.alive = false; this.cause = 'wall'; return false; }
    var eating = this.food && nx === this.food[0] && ny === this.food[1];
    // the tail moves away unless we are growing
    var check = eating ? this.body : this.body.slice(0, -1);
    if (check.some(function (s) { return s[0] === nx && s[1] === ny; })) { this.alive = false; this.cause = 'self'; return false; }
    this.body.unshift([nx, ny]);
    if (eating) {
      this.score += this.golden ? 3 : 1; this.eaten++;
      this.placeFood();
    } else this.body.pop();
    return true;
  };
  Snake.prototype.speed = function () { return Math.max(65, 160 - Math.floor(this.eaten / 4) * 10); };

  window.DMSnake = { Snake: Snake };

  // ---------- UI ----------
  var cv = document.getElementById('snakeCanvas');
  if (!cv) return;
  var DMG = window.DMG, ctx = cv.getContext('2d'), CELL = cv.width / 20;
  var g = new Snake(), timer = null, running = false, paused = false;
  var best = DMG.store.get('dm_snake_best', 0);
  var elScore = document.getElementById('snScore'), elBest = document.getElementById('snBest'), elMsg = document.getElementById('snMsg'), elBtn = document.getElementById('snStart');

  function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888'; }
  function draw() {
    ctx.fillStyle = css('--bg-secondary'); ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.strokeStyle = css('--border-color'); ctx.lineWidth = 1; ctx.globalAlpha = .35;
    for (var i = 1; i < 20; i++) { ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, cv.height); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(cv.width, i * CELL); ctx.stroke(); }
    ctx.globalAlpha = 1;
    if (g.food) {
      ctx.fillStyle = g.golden ? '#f59e0b' : '#ef4444';
      ctx.beginPath(); ctx.arc(g.food[0] * CELL + CELL / 2, g.food[1] * CELL + CELL / 2, CELL * .36, 0, 7); ctx.fill();
    }
    g.body.forEach(function (s, i) {
      ctx.fillStyle = i === 0 ? '#06b6d4' : (i % 2 ? '#3b82f6' : '#6366f1');
      var r = 4, x = s[0] * CELL + 1, y = s[1] * CELL + 1, w = CELL - 2;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, w, r) : ctx.rect(x, y, w, w); ctx.fill();
    });
    elScore.textContent = g.score; elBest.textContent = best;
  }
  function loop() {
    if (!running) return;
    g.step(); draw();
    if (!g.alive) return over();
    timer = setTimeout(loop, g.speed());
  }
  function over() {
    running = false; clearTimeout(timer);
    var newBest = g.score > best;
    if (newBest) { best = g.score; DMG.store.set('dm_snake_best', best); DMG.confetti(); }
    if (g.score >= 10) DMG.award('vacuum'); if (g.score >= 25) DMG.award('bloat');
    elMsg.textContent = (g.cause === 'wall' ? 'You hit the edge of the tablespace. ' : g.cause === 'self' ? 'You bloated yourself. ' : 'Table fully vacuumed! ') + 'Score ' + g.score + (newBest ? ' - new best!' : '') + '.';
    elBtn.textContent = 'Play again'; draw();
  }
  function start() {
    clearTimeout(timer); g.reset(); running = true; paused = false; elMsg.textContent = 'Eat the red dead tuples. Golden indexes are worth 3!'; elBtn.textContent = 'Restart'; draw(); timer = setTimeout(loop, g.speed());
  }
  function toggle() {
    if (paused && g.alive) { paused = false; running = true; elMsg.textContent = ''; timer = setTimeout(loop, g.speed()); }
    else if (running) { running = false; paused = true; clearTimeout(timer); elMsg.textContent = 'Paused. Press Space to resume.'; }
  }
  var keyMap = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
  document.addEventListener('keydown', function (e) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '')) return;
    if (keyMap[e.key]) { e.preventDefault(); if (!running && g.alive && g.score === 0 && g.body.length === 3 && !timer) start(); g.setDir(keyMap[e.key]); }
    else if (e.key === ' ') { e.preventDefault(); if (!timer || !g.alive) start(); else toggle(); }
  });
  document.addEventListener('keyup', function (e) { if (e.key === ' ' && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '')) e.preventDefault(); });
  document.querySelectorAll('[data-dir]').forEach(function (b) { b.addEventListener('click', function () { if (!timer) start(); g.setDir(b.dataset.dir); }); });
  var tx, ty;
  cv.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; ty = e.touches[0].clientY; if (!timer) start(); }, { passive: true });
  cv.addEventListener('touchend', function (e) {
    var dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    g.setDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }, { passive: true });
  elBtn.addEventListener('click', start);
  window.__snake = { get game() { return g; }, draw: draw };
  draw();
})();
