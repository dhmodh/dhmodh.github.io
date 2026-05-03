const memorySymbols = ['AWS', 'RDS', 'SRE', 'WAL', 'IaC', 'SLA', 'DMS', 'SQL'];
let memoryDeck = [];
let openCards = [];
let lockBoard = false;
let moveCount = 0;
let matchCount = 0;
let seconds = 0;
let timerHandle = null;

const boardEl = document.getElementById('memoryBoard');
const movesEl = document.getElementById('moves');
const timerEl = document.getElementById('timer');
const matchedEl = document.getElementById('matched');
const bestEl = document.getElementById('best');
const winEl = document.getElementById('memoryWin');
const restartBtn = document.getElementById('restartGameBtn');

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function updateStats() {
  movesEl.textContent = String(moveCount);
  timerEl.textContent = `${seconds}s`;
  matchedEl.textContent = `${matchCount}/8`;
}

function loadBest() {
  const best = localStorage.getItem('infra_memory_best_moves');
  bestEl.textContent = best ? best : '--';
}

function startTimer() {
  if (timerHandle) return;
  timerHandle = setInterval(() => {
    seconds += 1;
    updateStats();
  }, 1000);
}

function stopTimer() {
  clearInterval(timerHandle);
  timerHandle = null;
}

function createCard(symbol, id) {
  const btn = document.createElement('button');
  btn.className = 'memory-card';
  btn.dataset.symbol = symbol;
  btn.dataset.id = id;
  btn.innerHTML = `<span class="memory-back">?</span>`;
  btn.addEventListener('click', () => flipCard(btn));
  return btn;
}

function resetBoard() {
  openCards = [];
  lockBoard = false;
}

function flipCard(card) {
  if (lockBoard || card.classList.contains('flipped') || card.classList.contains('matched')) return;
  if (!timerHandle) startTimer();

  card.classList.add('flipped');
  card.textContent = card.dataset.symbol;
  openCards.push(card);

  if (openCards.length < 2) return;
  moveCount += 1;
  updateStats();
  checkMatch();
}

function checkMatch() {
  const [a, b] = openCards;
  if (a.dataset.symbol === b.dataset.symbol && a.dataset.id !== b.dataset.id) {
    a.classList.add('matched');
    b.classList.add('matched');
    matchCount += 1;
    resetBoard();
    updateStats();
    if (matchCount === 8) finishGame();
    return;
  }

  lockBoard = true;
  setTimeout(() => {
    a.classList.remove('flipped');
    b.classList.remove('flipped');
    a.innerHTML = '<span class="memory-back">?</span>';
    b.innerHTML = '<span class="memory-back">?</span>';
    resetBoard();
  }, 700);
}

function finishGame() {
  stopTimer();
  const best = Number(localStorage.getItem('infra_memory_best_moves') || '0');
  if (!best || moveCount < best) {
    localStorage.setItem('infra_memory_best_moves', String(moveCount));
    bestEl.textContent = String(moveCount);
    winEl.textContent = `Great job! Finished in ${moveCount} moves and ${seconds}s. New best score!`;
  } else {
    winEl.textContent = `Great job! Finished in ${moveCount} moves and ${seconds}s.`;
  }
}

function initMemoryGame() {
  stopTimer();
  seconds = 0;
  moveCount = 0;
  matchCount = 0;
  winEl.textContent = '';
  resetBoard();
  updateStats();
  loadBest();

  memoryDeck = shuffle([...memorySymbols, ...memorySymbols]);
  boardEl.innerHTML = '';
  memoryDeck.forEach((symbol, idx) => {
    boardEl.appendChild(createCard(symbol, idx));
  });
}

restartBtn?.addEventListener('click', initMemoryGame);
initMemoryGame();
