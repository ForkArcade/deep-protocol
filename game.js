// Deep Protocol — Game Orchestrator
// Delegates to Combat, Systems, DayCycle, NPC, Core
(function() {
  'use strict';
  var FA = window.FA;
  var Core = window.Core;
  var NPC = window.NPC;
  var cfg = FA.lookup('config', 'game');

  // Template string helper: _tpl("Hello {name}", { name: "World" }) → "Hello World"
  function _tpl(s, v) { return s.replace(/\{(\w+)\}/g, function(_, k) { return v[k] != null ? v[k] : ''; }); }

  var _scriptBase = (document.currentScript && document.currentScript.src)
    ? document.currentScript.src.replace(/[^\/]*$/, '') : './';
  var econCfg = FA.lookup('config', 'economy');
  var timeCfg = FA.lookup('config', 'time');
  var fovCfg = FA.lookup('config', 'fov');
  var colors = FA.lookup('config', 'colors');
  var timeCosts = FA.lookup('config', 'timeCosts');
  var intervalsCfg = FA.lookup('config', 'intervals');
  var confidantCfg = FA.lookup('config', 'confidantEffects');

  // --- Memories (meta-progression) ---
  function _checkMilestones(mem) {
    var memCfg = FA.lookup('config', 'memories');
    if (!memCfg || !memCfg.milestones) return [];
    var active = [];
    for (var i = 0; i < memCfg.milestones.length; i++) {
      var m = memCfg.milestones[i], val = mem[m.field], met = false;
      if (m.op === 'gte') met = (typeof val === 'number') && val >= m.value;
      else if (m.op === 'eq') met = val === m.value;
      else if (m.op === 'has') met = Array.isArray(val) && val.indexOf(m.value) !== -1;
      if (met) active.push(m);
    }
    return active;
  }

  function applyMemories(state) {
    var memCfg = FA.lookup('config', 'memories');
    if (!memCfg) return;
    var mem;
    try { mem = JSON.parse(localStorage.getItem(memCfg.storageKey)); } catch(e) { mem = null; }
    if (!mem || !mem.totalRuns) return;
    var active = _checkMilestones(mem);
    if (active.length === 0) return;
    for (var i = 0; i < active.length; i++) {
      var bonus = active[i].bonus;
      if (bonus.type === 'credits') state.credits += bonus.value;
      else if (bonus.type === 'atk') state.player.atk += bonus.value;
      else if (bonus.type === 'def') state.player.def += bonus.value;
      else if (bonus.type === 'maxHp') { state.player.maxHp += bonus.value; state.player.hp += bonus.value; }
      else if (bonus.type === 'relationship' && FA.narrative && FA.narrative.setVar)
        FA.narrative.setVar(bonus.npc + '_interactions', bonus.value, bonus.npc + ' remembers');
      else if (bonus.type === 'systemReveal') {
        state.systemRevealed = true;
        if (FA.narrative && FA.narrative.setVar) FA.narrative.setVar('system_revealed', true, 'Memory: system revealed');
      }
    }
    state._activeMemories = active;
    Core.addThought(memCfg.startThought);
  }

  function saveMemories(state, victory) {
    var memCfg = FA.lookup('config', 'memories');
    if (!memCfg) return;
    var key = memCfg.storageKey, mem;
    try { mem = JSON.parse(localStorage.getItem(key)) || {}; } catch(e) { mem = {}; }
    mem.maxDepth = Math.max(mem.maxDepth || 0, state.depth || 0);
    mem.totalRuns = (mem.totalRuns || 0) + 1;
    mem.totalKills = (mem.totalKills || 0) + (state.totalKills || 0) + (state.player ? state.player.kills : 0);
    if (victory && state.endingNode === 'revelation') mem.bossDefeated = true;
    if (!mem.confidants) mem.confidants = [];
    var npcIds = ['lena', 'victor', 'marta', 'emil'];
    for (var i = 0; i < npcIds.length; i++) {
      var graph = FA.narrative && FA.narrative.graphs ? FA.narrative.graphs['quest_' + npcIds[i]] : null;
      if (graph && graph.currentNode === 'confidant' && mem.confidants.indexOf(npcIds[i]) === -1)
        mem.confidants.push(npcIds[i]);
    }
    try { localStorage.setItem(key, JSON.stringify(mem)); } catch(e) {}
    state._activeMemories = _checkMilestones(mem);
  }

  function getPlayerStart() {
    if (typeof getMap === 'function') { var md = getMap('overworld'); if (md && md.playerStart) return md.playerStart; }
    return { x: 13, y: 1 };
  }

  var COMM_INTERVAL = intervalsCfg.npcComm;
  var AMBIENT_THOUGHT_INTERVAL = intervalsCfg.ambientThought;

  var _onVarChanged = null;
  var _onTransition = null;

  function startGame() {
    FA.resetState({ screen: 'start' });
    FA.clearEffects();
  }

  function _registerNarrative(narData) {
    FA.narrative.init(narData);
    var id, d;
    // Dict registrations: key = registry name
    var dicts = ['behaviors', 'dialogues', 'thoughts', 'cutscenes', 'narrativeText',
                 'relationshipEffects', 'actors', 'locations', 'npcs', 'enemies', 'items', 'modules'];
    for (var di = 0; di < dicts.length; di++) {
      d = narData[dicts[di]] || {};
      for (id in d) FA.register(dicts[di], id, d[id]);
    }
    // Singleton config registrations
    var configs = ['needs', 'jobs', 'moods', 'cafe', 'garden', 'busyLines',
                   'moodDialogues', 'memories', 'systemComms', 'terminals', 'spawner'];
    for (var ci = 0; ci < configs.length; ci++)
      if (narData[configs[ci]]) FA.register('config', configs[ci], narData[configs[ci]]);
    if (narData.notices) FA.register('notices', 'board', narData.notices);
    if (narData.director) FA.register('config', 'director', narData.director);
    if (narData.sounds) FA.register('config', 'sounds', narData.sounds);
    if (narData.animations) FA.register('config', 'animations', narData.animations);
    if (narData.strings) FA.register('config', 'strings', narData.strings);
    if (narData.hudLabels) FA.register('config', 'hudLabels', narData.hudLabels);
    if (narData.dreamTextTemplates) FA.register('config', 'dreamTextTemplates', narData.dreamTextTemplates);
  }

  function beginPlaying() {
    fetch(_scriptBase + '_narrative.json')
      .then(function(r) { return r.json(); })
      .then(function(narData) {
        _registerNarrative(narData);
        _startPlaying();
      })
      .catch(function(err) {
        console.warn('[FA] _narrative.json not found, using data.js fallback', err);
        var narCfg = FA.lookup('config', 'narrative');
        if (narCfg) FA.narrative.init(narCfg);
        _startPlaying();
      });
  }

  function _startPlaying() {
    var playerStart = getPlayerStart();
    var townObjects = [];
    if (typeof getMapObjects === 'function') {
      townObjects = getMapObjects('overworld');
    }
    var townGrid = Core.parseOverworldMap();
    var npcs = NPC.initNPCs();

    var maps = {};
    var explored = [];
    for (var ey = 0; ey < cfg.rows; ey++) {
      explored[ey] = [];
      for (var ex = 0; ex < cfg.cols; ex++) explored[ey][ex] = false;
    }
    var townZones = null;
    if (typeof getMapZones === 'function') {
      townZones = getMapZones('overworld');
    }
    var townFrameGrid = typeof getMapFrameGrid === 'function' ? getMapFrameGrid('overworld') : null;
    maps.town = { grid: townGrid, entities: npcs, items: [], explored: explored, effects: ['timeOfDay', 'curfew'], objects: townObjects, zones: townZones, _frameGrid: townFrameGrid };

    FA.resetState({
      screen: 'playing',
      mapId: 'town',
      maps: maps,
      map: townGrid,
      player: {
        x: playerStart.x, y: playerStart.y, facing: 0,
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
      visible: Core.computeVisibility(townGrid, playerStart.x, playerStart.y, fovCfg.overworld),
      mapVersion: 1, turn: 0, systemTurn: 0,
      systemBubble: null,
      thoughts: [], lastThoughtTurn: -10,
      shake: 0, shakeX: 0, shakeY: 0,
      particles: [], soundWaves: [],
      _pendingEnd: null, _timeWarned: false, _curfewWarned: false,
      terminalsHacked: 0, directorMsgShown: {},
      townReturnPos: null,
      dreamMap: null, dreamExplored: null, dreamDepth: 0, dreamText: null, dreamTimer: 0
    });

    FA.clearEffects();

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
        // Show relationship level-up thought
        var effects = FA.lookup('relationshipEffects', npcId);
        if (effects && effects[data.to]) {
          Core.addThought(effects[data.to]);
        }
      }
    };
    FA.on('narrative:transition', _onTransition);

    // Apply memories from previous runs
    applyMemories(FA.getState());

    NPC.updateNPCPositions(FA.getState());
    var wakeCs = FA.lookup('cutscenes', 'wake');
    if (wakeCs) Core.startCutscene(wakeCs, FA.getState());
    Core.triggerThought('morning');
  }

  var DIR_DX = [0, 1, 0, -1];
  var DIR_DY = [-1, 0, 1, 0];

  function movePlayer(action) {
    var state = FA.getState();
    if (!state.player) return;
    var player = state.player;
    var f = player.facing;

    // Rotation — no movement, no turn cost
    if (action === 'rotateLeft')  { player.facing = (f + 3) % 4; state.mapVersion++; return; }
    if (action === 'rotateRight') { player.facing = (f + 1) % 4; state.mapVersion++; return; }

    // Compute dx,dy from facing + action
    var dx, dy;
    if (action === 'forward')          { dx = DIR_DX[f];  dy = DIR_DY[f]; }
    else if (action === 'back')        { dx = -DIR_DX[f]; dy = -DIR_DY[f]; }
    else if (action === 'strafeLeft')  { dx = -DIR_DY[f]; dy = DIR_DX[f]; }
    else if (action === 'strafeRight') { dx = DIR_DY[f];  dy = -DIR_DX[f]; }
    else return;

    var nx = player.x + dx;
    var ny = player.y + dy;

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
          Core.addSystemBubble(text, null, entity);
          Core.triggerThought('system_npc');
        }
        endTurn();
        return;
      }
    }

    if (!Core.isWalkable(state.map, nx, ny)) return;
    state.player.x = nx;
    state.player.y = ny;

    var tile = state.map[ny][nx];
    // Pass floor type to audio — overworld: 0=floor,2=indoor,3=garden,4=sidewalk; dungeon: 0=metal
    state._stepTile = tile;
    state._stepInSystem = Location.isSystem(state.mapId);
    FA.playSound('step');
    var mapData = state.maps[state.mapId];

    for (var j = mapData.items.length - 1; j >= 0; j--) {
      if (mapData.items[j].x === nx && mapData.items[j].y === ny) {
        Combat.pickup(mapData.items[j], j);
      }
    }

    if (tile === 3 && Location.isSystem(state.mapId)) { exitSystem('cleared'); return; }
    if (tile === 4 && Location.isSystem(state.mapId)) Combat.hackTerminal(nx, ny, state);

    endTurn();
  }

  function interact() {
    var state = FA.getState();

    if ((state.thoughts && state.thoughts.length > 0) || state.systemBubble) {
      dismissBubblesWithChoices();
      return;
    }

    var npc = NPC.getAdjacentNPC(state, state.player.x, state.player.y);
    if (npc) {
      NPC.talkToNPC(npc, state);
      if (state.day >= econCfg.systemRevealDay && !state.systemRevealed) {
        if (npc.id === 'victor' || npc.id === 'lena') {
          state.systemRevealed = true;
          state.mapVersion = (state.mapVersion || 0) + 1;
          if (FA.narrative && FA.narrative.setVar) FA.narrative.setVar('system_revealed', true, 'System revealed');
        }
      }
      state.timeOfDay += timeCosts.npcInteraction;
      state.turn += timeCosts.npcInteraction;
      NPC.checkTimeWarnings(state);
      return;
    }

    if (Location.hasFeature(state.mapId, 'objects')) {
      var obj = Core.getObjectAtPos(state.player.x, state.player.y);
      if (obj) {
        if (obj.type === 'bed') NPC.showBedChoice(state);
        else if (obj.type === 'terminal') workAtTerminal(state);
        else if (obj.type === 'notice_board') readNoticeBoard(state);
        else if (obj.type === 'cafe_table') eatAtCafe(state);
        else if (obj.type === 'garden_bench') restInGarden(state);
        else if (obj.type === 'system_entrance') {
          if (state.systemRevealed) enterSystem(state);
          else Core.addThought((FA.lookup('config','strings') || {}).sealedEntrance || 'A sealed maintenance shaft. Nothing to see.');
        }
      }
    } else if (Location.isSystem(state.mapId)) {
      var tile = state.map[state.player.y][state.player.x];
      if (tile === 4) Combat.hackTerminal(state.player.x, state.player.y, state);
    }
  }

  function restAction(state, configKey, title, label, color, thought) {
    var c = FA.lookup('config', configKey);
    if (!c) return;
    var cost = c.cost || 0;
    var canAfford = !cost || state.credits >= cost;
    Game._showChoiceMenu(state, title, [
      { label: canAfford ? label : 'Not enough credits', color: canAfford ? color : colors.actionDisabled,
        enabled: canAfford, action: function(s) {
          if (cost) s.credits -= cost;
          s.player.hp = Math.min(s.player.maxHp, s.player.hp + c.hpRestore);
          s.timeOfDay += c.timeCost; s.turn += c.timeCost;
          Core.addSystemBubble('> ' + c.text + ' +' + c.hpRestore + ' HP.', color);
          Core.triggerThought(thought); NPC.checkTimeWarnings(s);
        } },
      { label: 'Leave', color: colors.actionCancel, enabled: true, action: function() {} }
    ]);
  }

  function eatAtCafe(state) {
    var c = FA.lookup('config', 'cafe');
    restAction(state, 'cafe', '> CAFE \u2014 Order food?', c ? 'Eat (' + c.cost + ' cr)' : '', colors.actionCafe, 'cafe');
  }

  function restInGarden(state) {
    var c = FA.lookup('config', 'garden');
    restAction(state, 'garden', '> GARDEN \u2014 Rest here?', c ? 'Rest (+' + c.hpRestore + ' HP, ' + c.timeCost + ' turns)' : '', colors.actionGarden, 'garden');
  }

  function workAtTerminal(state) {
    if (state.workedToday) {
      Core.addSystemBubble('> ' + ((FA.lookup('config','strings') || {}).shiftDone || 'Shift already completed. Return tomorrow.'), colors.dim);
      return;
    }
    state.workedToday = true;
    state.timeOfDay += timeCfg.workTurns;
    state.turn += timeCfg.workTurns;
    state.credits += econCfg.workPay;
    Core.addSystemBubble('> ' + _tpl((FA.lookup('config','strings') || {}).shiftComplete || 'Shift complete. +{pay} credits.', { pay: econCfg.workPay }), colors.credits);
    Core.triggerThought('work');
    NPC.checkTimeWarnings(state);
  }

  function readNoticeBoard(state) {
    var entry = FA.select(FA.lookup('notices', 'board'));
    var text = entry ? entry.text : (FA.lookup('config','strings') || {}).emptyBoard || 'The board is empty.';
    Core.addSystemBubble('> ' + ((FA.lookup('config','strings') || {}).noticePrefix || 'NOTICE: ') + text, colors.actionNotices);
    state.timeOfDay += timeCosts.noticeBoard;
    state.turn += timeCosts.noticeBoard;
  }

  function showChoiceMenu(state, title, options) {
    state.choiceMenu = { title: title, options: options, timer: 0, selectedIndex: 0 };
  }

  function choiceMove(delta) {
    var state = FA.getState();
    if (!state.choiceMenu) return;
    var menu = state.choiceMenu, len = menu.options.length, attempts = len;
    menu.selectedIndex = (menu.selectedIndex + delta + len) % len;
    while (menu.options[menu.selectedIndex].enabled === false && attempts-- > 0)
      menu.selectedIndex = (menu.selectedIndex + delta + len) % len;
  }

  function confirmChoice() {
    var state = FA.getState();
    if (!state.choiceMenu) return;
    var opt = state.choiceMenu.options[state.choiceMenu.selectedIndex];
    if (!opt || opt.enabled === false) return;
    state.choiceMenu = null;
    if (opt.action) opt.action(state);
  }

  function dismissBubblesWithChoices() {
    var state = FA.getState();
    Core.dismissBubbles();
    // After bubble dismiss, show pending dialogue choices if any
    var pending = state._pendingDialogueChoice;
    if (pending) {
      state._pendingDialogueChoice = null;
      var options = [];
      for (var i = 0; i < pending.choices.length; i++) {
        (function(choice, npcId, npcName, source) {
          options.push({
            label: choice.label,
            color: colors.dialogueChoice,
            enabled: true,
            action: function(s) {
              // Apply relationship delta
              if (FA.narrative && FA.narrative.setVar) {
                var delta = choice.relationship || 0;
                var prev = FA.narrative.getVar(npcId + '_interactions') || 0;
                var next = Math.max(0, prev + delta);
                if (next !== prev) {
                  FA.narrative.setVar(npcId + '_interactions', next, 'Talked to ' + npcName);
                }
              }
              // Show NPC reply if exists
              if (choice.reply) {
                Core.addSystemBubble(choice.reply, null, source);
              }
            }
          });
        })(pending.choices[i], pending.npcId, pending.npcName, pending.source);
      }
      showChoiceMenu(state, '> ' + pending.npcName, options);
    }
  }

  function enterSystem(state) {
    var depth = Math.min(state.systemVisits + 1, cfg.maxDepth);
    // Emil confidant: skip depth 1 (start at depth 2)
    if (depth === 1 && Core.isConfidant('emil')) {
      depth = confidantCfg.emil.skipToDepth;
    }

    if (state.systemVisits === 0) {
      Core.showNarrative('arc', 'first_system');
    } else {
      var arcNode = FA.narrative.getNode('arc');
      if (arcNode && arcNode.id === 'first_system') {
        FA.narrative.transition('arc', 'deeper', 'Going deeper');
      }
      Core.addSystemBubble('> ' + _tpl((FA.lookup('config','strings') || {}).enterSubLevel || 'Entering sub-level {depth}.', { depth: depth }), colors.startTitle);
    }

    state.systemVisits++;
    FA.playSound('door');
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

    var lightRadius = fovCfg.systemBase - depth * fovCfg.systemDepthPenalty;
    if (Core.isConfidant('victor')) lightRadius += confidantCfg.victor.fovBonus;
    state.visible = Core.computeVisibility(state.map, px, py, lightRadius);

    FA.clearEffects();
    if (FA.narrative && FA.narrative.setVar) {
      FA.narrative.setVar('system_visits', state.systemVisits, 'Entered system');
    }
    Core.triggerThought('system_enter');
  }

  function exitSystem(reason) {
    var state = FA.getState();

    state.credits += state.player.gold;
    state.totalKills = (state.totalKills || 0) + state.player.kills;
    state.totalGold = (state.totalGold || 0) + state.player.gold;
    state.player.gold = 0;
    state.player.kills = 0;

    if (reason === 'ejected') {
      state.credits = Math.max(0, state.credits - econCfg.ejectionPenalty);
    }

    state.timeOfDay += reason === 'cleared' ? Math.floor(timeCfg.systemTimeCost / 2) : timeCfg.systemTimeCost;
    state.player.cloakTurns = 0; state.player.overclockActive = false; state.player.firewallHp = 0;
    state.visible = null;

    var dungeonMapId = state.mapId;
    var returnPos = state.townReturnPos || getPlayerStart();
    FA.playSound('door');
    Core.changeMap('town', returnPos.x, returnPos.y);
    delete state.maps[dungeonMapId];

    FA.clearEffects();

    if (reason === 'ejected') {
      var narText = FA.lookup('narrativeText', 'ejected');
      if (narText) Core.addSystemBubble(narText.text, narText.color);
      var ejectedCs = FA.lookup('cutscenes', 'ejected');
      if (ejectedCs) Core.startCutscene(ejectedCs, state);
    }

    NPC.checkTimeWarnings(state);
  }

  function handlePlayerDeath(state) {
    if (Location.isSystem(state.mapId)) {
      exitSystem('ejected');
    } else {
      Core.triggerEnding(false, 'curfew');
    }
  }

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

      // Hunger: HP decays based on needs config
      var hungerCfg = FA.lookup('config', 'needs');
      if (hungerCfg && hungerCfg.hunger) {
        state._hungerAccum = (state._hungerAccum || 0) + hungerCfg.hunger.decay;
        if (state._hungerAccum >= 1 && state.player.hp > 1) {
          state.player.hp--;
          state._hungerAccum = 0;
        }
      }

      NPC.checkTimeWarnings(state);
    }

    if (!hasTime) {
      state.systemTurn = (state.systemTurn || 0) + 1;
    }

    if (state.player) {
      var lightRadius = hasTime ? fovCfg.overworld : fovCfg.systemBase - (state.depth || 1) * fovCfg.systemDepthPenalty;
      if (!hasTime && Core.isConfidant('victor')) lightRadius += confidantCfg.victor.fovBonus;
      state.visible = Core.computeVisibility(state.map, state.player.x, state.player.y, lightRadius);
    }

    Combat.enemyTurn();

    if (FA.narrative.tick) FA.narrative.tick(1);

    if (hasTime) {
      NPC.checkOverworldThoughts(state);
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
    FA.playSound('gameover');
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
    saveMemories(state, victory);
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

  function useModuleAndEnd(slotIdx) {
    Combat.useModule(slotIdx);
    endTurn();
  }

  window.Game = {
    start: startGame,
    begin: beginPlaying,
    movePlayer: movePlayer,
    interact: interact,
    useModule: useModuleAndEnd,
    dismissCutscene: dismissCutscene,
    dismissDream: NPC.dismissDream,
    dismissBubbles: dismissBubblesWithChoices,
    choiceUp: function() { choiceMove(-1); },
    choiceDown: function() { choiceMove(1); },
    confirmChoice: confirmChoice,
    _endGame: endGame,
    _handlePlayerDeath: handlePlayerDeath,
    _showChoiceMenu: showChoiceMenu,
    _exitSystem: exitSystem
  };
})();
