// Deep Protocol — NPC AI System
// Initialization, scheduling, movement, dialogue
// NPCs are entities with type:'npc' stored in state.maps.town.entities
(function() {
  'use strict';
  var FA = window.FA;
  var Core = window.Core;

  // === CONSTANTS ===

  var NPC_FOLLOW_MAX_TURNS = 3;
  var NPC_IDLE_MIN = 2;
  var NPC_IDLE_MAX = 6;
  var NPC_APPROACH_RADIUS = 8;
  var NPC_CLOSE_RADIUS = 6;
  var NPC_WANDER_CHANCE = 0.4;

  // Goal name → zone key mapping
  var GOAL_ZONES = { home: 'h', cafe: 'c', terminal: 'w', garden: 'g' };

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

  // ============================================================
  //  NPC INITIALIZATION
  // ============================================================

  function initNPCs() {
    _zoneCells = null; // Clear zone cache on restart
    var npcDefs = FA.lookupAll('npcs');
    var npcIds = Object.keys(npcDefs);
    var roles = FA.shuffle(FA.lookup('config', 'npcRoles').slice());
    var npcs = [];
    for (var i = 0; i < npcIds.length; i++) {
      var def = FA.lookup('npcs', npcIds[i]);
      npcs.push({
        id: npcIds[i], type: 'npc', name: def.name, char: def.char, color: def.color,
        x: def.homePos.x, y: def.homePos.y,
        allegiance: roles[i],
        homePos: def.homePos, cafePos: def.cafePos,
        terminalPos: def.terminalPos, gardenPos: def.gardenPos,
        schedule: def.schedule, appearsDay: def.appearsDay, systemMinDepth: def.systemMinDepth || 1,
        systemDialogue: def.systemDialogue, met: false,
        goal: 'home', goalPos: null, talkedToday: false,
        wantsToTalk: true, followTurns: 0,
        pace: def.pace || 1,
        turnCounter: i,
        idleTimer: 0
      });
    }
    return npcs;
  }

  // ============================================================
  //  HELPERS
  // ============================================================

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

  // ============================================================
  //  NPC MOVEMENT (uses unified Core.canStep + Core.moveToward)
  // ============================================================

  function moveNPCToward(npc, tx, ty) {
    if (npc.x === tx && npc.y === ty) return false;
    return Core.moveTowardSimple(npc, tx, ty);
  }

  // ============================================================
  //  NPC GOAL SELECTION
  // ============================================================

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
    // NPC appearing for the first time — place at home
    if (npc.x < 0 || npc.y < 0) {
      var homeTarget = pickZoneTarget('h', state);
      if (homeTarget) { npc.x = homeTarget.x; npc.y = homeTarget.y; }
      else { npc.x = npc.homePos.x; npc.y = npc.homePos.y; }
    }
    var dist = state.player ? Math.abs(npc.x - state.player.x) + Math.abs(npc.y - state.player.y) : 99;
    if (npc.wantsToTalk && !npc.talkedToday && dist < NPC_APPROACH_RADIUS) {
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

    // Compute target position from zone
    npc.goalPos = computeGoalPos(npc, state);
  }

  // ============================================================
  //  NPC TURN EXECUTION
  // ============================================================

  function npcOverworldStep(npc, state) {
    if (npc.x < 0 || npc.y < 0) return;
    if (state.day < npc.appearsDay) return;

    npc.turnCounter = (npc.turnCounter || 0) + 1;
    if (npc.goal !== 'player' && npc.turnCounter % npc.pace !== 0) return;

    if (npc.goal === 'player') {
      npc.followTurns = (npc.followTurns || 0) + 1;
      if (npc.followTurns > NPC_FOLLOW_MAX_TURNS) {
        npc.wantsToTalk = false;
        npc.followTurns = 0;
        selectNPCGoal(npc, state);
      }
    } else {
      npc.followTurns = 0;
    }

    var goalPos = resolveNPCGoalPos(npc, state);
    if (goalPos && npc.x === goalPos.x && npc.y === goalPos.y) {
      if (npc.idleTimer > 0) {
        npc.idleTimer--;
        return;
      }
      selectNPCGoal(npc, state);
      npc.idleTimer = FA.rand(NPC_IDLE_MIN, NPC_IDLE_MAX);
      goalPos = resolveNPCGoalPos(npc, state);
    }

    if (goalPos) {
      moveNPCToward(npc, goalPos.x, goalPos.y);
    } else {
      if (Math.random() < NPC_WANDER_CHANCE) Core.randomStep(npc);
    }
  }

  // ============================================================
  //  NPC DIALOGUE
  // ============================================================

  function talkToNPC(npc, state) {
    npc.met = true;
    npc.talkedToday = true;
    npc.wantsToTalk = false;
    npc.followTurns = 0;
    var text = Core.selectDialogue(npc.id) || '...';
    Core.addSystemBubble(npc.name + ': "' + text + '"', npc.color);
    if (FA.narrative && FA.narrative.setVar) {
      FA.narrative.setVar(npc.id + '_met_today', true, 'Met ' + npc.name);
      var prev = FA.narrative.getVar(npc.id + '_interactions') || 0;
      FA.narrative.setVar(npc.id + '_interactions', prev + 1, 'Talked to ' + npc.name);
    }
    selectNPCGoal(npc, state);
  }

  // ============================================================
  //  NPC TURN (all NPCs on town map)
  // ============================================================

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

  // ============================================================
  //  NPC QUERIES
  // ============================================================

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

  // ============================================================
  //  EXPORTS
  // ============================================================

  window.NPC = {
    initNPCs: initNPCs,
    getTimePeriod: getTimePeriod,
    getNPCs: getNPCs,
    selectNPCGoal: selectNPCGoal,
    npcOverworldTurn: npcOverworldTurn,
    updateNPCPositions: updateNPCPositions,
    getNPCAt: getNPCAt,
    getAdjacentNPC: getAdjacentNPC,
    talkToNPC: talkToNPC
  };
})();
