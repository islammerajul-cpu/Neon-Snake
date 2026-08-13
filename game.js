/* ==========================================================================
   NEON SNAKE - CLASSIC CYBERPUNK ARCADE ENGINE
   ========================================================================== */

(function () {
  'use strict';

  // --- Canvas Setup ---
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  // --- Universal rounded rectangle drawing ---
  function drawRoundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // --- HUD Elements ---
  const currentScoreEl = document.getElementById('currentScore');
  const highScoreEl = document.getElementById('highScore');
  const comboBoxEl = document.getElementById('comboBox');
  const comboValueEl = document.getElementById('comboValue');
  const soundToggleBtn = document.getElementById('soundToggleBtn');
  const soundIconEl = document.getElementById('soundIcon');
  const pauseBtn = document.getElementById('pauseBtn');
  const settingsBtn = document.getElementById('settingsBtn');

  // --- Overlays & Modals ---
  const startOverlay = document.getElementById('startOverlay');
  const pauseOverlay = document.getElementById('pauseOverlay');
  const gameOverOverlay = document.getElementById('gameOverOverlay');

  const startBtn = document.getElementById('startBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  const restartBtnPause = document.getElementById('restartBtnPause');
  const playAgainBtn = document.getElementById('playAgainBtn');

  const touchControlsEl = document.querySelector('.touch-controls');

  // --- Stat Displays ---
  const finalScoreEl = document.getElementById('finalScore');
  const finalFoodEl = document.getElementById('finalFood');
  const finalComboEl = document.getElementById('finalCombo');
  const finalTimeEl = document.getElementById('finalTime');
  const newHighBadge = document.getElementById('newHighBadge');

  // --- Selectors ---
  const diffBtns = document.querySelectorAll('.diff-btn');
  const modeBtns = document.querySelectorAll('.mode-btn');
  const obsBtns = document.querySelectorAll('.obs-btn');

  // --- Game Grid Configuration ---
  const GRID_COUNT = 24; // 24x24 grid
  const CELL_SIZE = canvas.width / GRID_COUNT; // 25px per cell

  // --- Game State Variables ---
  let gameState = 'PLAYING'; // 'PLAYING', 'PAUSED', 'GAMEOVER'
  let speedInterval = 180; // Ms per tick (Medium default)
  let wallMode = 'portal'; // 'portal' (wrap around) default
  let obstacleCount = 0; // 0 for OFF, 4 for FEW, 8 for MANY
  let obstacles = [];
  let soundEnabled = localStorage.getItem('neon_snake_sound') !== 'false';

  let snake = [];
  let direction = { x: 1, y: 0 };
  let nextDirection = { x: 1, y: 0 };

  let food = { x: 0, y: 0 };
  let bonusFood = { x: 0, y: 0, active: false, timer: 0, maxTimer: 140, scoreVal: 40 };

  let particles = [];
  let score = 0;
  let highScore = parseInt(localStorage.getItem('neon_snake_highscore') || '0', 10);
  let foodEaten = 0;
  let currentCombo = 1;
  let comboTimer = null;
  let maxCombo = 1;
  let startTime = Date.now();
  let timeSurvived = 0;

  let gameTickInterval = null;
  let animationFrameId = null;

  // --- Web Audio API Synthesizer ---
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, type, duration, startGain = 0.1, endGain = 0.001) {
    if (!soundEnabled || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

      gain.gain.setValueAtTime(startGain, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(endGain, audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      console.error(e);
    }
  }

  function playEatSound() {
    if (!soundEnabled || !audioCtx) return;
    initAudio();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.08);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(now + 0.08);
  }

  function playBonusSound() {
    if (!soundEnabled || !audioCtx) return;
    initAudio();
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        playTone(freq, 'triangle', 0.1, 0.15, 0.01);
      }, idx * 45);
    });
  }

  function playTurnSound() {
    playTone(180, 'sine', 0.03, 0.04, 0.001);
  }

  function playGameOverSound() {
    if (!soundEnabled || !audioCtx) return;
    initAudio();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(350, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.45);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(now + 0.45);
  }

  function playButtonClick() {
    playTone(400, 'sine', 0.04, 0.05, 0.001);
  }

  // --- Sound HUD Updates ---
  function updateSoundIcon() {
    soundIconEl.textContent = soundEnabled ? '🔊' : '🔇';
    soundToggleBtn.setAttribute('title', soundEnabled ? 'Mute Sound (M)' : 'Unmute Sound (M)');
  }
  updateSoundIcon();

  soundToggleBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem('neon_snake_sound', soundEnabled);
    updateSoundIcon();
    if (soundEnabled) initAudio();
  });

  // --- Settings Selectors ---
  diffBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      diffBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      speedInterval = parseInt(btn.dataset.speed, 10);
      startGameTimer();
      playButtonClick();
    });
  });

  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      wallMode = btn.dataset.mode;
      playButtonClick();
    });
  });

  obsBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      obsBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const val = btn.dataset.obs;
      obstacleCount = val === 'few' ? 4 : (val === 'many' ? 8 : 0);
      generateObstacles(obstacleCount);
      playButtonClick();
    });
  });

  // --- Particle Physics System ---
  function createExplosion(cellX, cellY, color, count = 18) {
    const px = cellX * CELL_SIZE + CELL_SIZE / 2;
    const py = cellY * CELL_SIZE + CELL_SIZE / 2;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4 + 1.5;
      particles.push({
        x: px,
        y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: color,
        size: Math.random() * 4 + 2,
        alpha: 1,
        life: 1,
        decay: Math.random() * 0.03 + 0.025
      });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      p.alpha = Math.max(0, p.life);

      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }
  }

  function drawParticles() {
    ctx.save();
    particles.forEach(p => {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = p.color;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  // --- Obstacle Generation ---
  function generateObstacles(count) {
    obstacles = [];
    if (count <= 0) return;

    const center = Math.floor(GRID_COUNT / 2);
    let attempts = 0;
    while (obstacles.length < count && attempts < 200) {
      attempts++;
      const rx = Math.floor(Math.random() * (GRID_COUNT - 4)) + 2;
      const ry = Math.floor(Math.random() * (GRID_COUNT - 4)) + 2;

      // Keep center clear for snake spawn
      if (Math.abs(rx - center) <= 2 && Math.abs(ry - center) <= 2) continue;

      if (!obstacles.some(o => o.x === rx && o.y === ry)) {
        obstacles.push({ x: rx, y: ry });
      }
    }
  }

  // --- Game Engine Functions ---
  function resetGame() {
    const center = Math.floor(GRID_COUNT / 2);
    snake = [
      { x: center, y: center },
      { x: center - 1, y: center },
      { x: center - 2, y: center }
    ];
    direction = { x: 1, y: 0 };
    nextDirection = { x: 1, y: 0 };

    score = 0;
    foodEaten = 0;
    currentCombo = 1;
    maxCombo = 1;
    particles = [];
    bonusFood.active = false;
    startTime = Date.now();

    generateObstacles(obstacleCount);
    updateScoreDisplay();
    spawnFood();

    highScoreEl.textContent = String(highScore).padStart(4, '0');
  }

  function spawnFood() {
    let valid = false;
    while (!valid) {
      const fx = Math.floor(Math.random() * GRID_COUNT);
      const fy = Math.floor(Math.random() * GRID_COUNT);

      const isSnake = snake.some(segment => segment.x === fx && segment.y === fy);
      const isObstacle = obstacles.some(o => o.x === fx && o.y === fy);

      valid = !isSnake && !isObstacle;
      if (valid) {
        food = { x: fx, y: fy };
      }
    }
  }

  function spawnBonusFood() {
    let valid = false;
    while (!valid) {
      const bx = Math.floor(Math.random() * GRID_COUNT);
      const by = Math.floor(Math.random() * GRID_COUNT);

      const isSnake = snake.some(s => s.x === bx && s.y === by);
      const isFood = food.x === bx && food.y === by;
      const isObstacle = obstacles.some(o => o.x === bx && o.y === by);

      if (!isSnake && !isFood && !isObstacle) {
        bonusFood.x = bx;
        bonusFood.y = by;
        bonusFood.active = true;
        bonusFood.timer = bonusFood.maxTimer;
        valid = true;
      }
    }
  }

  function updateScoreDisplay() {
    currentScoreEl.textContent = String(score).padStart(4, '0');

    if (score > highScore) {
      highScore = score;
      localStorage.setItem('neon_snake_highscore', highScore);
      highScoreEl.textContent = String(highScore).padStart(4, '0');
    }
  }

  function handleCombo() {
    currentCombo++;
    if (currentCombo > maxCombo) maxCombo = currentCombo;
    
    comboValueEl.textContent = `x${currentCombo}`;
    comboBoxEl.style.display = 'flex';

    if (comboTimer) clearTimeout(comboTimer);
    comboTimer = setTimeout(() => {
      currentCombo = 1;
      comboBoxEl.style.display = 'none';
    }, 4500);
  }

  // --- Movement & Collision Step ---
  function updateGameStep() {
    if (gameState !== 'PLAYING') return;

    direction = { ...nextDirection };

    const head = { ...snake[0] };
    head.x += direction.x;
    head.y += direction.y;

    // Wall collision handling
    if (wallMode === 'portal') {
      if (head.x < 0) head.x = GRID_COUNT - 1;
      if (head.x >= GRID_COUNT) head.x = 0;
      if (head.y < 0) head.y = GRID_COUNT - 1;
      if (head.y >= GRID_COUNT) head.y = 0;
    } else {
      if (head.x < 0 || head.x >= GRID_COUNT || head.y < 0 || head.y >= GRID_COUNT) {
        triggerGameOver();
        return;
      }
    }

    // Self collision
    if (snake.some(segment => segment.x === head.x && segment.y === head.y)) {
      triggerGameOver();
      return;
    }

    // Obstacle collision
    if (obstacles.some(obs => obs.x === head.x && obs.y === head.y)) {
      triggerGameOver();
      return;
    }

    // Move head forward
    snake.unshift(head);

    // Check regular food collision
    if (head.x === food.x && head.y === food.y) {
      foodEaten++;
      const earned = 10 * currentCombo;
      score += earned;

      updateScoreDisplay();
      handleCombo();
      createExplosion(food.x, food.y, '#ff007f', 16);
      playEatSound();

      spawnFood();

      if (foodEaten % 4 === 0 && !bonusFood.active) {
        spawnBonusFood();
      }
    } else if (bonusFood.active && head.x === bonusFood.x && head.y === bonusFood.y) {
      score += bonusFood.scoreVal * currentCombo;
      updateScoreDisplay();
      handleCombo();
      createExplosion(bonusFood.x, bonusFood.y, '#ffe600', 25);
      playBonusSound();
      bonusFood.active = false;
    } else {
      snake.pop();
    }

    if (bonusFood.active) {
      bonusFood.timer--;
      if (bonusFood.timer <= 0) {
        bonusFood.active = false;
      }
    }
  }

  function triggerGameOver() {
    gameState = 'GAMEOVER';
    playGameOverSound();
    createExplosion(snake[0].x, snake[0].y, '#ff3366', 35);

    timeSurvived = Math.floor((Date.now() - startTime) / 1000);

    const isNewRecord = score > 0 && score >= highScore;
    newHighBadge.classList.toggle('hidden', !isNewRecord);

    finalScoreEl.textContent = score;
    finalFoodEl.textContent = foodEaten;
    finalComboEl.textContent = `x${maxCombo}`;
    finalTimeEl.textContent = `${timeSurvived}s`;

    setTimeout(() => {
      gameOverOverlay.classList.remove('hidden');
      gameOverOverlay.classList.add('active');
    }, 400);
  }

  // --- Rendering Pipeline ---
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Grid Lines (Subtle Cyberpunk Grid)
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID_COUNT; i++) {
      const pos = i * CELL_SIZE;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, canvas.height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(canvas.width, pos);
      ctx.stroke();
    }

    // Draw Obstacles (Glowing Red Hazard Blocks)
    if (obstacles.length > 0) {
      ctx.save();
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#ff3366';

      obstacles.forEach(obs => {
        const ox = obs.x * CELL_SIZE;
        const oy = obs.y * CELL_SIZE;

        ctx.fillStyle = 'rgba(255, 51, 102, 0.3)';
        ctx.strokeStyle = '#ff3366';
        ctx.lineWidth = 1.5;

        drawRoundRect(ctx, ox + 2, oy + 2, CELL_SIZE - 4, CELL_SIZE - 4, 4);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(ox + 6, oy + 6);
        ctx.lineTo(ox + CELL_SIZE - 6, oy + CELL_SIZE - 6);
        ctx.moveTo(ox + CELL_SIZE - 6, oy + 6);
        ctx.lineTo(ox + 6, oy + CELL_SIZE - 6);
        ctx.stroke();
      });
      ctx.restore();
    }

    // Draw Regular Food (Glowing Pink Orb)
    const fx = food.x * CELL_SIZE + CELL_SIZE / 2;
    const fy = food.y * CELL_SIZE + CELL_SIZE / 2;
    const pulse = Math.sin(Date.now() * 0.008) * 2;

    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#ff007f';

    ctx.beginPath();
    ctx.arc(fx, fy, (CELL_SIZE / 2 - 3) + pulse, 0, Math.PI * 2);
    ctx.fillStyle = '#ff007f';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(fx - 2, fy - 2, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    // Draw Bonus Food (Golden Star Orb with ring timer)
    if (bonusFood.active) {
      const bx = bonusFood.x * CELL_SIZE + CELL_SIZE / 2;
      const by = bonusFood.y * CELL_SIZE + CELL_SIZE / 2;

      ctx.save();
      ctx.shadowBlur = 22;
      ctx.shadowColor = '#ffe600';

      const timerRatio = bonusFood.timer / bonusFood.maxTimer;
      ctx.beginPath();
      ctx.arc(bx, by, CELL_SIZE / 2 + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * timerRatio);
      ctx.strokeStyle = '#ffe600';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(bx, by, CELL_SIZE / 2 - 2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe600';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(bx, by, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.restore();
    }

    // Draw Snake Segments
    if (snake.length > 0) {
      ctx.save();
      for (let i = snake.length - 1; i >= 0; i--) {
        const seg = snake[i];
        const sx = seg.x * CELL_SIZE;
        const sy = seg.y * CELL_SIZE;

        const isHead = i === 0;

        if (isHead) {
          ctx.shadowBlur = 20;
          ctx.shadowColor = '#00f2fe';
          ctx.fillStyle = '#00f2fe';

          drawRoundRect(ctx, sx + 1, sy + 1, CELL_SIZE - 2, CELL_SIZE - 2, 8);
          ctx.fill();

          ctx.fillStyle = '#070a13';
          const eyeSize = 3.5;
          let eye1 = { x: 0, y: 0 };
          let eye2 = { x: 0, y: 0 };

          if (direction.x === 1) {
            eye1 = { x: sx + CELL_SIZE - 6, y: sy + 6 };
            eye2 = { x: sx + CELL_SIZE - 6, y: sy + CELL_SIZE - 9 };
          } else if (direction.x === -1) {
            eye1 = { x: sx + 6, y: sy + 6 };
            eye2 = { x: sx + 6, y: sy + CELL_SIZE - 9 };
          } else if (direction.y === -1) {
            eye1 = { x: sx + 6, y: sy + 6 };
            eye2 = { x: sx + CELL_SIZE - 9, y: sy + 6 };
          } else {
            eye1 = { x: sx + 6, y: sy + CELL_SIZE - 6 };
            eye2 = { x: sx + CELL_SIZE - 9, y: sy + CELL_SIZE - 6 };
          }

          ctx.beginPath();
          ctx.arc(eye1.x, eye1.y, eyeSize, 0, Math.PI * 2);
          ctx.arc(eye2.x, eye2.y, eyeSize, 0, Math.PI * 2);
          ctx.fill();

        } else {
          const ratio = i / snake.length;
          ctx.shadowBlur = 8;
          ctx.shadowColor = ratio > 0.6 ? 'rgba(255, 0, 127, 0.6)' : 'rgba(0, 242, 254, 0.6)';

          const r = Math.floor(0 + ratio * 255);
          const g = Math.floor(242 - ratio * 242);
          const b = Math.floor(254 - ratio * 127);
          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

          const shrink = Math.min(i * 0.4, 4);
          drawRoundRect(
            ctx,
            sx + 1 + shrink / 2,
            sy + 1 + shrink / 2,
            CELL_SIZE - 2 - shrink,
            CELL_SIZE - 2 - shrink,
            6
          );
          ctx.fill();
        }
      }
      ctx.restore();
    }

    drawParticles();
  }

  // --- Dedicated Game Movement Ticker & Render Loop ---
  function startGameTimer() {
    if (gameTickInterval) clearInterval(gameTickInterval);
    gameTickInterval = setInterval(() => {
      if (gameState === 'PLAYING') {
        updateGameStep();
      }
    }, speedInterval);
  }

  function gameLoop() {
    updateParticles();
    render();
    animationFrameId = requestAnimationFrame(gameLoop);
  }

  // --- Input Handlers ---
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      playButtonClick();
      if (gameState === 'PLAYING') {
        gameState = 'PAUSED';
        startOverlay.classList.remove('hidden');
        startOverlay.classList.add('active');
      } else {
        startOverlay.classList.remove('active');
        startOverlay.classList.add('hidden');
        gameState = 'PLAYING';
      }
    });
  }

  function changeDirection(newDir) {
    initAudio();

    if (gameState === 'GAMEOVER') {
      gameOverOverlay.classList.remove('active');
      gameOverOverlay.classList.add('hidden');
      resetGame();
      gameState = 'PLAYING';
      return;
    }

    if (gameState !== 'PLAYING') return;

    if (newDir.x === -direction.x && newDir.y === -direction.y) return;

    if (newDir.x !== nextDirection.x || newDir.y !== nextDirection.y) {
      nextDirection = newDir;
      playTurnSound();
    }
  }

  window.addEventListener('keydown', (e) => {
    initAudio();

    switch (e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        e.preventDefault();
        changeDirection({ x: 0, y: -1 });
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        e.preventDefault();
        changeDirection({ x: 0, y: 1 });
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        e.preventDefault();
        changeDirection({ x: -1, y: 0 });
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault();
        changeDirection({ x: 1, y: 0 });
        break;
      case ' ':
        e.preventDefault();
        togglePause();
        break;
      case 'm':
      case 'M':
        soundToggleBtn.click();
        break;
      case 'r':
      case 'R':
        resetGame();
        gameState = 'PLAYING';
        break;
    }
  });

  // --- Touch D-Pad Controls (Instant Touch & Click) ---
  const handleDpadInput = (dir) => {
    initAudio();
    changeDirection(dir);
  };

  const dpadMap = {
    btnUp: { x: 0, y: -1 },
    btnDown: { x: 0, y: 1 },
    btnLeft: { x: -1, y: 0 },
    btnRight: { x: 1, y: 0 }
  };

  Object.keys(dpadMap).forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        handleDpadInput(dpadMap[id]);
      });
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleDpadInput(dpadMap[id]);
      }, { passive: false });
    }
  });

  // Touch Swipe Gesture on Canvas
  let touchStartX = 0;
  let touchStartY = 0;

  canvas.addEventListener('touchstart', (e) => {
    initAudio();
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  canvas.addEventListener('touchend', (e) => {
    if (!touchStartX || !touchStartY) return;
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;

    const dx = touchEndX - touchStartX;
    const dy = touchEndY - touchStartY;

    if (Math.abs(dx) > 30 || Math.abs(dy) > 30) {
      if (Math.abs(dx) > Math.abs(dy)) {
        changeDirection({ x: dx > 0 ? 1 : -1, y: 0 });
      } else {
        changeDirection({ x: 0, y: dy > 0 ? 1 : -1 });
      }
    }
    touchStartX = 0;
    touchStartY = 0;
  }, { passive: true });

  // --- Overlay Actions & Game States ---
  function startGame() {
    initAudio();
    resetGame();
    gameState = 'PLAYING';

    startOverlay.classList.remove('active');
    startOverlay.classList.add('hidden');
    pauseOverlay.classList.remove('active');
    pauseOverlay.classList.add('hidden');
    gameOverOverlay.classList.remove('active');
    gameOverOverlay.classList.add('hidden');
  }

  function togglePause() {
    if (gameState === 'PLAYING') {
      gameState = 'PAUSED';
      pauseOverlay.classList.remove('hidden');
      pauseOverlay.classList.add('active');
    } else if (gameState === 'PAUSED') {
      gameState = 'PLAYING';
      pauseOverlay.classList.remove('active');
      pauseOverlay.classList.add('hidden');
    }
  }

  startBtn.addEventListener('click', () => {
    playButtonClick();
    startOverlay.classList.remove('active');
    startOverlay.classList.add('hidden');
    gameState = 'PLAYING';
  });

  pauseBtn.addEventListener('click', () => {
    playButtonClick();
    togglePause();
  });

  resumeBtn.addEventListener('click', () => {
    playButtonClick();
    togglePause();
  });

  restartBtnPause.addEventListener('click', () => {
    playButtonClick();
    startGame();
  });

  playAgainBtn.addEventListener('click', () => {
    playButtonClick();
    gameOverOverlay.classList.remove('active');
    gameOverOverlay.classList.add('hidden');
    resetGame();
    gameState = 'PLAYING';
  });

  // Load Highscore and initialize game ticker on load
  highScoreEl.textContent = String(highScore).padStart(4, '0');
  resetGame();
  startGameTimer();

  // Start Animation Loop
  animationFrameId = requestAnimationFrame(gameLoop);

})();
