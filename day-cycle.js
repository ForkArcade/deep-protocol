// Deep Protocol — Day Cycle (sleep, dreams, curfew, time warnings)
// Extracted from game.js.
(function() {
  'use strict';
  var FA = window.FA;
  var Core = window.Core;
  var NPC = window.NPC;
  var timeCfg = FA.lookup('config', 'time');
  var econCfg = FA.lookup('config', 'economy');
  var gameCfg = FA.lookup('config', 'game');

  function getRent(state) { return econCfg.baseRent + (state.day - 1) * econCfg.rentIncrease; }

  // ============================================================
  //  BED / SLEEP
  // ============================================================

  function showBedChoice(state) {
    var rent = getRent(state);
    var canAfford = state.credits >= rent;
    window.Game._showChoiceMenu(state, '> LODGING \u2014 Pay ' + rent + ' cr for the night?', [
      {
        key: '1',
        label: canAfford ? 'Pay ' + rent + ' cr & sleep' : 'Not enough credits (' + state.credits + ' cr)',
        color: canAfford ? '#8878cc' : '#644',
        enabled: canAfford,
        action: function(s) { goToBed(s); }
      },
      {
        key: '2',
        label: 'Cancel',
        color: '#665',
        enabled: true,
        action: function() {}
      }
    ]);
  }

  function goToBed(state) {
    var rent = getRent(state);
    state.credits -= rent;
    if (state.credits < 0) {
      Core.triggerEnding(false, 'eviction');
      return;
    }
    state.day++;
    state.timeOfDay = 0;
    state.workedToday = false;
    state._timeWarned = false;
    state._curfewWarned = false;

    removeCurfewDrones(state);

    var npcs = NPC.getNPCs(state);
    for (var ni = 0; ni < npcs.length; ni++) {
      npcs[ni].talkedToday = false;
      npcs[ni].wantsToTalk = true;
      npcs[ni].followTurns = 0;
    }
    if (FA.narrative && FA.narrative.setVar) {
      FA.narrative.setVar('day', state.day, 'New day');
      FA.narrative.setVar('curfew_active', false, 'Day reset');
      var npcDefs = FA.lookupAll('npcs');
      for (var nid in npcDefs) {
        FA.narrative.setVar(nid + '_met_today', false, 'Day reset');
      }
    }
    state.rent = getRent(state);
    state.mapVersion = (state.mapVersion || 0) + 1;
    NPC.updateNPCPositions(state);
    if (state.day >= econCfg.systemRevealDay && !state.systemRevealed) {
      var allNpcs = NPC.getNPCs(state);
      for (var i = 0; i < allNpcs.length; i++) {
        if (allNpcs[i].met && (allNpcs[i].id === 'victor' || allNpcs[i].id === 'lena')) {
          state.systemRevealed = true;
          state.mapVersion = (state.mapVersion || 0) + 1;
          break;
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

  // ============================================================
  //  DREAMS
  // ============================================================

  var _dreamTexts = [
    '// SIGNAL INTERCEPT \u2014 DEPTH ',
    '// UNAUTHORIZED STRUCTURE \u2014 DEPTH ',
    '// ANOMALY DETECTED \u2014 DEPTH ',
    '// SUBSYSTEM ECHO \u2014 DEPTH '
  ];

  function dreamSnapshot(state) {
    var dreamDepth = FA.rand(1, 3);
    var floor = Core.generateFloor(gameCfg.cols, gameCfg.rows, dreamDepth);
    for (var y = 0; y < floor.explored.length; y++)
      for (var x = 0; x < floor.explored[y].length; x++)
        floor.explored[y][x] = true;
    state.dreamMap = floor.map;
    state.dreamExplored = floor.explored;
    state.dreamDepth = dreamDepth;
    state.mapVersion = (state.mapVersion || 0) + 1;
    state.dreamTimer = 0;
    state.dreamText = _dreamTexts[FA.rand(0, _dreamTexts.length - 1)] + dreamDepth;
    state.screen = 'dream';
  }

  function dismissDream() {
    var state = FA.getState();
    if (state.screen !== 'dream') return;
    state.screen = 'playing';
    state.dreamMap = null;
    state.dreamExplored = null;
    state.dreamDepth = 0;
    state.dreamText = null;
    state.dreamTimer = 0;
    state.mapVersion = (state.mapVersion || 0) + 1;
    if (state._pendingDayMsg) {
      Core.addSystemBubble(state._pendingDayMsg, '#f44');
      state._pendingDayMsg = null;
    }
  }

  // ============================================================
  //  TIME WARNINGS & CURFEW
  // ============================================================

  function checkTimeWarnings(state) {
    if (state.timeOfDay >= timeCfg.curfewTime && !state._curfewWarned) {
      state._curfewWarned = true;
      if (FA.narrative && FA.narrative.setVar) FA.narrative.setVar('curfew_active', true, 'Curfew approaching');
      Core.addSystemBubble('> CURFEW APPROACHING. Return to quarters.', '#f44');
      spawnCurfewDrones(state);
    } else if (state.timeOfDay >= timeCfg.warningTime && !state._timeWarned) {
      state._timeWarned = true;
      Core.triggerThought('evening');
    }
  }

  function checkOverworldThoughts(state) {
    if (state.turn - (state.lastThoughtTurn || 0) < 15) return;
    var period = NPC.getTimePeriod(state.timeOfDay);
    if (period === 'morning' && state.timeOfDay < 10) Core.triggerThought('morning');
    else if (period === 'evening') Core.triggerThought('evening');
    var zones = state.maps && state.maps.town ? state.maps.town.zones : null;
    if (zones && zones[state.player.y] && zones[state.player.y][state.player.x] === 'c') {
      Core.triggerThought('cafe');
    }
  }

  // ============================================================
  //  CURFEW DRONES
  // ============================================================

  function spawnCurfewDrones(state) {
    var def = FA.lookup('enemies', 'drone');
    var townEntities = state.maps.town.entities;
    var townGrid = state.maps.town.grid;
    var townZones = state.maps.town.zones || null;
    var curfewCount = econCfg.curfewDrones;
    for (var i = 0; i < curfewCount; i++) {
      var dx, dy, attempts = 0;
      do {
        dx = FA.rand(1, gameCfg.cols - 2);
        dy = FA.rand(1, gameCfg.rows - 2);
        attempts++;
      } while (attempts < 50 && (!Core.isWalkable(townGrid, dx, dy) ||
        (townZones && townZones[dy] && townZones[dy][dx] === 'h') ||
        (!Location.isSystem(state.mapId) && state.player && Math.abs(dx - state.player.x) + Math.abs(dy - state.player.y) < 5)));
      townEntities.push({
        id: FA.uid(), type: 'enemy', curfewDrone: true,
        x: dx, y: dy,
        hp: def.hp, maxHp: def.hp, atk: def.atk, def: def.def,
        char: def.char, color: '#f44', name: 'Curfew Drone',
        behavior: 'chase', stunTurns: 0,
        aiState: 'hunting', alertTarget: null, alertTimer: 0, patrolTarget: null
      });
    }
  }

  function removeCurfewDrones(state) {
    var entities = state.maps.town.entities;
    for (var i = entities.length - 1; i >= 0; i--) {
      if (entities[i].curfewDrone) entities.splice(i, 1);
    }
  }

  window.DayCycle = {
    showBedChoice: showBedChoice,
    goToBed: goToBed,
    dismissDream: dismissDream,
    checkTimeWarnings: checkTimeWarnings,
    checkOverworldThoughts: checkOverworldThoughts,
    spawnCurfewDrones: spawnCurfewDrones,
    removeCurfewDrones: removeCurfewDrones
  };
})();
