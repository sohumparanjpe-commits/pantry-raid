document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const miniCanvas = document.getElementById("minimap");
  const miniCtx = miniCanvas.getContext("2d");
  const TILE_SIZE = 32;

  // 1. DETERMINISTIC INFINITE PROCEDURAL MAZE
  function pseudoRandom(x, y) {
    let n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }
  function getTileAt(x, y) {
    if (Math.abs(x) <= 2 && Math.abs(y) <= 2) return 0;
    if (x % 2 === 0 && y % 2 === 0) return 1;
    if (x % 2 === 0 || y % 2 === 0) {
      return pseudoRandom(x, y) < 0.35 ? 1 : 0;
    }
    return 0;
  }
  function findValidSpawnTile(targetX, targetY) {
    if (getTileAt(targetX, targetY) === 0) return { x: targetX, y: targetY };
    for (let radius = 1; radius < 15; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          let testX = targetX + dx;
          let testY = targetY + dy;
          if (getTileAt(testX, testY) === 0 && (testX !== 0 || testY !== 0)) {
            return { x: testX, y: testY };
          }
        }
      }
    }
    return { x: 5, y: 5 };
  }

  // 2. PLAYER & STATE INITIALIZATION
  const player = {
    gridX: 0, gridY: 0, renderX: 0, renderY: 0,
    health: 100, color: "#e76f51", visRadius: 8,
    shield: false, reversedControlsTimer: 0
  };
  const requiredNutrients = {
    carbs: false, protein: false, fats: false,
    vitamins: false, minerals: false, water: false
  };

  let collectedTypesCount = 0;
  let isGameOver = false;
  let particles = [];
  let startTime = Date.now();
  let elapsedTime = 0;

  // 3. JUNK FOOD GENERATION
  const junkTemplates = [
    { food: "Sugary Soda 🥤", emoji: "🥤", penalty: "HP -10 + Confused Keys!", hazard: "confuse", desc: "Reverses arrow controls!" },
    { food: "Greasy Pizza 🍕", emoji: "🍕", penalty: "HP -12", hazard: "damage", desc: "Heavy trans fats slow you down." },
    { food: "Fried Chips 🍟", emoji: "🍟", penalty: "HP -10", hazard: "damage", desc: "Sodium overload drains health." },
    { food: "Chocolate Bar 🍫", emoji: "🍫", penalty: "HP -12", hazard: "damage", desc: "Sugar crash incoming!" }
  ];
  let generatedJunkMap = new Map();
  function getJunkAt(x, y) {
    if (getTileAt(x, y) !== 0 || (x === 0 && y === 0)) return null;
    let key = `${x},${y}`;
    if (generatedJunkMap.has(key)) return generatedJunkMap.get(key);
    let val = pseudoRandom(x * 7 + 13, y * 13 + 7);
    if (val < 0.05) {
      let templateIdx = Math.floor(pseudoRandom(x, y) * junkTemplates.length);
      let item = { ...junkTemplates[templateIdx], x, y, collected: false, isJunk: true };
      generatedJunkMap.set(key, item);
      return item;
    }
    generatedJunkMap.set(key, null);
    return null;
  }

  // 4. HEALTHY FOOD GENERATION
  const healthyTemplates = [
    { type: "carbs", food: "Whole Grain Bread 🌾", emoji: "🌾", boost: "⚡ Energy Surge", desc: "Carbs give vital energy!", uiId: "nutr-carbs" },
    { type: "protein", food: "Grilled Chicken 🍗", emoji: "🍗", boost: "❄️ Stuns Monster", desc: "Freeze the monster!", uiId: "nutr-protein" },
    { type: "fats", food: "Fresh Avocado 🥑", emoji: "🥑", boost: "❤️ Health Boost", desc: "Restores vital HP.", uiId: "nutr-fats" },
    { type: "vitamins", food: "Crispy Apple 🍎", emoji: "🍎", boost: "👁️ Vision Radius +1", desc: "Expands vision field.", uiId: "nutr-vitamins" },
    { type: "minerals", food: "Calcium Milk 🥛", emoji: "🥛", boost: "🛡️ Shield Protection", desc: "Absorbs 1 hazard hit.", uiId: "nutr-minerals" },
    { type: "water", food: "Pure Water 💧", emoji: "💧", boost: "🌊 Purifies Debuffs", desc: "Clears confused status.", uiId: "nutr-water" },
    { type: "vitamins", food: "Fresh Carrot 🥕", emoji: "🥕", boost: "👁️ Vision Radius +1", desc: "Sharpens vision.", uiId: "nutr-vitamins" },
    { type: "protein", food: "Hard Boiled Egg 🥚", emoji: "🥚", boost: "❄️ Stuns Monster", desc: "Protein stuns enemies!", uiId: "nutr-protein" },
    { type: "fats", food: "Handful of Nuts 🥜", emoji: "🥜", boost: "❤️ Health Boost", desc: "Healthy fats restore HP.", uiId: "nutr-fats" },
    { type: "vitamins", food: "Juicy Orange 🍊", emoji: "🍊", boost: "❤️ Health Boost", desc: "Vitamin C burst!", uiId: "nutr-vitamins" }
  ];
  let generatedHealthyMap = new Map();
  function getHealthyAt(x, y) {
    if (getTileAt(x, y) !== 0 || (x === 0 && y === 0)) return null;
    let key = `${x},${y}`;
    if (generatedHealthyMap.has(key)) return generatedHealthyMap.get(key);
    let val = pseudoRandom(x * 11 + 3, y * 17 + 5);
    if (val < 0.18) {
      let templateIdx = Math.floor(pseudoRandom(x * 3, y * 5) * healthyTemplates.length);
      let item = { ...healthyTemplates[templateIdx], x, y, collected: false, isJunk: false };
      generatedHealthyMap.set(key, item);
      return item;
    }
    generatedHealthyMap.set(key, null);
    return null;
  }

  // 5. JUNK MONSTER
  class JunkMonster {
    constructor() {
      let startPos = findValidSpawnTile(10, 10);
      this.gridX = startPos.x;
      this.gridY = startPos.y;
      this.renderX = this.gridX * TILE_SIZE;
      this.renderY = this.gridY * TILE_SIZE;
      this.color = "#bf0603";
      this.moveTimer = 0;
      this.moveInterval = 28;
      this.frozenTimer = 0;
    }
    update() {
      if (isGameOver) return;
      if (this.frozenTimer > 0) { this.frozenTimer--; return; }
      this.moveTimer++;
      if (this.moveTimer >= this.moveInterval) {
        this.move();
        this.moveTimer = 0;
        this.checkPlayerCollision();
      }
    }
    move() {
      let dx = player.gridX - this.gridX;
      let dy = player.gridY - this.gridY;
      let nextX = this.gridX;
      let nextY = this.gridY;
      if (Math.abs(dx) > Math.abs(dy)) {
        nextX += (dx > 0) ? 1 : -1;
        if (getTileAt(nextX, nextY) !== 0) {
          nextX = this.gridX;
          nextY += (dy > 0) ? 1 : -1;
        }
      } else {
        nextY += (dy > 0) ? 1 : -1;
        if (getTileAt(nextX, nextY) !== 0) {
          nextY = this.gridY;
          nextX += (dx > 0) ? 1 : -1;
        }
      }
      if (getTileAt(nextX, nextY) === 0) {
        this.gridX = nextX;
        this.gridY = nextY;
      }
    }
    checkPlayerCollision() {
      if (this.gridX === player.gridX && this.gridY === player.gridY) forceFeedJunk();
    }
  }
  let monster = new JunkMonster();

  // 6. PARTICLES, TIMER & LEADERBOARDS
  function spawnParticles(worldX, worldY, color, count = 12) {
    for (let i = 0; i < count; i++) {
      particles.push({
        wx: worldX * TILE_SIZE + TILE_SIZE / 2,
        wy: worldY * TILE_SIZE + TILE_SIZE / 2,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        size: Math.random() * 4 + 2,
        color: color,
        life: 25
      });
    }
  }
  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      let p = particles[i];
      p.wx += p.vx; p.wy += p.vy; p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }
  function updateTimer() {
    if (!isGameOver) {
      elapsedTime = (Date.now() - startTime) / 1000;
      const timerElem = document.getElementById("timer-display");
      if (timerElem) timerElem.textContent = elapsedTime.toFixed(1);
    }
  }
  function loadBestTime() {
    const scores = JSON.parse(localStorage.getItem("pantryRaidScores") || "[]");
    const bestDisplay = document.getElementById("best-time-display");
    if (scores.length > 0 && bestDisplay) bestDisplay.textContent = `${scores[0].toFixed(1)}s`;
  }
  function saveScore(time) {
    let scores = JSON.parse(localStorage.getItem("pantryRaidScores") || "[]");
    scores.push(time);
    scores.sort((a, b) => a - b);
    scores = scores.slice(0, 5);
    localStorage.setItem("pantryRaidScores", JSON.stringify(scores));
  }
  function displayLeaderboard() {
    const list = document.getElementById("leaderboard-list");
    if (!list) return;
    list.innerHTML = "";
    let scores = JSON.parse(localStorage.getItem("pantryRaidScores") || "[]");
    if (scores.length === 0) {
      list.innerHTML = "<li>No best times recorded!</li>";
      return;
    }
    scores.forEach((s, idx) => {
      let li = document.createElement("li");
      li.textContent = `#${idx + 1} - ${s.toFixed(1)}s`;
      list.appendChild(li);
    });
  }
  loadBestTime();

  // 7. INPUT CONTROLS & PICKUPS
  document.addEventListener("keydown", (e) => {
    if (isGameOver) return;
    let moveX = 0;
    let moveY = 0;
    if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") moveY = -1;
    else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") moveY = 1;
    else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") moveX = -1;
    else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") moveX = 1;
    if (moveX !== 0 || moveY !== 0) {
      e.preventDefault();
      if (player.reversedControlsTimer > 0) { moveX *= -1; moveY *= -1; }
      let targetX = player.gridX + moveX;
      let targetY = player.gridY + moveY;
      if (getTileAt(targetX, targetY) === 0) {
        player.gridX = targetX;
        player.gridY = targetY;
        checkPickup();
      }
    }
  });

  function checkPickup() {
    let healthyItem = getHealthyAt(player.gridX, player.gridY);
    if (healthyItem && !healthyItem.collected) {
      healthyItem.collected = true;
      if (!requiredNutrients[healthyItem.type]) {
        requiredNutrients[healthyItem.type] = true;
        collectedTypesCount++;
        const uiElem = document.getElementById(healthyItem.uiId);
        if (uiElem) {
          uiElem.classList.remove("missing");
          uiElem.classList.add("collected");
        }
      }
      const countElem = document.getElementById("count");
      if (countElem) countElem.textContent = collectedTypesCount;
      applyNutrientPowerUp(healthyItem);
      spawnParticles(healthyItem.x, healthyItem.y, "#2a9d8f", 16);
      if (collectedTypesCount >= 6) triggerVictory();
    }
    let junk = getJunkAt(player.gridX, player.gridY);
    if (junk && !junk.collected) {
      junk.collected = true;
      applyPenalty(junk);
    }
  }

  function applyNutrientPowerUp(item) {
    updateHealth(player.health + 15);
    updateBanner(item, false);
    switch (item.type) {
      case "protein":
        monster.frozenTimer = 360;
        spawnParticles(monster.gridX, monster.gridY, "#4ea8de", 20);
        break;
      case "fats":
        updateHealth(player.health + 10);
        break;
      case "vitamins":
        player.visRadius = Math.min(14, player.visRadius + 1);
        break;
      case "minerals":
        player.shield = true;
        break;
      case "water":
        player.reversedControlsTimer = 0;
        break;
    }
  }

  function applyPenalty(item) {
    spawnParticles(item.x, item.y, "#bf0603", 16);
    if (player.shield) {
      player.shield = false;
      updateBanner({ food: "SHIELDED!", desc: "Mineral shield absorbed penalty!", boost: "Shield Lost" }, false);
      return;
    }
    let hpLoss = parseInt(item.penalty.match(/HP -(\d+)/)[1]);
    updateHealth(player.health - hpLoss);
    if (item.hazard === "confuse") player.reversedControlsTimer = 240;
    updateBanner(item, true);
  }

  function forceFeedJunk() {
    if (isGameOver) return;
    if (player.shield) {
      player.shield = false;
      monster.moveTimer = -30;
      updateBanner({ food: "SHIELD SAVED YOU!", desc: "Monster stumbled on shield!", boost: "Shield Lost" }, false);
      return;
    }
    updateHealth(player.health - 20);
    monster.moveTimer = -30;
    spawnParticles(player.gridX, player.gridY, "#bf0603", 20);
    updateBanner({ food: "MONSTER ATTACK!", desc: "Caught by the Junk Monster!", penalty: "-20 HP" }, true);
  }

  function updateHealth(newHealth) {
    player.health = Math.min(100, Math.max(0, newHealth));
    const hpVal = document.getElementById("health-value");
    if (hpVal) hpVal.textContent = player.health;
    const fill = document.getElementById("health-bar-fill");
    if (fill) {
      fill.style.width = `${player.health}%`;
      if (player.health < 30) fill.classList.add("critical-health");
      else fill.classList.remove("critical-health");
    }
    if (player.health <= 0) {
      isGameOver = true;
      const msg = document.getElementById("game-over-msg");
      if (msg) msg.classList.remove("hidden");
      const status = document.getElementById("boost-status");
      if (status) status.textContent = "Defeated";
    }
  }

  function updateBanner(item, isBad) {
    const banner = document.getElementById("info-banner");
    if (!banner) return;
    banner.className = isBad ? "banner-bad" : "banner-good";
    const title = document.getElementById("banner-title");
    const desc = document.getElementById("banner-desc");
    const boost = document.getElementById("banner-boost");
    if (title) title.textContent = item.food;
    if (desc) desc.textContent = item.desc;
    if (boost) boost.textContent = isBad ? item.penalty : item.boost;
  }

  function updateStatusDisplay() {
    let statuses = [];
    if (player.shield) statuses.push("🥛 Shield");
    if (monster.frozenTimer > 0) statuses.push(`❄️ Frozen (${Math.ceil(monster.frozenTimer / 60)}s)`);
    if (player.reversedControlsTimer > 0) statuses.push(`🥤 Confused! (${Math.ceil(player.reversedControlsTimer / 60)}s)`);
    if (player.reversedControlsTimer > 0) player.reversedControlsTimer--;
    const status = document.getElementById("boost-status");
    if (status) status.textContent = statuses.length > 0 ? statuses.join(" | ") : "Normal";
  }

  function triggerVictory() {
    isGameOver = true;
    saveScore(elapsedTime);
    displayLeaderboard();
    loadBestTime();
    const stats = document.getElementById("victory-stats");
    if (stats) stats.textContent = `Completed in ${elapsedTime.toFixed(1)}s with ${player.health}% Health left!`;
    const overlay = document.getElementById("victory-overlay");
    if (overlay) overlay.classList.remove("hidden");
  }

  // 8. MINIMAP & CANVAS RENDER LOOP
  function drawMinimap() {
    miniCtx.fillStyle = "rgba(13, 14, 18, 0.9)";
    miniCtx.fillRect(0, 0, 120, 120);
    let scale = 3;
    let centerMiniX = 60;
    let centerMiniY = 60;
    for (let r = -20; r <= 20; r++) {
      for (let c = -20; c <= 20; c++) {
        let wx = player.gridX + c;
        let wy = player.gridY + r;
        if (getTileAt(wx, wy) === 1) {
          miniCtx.fillStyle = "#3a3d54";
          miniCtx.fillRect(centerMiniX + c * scale, centerMiniY + r * scale, scale, scale);
        } else {
          let healthy = getHealthyAt(wx, wy);
          if (healthy && !healthy.collected) {
            miniCtx.fillStyle = "#2a9d8f";
            miniCtx.fillRect(centerMiniX + c * scale, centerMiniY + r * scale, scale, scale);
          }
        }
      }
    }
    miniCtx.fillStyle = "#e76f51";
    miniCtx.beginPath();
    miniCtx.arc(centerMiniX, centerMiniY, scale, 0, Math.PI * 2);
    miniCtx.fill();
  }

  function draw() {
    ctx.fillStyle = "#0d0e12";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let targetPxX = player.gridX * TILE_SIZE;
    let targetPxY = player.gridY * TILE_SIZE;
    player.renderX += (targetPxX - player.renderX) * 0.25;
    player.renderY += (targetPxY - player.renderY) * 0.25;
    let monsterTargetX = monster.gridX * TILE_SIZE;
    let monsterTargetY = monster.gridY * TILE_SIZE;
    monster.renderX += (monsterTargetX - monster.renderX) * 0.2;
    monster.renderY += (monsterTargetY - monster.renderY) * 0.2;
    let offsetX = canvas.width / 2 - player.renderX - TILE_SIZE / 2;
    let offsetY = canvas.height / 2 - player.renderY - TILE_SIZE / 2;
    ctx.save();
    ctx.translate(offsetX, offsetY);
    let startTileX = Math.floor((player.renderX - canvas.width / 2) / TILE_SIZE) - 2;
    let endTileX = Math.ceil((player.renderX + canvas.width / 2) / TILE_SIZE) + 2;
    let startTileY = Math.floor((player.renderY - canvas.height / 2) / TILE_SIZE) - 2;
    let endTileY = Math.ceil((player.renderY + canvas.height / 2) / TILE_SIZE) + 2;
    for (let r = startTileY; r <= endTileY; r++) {
      for (let c = startTileX; c <= endTileX; c++) {
        let dist = Math.hypot(r - player.gridY, c - player.gridX);
        if (dist <= player.visRadius) {
          if (getTileAt(c, r) === 1) {
            ctx.fillStyle = "#3a3d54";
            ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          } else {
            ctx.fillStyle = "#222533";
            ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            ctx.strokeStyle = "#2c2f42";
            ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          }
        }
      }
    }
    ctx.font = "18px 'Segoe UI Emoji', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let r = startTileY; r <= endTileY; r++) {
      for (let c = startTileX; c <= endTileX; c++) {
        let dist = Math.hypot(r - player.gridY, c - player.gridX);
        if (dist <= player.visRadius) {
          let healthy = getHealthyAt(c, r);
          if (healthy && !healthy.collected) {
            ctx.fillText(healthy.emoji, c * TILE_SIZE + TILE_SIZE / 2, r * TILE_SIZE + TILE_SIZE / 2);
          }
          let junk = getJunkAt(c, r);
          if (junk && !junk.collected) {
            ctx.fillText(junk.emoji, c * TILE_SIZE + TILE_SIZE / 2, r * TILE_SIZE + TILE_SIZE / 2);
          }
        }
      }
    }
    let monsterDist = Math.hypot(monster.gridY - player.gridY, monster.gridX - player.gridX);
    if (!isGameOver && monsterDist <= player.visRadius) {
      ctx.fillStyle = monster.frozenTimer > 0 ? "#4ea8de" : monster.color;
      ctx.fillRect(monster.renderX + 3, monster.renderY + 3, TILE_SIZE - 6, TILE_SIZE - 6);
    }
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(player.renderX + TILE_SIZE / 2, player.renderY + TILE_SIZE / 2, TILE_SIZE / 2.4, 0, Math.PI * 2);
    ctx.fill();
    if (player.shield) {
      ctx.strokeStyle = "#4ea8de";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(player.renderX + TILE_SIZE / 2, player.renderY + TILE_SIZE / 2, TILE_SIZE / 1.8, 0, Math.PI * 2);
      ctx.stroke();
    }
    particles.forEach((p) => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life / 25;
      ctx.fillRect(p.wx, p.wy, p.size, p.size);
    });
    ctx.globalAlpha = 1.0;
    ctx.restore();
  }

  function gameLoop() {
    updateTimer();
    monster.update();
    updateParticles();
    updateStatusDisplay();
    draw();
    drawMinimap();
    if (!isGameOver) requestAnimationFrame(gameLoop);
  }
  gameLoop();
});
