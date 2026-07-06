// --- DOM Elements ---
const drawCanvas = document.getElementById('drawCanvas');
const drawCtx = drawCanvas.getContext('2d');
const previewCanvas = document.getElementById('previewCanvas');
const previewCtx = previewCanvas.getContext('2d');
const gameCanvas = document.getElementById('gameCanvas');
const gameCtx = gameCanvas.getContext('2d');

const colorSwatches = document.querySelectorAll('.color-swatch');
const clearBtn = document.getElementById('clearBtn');
const saveBtn = document.getElementById('saveBtn');
const playBtn = document.getElementById('playBtn');
const statusText = document.getElementById('statusText');
const eraBtns = document.querySelectorAll('.era-btn');
const laneBtns = document.querySelectorAll('.lane-controls button');
const scoreEl = document.getElementById('score');
const coinsEl = document.getElementById('coins');
const bestScoreEl = document.getElementById('bestScore');
const gameOverOverlay = document.getElementById('gameOverOverlay');
const finalScoreEl = document.getElementById('finalScore');
const restartBtn = document.getElementById('restartBtn');

// --- State Variables ---
let currentColor = '#111827';
let isDrawing = false;
let characterImage = null; // Will store the Image object

// Game state
let gameState = 'idle'; // idle, playing, gameover
let score = 0;
let coins = 0;
let bestScore = localStorage.getItem('doodleQuestBest') || 0;
let currentEra = 'prehistoric';
let speed = 4; // base speed
bestScoreEl.textContent = bestScore;

// Player state
const player = {
  lane: 0, // -1, 0, 1
  width: 80,
  height: 80,
  y: gameCanvas.height - 120,
  targetX: gameCanvas.width / 2 - 40,
  x: gameCanvas.width / 2 - 40, // current x for smoothing
};

const LANE_WIDTH = gameCanvas.width / 3;

// Objects
let obstacles = [];
let pickups = [];
let lastSpawnTime = 0;
let spawnInterval = 1500;
let animationFrameId;

// --- Era Configurations ---
const ERAS = {
  prehistoric: {
    bg: '#451a03', // dark brown
    laneLines: '#78350f',
    obstacleEmojis: ['🌲'] // Only Trees
  },
  medieval: {
    bg: '#1e293b', // slate
    laneLines: '#334155',
    obstacleEmojis: ['🐦'] // Only Birds
  },
  future: {
    bg: '#2563eb', // Brighter futuristic blue so character is very visible
    laneLines: '#67e8f9', // Bright neon cyan lines
    obstacleEmojis: ['🚗'] // Only Cars
  }
};

// --- Drawing Module ---
function setupDrawing() {
  drawCtx.lineCap = 'round';
  drawCtx.lineJoin = 'round';
  drawCtx.lineWidth = 16;
  
  // Leave background transparent so it doesn't cover game
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

  const startPosition = (e) => {
    isDrawing = true;
    draw(e);
  };

  const endPosition = () => {
    isDrawing = false;
    drawCtx.beginPath();
  };

  const draw = (e) => {
    if (!isDrawing) return;

    const rect = drawCanvas.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    drawCtx.lineTo(x, y);
    drawCtx.strokeStyle = currentColor;
    drawCtx.stroke();
    drawCtx.beginPath();
    drawCtx.moveTo(x, y);
  };

  drawCanvas.addEventListener('mousedown', startPosition);
  drawCanvas.addEventListener('mouseup', endPosition);
  drawCanvas.addEventListener('mousemove', draw);
  drawCanvas.addEventListener('mouseout', endPosition);
  
  drawCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startPosition(e);
  }, {passive: false});
  drawCanvas.addEventListener('touchend', endPosition);
  drawCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    draw(e);
  }, {passive: false});

  // Color Palette
  colorSwatches.forEach(swatch => {
    swatch.addEventListener('click', (e) => {
      document.querySelector('.color-swatch.active').classList.remove('active');
      e.target.classList.add('active');
      currentColor = e.target.dataset.color;
    });
  });

  // Controls
  clearBtn.addEventListener('click', () => {
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    characterImage = null;
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    statusText.textContent = 'Cleared! Draw something new.';
    statusText.style.color = '#f59e0b';
  });

  saveBtn.addEventListener('click', () => {
    const dataURL = drawCanvas.toDataURL();
    const img = new Image();
    img.onload = () => {
      characterImage = img;
      // Draw to preview
      previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      previewCtx.drawImage(img, 0, 0, previewCanvas.width, previewCanvas.height);
      statusText.textContent = 'Character Saved! Ready to run.';
      statusText.style.color = '#10b981';
    };
    img.src = dataURL;
  });
}

// --- Game Engine ---

function setEra(era) {
  currentEra = era;
  document.querySelector('.era-btn.active').classList.remove('active');
  document.querySelector(`[data-era="${era}"]`).classList.add('active');
  drawGame(); // Redraw if idle
}

eraBtns.forEach(btn => {
  btn.addEventListener('click', (e) => setEra(e.target.dataset.era));
});

function spawnEntity() {
  const time = Date.now();
  if (time - lastSpawnTime > spawnInterval) {
    lastSpawnTime = time;
    
    // Pick random lane
    const lane = Math.floor(Math.random() * 3) - 1; // -1, 0, 1
    
    // 20% chance for a coin, 80% for obstacle
    if (Math.random() < 0.2) {
      pickups.push({
        lane: lane,
        y: -50,
        width: 30,
        height: 30,
        type: 'coin'
      });
    } else {
      const emojis = ERAS[currentEra].obstacleEmojis;
      obstacles.push({
        lane: lane,
        y: -50,
        width: 40,
        height: 40,
        emoji: emojis[Math.floor(Math.random() * emojis.length)]
      });
    }

    // Speed up slightly over time
    if (speed < 12) {
      speed += 0.1;
      spawnInterval = Math.max(600, spawnInterval - 20);
    }
  }
}

function getLaneCenterX(laneIndex) {
  // laneIndex is -1, 0, 1
  const centerLane = gameCanvas.width / 2;
  return centerLane + (laneIndex * LANE_WIDTH);
}

function updateGame() {
  if (gameState !== 'playing') return;

  // Smooth player movement
  player.targetX = getLaneCenterX(player.lane) - (player.width / 2);
  player.x += (player.targetX - player.x) * 0.2;

  // Move entities
  for (let i = obstacles.length - 1; i >= 0; i--) {
    let obs = obstacles[i];
    obs.y += speed;
    
    // Collision detection
    let obsX = getLaneCenterX(obs.lane) - (obs.width/2);
    if (
      player.x < obsX + obs.width &&
      player.x + player.width > obsX &&
      player.y < obs.y + obs.height &&
      player.y + player.height > obs.y
    ) {
      gameOver();
    }

    // Remove if off screen
    if (obs.y > gameCanvas.height) {
      obstacles.splice(i, 1);
      score += 10;
      scoreEl.textContent = score;
    }
  }

  for (let i = pickups.length - 1; i >= 0; i--) {
    let coin = pickups[i];
    coin.y += speed;
    
    // Collision detection
    let coinX = getLaneCenterX(coin.lane) - (coin.width/2);
    if (
      player.x < coinX + coin.width &&
      player.x + player.width > coinX &&
      player.y < coin.y + coin.height &&
      player.y + player.height > coin.y
    ) {
      pickups.splice(i, 1);
      coins++;
      coinsEl.textContent = coins;
      score += 50;
      scoreEl.textContent = score;
    } else if (coin.y > gameCanvas.height) {
      pickups.splice(i, 1);
    }
  }

  spawnEntity();
}

function drawGame() {
  const era = ERAS[currentEra];
  
  // Draw Background
  gameCtx.fillStyle = era.bg;
  gameCtx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

  // Draw Lane Dividers
  gameCtx.strokeStyle = era.laneLines;
  gameCtx.lineWidth = 4;
  gameCtx.setLineDash([20, 20]); // dashed lines
  
  const drawLine = (x) => {
    gameCtx.beginPath();
    // Move lines downwards to simulate speed
    let offset = gameState === 'playing' ? (Date.now() / 20 * speed) % 40 : 0;
    gameCtx.moveTo(x, -offset);
    gameCtx.lineTo(x, gameCanvas.height);
    gameCtx.stroke();
  };

  drawLine(LANE_WIDTH);
  drawLine(LANE_WIDTH * 2);
  gameCtx.setLineDash([]); // reset

  // Draw Player
  if (characterImage) {
    // Draw a "force field" bubble behind the character so it NEVER blends into the background
    gameCtx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    gameCtx.beginPath();
    gameCtx.arc(player.x + player.width/2, player.y + player.height/2, player.width/2 + 5, 0, Math.PI * 2);
    gameCtx.fill();
    
    // Draw the character itself
    gameCtx.shadowColor = 'rgba(255, 255, 255, 0.8)';
    gameCtx.shadowBlur = 10;
    gameCtx.drawImage(characterImage, player.x, player.y, player.width, player.height);
    gameCtx.shadowBlur = 0;
  } else {
    // Fallback if they didn't save
    gameCtx.fillStyle = '#ffffff';
    gameCtx.fillRect(player.x, player.y, player.width, player.height);
  }

  // Draw Obstacles
  obstacles.forEach(obs => {
    let obsX = getLaneCenterX(obs.lane) - (obs.width/2);
    
    // Draw emoji
    gameCtx.font = '36px Arial';
    gameCtx.textAlign = 'center';
    gameCtx.textBaseline = 'middle';
    // Small shadow for visibility
    gameCtx.shadowBlur = 5;
    gameCtx.shadowColor = 'rgba(0,0,0,0.5)';
    gameCtx.fillText(obs.emoji, obsX + obs.width/2, obs.y + obs.height/2);
    gameCtx.shadowBlur = 0;
  });

  // Draw Coins
  pickups.forEach(coin => {
    let coinX = getLaneCenterX(coin.lane) - (coin.width/2);
    gameCtx.fillStyle = '#fbbf24'; // yellow
    gameCtx.beginPath();
    gameCtx.arc(coinX + coin.width/2, coin.y + coin.height/2, coin.width/2, 0, Math.PI * 2);
    gameCtx.fill();
    
    // Coin shine
    gameCtx.fillStyle = '#fef3c7';
    gameCtx.beginPath();
    gameCtx.arc(coinX + coin.width/2 - 4, coin.y + coin.height/2 - 4, 4, 0, Math.PI * 2);
    gameCtx.fill();
  });
}

function gameLoop() {
  updateGame();
  drawGame();
  
  if (gameState === 'playing') {
    animationFrameId = requestAnimationFrame(gameLoop);
  }
}

function startGame() {
  if (!characterImage) {
    statusText.textContent = 'Please save your character first!';
    statusText.style.color = '#ef4444';
    alert("Please draw your character and click 'Save Character' first!");
    return;
  }
  
  score = 0;
  speed = 4;
  spawnInterval = 1500;
  obstacles = [];
  pickups = [];
  player.lane = 0;
  player.x = getLaneCenterX(0) - (player.width / 2);
  
  scoreEl.textContent = score;
  gameOverOverlay.classList.add('hidden');
  
  gameState = 'playing';
  lastSpawnTime = Date.now();
  
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  gameLoop();
}

function gameOver() {
  gameState = 'gameover';
  finalScoreEl.textContent = score;
  gameOverOverlay.classList.remove('hidden');
  
  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem('doodleQuestBest', bestScore);
    bestScoreEl.textContent = bestScore;
  }
}

// Controls
playBtn.addEventListener('click', () => {
  // scroll to game panel on mobile
  document.querySelector('.game-panel').scrollIntoView({ behavior: 'smooth' });
  startGame();
});

restartBtn.addEventListener('click', startGame);

laneBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    if (gameState !== 'playing') return;
    const dir = parseInt(e.target.dataset.lane);
    
    if (dir === -1 && player.lane > -1) player.lane--;
    else if (dir === 1 && player.lane < 1) player.lane++;
  });
});

// Keyboard controls
document.addEventListener('keydown', (e) => {
  if (gameState !== 'playing') return;
  if (e.key === 'ArrowLeft' || e.key === 'a') {
    if (player.lane > -1) player.lane--;
  } else if (e.key === 'ArrowRight' || e.key === 'd') {
    if (player.lane < 1) player.lane++;
  }
});

// Init
setupDrawing();
// Draw initial empty game state
drawGame();
