const incidentScenarios = [
  {
    title: 'CPU spikes on primary DB',
    desc: 'PostgreSQL CPU is at 95% and p95 latency doubled. What is your first action?',
    options: [
      'Restart the database immediately',
      'Check top slow queries and lock wait events',
      'Scale app pods by 10x',
      'Drop and recreate all indexes'
    ],
    correct: 1,
    explain: 'Correct first move is evidence collection: identify slow query and lock pressure before taking disruptive actions.'
  },
  {
    title: 'Replication lag alert',
    desc: 'Read replica lag increased from 1s to 180s. What should you do first?',
    options: [
      'Promote replica immediately',
      'Pause writes on primary forever',
      'Inspect WAL generation rate, network, and replica apply bottleneck',
      'Delete replica and create new one'
    ],
    correct: 2,
    explain: 'Lag root cause comes from WAL throughput, network, or apply speed. Diagnose first to avoid data risk.'
  },
  {
    title: 'Storage nearly full',
    desc: 'Database disk usage hit 92% with rapid growth in 2 hours.',
    options: [
      'Enable emergency retention cleanup and identify largest tables',
      'Ignore until 99%',
      'Disable autovacuum',
      'Block all app traffic'
    ],
    correct: 0,
    explain: 'Stabilize growth quickly and identify top contributors while keeping service available.'
  },
  {
    title: 'Connection storm',
    desc: 'Active DB connections jumped from 300 to 2500 after deploy.',
    options: [
      'Increase max_connections to 10000',
      'Roll back deploy and check connection pooling behavior',
      'Reboot all DB instances',
      'Turn off monitoring'
    ],
    correct: 1,
    explain: 'Fastest safe response is rollback + verify app-side pool config/regression.'
  },
  {
    title: 'RDS failover drill',
    desc: 'You need near-zero RPO and low RTO for DR readiness.',
    options: [
      'Use random manual snapshots',
      'Configure Aurora Global Database + tested failover runbook',
      'Only rely on app retries',
      'Backup once per week'
    ],
    correct: 1,
    explain: 'Architecture + rehearsed runbooks drives predictable RPO/RTO.'
  },
  {
    title: 'Cost alarm breach',
    desc: 'Monthly cloud spend is projected 35% above budget.',
    options: [
      'Terminate production immediately',
      'Run right-sizing report for EC2/RDS and remove idle resources',
      'Stop all backups',
      'Ignore because uptime matters more'
    ],
    correct: 1,
    explain: 'Right-sizing and idle cleanup deliver safe cost wins without reliability loss.'
  },
  {
    title: 'P1 incident bridge',
    desc: 'Multiple teams join a live incident. What improves MTTR most?',
    options: [
      'No incident commander, everyone free-for-all',
      'Assign IC, create timeline, and keep clear owner/action updates',
      'Wait for leadership only',
      'Mute all alerts'
    ],
    correct: 1,
    explain: 'Clear command structure and communication reduce coordination overhead.'
  },
  {
    title: 'Schema migration risk',
    desc: 'Large table needs schema update during business hours.',
    options: [
      'Direct ALTER with exclusive lock',
      'Blue-green / phased migration with validation and rollback path',
      'Skip testing for speed',
      'Disable replicas first'
    ],
    correct: 1,
    explain: 'Phased rollout with rollback path is safer for zero-downtime changes.'
  }
];

let incidentIndex = 0;
let incidentScore = 0;
let incidentStreak = 0;
let selected = null;
let timeLeft = 20;
let timer = null;

const scoreEl = document.getElementById('incidentScore');
const roundEl = document.getElementById('incidentRound');
const streakEl = document.getElementById('incidentStreak');
const timerEl = document.getElementById('incidentTimer');
const progressEl = document.getElementById('incidentProgressFill');
const titleEl = document.getElementById('incidentTitle');
const descEl = document.getElementById('incidentDesc');
const optionsEl = document.getElementById('incidentOptions');
const feedbackEl = document.getElementById('incidentFeedback');
const nextBtn = document.getElementById('incidentNextBtn');
const restartBtn = document.getElementById('incidentRestartBtn');

function shuffleIncidents() {
  for (let i = incidentScenarios.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [incidentScenarios[i], incidentScenarios[j]] = [incidentScenarios[j], incidentScenarios[i]];
  }
}

function renderStats() {
  scoreEl.textContent = String(incidentScore);
  roundEl.textContent = `${Math.min(incidentIndex + 1, incidentScenarios.length)}/${incidentScenarios.length}`;
  streakEl.textContent = String(incidentStreak);
  timerEl.textContent = `${timeLeft}s`;
  progressEl.style.width = `${(timeLeft / 20) * 100}%`;
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

function startTimer() {
  stopTimer();
  timer = setInterval(() => {
    timeLeft -= 1;
    renderStats();
    if (timeLeft <= 0) {
      stopTimer();
      lockRound(-1);
    }
  }, 1000);
}

function lockRound(chosenIndex) {
  const scenario = incidentScenarios[incidentIndex];
  const buttons = optionsEl.querySelectorAll('button');
  buttons.forEach((btn, idx) => {
    btn.disabled = true;
    if (idx === scenario.correct) btn.classList.add('correct');
    if (idx === chosenIndex && idx !== scenario.correct) btn.classList.add('wrong');
  });

  if (chosenIndex === scenario.correct) {
    incidentStreak += 1;
    incidentScore += 10 + incidentStreak * 2 + timeLeft;
    feedbackEl.textContent = `Great call. ${scenario.explain}`;
  } else {
    incidentStreak = 0;
    feedbackEl.textContent = chosenIndex === -1
      ? `Time up. ${scenario.explain}`
      : `Not ideal. ${scenario.explain}`;
  }
  renderStats();
  nextBtn.style.display = 'inline-flex';
}

function renderRound() {
  const scenario = incidentScenarios[incidentIndex];
  selected = null;
  feedbackEl.textContent = '';
  nextBtn.style.display = 'none';
  timeLeft = 20;
  renderStats();
  startTimer();

  titleEl.textContent = scenario.title;
  descEl.textContent = scenario.desc;
  optionsEl.innerHTML = '';
  scenario.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'incident-option';
    btn.textContent = opt;
    btn.addEventListener('click', () => {
      if (selected !== null) return;
      selected = idx;
      stopTimer();
      lockRound(idx);
    });
    optionsEl.appendChild(btn);
  });
}

function nextRound() {
  incidentIndex += 1;
  if (incidentIndex >= incidentScenarios.length) {
    stopTimer();
    titleEl.textContent = 'Incident Challenge Complete';
    descEl.textContent = `Final score: ${incidentScore}. Great incident handling!`;
    optionsEl.innerHTML = '';
    feedbackEl.textContent = 'Restart to play a new shuffled set.';
    nextBtn.style.display = 'none';
    return;
  }
  renderRound();
}

function restartGame() {
  incidentIndex = 0;
  incidentScore = 0;
  incidentStreak = 0;
  shuffleIncidents();
  renderRound();
}

nextBtn?.addEventListener('click', nextRound);
restartBtn?.addEventListener('click', restartGame);
restartGame();
