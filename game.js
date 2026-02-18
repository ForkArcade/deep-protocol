// Deep Protocol — Game Logic (Unified World)
// One player, one movement system, one turn system across all maps
(function() {
  'use strict';
  var FA = window.FA;
  var Core = window.Core;
  var NPC = window.NPC;

  // === CONSTANTS ===

  var SHAKE_INTENSITY = 6;
  var SENTINEL_SHOOT_RANGE = 6;
  var EMP_RANGE = 5;
  var EMP_STUN_TURNS = 3;
  var CLOAK_TURNS = 6;
  var FIREWALL_HP = 12;
  var OVERCLOCK_MULTIPLIER = 3;
  var PARTICLE_COUNT = 8;
  var PARTICLE_LIFE = 500;
  var COMM_INTERVAL = 12;
  var AMBIENT_THOUGHT_INTERVAL = 20;
  var CURFEW_DRONE_COUNT = 6;

  // Listener refs (prevent accumulation on restart)
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
    var owCfg = FA.lookup('config', 'overworld');
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
    maps.town = { grid: townGrid, entities: npcs, items: [], explored: explored, effects: ['timeOfDay', 'curfew'] };

    FA.resetState({
      screen: 'playing',
      mapId: 'town',
      maps: maps,
      map: townGrid,
      player: {
        x: owCfg.playerStart.x, y: owCfg.playerStart.y,
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
      visible: Core.computeVisibility(townGrid, owCfg.playerStart.x, owCfg.playerStart.y, 14),
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
  //  UNIFIED MOVEMENT
  // ============================================================

  function movePlayer(dx, dy) {
    var state = FA.getState();
    if (!state.player) return;
    var nx = state.player.x + dx;
    var ny = state.player.y + dy;

    // Check entity at target
    var entity = Core.getEntityAt(nx, ny);
    if (entity) {
      if (entity.type === 'enemy') {
        attackEnemy(state.player, entity);
        endTurn();
        return;
      }
      if (entity.type === 'npc') {
        // Swap positions
        entity.x = state.player.x;
        entity.y = state.player.y;
        // Fall through to move player
      } else if (entity.type === 'system_npc') {
        // Talk (player stays in place)
        if (!entity.talked) {
          entity.talked = true;
          var text = (entity.systemDialogue && entity.systemDialogue[entity.allegiance]) || '...';
          Core.addSystemBubble(entity.name + ': "' + text + '"', entity.color);
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

    // Item pickup (works on any map)
    for (var j = mapData.items.length - 1; j >= 0; j--) {
      if (mapData.items[j].x === nx && mapData.items[j].y === ny) {
        pickupItem(mapData.items[j], j);
      }
    }

    // Tile interactions (stairs up, terminals — work on any map that has them)
    if (tile === 3 && state.mapId !== 'town') { exitSystem('cleared'); return; }
    if (tile === 4 && state.mapId !== 'town') hackTerminal(nx, ny, state);

    endTurn();
  }

  // ============================================================
  //  INTERACT (SPACE key — context actions on any map)
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
      checkTimeWarnings(state);
      return;
    }

    var tile = state.map[state.player.y][state.player.x];
    // Town tile actions (tile IDs 4-9 have town-specific meanings)
    if (state.mapId === 'town') {
      if (tile === 6) showBedChoice(state);
      else if (tile === 7) workAtTerminal(state);
      else if (tile === 4) readNoticeBoard(state);
      else if (tile === 8) {
        if (state.systemRevealed) enterSystem(state);
        else Core.addThought('A sealed maintenance shaft. Nothing to see.');
      }
    } else {
      // Dungeon: SPACE on terminal = hack it
      if (tile === 4) hackTerminal(state.player.x, state.player.y, state);
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
    checkTimeWarnings(state);
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

  function showBedChoice(state) {
    var econCfg = FA.lookup('config', 'economy');
    var rent = econCfg.baseRent + (state.day - 1) * econCfg.rentIncrease;
    var canAfford = state.credits >= rent;
    showChoiceMenu(state, '> LODGING \u2014 Pay ' + rent + ' cr for the night?', [
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

  // ============================================================
  //  SLEEP / DAY CYCLE
  // ============================================================

  function goToBed(state) {
    var econCfg = FA.lookup('config', 'economy');
    var rent = econCfg.baseRent + (state.day - 1) * econCfg.rentIncrease;
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

    // Remove any curfew drones from town
    removeCurfewDrones(state);

    // Reset NPCs for new day
    var npcs = NPC.getNPCs(state);
    for (var ni = 0; ni < npcs.length; ni++) {
      npcs[ni].talkedToday = false;
      npcs[ni].wantsToTalk = true;
      npcs[ni].followTurns = 0;
    }
    if (FA.narrative && FA.narrative.setVar) {
      FA.narrative.setVar('day', state.day, 'New day');
      FA.narrative.setVar('curfew_active', false, 'Day reset');
      FA.narrative.setVar('lena_met_today', false, 'Day reset');
      FA.narrative.setVar('victor_met_today', false, 'Day reset');
      FA.narrative.setVar('marta_met_today', false, 'Day reset');
      FA.narrative.setVar('emil_met_today', false, 'Day reset');
    }
    state.rent = econCfg.baseRent + (state.day - 1) * econCfg.rentIncrease;
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
      if (!state.bubbleQueue) state.bubbleQueue = [];
      state.bubbleQueue.push({ type: 'system', text: '> Day ' + state.day + '. Rent: -' + rent + 'cr. Balance: ' + state.credits + 'cr.', color: '#f44' });
    } else {
      Core.addSystemBubble('> Day ' + state.day + '. Rent: -' + rent + 'cr. Balance: ' + state.credits + 'cr.', '#f44');
    }
    Core.triggerThought('morning');
  }

  var _dreamTexts = [
    '// SIGNAL INTERCEPT \u2014 DEPTH ',
    '// UNAUTHORIZED STRUCTURE \u2014 DEPTH ',
    '// ANOMALY DETECTED \u2014 DEPTH ',
    '// SUBSYSTEM ECHO \u2014 DEPTH '
  ];

  function dreamSnapshot(state) {
    var cfg = FA.lookup('config', 'game');
    var dreamDepth = FA.rand(1, 3);
    var floor = Core.generateFloor(cfg.cols, cfg.rows, dreamDepth);
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
    if (state.bubbleQueue && state.bubbleQueue.length > 0) {
      var next = state.bubbleQueue.shift();
      if (next.type === 'system') Core._createSystemBubble(state, next.text, next.color);
      else Core._createThought(state, next.text);
    }
  }

  function checkTimeWarnings(state) {
    var timeCfg = FA.lookup('config', 'time');
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
    if (Math.abs(state.player.x - 29) < 5 && Math.abs(state.player.y - 8) < 4) {
      Core.triggerThought('cafe');
    }
  }

  // ============================================================
  //  CURFEW DRONES (real enemies on town map)
  // ============================================================

  function spawnCurfewDrones(state) {
    var def = FA.lookup('enemies', 'drone');
    var townEntities = state.maps.town.entities;
    var townGrid = state.maps.town.grid;
    var cfg = FA.lookup('config', 'game');
    for (var i = 0; i < CURFEW_DRONE_COUNT; i++) {
      var dx, dy, attempts = 0;
      do {
        dx = FA.rand(1, cfg.cols - 2);
        dy = FA.rand(1, cfg.rows - 2);
        attempts++;
      } while (attempts < 50 && (!Core.isWalkable(townGrid, dx, dy) ||
        (state.mapId === 'town' && state.player && Math.abs(dx - state.player.x) + Math.abs(dy - state.player.y) < 5)));
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

  // ============================================================
  //  SYSTEM ENTRY / EXIT (via changeMap)
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

    // Create system NPCs from town NPCs that player has met
    var townEntities = state.maps.town.entities;
    for (var i = 0; i < townEntities.length; i++) {
      var npc = townEntities[i];
      if (npc.type !== 'npc') continue;
      if (!npc.met || state.day < npc.appearsDay) continue;
      if (depth < 2 && npc.id !== 'lena') continue;
      if (depth < 3 && npc.id === 'emil') continue;
      var npos = Core.findEmptyInRooms(floor.map, floor.rooms, populated.occupied);
      populated.occupied.push(npos);
      populated.entities.push({
        id: npc.id, type: 'system_npc', name: npc.name, char: npc.char, color: npc.color,
        x: npos.x, y: npos.y, allegiance: npc.allegiance,
        systemDialogue: npc.systemDialogue, talked: false
      });
    }

    // Store dungeon map in registry
    state.maps[depth] = {
      grid: floor.map,
      entities: populated.entities,
      items: populated.items,
      explored: floor.explored,
      rooms: floor.rooms,
      effects: depth >= 3 ? ['systemCold', 'corruption'] : ['systemCold']
    };

    // Save town return position
    state.townReturnPos = { x: state.player.x, y: state.player.y };

    // Heal to full on system entry, clear temporary buffs
    state.player.hp = state.player.maxHp;
    state.player.cloakTurns = 0; state.player.overclockActive = false; state.player.firewallHp = 0;

    // Change to dungeon map
    Core.changeMap(depth, px, py);
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

    // Transfer dungeon earnings to persistent economy
    state.credits += state.player.gold;
    state.totalKills = (state.totalKills || 0) + state.player.kills;
    state.totalGold = (state.totalGold || 0) + state.player.gold;
    // Zero out run counters (already transferred)
    state.player.gold = 0;
    state.player.kills = 0;

    if (reason === 'ejected') {
      state.credits = Math.max(0, state.credits - econCfg.ejectionPenalty);
    }

    state.timeOfDay += timeCfg.systemTimeCost;

    // Discard dungeon map
    delete state.maps[state.mapId];

    // Clear temporary buffs, keep stats/modules/hp
    state.player.cloakTurns = 0; state.player.overclockActive = false; state.player.firewallHp = 0;
    state.visible = null;

    // Return to town
    var returnPos = state.townReturnPos || FA.lookup('config', 'overworld').playerStart;
    Core.changeMap('town', returnPos.x, returnPos.y);

    FA.clearEffects();

    if (reason === 'ejected') {
      var narText = FA.lookup('narrativeText', 'ejected');
      if (narText) Core.addSystemBubble(narText.text, narText.color);
      var ejectedCs = FA.lookup('cutscenes', 'ejected');
      if (ejectedCs) Core.startCutscene(ejectedCs, state);
    }

    checkTimeWarnings(state);
  }

  // ============================================================
  //  COMBAT
  // ============================================================

  function attackEnemy(attacker, target) {
    var state = FA.getState();
    var multiplier = 1;
    if (state.player.overclockActive) {
      multiplier = OVERCLOCK_MULTIPLIER;
      state.player.overclockActive = false;
    }
    var dmg = Math.max(1, Math.floor((attacker.atk - target.def + FA.rand(-1, 2)) * multiplier));
    target.hp -= dmg;
    FA.emit('entity:damaged', { entity: target, damage: dmg });

    var label = multiplier > 1 ? 'OC -' + dmg : '-' + dmg;
    var color = multiplier > 1 ? '#f80' : '#f44';
    var cfg = FA.lookup('config', 'game');
    var ts = cfg.tileSize;
    FA.addFloat(target.x * ts + ts / 2, target.y * ts, label, color, 800);
    Core.propagateSound(target.x, target.y, 8);

    if (target.hp <= 0) {
      // Remove from entity list
      var entities = state.maps[state.mapId].entities;
      for (var i = 0; i < entities.length; i++) {
        if (entities[i] === target) { entities.splice(i, 1); break; }
      }
      state.player.kills++;
      if (FA.narrative && FA.narrative.setVar) {
        FA.narrative.setVar('kills', (state.totalKills || 0) + state.player.kills, 'Destroyed ' + target.name);
      }
      FA.emit('entity:killed', { entity: target });

      var bx = target.x * ts + ts / 2, by = target.y * ts + ts / 2;
      for (var pi = 0; pi < PARTICLE_COUNT; pi++) {
        var angle = (pi / PARTICLE_COUNT) * Math.PI * 2 + Math.random() * 0.5;
        state.particles.push({
          x: bx, y: by,
          vx: Math.cos(angle) * (40 + Math.random() * 30),
          vy: Math.sin(angle) * (40 + Math.random() * 30),
          life: PARTICLE_LIFE, maxLife: PARTICLE_LIFE, color: target.color
        });
      }

      Core.triggerThought('combat');

      // Check victory condition (all enemies dead on final depth)
      if (state.mapId !== 'town' && state.depth >= cfg.maxDepth) {
        var hasEnemies = false;
        for (var ei = 0; ei < entities.length; ei++) {
          if (entities[ei].type === 'enemy') { hasEnemies = true; break; }
        }
        if (!hasEnemies) Core.triggerEnding(true, 'revelation');
      }
    }
  }

  function applyDamageToPlayer(dmg, sourceName, state) {
    if (state.player.firewallHp > 0) {
      var absorbed = Math.min(dmg, state.player.firewallHp);
      state.player.firewallHp -= absorbed;
      dmg -= absorbed;
      if (dmg <= 0) return;
    }

    state.player.hp -= dmg;
    state.shake = SHAKE_INTENSITY;
    FA.emit('entity:damaged', { entity: state.player, damage: dmg });

    var cfg = FA.lookup('config', 'game');
    var ts = cfg.tileSize;
    FA.addFloat(state.player.x * ts + ts / 2, state.player.y * ts, '-' + dmg, '#f84', 800);

    if (state.player.hp <= 0) {
      if (state.mapId === 'town') {
        // Killed by curfew drones
        Core.triggerEnding(false, 'curfew');
      } else {
        exitSystem('ejected');
      }
    } else if (state.player.hp <= state.player.maxHp * 0.3) {
      Core.triggerThought('low_health');
    } else {
      Core.triggerThought('damage');
    }
  }

  function sentinelShoot(e, state) {
    if (!state.player || state.player.cloakTurns > 0) return;
    var dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (var d = 0; d < dirs.length; d++) {
      var sx = e.x, sy = e.y;
      for (var r = 1; r <= SENTINEL_SHOOT_RANGE; r++) {
        sx += dirs[d][0]; sy += dirs[d][1];
        if (sy < 0 || sy >= state.map.length || sx < 0 || sx >= state.map[0].length) break;
        if (state.map[sy][sx] === 1) break;
        if (sx === state.player.x && sy === state.player.y) {
          var dmg = Math.max(1, e.atk - state.player.def + FA.rand(-1, 1));
          var cfg = FA.lookup('config', 'game');
          var ts = cfg.tileSize;
          FA.addFloat(e.x * ts + ts / 2, e.y * ts, '!', '#f80', 600);
          applyDamageToPlayer(dmg, e.name, state);
          Core.propagateSound(e.x, e.y, 10);
          return;
        }
      }
    }
  }

  function pickupItem(item, idx) {
    var state = FA.getState();
    var mapData = state.maps[state.mapId];
    if (item.type === 'module' && state.player.modules.length >= 3) {
      var cfg2 = FA.lookup('config', 'game');
      var ts2 = cfg2.tileSize;
      FA.addFloat(item.x * ts2 + ts2 / 2, item.y * ts2, 'FULL', '#f44', 600);
      return;
    }
    mapData.items.splice(idx, 1);
    FA.emit('item:pickup', { item: item });
    var cfg = FA.lookup('config', 'game');
    var ts = cfg.tileSize;
    if (item.type === 'gold') {
      state.player.gold += item.value;
      FA.addFloat(state.player.x * ts + ts / 2, state.player.y * ts, '+' + item.value, '#0ff', 600);
      Core.triggerThought('pickup_data');
    } else if (item.type === 'potion') {
      var heal = Math.min(item.healAmount, state.player.maxHp - state.player.hp);
      state.player.hp += heal;
      FA.addFloat(state.player.x * ts + ts / 2, state.player.y * ts, '+' + heal, '#4f4', 600);
    } else if (item.type === 'module') {
      state.player.modules.push({ type: item.moduleType, name: item.name, color: item.color });
      FA.addFloat(state.player.x * ts + ts / 2, state.player.y * ts, item.name, item.color, 800);
    }
  }

  // ============================================================
  //  AI SYSTEM
  // ============================================================

  function computeEnemyAction(e, state, rooms) {
    var p = state.player;
    if (!p) return { type: 'idle' };
    var dist = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
    var cloaked = p.cloakTurns > 0;

    // Curfew drones always hunt — they have thermal scanners, ignore walls/cloak
    if (e.curfewDrone) {
      if (dist === 1) return { type: 'attack' };
      return { type: 'chase' };
    }

    var sightRange = e.behavior === 'tracker' ? 20 : e.behavior === 'sentinel' ? 6 : 8;
    var canSee = !cloaked && dist <= sightRange && Core.hasLOS(state.map, e.x, e.y, p.x, p.y);

    if (dist === 1 && !cloaked) {
      e.aiState = 'hunting';
      e.alertTarget = { x: p.x, y: p.y };
      return { type: e.behavior === 'sentinel' ? 'shoot' : 'attack' };
    }

    if (canSee) {
      e.aiState = 'hunting';
      e.alertTarget = { x: p.x, y: p.y };
      e.alertTimer = 0;
    } else if (e.aiState === 'hunting') {
      e.aiState = 'alert';
      e.alertTimer = 8;
    }

    if (e.aiState === 'alert') {
      e.alertTimer--;
      if (e.alertTimer <= 0) {
        e.aiState = 'patrol';
        e.alertTarget = null;
        e.patrolTarget = null;
      }
    }

    switch (e.aiState) {
      case 'hunting':
        if (e.behavior === 'sentinel') return { type: 'shoot' };
        if (e.behavior === 'tracker' && dist <= 4) return { type: 'flank' };
        return { type: 'chase' };
      case 'alert':
        if (e.behavior === 'sentinel') return { type: 'shoot' };
        if (e.alertTarget) {
          if (e.x === e.alertTarget.x && e.y === e.alertTarget.y) return { type: 'random' };
          return { type: 'investigate' };
        }
        return { type: 'random' };
      default:
        if (e.behavior === 'sentinel') return { type: 'idle' };
        if (!e.patrolTarget || (e.x === e.patrolTarget.x && e.y === e.patrolTarget.y)) {
          if (rooms && rooms.length > 0) {
            var room = rooms[Math.floor(Math.random() * rooms.length)];
            e.patrolTarget = { x: Math.floor(room.x + room.w / 2), y: Math.floor(room.y + room.h / 2) };
          }
        }
        return { type: 'patrol' };
    }
  }

  function enemyTurn() {
    var state = FA.getState();
    if (state.screen !== 'playing' || !state.player) return;
    if (state.player.cloakTurns > 0) state.player.cloakTurns--;

    var mapData = state.maps[state.mapId];
    var entities = mapData.entities;
    var rooms = mapData.rooms || null;

    for (var i = 0; i < entities.length; i++) {
      if (state.screen !== 'playing' || !state.player) return;
      var e = entities[i];
      if (e.type !== 'enemy') continue;
      if (e.stunTurns > 0) { e.stunTurns--; continue; }

      var action = computeEnemyAction(e, state, rooms);

      switch (action.type) {
        case 'shoot':
          sentinelShoot(e, state);
          break;
        case 'attack':
          if (state.player) {
            var dmg = Math.max(1, e.atk - state.player.def + FA.rand(-1, 1));
            applyDamageToPlayer(dmg, e.name, state);
          }
          break;
        case 'chase':
          Core.moveToward(e, state.player.x, state.player.y);
          break;
        case 'flank':
          Core.flankTarget(e, state.player.x, state.player.y);
          break;
        case 'investigate':
          Core.moveToward(e, e.alertTarget.x, e.alertTarget.y);
          break;
        case 'patrol':
          if (e.patrolTarget) Core.moveToward(e, e.patrolTarget.x, e.patrolTarget.y);
          break;
        case 'random':
          Core.randomStep(e);
          break;
      }
    }
  }

  // ============================================================
  //  MODULES
  // ============================================================

  function useModule(slotIdx) {
    var state = FA.getState();
    if (state.screen !== 'playing' || !state.player) return;
    // modules work everywhere — open world, no mode restrictions
    if (slotIdx >= state.player.modules.length) return;

    var mod = state.player.modules[slotIdx];
    state.player.modules.splice(slotIdx, 1);
    var cfg = FA.lookup('config', 'game');
    var ts = cfg.tileSize;
    var px = state.player.x * ts + ts / 2, py = state.player.y * ts;

    var mapData = state.maps[state.mapId];

    switch (mod.type) {
      case 'emp':
        for (var i = 0; i < mapData.entities.length; i++) {
          var e = mapData.entities[i];
          if (e.type !== 'enemy') continue;
          var dist = Math.abs(e.x - state.player.x) + Math.abs(e.y - state.player.y);
          if (dist <= EMP_RANGE) {
            e.stunTurns = (e.stunTurns || 0) + EMP_STUN_TURNS;
            FA.addFloat(e.x * ts + ts / 2, e.y * ts, 'STUN', '#ff0', 800);
          }
        }
        FA.addFloat(px, py, 'EMP', '#ff0', 800);
        Core.propagateSound(state.player.x, state.player.y, 12);
        break;
      case 'cloak':
        state.player.cloakTurns = CLOAK_TURNS;
        FA.addFloat(px, py, 'CLOAK', '#88f', 800);
        break;
      case 'scanner':
        var explored = mapData.explored;
        if (explored) {
          for (var sy = 0; sy < explored.length; sy++)
            for (var sx = 0; sx < explored[sy].length; sx++)
              explored[sy][sx] = true;
        }
        FA.addFloat(px, py, 'SCAN', '#0ff', 800);
        break;
      case 'overclock':
        state.player.overclockActive = true;
        FA.addFloat(px, py, 'OC!', '#f44', 800);
        break;
      case 'firewall':
        state.player.firewallHp = FIREWALL_HP;
        FA.addFloat(px, py, 'SHIELD', '#4f4', 800);
        break;
    }
    endTurn();
  }

  // ============================================================
  //  TERMINALS (System)
  // ============================================================

  function hackTerminal(x, y, state) {
    state.map[y][x] = 5;
    state.mapVersion = (state.mapVersion || 0) + 1;
    state.terminalsHacked = (state.terminalsHacked || 0) + 1;
    var cfg = FA.lookup('config', 'game');
    var ts = cfg.tileSize;
    var depth = state.depth;

    if (!state.directorMsgShown) state.directorMsgShown = {};
    if (!state.directorMsgShown[depth]) state.directorMsgShown[depth] = 0;
    var dirMsgs = FA.lookup('config', 'director');
    var depthMsgs = dirMsgs ? dirMsgs[depth] : null;
    if (depthMsgs && state.directorMsgShown[depth] < depthMsgs.length) {
      var dirMsg = depthMsgs[state.directorMsgShown[depth]];
      state.directorMsgShown[depth]++;
      if (dirMsg !== '...') {
        Core.addSystemBubble('> "' + dirMsg + '" \u2014 DIRECTOR', '#f80');
      }
      return;
    }

    var mapData = state.maps[state.mapId];
    var effects = ['module', 'module', 'reveal', 'stun', 'intel'];
    var effect = FA.pick(effects);

    switch (effect) {
      case 'module':
        var modTypes = ['emp', 'cloak', 'scanner', 'overclock', 'firewall'];
        var modType = FA.pick(modTypes);
        var modDef = FA.lookup('modules', modType);
        if (state.player.modules.length < 3) {
          state.player.modules.push({ type: modType, name: modDef.name, color: modDef.color });
          FA.addFloat(x * ts + ts / 2, y * ts, modDef.name, modDef.color, 1000);
        } else {
          FA.addFloat(x * ts + ts / 2, y * ts, 'FULL', '#f44', 800);
        }
        break;
      case 'reveal':
        var explored = mapData.explored;
        if (explored) {
          for (var ry = 0; ry < explored.length; ry++)
            for (var rx = 0; rx < explored[ry].length; rx++)
              explored[ry][rx] = true;
        }
        FA.addFloat(x * ts + ts / 2, y * ts, 'MAP', '#0ff', 1000);
        break;
      case 'stun':
        for (var si = 0; si < mapData.entities.length; si++) {
          if (mapData.entities[si].type === 'enemy')
            mapData.entities[si].stunTurns = (mapData.entities[si].stunTurns || 0) + EMP_STUN_TURNS;
        }
        FA.addFloat(x * ts + ts / 2, y * ts, 'DISRUPT', '#ff0', 1000);
        break;
      case 'intel':
        var intelList = FA.lookup('config', 'terminals').intel;
        var intel = FA.pick(intelList);
        Core.addSystemBubble('> ' + intel, '#0ff');
        break;
    }
  }

  // ============================================================
  //  UNIFIED TURN & END GAME
  // ============================================================

  function npcComm(state) {
    var townEntities = state.maps.town.entities;
    var mapEntities = state.maps[state.mapId].entities;
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
    var mapData = state.maps[state.mapId];
    var fx = mapData ? mapData.effects || [] : [];

    // Time of day — only on maps with 'timeOfDay' effect
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

      checkTimeWarnings(state);
    }

    // System turn counter — only on maps without time (dungeon)
    if (!hasTime) {
      state.systemTurn = (state.systemTurn || 0) + 1;
    }

    // FOV — computed on every map
    if (state.player) {
      var lightRadius = hasTime ? 14 : 10 - (state.depth || 1) * 0.5;
      state.visible = Core.computeVisibility(state.map, state.player.x, state.player.y, lightRadius);
    }

    // Enemies act on every map
    enemyTurn();

    // Thoughts — context depends on map effects
    if (hasTime) {
      checkOverworldThoughts(state);
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
  //  EXPORTS
  // ============================================================

  window.Game = {
    start: startGame,
    begin: beginPlaying,
    movePlayer: movePlayer,
    interact: interact,
    useModule: useModule,
    dismissCutscene: dismissCutscene,
    dismissDream: dismissDream,
    dismissBubbles: Core.dismissBubbles,
    selectChoice: selectChoice,
    dismissChoice: dismissChoice,
    _endGame: endGame
  };
})();
