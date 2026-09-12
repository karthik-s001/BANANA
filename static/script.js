(() => {
  "use strict";

  const USELESS_LINES = [
    "Mission accomplished.",
    "This system has solved absolutely nothing.",
    "Congratulations. You spent computing power judging a banana.",
    "Humanity definitely needed this.",
    "The banana has been judged. Society may now continue.",
  ];

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  function $(id) { return document.getElementById(id); }

  function setWidth(el, pct) {
    requestAnimationFrame(() => { el.style.width = Math.max(0, Math.min(100, pct)) + "%"; });
  }

  function setupDropzone(zone, input, previewEl, onFile) {
    const open = () => input.click();
    zone.addEventListener("click", open);
    zone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });

    ["dragenter", "dragover"].forEach((evt) =>
      zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.add("is-dragover"); })
    );
    ["dragleave", "drop"].forEach((evt) =>
      zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.remove("is-dragover"); })
    );
    zone.addEventListener("drop", (e) => {
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) { input.files = e.dataTransfer.files; handleFile(file, previewEl, onFile); }
    });

    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if (file) handleFile(file, previewEl, onFile);
    });
  }

  function handleFile(file, previewEl, onFile) {
    const valid = ["image/jpeg", "image/png", "image/jpg"];
    if (!valid.includes(file.type)) {
      onFile(null);
      alert("Please choose a JPG or PNG image.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      previewEl.src = e.target.result;
      previewEl.hidden = false;
    };
    reader.readAsDataURL(file);
    onFile(file);
  }

  // ---------------------------------------------------------------------
  // Main upload / judge flow
  // ---------------------------------------------------------------------

  let currentFile = null;

  const dropzone = $("dropzone");
  const fileInput = $("fileInput");
  const previewImg = $("previewImg");
  const judgeBtn = $("judgeBtn");
  const uploaderStatus = $("uploaderStatus");

  setupDropzone(dropzone, fileInput, previewImg, (file) => {
    currentFile = file;
    judgeBtn.disabled = !file;
    uploaderStatus.textContent = file ? "" : "";
    uploaderStatus.classList.remove("is-error");
  });

  async function judgeBanana() {
    if (!currentFile) return;
    judgeBtn.disabled = true;
    uploaderStatus.textContent = "Analyzing banana geometry...";
    uploaderStatus.classList.remove("is-error");

    const formData = new FormData();
    formData.append("image", currentFile);

    try {
      const res = await fetch("/analyze", { method: "POST", body: formData });
      const data = await res.json();

      if (!data.success) {
        uploaderStatus.textContent = data.error || "Something went wrong.";
        uploaderStatus.classList.add("is-error");
        return;
      }

      if (!data.banana_detected) {
        resetBananaResultDisplay();
        uploaderStatus.textContent = data.message || "No banana detected.";
        uploaderStatus.classList.add("is-error");
        return;
      }

      uploaderStatus.textContent = "Case filed successfully.";
      renderResults(data);
      renderCourt(data.court, data.banana_id);
      refreshStats();
      document.getElementById("results").scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      uploaderStatus.textContent = "Network error. Is the server running?";
      uploaderStatus.classList.add("is-error");
    } finally {
      judgeBtn.disabled = !currentFile;
    }
  }

  judgeBtn.addEventListener("click", judgeBanana);

  function renderResults(data) {
    $("resultsEmpty").hidden = true;
    $("resultsBody").hidden = false;

    $("resultImage").src = data.image;
    $("bananaIdTag").textContent = data.banana_id;
    $("statBend").textContent = data.bend + "%";
    $("statCurvature").textContent = data.curvature;

    $("mBeauty").textContent = data.beauty + "/100";
    setWidth($("mBeautyFill"), data.beauty);

    $("mIntel").textContent = data.intelligence + "/100";
    setWidth($("mIntelFill"), data.intelligence);

    $("mSerious").textContent = data.seriousness + "/100";
    setWidth($("mSeriousFill"), data.seriousness);

    $("mDrama").textContent = data.drama + "/100";
    setWidth($("mDramaFill"), data.drama);

    $("mDanger").textContent = data.danger + "%";
    setWidth($("mDangerFill"), (data.danger / 5) * 100);

    $("mOverall").textContent = data.overall_score + "/100";
    setWidth($("mOverallFill"), data.overall_score);

    $("tagMood").textContent = data.mood;
    $("tagPersonality").textContent = data.personality;
    $("tagRelationship").textContent = data.relationship;
    $("tagHoroscope").textContent = data.horoscope;
  }

  function resetBananaResultDisplay() {
    $("resultsEmpty").hidden = false;
    $("resultsBody").hidden = true;
    $("courtEmpty").hidden = false;
    $("courtDoc").hidden = true;
    $("compatResult").hidden = true;
    $("compatibilityAnimation").hidden = true;
  }

  function renderCourt(court, bananaId) {
    $("courtEmpty").hidden = true;
    $("courtDoc").hidden = false;

    $("courtCase").textContent = "#" + court.case_number;
    $("courtDefendant").textContent = court.defendant;
    $("courtCharge").textContent = court.charge;
    $("courtEvidence").textContent = "Bend: " + court.evidence_bend + "%";
    $("courtSentence").textContent = court.sentence;

    const list = $("courtAdditional");
    list.innerHTML = "";
    court.additional_charges.forEach((c) => {
      const li = document.createElement("li");
      li.textContent = c;
      list.appendChild(li);
    });
  }

  $("judgeAnotherBtn").addEventListener("click", () => {
    document.getElementById("top").scrollIntoView({ behavior: "smooth" });
  });

  // ---------------------------------------------------------------------
  // Compatibility
  // ---------------------------------------------------------------------

  let fileA = null, fileB = null;

  setupDropzone($("dropzoneA"), $("fileInputA"), $("previewA"), (f) => {
    fileA = f;
    updateCompareBtn();
  });
  setupDropzone($("dropzoneB"), $("fileInputB"), $("previewB"), (f) => {
    fileB = f;
    updateCompareBtn();
  });

  function updateCompareBtn() {
    $("compareBtn").disabled = !(fileA && fileB);
  }

  $("compareBtn").addEventListener("click", async () => {
    if (!fileA || !fileB) return;
    const statusEl = $("compatStatus");
    statusEl.classList.remove("is-error");
    statusEl.textContent = "Comparing bananas...";
    $("compareBtn").disabled = true;

    const formData = new FormData();
    formData.append("image1", fileA);
    formData.append("image2", fileB);

    try {
      const res = await fetch("/compatibility", { method: "POST", body: formData });
      const data = await res.json();

      if (!data.success) {
        statusEl.textContent = data.error || "Something went wrong.";
        statusEl.classList.add("is-error");
        return;
      }
      if (!data.banana_detected) {
        resetBananaResultDisplay();
        statusEl.textContent = data.message || "No banana detected in one of the photos.";
        statusEl.classList.add("is-error");
        return;
      }

      statusEl.textContent = "";
      $("compatResult").hidden = false;

      $("compatImgA").src = data.banana_a.image;
      $("compatBendA").textContent = data.banana_a.bend + "%";
      $("compatBeautyA").textContent = data.banana_a.beauty;

      $("compatImgB").src = data.banana_b.image;
      $("compatBendB").textContent = data.banana_b.bend + "%";
      $("compatBeautyB").textContent = data.banana_b.beauty;

      $("compatScore").textContent = data.compatibility + "%";
      $("compatRelationship").textContent = data.relationship_status;

      playCompatibilityAnimation(data.compatibility, data.relationship_status);
      $("compatResult").scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (err) {
      statusEl.textContent = "Network error. Is the server running?";
      statusEl.classList.add("is-error");
    } finally {
      $("compareBtn").disabled = !(fileA && fileB);
    }
  });

  function getCompatibilityMode(score) {
    if (score >= 90) return "is-perfect";
    if (score >= 75) return "is-soulmates";
    if (score >= 60) return "is-friendly";
    if (score >= 45) return "is-complicated";
    if (score >= 30) return "is-dramatic";
    if (score >= 15) return "is-breaking";
    return "is-apart";
  }

  function getCompatibilityHeadline(score, status) {
    if (score >= 90) return "💕 PERFECT BANANA MATCH 💕";
    if (score >= 75) return "💕 FRUIT SOULMATES 💕";
    if (score >= 60) return "🤝 BEST FRIENDS 🤝";
    if (score >= 45) return "😵 IT'S COMPLICATED";
    if (score >= 30) return "⚡ OPPOSITES ATTRACT ⚡";
    if (score >= 15) return "💔 TOXIC FRUIT RELATIONSHIP";
    return "💨 THEY SHOULD STAY APART";
  }

  function createHeartExplosion() {
    const container = $("heartExplosion");
    container.innerHTML = "";

    const heartSymbols = ["❤️", "💕", "💖", "💗", "💘", "💝", "✨"];
    const particleCount = 26;

    for (let i = 0; i < particleCount; i += 1) {
      const particle = document.createElement("span");
      particle.className = "heart-particle";
      particle.textContent = heartSymbols[i % heartSymbols.length];

      const angle = (Math.PI * 2 * i) / particleCount;
      const distance = 70 + Math.random() * 110;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;

      particle.style.setProperty("--x", x + "px");
      particle.style.setProperty("--y", y + "px");
      particle.style.setProperty("--duration", (0.9 + Math.random() * 0.8).toFixed(2) + "s");
      particle.style.setProperty("--delay", (Math.random() * 0.12).toFixed(2) + "s");

      container.appendChild(particle);
    }
  }

  function finishCompatibilityAnimation(score, status) {
    const animation = $("compatibilityAnimation");
    const scanText = $("scanText");
    const statusEl = $("compatibilityStatus");
    const percentEl = $("compatibilityPercent");
    const meterFill = $("loveMeterFill");
    const heartCenter = $("heartCenter");

    animation.classList.remove("is-scanning");
    animation.classList.add("is-final");

    const headline = status
      ? '💕 ' + status.toUpperCase() + ' 💕'
      : getCompatibilityHeadline(score, status);

    scanText.textContent = "💘 BANANA CHEMISTRY CONFIRMED!";
    statusEl.textContent = headline;
    percentEl.textContent = score + "%";
    meterFill.style.width = score + "%";
    heartCenter.textContent = score >= 60 ? "💖" : "💔";
    heartCenter.classList.add("is-final-pulse");

    createHeartExplosion();
  }

  function playCompatibilityAnimation(score, status) {
    const animation = $("compatibilityAnimation");
    const scanText = $("scanText");
    const statusEl = $("compatibilityStatus");
    const percentEl = $("compatibilityPercent");
    const meterFill = $("loveMeterFill");
    const heartCenter = $("heartCenter");
    const bananaA = $("bananaA");
    const bananaB = $("bananaB");
    const heartExplosion = $("heartExplosion");

    const safeScore = Math.max(0, Math.min(100, Number(score) || 0));

    animation.hidden = false;
    animation.classList.remove("is-final", "is-perfect", "is-soulmates", "is-friendly", "is-complicated", "is-dramatic", "is-breaking", "is-apart", "is-scanning");
    animation.classList.add(getCompatibilityMode(safeScore));
    animation.classList.add("is-scanning");

    heartExplosion.innerHTML = "";
    heartCenter.textContent = "💖";
    heartCenter.classList.remove("is-final-pulse");
    bananaA.classList.remove("is-shifted");
    bananaB.classList.remove("is-shifted");

    scanText.textContent = "💕 BANANA LOVE SCANNER 💕";
    statusEl.textContent = "🔍 SCANNING BANANA CHEMISTRY...";
    percentEl.textContent = "0%";
    meterFill.style.width = "0%";

    const startTime = performance.now();
    const duration = 2600;

    function animateCounter(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const currentScore = Math.round(safeScore * progress);

      percentEl.textContent = currentScore + "%";
      meterFill.style.width = currentScore + "%";

      if (progress < 1) {
        requestAnimationFrame(animateCounter);
      } else {
        finishCompatibilityAnimation(safeScore, status);
      }
    }

    requestAnimationFrame(animateCounter);
  }

  // ---------------------------------------------------------------------
  // Banana Survival Test
  // ---------------------------------------------------------------------

  const bananaGameToggleBtn = $("bananaGameToggleBtn");
  const bananaGamePanel = $("bananaGamePanel");
  const bananaGameCloseBtn = $("bananaGameCloseBtn");
  const bananaGameRestartBtn = $("bananaGameRestartBtn");
  const bananaGameArea = $("bananaGameArea");
  const bananaGamePlayer = $("bananaGamePlayer");
  const bananaGameMessage = $("bananaGameMessage");
  const bananaGameOverlay = $("bananaGameOverlay");
  const bananaGameScoreEl = $("bananaGameScore");
  const bananaGameTimeEl = $("bananaGameTime");
  const bananaGameLivesEl = $("bananaGameLives");
  const bananaGameFinalScoreEl = $("bananaGameFinalScore");
  const bananaGameRankEl = $("bananaGameRank");

  const bananaGameMessages = [
    "WHY ARE YOU DOING THIS?",
    "I HAVE WORK TOMORROW.",
    "PLEASE STOP.",
    "I WAS HAPPY IN THE FRUIT BOWL.",
    "THIS GAME HAS NO PURPOSE.",
    "YOU COULD BE STUDYING.",
    "I AM LITERALLY A BANANA.",
    "MY POTASSIUM IS RUNNING OUT."
  ];

  const bananaGameState = {
    running: false,
    score: 0,
    lives: 3,
    timeLeft: 20,
    lastTimestamp: 0,
    frameId: null,
    objects: [],
    lastSpawnAt: 0,
    nextSpawnDelay: 0.8,
    lastRandomMessageAt: 0,
    lastScoreAt: 0,
    player: { x: 0, y: 0 },
    keys: { left: false, right: false, up: false, down: false },
  };

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getBananaGameRank(score) {
    if (score >= 50) return "SUPREME BANANA WARRIOR";
    if (score >= 31) return "BANANA SURVIVAL EXPERT";
    if (score >= 16) return "PROFESSIONAL BANANA";
    if (score >= 6) return "BANANA INTERN";
    return "FRUIT AMATEUR";
  }

  function updateBananaGameHud() {
    bananaGameScoreEl.textContent = String(bananaGameState.score);
    bananaGameTimeEl.textContent = String(Math.max(0, Math.ceil(bananaGameState.timeLeft)));
    bananaGameLivesEl.textContent = "❤️".repeat(Math.max(0, bananaGameState.lives));
  }

  function showBananaGameMessage(text, duration = 1200) {
    bananaGameMessage.textContent = text;
    bananaGameMessage.classList.add("is-visible");
    clearTimeout(showBananaGameMessage.timeoutId);
    showBananaGameMessage.timeoutId = setTimeout(() => {
      bananaGameMessage.classList.remove("is-visible");
    }, duration);
  }

  function randomChoice(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function playBananaGameTone(type) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!playBananaGameTone.context) {
      playBananaGameTone.context = new AudioContextClass();
    }

    const context = playBananaGameTone.context;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    const now = context.currentTime;
    oscillator.type = type === "bonus" ? "triangle" : type === "gameover" ? "sawtooth" : "square";
    oscillator.frequency.value = type === "bonus" ? 620 : type === "gameover" ? 140 : 240;

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + (type === "bonus" ? 0.18 : 0.12));

    oscillator.start(now);
    oscillator.stop(now + (type === "bonus" ? 0.18 : 0.12));
  }

  function spawnBananaGameObject() {
    if (!bananaGameState.running) return;

    const areaRect = bananaGameArea.getBoundingClientRect();
    const areaWidth = Math.max(300, areaRect.width);
    const areaHeight = Math.max(260, areaRect.height);
    const roll = Math.random();

    let kind = "apple";
    if (roll < 0.08) kind = "golden-banana";
    else if (roll < 0.12) kind = "rotten-banana";
    else if (roll < 0.24) kind = "coconut";
    else if (roll < 0.38) kind = "mango";
    else if (roll < 0.52) kind = "pineapple";

    const emojiMap = {
      apple: "🍎",
      coconut: "🥥",
      mango: "🥭",
      pineapple: "🍍",
      "golden-banana": "💎",
      "rotten-banana": "☠️",
    };

    const item = document.createElement("div");
    item.className = "banana-game__item" + (kind === "golden-banana" ? " banana-game__item--bonus" : kind === "rotten-banana" ? " banana-game__item--rotten" : "");
    item.textContent = emojiMap[kind];
    item.style.left = (30 + Math.random() * (areaWidth - 60)) + "px";
    item.style.top = "-20px";
    item.style.fontSize = kind === "golden-banana" ? "32px" : "30px";

    bananaGameArea.appendChild(item);

    const speedBase = kind === "golden-banana" ? 150 : kind === "rotten-banana" ? 165 : 120 + Math.random() * 80;

    bananaGameState.objects.push({
      kind,
      x: parseFloat(item.style.left),
      y: -20,
      speed: speedBase,
      drift: (Math.random() - 0.5) * 40,
      rotation: Math.random() * 360,
      element: item,
    });
  }

  function removeBananaGameObject(obj) {
    obj.element.remove();
    bananaGameState.objects = bananaGameState.objects.filter((item) => item !== obj);
  }

  function applyBananaGameShake() {
    bananaGameArea.classList.remove("is-shaking");
    void bananaGameArea.offsetWidth;
    bananaGameArea.classList.add("is-shaking");
    setTimeout(() => bananaGameArea.classList.remove("is-shaking"), 240);
  }

  function updateBananaGamePlayer(dt) {
    const areaRect = bananaGameArea.getBoundingClientRect();
    const areaWidth = areaRect.width;
    const areaHeight = areaRect.height;
    const moveSpeed = 250;

    let dx = 0;
    let dy = 0;

    if (bananaGameState.keys.left) dx -= 1;
    if (bananaGameState.keys.right) dx += 1;
    if (bananaGameState.keys.up) dy -= 1;
    if (bananaGameState.keys.down) dy += 1;

    bananaGameState.player.x += dx * moveSpeed * dt;
    bananaGameState.player.y += dy * moveSpeed * dt;

    bananaGameState.player.x = clamp(bananaGameState.player.x, 38, areaWidth - 38);
    bananaGameState.player.y = clamp(bananaGameState.player.y, 46, areaHeight - 38);

    bananaGamePlayer.style.left = bananaGameState.player.x + "px";
    bananaGamePlayer.style.top = bananaGameState.player.y + "px";
  }

  function updateBananaGameObjects(dt) {
    const areaRect = bananaGameArea.getBoundingClientRect();
    const areaWidth = areaRect.width;
    const areaHeight = areaRect.height;

    const updatedObjects = [];

    for (const obj of bananaGameState.objects) {
      obj.y += obj.speed * dt;
      obj.x += obj.drift * dt;
      obj.rotation += 90 * dt;

      if (obj.x < 10 || obj.x > areaWidth - 10) {
        obj.drift *= -0.8;
      }

      obj.element.style.left = obj.x + "px";
      obj.element.style.top = obj.y + "px";
      obj.element.style.transform = "translate(-50%, -50%) rotate(" + obj.rotation + "deg)";

      const dx = obj.x - bananaGameState.player.x;
      const dy = obj.y - bananaGameState.player.y;
      const distance = Math.hypot(dx, dy);
      const hitRadius = obj.kind === "golden-banana" || obj.kind === "rotten-banana" ? 26 : 24;

      if (distance < hitRadius + 20) {
        if (obj.kind === "golden-banana") {
          bananaGameState.score += 10;
          showBananaGameMessage("GOLDEN BANANA! +10", 900);
          playBananaGameTone("bonus");
          obj.element.classList.add("banana-game__item--bonus");
          obj.element.style.animation = "bonusGlow 0.45s ease-in-out 2";
          removeBananaGameObject(obj);
          updateBananaGameHud();
          continue;
        }

        if (obj.kind === "rotten-banana") {
          bananaGameState.score = Math.max(0, bananaGameState.score - 5);
          showBananaGameMessage("YOU TRUSTED A ROTTEN BANANA.", 1500);
          applyBananaGameShake();
          playBananaGameTone("gameover");
          removeBananaGameObject(obj);
          updateBananaGameHud();
          continue;
        }

        bananaGameState.lives -= 1;
        bananaGameState.lives = Math.max(0, bananaGameState.lives);
        bananaGamePlayer.classList.remove("is-hit");
        void bananaGamePlayer.offsetWidth;
        bananaGamePlayer.classList.add("is-hit");
        setTimeout(() => bananaGamePlayer.classList.remove("is-hit"), 240);
        showBananaGameMessage("OUCH.", 600);
        playBananaGameTone("hit");
        applyBananaGameShake();
        removeBananaGameObject(obj);
        updateBananaGameHud();

        if (bananaGameState.lives <= 0) {
          finishBananaGame();
        }
        continue;
      }

      if (obj.y > areaHeight + 30) {
        removeBananaGameObject(obj);
        continue;
      }

      updatedObjects.push(obj);
    }

    bananaGameState.objects = updatedObjects;
  }

  function finishBananaGame() {
    bananaGameState.running = false;
    bananaGameState.timeLeft = Math.max(0, bananaGameState.timeLeft);
    bananaGameState.objects.forEach((obj) => obj.element.remove());
    bananaGameState.objects = [];
    bananaGameOverlay.hidden = false;
    bananaGameFinalScoreEl.textContent = String(bananaGameState.score);
    bananaGameRankEl.textContent = getBananaGameRank(bananaGameState.score);
    playBananaGameTone("gameover");

    if (bananaGameState.frameId) {
      cancelAnimationFrame(bananaGameState.frameId);
      bananaGameState.frameId = null;
    }
  }

  function tickBananaGame(timestamp) {
    if (!bananaGameState.running) return;

    if (!bananaGameState.lastTimestamp) {
      bananaGameState.lastTimestamp = timestamp;
    }

    const dt = Math.min((timestamp - bananaGameState.lastTimestamp) / 1000, 0.033);
    bananaGameState.lastTimestamp = timestamp;

    bananaGameState.timeLeft -= dt;
    bananaGameState.lastScoreAt += dt;
    bananaGameState.lastSpawnAt += dt;

    if (bananaGameState.lastScoreAt >= 1) {
      bananaGameState.score += 1;
      bananaGameState.lastScoreAt = 0;
      updateBananaGameHud();
    }

    if (bananaGameState.lastSpawnAt >= bananaGameState.nextSpawnDelay) {
      spawnBananaGameObject();
      bananaGameState.lastSpawnAt = 0;
      bananaGameState.nextSpawnDelay = Math.max(0.42, 0.9 - bananaGameState.score * 0.008) + Math.random() * 0.3;
    }

    if (timestamp - bananaGameState.lastRandomMessageAt > 2600) {
      bananaGameState.lastRandomMessageAt = timestamp;
      showBananaGameMessage(randomChoice(bananaGameMessages), 1000);
    }

    updateBananaGamePlayer(dt);
    updateBananaGameObjects(dt);
    updateBananaGameHud();

    if (bananaGameState.timeLeft <= 0) {
      bananaGameState.timeLeft = 0;
      updateBananaGameHud();
      finishBananaGame();
      return;
    }

    bananaGameState.frameId = requestAnimationFrame(tickBananaGame);
  }

  function resetBananaGameState() {
    bananaGameState.running = false;
    bananaGameState.score = 0;
    bananaGameState.lives = 3;
    bananaGameState.timeLeft = 20;
    bananaGameState.lastTimestamp = 0;
    bananaGameState.lastSpawnAt = 0;
    bananaGameState.nextSpawnDelay = 0.8;
    bananaGameState.lastRandomMessageAt = 0;
    bananaGameState.lastScoreAt = 0;
    bananaGameState.objects.forEach((obj) => obj.element.remove());
    bananaGameState.objects = [];
    bananaGameMessage.classList.remove("is-visible");
    bananaGameOverlay.hidden = true;
    bananaGameArea.classList.remove("is-shaking");
    bananaGamePlayer.classList.remove("is-hit");
    bananaGamePlayer.style.left = "50%";
    bananaGamePlayer.style.top = "82%";

    const areaRect = bananaGameArea.getBoundingClientRect();
    bananaGameState.player.x = areaRect.width * 0.5;
    bananaGameState.player.y = areaRect.height * 0.82;

    updateBananaGameHud();
  }

  function startBananaSurvivalGame() {
    resetBananaGameState();
    bananaGameState.running = true;
    bananaGamePanel.hidden = false;
    bananaGameToggleBtn.textContent = "Restart Banana Survival Test";
    bananaGameArea.focus();
    updateBananaGameHud();
    showBananaGameMessage("🍌 BANANA SURVIVAL TEST", 1000);
    bananaGameState.frameId = requestAnimationFrame(tickBananaGame);
  }

  bananaGameToggleBtn.addEventListener("click", () => {
    bananaGamePanel.hidden = false;
    startBananaSurvivalGame();
  });

  bananaGameCloseBtn.addEventListener("click", () => {
    if (bananaGameState.frameId) {
      cancelAnimationFrame(bananaGameState.frameId);
      bananaGameState.frameId = null;
    }
    bananaGameState.running = false;
    bananaGamePanel.hidden = true;
    bananaGameOverlay.hidden = true;
    bananaGameState.objects.forEach((obj) => obj.element.remove());
    bananaGameState.objects = [];
    bananaGameToggleBtn.textContent = "Open Banana Survival Test";
  });

  bananaGameRestartBtn.addEventListener("click", () => {
    startBananaSurvivalGame();
  });

  bananaGameArea.addEventListener("pointerdown", (event) => {
    const rect = bananaGameArea.getBoundingClientRect();
    bananaGameState.player.x = clamp(event.clientX - rect.left, 38, rect.width - 38);
    bananaGameState.player.y = clamp(event.clientY - rect.top, 46, rect.height - 38);
    bananaGamePlayer.style.left = bananaGameState.player.x + "px";
    bananaGamePlayer.style.top = bananaGameState.player.y + "px";
  });

  document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (["arrowleft", "a"].includes(key)) bananaGameState.keys.left = true;
    if (["arrowright", "d"].includes(key)) bananaGameState.keys.right = true;
    if (["arrowup", "w"].includes(key)) bananaGameState.keys.up = true;
    if (["arrowdown", "s"].includes(key)) bananaGameState.keys.down = true;
  });

  document.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (["arrowleft", "a"].includes(key)) bananaGameState.keys.left = false;
    if (["arrowright", "d"].includes(key)) bananaGameState.keys.right = false;
    if (["arrowup", "w"].includes(key)) bananaGameState.keys.up = false;
    if (["arrowdown", "s"].includes(key)) bananaGameState.keys.down = false;
  });

  resetBananaGameState();

  //--------------------------------------
  // Fortune teller
  // ---------------------------------------------------------------------

  $("fortuneBtn").addEventListener("click", async () => {
    $("fortuneBtn").disabled = true;
    try {
      const res = await fetch("/fortune");
      const data = await res.json();
      if (data.success) {
        const f = data.fortune;
        $("fToday").textContent = f.today;
        $("fTomorrow").textContent = f.tomorrow;
        $("fCareer").textContent = f.career;
        $("fLove").textContent = f.love;
        $("fFruit").textContent = f.lucky_fruit;
        $("fNumber").textContent = f.lucky_number;
        $("fDestiny").textContent = f.destiny;
      }
    } catch (err) {
      /* fortune telling is not essential infrastructure */
    } finally {
      $("fortuneBtn").disabled = false;
    }
  });

  // ---------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------

  async function refreshStats() {
    try {
      const res = await fetch("/stats");
      const data = await res.json();
      if (!data.success) return;
      const s = data.stats;
      $("sTotal").textContent = s.total;
      $("sAvgBend").textContent = s.average_bend + "%";
      $("sMostCurved").textContent = s.most_curved + "%";
      $("sAvgBeauty").textContent = s.average_beauty;
      $("sMood").textContent = s.most_common_mood;
      $("sPersonality").textContent = s.most_common_personality;
      $("sUselessness").textContent = s.average_uselessness + "%";
      $("sChampion").textContent = s.champion_id ? "Banana #" + String(s.champion_id).padStart(3, "0") : "\u2014";
    } catch (err) {
      /* stats are cosmetic */
    }
  }
  refreshStats();

  // ---------------------------------------------------------------------
  // Uselessness score
  // ---------------------------------------------------------------------

  function randomUselessLine() {
    return USELESS_LINES[Math.floor(Math.random() * USELESS_LINES.length)];
  }
  $("uselessLine").textContent = randomUselessLine();
  $("recalcBtn").addEventListener("click", () => {
    $("uselessLine").textContent = randomUselessLine();
  });

  // ---------------------------------------------------------------------
  // Nav active-section highlighting
  // ---------------------------------------------------------------------

  const navItems = Array.from(document.querySelectorAll(".case-nav__item"));
  const sections = navItems.map((item) => document.querySelector(item.getAttribute("href")));

  function updateActiveNav() {
    let activeIdx = -1;
    sections.forEach((sec, i) => {
      if (!sec) return;
      const rect = sec.getBoundingClientRect();
      if (rect.top <= window.innerHeight * 0.4) activeIdx = i;
    });
    navItems.forEach((item, i) => item.classList.toggle("is-active", i === activeIdx));
  }
  window.addEventListener("scroll", updateActiveNav, { passive: true });
  updateActiveNav();
})();
