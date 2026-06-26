const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('bestScore');
const speedEl = document.getElementById('speed');
const statusEl = document.getElementById('connectionStatus');
const roomCodeEl = document.getElementById('roomCode');
const playerCountEl = document.getElementById('playerCount');
const gameModeEl = document.getElementById('gameMode');
const readyStateEl = document.getElementById('readyState');
const gameGrid = document.getElementById('gameGrid');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const restartBtn = document.getElementById('restartBtn');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const arenaTitle = document.querySelector('.board-header h3');
const helpText = document.getElementById('gameHelp');
const exitFsBtn = document.getElementById('exitFullscreenBtn');
const fsHud = document.getElementById('fsHud');
const fsGameTitle = document.getElementById('fsGameTitle');
const fsPauseBtn = document.getElementById('fsPauseBtn');
const fsRestartBtn = document.getElementById('fsRestartBtn');

let currentGame = 'Snake';
let boardSize = 24;
let tile = canvas.width / boardSize;
let paused = false;
let gameLoop = null;
const defaultCanvasSize = { w: canvas.width, h: canvas.height };

function fitCanvasToContainer() {
  const wrap = document.querySelector('.board-wrap');
  if (!wrap) return;
  const rect = wrap.getBoundingClientRect();
  // leave some padding from viewport height
  const maxAvailable = Math.min(rect.width, window.innerHeight - 160);
  const size = Math.max(120, Math.min(maxAvailable, 720));
  canvas.width = size;
  canvas.height = size;
  canvas.style.width = '';
  canvas.style.height = '';
  updateTileSize();
  drawCurrentGame();
}

const snakeState = {
  snake: [{ x: 12, y: 12 }],
  dir: { x: 1, y: 0 },
  nextDir: { x: 1, y: 0 },
  food: null,
  score: 0,
  best: Number(localStorage.getItem('gamehub_best') || 0),
  speed: 1,
  running: false
};

const chessState = {
  board: [],
  selected: null,
  turn: 'white',
  moveCount: 0
};

const ludoState = {
  positions: [-1, -1, -1, -1],
  step: 0,
  dice: 0,
  message: 'Press start to roll the dice.'
};

const monopolyState = {
  pos: 0,
  cash: 1500,
  dice: 0,
  properties: [],
  message: 'Press start to roll the dice.'
};

const gameMeta = {
  Snake: {
    size: 24,
    help: 'Use arrow keys or WASD to move. Eat food, avoid walls, and beat your high score.',
    scoreboard: ['Score', 'Best', 'Speed']
  },
  Chess: {
    size: 8,
    help: 'Click a piece, then click its target square to move.',
    scoreboard: ['Moves', 'Player', 'Turn']
  },
  Ludo: {
    size: 8,
    help: 'Press Start to roll the dice and move your tokens.',
    scoreboard: ['Roll', 'Token', 'Steps']
  },
  Monopoly: {
    size: 12,
    help: 'Press Start to roll the dice and move around the board.',
    scoreboard: ['Cash', 'Position', 'Roll']
  }
};

function updateTileSize() {
  tile = canvas.width / boardSize;
}

function enterFullscreenMode() {
  if (document.fullscreenElement) return;
  // Request browser fullscreen on the canvas and expand it to fit viewport
  if (canvas.requestFullscreen) {
    canvas.requestFullscreen().catch(() => {});
  }
}

function exitFullscreenMode() {
  if (!document.fullscreenElement) return;
  if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
}

function applyFullscreenSizing() {
  if (document.fullscreenElement) {
    // make canvas fill viewport while keeping a small margin
    const size = Math.min(window.innerWidth, window.innerHeight) - 40;
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    exitFsBtn.style.display = 'block';
    // show HUD
    document.body.classList.add('fullscreen-active');
    if (fsHud) fsHud.classList.add('show');
    if (fsGameTitle) fsGameTitle.textContent = currentGame;
    if (fsPauseBtn) fsPauseBtn.textContent = paused ? 'Resume' : 'Pause';
  } else {
    // restore responsive sizing (fit back into the board container)
    exitFsBtn.style.display = 'none';
    document.body.classList.remove('fullscreen-active');
    if (fsHud) fsHud.classList.remove('show');
    fitCanvasToContainer();
  }
  updateTileSize();
  drawCurrentGame();
}

function randomFood() {
  let p;
  do {
    p = { x: Math.floor(Math.random() * boardSize), y: Math.floor(Math.random() * boardSize) };
  } while (snakeState.snake.some(s => s.x === p.x && s.y === p.y));
  return p;
}

function resetSnake() {
  boardSize = gameMeta.Snake.size;
  updateTileSize();
  snakeState.snake = [{ x: 12, y: 12 }];
  snakeState.dir = { x: 1, y: 0 };
  snakeState.nextDir = { x: 1, y: 0 };
  snakeState.food = randomFood();
  snakeState.score = 0;
  snakeState.speed = 1;
  snakeState.running = false;
  paused = false;
  pauseBtn.textContent = 'Pause';
  scoreEl.textContent = snakeState.score;
  bestEl.textContent = snakeState.best;
  speedEl.textContent = snakeState.speed + 'x';
  statusEl.textContent = 'Ready';
}

function drawSnake() {
  ctx.fillStyle = '#06111f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(255,255,255,.04)';
  for (let x = 0; x < boardSize; x += 1) {
    for (let y = 0; y < boardSize; y += 1) {
      ctx.strokeRect(x * tile, y * tile, tile, tile);
    }
  }
  ctx.fillStyle = '#ff4d6d';
  ctx.beginPath();
  ctx.roundRect(snakeState.food.x * tile + 3, snakeState.food.y * tile + 3, tile - 6, tile - 6, 6);
  ctx.fill();
  snakeState.snake.forEach((seg, index) => {
    ctx.fillStyle = index === 0 ? '#00e5a8' : '#0ea5e9';
    ctx.beginPath();
    ctx.roundRect(seg.x * tile + 2, seg.y * tile + 2, tile - 4, tile - 4, 6);
    ctx.fill();
  });
}

function stepSnake() {
  if (!snakeState.running || paused) return;
  snakeState.dir = snakeState.nextDir;
  const head = { x: snakeState.snake[0].x + snakeState.dir.x, y: snakeState.snake[0].y + snakeState.dir.y };
  if (head.x < 0 || head.x >= boardSize || head.y < 0 || head.y >= boardSize || snakeState.snake.some(s => s.x === head.x && s.y === head.y)) {
    endCurrentGame('Game Over');
    return;
  }
  snakeState.snake.unshift(head);
  if (head.x === snakeState.food.x && head.y === snakeState.food.y) {
    snakeState.score += 1;
    scoreEl.textContent = snakeState.score;
    if (snakeState.score > snakeState.best) {
      snakeState.best = snakeState.score;
      localStorage.setItem('gamehub_best', snakeState.best);
      bestEl.textContent = snakeState.best;
    }
    if (snakeState.score % 5 === 0) {
      snakeState.speed += 1;
      speedEl.textContent = snakeState.speed + 'x';
      clearInterval(gameLoop);
      gameLoop = setInterval(stepSnake, 220 - (snakeState.speed - 1) * 20);
    }
    snakeState.food = randomFood();
  } else {
    snakeState.snake.pop();
  }
  drawSnake();
}

function resetChess() {
  boardSize = gameMeta.Chess.size;
  updateTileSize();
  chessState.board = [
    ['br', 'bn', 'bb', 'bq', 'bk', 'bb', 'bn', 'br'],
    ['bp', 'bp', 'bp', 'bp', 'bp', 'bp', 'bp', 'bp'],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['wp', 'wp', 'wp', 'wp', 'wp', 'wp', 'wp', 'wp'],
    ['wr', 'wn', 'wb', 'wq', 'wk', 'wb', 'wn', 'wr']
  ];
  chessState.selected = null;
  chessState.turn = 'white';
  chessState.moveCount = 0;
  scoreEl.textContent = chessState.moveCount;
  bestEl.textContent = chessState.turn;
  speedEl.textContent = '-';
  statusEl.textContent = 'Click a piece to select it.';
}

function drawChess() {
  ctx.fillStyle = '#06111f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < boardSize; y += 1) {
    for (let x = 0; x < boardSize; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#13203c' : '#0a162d';
      ctx.fillRect(x * tile, y * tile, tile, tile);
      if (chessState.selected && chessState.selected.x === x && chessState.selected.y === y) {
        ctx.fillStyle = 'rgba(79, 70, 229, 0.35)';
        ctx.fillRect(x * tile, y * tile, tile, tile);
      }
      const piece = chessState.board[y][x];
      if (piece) {
        ctx.fillStyle = piece.startsWith('w') ? '#dbe7ff' : '#7ed4ff';
        ctx.font = `${tile * 0.7}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(getChessIcon(piece), x * tile + tile / 2, y * tile + tile / 2 + 2);
      }
    }
  }
}

function getChessIcon(piece) {
  const icons = { wr: '♖', wn: '♘', wb: '♗', wq: '♕', wk: '♔', wp: '♙', br: '♜', bn: '♞', bb: '♝', bq: '♛', bk: '♚', bp: '♟' };
  return icons[piece] || '';
}

function handleChessClick(x, y) {
  if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) return;
  const piece = chessState.board[y][x];
  const ownPiece = piece && piece.startsWith(chessState.turn[0]);
  if (chessState.selected && (x !== chessState.selected.x || y !== chessState.selected.y)) {
    const target = chessState.board[y][x];
    if (!target || !target.startsWith(chessState.turn[0])) {
      chessState.board[y][x] = chessState.board[chessState.selected.y][chessState.selected.x];
      chessState.board[chessState.selected.y][chessState.selected.x] = '';
      chessState.selected = null;
      chessState.moveCount += 1;
      chessState.turn = chessState.turn === 'white' ? 'black' : 'white';
      scoreEl.textContent = chessState.moveCount;
      bestEl.textContent = chessState.turn;
      statusEl.textContent = `${chessState.turn.charAt(0).toUpperCase() + chessState.turn.slice(1)}'s turn`;
      drawChess();
      return;
    }
  }
  if (ownPiece) {
    chessState.selected = { x, y };
    statusEl.textContent = `Selected ${getChessIcon(piece)}. Choose a square.`;
    drawChess();
  }
}

function resetLudo() {
  boardSize = gameMeta.Ludo.size;
  updateTileSize();
  ludoState.positions = [-1, -1, -1, -1];
  ludoState.step = 0;
  ludoState.dice = 0;
  ludoState.message = 'Press Start to roll the dice.';
  scoreEl.textContent = '0';
  bestEl.textContent = 'Home';
  speedEl.textContent = '-';
  statusEl.textContent = ludoState.message;
}

function drawLudo() {
  ctx.fillStyle = '#06111f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < boardSize; y += 1) {
    for (let x = 0; x < boardSize; x += 1) {
      const inTrack = y === 0 || y === boardSize - 1 || x === 0 || x === boardSize - 1;
      ctx.fillStyle = inTrack ? '#0a162d' : '#06111f';
      ctx.fillRect(x * tile, y * tile, tile, tile);
      ctx.strokeStyle = '#1f2d4b';
      ctx.strokeRect(x * tile, y * tile, tile, tile);
    }
  }
  const positions = getLudoPath();
  positions.forEach((pos, index) => {
    ctx.fillStyle = '#183658';
    ctx.fillRect(pos.x * tile + 4, pos.y * tile + 4, tile - 8, tile - 8);
    ctx.fillStyle = '#9fb3d1';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(index + 1, pos.x * tile + tile / 2, pos.y * tile + tile / 2);
  });
  ludoState.positions.forEach((position, index) => {
    if (position >= 0) {
      const pos = positions[position];
      ctx.fillStyle = '#00d4ff';
      ctx.beginPath();
      ctx.arc(pos.x * tile + tile / 2, pos.y * tile + tile / 2, tile / 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#07111f';
      ctx.fillText(index + 1, pos.x * tile + tile / 2, pos.y * tile + tile / 2);
    }
  });
}

function getLudoPath() {
  const path = [];
  for (let x = 0; x < boardSize; x += 1) path.push({ x, y: 0 });
  for (let y = 1; y < boardSize - 1; y += 1) path.push({ x: boardSize - 1, y });
  for (let x = boardSize - 1; x >= 0; x -= 1) path.push({ x, y: boardSize - 1 });
  return path.slice(0, 16);
}

function resetMonopoly() {
  boardSize = gameMeta.Monopoly.size;
  updateTileSize();
  monopolyState.pos = 0;
  monopolyState.cash = 1500;
  monopolyState.dice = 0;
  monopolyState.properties = [];
  monopolyState.message = 'Press Start to roll the dice.';
  scoreEl.textContent = monopolyState.cash;
  bestEl.textContent = monopolyState.pos;
  speedEl.textContent = monopolyState.dice;
  statusEl.textContent = monopolyState.message;
}

function drawMonopoly() {
  ctx.fillStyle = '#06111f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cellSize = tile;
  for (let i = 0; i < boardSize; i += 1) {
    const x = i % 4;
    const y = Math.floor(i / 4);
    ctx.fillStyle = '#0a162d';
    ctx.fillRect(x * cellSize * 2, y * cellSize * 2, cellSize * 2 - 6, cellSize * 2 - 6);
    ctx.strokeStyle = '#1f2d4b';
    ctx.strokeRect(x * cellSize * 2, y * cellSize * 2, cellSize * 2 - 6, cellSize * 2 - 6);
    ctx.fillStyle = '#9fb3d1';
    ctx.font = '14px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Space ${i + 1}`, x * cellSize * 2 + 10, y * cellSize * 2 + 10);
  }
  const pos = { x: (monopolyState.pos % 4) * cellSize * 2 + cellSize, y: Math.floor(monopolyState.pos / 4) * cellSize * 2 + cellSize };
  ctx.fillStyle = '#00d4ff';
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, tile / 2, 0, Math.PI * 2);
  ctx.fill();
}

function startGame() {
  if (currentGame === 'Snake') startSnake();
  if (currentGame === 'Chess') startChess();
  if (currentGame === 'Ludo') startLudo();
  if (currentGame === 'Monopoly') startMonopoly();
}

function pauseGame() {
  if (currentGame === 'Snake') pauseSnake();
  if (currentGame === 'Chess') pauseChess();
  if (currentGame === 'Ludo') statusEl.textContent = 'Ludo games do not pause.';
  if (currentGame === 'Monopoly') statusEl.textContent = 'Monopoly games do not pause.';
}

function restartGame() {
  resetCurrentGame();
  drawCurrentGame();
}

function startSnake() {
  if (snakeState.running) return;
  snakeState.running = true;
  paused = false;
  statusEl.textContent = 'Playing Snake';
  gameLoop = setInterval(stepSnake, 220);
}

function pauseSnake() {
  if (!snakeState.running) return;
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  statusEl.textContent = paused ? 'Snake paused' : 'Playing Snake';
  if (fsPauseBtn) fsPauseBtn.textContent = paused ? 'Resume' : 'Pause';
}

function startChess() {
  statusEl.textContent = 'Chess ready. Click a piece to move.';
}

function pauseChess() {
  paused = !paused;
  statusEl.textContent = paused ? 'Chess paused' : 'Chess ready';
}

function startLudo() {
  const roll = Math.floor(Math.random() * 6) + 1;
  ludoState.dice = roll;
  let tokenIndex = ludoState.positions.findIndex(pos => pos === -1);
  if (tokenIndex === -1) tokenIndex = 0;
  if (ludoState.positions[tokenIndex] === -1) {
    ludoState.positions[tokenIndex] = 0;
    ludoState.message = `Rolled ${roll}. Token ${tokenIndex + 1} entered the track.`;
  } else {
    ludoState.positions[tokenIndex] = Math.min(15, ludoState.positions[tokenIndex] + roll);
    ludoState.message = `Rolled ${roll}. Token ${tokenIndex + 1} moved.`;
  }
  scoreEl.textContent = roll;
  bestEl.textContent = tokenIndex + 1;
  speedEl.textContent = ludoState.positions[tokenIndex] + 1;
  statusEl.textContent = ludoState.message;
  drawLudo();
}

function startMonopoly() {
  const roll = Math.floor(Math.random() * 6) + 1;
  monopolyState.dice = roll;
  monopolyState.pos = (monopolyState.pos + roll) % boardSize;
  monopolyState.cash += roll * 10 - 20;
  monopolyState.message = `Rolled ${roll}. Moved to space ${monopolyState.pos + 1}.`;
  scoreEl.textContent = monopolyState.cash;
  bestEl.textContent = monopolyState.pos;
  speedEl.textContent = roll;
  statusEl.textContent = monopolyState.message;
  drawMonopoly();
}

function endCurrentGame(message) {
  snakeState.running = false;
  clearInterval(gameLoop);
  statusEl.textContent = message;
}

function handleCanvasClick(event) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) / tile);
  const y = Math.floor((event.clientY - rect.top) / tile);
  if (currentGame === 'Chess') handleChessClick(x, y);
}

function resetCurrentGame() {
  if (currentGame === 'Snake') resetSnake();
  if (currentGame === 'Chess') resetChess();
  if (currentGame === 'Ludo') resetLudo();
  if (currentGame === 'Monopoly') resetMonopoly();
}

function drawCurrentGame() {
  if (currentGame === 'Snake') drawSnake();
  if (currentGame === 'Chess') drawChess();
  if (currentGame === 'Ludo') drawLudo();
  if (currentGame === 'Monopoly') drawMonopoly();
}

function setGameMode(mode) {
  currentGame = mode;
  const meta = gameMeta[mode];
  boardSize = meta.size;
  updateTileSize();
  gameModeEl.textContent = mode;
  helpText.textContent = meta.help;
  arenaTitle.textContent = 'Game Arena';
  resetCurrentGame();
  drawCurrentGame();
  // On larger screens request fullscreen for immersive play; on small screens just fit to container
  try {
    if (window.innerWidth > 760) enterFullscreenMode();
    else fitCanvasToContainer();
  } catch (e) { /* ignore */ }
}

gameGrid.addEventListener('click', e => {
  const card = e.target.closest('.game-card');
  if (!card) return;
  document.querySelectorAll('.game-card').forEach(c => c.classList.remove('active'));
  card.classList.add('active');
  setGameMode(card.dataset.game);
});

createRoomBtn.onclick = () => {
  roomCodeEl.textContent = Math.random().toString(36).slice(2, 8).toUpperCase();
  playerCountEl.textContent = '1/4';
  readyStateEl.textContent = 'Waiting';
  statusEl.textContent = 'Room Created';
};

joinRoomBtn.onclick = () => {
  const code = prompt('Enter room code');
  if (code) {
    roomCodeEl.textContent = code.toUpperCase();
    statusEl.textContent = 'Room Joined';
    playerCountEl.textContent = '2/4';
    readyStateEl.textContent = 'Ready';
  }
};

startBtn.onclick = startGame;
pauseBtn.onclick = pauseGame;
restartBtn.onclick = restartGame;
canvas.addEventListener('click', handleCanvasClick);

// Fullscreen change handling to resize canvas and show/hide exit control

document.addEventListener('fullscreenchange', applyFullscreenSizing);
window.addEventListener('resize', () => {
  if (document.fullscreenElement) applyFullscreenSizing();
  else fitCanvasToContainer();
});

exitFsBtn.onclick = exitFullscreenMode;

// HUD button handlers
if (fsPauseBtn) fsPauseBtn.onclick = () => { pauseGame(); if (fsPauseBtn) fsPauseBtn.textContent = paused ? 'Resume' : 'Pause'; };
if (fsRestartBtn) fsRestartBtn.onclick = () => { restartGame(); };

resetCurrentGame();
drawCurrentGame();
