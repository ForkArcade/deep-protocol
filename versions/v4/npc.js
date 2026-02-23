// Deep Protocol — NPC AI System
// Initialization, scheduling, movement, dialogue
// NPCs are entities with type:'npc' stored in state.maps.town.entities
(function() {
  'use strict';
  var FA = window.FA;
  var Core = window.Core;

  var cfg = FA.lookup('config', 'game');
  var colors = FA.lookup('config', 'colors');
  var intervalsCfg = FA.lookup('config', 'intervals');
  var confidantCfg = FA.lookup('config', 'confidantEffects');
  var effectsCfg = FA.lookup('config', 'effects');

  // Goal name → zone key mapping
  var GOAL_ZONES = { home: 'h', cafe: 'c', terminal: 'w', garden: 'g' };

  // Job zone → NPC goal mapping
  var JOB_ZONE_TO_GOAL = { cafe: 'cafe', terminal: 'terminal' };

  function tickNeeds(npc) {
    if (!npc.needs) return;
    var needsDefs = FA.lookup('config', 'needs');
    if (!needsDefs) return;
    for (var id in npc.needs) {
      var def = needsDefs[id];
      if (def) npc.needs[id] = Math.max(0, npc.needs[id] - def.decay);
    }
  }

  function getMostUrgentNeed(npc) {
    if (!npc.needs) return null;
    var lowest = null, lowestVal = 999;
    for (var id in npc.needs) {
      if (npc.needs[id] < lowestVal) {
        lowestVal = npc.needs[id];
        lowest = id;
      }
    }
    return lowest;
  }

  function pickJob(npc) {
    var jobs = FA.lookup('config', 'jobs');
    if (!jobs) return null;
    var need = getMostUrgentNeed(npc);
    if (!need) return null;
    // Check priorities first
    if (npc.priorities) {
      for (var i = 0; i < npc.priorities.length; i++) {
        var job = jobs[npc.priorities[i]];
        if (job && job.fulfills === need) return { id: npc.priorities[i], def: job };
      }
    }
    // Fallback: any job that fulfills the need
    for (var jid in jobs) {
      if (jobs[jid].fulfills === need) return { id: jid, def: jobs[jid] };
    }
    return null;
  }

  function applyMood(npc, event) {
    var moods = FA.lookup('config', 'moods');
    if (!moods || moods[event] === undefined) return;
    npc.mood = Math.max(0, Math.min(100, (npc.mood || 50) + moods[event]));
  }

  function completeJob(npc) {
    if (!npc.currentJob || !npc.needs) return;
    var job = npc.currentJob;
    if (job.def.fulfills && npc.needs[job.def.fulfills] !== undefined) {
      npc.needs[job.def.fulfills] = Math.min(100, npc.needs[job.def.fulfills] + job.def.restore);
    }
    if (job.id === 'eat') applyMood(npc, 'had_meal');
    if (job.id === 'work') applyMood(npc, 'worked');
    npc.currentJob = null;
    npc.jobTimer = 0;
  }

  // Cached zone cells (built once per game start)
  var _zoneCells = null;

  function buildZoneCells(state) {
    var zones = state.maps && state.maps.town ? state.maps.town.zones : null;
    if (!zones) return null;
    var grid = state.maps.town.grid;
    var cells = {};
    for (var y = 0; y < zones.length; y++) {
      for (var x = 0; x < zones[y].length; x++) {
        var z = zones[y][x];
        if (z === '.') continue;
        // Only walkable cells
        if (grid && grid[y] && (grid[y][x] === 1 || grid[y][x] === 9)) continue;
        if (!cells[z]) cells[z] = [];
        cells[z].push({ x: x, y: y });
      }
    }
    return cells;
  }

  function getZoneCells(state) {
    if (!_zoneCells) _zoneCells = buildZoneCells(state);
    return _zoneCells;
  }

  function pickZoneTarget(zoneKey, state) {
    var cells = getZoneCells(state);
    if (!cells || !cells[zoneKey] || cells[zoneKey].length === 0) return null;
    var arr = cells[zoneKey];
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function initNPCs() {
    _zoneCells = null; // Clear zone cache on restart
    var spawner = FA.lookup('config', 'spawner');
    if (!spawner || !spawner.roles) return [];
    var roles = FA.shuffle(spawner.roles.slice());
    var npcs = [];
    for (var i = 0; i < spawner.schedule.length; i++) {
      var entry = spawner.schedule[i];
      var def = FA.lookup('npcs', entry.id);
      var actor = FA.lookup('actors', entry.id);
      // Deep copy needs from actor data
      var needs = null, priorities = null;
      if (actor && actor.needs) {
        needs = {};
        for (var k in actor.needs) needs[k] = actor.needs[k];
        priorities = actor.priorities || [];
      }
      npcs.push({
        id: entry.id, type: 'npc', name: def.name, char: def.char, color: def.color,
        x: def.homePos.x, y: def.homePos.y,
        allegiance: roles[i],
        homePos: def.homePos, cafePos: def.cafePos,
        terminalPos: def.terminalPos, gardenPos: def.gardenPos,
        schedule: def.schedule, appearsDay: entry.day, systemMinDepth: def.systemMinDepth || 1,
        systemDialogue: def.systemDialogue, met: false,
        goal: 'home', goalPos: null, talkedToday: false,
        wantsToTalk: true, followTurns: 0,
        pace: def.pace || 1,
        turnCounter: i,
        idleTimer: 0,
        needs: needs,
        priorities: priorities,
        mood: 50,
        currentJob: null,
        jobTimer: 0
      });
    }
    return npcs;
  }

  function getTimePeriod(t) {
    var timeCfg = FA.lookup('config', 'time');
    var day = timeCfg.turnsPerDay;
    if (t < day * 0.33) return 'morning';
    if (t < day * 0.66) return 'midday';
    return 'evening';
  }

  function getNPCs(state) {
    if (!state.maps || !state.maps.town) return [];
    var entities = state.maps.town.entities;
    var npcs = [];
    for (var i = 0; i < entities.length; i++) {
      if (entities[i].type === 'npc') npcs.push(entities[i]);
    }
    return npcs;
  }

  function moveNPCToward(npc, tx, ty) {
    if (npc.x === tx && npc.y === ty) return false;
    // When targeting player, find adjacent walkable tile instead
    if (npc.goal === 'player') {
      var dirs = [[0,-1],[0,1],[-1,0],[1,0]];
      var best = null, bestDist = 999;
      for (var d = 0; d < dirs.length; d++) {
        var ax = tx + dirs[d][0], ay = ty + dirs[d][1];
        if (npc.x === ax && npc.y === ay) return false; // already adjacent
        var nd = Math.abs(npc.x - ax) + Math.abs(npc.y - ay);
        if (nd < bestDist && Core.canStep(ax, ay, npc)) {
          bestDist = nd; best = { x: ax, y: ay };
        }
      }
      if (best) return Core.moveToward(npc, best.x, best.y);
    }
    return Core.moveTowardSimple(npc, tx, ty);
  }

  function resolveNPCGoalPos(npc, state) {
    if (npc.goal === 'player' && state.player) return { x: state.player.x, y: state.player.y };
    return npc.goalPos || null;
  }

  function computeGoalPos(npc, state) {
    var zoneKey = GOAL_ZONES[npc.goal];
    if (zoneKey) {
      var target = pickZoneTarget(zoneKey, state);
      if (target) return { x: target.x, y: target.y };
    }
    // Fallback to hardcoded positions
    if (npc.goal === 'home') return npc.homePos;
    if (npc.goal === 'cafe') return npc.cafePos;
    if (npc.goal === 'terminal') return npc.terminalPos;
    if (npc.goal === 'garden') return npc.gardenPos;
    return null;
  }

  function selectNPCGoal(npc, state) {
    if (state.day < npc.appearsDay) {
      npc.goal = 'hidden'; npc.goalPos = null; npc.x = -1; npc.y = -1;
      return;
    }
    // NPC appearing for the first time — place in spawn zone
    if (npc.x < 0 || npc.y < 0) {
      var spawnZone = FA.lookup('config', 'spawner').zone;
      var homeTarget = pickZoneTarget(spawnZone, state);
      if (homeTarget) { npc.x = homeTarget.x; npc.y = homeTarget.y; }
      else { npc.x = npc.homePos.x; npc.y = npc.homePos.y; }
    }
    var dist = state.player ? Math.abs(npc.x - state.player.x) + Math.abs(npc.y - state.player.y) : 99;
    if (npc.wantsToTalk && !npc.talkedToday && dist < cfg.npcApproachRadius) {
      npc.goal = 'player'; npc.goalPos = null;
      return;
    }

    // Data-driven: pick schedule from behaviors registry (narrative-aware)
    var behavior = FA.select(FA.lookup('behaviors', npc.id));
    var schedule = behavior ? behavior.schedule : null;
    if (schedule) {
      var period = getTimePeriod(state.timeOfDay);
      npc.goal = schedule[period] || 'wander';
    } else {
      npc.goal = 'wander';
    }

    // Schedule says 'player' — ensure NPC will initiate talk on arrival
    if (npc.goal === 'player' && !npc.talkedToday) {
      npc.wantsToTalk = true;
      npc.followTurns = 0;
    }

    // Needs-driven: when schedule says 'wander', pick a job based on needs
    if (npc.goal === 'wander' && npc.needs) {
      var job = pickJob(npc);
      if (job) {
        npc.currentJob = job;
        npc.jobTimer = 0;
        if (job.def.zone && JOB_ZONE_TO_GOAL[job.def.zone]) {
          npc.goal = JOB_ZONE_TO_GOAL[job.def.zone];
        }
      }
    }

    // Compute target position from zone
    npc.goalPos = computeGoalPos(npc, state);
  }

  function npcOverworldStep(npc, state) {
    if (npc.x < 0 || npc.y < 0) return;
    if (state.day < npc.appearsDay) return;

    // Tick needs every step (even if NPC skips movement due to pace)
    tickNeeds(npc);

    npc.turnCounter = (npc.turnCounter || 0) + 1;
    if (npc.goal !== 'player' && npc.turnCounter % npc.pace !== 0) return;

    if (npc.goal === 'player') {
      npc.followTurns = (npc.followTurns || 0) + 1;
      if (npc.followTurns > cfg.npcFollowMaxTurns) {
        npc.wantsToTalk = false;
        npc.followTurns = 0;
        selectNPCGoal(npc, state);
      }
    } else {
      npc.followTurns = 0;
    }

    var goalPos = resolveNPCGoalPos(npc, state);
    if (goalPos && npc.x === goalPos.x && npc.y === goalPos.y) {
      // Job completion: NPC is at zone doing a job
      if (npc.currentJob) {
        npc.jobTimer = (npc.jobTimer || 0) + 1;
        if (npc.jobTimer >= npc.currentJob.def.duration) {
          completeJob(npc);
          selectNPCGoal(npc, state);
          npc.idleTimer = FA.rand(cfg.npcIdleMin, cfg.npcIdleMax);
          goalPos = resolveNPCGoalPos(npc, state);
        } else {
          return; // Still working
        }
      } else {
        if (npc.idleTimer > 0) {
          npc.idleTimer--;
          return;
        }
        selectNPCGoal(npc, state);
        npc.idleTimer = FA.rand(cfg.npcIdleMin, cfg.npcIdleMax);
        goalPos = resolveNPCGoalPos(npc, state);
      }
    }

    if (goalPos) {
      moveNPCToward(npc, goalPos.x, goalPos.y);
    } else {
      if (Math.random() < cfg.npcWanderChance) Core.randomStep(npc);
    }
  }

  function talkToNPC(npc, state) {
    // Busy with job — brush off, don't count as interaction
    if (npc.currentJob && npc.jobTimer > 0) {
      var bLines = FA.lookup('config', 'busyLines') || {};
      Core.addSystemBubble(bLines[npc.currentJob.id] || bLines._default || ((FA.lookup('config','strings') || {}).busyFallback || 'Busy.'), null, npc);
      return;
    }
    npc.met = true;
    npc.talkedToday = true;
    npc.wantsToTalk = false;
    npc.followTurns = 0;
    applyMood(npc, 'talked_friend');
    var entry = Core.selectDialogue(npc.id);
    var text = entry ? entry.text : '...';
    // Mood overrides (only for dialogues without choices)
    if (!entry || !entry.choices) {
      var moodsCfg = FA.lookup('config', 'moods');
      var mThresh = moodsCfg && moodsCfg.thresholds ? moodsCfg.thresholds : { low: 30, high: 70 };
      var moodDlg = FA.lookup('config', 'moodDialogues');
      if (moodDlg && npc.mood < mThresh.low && moodDlg.low) {
        text = moodDlg.low[npc.id] || moodDlg.low._default || text;
      } else if (moodDlg && npc.mood > mThresh.high && moodDlg.high) {
        text = moodDlg.high[npc.id] || text;
      }
    }
    Core.addSystemBubble(text, null, npc);
    if (FA.narrative && FA.narrative.setVar) {
      FA.narrative.setVar(npc.id + '_met_today', true, 'Met ' + npc.name);
    }
    // If dialogue has choices, queue them for after bubble dismiss
    if (entry && entry.choices && entry.choices.length > 0) {
      state._pendingDialogueChoice = {
        npcId: npc.id,
        npcName: npc.name,
        choices: entry.choices,
        source: npc
      };
    } else {
      // No choices — auto-increment interaction counter
      if (FA.narrative && FA.narrative.setVar) {
        var prev = FA.narrative.getVar(npc.id + '_interactions') || 0;
        FA.narrative.setVar(npc.id + '_interactions', prev + 1, 'Talked to ' + npc.name);
      }
    }
    selectNPCGoal(npc, state);
  }

  function npcOverworldTurn(state) {
    var npcs = getNPCs(state);
    for (var i = 0; i < npcs.length; i++) {
      npcOverworldStep(npcs[i], state);
    }
    if (state.player) {
      for (var j = 0; j < npcs.length; j++) {
        var npc = npcs[j];
        if (state.day < npc.appearsDay) continue;
        if (!npc.wantsToTalk || npc.talkedToday) continue;
        var dist = Math.abs(npc.x - state.player.x) + Math.abs(npc.y - state.player.y);
        if (dist === 1) {
          talkToNPC(npc, state);
          break;
        }
      }
    }
  }

  function updateNPCPositions(state) {
    var npcs = getNPCs(state);
    for (var i = 0; i < npcs.length; i++) {
      selectNPCGoal(npcs[i], state);
    }
  }

  function getNPCAt(state, x, y) {
    var entities = state.maps[state.mapId].entities;
    for (var i = 0; i < entities.length; i++) {
      var e = entities[i];
      if (e.type !== 'npc') continue;
      if (state.day < e.appearsDay) continue;
      if (e.x === x && e.y === y) return e;
    }
    return null;
  }

  function getAdjacentNPC(state, px, py) {
    var dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    for (var d = 0; d < dirs.length; d++) {
      var npc = getNPCAt(state, px + dirs[d][0], py + dirs[d][1]);
      if (npc) return npc;
    }
    return null;
  }

  var timeCfg = FA.lookup('config', 'time');
  var econCfg = FA.lookup('config', 'economy');
  var gameCfg = cfg; // alias — cfg already declared above

  function getRent(state) {
    var rent = econCfg.baseRent + (state.day - 1) * econCfg.rentIncrease;
    if (Core.isConfidant('marta')) rent = Math.max(confidantCfg.marta.rentMin, rent - confidantCfg.marta.rentReduction);
    return rent;
  }

  function showBedChoice(state) {
    var rent = getRent(state);
    var canAfford = state.credits >= rent;
    window.Game._showChoiceMenu(state, '> LODGING \u2014 Pay ' + rent + ' cr for the night?', [
      { key: '1', label: canAfford ? 'Pay ' + rent + ' cr & sleep' : 'Not enough credits (' + state.credits + ' cr)',
        color: canAfford ? '#8878cc' : '#644', enabled: canAfford, action: function(s) { goToBed(s); } },
      { key: '2', label: 'Cancel', color: '#665', enabled: true, action: function() {} }
    ]);
  }

  function goToBed(state) {
    var rent = getRent(state);
    state.credits -= rent;
    if (state.credits < 0) { Core.triggerEnding(false, 'eviction'); return; }
    state.day++; state.timeOfDay = 0; state.workedToday = false;
    state._timeWarned = false; state._curfewWarned = false;
    removeCurfewDrones(state);
    var npcs = getNPCs(state);
    for (var ni = 0; ni < npcs.length; ni++) {
      npcs[ni].talkedToday = false; npcs[ni].wantsToTalk = true; npcs[ni].followTurns = 0;
    }
    if (FA.narrative && FA.narrative.setVar) {
      FA.narrative.setVar('day', state.day, 'New day');
      FA.narrative.setVar('curfew_active', false, 'Day reset');
      var npcDefs = FA.lookupAll('npcs');
      for (var nid in npcDefs) FA.narrative.setVar(nid + '_met_today', false, 'Day reset');
    }
    state.rent = getRent(state); state.mapVersion = (state.mapVersion || 0) + 1;
    updateNPCPositions(state);
    if (state.day >= econCfg.systemRevealDay && !state.systemRevealed) {
      var allNpcs = getNPCs(state);
      for (var i = 0; i < allNpcs.length; i++) {
        if (allNpcs[i].met && (allNpcs[i].id === 'victor' || allNpcs[i].id === 'lena')) {
          state.systemRevealed = true; state.mapVersion = (state.mapVersion || 0) + 1; break;
        }
      }
    }
    if (state.systemVisits === 0) {
      dreamSnapshot(state);
      state._pendingDayMsg = '> Day ' + state.day + '. Rent: -' + rent + 'cr. Balance: ' + state.credits + 'cr.';
    } else {
      Core.addSystemBubble('> Day ' + state.day + '. Rent: -' + rent + 'cr. Balance: ' + state.credits + 'cr.', '#f44');
    }
    Core.triggerThought('morning');
  }

  var _dreamTexts = FA.lookup('config', 'dreamTextTemplates') || ['// SIGNAL INTERCEPT \u2014 DEPTH '];

  function dreamSnapshot(state) {
    var dreamDepth = FA.rand((effectsCfg.dream || {}).depthMin || 1, (effectsCfg.dream || {}).depthMax || 3);
    var floor = Core.generateFloor(gameCfg.cols, gameCfg.rows, dreamDepth);
    for (var y = 0; y < floor.explored.length; y++)
      for (var x = 0; x < floor.explored[y].length; x++) floor.explored[y][x] = true;
    state.dreamMap = floor.map; state.dreamExplored = floor.explored;
    state.dreamDepth = dreamDepth; state.mapVersion = (state.mapVersion || 0) + 1;
    state.dreamTimer = 0;
    state.dreamText = _dreamTexts[FA.rand(0, _dreamTexts.length - 1)] + dreamDepth;
    FA.playSound('dream');
    state.screen = 'dream';
  }

  function dismissDream() {
    var state = FA.getState();
    if (state.screen !== 'dream') return;
    state.screen = 'playing'; state.dreamMap = null; state.dreamExplored = null;
    state.dreamDepth = 0; state.dreamText = null; state.dreamTimer = 0;
    state.mapVersion = (state.mapVersion || 0) + 1;
    if (state._pendingDayMsg) { Core.addSystemBubble(state._pendingDayMsg, '#f44'); state._pendingDayMsg = null; }
  }

  function checkTimeWarnings(state) {
    if (state.timeOfDay >= timeCfg.curfewTime && !state._curfewWarned) {
      state._curfewWarned = true;
      FA.playSound('curfew');
      if (FA.narrative && FA.narrative.setVar) FA.narrative.setVar('curfew_active', true, 'Curfew approaching');
      Core.addSystemBubble('> ' + ((FA.lookup('config','strings') || {}).curfewWarning || 'CURFEW APPROACHING. Return to quarters.'), colors.periodCurfew);
      var npcs = getNPCs(state);
      for (var ci = 0; ci < npcs.length; ci++) applyMood(npcs[ci], 'curfew_near');
      spawnCurfewDrones(state);
    } else if (state.timeOfDay >= timeCfg.warningTime && !state._timeWarned) {
      state._timeWarned = true; Core.triggerThought('evening');
    }
  }

  function checkOverworldThoughts(state) {
    if (state.turn - (state.lastThoughtTurn || 0) < intervalsCfg.overworldThoughtCooldown) return;
    var period = getTimePeriod(state.timeOfDay);
    if (period === 'morning' && state.timeOfDay < intervalsCfg.morningThoughtLimit) Core.triggerThought('morning');
    else if (period === 'evening') Core.triggerThought('evening');
    var zones = state.maps && state.maps.town ? state.maps.town.zones : null;
    if (zones && zones[state.player.y]) {
      var pz = zones[state.player.y][state.player.x];
      if (pz === 'c') Core.triggerThought('cafe');
      else if (pz === 'g') Core.triggerThought('garden');
    }
  }

  function spawnCurfewDrones(state) {
    var def = FA.lookup('enemies', 'drone');
    var townEntities = state.maps.town.entities;
    var townGrid = state.maps.town.grid;
    var townZones = state.maps.town.zones || null;
    var curfewCount = econCfg.curfewDrones;
    if (Core.isConfidant('lena')) curfewCount = Math.max(confidantCfg.lena.curfewDroneMin, curfewCount - confidantCfg.lena.curfewDroneReduction);
    for (var i = 0; i < curfewCount; i++) {
      var dx, dy, attempts = 0;
      do { dx = FA.rand(1, gameCfg.cols - 2); dy = FA.rand(1, gameCfg.rows - 2); attempts++;
      } while (attempts < 50 && (!Core.isWalkable(townGrid, dx, dy) ||
        (townZones && townZones[dy] && townZones[dy][dx] === 'h') ||
        (!Location.isSystem(state.mapId) && state.player && Math.abs(dx - state.player.x) + Math.abs(dy - state.player.y) < 5)));
      townEntities.push({
        id: FA.uid(), type: 'enemy', curfewDrone: true, x: dx, y: dy,
        hp: def.hp, maxHp: def.hp, atk: def.atk, def: def.def,
        char: def.char, color: '#f44', name: (FA.lookup('config','strings') || {}).curfewDroneName || 'Curfew Drone',
        behavior: 'chase', stunTurns: 0, aiState: 'hunting', alertTarget: null, alertTimer: 0, patrolTarget: null
      });
    }
  }

  function removeCurfewDrones(state) {
    var entities = state.maps.town.entities;
    for (var i = entities.length - 1; i >= 0; i--)
      if (entities[i].curfewDrone) entities.splice(i, 1);
  }

  window.NPC = {
    initNPCs: initNPCs,
    getTimePeriod: getTimePeriod,
    getNPCs: getNPCs,
    selectNPCGoal: selectNPCGoal,
    npcOverworldTurn: npcOverworldTurn,
    updateNPCPositions: updateNPCPositions,
    getNPCAt: getNPCAt,
    getAdjacentNPC: getAdjacentNPC,
    talkToNPC: talkToNPC,
    applyMood: applyMood,
    showBedChoice: showBedChoice,
    dismissDream: dismissDream,
    checkTimeWarnings: checkTimeWarnings,
    checkOverworldThoughts: checkOverworldThoughts
  };
})();
