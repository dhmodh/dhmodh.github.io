// More reliability / cloud tools. All logic lives in pure functions on window.DMTools2 (unit-tested); UI wiring is at the bottom.
(function () {
  'use strict';

  /* ---------- helpers ---------- */
  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }
  function money(n) {
    if (!isFinite(n)) return '-';
    var abs = Math.abs(n);
    return (n < 0 ? '-' : '') + '$' + abs.toLocaleString('en-US', { minimumFractionDigits: abs < 100 && abs % 1 ? 2 : 0, maximumFractionDigits: abs < 100 ? 2 : 0 });
  }
  function fmtDur(minutes) {
    if (!isFinite(minutes) || minutes < 0) return '-';
    var s = minutes * 60;
    if (s < 60) return Math.round(s) + ' sec';
    if (minutes < 60) return (Math.round(minutes * 10) / 10) + ' min';
    var h = Math.floor(minutes / 60), m = Math.round(minutes - h * 60);
    if (m === 60) { h++; m = 0; }
    if (h < 48) return h + 'h ' + m + 'm';
    return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
  }
  function round(n, p) { var k = Math.pow(10, p || 0); return Math.round(n * k) / k; }

  /* ---------- Terraform plan analyzer ---------- */
  var STATEFUL = /^(aws_db_instance|aws_rds_\w+|aws_dynamodb_table|aws_s3_bucket|aws_elasticache_\w+|aws_redshift_\w+|aws_docdb_\w+|aws_neptune_\w+|aws_efs_file_system|aws_ebs_volume|aws_kms_key|aws_secretsmanager_secret|aws_opensearch_domain|aws_elasticsearch_domain|aws_mq_broker|aws_msk_cluster|google_sql_database_instance|google_bigquery_dataset|azurerm_(mssql|postgresql|mysql|mariadb|cosmosdb|storage)_\w+|snowflake_\w*(database|schema|table|warehouse|role|user|stage|pipe|share)\w*)$/;
  var HEADER = /^\s*#\s+(\S+)\s+(will be created|will be updated in-place|must be replaced|will be replaced|will be destroyed|will be deleted|will be read during apply|will be imported)/;
  var ACTIONS = { 'will be created': 'create', 'will be updated in-place': 'update', 'must be replaced': 'replace', 'will be replaced': 'replace', 'will be destroyed': 'destroy', 'will be deleted': 'destroy', 'will be read during apply': 'read', 'will be imported': 'import' };

  function resourceType(addr) {
    var seg = addr.replace(/\[[^\]]*\]/g, '').split('.');
    return seg.length >= 2 ? seg[seg.length - 2] : addr;
  }
  function parsePlan(raw) {
    var text = String(raw || '').replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '');
    var lines = text.split('\n'), res = [], cur = null;
    lines.forEach(function (ln) {
      var m = HEADER.exec(ln);
      if (m) {
        cur = { addr: m[1], type: resourceType(m[1]), action: ACTIONS[m[2]], forces: [], data: /(^|\.)data\./.test(m[1]) };
        res.push(cur); return;
      }
      if (cur && /# forces replacement/.test(ln)) {
        var a = /^\s*[~+\-]\s+([A-Za-z0-9_]+)\s+=/.exec(ln);
        if (a && cur.forces.indexOf(a[1]) === -1) cur.forces.push(a[1]);
      }
    });
    res.forEach(function (r) {
      var stateful = STATEFUL.test(r.type);
      r.stateful = stateful;
      if ((r.action === 'destroy' || r.action === 'replace') && stateful) r.risk = 'critical';
      else if (r.action === 'destroy' || r.action === 'replace') r.risk = 'warning';
      else if (r.action === 'update' && stateful) r.risk = 'caution';
      else r.risk = 'ok';
    });
    var out = { resources: res, add: 0, change: 0, destroy: 0, imports: 0, hasSummary: false, noChanges: false };
    var s = /Plan:\s*(?:(\d+)\s+to import,\s*)?(\d+)\s+to add,\s*(\d+)\s+to change,\s*(\d+)\s+to destroy/.exec(text);
    if (s) { out.hasSummary = true; out.imports = +(s[1] || 0); out.add = +s[2]; out.change = +s[3]; out.destroy = +s[4]; }
    else if (/No changes\.|Infrastructure matches the configuration/.test(text)) { out.noChanges = true; }
    else {
      res.forEach(function (r) {
        if (r.data || r.action === 'read') return;
        if (r.action === 'create') out.add++; else if (r.action === 'update') out.change++; else if (r.action === 'destroy') out.destroy++;
        else if (r.action === 'replace') { out.add++; out.destroy++; }
      });
    }
    out.critical = res.filter(function (r) { return r.risk === 'critical'; });
    out.warnings = res.filter(function (r) { return r.risk === 'warning'; });
    out.recognised = res.length > 0 || out.hasSummary || out.noChanges;
    out.verdict = !out.recognised ? 'unknown' : out.critical.length ? 'critical' : (out.warnings.length || out.destroy > 0) ? 'warning' : 'ok';
    return out;
  }

  /* ---------- Terraform: RDS module generator ---------- */
  function rdsFamily(engine, version) {
    var v = String(version || '').trim();
    if (engine === 'postgres') return 'postgres' + (v.split('.')[0] || '15');
    if (engine === 'mysql') return 'mysql' + v.split('.').slice(0, 2).join('.');
    if (engine === 'mariadb') return 'mariadb' + v.split('.').slice(0, 2).join('.');
    return engine + v;
  }
  function rdsHcl(o) {
    o = o || {};
    var engine = o.engine || 'postgres', version = o.version || '15.5';
    var name = String(o.name || 'orders').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^[^a-z]+/, '').slice(0, 60).replace(/-$/, '') || 'orders';
    var prod = (o.env || 'prod') === 'prod';
    var storage = Math.max(20, Math.floor(num(o.storage, 100)));
    var retention = Math.min(35, Math.max(0, Math.floor(num(o.retention, prod ? 14 : 3))));
    var fam = rdsFamily(engine, version);
    var L = [];
    L.push('resource "aws_db_parameter_group" "this" {');
    L.push('  name_prefix = "${var.name}-"');
    L.push('  family      = "' + fam + '"');
    L.push('  # Set parameters explicitly; note static ones need apply_method = "pending-reboot"');
    L.push('}');
    L.push('');
    L.push('resource "aws_db_instance" "this" {');
    L.push('  identifier     = "' + name + '-' + (prod ? 'prod' : 'nonprod') + '"');
    L.push('  engine         = "' + engine + '"');
    L.push('  engine_version = "' + version + '"');
    L.push('  instance_class = "' + (o.instanceClass || 'db.r6g.large') + '"');
    L.push('');
    L.push('  allocated_storage = ' + storage);
    L.push('  storage_type      = "gp3"');
    L.push('  storage_encrypted = true');
    L.push('');
    L.push('  multi_az                = ' + (!!o.multiAz));
    L.push('  backup_retention_period = ' + retention);
    L.push('  backup_window           = "02:00-03:00"');
    L.push('  maintenance_window      = "sun:04:00-sun:05:00"');
    L.push('');
    L.push('  manage_master_user_password = true # stored in AWS Secrets Manager');
    L.push('  username                    = "dbadmin"');
    L.push('');
    L.push('  db_subnet_group_name   = aws_db_subnet_group.this.name');
    L.push('  vpc_security_group_ids = var.vpc_security_group_ids');
    L.push('  parameter_group_name   = aws_db_parameter_group.this.name');
    L.push('  publicly_accessible    = false');
    L.push('');
    L.push('  performance_insights_enabled = true');
    L.push('  auto_minor_version_upgrade   = true');
    L.push('  copy_tags_to_snapshot        = true');
    L.push('');
    L.push('  deletion_protection       = ' + prod);
    L.push('  skip_final_snapshot       = ' + (!prod));
    if (prod) L.push('  final_snapshot_identifier = "' + name + '-prod-final"');
    L.push('  apply_immediately         = false');
    L.push('');
    L.push('  tags = merge(var.tags, { Name = "' + name + '", Environment = "' + (prod ? 'prod' : 'nonprod') + '" })');
    if (prod) { L.push(''); L.push('  lifecycle {'); L.push('    prevent_destroy = true'); L.push('  }'); }
    L.push('}');
    return L.join('\n');
  }

  /* ---------- Snowflake ---------- */
  var SF_SIZES = [['XS', 1], ['S', 2], ['M', 4], ['L', 8], ['XL', 16], ['2XL', 32], ['3XL', 64], ['4XL', 128], ['5XL', 256], ['6XL', 512]];
  function sfCredits(size) { for (var i = 0; i < SF_SIZES.length; i++) if (SF_SIZES[i][0] === size) return SF_SIZES[i][1]; return 0; }
  function snowflakeCost(o) {
    var cph = sfCredits(o.size), clusters = Math.max(1, num(o.clusters, 1)), active = Math.max(0, num(o.activeHours, 0));
    var resumes = Math.max(0, num(o.resumes, 0)), suspendMin = Math.max(0, num(o.suspendMin, 0)), days = Math.max(0, num(o.days, 0));
    var price = Math.max(0, num(o.price, 0)), tb = Math.max(0, num(o.storageTB, 0)), sprice = Math.max(0, num(o.storagePrice, 0));
    function monthlyCredits(suspend) {
      var idleHours = resumes * suspend / 60;
      return cph * clusters * (active + idleHours) * days;
    }
    var idleHoursPerDay = resumes * suspendMin / 60;
    var credits = monthlyCredits(suspendMin), credits1 = monthlyCredits(1);
    var compute = credits * price, storage = tb * sprice;
    return {
      creditsPerHour: cph, idleHoursPerDay: idleHoursPerDay, billedHoursPerDay: active + idleHoursPerDay,
      credits: credits, compute: compute, storage: storage, total: compute + storage, annual: (compute + storage) * 12,
      idleShare: (active + idleHoursPerDay) > 0 ? idleHoursPerDay / (active + idleHoursPerDay) : 0,
      credits1MinSuspend: credits1, saving1MinSuspend: (credits - credits1) * price,
      monitorQuota: Math.ceil(credits * 1.1)
    };
  }

  /* ---------- AWS savings ---------- */
  function awsSavings(o) {
    var rate = Math.max(0, num(o.rate, 0)), count = Math.max(0, num(o.count, 0));
    var hpd = Math.min(24, Math.max(0, num(o.hoursPerDay, 24))), dpw = Math.min(7, Math.max(0, num(o.daysPerWeek, 7)));
    var disc = Math.min(100, Math.max(0, num(o.discount, 0)));
    var gb = Math.max(0, num(o.gb, 0)), gp2 = Math.max(0, num(o.gp2, 0)), gp3 = Math.max(0, num(o.gp3, 0));
    var snapGB = Math.max(0, num(o.snapGB, 0)), snapPrice = Math.max(0, num(o.snapPrice, 0));
    var HOURS = 730;
    var baseline = rate * count * HOURS;
    var scheduledHours = hpd * dpw * 52 / 12;
    var scheduled = rate * count * Math.min(HOURS, scheduledHours);
    var schedSave = baseline - scheduled;
    var commitSave = baseline * disc / 100;
    var storageSave = gb * Math.max(0, gp2 - gp3);
    var snapSave = snapGB * snapPrice;
    var combined = schedSave + storageSave + snapSave;
    return {
      baseline: baseline, scheduledHours: scheduledHours, scheduled: scheduled, schedSave: schedSave,
      schedPct: baseline > 0 ? schedSave / baseline * 100 : 0,
      commitSave: commitSave, storageSave: storageSave, snapSave: snapSave,
      combinedMonthly: combined, combinedAnnual: combined * 12, commitAnnual: commitSave * 12
    };
  }

  /* ---------- VPC / CIDR planner ---------- */
  function ip2int(s) {
    var p = String(s).split('.'); if (p.length !== 4) return null;
    var n = 0;
    for (var i = 0; i < 4; i++) { if (!/^\d{1,3}$/.test(p[i]) || +p[i] > 255) return null; n = n * 256 + (+p[i]); }
    return n;
  }
  function int2ip(n) { n = n >>> 0; return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'); }
  function isPrivate(n) {
    return (n >>> 24) === 10 || ((n >>> 20) === 0xAC1) || ((n >>> 16) === 0xC0A8);
  }
  function cidrPlan(str, splitBits) {
    var m = /^\s*([\d.]+)\/(\d{1,2})\s*$/.exec(String(str || ''));
    if (!m) return { error: 'Enter a CIDR such as 10.0.0.0/16' };
    var ip = ip2int(m[1]), p = +m[2];
    if (ip === null || p > 32) return { error: 'Invalid IPv4 address or prefix length' };
    var mask = p === 0 ? 0 : (0xFFFFFFFF << (32 - p)) >>> 0;
    var net = (ip & mask) >>> 0, total = Math.pow(2, 32 - p), bcast = (net + total - 1) >>> 0;
    var out = {
      input: m[1] + '/' + p, network: int2ip(net), prefix: p, mask: int2ip(mask), broadcast: int2ip(bcast), total: total,
      awsUsable: Math.max(0, total - 5), firstUsable: int2ip(net + 4), lastUsable: int2ip(bcast - 1),
      normalized: net !== ip, isPrivate: isPrivate(net), validAwsSize: p >= 16 && p <= 28, subnets: [], notes: []
    };
    if (out.normalized) out.notes.push('Host bits were set; using the network address ' + out.network + '/' + p + '.');
    if (!out.isPrivate) out.notes.push('Not an RFC 1918 private range (10/8, 172.16/12, 192.168/16). AWS recommends private ranges for VPCs.');
    if (!out.validAwsSize) out.notes.push('AWS VPCs and subnets must be between /16 and /28.');
    var k = Math.floor(num(splitBits, 0));
    if (k > 0) {
      var np = p + k;
      if (k > 6) out.notes.push('Splitting is limited to 64 subnets.');
      else if (np > 28) out.notes.push('Cannot split that far: AWS subnets must be /28 or larger.');
      else {
        var size = Math.pow(2, 32 - np);
        for (var i = 0; i < Math.pow(2, k); i++) {
          var sn = (net + i * size) >>> 0, sb = (sn + size - 1) >>> 0;
          out.subnets.push({ cidr: int2ip(sn) + '/' + np, first: int2ip(sn + 4), last: int2ip(sb - 1), usable: size - 5 });
        }
      }
    }
    return out;
  }

  /* ---------- PostgreSQL memory budget ---------- */
  function memBudget(o) {
    var ram = Math.max(0, num(o.ramGB, 0)) * 1024, sb = Math.max(0, num(o.sharedBuffersGB, 0)) * 1024;
    var conn = Math.max(1, Math.floor(num(o.maxConn, 100))), work = Math.max(0, num(o.workMemMB, 4)), nodes = Math.max(1, num(o.nodes, 2));
    var per = Math.max(0, num(o.perConnMB, 8)), maint = Math.max(0, num(o.maintMB, 512)), workers = Math.max(0, Math.floor(num(o.autovacWorkers, 3)));
    var os = Math.min(50, Math.max(0, num(o.osReservePct, 10))), active = Math.min(100, Math.max(0, num(o.activePct, 25)));
    var usable = ram * (1 - os / 100);
    var perConnWorst = per + work * nodes;
    var fixed = sb + maint * workers;
    var worst = fixed + conn * perConnWorst;
    var typical = fixed + conn * per + conn * (active / 100) * work * nodes;
    var safeWork = Math.max(0, ((usable - fixed) / conn - per) / nodes);
    var status = worst <= usable ? 'ok' : typical <= usable ? 'warn' : 'bad';
    return { usableMB: usable, worstMB: worst, typicalMB: typical, safeWorkMemMB: safeWork, status: status, fixedMB: fixed, perConnWorstMB: perConnWorst };
  }

  /* ---------- Autovacuum ---------- */
  function autovac(o) {
    var rows = Math.max(0, num(o.rows, 0));
    var vsf = num(o.vsf, 0.2), vth = num(o.vth, 50), asf = num(o.asf, 0.1), ath = num(o.ath, 50), isf = num(o.isf, 0.2), ith = num(o.ith, 1000);
    var vacuumAt = vth + vsf * rows, analyzeAt = ath + asf * rows, insertAt = ith + isf * rows;
    var pct = Math.min(100, Math.max(0.0001, num(o.targetPct, 1)));
    var target = rows * pct / 100;
    var sugVsf = rows > 0 ? Math.max(0, (target - 1000) / rows) : 0;
    var sugVth = 1000;
    var sugAsf = sugVsf / 2;
    var tbl = /^[A-Za-z_][A-Za-z0-9_.]*$/.test(o.table || '') ? o.table : 'my_table';
    return {
      vacuumAt: vacuumAt, analyzeAt: analyzeAt, insertAt: insertAt, vacuumPct: rows > 0 ? vacuumAt / rows * 100 : 0,
      suggested: { vsf: round(sugVsf, 4), vth: sugVth, asf: round(sugAsf, 4) },
      sql: 'ALTER TABLE ' + tbl + ' SET (\n  autovacuum_vacuum_scale_factor  = ' + round(sugVsf, 4) + ',\n  autovacuum_vacuum_threshold     = ' + sugVth + ',\n  autovacuum_analyze_scale_factor = ' + round(sugAsf, 4) + '\n);'
    };
  }

  /* ---------- Burn-rate alerts ---------- */
  function burnRates(slo, days) {
    slo = num(slo, 99.9); days = Math.max(1, num(days, 30));
    var errBudget = 1 - slo / 100, T = days * 24;
    var rows = [
      { sev: 'page', long: '1h', short: '5m', longH: 1, budget: 2 },
      { sev: 'page', long: '6h', short: '30m', longH: 6, budget: 5 },
      { sev: 'ticket', long: '3d', short: '6h', longH: 72, budget: 10 }
    ];
    return rows.map(function (r) {
      var rate = (r.budget / 100) * T / r.longH;
      return { sev: r.sev, long: r.long, short: r.short, budgetPct: r.budget, burnRate: round(rate, 3), errorRatio: rate * errBudget };
    });
  }
  function promRules(slo, days, opts) {
    opts = opts || {};
    var errExpr = opts.errExpr || 'sum(rate(http_requests_total{code=~"5.."}[__W__])) / sum(rate(http_requests_total[__W__]))';
    var rows = burnRates(slo, days), L = ['groups:', '  - name: slo-burn-rate', '    rules:'];
    rows.forEach(function (r) {
      var thr = +r.errorRatio.toPrecision(6);
      L.push('      - alert: ErrorBudgetBurn' + r.long.toUpperCase() + 'Over' + r.short.toUpperCase());
      L.push('        expr: |');
      L.push('          (' + errExpr.replace(/__W__/g, r.long) + ' > ' + thr + ')');
      L.push('          and');
      L.push('          (' + errExpr.replace(/__W__/g, r.short) + ' > ' + thr + ')');
      L.push('        labels: { severity: ' + r.sev + ' }');
      L.push('        annotations:');
      L.push('          summary: "Burning error budget at ' + r.burnRate + 'x (' + r.budgetPct + '% of budget in ' + r.long + ')"');
    });
    return L.join('\n');
  }

  /* ---------- Backup storage + restore time ---------- */
  function backupPlan(o) {
    var size = Math.max(0, num(o.sizeGB, 0)), change = Math.max(0, num(o.changePct, 0)) / 100, ret = Math.max(1, num(o.retention, 14));
    var fullEvery = Math.max(1, num(o.fullEvery, 7)), comp = Math.min(1, Math.max(0.05, num(o.compression, 0.5)));
    var price = Math.max(0, num(o.price, 0)), tp = Math.max(0.1, num(o.restoreMBps, 200)), replay = Math.max(0.1, num(o.replayMBps, 50)), valid = Math.max(0, num(o.validateMin, 15));
    var fulls = Math.ceil(ret / fullEvery) + 1;
    var fullGB = fulls * size * comp;
    var incrGB = ret * size * change * comp;
    var totalGB = fullGB + incrGB;
    var restoreMin = (size * 1024 / tp) / 60;
    var walGB = (fullEvery / 2) * size * change;   // average WAL/incremental to replay since the last full backup
    var replayMin = (walGB * 1024 / replay) / 60;
    var rto = restoreMin + replayMin + valid;
    return { fulls: fulls, fullGB: fullGB, incrGB: incrGB, totalGB: totalGB, monthlyCost: totalGB * price, restoreMin: restoreMin, replayMin: replayMin, rtoMin: rto, walReplayGB: walGB };
  }

  /* ---------- Cron ---------- */
  var MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
  var DOWS = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
  var DOW_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  function cronVal(s, names) {
    if (/^\d+$/.test(s)) return +s;
    var k = String(s).toUpperCase(); return names && names[k] != null ? names[k] : NaN;
  }
  function cronField(f, min, max, names, isDow) {
    var set = {}, parts = String(f).split(',');
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i], seg = part.split('/'), step = 1, range = seg[0], lo, hi;
      if (seg.length > 2 || part === '') return null;
      if (seg.length === 2) { if (!/^\d+$/.test(seg[1]) || +seg[1] < 1) return null; step = +seg[1]; }
      if (range === '*') { lo = min; hi = isDow ? 6 : max; }
      else if (range.indexOf('-') > 0) { var r = range.split('-'); lo = cronVal(r[0], names); hi = cronVal(r[1], names); }
      else { lo = cronVal(range, names); hi = seg.length === 2 ? (isDow ? 6 : max) : lo; }
      if (isNaN(lo) || isNaN(hi) || lo < min || hi > max || lo > hi) return null;
      for (var v = lo; v <= hi; v += step) set[isDow && v === 7 ? 0 : v] = true;
    }
    return set;
  }
  function cronParse(expr) {
    var f = String(expr || '').trim().split(/\s+/);
    if (f.length !== 5) return { error: 'A cron expression needs 5 fields: minute hour day-of-month month day-of-week' };
    var min = cronField(f[0], 0, 59), hr = cronField(f[1], 0, 23), dom = cronField(f[2], 1, 31), mon = cronField(f[3], 1, 12, MONTHS), dow = cronField(f[4], 0, 7, DOWS, true);
    var bad = [['minute', min], ['hour', hr], ['day-of-month', dom], ['month', mon], ['day-of-week', dow]].filter(function (x) { return !x[1]; });
    if (bad.length) return { error: 'Invalid ' + bad.map(function (b) { return b[0]; }).join(', ') + ' field' };
    return { fields: f, min: min, hr: hr, dom: dom, mon: mon, dow: dow, domStar: f[2][0] === '*', dowStar: f[4][0] === '*' };
  }
  function cronDayOk(p, d) {
    var dm = !!p.dom[d.getUTCDate()], dw = !!p.dow[d.getUTCDay()];
    if (p.domStar || p.dowStar) return dm && dw;
    return dm || dw; // both restricted: standard cron matches either
  }
  function cronNext(expr, from, count) {
    var p = cronParse(expr); if (p.error) return [];
    var d = new Date(Math.floor((from || new Date()).getTime() / 60000) * 60000 + 60000), out = [], limit = d.getTime() + 6 * 366 * 864e5, guard = 0;
    while (out.length < (count || 5) && d.getTime() < limit && guard++ < 2000000) {
      if (!p.mon[d.getUTCMonth() + 1]) { d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); continue; }
      if (!cronDayOk(p, d)) { d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)); continue; }
      if (!p.hr[d.getUTCHours()]) { d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours() + 1)); continue; }
      if (!p.min[d.getUTCMinutes()]) { d = new Date(d.getTime() + 60000); continue; }
      out.push(new Date(d.getTime())); d = new Date(d.getTime() + 60000);
    }
    return out;
  }
  function cronDescribeField(f, unit, names) {
    if (f === '*') return 'every ' + unit;
    var m = /^\*\/(\d+)$/.exec(f); if (m) return 'every ' + m[1] + ' ' + unit + 's';
    return unit + ' ' + f;
  }
  function cronDescribe(expr) {
    var p = cronParse(expr); if (p.error) return [p.error];
    var f = p.fields;
    return ['minute: ' + cronDescribeField(f[0], 'minute'), 'hour: ' + cronDescribeField(f[1], 'hour'), 'day of month: ' + cronDescribeField(f[2], 'day'), 'month: ' + cronDescribeField(f[3], 'month'), 'day of week: ' + (f[4] === '*' ? 'every day' : f[4])];
  }
  function toEventBridge(expr) {
    var p = cronParse(expr); if (p.error) return { error: p.error };
    var f = p.fields.slice(), dowF = f[4], note = '';
    if (/\//.test(dowF) && dowF !== '*') note = 'Day-of-week uses steps; EventBridge numbers days 1-7 (SUN=1), so check this field by hand. ';
    else if (dowF !== '*') {
      dowF = dowF.replace(/\d+/g, function (n) { return DOW_NAMES[(+n) % 7]; });
    }
    var dom = f[2], dow = dowF;
    if (f[2] === '*' && f[4] === '*') { dow = '?'; }
    else if (f[2] === '*' && f[4] !== '*') { dom = '?'; }
    else if (f[2] !== '*' && f[4] === '*') { dow = '?'; }
    else { note += 'Both day fields are set; EventBridge requires one to be "?" so this is ambiguous. '; dow = '?'; }
    return { expr: 'cron(' + [f[0], f[1], dom, f[3], dow, '*'].join(' ') + ')', note: note.trim() };
  }

  window.DMTools2 = {
    parsePlan: parsePlan, rdsHcl: rdsHcl, rdsFamily: rdsFamily, SF_SIZES: SF_SIZES, snowflakeCost: snowflakeCost, awsSavings: awsSavings,
    cidrPlan: cidrPlan, ip2int: ip2int, int2ip: int2ip, memBudget: memBudget, autovac: autovac, burnRates: burnRates, promRules: promRules,
    backupPlan: backupPlan, cronParse: cronParse, cronNext: cronNext, cronDescribe: cronDescribe, toEventBridge: toEventBridge, money: money, fmtDur: fmtDur
  };

  /* =================== UI =================== */
  var $ = function (id) { return document.getElementById(id); };
  if (!$('tools-toolbar')) return;
  function val(id) { return $(id).value; }
  function bind(ids, fn) { ids.forEach(function (id) { var e = $(id); e.addEventListener('input', fn); e.addEventListener('change', fn); }); fn(); }
  function stat(label, value, cls) { var d = document.createElement('div'); d.className = 'result' + (cls ? ' ' + cls : ''); var s = document.createElement('span'); s.textContent = label; var b = document.createElement('strong'); b.textContent = value; d.appendChild(s); d.appendChild(b); return d; }
  function fill(id, stats) { var el = $(id); el.innerHTML = ''; stats.forEach(function (s) { el.appendChild(stat(s[0], s[1], s[2])); }); }
  function copyBtn(btnId, preId) {
    $(btnId).addEventListener('click', function () {
      var b = this, t = $(preId).textContent;
      var done = function (m) { b.textContent = m; setTimeout(function () { b.textContent = 'Copy'; }, 1200); };
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { done('Copied!'); }, function () { done('Failed'); });
    });
  }

  // toolbar: category chips + search
  var cards = Array.prototype.slice.call(document.querySelectorAll('.tool-card[data-cat]'));
  var activeCat = 'all';
  function applyFilter() {
    var q = ($('tools-search').value || '').trim().toLowerCase(), shown = 0;
    cards.forEach(function (c) {
      var okCat = activeCat === 'all' || c.dataset.cat.split(' ').indexOf(activeCat) !== -1;
      var okQ = !q || (c.dataset.title + ' ' + (c.dataset.keywords || '') + ' ' + c.dataset.cat).toLowerCase().indexOf(q) !== -1;
      c.hidden = !(okCat && okQ); if (!c.hidden) shown++;
    });
    $('tools-count').textContent = shown ? shown + ' tool' + (shown === 1 ? '' : 's') : 'No tools match. Try another keyword.';
  }
  document.querySelectorAll('[data-tcat]').forEach(function (b) {
    b.addEventListener('click', function () {
      activeCat = b.dataset.tcat;
      document.querySelectorAll('[data-tcat]').forEach(function (x) { x.classList.toggle('active', x === b); });
      applyFilter();
    });
  });
  $('tools-search').addEventListener('input', applyFilter);
  applyFilter();
  function goHash() {
    var h = (location.hash || '').slice(1); if (!h) return;
    var t = $(h); if (!t) return;
    var card = t.classList && t.classList.contains('tool-card') ? t : t.closest('.tool-card');
    if (card && card.hidden) { activeCat = 'all'; $('tools-search').value = ''; document.querySelectorAll('[data-tcat]').forEach(function (x) { x.classList.toggle('active', x.dataset.tcat === 'all'); }); applyFilter(); }
    setTimeout(function () { t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
  }
  window.addEventListener('hashchange', goHash); goHash();

  // --- Terraform plan analyzer ---
  var SAMPLE = 'Terraform will perform the following actions:\n\n  # aws_security_group.db will be updated in-place\n  ~ resource "aws_security_group" "db" {\n      ~ description = "old" -> "new"\n    }\n\n  # aws_db_instance.orders must be replaced\n-/+ resource "aws_db_instance" "orders" {\n      ~ identifier = "orders-old" -> "orders" # forces replacement\n    }\n\n  # aws_cloudwatch_metric_alarm.cpu will be created\n  + resource "aws_cloudwatch_metric_alarm" "cpu" {\n    }\n\n  # aws_s3_bucket.old_logs will be destroyed\n  - resource "aws_s3_bucket" "old_logs" {\n    }\n\nPlan: 2 to add, 1 to change, 2 to destroy.';
  function renderPlan() {
    var r = parsePlan(val('tf-input')), v = $('tf-verdict'), body = $('tf-rows');
    body.innerHTML = ''; $('tf-counts').innerHTML = '';
    if (!val('tf-input').trim()) { v.className = 'tf-verdict'; v.textContent = 'Paste the output of terraform plan to analyze it. Nothing leaves your browser.'; return; }
    if (!r.recognised) { v.className = 'tf-verdict warn'; v.textContent = 'This does not look like terraform plan output. Paste the text from "terraform plan" (not JSON).'; return; }
    var msg = { critical: 'STOP and review: ' + r.critical.length + ' stateful resource' + (r.critical.length === 1 ? '' : 's') + ' will be destroyed or replaced (possible data loss).', warning: 'Review: resources will be destroyed or replaced.', ok: r.noChanges ? 'No changes. Infrastructure matches the configuration.' : 'No destructive changes detected.' }[r.verdict];
    v.className = 'tf-verdict ' + (r.verdict === 'critical' ? 'bad' : r.verdict === 'warning' ? 'warn' : 'good'); v.textContent = msg;
    fill('tf-counts', [['To add', String(r.add)], ['To change', String(r.change)], ['To destroy', String(r.destroy), r.destroy ? 'is-bad' : ''], ['Critical', String(r.critical.length), r.critical.length ? 'is-bad' : '']]);
    var order = { critical: 0, warning: 1, caution: 2, ok: 3 };
    r.resources.slice().sort(function (a, b) { return order[a.risk] - order[b.risk]; }).forEach(function (x) {
      var tr = document.createElement('tr'); tr.className = 'risk-' + x.risk;
      [x.addr, x.action + (x.forces.length ? ' (forces: ' + x.forces.join(', ') + ')' : ''), x.risk === 'critical' ? 'CRITICAL: stateful' : x.risk === 'warning' ? 'warning' : x.risk === 'caution' ? 'check for downtime' : 'ok'].forEach(function (t) { var td = document.createElement('td'); td.textContent = t; tr.appendChild(td); });
      body.appendChild(tr);
    });
  }
  $('tf-input').addEventListener('input', renderPlan);
  $('tf-sample').addEventListener('click', function () { $('tf-input').value = SAMPLE; renderPlan(); });
  $('tf-clear').addEventListener('click', function () { $('tf-input').value = ''; renderPlan(); });
  renderPlan();

  // --- RDS generator ---
  bind(['rd-name', 'rd-engine', 'rd-version', 'rd-class', 'rd-storage', 'rd-env', 'rd-multi', 'rd-retention'], function () {
    $('rd-output').textContent = rdsHcl({ name: val('rd-name'), engine: val('rd-engine'), version: val('rd-version'), instanceClass: val('rd-class'), storage: val('rd-storage'), env: val('rd-env'), multiAz: $('rd-multi').checked, retention: val('rd-retention') });
  });
  copyBtn('rd-copy', 'rd-output');

  // --- Snowflake ---
  var sel = $('sf-size'); SF_SIZES.forEach(function (s) { var o = document.createElement('option'); o.value = s[0]; o.textContent = s[0] + ' (' + s[1] + ' credit' + (s[1] > 1 ? 's' : '') + '/hr)'; if (s[0] === 'M') o.selected = true; sel.appendChild(o); });
  bind(['sf-size', 'sf-clusters', 'sf-active', 'sf-resumes', 'sf-suspend', 'sf-days', 'sf-price', 'sf-storage', 'sf-sprice'], function () {
    var r = snowflakeCost({ size: val('sf-size'), clusters: val('sf-clusters'), activeHours: val('sf-active'), resumes: val('sf-resumes'), suspendMin: val('sf-suspend'), days: val('sf-days'), price: val('sf-price'), storageTB: val('sf-storage'), storagePrice: val('sf-sprice') });
    fill('sf-results', [['Credits / month', Math.round(r.credits).toLocaleString()], ['Compute / month', money(r.compute)], ['Storage / month', money(r.storage)], ['Total / month', money(r.total)], ['Total / year', money(r.annual)], ['Idle share of billed time', Math.round(r.idleShare * 100) + '%', r.idleShare > 0.25 ? 'is-bad' : '']]);
    $('sf-note').textContent = 'Setting auto-suspend to 1 minute would save about ' + money(r.saving1MinSuspend) + '/month. Suggested monthly resource-monitor quota (110%): ' + r.monitorQuota.toLocaleString() + ' credits. Billing is per second with a 60-second minimum each time a warehouse resumes.';
  });

  // --- AWS savings ---
  bind(['aw-rate', 'aw-count', 'aw-hours', 'aw-days', 'aw-disc', 'aw-gb', 'aw-gp2', 'aw-gp3', 'aw-snapgb', 'aw-snapprice'], function () {
    var r = awsSavings({ rate: val('aw-rate'), count: val('aw-count'), hoursPerDay: val('aw-hours'), daysPerWeek: val('aw-days'), discount: val('aw-disc'), gb: val('aw-gb'), gp2: val('aw-gp2'), gp3: val('aw-gp3'), snapGB: val('aw-snapgb'), snapPrice: val('aw-snapprice') });
    fill('aw-results', [['24/7 baseline / month', money(r.baseline)], ['Scheduled (' + Math.round(r.scheduledHours) + ' h/mo)', money(r.scheduled)], ['Schedule saves / month', money(r.schedSave) + ' (' + Math.round(r.schedPct) + '%)'], ['Commitment saves / month', money(r.commitSave)], ['gp2 to gp3 saves / month', money(r.storageSave)], ['Snapshot cleanup saves / month', money(r.snapSave)], ['Schedule + storage + snapshots / year', money(r.combinedAnnual), 'is-good']]);
  });

  // --- CIDR ---
  bind(['cd-input', 'cd-split'], function () {
    var r = cidrPlan(val('cd-input'), val('cd-split')), out = $('cd-results'), tb = $('cd-rows'); tb.innerHTML = ''; out.innerHTML = '';
    if (r.error) { out.appendChild(stat('Error', r.error, 'is-bad')); $('cd-notes').textContent = ''; return; }
    fill('cd-results', [['Network', r.network + '/' + r.prefix], ['Netmask', r.mask], ['Total IPs', r.total.toLocaleString()], ['AWS usable IPs (minus 5)', r.awsUsable.toLocaleString()], ['First usable (AWS)', r.firstUsable], ['Last usable', r.lastUsable]]);
    $('cd-notes').textContent = r.notes.join(' ');
    r.subnets.forEach(function (s) { var tr = document.createElement('tr'); [s.cidr, s.first + ' - ' + s.last, s.usable.toLocaleString()].forEach(function (t) { var td = document.createElement('td'); td.textContent = t; tr.appendChild(td); }); tb.appendChild(tr); });
  });

  // --- Memory budget ---
  bind(['mb-ram', 'mb-sb', 'mb-conn', 'mb-work', 'mb-nodes', 'mb-per', 'mb-maint', 'mb-workers', 'mb-os', 'mb-active'], function () {
    var r = memBudget({ ramGB: val('mb-ram'), sharedBuffersGB: val('mb-sb'), maxConn: val('mb-conn'), workMemMB: val('mb-work'), nodes: val('mb-nodes'), perConnMB: val('mb-per'), maintMB: val('mb-maint'), autovacWorkers: val('mb-workers'), osReservePct: val('mb-os'), activePct: val('mb-active') });
    var gb = function (mb) { return (mb / 1024).toFixed(1) + ' GB'; };
    fill('mb-results', [['Usable RAM', gb(r.usableMB)], ['Typical memory', gb(r.typicalMB)], ['Worst case', gb(r.worstMB), r.status === 'ok' ? 'is-good' : 'is-bad'], ['Largest safe work_mem', Math.floor(r.safeWorkMemMB) + ' MB']]);
    $('mb-note').textContent = r.status === 'ok' ? 'Worst case fits in RAM. You have headroom.' : r.status === 'warn' ? 'Worst case exceeds RAM, but typical load fits. Reduce work_mem or max_connections (use a pooler like PgBouncer), or accept the OOM risk knowingly.' : 'Even typical load exceeds RAM. Lower work_mem, lower max_connections, or add memory.';
  });

  // --- Autovacuum ---
  bind(['av-rows', 'av-sf', 'av-thr', 'av-asf', 'av-athr', 'av-isf', 'av-ithr', 'av-pct', 'av-table'], function () {
    var r = autovac({ rows: val('av-rows'), vsf: val('av-sf'), vth: val('av-thr'), asf: val('av-asf'), ath: val('av-athr'), isf: val('av-isf'), ith: val('av-ithr'), targetPct: val('av-pct'), table: val('av-table') });
    fill('av-results', [['Vacuum triggers at (dead rows)', Math.round(r.vacuumAt).toLocaleString()], ['= % of table', r.vacuumPct.toFixed(1) + '%'], ['Analyze triggers at (changed rows)', Math.round(r.analyzeAt).toLocaleString()], ['Insert-vacuum triggers at (PG13+)', Math.round(r.insertAt).toLocaleString()]]);
    $('av-output').textContent = r.sql;
  });
  copyBtn('av-copy', 'av-output');

  // --- Burn rate ---
  bind(['br-slo', 'br-days'], function () {
    var slo = num(val('br-slo'), 99.9), tb = $('br-rows'); tb.innerHTML = '';
    if (!(slo > 0 && slo < 100)) { $('br-output').textContent = 'Enter an SLO between 0 and 100 (exclusive).'; return; }
    burnRates(slo, val('br-days')).forEach(function (r) { var tr = document.createElement('tr'); [r.sev, r.long + ' and ' + r.short, r.budgetPct + '%', r.burnRate + 'x', (r.errorRatio * 100).toPrecision(3) + '%'].forEach(function (t) { var td = document.createElement('td'); td.textContent = t; tr.appendChild(td); }); tb.appendChild(tr); });
    $('br-output').textContent = promRules(slo, val('br-days'));
  });
  copyBtn('br-copy', 'br-output');

  // --- Backup / restore ---
  bind(['bk-size', 'bk-change', 'bk-ret', 'bk-full', 'bk-comp', 'bk-price', 'bk-tp', 'bk-replay', 'bk-valid'], function () {
    var r = backupPlan({ sizeGB: val('bk-size'), changePct: val('bk-change'), retention: val('bk-ret'), fullEvery: val('bk-full'), compression: val('bk-comp'), price: val('bk-price'), restoreMBps: val('bk-tp'), replayMBps: val('bk-replay'), validateMin: val('bk-valid') });
    fill('bk-results', [['Backup storage', Math.round(r.totalGB).toLocaleString() + ' GB'], ['Storage cost / month', money(r.monthlyCost)], ['Full backups kept', String(r.fulls)], ['Restore time', fmtDur(r.restoreMin)], ['WAL replay time', fmtDur(r.replayMin)], ['Estimated RTO', fmtDur(r.rtoMin), 'is-good']]);
  });

  // --- Cron ---
  function renderCron() {
    var expr = val('cr-expr'), p = cronParse(expr), out = $('cr-out'); out.innerHTML = '';
    if (p.error) { var e = document.createElement('p'); e.className = 'tool-error'; e.textContent = p.error; out.appendChild(e); return; }
    var ul = document.createElement('ul'); ul.className = 'cr-list'; cronDescribe(expr).forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); }); out.appendChild(ul);
    var next = cronNext(expr, new Date(), 5), h = document.createElement('p'); h.className = 'tool-note'; h.textContent = next.length ? 'Next 5 runs (UTC | your local time):' : 'No run found in the next few years.'; out.appendChild(h);
    var ol = document.createElement('ol'); ol.className = 'cr-list';
    next.forEach(function (d) { var li = document.createElement('li'); li.textContent = d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC | ' + d.toLocaleString(); ol.appendChild(li); }); out.appendChild(ol);
    var eb = toEventBridge(expr), p2 = document.createElement('p'); p2.className = 'tool-note'; p2.textContent = 'AWS EventBridge: ' + (eb.error || eb.expr) + (eb.note ? '  (' + eb.note + ')' : ''); out.appendChild(p2);
  }
  $('cr-expr').addEventListener('input', renderCron);
  document.querySelectorAll('[data-cron]').forEach(function (b) { b.addEventListener('click', function () { $('cr-expr').value = b.dataset.cron; renderCron(); }); });
  renderCron();
})();
