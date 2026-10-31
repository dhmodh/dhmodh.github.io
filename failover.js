// Patroni-style 3-node failover simulator. Pure model on window.DMSim for testing.
(function () {
  'use strict';

  function Cluster(opts) {
    opts = opts || {};
    this.detect = opts.detect == null ? 3 : opts.detect;   // seconds until the dead leader is noticed (Patroni ttl/loop_wait)
    this.promote = opts.promote == null ? 1 : opts.promote; // seconds to promote the new leader
    this.writeRate = opts.writeRate || 100;                 // writes per simulated second
    this.reset();
  }
  Cluster.prototype.reset = function () {
    this.now = 0;
    this.nodes = [
      { id: 'node-1', alive: true, role: 'leader', lag: 0, base: 0.2 },
      { id: 'node-2', alive: true, role: 'replica', lag: 0.12, base: 0.12 },
      { id: 'node-3', alive: true, role: 'replica', lag: 0.31, base: 0.31 }
    ];
    this.leader = 'node-1';
    this.detectAt = null; this.electionEnd = null; this.outageStart = null; this.candidate = null;
    this.writesOK = 0; this.writesFailed = 0; this.lastFailover = null; this.failovers = 0;
    this.log = [];
    this.say('Cluster healthy. node-1 is the leader.');
  };
  Cluster.prototype.say = function (m) { this.log.push({ t: this.now, msg: m }); };
  Cluster.prototype.node = function (id) { return this.nodes.filter(function (n) { return n.id === id; })[0]; };
  Cluster.prototype.aliveCount = function () { return this.nodes.filter(function (n) { return n.alive; }).length; };
  Cluster.prototype.hasQuorum = function () { return this.aliveCount() >= 2; }; // majority of 3 for the consensus store

  Cluster.prototype.kill = function (id) {
    var n = this.node(id);
    if (!n || !n.alive) return false;
    n.alive = false; n.role = 'down';
    this.say(id + ' went down.');
    if (this.leader === id) {
      this.leader = null; this.candidate = null; this.electionEnd = null;
      this.outageStart = this.now; this.detectAt = this.now + this.detect;
      this.say('Leader lost. Writes failing. Waiting for the leader lease to expire (' + this.detect + 's).');
    }
    return true;
  };
  Cluster.prototype.revive = function (id) {
    var n = this.node(id);
    if (!n || n.alive) return false;
    n.alive = true; n.role = 'replica'; n.lag = 0.5;
    this.say(id + ' is back and catching up as a replica.');
    if (!this.leader && this.detectAt == null && this.electionEnd == null) this.detectAt = this.now;
    return true;
  };
  Cluster.prototype.killLeader = function () { return this.leader ? this.kill(this.leader) : false; };

  Cluster.prototype.tick = function (dt) {
    var end = this.now + dt;
    // process in small steps so events land on time
    while (this.now < end - 1e-9) {
      var step = Math.min(0.05, end - this.now);
      this.now += step;
      if (this.leader) this.writesOK += this.writeRate * step; else this.writesFailed += this.writeRate * step;
      this.nodes.forEach(function (n) { if (n.alive && n.role === 'replica' && n.lag > n.base) n.lag = Math.max(n.base, n.lag - step * 0.2); });
      if (!this.leader && this.electionEnd == null && this.detectAt != null && this.now >= this.detectAt - 1e-9) {
        if (!this.hasQuorum()) {
          this.say('Consensus quorum lost (' + this.aliveCount() + '/3 nodes). No leader can be elected. Cluster is read-only/unavailable.');
          this.detectAt = null; // wait for a revive
        } else {
          var cands = this.nodes.filter(function (n) { return n.alive && n.role === 'replica'; })
            .sort(function (a, b) { return a.lag - b.lag || (a.id < b.id ? -1 : 1); });
          this.candidate = cands[0].id;
          this.electionEnd = this.now + this.promote;
          this.detectAt = null;
          this.say('Failure detected. Promoting ' + this.candidate + ' (lowest replication lag, ' + cands[0].lag.toFixed(2) + 's).');
        }
      }
      if (!this.leader && this.electionEnd != null && this.now >= this.electionEnd - 1e-9) {
        var c = this.node(this.candidate);
        if (c && c.alive) {
          c.role = 'leader'; c.lag = 0; this.leader = c.id; this.failovers++;
          this.lastFailover = this.now - this.outageStart;
          this.say(c.id + ' is the new leader. Writes restored after ' + this.lastFailover.toFixed(1) + 's.');
          this.electionEnd = null; this.candidate = null; this.outageStart = null;
        } else { // candidate died mid-promotion: start over
          this.electionEnd = null; this.candidate = null; this.detectAt = this.now;
          this.say('Candidate died during promotion. Re-electing.');
        }
      }
    }
  };
  Cluster.prototype.availability = function () {
    var total = this.writesOK + this.writesFailed;
    return total ? (this.writesOK / total) * 100 : 100;
  };

  window.DMSim = { Cluster: Cluster };

  // ---- UI ----
  var root = document.getElementById('failover-tool');
  if (!root) return;
  var sim = new Cluster({ detect: 3 });
  var $ = function (s) { return root.querySelector(s); };
  var logShown = 0;

  function render() {
    sim.nodes.forEach(function (n) {
      var el = root.querySelector('[data-node="' + n.id + '"]');
      el.className = 'fo-node ' + (n.role === 'down' ? 'down' : n.role) + (sim.candidate === n.id ? ' promoting' : '');
      el.querySelector('.fo-role').textContent = n.role === 'leader' ? 'LEADER (primary)' : n.role === 'down' ? 'DOWN' : (sim.candidate === n.id ? 'PROMOTING...' : 'replica');
      el.querySelector('.fo-lag').textContent = n.alive ? 'lag ' + n.lag.toFixed(2) + 's' : 'no heartbeat';
      el.setAttribute('aria-label', n.id + ': ' + el.querySelector('.fo-role').textContent + '. Activate to ' + (n.alive ? 'kill' : 'revive') + ' this node.');
    });
    $('#fo-quorum').textContent = sim.hasQuorum() ? 'consensus quorum OK (' + sim.aliveCount() + '/3)' : 'QUORUM LOST (' + sim.aliveCount() + '/3)';
    $('#fo-quorum').className = sim.hasQuorum() ? 'ok' : 'bad';
    var st = $('#fo-status');
    st.textContent = sim.leader ? 'Writes: accepting (' + sim.leader + ')' : 'Writes: FAILING';
    st.className = sim.leader ? 'ok' : 'bad';
    $('#fo-ok').textContent = Math.round(sim.writesOK).toLocaleString();
    $('#fo-fail').textContent = Math.round(sim.writesFailed).toLocaleString();
    $('#fo-avail').textContent = sim.availability().toFixed(2) + '%';
    $('#fo-last').textContent = sim.lastFailover == null ? '-' : sim.lastFailover.toFixed(1) + 's';
    var logEl = $('#fo-log');
    for (; logShown < sim.log.length; logShown++) {
      var li = document.createElement('li');
      li.textContent = '[' + sim.log[logShown].t.toFixed(1) + 's] ' + sim.log[logShown].msg;
      logEl.appendChild(li);
      logEl.scrollTop = logEl.scrollHeight;
    }
  }
  root.querySelectorAll('[data-node]').forEach(function (el) {
    el.addEventListener('click', function () {
      var n = sim.node(el.dataset.node);
      n.alive ? sim.kill(n.id) : sim.revive(n.id);
      render();
    });
  });
  $('#fo-kill-leader').addEventListener('click', function () { sim.killLeader(); render(); });
  $('#fo-revive-all').addEventListener('click', function () { sim.nodes.forEach(function (n) { sim.revive(n.id); }); render(); });
  $('#fo-reset').addEventListener('click', function () { sim.reset(); logShown = 0; $('#fo-log').innerHTML = ''; render(); });
  $('#fo-detect').addEventListener('input', function () { sim.detect = +this.value; $('#fo-detect-val').textContent = this.value + 's'; });
  window.__sim = sim;
  render();
  var last = performance.now();
  setInterval(function () {
    var nowT = performance.now();
    var dt = Math.min(0.5, (nowT - last) / 1000); last = nowT;
    sim.tick(dt); render();
  }, 100);
})();
