// State Management
let state = {
    quests: [],
    player: {
        level: 1,
        exp: 0,
        rank: 'Fランク冒険者',
        totalMinutes: 0,
        defeatedCount: 0,
        resistedCount: 0
    },
    history: [],
    activeQuestId: null,
    selectedMonster: 'slime',
    selectedDuration: 15, // in minutes
    timer: {
        intervalId: null,
        remainingSeconds: 0,
        totalSeconds: 0,
        isRunning: false
    },
    battle: {
        playerHp: 100,
        monsterHp: 100,
        isWarningActive: false
    },
    weeklyStats: {
        // format: 'YYYY-MM-DD': minutes
    }
};

// Web Audio API Context & Nodes
let audioCtx = null;
let currentSoundType = null;
let soundNodes = {
    noiseNode: null,
    filterNode: null,
    gainNode: null,
    scriptNode: null // for fire crackle generator
};

// Monster Specs
const MONSTER_SPECS = {
    slime: { name: 'ダラダラスライム', emoji: '💧', baseExp: 30, dmgMultiplier: 1.0 },
    dragon: { name: '無限スクロール・ドラゴン', emoji: '🐲', baseExp: 80, dmgMultiplier: 1.5 },
    imp: { name: 'ショート動画インプ', emoji: '😈', baseExp: 150, dmgMultiplier: 2.0 }
};

// Ranks
const RANKS = [
    { minLevel: 1, name: 'Fランク冒険者' },
    { minLevel: 3, name: 'Eランク戦士' },
    { minLevel: 5, name: 'Dランク魔導士' },
    { minLevel: 8, name: 'Cランク熟練兵' },
    { minLevel: 12, name: 'Bランク討伐王' },
    { minLevel: 17, name: 'Aランク大賢者' },
    { minLevel: 25, name: 'Sランクギルドマスター' }
];

// Elements
const el = {
    btnShowQuestModal: document.getElementById('btn-show-quest-modal'),
    questModal: document.getElementById('quest-modal'),
    btnCloseQuestModal: document.getElementById('btn-close-quest-modal'),
    questForm: document.getElementById('quest-form'),
    questListContainer: document.getElementById('quest-list-container'),
    
    battleSetupScreen: document.getElementById('battle-setup-screen'),
    battleActiveScreen: document.getElementById('battle-active-screen'),
    battleResultScreen: document.getElementById('battle-result-screen'),
    
    monsterCards: document.querySelectorAll('.monster-card'),
    durationButtons: document.querySelectorAll('.duration-select .btn'),
    btnStartBattle: document.getElementById('btn-start-battle'),
    
    activeQuestBadge: document.getElementById('active-quest-badge'),
    activeQuestTitle: document.getElementById('active-quest-title'),
    
    playerHpBar: document.getElementById('player-hp'),
    playerHpText: document.getElementById('player-hp-text'),
    monsterHpBar: document.getElementById('monster-hp'),
    monsterHpText: document.getElementById('monster-hp-text'),
    monsterName: document.getElementById('battle-monster-name'),
    monsterSprite: document.getElementById('battle-monster-sprite'),
    
    timerDisplay: document.getElementById('timer-display'),
    tabWarning: document.getElementById('tab-warning'),
    
    btnEscapeBattle: document.getElementById('btn-escape-battle'),
    btnResistUrge: document.getElementById('btn-resist-urge'),
    
    resultIcon: document.getElementById('result-icon'),
    resultTitle: document.getElementById('result-title'),
    resultDesc: document.getElementById('result-desc'),
    rewardExp: document.getElementById('reward-exp'),
    rewardProgress: document.getElementById('reward-progress'),
    btnResultClose: document.getElementById('btn-result-close'),
    
    guildRank: document.getElementById('guild-rank'),
    playerLevel: document.getElementById('player-level'),
    expFill: document.getElementById('exp-fill'),
    expText: document.getElementById('exp-text'),
    
    statTotalTime: document.getElementById('stat-total-time'),
    statDefeatedMonsters: document.getElementById('stat-defeated-monsters'),
    statResistedUrges: document.getElementById('stat-resisted-urges'),
    historyList: document.getElementById('history-list'),
    
    urgeModal: document.getElementById('urge-modal'),
    breathingCircle: document.getElementById('breathing-circle'),
    breathingInstruction: document.getElementById('breathing-instruction'),
    breathingTimer: document.getElementById('breathing-timer'),
    btnSkipUrge: document.getElementById('btn-skip-urge')
};

// Chart Instance
let weeklyChart = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    renderQuests();
    updatePlayerUI();
    updateStatsUI();
    initChart();
    setupEventListeners();
    
    // Page Visibility API
    document.addEventListener('visibilitychange', handleVisibilityChange);
});

// Setup Listeners
function setupEventListeners() {
    // Quest Modals
    el.btnShowQuestModal.addEventListener('click', () => el.questModal.classList.remove('hidden'));
    el.btnCloseQuestModal.addEventListener('click', () => el.questModal.classList.add('hidden'));
    el.questModal.addEventListener('click', (e) => {
        if (e.target === el.questModal) el.questModal.classList.add('hidden');
    });
    
    el.questForm.addEventListener('submit', handleAddQuest);
    
    // Monster Cards Selection
    el.monsterCards.forEach(card => {
        card.addEventListener('click', () => {
            el.monsterCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            state.selectedMonster = card.dataset.monster;
            checkStartBattleValidity();
        });
    });
    
    // Duration Buttons
    el.durationButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            el.durationButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.selectedDuration = parseInt(btn.dataset.time);
        });
    });
    
    // Start / Escape / Result buttons
    el.btnStartBattle.addEventListener('click', startFocusBattle);
    el.btnEscapeBattle.addEventListener('click', escapeFocusBattle);
    el.btnResultClose.addEventListener('click', closeResultScreen);
    
    // Ambient Sound Buttons
    document.querySelectorAll('.btn-sound').forEach(btn => {
        btn.addEventListener('click', () => {
            const soundType = btn.dataset.sound;
            toggleAmbientSound(soundType, btn);
        });
    });
    
    // Urge Buttons
    el.btnResistUrge.addEventListener('click', openUrgeModal);
    el.btnSkipUrge.addEventListener('click', closeUrgeModal);
}

// Check if a quest is selected to enable "Start Battle"
function checkStartBattleValidity() {
    if (state.activeQuestId) {
        el.btnStartBattle.disabled = false;
    } else {
        el.btnStartBattle.disabled = true;
    }
}

// -------------------------------------------------------------
// QUEST OPERATIONS
// -------------------------------------------------------------
function handleAddQuest(e) {
    e.preventDefault();
    const title = document.getElementById('quest-title').value.trim();
    const deadlineVal = document.getElementById('quest-deadline').value;
    const estPomos = parseInt(document.getElementById('quest-est-pomos').value);
    const difficulty = document.querySelector('input[name="difficulty"]:checked').value;
    
    if (!title || !deadlineVal) return;
    
    const newQuest = {
        id: 'q_' + Date.now(),
        title,
        deadline: new Date(deadlineVal).toISOString(),
        estPomos,
        completedPomos: 0,
        difficulty,
        isCompleted: false
    };
    
    state.quests.push(newQuest);
    saveData();
    renderQuests();
    
    // Reset and Close Modal
    el.questForm.reset();
    el.questModal.classList.add('hidden');
}

function selectQuest(questId) {
    if (state.timer.isRunning) return; // Prevent selecting different quest mid-battle
    
    state.activeQuestId = questId;
    const quest = state.quests.find(q => q.id === questId);
    
    if (quest) {
        el.activeQuestTitle.textContent = quest.title;
        el.activeQuestBadge.classList.remove('hidden');
    }
    
    renderQuests();
    checkStartBattleValidity();
}

function deleteQuest(questId, event) {
    event.stopPropagation(); // Avoid selecting the quest when deleting
    
    if (state.timer.isRunning && state.activeQuestId === questId) {
        alert("討伐中は対象の課題を削除できません！");
        return;
    }
    
    if (confirm("本当にこの依頼を破棄しますか？")) {
        state.quests = state.quests.filter(q => q.id !== questId);
        if (state.activeQuestId === questId) {
            state.activeQuestId = null;
            el.activeQuestTitle.textContent = "未選択";
        }
        saveData();
        renderQuests();
        checkStartBattleValidity();
    }
}

function getDeadlineStatus(deadlineStr) {
    const now = new Date();
    const deadline = new Date(deadlineStr);
    const diffMs = deadline - now;
    const diffHrs = diffMs / (1000 * 60 * 60);
    
    if (diffMs < 0) {
        return { text: "期限切れ", class: "deadline-danger" };
    } else if (diffHrs < 24) {
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        return { text: `残り ${Math.floor(diffHrs)}時間${mins}分`, class: "deadline-danger" };
    } else if (diffHrs < 72) {
        return { text: `残り ${Math.floor(diffHrs / 24)}日 (${Math.floor(diffHrs % 24)}時間)`, class: "deadline-warning" };
    } else {
        return { text: `残り ${Math.floor(diffHrs / 24)}日`, class: "" };
    }
}

function renderQuests() {
    el.questListContainer.innerHTML = '';
    
    if (state.quests.length === 0) {
        el.questListContainer.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-folder-open empty-icon"></i>
                <p>現在アクティブな依頼（課題）はありません。</p>
                <p class="empty-sub">新しい依頼を登録して冒険を始めましょう！</p>
            </div>`;
        return;
    }
    
    // Sort quests: incomplete first, then by deadline
    const sortedQuests = [...state.quests].sort((a, b) => {
        if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
        return new Date(a.deadline) - new Date(b.deadline);
    });
    
    sortedQuests.forEach(quest => {
        const isSelected = quest.id === state.activeQuestId;
        const dlStatus = getDeadlineStatus(quest.deadline);
        
        const item = document.createElement('div');
        item.className = `quest-item ${isSelected ? 'selected' : ''} ${quest.isCompleted ? 'completed-quest' : ''}`;
        if (quest.isCompleted) item.style.opacity = '0.6';
        
        // Progress cells rendering
        let progressCellsHTML = '';
        for (let i = 0; i < quest.estPomos; i++) {
            const isDone = i < quest.completedPomos;
            progressCellsHTML += `<div class="quest-progress-cell ${isDone ? 'completed' : ''}"></div>`;
        }
        
        let difficultyLabel = 'EASY';
        let difficultyClass = 'diff-easy';
        if (quest.difficulty === 'medium') {
            difficultyLabel = 'MEDIUM';
            difficultyClass = 'diff-medium';
        } else if (quest.difficulty === 'hard') {
            difficultyLabel = 'HARD';
            difficultyClass = 'diff-hard';
        }
        
        item.innerHTML = `
            <div class="quest-item-header">
                <div class="quest-item-title" style="${quest.isCompleted ? 'text-decoration: line-through;' : ''}">
                    ${quest.isCompleted ? '<i class="fa-solid fa-circle-check text-green"></i> ' : ''}${quest.title}
                </div>
                <span class="difficulty-badge ${difficultyClass}">${difficultyLabel}</span>
            </div>
            
            <div class="quest-progress-track">
                ${progressCellsHTML}
            </div>
            
            <div class="quest-item-footer">
                <span class="quest-deadline ${dlStatus.class}">
                    <i class="fa-solid fa-hourglass-half"></i> ${quest.isCompleted ? '討伐完了' : dlStatus.text}
                </span>
                <button class="btn btn-sm btn-outline btn-delete-quest" style="padding: 2px 6px; font-size: 0.7rem; border-color: rgba(255, 71, 87, 0.3); color: var(--accent-red);" title="依頼を削除">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;
        
        if (!quest.isCompleted) {
            item.addEventListener('click', () => selectQuest(quest.id));
        }
        
        const deleteBtn = item.querySelector('.btn-delete-quest');
        deleteBtn.addEventListener('click', (e) => deleteQuest(quest.id, e));
        
        el.questListContainer.appendChild(item);
    });
}

// -------------------------------------------------------------
// BATTLE ENGINE (FOCUS TIMER)
// -------------------------------------------------------------
function startFocusBattle() {
    if (!state.activeQuestId) return;
    
    // Unlock Audio Context (Browsers require user gesture)
    initAudioContext();
    
    const monster = MONSTER_SPECS[state.selectedMonster];
    
    // Setup battle state
    state.battle.playerHp = 100;
    state.battle.monsterHp = 100;
    
    // Setup timer
    state.timer.totalSeconds = state.selectedDuration * 60;
    state.timer.remainingSeconds = state.timer.totalSeconds;
    state.timer.isRunning = true;
    
    // Update Battle Screen Info
    el.monsterName.textContent = monster.name;
    el.monsterSprite.textContent = monster.emoji;
    updateBattleHpUI();
    updateTimerDisplay();
    
    // Toggle views
    el.battleSetupScreen.classList.add('hidden');
    el.battleActiveScreen.classList.remove('hidden');
    
    // Play battle start audio effect (synthesized fan-fare)
    playSynthSound('start');
    
    // Run timer interval
    el.tabWarning.classList.add('hidden');
    state.timer.intervalId = setInterval(tickBattleTimer, 1000);
}

function tickBattleTimer() {
    if (state.timer.remainingSeconds > 0) {
        state.timer.remainingSeconds--;
        updateTimerDisplay();
        
        // Monster HP decreases proportionally to focus time
        const percentTimePassed = (state.timer.totalSeconds - state.timer.remainingSeconds) / state.timer.totalSeconds;
        state.battle.monsterHp = Math.round((1 - percentTimePassed) * 100);
        updateBattleHpUI();
        
        // Random visual attack tick from player
        if (state.timer.remainingSeconds % 10 === 0) {
            triggerVisualHitEffect('monster');
        }
    } else {
        // Victory!
        completeFocusBattle(true);
    }
}

function updateTimerDisplay() {
    const minutes = Math.floor(state.timer.remainingSeconds / 60);
    const seconds = state.timer.remainingSeconds % 60;
    const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    el.timerDisplay.textContent = formatted;
    document.title = `[討伐中 ${formatted}] FocusQuest`;
}

function updateBattleHpUI() {
    el.playerHpBar.style.width = `${state.battle.playerHp}%`;
    el.playerHpText.textContent = `${state.battle.playerHp} / 100 HP`;
    
    el.monsterHpBar.style.width = `${state.battle.monsterHp}%`;
    el.monsterHpText.textContent = `${state.battle.monsterHp} / 100 HP`;
    
    // Color thresholds
    if (state.battle.playerHp < 35) {
        el.playerHpBar.style.background = 'var(--accent-red)';
    } else {
        el.playerHpBar.style.background = 'linear-gradient(90deg, var(--accent-green), #05c46b)';
    }
}

function triggerVisualHitEffect(target) {
    const element = target === 'player' ? document.getElementById('player-sprite') : el.monsterSprite;
    element.style.transform = 'scale(0.8) rotate(-15deg)';
    element.style.filter = 'brightness(2) sepia(1) hue-rotate(-50deg)';
    
    setTimeout(() => {
        element.style.transform = '';
        element.style.filter = '';
    }, 250);
}

// Handle switching browser tabs / leaving the window
function handleVisibilityChange() {
    if (!state.timer.isRunning) return;
    
    if (document.visibilityState === 'hidden') {
        // Player left! Trigger damage
        state.battle.isWarningActive = true;
        el.tabWarning.classList.remove('hidden');
        
        // Monster attacks player
        const dmg = Math.round(15 * MONSTER_SPECS[state.selectedMonster].dmgMultiplier);
        state.battle.playerHp = Math.max(0, state.battle.playerHp - dmg);
        updateBattleHpUI();
        triggerVisualHitEffect('player');
        
        // Sound effect (Low synth buzz/damage sound)
        playSynthSound('damage');
        
        if (state.battle.playerHp <= 0) {
            completeFocusBattle(false);
        }
    } else {
        // Player returned
        setTimeout(() => {
            el.tabWarning.classList.add('hidden');
            state.battle.isWarningActive = false;
        }, 3000); // keep warning briefly
    }
}

// Finish Battle
function completeFocusBattle(isVictory) {
    clearInterval(state.timer.intervalId);
    state.timer.isRunning = false;
    document.title = "FocusQuest | スマホ魔王討伐ギルド";
    
    stopAllAmbientSounds();
    
    const monster = MONSTER_SPECS[state.selectedMonster];
    const quest = state.quests.find(q => q.id === state.activeQuestId);
    
    if (isVictory) {
        // Calculate EXP
        let expAwarded = monster.baseExp;
        if (quest.difficulty === 'medium') expAwarded = Math.round(expAwarded * 1.3);
        if (quest.difficulty === 'hard') expAwarded = Math.round(expAwarded * 1.8);
        
        // Increment Pomo progress on quest
        quest.completedPomos = Math.min(quest.estPomos, quest.completedPomos + 1);
        if (quest.completedPomos === quest.estPomos) {
            quest.isCompleted = true;
            state.activeQuestId = null; // Unselect once finished
            el.activeQuestTitle.textContent = "未選択";
            checkStartBattleValidity();
        }
        
        // Update player statistics
        state.player.exp += expAwarded;
        state.player.totalMinutes += state.selectedDuration;
        state.player.defeatedCount++;
        
        // Check for level up
        let leveledUp = false;
        while (state.player.exp >= state.player.level * 100) {
            state.player.exp -= state.player.level * 100;
            state.player.level++;
            leveledUp = true;
        }
        
        if (leveledUp) {
            updatePlayerRank();
        }
        
        // Update weekly stats
        const todayStr = new Date().toISOString().split('T')[0];
        state.weeklyStats[todayStr] = (state.weeklyStats[todayStr] || 0) + state.selectedDuration;
        
        // Add to history
        state.history.unshift({
            id: 'h_' + Date.now(),
            monsterName: monster.name,
            expEarned: expAwarded,
            questTitle: quest.title,
            date: new Date().toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        });
        
        // Render success overlays
        el.resultIcon.textContent = '🏆';
        el.resultTitle.textContent = '討伐成功！';
        el.resultDesc.textContent = `「${monster.name}」を討伐し、${quest.title} の修行（1コマ）を達成しました！`;
        el.rewardExp.textContent = `+${expAwarded}`;
        el.rewardProgress.textContent = `+1 集中コマ (${quest.completedPomos}/${quest.estPomos})`;
        
        playSynthSound('victory');
        
    } else {
        // Defeat
        el.resultIcon.textContent = '💀';
        el.resultTitle.textContent = '討伐失敗...';
        el.resultDesc.textContent = `スマホの魔力に負けてブラウザを閉じたか、逃亡してしまいました。`;
        el.rewardExp.textContent = `+0`;
        el.rewardProgress.textContent = `なし`;
        
        playSynthSound('defeat');
    }
    
    // Sync
    saveData();
    renderQuests();
    updatePlayerUI();
    updateStatsUI();
    updateChart();
    
    // Display result screen overlay
    el.battleResultScreen.classList.remove('hidden');
}

function escapeFocusBattle() {
    if (confirm("本当に逃亡しますか？（修行が未完了のまま終了し、ペナルティとなります）")) {
        completeFocusBattle(false);
    }
}

function closeResultScreen() {
    el.battleResultScreen.classList.add('hidden');
    el.battleActiveScreen.classList.add('hidden');
    el.battleSetupScreen.classList.remove('hidden');
}

// -------------------------------------------------------------
// BREATHING URGE SESSION (URGE SURFING)
// -------------------------------------------------------------
let urgeTimerInterval = null;
function openUrgeModal() {
    initAudioContext();
    el.urgeModal.classList.remove('hidden');
    
    let timeLeft = 30;
    el.breathingTimer.textContent = timeLeft;
    
    // Visual breath loop (4s inhale / 4s hold / 4s exhale / 4s hold...)
    let tickCount = 0;
    
    function runBreathingInstruction() {
        const cycle = tickCount % 16;
        if (cycle >= 0 && cycle < 4) {
            el.breathingInstruction.textContent = "吸って...";
            el.breathingCircle.style.transform = 'scale(2.0)';
            el.breathingCircle.style.transition = 'transform 4s ease-out';
        } else if (cycle >= 4 && cycle < 8) {
            el.breathingInstruction.textContent = "止めて...";
            el.breathingCircle.style.transform = 'scale(2.0)';
            el.breathingCircle.style.transition = 'none';
        } else if (cycle >= 8 && cycle < 12) {
            el.breathingInstruction.textContent = "吐いて...";
            el.breathingCircle.style.transform = 'scale(1.0)';
            el.breathingCircle.style.transition = 'transform 4s ease-in';
        } else {
            el.breathingInstruction.textContent = "止めて...";
            el.breathingCircle.style.transform = 'scale(1.0)';
            el.breathingCircle.style.transition = 'none';
        }
        tickCount++;
    }
    
    // Run initial instruction
    runBreathingInstruction();
    
    // Interval for breathing timer
    urgeTimerInterval = setInterval(() => {
        timeLeft--;
        el.breathingTimer.textContent = timeLeft;
        
        // Update instructions every 4s based on timer ticks
        if ((30 - timeLeft) % 4 === 0) {
            runBreathingInstruction();
        }
        
        // Play soft breathing tick synth
        playSynthSound('breath-tick');
        
        if (timeLeft <= 0) {
            clearInterval(urgeTimerInterval);
            completeUrgeSession();
        }
    }, 1000);
}

function completeUrgeSession() {
    // Session success
    state.player.resistedCount++;
    
    // Reward small EXP
    state.player.exp += 5;
    let leveledUp = false;
    while (state.player.exp >= state.player.level * 100) {
        state.player.exp -= state.player.level * 100;
        state.player.level++;
        leveledUp = true;
    }
    if (leveledUp) updatePlayerRank();
    
    saveData();
    updatePlayerUI();
    updateStatsUI();
    
    // Synthesize successful chime
    playSynthSound('victory-short');
    
    alert("お見事！誘惑の波を乗り越えました。集中を継続しましょう。");
    closeUrgeModal();
}

function closeUrgeModal() {
    clearInterval(urgeTimerInterval);
    el.urgeModal.classList.add('hidden');
    el.breathingCircle.style.transform = 'scale(1.0)';
}

// -------------------------------------------------------------
// AUDIO WORKLET / SYNTHESISERS (Web Audio API)
// -------------------------------------------------------------
function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// Custom synthesized sounds
function playSynthSound(type) {
    if (!audioCtx) return;
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;
    
    if (type === 'start') {
        // Hero theme fanfare
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now); // A4
        osc.frequency.setValueAtTime(554, now + 0.15); // C#5
        osc.frequency.setValueAtTime(659, now + 0.3); // E5
        osc.frequency.setValueAtTime(880, now + 0.45); // A5
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
        osc.start(now);
        osc.stop(now + 1.0);
    } else if (type === 'damage') {
        // Monster hit alarm (Low detuned saw)
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.linearRampToValueAtTime(60, now + 0.4);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
    } else if (type === 'victory') {
        // Success theme fanfare
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523, now); // C5
        osc.frequency.setValueAtTime(659, now + 0.1); // E5
        osc.frequency.setValueAtTime(784, now + 0.2); // G5
        osc.frequency.setValueAtTime(1046, now + 0.3); // C6
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        osc.start(now);
        osc.stop(now + 1.3);
    } else if (type === 'victory-short') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523, now); // C5
        osc.frequency.setValueAtTime(784, now + 0.1); // G5
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
    } else if (type === 'defeat') {
        // Defeat theme sliding down
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.8);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.25, now + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        osc.start(now);
        osc.stop(now + 0.9);
    } else if (type === 'breath-tick') {
        // Soft tick for breathing rhythm
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1000, now);
        gain.gain.setValueAtTime(0.02, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.06);
    }
}

// Synthesize Ambient Lo-Fi Noise and Rain (Web Audio nodes)
function toggleAmbientSound(type, buttonElement) {
    initAudioContext();
    
    // If clicking active, stop it
    if (currentSoundType === type) {
        stopAllAmbientSounds();
        return;
    }
    
    // Stop other active ambient sounds
    stopAllAmbientSounds();
    
    // Setup active state
    currentSoundType = type;
    buttonElement.classList.add('active');
    
    const bufferSize = 2 * audioCtx.sampleRate;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    
    // Custom White / Pink / Brown noise synthesis
    if (type === 'rain') {
        // White noise processed with Bandpass filter to simulate rain
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        
        soundNodes.noiseNode = audioCtx.createBufferSource();
        soundNodes.noiseNode.buffer = noiseBuffer;
        soundNodes.noiseNode.loop = true;
        
        soundNodes.filterNode = audioCtx.createBiquadFilter();
        soundNodes.filterNode.type = 'bandpass';
        soundNodes.filterNode.frequency.setValueAtTime(800, audioCtx.currentTime);
        soundNodes.filterNode.Q.setValueAtTime(1.0, audioCtx.currentTime);
        
        soundNodes.gainNode = audioCtx.createGain();
        soundNodes.gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime);
        
        soundNodes.noiseNode.connect(soundNodes.filterNode);
        soundNodes.filterNode.connect(soundNodes.gainNode);
        soundNodes.gainNode.connect(audioCtx.destination);
        
        soundNodes.noiseNode.start();
        
    } else if (type === 'fire') {
        // Campfire crackle
        // Step 1: Low rustling (Brownish pink noise)
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            // Brown filter
            output[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = output[i];
            output[i] *= 3.5; // Gain compensation
        }
        
        soundNodes.noiseNode = audioCtx.createBufferSource();
        soundNodes.noiseNode.buffer = noiseBuffer;
        soundNodes.noiseNode.loop = true;
        
        soundNodes.filterNode = audioCtx.createBiquadFilter();
        soundNodes.filterNode.type = 'lowpass';
        soundNodes.filterNode.frequency.setValueAtTime(400, audioCtx.currentTime);
        
        soundNodes.gainNode = audioCtx.createGain();
        soundNodes.gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
        
        soundNodes.noiseNode.connect(soundNodes.filterNode);
        soundNodes.filterNode.connect(soundNodes.gainNode);
        soundNodes.gainNode.connect(audioCtx.destination);
        soundNodes.noiseNode.start();
        
        // Step 2: Random popping impulses (synthesizer crackles)
        soundNodes.scriptNode = audioCtx.createScriptProcessor(4096, 0, 1);
        soundNodes.scriptNode.onaudioprocess = function(e) {
            const outBuffer = e.outputBuffer.getChannelData(0);
            for (let i = 0; i < outBuffer.length; i++) {
                outBuffer[i] = 0;
                // Randomly output a crackle impulse (1 in 5000 chance per sample)
                if (Math.random() < 0.0003) {
                    outBuffer[i] = Math.random() * 0.4 - 0.2;
                }
            }
        };
        
        const crackleFilter = audioCtx.createBiquadFilter();
        crackleFilter.type = 'highpass';
        crackleFilter.frequency.setValueAtTime(1000, audioCtx.currentTime);
        
        const crackleGain = audioCtx.createGain();
        crackleGain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        
        soundNodes.scriptNode.connect(crackleFilter);
        crackleFilter.connect(crackleGain);
        crackleGain.connect(audioCtx.destination);
        
    } else if (type === 'lofi') {
        // Lofi tape hiss (Brown noise modulated by slow LFO)
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            output[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = output[i];
            output[i] *= 3.5;
        }
        
        soundNodes.noiseNode = audioCtx.createBufferSource();
        soundNodes.noiseNode.buffer = noiseBuffer;
        soundNodes.noiseNode.loop = true;
        
        soundNodes.filterNode = audioCtx.createBiquadFilter();
        soundNodes.filterNode.type = 'bandpass';
        soundNodes.filterNode.frequency.setValueAtTime(300, audioCtx.currentTime);
        soundNodes.filterNode.Q.setValueAtTime(0.7, audioCtx.currentTime);
        
        // Modulator for vinyl wobbling
        const oscMod = audioCtx.createOscillator();
        oscMod.frequency.setValueAtTime(0.3, audioCtx.currentTime); // 0.3 Hz slow wobble
        
        const oscGain = audioCtx.createGain();
        oscGain.gain.setValueAtTime(80, audioCtx.currentTime); // wobble depth
        
        soundNodes.gainNode = audioCtx.createGain();
        soundNodes.gainNode.gain.setValueAtTime(0.18, audioCtx.currentTime);
        
        oscMod.connect(oscGain);
        oscGain.connect(soundNodes.filterNode.frequency); // Wobble the filter freq
        
        soundNodes.noiseNode.connect(soundNodes.filterNode);
        soundNodes.filterNode.connect(soundNodes.gainNode);
        soundNodes.gainNode.connect(audioCtx.destination);
        
        oscMod.start();
        soundNodes.noiseNode.start();
    }
}

function stopAllAmbientSounds() {
    document.querySelectorAll('.btn-sound').forEach(btn => btn.classList.remove('active'));
    currentSoundType = null;
    
    if (soundNodes.noiseNode) {
        try { soundNodes.noiseNode.stop(); } catch(e) {}
        soundNodes.noiseNode.disconnect();
        soundNodes.noiseNode = null;
    }
    if (soundNodes.filterNode) {
        soundNodes.filterNode.disconnect();
        soundNodes.filterNode = null;
    }
    if (soundNodes.gainNode) {
        soundNodes.gainNode.disconnect();
        soundNodes.gainNode = null;
    }
    if (soundNodes.scriptNode) {
        soundNodes.scriptNode.disconnect();
        soundNodes.scriptNode = null;
    }
}

// -------------------------------------------------------------
// USER PROGRESSION / STATISTICS
// -------------------------------------------------------------
function updatePlayerRank() {
    const currentLevel = state.player.level;
    let newRank = RANKS[0].name;
    
    for (let i = RANKS.length - 1; i >= 0; i--) {
        if (currentLevel >= RANKS[i].minLevel) {
            newRank = RANKS[i].name;
            break;
        }
    }
    state.player.rank = newRank;
}

function updatePlayerUI() {
    el.playerLevel.textContent = `Lv.${state.player.level}`;
    el.guildRank.textContent = state.player.rank;
    
    const maxExp = state.player.level * 100;
    const progressPercent = Math.min(100, (state.player.exp / maxExp) * 100);
    
    el.expFill.style.width = `${progressPercent}%`;
    el.expText.textContent = `${state.player.exp} / ${maxExp} EXP`;
}

function updateStatsUI() {
    el.statTotalTime.textContent = state.player.totalMinutes;
    el.statDefeatedMonsters.textContent = state.player.defeatedCount;
    el.statResistedUrges.textContent = state.player.resistedCount;
    
    // History log rendering
    el.historyList.innerHTML = '';
    if (state.history.length === 0) {
        el.historyList.innerHTML = '<p class="empty-sub text-center py-3">討伐ログはまだありません。</p>';
        return;
    }
    
    state.history.slice(0, 5).forEach(log => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
            <div>
                <div><strong>${log.monsterName}</strong> 討伐</div>
                <div class="empty-sub" style="font-size: 0.65rem;">依頼: ${log.questTitle}</div>
            </div>
            <div style="text-align: right;">
                <div class="history-exp">+${log.expEarned} EXP</div>
                <div class="history-time">${log.date}</div>
            </div>
        `;
        el.historyList.appendChild(item);
    });
}

// -------------------------------------------------------------
// CHARTING (Chart.js)
// -------------------------------------------------------------
function initChart() {
    const ctx = document.getElementById('weekly-chart').getContext('2d');
    
    // Generate labels for the last 7 days
    const dates = [];
    const minutes = [];
    
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        dates.push(d.toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' }));
        minutes.push(state.weeklyStats[dateStr] || 0);
    }
    
    weeklyChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dates,
            datasets: [{
                label: '集中時間 (分)',
                data: minutes,
                backgroundColor: 'rgba(0, 242, 254, 0.4)',
                borderColor: '#00f2fe',
                borderWidth: 1.5,
                borderRadius: 4,
                hoverBackgroundColor: 'rgba(0, 242, 254, 0.7)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#9ca3af',
                        font: { size: 9 }
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#9ca3af',
                        font: { size: 9 },
                        stepSize: 15
                    }
                }
            }
        }
    });
}

function updateChart() {
    if (!weeklyChart) return;
    
    const minutes = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        minutes.push(state.weeklyStats[dateStr] || 0);
    }
    
    weeklyChart.data.datasets[0].data = minutes;
    weeklyChart.update();
}

// -------------------------------------------------------------
// LOCALSTORAGE SYNC
// -------------------------------------------------------------
function saveData() {
    localStorage.setItem('focus_quest_state', JSON.stringify(state));
}

function loadData() {
    const saved = localStorage.getItem('focus_quest_state');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            state = { ...state, ...parsed };
            // Ensure array structures match in case of older schemas
            if (!Array.isArray(state.quests)) state.quests = [];
            if (!Array.isArray(state.history)) state.history = [];
            if (!state.weeklyStats) state.weeklyStats = {};
        } catch (e) {
            console.error("Could not parse saved storage data.", e);
        }
    }
}
