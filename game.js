// Deep Protocol — Game Orchestrator
// Delegates to Combat, Systems, DayCycle, NPC, Core
(function() {
  'use strict';
  var FA = window.FA;
  var Core = window.Core;
  var NPC = window.NPC;

  var COMM_INTERVAL = 12;
  var AMBIENT_THOUGHT_INTERVAL = 20;

  var _onVarChanged = null;
  var _onTransition = null;

  // ============================================================
  //  GAME START
  // ============================================================

  function startGame() {
    FA.resetState({ screen: 'start' });
    FA.clearEffects();
  }

  function beginPlaying() {
    var playerStart = { x: 13, y: 1 };
    var townObjects = [];
    if (typeof getMap === 'function') {
      var mapDef = getMap('overworld');
      if (mapDef && mapDef.playerStart) playerStart = mapDef.playerStart;
    }
    if (typeof getMapObjects === 'function') {
      townObjects = getMapObjects('overworld');
    }
    var econCfg = FA.lookup('config', 'economy');
    var townGrid = Core.parseOverworldMap();
    var npcs = NPC.initNPCs();

    var maps = {};
    var cfg = FA.lookup('config', 'game');
    var explored = [];
    for (var ey = 0; ey < cfg.rows; ey++) {
      explored[ey] = [];
      for (var ex = 0; ex < cfg.cols; ex++) explored[ey][ex] = false;
    }
    var townZones = null;
    if (typeof getMapZones === 'function') {
      townZones = getMapZones('overworld');
    }
    maps.town = { grid: townGrid, entities: npcs, items: [], explored: explored, effects: ['timeOfDay', 'curfew'], objects: townObjects, zones: townZones };

    FA.resetState({
      screen: 'playing',
      mapId: 'town',
      maps: maps,
      map: townGrid,
      player: {
        x: playerStart.x, y: playerStart.y,
        hp: 20, maxHp: 20, atk: 5, def: 1,
        gold: 0, kills: 0,
        modules: [], cloakTurns: 0, overclockActive: false, firewallHp: 0
      },
      depth: 0,
      day: 1, timeOfDay: 0,
      credits: econCfg.startCredits,
      rent: econCfg.baseRent,
      workedToday: false,
      systemRevealed: false,
      systemVisits: 0, totalKills: 0, totalGold: 0,
      visible: Core.computeVisibility(townGrid, playerStart.x, playerStart.y, 14),
      mapVersion: 1, turn: 0, systemTurn: 0,
      systemBubble: null,
      thoughts: [], lastThoughtTurn: -10, bubbleQueue: [],
      shake: 0, shakeX: 0, shakeY: 0,
      particles: [], soundWaves: [],
      _pendingEnd: null, _timeWarned: false, _curfewWarned: false,
      terminalsHacked: 0, directorMsgShown: {},
      townReturnPos: null,
      dreamMap: null, dreamExplored: null, dreamDepth: 0, dreamText: null, dreamTimer: 0
    });

    FA.clearEffects();
    var narCfg = FA.lookup('config', 'narrative');
    if (narCfg) FA.narrative.init(narCfg);

    if (_onVarChanged) FA.off('narrative:varChanged', _onVarChanged);
    if (_onTransition) FA.off('narrative:transition', _onTransition);

    _onVarChanged = function(data) {
      var s = FA.getState();
      var npcs = NPC.getNPCs(s);
      if (!npcs) return;
      if (data.name.indexOf('_met_today') > -1 && data.value) {
        var npcId = data.name.replace('_met_today', '');
        for (var j = 0; j < npcs.length; j++) {
          if (npcs[j].id === npcId && npcs[j].goal === 'player') {
            NPC.selectNPCGoal(npcs[j], s);
          }
        }
      }
      if (data.name === 'system_revealed' && data.value) {
        for (var k = 0; k < npcs.length; k++) {
          if (npcs[k].id === 'emil') NPC.selectNPCGoal(npcs[k], s);
        }
      }
    };
    FA.on('narrative:varChanged', _onVarChanged);

    _onTransition = function(data) {
      var s = FA.getState();
      var npcs = NPC.getNPCs(s);
      if (!npcs) return;
      if (data.graph === 'arc') {
        for (var i = 0; i < npcs.length; i++) {
          if (s.day >= npcs[i].appearsDay && !npcs[i].talkedToday) {
            npcs[i].wantsToTalk = true;
            npcs[i].followTurns = 0;
            NPC.selectNPCGoal(npcs[i], s);
          }
        }
      } else if (data.graph.indexOf('quest_') === 0) {
        var npcId = data.graph.replace('quest_', '');
        for (var j = 0; j < npcs.length; j++) {
          if (npcs[j].id === npcId && !npcs[j].talkedToday) {
            npcs[j].wantsToTalk = true;
            npcs[j].followTurns = 0;
            NPC.selectNPCGoal(npcs[j], s);
          }
        }
      }
    };
    FA.on('narrative:transition', _onTransition);

    NPC.updateNPCPositions(FA.getState());
    var wakeCs = FA.lookup('cutscenes', 'wake');
    if (wakeCs) Core.startCutscene(wakeCs, FA.getState());
    Core.triggerThought('morning');
  }

  // ============================================================
  //  MOVEMENT
  // ============================================================

  function movePlayer(dx, dy) {
    var state = FA.getState();
    if (!state.player) return;
    var nx = state.player.x + dx;
    var ny = state.player.y + dy;

    var entity = Core.getEntityAt(nx, ny);
    if (entity) {
      if (entity.type === 'enemy') {
        Combat.attack(state.player, entity);
        endTurn();
        return;
      }
      if (entity.type === 'npc') {
        entity.x = state.player.x;
        entity.y = state.player.y;
      } else if (entity.type === 'system_npc') {
        if (!entity.talked) {
          entity.talked = true;
          var text = (entity.systemDialogue && entity.systemDialogue[entity.allegiance]) || '...';
          Core.addSystemBubble(entity.name + ': "' + text + '"', entity.color, entity);
          Core.triggerThought('system_npc');
        }
        endTurn();
        return;
      }
    }

    if (!Core.isWalkable(state.map, nx, ny)) return;
    state.player.x = nx;
    state.player.y = ny;
    FA.playSound('step');

    var tile = state.map[ny][nx];
    var mapData = state.maps[state.mapId];

    for (var j = mapData.items.length - 1; j >= 0; j--) {
      if (mapData.items[j].x === nx && mapData.items[j].y === ny) {
        Combat.pickup(mapData.items[j], j);
      }
    }

    if (tile === 3 && Location.isSystem(state.mapId)) { exitSystem('cleared'); return; }
    if (tile === 4 && Location.isSystem(state.mapId)) Systems.hackTerminal(nx, ny, state);

    endTurn();
  }

  // ============================================================
  //  INTERACT
  // ============================================================

  function interact() {
    var state = FA.getState();

    if ((state.thoughts && state.thoughts.length > 0) || state.systemBubble) {
      Core.dismissBubbles();
      return;
    }

    var npc = NPC.getAdjacentNPC(state, state.player.x, state.player.y);
    if (npc) {
      NPC.talkToNPC(npc, state);
      var econCfg = FA.lookup('config', 'economy');
      if (state.day >= econCfg.systemRevealDay && !state.systemRevealed) {
        if (npc.id === 'victor' || npc.id === 'lena') {
          state.systemRevealed = true;
          state.mapVersion = (state.mapVersion || 0) + 1;
          if (FA.narrative && FA.narrative.setVar) FA.narrative.setVar('system_revealed', true, 'System revealed');
        }
      }
      state.timeOfDay += 2;
      state.turn += 2;
      DayCycle.checkTimeWarnings(state);
      return;
    }

    if (Location.hasFeature(state.mapId, 'objects')) {
      var obj = Core.getObjectAtPos(state.player.x, state.player.y);
      if (obj) {
        if (obj.type === 'bed') DayCycle.showBedChoice(state);
        else if (obj.type === 'terminal') workAtTerminal(state);
        else if (obj.type === 'notice_board') readNoticeBoard(state);
        else if (obj.type === 'system_entrance') {
          if (state.systemRevealed) enterSystem(state);
          else Core.addThought('A sealed maintenance shaft. Nothing to see.');
        }
      }
    } else if (Location.isSystem(state.mapId)) {
      var tile = state.map[state.player.y][state.player.x];
      if (tile === 4) Systems.hackTerminal(state.player.x, state.player.y, state);
    }
  }

  function workAtTerminal(state) {
    if (state.workedToday) {
      Core.addSystemBubble('> Shift already completed. Return tomorrow.', '#556');
      return;
    }
    var timeCfg = FA.lookup('config', 'time');
    var econCfg = FA.lookup('config', 'economy');
    state.workedToday = true;
    state.timeOfDay += timeCfg.workTurns;
    state.turn += timeCfg.workTurns;
    state.credits += econCfg.workPay;
    Core.addSystemBubble('> Shift complete. +' + econCfg.workPay + ' credits.', '#fd0');
    Core.triggerThought('work');
    DayCycle.checkTimeWarnings(state);
  }

  function readNoticeBoard(state) {
    var entry = FA.select(FA.lookup('notices', 'board'));
    var text = entry ? entry.text : 'The board is empty.';
    Core.addSystemBubble('> NOTICE: ' + text, '#aa9a50');
    state.timeOfDay += 1;
    state.turn += 1;
  }

  // ============================================================
  //  CHOICE MENU
  // ============================================================

  function showChoiceMenu(state, title, options) {
    state.choiceMenu = { title: title, options: options, timer: 0 };
  }

  function selectChoice(index) {
    var state = FA.getState();
    if (!state.choiceMenu) return;
    var opt = state.choiceMenu.options[index];
    if (!opt) return;
    if (opt.enabled === false) return;
    state.choiceMenu = null;
    if (opt.action) opt.action(state);
  }

  function dismissChoice() {
    var state = FA.getState();
    state.choiceMenu = null;
  }

  // ============================================================
  //  SYSTEM ENTRY / EXIT
  // ============================================================

  function enterSystem(state) {
    var cfg = FA.lookup('config', 'game');
    var depth = Math.min(state.systemVisits + 1, cfg.maxDepth);

    if (state.systemVisits === 0) {
      Core.showNarrative('arc', 'first_system');
    } else {
      var arcNode = FA.narrative.getNode('arc');
      if (arcNode && arcNode.id === 'first_system') {
        FA.narrative.transition('arc', 'deeper', 'Going deeper');
      }
      Core.addSystemBubble('> Entering sub-level ' + depth + '.', '#4ef');
    }

    state.systemVisits++;
    var floor = Core.generateFloor(cfg.cols, cfg.rows, depth);
    var populated = Core.populateFloor(floor.map, floor.rooms, depth);

    var firstRoom = floor.rooms[0];
    var px = Math.floor(firstRoom.x + firstRoom.w / 2);
    var py = Math.floor(firstRoom.y + firstRoom.h / 2);
    if (floor.map[py][px] !== 0) { px = firstRoom.x + 1; py = firstRoom.y + 1; }

    var townEntities = state.maps.town.entities;
    for (var i = 0; i < townEntities.length; i++) {
      var npc = townEntities[i];
      if (npc.type !== 'npc') continue;
      if (!npc.met || state.day < npc.appearsDay) continue;
      var minDepth = npc.systemMinDepth || 1;
      if (depth < minDepth) continue;
      var npos = Core.findEmptyInRooms(floor.map, floor.rooms, populated.occupied);
      populated.occupied.push(npos);
      populated.entities.push({
        id: npc.id, type: 'system_npc', name: npc.name, char: npc.char, color: npc.color,
        x: npos.x, y: npos.y, allegiance: npc.allegiance,
        systemDialogue: npc.systemDialogue, talked: false
      });
    }

    var systemMapId = 'system_d' + depth;
    var loc = Location.get(systemMapId);
    state.maps[systemMapId] = {
      grid: floor.map,
      entities: populated.entities,
      items: populated.items,
      explored: floor.explored,
      rooms: floor.rooms,
      effects: loc ? loc.effects : ['systemCold']
    };

    state.townReturnPos = { x: state.player.x, y: state.player.y };
    state.player.hp = state.player.maxHp;
    state.player.cloakTurns = 0; state.player.overclockActive = false; state.player.firewallHp = 0;

    Core.changeMap(systemMapId, px, py);
    state.systemTurn = 0;
    state.terminalsHacked = 0;
    state.directorMsgShown = {};

    var lightRadius = 10 - depth * 0.5;
    state.visible = Core.computeVisibility(state.map, px, py, lightRadius);

    FA.clearEffects();
    if (FA.narrative && FA.narrative.setVar) {
      FA.narrative.setVar('system_visits', state.systemVisits, 'Entered system');
    }
    Core.triggerThought('system_enter');
  }

  function exitSystem(reason) {
    var state = FA.getState();
    var timeCfg = FA.lookup('config', 'time');
    var econCfg = FA.lookup('config', 'economy');

    state.credits += state.player.gold;
    state.totalKills = (state.totalKills || 0) + state.player.kills;
    state.totalGold = (state.totalGold || 0) + state.player.gold;
    state.player.gold = 0;
    state.player.kills = 0;

    if (reason === 'ejected') {
      state.credits = Math.max(0, state.credits - econCfg.ejectionPenalty);
    }

    state.timeOfDay += timeCfg.systemTimeCost;
    state.player.cloakTurns = 0; state.player.overclockActive = false; state.player.firewallHp = 0;
    state.visible = null;

    var dungeonMapId = state.mapId;
    var fallbackStart = { x: 13, y: 1 };
    if (typeof getMap === 'function') {
      var md = getMap('overworld');
      if (md && md.playerStart) fallbackStart = md.playerStart;
    }
    var returnPos = state.townReturnPos || fallbackStart;
    Core.changeMap('town', returnPos.x, returnPos.y);
    delete state.maps[dungeonMapId];

    FA.clearEffects();

    if (reason === 'ejected') {
      var narText = FA.lookup('narrativeText', 'ejected');
      if (narText) Core.addSystemBubble(narText.text, narText.color);
      var ejectedCs = FA.lookup('cutscenes', 'ejected');
      if (ejectedCs) Core.startCutscene(ejectedCs, state);
    }

    DayCycle.checkTimeWarnings(state);
  }

  function handlePlayerDeath(state) {
    if (Location.isSystem(state.mapId)) {
      exitSystem('ejected');
    } else {
      Core.triggerEnding(false, 'curfew');
    }
  }

  // ============================================================
  //  NPC COMMS (dungeon)
  // ============================================================

  function npcComm(state) {
    var townEntities = state.maps.town.entities;
    var currentMap = state.maps[state.mapId];
    if (!currentMap) return;
    var mapEntities = currentMap.entities;
    var hasSysNPC = false;
    for (var si = 0; si < mapEntities.length; si++) {
      if (mapEntities[si].type === 'system_npc') { hasSysNPC = true; break; }
    }
    if (!hasSysNPC) return;

    var commsPool = FA.lookup('config', 'systemComms');
    if (!commsPool) return;
    var candidates = [];
    for (var i = 0; i < townEntities.length; i++) {
      if (townEntities[i].type === 'npc' && townEntities[i].met) candidates.push(townEntities[i]);
    }
    if (candidates.length === 0) return;
    var npc = FA.pick(candidates);
    var pool = commsPool[npc.allegiance];
    if (!pool || pool.length === 0) return;
    Core.addSystemBubble('@' + npc.name + ': ' + FA.pick(pool), npc.color);
  }

  // ============================================================
  //  TURN & END GAME
  // ============================================================

  function endTurn() {
    var state = FA.getState();
    if (state.screen !== 'playing') return;
    state.turn++;
    Core.tickBubbles();
    var mapData = state.maps[state.mapId];
    var fx = mapData ? mapData.effects || [] : [];

    var hasTime = fx.indexOf('timeOfDay') !== -1;
    if (hasTime) {
      var oldPeriod = NPC.getTimePeriod(state.timeOfDay);
      state.timeOfDay++;
      var newPeriod = NPC.getTimePeriod(state.timeOfDay);

      if (state.maps.town) {
        if (oldPeriod !== newPeriod) {
          NPC.updateNPCPositions(state);
          if (FA.narrative && FA.narrative.setVar) FA.narrative.setVar('time_period', newPeriod, 'Period: ' + newPeriod);
        }
        NPC.npcOverworldTurn(state);
      }

      DayCycle.checkTimeWarnings(state);
    }

    if (!hasTime) {
      state.systemTurn = (state.systemTurn || 0) + 1;
    }

    if (state.player) {
      var lightRadius = hasTime ? 14 : 10 - (state.depth || 1) * 0.5;
      state.visible = Core.computeVisibility(state.map, state.player.x, state.player.y, lightRadius);
    }

    Combat.enemyTurn();

    if (hasTime) {
      DayCycle.checkOverworldThoughts(state);
    } else if (state.screen === 'playing' && state.systemTurn > 0) {
      if (state.systemTurn % COMM_INTERVAL === 0) {
        npcComm(state);
      } else if (state.systemTurn % AMBIENT_THOUGHT_INTERVAL === 0) {
        Core.triggerThought('ambient');
      }
    }
  }

  function endGame(victory, endingNode) {
    var state = FA.getState();
    state.screen = victory ? 'victory' : 'shutdown';
    state.endingNode = endingNode;
    var scoring = FA.lookup('config', 'scoring');
    var kills = (state.totalKills || 0) + (state.player ? state.player.kills : 0);
    var gold = (state.totalGold || 0) + (state.player ? state.player.gold : 0);
    state.score = (kills * scoring.killMultiplier) +
                  ((state.credits || 0) * scoring.goldMultiplier) +
                  ((state.systemVisits || 0) * scoring.depthBonus) +
                  ((state.day || 1) * scoring.dayBonus);
    state.finalStats = {
      kills: kills, gold: gold, days: state.day,
      visits: state.systemVisits, credits: state.credits
    };
    FA.emit('game:over', { victory: victory, score: state.score });
  }

  function dismissCutscene() {
    var state = FA.getState();
    if (!state.cutscene) return;
    if (!state.cutscene.done) {
      var cs = state.cutscene;
      var ld = cs.lineDelay || 200;
      var lastIdx = cs.lines.length - 1;
      cs.timer = lastIdx * ld + TextFX.totalTime(cs.lines[lastIdx]) + 1;
      cs.done = true;
      return;
    }
    state.screen = state.cutsceneReturn || 'playing';
    state.cutscene = null;
    if (state._pendingEnd) {
      var pe = state._pendingEnd;
      state._pendingEnd = null;
      endGame(pe.victory, pe.endingNode);
    }
  }

  // ============================================================
  //  MODULE USE (wraps Systems + endTurn)
  // ============================================================

  function useModuleAndEnd(slotIdx) {
    Systems.useModule(slotIdx);
    endTurn();
  }

  // ============================================================
  //  EXPORTS
  // ============================================================

  window.Game = {
    start: startGame,
    begin: beginPlaying,
    movePlayer: movePlayer,
    interact: interact,
    useModule: useModuleAndEnd,
    dismissCutscene: dismissCutscene,
    dismissDream: DayCycle.dismissDream,
    dismissBubbles: Core.dismissBubbles,
    selectChoice: selectChoice,
    dismissChoice: dismissChoice,
    _endGame: endGame,
    _handlePlayerDeath: handlePlayerDeath,
    _showChoiceMenu: showChoiceMenu,
    _exitSystem: exitSystem
  };
})();
