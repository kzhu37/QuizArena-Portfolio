(function bootstrapApp(ns) {
  const $ = (id) => document.getElementById(id);

  const app = $("app");
  const setupScreen = $("setupScreen");
  const playerCountEl = $("playerCount");
  const categoryModeEl = $("categoryMode");
  const nameFields = $("nameFields");
  const startBtn = $("startBtn");
  const quickBtn = $("quickBtn");

  const roundPill = $("roundPill");
  const scoresEl = $("scores");
  const boardEl = $("board");
  const turnNameEl = $("turnName");
  const progressEl = $("progress");

  const newGameBtn = $("newGameBtn");
  const nextRoundBtn = $("nextRoundBtn");
  const editPlayersBtn = $("editPlayersBtn");
  const saveBtn = $("saveBtn");
  const loadBtn = $("loadBtn");
  const resetBtn = $("resetBtn");
  const timerToggle = $("timerToggle");
  const timerStatus = $("timerStatus");

  const overlay = $("overlay");
  const closeModalBtn = $("closeModalBtn");
  const mCat = $("mCat");
  const mVal = $("mVal");
  const mClue = $("mClue");
  const mNote = $("mNote");
  const mAnswer = $("mAnswer");
  const mTimer = $("mTimer");
  const revealBtn = $("revealBtn");
  const actionButtons = $("actionButtons");
  const whoBox = $("whoBox");
  const toast = $("toast");
  const gameEndOverlay = $("gameEndOverlay");
  const gameEndTitle = $("gameEndTitle");
  const gameEndSummary = $("gameEndSummary");
  const gameEndNote = $("gameEndNote");
  const gameEndStandings = $("gameEndStandings");
  const closeGameEndBtn = $("closeGameEndBtn");
  const playAgainBtn = $("playAgainBtn");
  const backToLobbyBtn = $("backToLobbyBtn");

  let state = null;
  let validator = null;
  let repository = null;
  let usageTracker = null;
  let answerMatcher = null;
  let boardAssembler = null;
  let finalSelector = null;
  let sourceAdapter = null;
  let stateAdapter = null;
  let timerInterval = null;
  let timerRemaining = 0;
  let timerLabel = "";
  let timerExpire = null;

  function boardDisplayName() {
    return String(window.QuizzlerBoardConfig?.displayName || "Quizler Jeopardy");
  }

  function platformHubHref() {
    const direct = $("platformHubBtn")?.href;
    if (direct) return direct;
    return "./index.html#/";
  }

  function renderFatalError(error) {
    const message = String(error?.message || error || "Unknown runtime error.");
    const details = String(error?.stack || error || "");

    forceCloseOverlay();
    hideGameEndOverlay();
    setupScreen.style.display = "none";
    app.style.display = "flex";
    roundPill.innerHTML = "Round: <b>Runtime Error</b>";
    turnNameEl.textContent = "-";
    progressEl.textContent = "-";
    scoresEl.innerHTML = "";
    nextRoundBtn.disabled = true;
    saveBtn.disabled = true;
    loadBtn.disabled = true;
    newGameBtn.disabled = true;
    boardEl.innerHTML = `
      <div class="final" style="padding:24px;">
        <div class="card">
          <div class="big">${boardDisplayName()} Failed To Start</div>
          <p class="step">The local Jeopardy runtime hit a release-blocking error during startup.</p>
          <div class="divider"></div>
          <div class="answerBox" style="display:block;">${message}</div>
          <div class="divider"></div>
          <pre style="white-space:pre-wrap; word-break:break-word; color:var(--muted); font-size:12px; margin:0;">${details}</pre>
        </div>
      </div>
    `;
  }

  function smokeCheckRuntime() {
    const smokeSeeds = [0x12345678, 0x31415926, 0x0badf00d];
    for (const seed of smokeSeeds) {
      const rng = ns.mulberry32(seed);
      const gamePackage = sourceAdapter.buildGamePackage({
        rng,
        playerCount: 2
      });
      for (const round of gamePackage.rounds) {
        validator.validateBoard(round);
      }
      validator.validateFinalOptions(gamePackage.finalOptions);
    }
  }

  function bootRuntime() {
    validator = new ns.QuestionValidator();
    repository = new ns.LocalQuestionRepository();
    validator.validateRepository(repository);

    usageTracker = new ns.UsageTracker();
    answerMatcher = new ns.AnswerMatcher();
    boardAssembler = new ns.BoardAssembler(repository, validator);
    finalSelector = new ns.FinalSelector(repository, validator);
    sourceAdapter = ns.createQuestionSourceAdapter({
      repository,
      boardAssembler,
      finalSelector,
      validator,
      usageTracker
    });
    stateAdapter = new ns.GameStateAdapter({
      sourceAdapter,
      usageTracker,
      repository,
      validator,
      answerMatcher
    });

    smokeCheckRuntime();
    console.info("Quizler Jeopardy local bank ready", repository.stats);
  }

  function ensureLoadedStateShape(value) {
    value.final = value.final || {};
    value.final.options = Array.isArray(value.final.options) ? value.final.options : [];
    value.final.wagers = value.final.wagers || {};
    value.final.answers = value.final.answers || {};
    value.final.suggestions = value.final.suggestions || {};
    value.final.judged = value.final.judged || {};
    value.final.stage = value.final.stage || ns.FINAL_STAGE.CHOOSE;
    value.opened = value.opened || null;
    value.modal = value.modal || { mode: "main", stealId: null, revealed: false };
    value.roundIndex = Number.isFinite(value.roundIndex) ? value.roundIndex : 0;
    value.turnId = Number.isFinite(value.turnId) ? value.turnId : 0;
    value.timerEnabled = value.timerEnabled === true;
    value.categoryMode = value.categoryMode || "random";
    value.categorySelection = value.categorySelection || {};
    value.categorySelection.r1 = value.categorySelection.r1 || { confirmed: value.categoryMode !== "custom", selectedIds: [] };
    value.categorySelection.r2 = value.categorySelection.r2 || { confirmed: value.categoryMode !== "custom", selectedIds: [] };
    return value;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 1800);
  }

  function renderTimerStatus() {
    if (!timerStatus) return;
    if (!state?.timerEnabled) {
      timerStatus.innerHTML = "Timer: <b>Off</b>";
      if (mTimer) {
        mTimer.style.display = "none";
        mTimer.classList.remove("timeWarning");
      }
      return;
    }
    if (timerInterval) {
      timerStatus.innerHTML = `${timerLabel}: <b>${timerRemaining}s</b>`;
      if (mTimer) {
        mTimer.style.display = "flex";
        mTimer.querySelector(".timerValue").textContent = `${timerRemaining}s`;
        // Add warning class when time is running low
        if (timerRemaining <= 5 && timerRemaining > 0) {
          mTimer.classList.add("timeWarning");
        } else {
          mTimer.classList.remove("timeWarning");
        }
      }
      return;
    }
    timerStatus.innerHTML = "Timer: <b>Ready</b>";
    if (mTimer) {
      mTimer.style.display = "none";
      mTimer.classList.remove("timeWarning");
    }
  }

  function stopTimer() {
    if (timerInterval) {
      window.clearInterval(timerInterval);
      timerInterval = null;
    }
    timerExpire = null;
    timerRemaining = 0;
    timerLabel = "";
    renderTimerStatus();
  }

  function startTimer(seconds, label, onExpire) {
    stopTimer();
    if (!state?.timerEnabled) return;
    timerRemaining = Math.max(0, Math.floor(seconds));
    timerLabel = label;
    timerExpire = onExpire;
    renderTimerStatus();
    timerInterval = window.setInterval(() => {
      timerRemaining = Math.max(0, timerRemaining - 1);
      renderTimerStatus();
      if (timerRemaining > 0) return;
      const expire = timerExpire;
      stopTimer();
      if (expire) expire();
    }, 1000);
  }

  function clueTimerSeconds(roundIndex) {
    return roundIndex === 1 ? 30 : 15;
  }

  function hideGameEndOverlay() {
    if (gameEndOverlay) {
      gameEndOverlay.style.display = "none";
    }
  }

  function navigateToLobby() {
    const href = platformHubHref();
    if (!href) return;
    if (window.top && window.top !== window) {
      window.top.location.href = href;
      return;
    }
    window.location.href = href;
  }

  function showGameEndOverlay() {
    if (!state || state.roundIndex !== 2 || state.final?.stage !== ns.FINAL_STAGE.DONE) return;
    const sorted = state.players.slice().sort((left, right) => right.score - left.score);
    const winner = sorted[0];

    if (gameEndTitle) {
      gameEndTitle.textContent = `${boardDisplayName()} Complete`;
    }
    if (gameEndSummary) {
      gameEndSummary.textContent = `${winner?.name || "No winner"} takes the round with ${ns.fmtMoney(winner?.score || 0)}.`;
    }
    if (gameEndNote) {
      gameEndNote.textContent = "Replay immediately with the same players or head back to the lobby to choose another game.";
    }
    if (gameEndStandings) {
      gameEndStandings.innerHTML = "";
      sorted.forEach((player, index) => {
        const row = document.createElement("div");
        row.className = `endPlayer${index === 0 ? " top" : ""}`;
        row.innerHTML = `
          <div style="display:flex; align-items:center; gap:12px; min-width:0;">
            <span class="place">${index + 1}</span>
            <div style="min-width:0;">
              <div class="winner">${player.name}</div>
              <div class="k">${index === 0 ? "Winner" : "Final standing"}</div>
            </div>
          </div>
          <div style="font-weight:1000; color:var(--gold);">${ns.fmtMoney(player.score)}</div>
        `;
        gameEndStandings.appendChild(row);
      });
    }

    if (gameEndOverlay) {
      gameEndOverlay.style.display = "flex";
    }
  }

  function renderNameFields() {
    const count = Number(playerCountEl.value);
    nameFields.innerHTML = "";
    for (let index = 0; index < count; index += 1) {
      const label = document.createElement("label");
      label.textContent = `Player ${index + 1} name`;
      const input = document.createElement("input");
      input.id = `pname_${index}`;
      input.placeholder = `Player ${index + 1}`;
      input.autocomplete = "off";
      nameFields.appendChild(label);
      nameFields.appendChild(input);
    }
  }

  function showSetup() {
    hideGameEndOverlay();
    setupScreen.style.display = "flex";
    app.style.display = "none";
  }

  function showGame() {
    hideGameEndOverlay();
    setupScreen.style.display = "none";
    app.style.display = "flex";
  }

  function save() {
    if (!state) return;
    stateAdapter.saveState(state);
  }

  function load() {
    const loaded = stateAdapter.loadState();
    if (!loaded) {
      alert("No saved game found.");
      return;
    }
    state = ensureLoadedStateShape(loaded.state);
    showGame();
    renderAll();
    if (loaded.regeneratedCurrent) {
      showToast("Corrupted local save replaced with a fresh local board.");
    } else if (loaded.salvagedLegacy) {
      showToast("Legacy save restored with a fresh local board.");
    } else {
      showToast("Loaded.");
    }
  }

  function forceCloseOverlay() {
    overlay.style.display = "none";
    if (state) {
      state.opened = null;
      state.modal = { mode: "main", stealId: null, revealed: false };
    }
  }

  function hardReset() {
    if (!window.confirm("Reset everything?")) return;
    forceCloseOverlay();
    hideGameEndOverlay();
    stateAdapter.resetAll();
    state = null;
    showSetup();
    renderNameFields();
    showToast("Reset complete.");
  }

  function startGame(playerNames, categoryMode = "random") {
    hideGameEndOverlay();
    state = stateAdapter.createFreshState({
      playerNames,
      difficultyMode: "tv",
      categoryMode
    });
    state.timerEnabled = timerToggle?.checked === true;
    showGame();
    renderAll();
    showToast("Game started.");
  }

  function startNewGameSamePlayers() {
    const playerNames = state.players.map((player) => player.name);
    const categoryMode = state.categoryMode || "random";
    startGame(playerNames, categoryMode);
    showToast("New game. Fresh local board.");
  }

  function lowestScoreOtherPlayerId(activeId) {
    const others = state.players.filter((player) => player.id !== activeId);
    if (!others.length) return null;
    let best = others[0];
    for (const player of others) {
      if (player.score < best.score) best = player;
      else if (player.score === best.score && player.id < best.id) best = player;
    }
    return best.id;
  }

  function advanceTurn() {
    state.turnId = (state.turnId + 1) % state.players.length;
  }

  function roundLabel() {
    if (state.roundIndex === 0) return ns.ROUND_LABELS.r1;
    if (state.roundIndex === 1) return ns.ROUND_LABELS.r2;
    return ns.ROUND_LABELS.final;
  }

  function allUsedInRound(round) {
    return !!round?.categories && round.categories.every((category) => category.clues.every((clue) => clue.used));
  }

  function usedCountInRound(round) {
    if (!round?.categories) return { used: 0, total: 0 };
    let used = 0;
    let total = 0;
    for (const category of round.categories) {
      for (const clue of category.clues) {
        total += 1;
        if (clue.used) used += 1;
      }
    }
    return { used, total };
  }

  function roundTypeForIndex(roundIndex) {
    return roundIndex === 0 ? "r1" : "r2";
  }

  function buildSessionContextThroughPreviousRound(roundIndex) {
    const sessionContext = ns.createSessionContext();
    for (let index = 0; index < roundIndex; index += 1) {
      if (state.rounds[index]) ns.absorbBoardIntoSession(sessionContext, state.rounds[index]);
    }
    return sessionContext;
  }

  function placeDailyDouble(round, roundIndex) {
    for (const category of round.categories) {
      for (const clue of category.clues) clue.dd = false;
    }
    const eligible = [];
    round.categories.forEach((category, categoryIndex) => {
      category.clues.forEach((clue, clueIndex) => {
        if (clue.value >= 1000) eligible.push({ categoryIndex, clueIndex });
      });
    });
    if (!eligible.length) return;
    const rng = ns.mulberry32((state.seed + 1009 + roundIndex) >>> 0);
    const count = roundTypeForIndex(roundIndex) === "r2" ? 2 : 1;
    for (const pick of ns.shuffleWith(rng, eligible).slice(0, count)) {
      round.categories[pick.categoryIndex].clues[pick.clueIndex].dd = true;
    }
  }

  function getCategorySelectionState(roundType) {
    state.categorySelection = state.categorySelection || {};
    state.categorySelection[roundType] = state.categorySelection[roundType] || {
      confirmed: state.categoryMode !== "custom",
      selectedIds: []
    };
    state.categorySelection[roundType].selectedIds = Array.isArray(state.categorySelection[roundType].selectedIds)
      ? state.categorySelection[roundType].selectedIds
      : [];
    return state.categorySelection[roundType];
  }

  function categoryDraftOrder(needed) {
    const players = Array.isArray(state?.players) ? state.players : [];
    if (!players.length) return [];
    return Array.from({ length: needed }, (_, index) => players[index % players.length]);
  }

  function categoryDraftCounts(needed) {
    const counts = new Map((state?.players || []).map((player) => [player.id, 0]));
    for (const player of categoryDraftOrder(needed)) {
      counts.set(player.id, (counts.get(player.id) || 0) + 1);
    }
    return counts;
  }

  function refreshFinalOptionsFromCurrentRounds() {
    if (!state?.rounds?.[0] || !state?.rounds?.[1]) return;
    const sessionContext = ns.createSessionContext();
    ns.absorbBoardIntoSession(sessionContext, state.rounds[0]);
    ns.absorbBoardIntoSession(sessionContext, state.rounds[1]);
    const rng = ns.mulberry32((state.seed + 7001) >>> 0);
    const finalOptions = finalSelector.selectFinalOptions({
      rng,
      usageSnapshot: usageTracker.snapshot(),
      sessionContext,
      difficultyMode: "tv"
    });
    state.final = {
      options: finalOptions.map((option) => ({
        ...option,
        cat: option.categoryTitle,
        q: option.clue,
        a: option.canonicalResponse
      })),
      chosen: null,
      wagers: {},
      answers: {},
      suggestions: {},
      judged: {},
      stage: ns.FINAL_STAGE.CHOOSE
    };
  }

  function assembleRandomRoundForIndex(roundIndex) {
    const roundType = roundTypeForIndex(roundIndex);
    const sessionContext = buildSessionContextThroughPreviousRound(roundIndex);
    const rng = ns.mulberry32((state.seed + 2003 + roundIndex) >>> 0);
    const board = boardAssembler.assembleRound({
      roundType,
      rng,
      usageSnapshot: usageTracker.snapshot(),
      sessionPlan: ns.createSessionPlan(rng),
      sessionContext,
      difficultyMode: "tv"
    });
    placeDailyDouble(board, roundIndex);
    state.rounds[roundIndex] = board;
  }

  function confirmCustomCategories(roundIndex, selectedIds) {
    const roundType = roundTypeForIndex(roundIndex);
    const sessionContext = buildSessionContextThroughPreviousRound(roundIndex);
    const rng = ns.mulberry32((state.seed + 3001 + roundIndex) >>> 0);
    const board = boardAssembler.assembleCustomRound({
      roundType,
      categorySetIds: selectedIds,
      rng,
      usageSnapshot: usageTracker.snapshot(),
      sessionContext,
      difficultyMode: "tv"
    });
    placeDailyDouble(board, roundIndex);
    state.rounds[roundIndex] = board;
    state.categorySelection[roundType] = { confirmed: true, selectedIds: selectedIds.slice() };
    if (state.categorySelection.r1?.confirmed === true && state.categorySelection.r2?.confirmed === true) {
      refreshFinalOptionsFromCurrentRounds();
    }
    renderAll();
    showToast("Custom categories locked in.");
  }

  function useRandomCategoriesForRound(roundIndex) {
    const roundType = roundTypeForIndex(roundIndex);
    assembleRandomRoundForIndex(roundIndex);
    state.categorySelection[roundType] = { confirmed: true, selectedIds: [] };
    if (state.categorySelection.r1?.confirmed === true && state.categorySelection.r2?.confirmed === true) {
      refreshFinalOptionsFromCurrentRounds();
    }
    renderAll();
    showToast("Random categories kept.");
  }

  function renderCategoryPicker(roundIndex) {
    const roundType = roundTypeForIndex(roundIndex);
    const needed = 6;
    const selectionState = getCategorySelectionState(roundType);
    const sessionContext = buildSessionContextThroughPreviousRound(roundIndex);
    selectionState.selectedIds = selectionState.selectedIds.filter((id) => {
      const set = repository.categorySetsById.get(id);
      return set &&
        set.roundType === roundType &&
        !sessionContext.usedSourceCategoryIds.has(set.sourceCategoryId) &&
        !sessionContext.usedCategoryTitles.has(set.title);
    });
    const selectedIds = new Set(selectionState.selectedIds);
    const selectedTitles = new Set(
      [...selectedIds]
        .map((id) => repository.categorySetsById.get(id)?.title)
        .filter(Boolean)
    );
    const selected = [...selectedIds].map((id) => repository.categorySetsById.get(id)).filter(Boolean);
    const draftOrder = categoryDraftOrder(needed);
    const draftCounts = categoryDraftCounts(needed);
    const chooser = draftOrder[selected.length]?.name || "Ready";
    const selectedFamilyCounts = new Map();
    for (const set of selected) {
      selectedFamilyCounts.set(set.family, (selectedFamilyCounts.get(set.family) || 0) + 1);
    }
    const availableSets = repository
      .getCategorySetsForRound(roundType)
      .filter((set) => !sessionContext.usedSourceCategoryIds.has(set.sourceCategoryId))
      .filter((set) => !sessionContext.usedCategoryTitles.has(set.title))
      .slice()
      .sort((left, right) => left.title.localeCompare(right.title));
    const remaining = needed - selected.length;

    boardEl.innerHTML = "";
    boardEl.style.display = "block";

    const wrap = document.createElement("div");
    wrap.className = "final";
    wrap.innerHTML = `
      <div class="card">
        <div class="big">${ns.ROUND_LABELS[roundType]} Categories</div>
        <div class="pickerMeta">
          <span><b>${selected.length}/${needed}</b> selected</span>
          <span>Next pick: <b>${chooser}</b></span>
          <span>${remaining > 0 ? `${remaining} more` : "Ready to start"}</span>
        </div>
        <p class="step">Picks rotate evenly by player. The random board is still available.</p>
        <div class="draftGroups" id="categoryDraftGroups"></div>
        <div class="row" style="margin-top:12px;">
          <button class="btn primary" id="confirmCategoryPick" ${selected.length === needed ? "" : "disabled"}>Start Selected Round</button>
          <button class="btn" id="randomCategoryPick">Use Random Categories</button>
          <button class="btn ghost" id="resetCategoryPick" ${selected.length ? "" : "disabled"}>Reset Picks</button>
        </div>
        <div class="pickerGrid" id="categoryPickerGrid"></div>
      </div>
    `;
    boardEl.appendChild(wrap);

    const draftGroups = document.getElementById("categoryDraftGroups");
    draftGroups.innerHTML = "";
    state.players.forEach((player) => {
      const group = document.createElement("div");
      group.className = "draftGroup";
      const playerPicks = selected
        .map((set, index) => ({ set, owner: draftOrder[index] }))
        .filter((pick) => pick.owner?.id === player.id);
      const quota = draftCounts.get(player.id) || 0;
      const heading = document.createElement("div");
      heading.className = "draftGroupTitle";
      heading.textContent = `${player.name} (${playerPicks.length}/${quota})`;
      group.appendChild(heading);

      const picks = document.createElement("div");
      picks.className = "selectedCats";
      if (!playerPicks.length) {
        const empty = document.createElement("span");
        empty.className = "emptyPick";
        empty.textContent = "No picks yet";
        picks.appendChild(empty);
      }
      playerPicks.forEach(({ set }) => {
        const pill = document.createElement("button");
        pill.className = "btn small";
        pill.textContent = set.title;
        pill.title = "Remove this category";
        pill.addEventListener("click", () => {
          selectedIds.delete(set.id);
          selectionState.selectedIds = [...selectedIds];
          renderAll();
        });
        picks.appendChild(pill);
      });
      group.appendChild(picks);
      draftGroups.appendChild(group);
    });

    const grid = document.getElementById("categoryPickerGrid");
    availableSets.forEach((set) => {
      const button = document.createElement("button");
      button.className = "btn pickBtn";
      const familyCount = selectedFamilyCounts.get(set.family) || 0;
      const unavailable = selectedIds.has(set.id) || selectedTitles.has(set.title);
      const familyLimitReached = !selectedIds.has(set.id) && familyCount >= ns.MAX_CATEGORYS_PER_FAMILY_ON_BOARD;
      button.disabled = unavailable || selectedIds.size >= needed || familyLimitReached;
      button.textContent = set.title;
      button.title = familyLimitReached ? "Family limit reached for this board" : set.family;
      button.addEventListener("click", () => {
        if (selectedIds.size >= needed) return;
        if (selectedIds.has(set.id) || selectedTitles.has(set.title)) return;
        if ((selectedFamilyCounts.get(set.family) || 0) >= ns.MAX_CATEGORYS_PER_FAMILY_ON_BOARD) return;
        selectedIds.add(set.id);
        selectionState.selectedIds = [...selectedIds];
        renderAll();
      });
      grid.appendChild(button);
    });

    document.getElementById("confirmCategoryPick").addEventListener("click", () => {
      if (selectedIds.size !== needed) return;
      try {
        confirmCustomCategories(roundIndex, [...selectedIds]);
      } catch (error) {
        alert(error?.message || "Those categories could not be used.");
      }
    });
    document.getElementById("randomCategoryPick").addEventListener("click", () => useRandomCategoriesForRound(roundIndex));
    document.getElementById("resetCategoryPick").addEventListener("click", () => {
      selectionState.selectedIds = [];
      renderAll();
    });
    progressEl.textContent = `${selected.length}/${needed}`;
    nextRoundBtn.disabled = true;
  }

  function renderScores() {
    scoresEl.innerHTML = "";
    state.players.forEach((player) => {
      const card = document.createElement("div");
      card.className = `p${player.id === state.turnId ? " active" : ""}`;

      const name = document.createElement("div");
      name.className = "name";
      name.textContent = player.name;
      if (player.id === state.turnId) {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = "TURN";
        name.appendChild(tag);
      }

      const money = document.createElement("div");
      money.className = "money";
      money.innerHTML = `<span>Score</span><b>${ns.fmtMoney(player.score)}</b>`;

      card.appendChild(name);
      card.appendChild(money);
      scoresEl.appendChild(card);
    });
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    boardEl.style.display = "";
    boardEl.style.gridTemplateColumns = "";
    boardEl.style.gridTemplateRows = "";

    if (state.roundIndex === 2) {
      renderFinalScreen();
      return;
    }

    const roundType = roundTypeForIndex(state.roundIndex);
    if (state.categoryMode === "custom" && state.categorySelection?.[roundType]?.confirmed !== true) {
      renderCategoryPicker(state.roundIndex);
      return;
    }

    const round = state.rounds[state.roundIndex];
    const categories = round.categories;
    categories.forEach((category) => {
      const cell = document.createElement("div");
      cell.className = "cat";
      cell.textContent = category.title;
      boardEl.appendChild(cell);
    });

    for (let row = 0; row < 5; row += 1) {
      for (let column = 0; column < 6; column += 1) {
        const clue = categories[column].clues[row];
        const cell = document.createElement("div");
        cell.className = "cell";

        const button = document.createElement("button");
        button.className = `tile${clue.used ? " used" : ""}`;
        button.disabled = clue.used;
        button.textContent = clue.used ? "" : `$${clue.value}`;
        button.addEventListener("click", () => openClue(state.roundIndex, column, row));

        cell.appendChild(button);
        boardEl.appendChild(cell);
      }
    }

    const counts = usedCountInRound(round);
    progressEl.textContent = `${counts.used}/${counts.total}`;
    nextRoundBtn.disabled = !allUsedInRound(round);
    nextRoundBtn.textContent = state.roundIndex === 0 ? "Go to Double Round" : "Go to Final Clue";
  }

  function renderFooter() {
    roundPill.innerHTML = `Round: <b>${roundLabel()}</b>`;
    turnNameEl.textContent = state.players[state.turnId]?.name || "-";
  }

  function renderAll() {
    if (timerToggle) timerToggle.checked = state?.timerEnabled === true;
    renderTimerStatus();
    renderScores();
    renderFooter();
    renderBoard();
    save();
  }

  function currentQuestion() {
    const ref = state.opened;
    const round = state.rounds[ref.roundIndex];
    return round.categories[ref.catIndex].clues[ref.clueIndex];
  }

  function questionResponse(clue) {
    return clue?.response || clue?.canonicalResponse || clue?.a || clue?.answer || "";
  }

  function effectiveValue() {
    const clue = currentQuestion();
    return clue.value * (state.opened?.mult || 1);
  }

  function updateModalValue() {
    const value = effectiveValue();
    if (state?.opened?.mult === 2) {
      mVal.textContent = `$${value} (2x)`;
    } else if (state?.modal?.mode === "dd") {
      mVal.textContent = `$${value} (Double available)`;
    } else {
      mVal.textContent = `$${value}`;
    }
  }

  function chooseDailyDouble(useDouble) {
    if (!state?.opened) return;
    const { roundIndex, catIndex, clueIndex } = state.opened;
    const round = state.rounds[roundIndex];
    const category = round.categories[catIndex];
    const clue = category.clues[clueIndex];

    state.opened.mult = useDouble ? 2 : 1;
    state.modal = { mode: "main", stealId: null, revealed: false, timeUp: false };
    mCat.textContent = category.title;
    mClue.textContent = clue.clue;
    mAnswer.style.display = "none";
    mAnswer.textContent = "";
    revealBtn.disabled = false;
    updateModalValue();
    whoBox.innerHTML = `Up: <b>${state.players[state.turnId].name}</b>`;
    mNote.textContent = useDouble ? "Daily Double activated (2x)." : "Daily Double declined (regular value).";
    renderActionButtons();
    showToast(useDouble ? "Daily Double: 2x activated." : "Daily Double: regular value.");
    startTimer(clueTimerSeconds(roundIndex), "Clue", () => {
      if (!state?.opened) return;
      state.modal.timeUp = true;
      mNote.textContent = "Time is up. Skip this clue or close it.";
      revealBtn.disabled = true;
      renderActionButtons();
      showToast("Time is up.");
    });
  }

  function openClue(roundIndex, catIndex, clueIndex) {
    const round = state.rounds[roundIndex];
    const category = round.categories[catIndex];
    const clue = category.clues[clueIndex];
    if (clue.used) return;

    if (clue.dd && clue.value >= 1000) {
      clue.dd = false;
      state.opened = { roundIndex, catIndex, clueIndex, mult: 1 };
      state.modal = { mode: "dd", stealId: null, revealed: false };
      mCat.textContent = category.title;
      mClue.textContent = "DAILY DOUBLE! Choose how to play this clue.";
      mAnswer.style.display = "none";
      mAnswer.textContent = "";
      revealBtn.disabled = true;
      updateModalValue();
      whoBox.innerHTML = `Up: <b>${state.players[state.turnId].name}</b>`;
      mNote.textContent = "Daily Double: choose Play for 2x to double wins/losses, or Regular for face value.";
      renderActionButtons();
      overlay.style.display = "flex";
      return;
    }

    state.opened = { roundIndex, catIndex, clueIndex, mult: 1 };
    state.modal = { mode: "main", stealId: null, revealed: false, timeUp: false };
    mCat.textContent = category.title;
    mClue.textContent = clue.clue;
    mAnswer.style.display = "none";
    mAnswer.textContent = "";
    revealBtn.disabled = false;
    updateModalValue();
    whoBox.innerHTML = `Up: <b>${state.players[state.turnId].name}</b>`;
    mNote.textContent = `Up: ${state.players[state.turnId].name}. Host: mark Correct / Incorrect / Pass. (Pass gives no penalty but allows one steal attempt by the lowest-score other player.)`;
    renderActionButtons();
    overlay.style.display = "flex";
    startTimer(clueTimerSeconds(roundIndex), "Clue", () => {
      if (!state?.opened) return;
      state.modal.timeUp = true;
      mNote.textContent = "Time is up. Skip this clue or close it.";
      revealBtn.disabled = true;
      renderActionButtons();
      showToast("Time is up.");
    });
  }

  function closeModal() {
    if (state?.modal?.mode === "dd") {
      chooseDailyDouble(false);
      return;
    }
    overlay.style.display = "none";
    stopTimer();
    state.opened = null;
    state.modal = { mode: "main", stealId: null, revealed: false };
  }

  function markUsed() {
    currentQuestion().used = true;
  }

  function renderActionButtons() {
    actionButtons.innerHTML = "";
    const value = effectiveValue();

    if (state.modal.mode === "dd") {
      const doubleButton = document.createElement("button");
      doubleButton.className = "btn primary";
      doubleButton.textContent = "Play for 2x";
      doubleButton.addEventListener("click", () => chooseDailyDouble(true));

      const regularButton = document.createElement("button");
      regularButton.className = "btn";
      regularButton.textContent = "Regular";
      regularButton.addEventListener("click", () => chooseDailyDouble(false));

      actionButtons.appendChild(doubleButton);
      actionButtons.appendChild(regularButton);
      return;
    }

    if (state.modal.timeUp) {
      const skip = document.createElement("button");
      skip.className = "btn danger";
      skip.textContent = "Time Up / Skip";
      skip.addEventListener("click", () => {
        markUsed();
        closeModal();
        advanceTurn();
        renderAll();
        showToast("Skipped.");
      });
      actionButtons.appendChild(skip);
      return;
    }

    if (state.modal.mode === "main") {
      const correct = document.createElement("button");
      correct.className = "btn primary";
      correct.textContent = "Correct (+)";
      correct.addEventListener("click", () => {
        state.players[state.turnId].score += value;
        markUsed();
        closeModal();
        advanceTurn();
        renderAll();
        showToast("Correct.");
      });

      const wrong = document.createElement("button");
      wrong.className = "btn danger";
      wrong.textContent = "Incorrect (-)";
      wrong.addEventListener("click", () => {
        state.players[state.turnId].score -= value;
        markUsed();
        closeModal();
        advanceTurn();
        renderAll();
        showToast("Incorrect.");
      });

      const pass = document.createElement("button");
      pass.className = "btn";
      pass.textContent = "Pass (No Penalty)";
      pass.addEventListener("click", () => {
        const stealId = lowestScoreOtherPlayerId(state.turnId);
        if (stealId === null) {
          markUsed();
          closeModal();
          advanceTurn();
          renderAll();
          showToast("Passed (solo).");
          return;
        }
        state.modal = { mode: "steal", stealId, revealed: false };
        whoBox.innerHTML = `Steal attempt: <b>${state.players[stealId].name}</b>`;
        mNote.textContent = `Pass = no penalty. Steal goes to the lowest-score other player: ${state.players[stealId].name}. Host marks Steal Correct / Steal Incorrect / No Steal.`;
        renderActionButtons();
        startTimer(clueTimerSeconds(state.opened.roundIndex), "Steal", () => {
          if (!state?.opened) return;
          state.modal.timeUp = true;
          mNote.textContent = "Steal time is up. Skip this clue.";
          revealBtn.disabled = true;
          renderActionButtons();
          showToast("Time is up.");
        });
      });

      actionButtons.appendChild(correct);
      actionButtons.appendChild(wrong);
      actionButtons.appendChild(pass);
      return;
    }

    const stealId = state.modal.stealId;
    const stealCorrect = document.createElement("button");
    stealCorrect.className = "btn primary";
    stealCorrect.textContent = "Steal Correct (+)";
    stealCorrect.addEventListener("click", () => {
      state.players[stealId].score += value;
      markUsed();
      closeModal();
      advanceTurn();
      renderAll();
      showToast("Steal correct.");
    });

    const stealWrong = document.createElement("button");
    stealWrong.className = "btn danger";
    stealWrong.textContent = "Steal Incorrect (-)";
    stealWrong.addEventListener("click", () => {
      state.players[stealId].score -= value;
      markUsed();
      closeModal();
      advanceTurn();
      renderAll();
      showToast("Steal incorrect.");
    });

    const noSteal = document.createElement("button");
    noSteal.className = "btn";
    noSteal.textContent = "No Steal / Skip";
    noSteal.addEventListener("click", () => {
      markUsed();
      closeModal();
      advanceTurn();
      renderAll();
      showToast("No steal.");
    });

    actionButtons.appendChild(stealCorrect);
    actionButtons.appendChild(stealWrong);
    actionButtons.appendChild(noSteal);
  }

  function losingPlayerId() {
    let best = state.players[0];
    for (const player of state.players) {
      if (player.score < best.score) best = player;
      else if (player.score === best.score && player.id < best.id) best = player;
    }
    return best.id;
  }

  function firstUnwageredId() {
    for (const player of state.players) {
      if (state.final.wagers[player.id] === undefined) return player.id;
    }
    return null;
  }

  function firstUnansweredId() {
    for (const player of state.players) {
      if (state.final.answers[player.id] === undefined) return player.id;
    }
    return null;
  }

  function renderWagerUI(playerId, maxDefault) {
    const ui = document.getElementById("wagerUI");
    if (!ui) return;
    if (playerId === null) {
      state.final.stage = ns.FINAL_STAGE.CLUE;
      renderAll();
      showToast("Wagers complete.");
      return;
    }

    const player = state.players[playerId];
    const max = maxDefault(playerId);
    ui.innerHTML = `
      <div class="row">
        <div>
          <div class="k">Pass the screen to:</div>
          <div style="font-size:18px; font-weight:1000;">${player.name}</div>
          <div class="k">Max wager: <b style="color:var(--gold)">${ns.fmtMoney(max)}</b></div>
        </div>
        <div style="min-width:260px;">
          <label>Wager amount</label>
          <input id="wagerInput" type="number" min="0" max="${max}" step="1" value="${Math.min(1000, Math.max(0, max))}">
        </div>
      </div>
      <div class="row" style="margin-top:10px;">
        <div class="k">Others look away.</div>
        <button class="btn primary" id="saveWagerBtn">Save Wager</button>
      </div>
    `;

    $("saveWagerBtn").addEventListener("click", () => {
      stopTimer();
      const raw = Number($("wagerInput").value);
      state.final.wagers[playerId] = ns.clamp(Math.floor(Number.isFinite(raw) ? raw : 0), 0, max);
      save();
      renderWagerUI(firstUnwageredId(), maxDefault);
    });
    startTimer(15, "Wager", () => {
      const input = $("wagerInput");
      const raw = Number(input?.value);
      state.final.wagers[playerId] = ns.clamp(Math.floor(Number.isFinite(raw) ? raw : 0), 0, max);
      save();
      showToast("Wager time is up.");
      renderWagerUI(firstUnwageredId(), maxDefault);
    });
  }

  function renderAnswerUI(playerId) {
    const ui = document.getElementById("answerUI");
    if (!ui) return;
    if (playerId === null) {
      state.final.stage = ns.FINAL_STAGE.JUDGE;
      renderAll();
      showToast("Responses saved.");
      return;
    }

    const player = state.players[playerId];
    ui.innerHTML = `
      <div class="row">
        <div>
          <div class="k">Pass the screen to:</div>
          <div style="font-size:18px; font-weight:1000;">${player.name}</div>
          <div class="k">Wager: <b style="color:var(--gold)">${ns.fmtMoney(state.final.wagers[playerId] ?? 0)}</b></div>
        </div>
        <div style="min-width:320px; flex:1;">
          <label>Type your response</label>
          <textarea id="finalAnswerText" placeholder="Type your response here... (others look away)"></textarea>
        </div>
      </div>
      <div class="row" style="margin-top:10px;">
        <div class="k">After saving, pass the screen to the next player.</div>
        <button class="btn primary" id="saveAnswerBtn">Save Response</button>
      </div>
    `;

    $("saveAnswerBtn").addEventListener("click", () => {
      const text = String($("finalAnswerText").value || "").trim();
      state.final.answers[playerId] = text;
      state.final.suggestions[playerId] = answerMatcher.match(text, state.final.chosen).matched;
      save();
      renderAnswerUI(firstUnansweredId());
    });
  }

  function renderJudgeUI() {
    const list = document.getElementById("judgeList");
    list.innerHTML = "";

    for (const player of state.players) {
      const wager = state.final.wagers[player.id] ?? 0;
      const answer = state.final.answers[player.id] ?? "(no response)";
      const judged = state.final.judged[player.id];
      const suggested = state.final.suggestions[player.id] ?? answerMatcher.match(answer, state.final.chosen).matched;

      const row = document.createElement("div");
      row.style.borderBottom = "1px solid rgba(255,255,255,.10)";
      row.style.padding = "10px 0";
      row.innerHTML = `
        <div class="row">
          <div>
            <div style="font-weight:1000;">${player.name} <span class="k">(wager ${ns.fmtMoney(wager)})</span></div>
            <div class="k">Response: <b style="color:var(--text)">${answer || "(blank)"}</b></div>
            <div class="k">Match helper: <b style="color:${suggested ? 'var(--good)' : 'var(--muted)'}">${suggested ? "likely correct" : "no automatic match"}</b></div>
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn small primary" data-id="${player.id}" data-ok="1">Correct</button>
            <button class="btn small danger" data-id="${player.id}" data-ok="0">Incorrect</button>
          </div>
        </div>
        <div class="k">Judged: <b style="color:${judged === true ? 'var(--good)' : judged === false ? 'var(--bad)' : 'var(--muted)'}">${judged === true ? "Correct" : judged === false ? "Incorrect" : "-"}</b></div>
      `;
      list.appendChild(row);
    }

    list.querySelectorAll("button[data-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const playerId = Number(button.getAttribute("data-id"));
        const correct = button.getAttribute("data-ok") === "1";

        if (state.final.judged[playerId] !== undefined) {
          const previous = state.final.judged[playerId];
          const wager = state.final.wagers[playerId] ?? 0;
          state.players[playerId].score -= previous ? wager : -wager;
        }

        const wager = state.final.wagers[playerId] ?? 0;
        state.players[playerId].score += correct ? wager : -wager;
        state.final.judged[playerId] = correct;
        save();
        renderScores();

        const allJudged = state.players.every((player) => state.final.judged[player.id] !== undefined);
        $("finishFinalBtn").disabled = !allJudged;
      });
    });

    $("finishFinalBtn").addEventListener("click", () => {
      if ($("finishFinalBtn").disabled) return;
      state.final.stage = ns.FINAL_STAGE.DONE;
      renderAll();
    });
  }

  function renderFinalScreen() {
    const wrap = document.createElement("div");
    wrap.className = "final";

    const loserId = losingPlayerId();
    const loserName = state.players[loserId]?.name || "-";

    const top = document.createElement("div");
    top.className = "card";
    top.innerHTML = `
      <div class="big">Final Clue</div>
      <p class="step">
        The player currently losing (<b style="color:var(--gold)">${loserName}</b>) chooses the category.
        Then everyone wagers and answers one at a time (pass the screen).
      </p>
    `;
    wrap.appendChild(top);

    nextRoundBtn.textContent = "Final Clue";
    nextRoundBtn.disabled = true;
    progressEl.textContent = "Final";

    if (state.final.stage === ns.FINAL_STAGE.CHOOSE) {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="big">Choose a Category</div>
        <p class="step"><b>${loserName}</b>, pick one:</p>
        <div class="choices" id="finalChoices"></div>
      `;
      wrap.appendChild(card);

      window.setTimeout(() => {
        const choices = document.getElementById("finalChoices");
        choices.innerHTML = "";
        state.final.options.forEach((option, index) => {
          const node = document.createElement("div");
          node.className = "choice";
          node.innerHTML = `<div class="k">Option ${index + 1}</div><div style="font-weight:1000; font-size:16px;"><b>${option.cat}</b></div>`;
          node.addEventListener("click", () => {
            if (state.turnId !== loserId) {
              alert(`Category chooser is ${loserName}.`);
              return;
            }
            state.final.chosen = option;
            state.final.stage = ns.FINAL_STAGE.WAGERS;
            renderAll();
            showToast("Category chosen. Enter wagers.");
          });
          choices.appendChild(node);
        });
      }, 0);
    } else if (state.final.stage === ns.FINAL_STAGE.WAGERS) {
      const chosen = state.final.chosen;
      const maxDefault = (playerId) => {
        const score = state.players[playerId].score;
        return score > 0 ? score : 1000;
      };

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="big">Wagers</div>
        <p class="step">Category: <b style="color:var(--gold)">${chosen.cat}</b></p>
        <p class="step">Enter wagers one player at a time (others look away). Max wager is your score (or $1000 if you're at $0 or below).</p>
        <div class="divider"></div>
        <div id="wagerUI"></div>
      `;
      wrap.appendChild(card);
      window.setTimeout(() => renderWagerUI(firstUnwageredId(), maxDefault), 0);
    } else if (state.final.stage === ns.FINAL_STAGE.CLUE) {
      const chosen = state.final.chosen;
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="big">Final Clue</div>
        <p class="step">Category: <b style="color:var(--gold)">${chosen.cat}</b></p>
        <div class="divider"></div>
        <div class="clue" style="font-size:28px;">${chosen.q}</div>
        <div class="row" style="margin-top:10px;">
          <div class="k">Next: players enter responses one at a time.</div>
          <button class="btn primary" id="startAnswersBtn">Enter Responses</button>
        </div>
      `;
      wrap.appendChild(card);
      window.setTimeout(() => {
        startTimer(30, "Final", () => {
          showToast("Final answer time is up.");
          const button = $("startAnswersBtn");
          if (button) button.textContent = "Enter Locked Responses";
        });
        $("startAnswersBtn").addEventListener("click", () => {
          stopTimer();
          state.final.stage = ns.FINAL_STAGE.ANSWERS;
          renderAll();
        });
      }, 0);
    } else if (state.final.stage === ns.FINAL_STAGE.ANSWERS) {
      const chosen = state.final.chosen;
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="big">Enter Responses</div>
        <p class="step">Category: <b style="color:var(--gold)">${chosen.cat}</b></p>
        <p class="step">Clue: ${chosen.q}</p>
        <div class="divider"></div>
        <div id="answerUI"></div>
      `;
      wrap.appendChild(card);
      window.setTimeout(() => renderAnswerUI(firstUnansweredId()), 0);
    } else if (state.final.stage === ns.FINAL_STAGE.JUDGE) {
      const chosen = state.final.chosen;
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="big">Judge Final Clue</div>
        <p class="step">Category: <b style="color:var(--gold)">${chosen.cat}</b></p>
        <p class="step">Clue: ${chosen.q}</p>
        <div class="divider"></div>
        <div class="answerBox" style="display:block;">Expected response: ${questionResponse(chosen)}</div>
        <div class="divider"></div>
        <div id="judgeList"></div>
        <div class="row" style="margin-top:10px;">
          <div class="k">When all judged, click Finish.</div>
          <button class="btn primary" id="finishFinalBtn" disabled>Finish</button>
        </div>
      `;
      wrap.appendChild(card);
      window.setTimeout(() => renderJudgeUI(), 0);
    } else if (state.final.stage === ns.FINAL_STAGE.DONE) {
      const sorted = state.players.slice().sort((left, right) => right.score - left.score);
      const winner = sorted[0];
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="big">Game Over</div>
        <p class="step">Winner: <b style="color:var(--gold)">${winner?.name || "-"}</b> with <b style="color:var(--gold)">${ns.fmtMoney(winner?.score || 0)}</b></p>
        <div class="divider"></div>
        <div class="row">
          <div class="k">Start another randomized local-bank game any time.</div>
          <button class="btn primary" id="newGame2Btn">New Game (New Questions)</button>
        </div>
      `;
      wrap.appendChild(card);
      window.setTimeout(() => {
        $("newGame2Btn").addEventListener("click", startNewGameSamePlayers);
      }, 0);
      window.setTimeout(showGameEndOverlay, 0);
    }

    const finalCell = document.createElement("div");
    finalCell.style.gridColumn = "1 / -1";
    finalCell.style.gridRow = "1 / -1";
    finalCell.style.overflow = "auto";
    finalCell.appendChild(wrap);
    boardEl.appendChild(finalCell);
  }

  playerCountEl.addEventListener("change", renderNameFields);

  revealBtn.addEventListener("click", () => {
    if (!state?.opened) return;
    stopTimer();
    const clue = currentQuestion();
    mAnswer.textContent = `Expected response: ${questionResponse(clue)}`;
    mAnswer.style.display = "block";
  });

  closeModalBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeModal();
  });
  if (gameEndOverlay) {
    gameEndOverlay.addEventListener("click", (event) => {
      if (event.target === gameEndOverlay) hideGameEndOverlay();
    });
  }
  window.addEventListener("keydown", (event) => {
    if (overlay.style.display === "flex" && event.key === "Escape") closeModal();
    if (gameEndOverlay?.style.display === "flex" && event.key === "Escape") hideGameEndOverlay();
  });

  if (closeGameEndBtn) {
    closeGameEndBtn.addEventListener("click", hideGameEndOverlay);
  }
  if (playAgainBtn) {
    playAgainBtn.addEventListener("click", startNewGameSamePlayers);
  }
  if (backToLobbyBtn) {
    backToLobbyBtn.addEventListener("click", navigateToLobby);
  }

  nextRoundBtn.addEventListener("click", () => {
    if (!state) return;
    if (state.roundIndex === 0) {
      state.roundIndex = 1;
      showToast("Double Round!");
    } else if (state.roundIndex === 1) {
      refreshFinalOptionsFromCurrentRounds();
      state.roundIndex = 2;
      state.final.stage = ns.FINAL_STAGE.CHOOSE;
      state.turnId = losingPlayerId();
      showToast("Final Clue! Losing player chooses category.");
    }
    renderAll();
  });

  newGameBtn.addEventListener("click", () => {
    if (!window.confirm("Start a NEW game with NEW questions? (Scores reset)")) return;
    startNewGameSamePlayers();
  });

  editPlayersBtn.addEventListener("click", () => {
    if (!window.confirm("Edit players? Current game will be replaced.")) return;
    forceCloseOverlay();
    showSetup();
  });

  saveBtn.addEventListener("click", () => {
    save();
    showToast("Saved.");
  });
  loadBtn.addEventListener("click", load);
  resetBtn.addEventListener("click", hardReset);
  if (timerToggle) {
    timerToggle.addEventListener("change", () => {
      if (!state) {
        renderTimerStatus();
        return;
      }
      state.timerEnabled = timerToggle.checked;
      if (!state.timerEnabled) stopTimer();
      renderTimerStatus();
      save();
    });
  }

  startBtn.addEventListener("click", () => {
    const count = Number(playerCountEl.value);
    const playerNames = [];
    for (let index = 0; index < count; index += 1) {
      playerNames.push($(`pname_${index}`)?.value || "");
    }
    startGame(playerNames, categoryModeEl?.value || "random");
  });

  quickBtn.addEventListener("click", () => {
    const count = Number(playerCountEl.value);
    const playerNames = Array.from({ length: count }, (_, index) => `Player ${index + 1}`);
    startGame(playerNames, categoryModeEl?.value || "random");
  });

  function hydrateFromSavedState() {
    const loaded = stateAdapter.loadState();
    if (!loaded) {
      showSetup();
      return;
    }
    state = ensureLoadedStateShape(loaded.state);
    showGame();
    renderAll();
    if (loaded.regeneratedCurrent) {
      showToast("Corrupted local save replaced with a fresh local board.");
    } else if (loaded.salvagedLegacy) {
      showToast("Legacy save restored with a fresh local board.");
    }
  }

  try {
    bootRuntime();
  } catch (error) {
    console.error("Quizler Jeopardy runtime startup failed.", error);
    renderFatalError(error);
    return;
  }

  renderNameFields();
  hydrateFromSavedState();
})(window.Jeopardy = window.Jeopardy || {});
