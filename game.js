/* ==========================================================================
   NEON SNAKE - GAME ENGINE & AUDIO SYNTHESIZER
   ========================================================================== */

(function () {
  'use strict';

  // --- Canvas Setup ---
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  // --- HUD Elements ---
  const currentScoreEl = document.getElementById('currentScore');
  const highScoreEl = document.getElementById('highScore');
  const comboBoxEl = document.getElementById('comboBox');
  const comboValueEl = document.getElementById('comboValue');
  const soundToggleBtn = document.getElementById('soundToggleBtn');
  const soundIconEl = document.getElementById('soundIcon');
  const pauseBtn = document.getElementById('pauseBtn');

  // --- Overlays & Modals ---
  const startOverlay = document.getElementById('startOverlay');
  const pauseOverlay = document.getElementById('pauseOverlay');
  const gameOverOverlay = document.getElementById('gameOverOverlay');

  const startBtn = document.getElementById('startBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  const restartBtnPause = document.getElementById('restartBtnPause');
  const playAgainBtn = document.getElementById('playAgainBtn');
  const mainMenuBtn = document.getElementById('mainMenuBtn');

  const touchControlsEl = document.querySelector('.touch-controls');

  function updateTouchControlsVisibility() {
    if (gameState === 'PLAYING') {
      touchControlsEl.classList.add('active');
    } else {
      touchControlsEl.classList.remove('active');
    }
  }

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
  let gameState = 'START'; // 'START', 'PLAYING', 'PAUSED', 'GAMEOVER'
  let speedInterval = 180; // Ms per tick (Medium default, halved speed)
  let wallMode = 'portal'; // 'portal' (wrap around) default as requested
  let obstacleCount = 0; // 0 for NONE, 4 for FEW, 8 for MANY
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
  let startTime = 0;
  let timeSurvived = 0;

  let lastTickTime = 0;
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
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.life -= p.decay;
      p.alpha = Math.max(0, p.life);

      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }
  }

  function drawParticles() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.shadowBlur = 10;
      ctx.shadowColor = p.color;
      ctx.fill();
    });
    ctx.restore();
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

    // Generate Obstacles
    obstacles = [];
    if (obstacleCount > 0) {
      let placed = 0;
      let attempts = 0;
      while (placed < obstacleCount && attempts < 200) {
        attempts++;
        const ox = Math.floor(Math.random() * GRID_COUNT);
        const oy = Math.floor(Math.random() * GRID_COUNT);

        // Keep 5x5 clear zone around snake spawn center
        if (Math.abs(ox - center) <= 2 && Math.abs(oy - center) <= 2) continue;

        // Prevent duplicate obstacles
        if (obstacles.some(o => o.x === ox && o.y === oy)) continue;

        obstacles.push({ x: ox, y: oy });
        placed++;
      }
    }

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

      // Chance to spawn bonus star every 4 food items
      if (foodEaten % 4 === 0 && !bonusFood.active) {
        spawnBonusFood();
      }
    } else if (bonusFood.active && head.x === bonusFood.x && head.y === bonusFood.y) {
      // Bonus food collision
      score += bonusFood.scoreVal * currentCombo;
      updateScoreDisplay();
      handleCombo();
      createExplosion(bonusFood.x, bonusFood.y, '#ffe600', 25);
      playBonusSound();
      bonusFood.active = false;
    } else {
      // Normal step - remove tail
      snake.pop();
    }

    // Update bonus timer
    if (bonusFood.active) {
      bonusFood.timer--;
      if (bonusFood.timer <= 0) {
        bonusFood.active = false;
      }
    }
  }

  function triggerGameOver() {
    gameState = 'GAMEOVER';
    updateTouchControlsVisibility();
    playGameOverSound();
    createExplosion(snake[0].x, snake[0].y, '#ff3366', 35);

    timeSurvived = Math.floor((Date.now() - startTime) / 1000);

    const isNewHigh = score > 0 && score >= highScore;
    newHighBadge.classList.toggle('hidden', !isNewHigh);

    finalScoreEl.textContent = score;
    finalFoodEl.textContent = foodEaten;
    finalComboEl.textContent = `x${maxCombo}`;
    finalTimeEl.textContent = `${timeSurvived}s`;

    setTimeout(() => {
      gameOverOverlay.classList.remove('hidden');
      gameOverOverlay.classList.add('active');
    }, 400);
  }

  // --- Rendering Graphics ---
  function render() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background grid lines
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID_COUNT; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_SIZE, 0);
      ctx.lineTo(i * CELL_SIZE, canvas.height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i * CELL_SIZE);
      ctx.lineTo(canvas.width, i * CELL_SIZE);
      ctx.stroke();
    }

    // Draw Obstacles (Glowing Red Hazard Blocks)
    if (obstacles.length > 0 && gameState !== 'START') {
      ctx.save();
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#ff3366';

      obstacles.forEach(obs => {
        const ox = obs.x * CELL_SIZE;
        const oy = obs.y * CELL_SIZE;

        // Block background
        ctx.fillStyle = 'rgba(255, 51, 102, 0.3)';
        ctx.strokeStyle = '#ff3366';
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        ctx.roundRect(ox + 2, oy + 2, CELL_SIZE - 4, CELL_SIZE - 4, 4);
        ctx.fill();
        ctx.stroke();

        // X hazard lines
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
    if (gameState !== 'START') {
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

      // Inner core
      ctx.beginPath();
      ctx.arc(fx - 2, fy - 2, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    }

    // Draw Bonus Food (Golden Star Orb with ring timer)
    if (bonusFood.active) {
      const bx = bonusFood.x * CELL_SIZE + CELL_SIZE / 2;
      const by = bonusFood.y * CELL_SIZE + CELL_SIZE / 2;

      ctx.save();
      ctx.shadowBlur = 22;
      ctx.shadowColor = '#ffe600';

      // Ring timer countdown
      const timerRatio = bonusFood.timer / bonusFood.maxTimer;
      ctx.beginPath();
      ctx.arc(bx, by, CELL_SIZE / 2 + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * timerRatio);
      ctx.strokeStyle = '#ffe600';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Center orb
      ctx.beginPath();
      ctx.arc(bx, by, CELL_SIZE / 2 - 2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe600';
      ctx.fill();

      // Inner white star highlight
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
          // Snake Head
          ctx.shadowBlur = 20;
          ctx.shadowColor = '#00f2fe';
          ctx.fillStyle = '#00f2fe';

          ctx.beginPath();
          ctx.roundRect(sx + 1, sy + 1, CELL_SIZE - 2, CELL_SIZE - 2, 8);
          ctx.fill();

          // Draw Eyes
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
          // Body segment with gradient transition from Cyan to Magenta
          const ratio = i / snake.length;
          ctx.shadowBlur = 8;
          ctx.shadowColor = ratio > 0.6 ? 'rgba(255, 0, 127, 0.6)' : 'rgba(0, 242, 254, 0.6)';

          // Dynamic segment color interpolation
          const r = Math.floor(0 + ratio * 255);
          const g = Math.floor(242 - ratio * 242);
          const b = Math.floor(254 - ratio * 127);
          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

          const shrink = Math.min(i * 0.4, 4);
          ctx.beginPath();
          ctx.roundRect(
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

    // Render Particle Explosions
    drawParticles();
  }

  // --- Main Animation Loop ---
  function gameLoop(timestamp) {
    if (!lastTickTime) lastTickTime = timestamp;
    const elapsed = timestamp - lastTickTime;

    if (elapsed >= speedInterval) {
      if (gameState === 'PLAYING') {
        updateGameStep();
      }
      lastTickTime = timestamp;
    }

    updateParticles();
    render();

    animationFrameId = requestAnimationFrame(gameLoop);
  }

  // --- Input Handlers ---
  function changeDirection(newDir) {
    if (gameState !== 'PLAYING') return;

    // Prevent 180-degree reverse turn
    if (newDir.x === -direction.x && newDir.y === -direction.y) return;

    // Buffer turn
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
        if (gameState === 'PLAYING' || gameState === 'PAUSED' || gameState === 'GAMEOVER') {
          startGame();
        }
        break;
    }
  });

  // --- Touch D-Pad Controls ---
  document.getElementById('btnUp').addEventListener('click', () => changeDirection({ x: 0, y: -1 }));
  document.getElementById('btnDown').addEventListener('click', () => changeDirection({ x: 0, y: 1 }));
  document.getElementById('btnLeft').addEventListener('click', () => changeDirection({ x: -1, y: 0 }));
  document.getElementById('btnRight').addEventListener('click', () => changeDirection({ x: 1, y: 0 }));

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
    startTime = Date.now();
    updateTouchControlsVisibility();

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
      updateTouchControlsVisibility();
      pauseOverlay.classList.remove('hidden');
      pauseOverlay.classList.add('active');
    } else if (gameState === 'PAUSED') {
      gameState = 'PLAYING';
      updateTouchControlsVisibility();
      pauseOverlay.classList.remove('active');
      pauseOverlay.classList.add('hidden');
    }
  }

  startBtn.addEventListener('click', () => {
    playButtonClick();
    startGame();
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
    startGame();
  });

  mainMenuBtn.addEventListener('click', () => {
    playButtonClick();
    gameState = 'START';
    updateTouchControlsVisibility();
    gameOverOverlay.classList.remove('active');
    gameOverOverlay.classList.add('hidden');
    startOverlay.classList.remove('hidden');
    startOverlay.classList.add('active');
  });

  // Load Highscore display on start
  highScoreEl.textContent = String(highScore).padStart(4, '0');

  // Start Animation Loop
  animationFrameId = requestAnimationFrame(gameLoop);

})();
