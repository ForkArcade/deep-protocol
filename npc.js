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

  // ============================================================
  //  NPC INITIALIZATION
  // ============================================================

  function initNPCs() {
    var npcIds = ['lena', 'victor', 'marta', 'emil'];
    var roles = FA.shuffle(['ally', 'ally', 'traitor', 'neutral']);
    var npcs = [];
    for (var i = 0; i < npcIds.length; i++) {
      var def = FA.lookup('npcs', npcIds[i]);
      npcs.push({
        id: npcIds[i], type: 'npc', name: def.name, char: def.char, color: def.color,
        x: def.homePos.x, y: def.homePos.y,
        allegiance: roles[i],
        homePos: def.homePos, cafePos: def.cafePos,
        terminalPos: def.terminalPos, gardenPos: def.gardenPos,
        schedule: def.schedule, appearsDay: def.appearsDay,
        systemDialogue: def.systemDialogue, met: false,
        goal: 'home', talkedToday: false,
        wantsToTalk: true, followTurns: 0,
        pace: npcIds[i] === 'victor' ? 2 : npcIds[i] === 'emil' ? 3 : 1,
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
    return Core.moveToward(npc, tx, ty);
  }

  // ============================================================
  //  NPC GOAL SELECTION
  // ============================================================

  function resolveNPCGoalPos(npc, state) {
    var g = npc.goal;
    if (g === 'home') return npc.homePos;
    if (g === 'cafe') return npc.cafePos;
    if (g === 'terminal') return npc.terminalPos;
    if (g === 'garden') return npc.gardenPos;
    if (g === 'player' && state.player) return { x: state.player.x, y: state.player.y };
    return null;
  }

  function selectNPCGoal(npc, state) {
    if (state.day < npc.appearsDay) {
      npc.goal = 'hidden'; npc.x = -1; npc.y = -1;
      return;
    }
    // NPC appearing for the first time — place at home
    if (npc.x < 0 || npc.y < 0) {
      npc.x = npc.homePos.x;
      npc.y = npc.homePos.y;
    }
    var dist = state.player ? Math.abs(npc.x - state.player.x) + Math.abs(npc.y - state.player.y) : 99;
    if (npc.wantsToTalk && !npc.talkedToday && dist < NPC_APPROACH_RADIUS) { npc.goal = 'player'; return; }

    // Data-driven: pick schedule from behaviors registry (narrative-aware)
    var behavior = FA.select(FA.lookup('behaviors', npc.id));
    var schedule = behavior ? behavior.schedule : null;
    if (schedule) {
      var period = getTimePeriod(state.timeOfDay);
      npc.goal = schedule[period] || 'wander';
    } else {
      npc.goal = 'wander';
    }
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
