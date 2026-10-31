// Interactive "about me" terminal. DMTerm.run(cmd) is pure (returns lines) so it can be tested.
(function () {
  'use strict';
  var HELP = [
    ['whoami', 'who is Dishant?'],
    ['experience', 'where have I worked?'],
    ['skills', 'tech stack'],
    ['projects', 'things I have built'],
    ['blog', 'latest articles'],
    ['tools', 'free SRE tools'],
    ['contact', 'how to reach me'],
    ['open <page>', 'navigate: about, experience, projects, tools, blog, contact, resume'],
    ['theme', 'toggle dark/light'],
    ['uptime', 'a very important metric'],
    ['clear', 'clear the screen']
  ];
  var PAGES = { about: '/about.html', experience: '/experience.html', projects: '/projects.html', tools: '/tools.html', blog: '/blog.html', contact: '/contact.html', resume: '/resume.html', home: '/index.html', failover: '/tools.html#failover' };

  function run(raw) {
    var input = String(raw || '').trim();
    if (!input) return { lines: [] };
    var parts = input.split(/\s+/), cmd = parts[0].toLowerCase(), arg = (parts[1] || '').toLowerCase();
    switch (cmd) {
      case 'help': case '?':
        return { lines: ['Available commands:'].concat(HELP.map(function (h) { return '  ' + (h[0] + '                 ').slice(0, 16) + h[1]; })) };
      case 'whoami':
        return { lines: ['Dishant Modh', 'Senior Database Reliability Engineer @ The Walt Disney Company', '5+ years keeping databases fast, resilient and affordable.', 'Based in Bengaluru, India.'] };
      case 'experience':
        return { lines: ['2026-07 .. now   The Walt Disney Company  Sr Database Reliability Engineer', '2024-02 .. 2026  GlobalLogic (Hitachi)  Software Engineer, SRE (DBA)', '2021-12 .. 2024  HHAeXchange             Software Engineer, DBA'] };
      case 'skills':
        return { lines: ['databases : PostgreSQL, Aurora, MySQL, MongoDB, Cassandra, Snowflake', 'cloud     : AWS (RDS, EC2, DMS, Lambda, CloudWatch), Azure', 'iac/devops: Terraform, GitHub Actions, Jenkins, Docker, Ansible', 'languages : Python, SQL, Bash, Go', 'observ.   : Datadog, Grafana, Prometheus'] };
      case 'projects':
        return { lines: ['1. Auto-healing PostgreSQL on Patroni + etcd (<5s failover)', '2. AWS cost optimization framework ($1.2M annualized savings)', '3. ML-powered database anomaly detection (Isolation Forest)', "-> type 'open projects' for details"] };
      case 'blog':
        return { lines: ['- How I Cut PostgreSQL p95 Latency from 1.8s to 0.9s', '- Zero-Downtime Database Migrations: On-Prem to AWS', '- DR Readiness for Aurora Global Database', "-> type 'open blog' to read them"] };
      case 'tools':
        return { lines: ['- SLO / error budget calculator', '- PostgreSQL config starter', '- Failover simulator (try killing the leader!)', "-> type 'open tools'"] };
      case 'contact':
        return { lines: ['email   : dishantmodh7@gmail.com', 'linkedin: linkedin.com/in/dishantmodh', 'github  : github.com/dhmodh', "-> type 'open contact' for the form"] };
      case 'open': case 'cd': case 'goto': {
        var key = arg.replace(/\.html$/, '').replace(/^\//, '');
        if (PAGES[key]) return { lines: ['Opening ' + key + '...'], nav: PAGES[key] };
        return { lines: ['open: unknown page "' + (arg || '') + '". Try: ' + Object.keys(PAGES).join(', ')] };
      }
      case 'theme': return { lines: ['Toggling theme...'], action: 'theme' };
      case 'clear': case 'cls': return { clear: true, lines: [] };
      case 'uptime': return { lines: ['up 99.95%, load average: calm, on-call pager: quiet (for now)'] };
      case 'ls': return { lines: ['about/  experience/  projects/  tools/  blog/  contact/  resume.pdf'] };
      case 'date': return { lines: [new Date().toString()] };
      case 'sudo': return { lines: ['dishant is not in the sudoers file. This incident will be reported.'] };
      case 'rm': return { lines: ["rm: refusing to touch production. (Always have a backup. I do.)"] };
      case 'drop': case 'drop table': return { lines: ['ERROR: permission denied. Nice try.'] };
      case 'psql': return { lines: ['psql (15.x): type "help" instead, this is a portfolio.'] };
      default:
        return { lines: ['command not found: ' + cmd + ". Type 'help'."] };
    }
  }
  window.DMTerm = { run: run };

  var root = document.getElementById('terminal');
  if (!root) return;
  var out = root.querySelector('.term-out'), form = root.querySelector('form'), input = root.querySelector('input');
  var history = [], hi = 0;
  function print(text, cls) { var d = document.createElement('div'); d.className = cls || ''; d.textContent = text; out.appendChild(d); out.scrollTop = out.scrollHeight; }
  print("Welcome! Type 'help' to see what you can ask me.", 'muted');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = input.value; input.value = '';
    if (!v.trim()) return;
    history.push(v); hi = history.length;
    print('dishant@modh:~$ ' + v, 'cmd');
    var r = run(v);
    if (r.clear) { out.innerHTML = ''; return; }
    r.lines.forEach(function (l) { print(l); });
    if (r.action === 'theme') document.getElementById('themeToggle')?.click();
    if (r.nav) setTimeout(function () { window.location.href = r.nav; }, 500);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowUp') { e.preventDefault(); if (hi > 0) { hi--; input.value = history[hi]; } }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (hi < history.length - 1) { hi++; input.value = history[hi]; } else { hi = history.length; input.value = ''; } }
  });
  root.querySelectorAll('[data-cmd]').forEach(function (b) {
    b.addEventListener('click', function () { input.value = b.dataset.cmd; form.requestSubmit(); });
  });
})();
