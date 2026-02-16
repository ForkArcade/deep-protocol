// Deep Protocol — Game Logic (Kafka Redesign)
(function() {
  'use strict';
  var FA = window.FA;

  // ============================================================
  //  SYSTEM DUNGEON — MAP GENERATION
  // ============================================================

  function createEmptyMap(cols, rows) {
    var map = [];
    for (var y = 0; y < rows; y++) {
      map[y] = [];
      for (var x = 0; x < cols; x++) map[y][x] = 1;
    }
    return map;
  }

  function carveRoom(map, room) {
    for (var y = room.y; y < room.y + room.h; y++) {
      for (var x = room.x; x < room.x + room.w; x++) map[y][x] = 0;
    }
  }

  function carveCorridor(map, x1, y1, x2, y2) {
    var x = x1, y = y1;
    while (x !== x2) {
      if (y >= 0 && y < map.length && x >= 0 && x < map[0].length) map[y][x] = 0;
      x += x2 > x1 ? 1 : -1;
    }
    while (y !== y2) {
      if (y >= 0 && y < map.length && x >= 0 && x < map[0].length) map[y][x] = 0;
      y += y2 > y1 ? 1 : -1;
    }
    if (y >= 0 && y < map.length && x >= 0 && x < map[0].length) map[y][x] = 0;
  }

  function roomsOverlap(a, b) {
    return a.x - 1 < b.x + b.w && a.x + a.w + 1 > b.x &&
           a.y - 1 < b.y + b.h && a.y + a.h + 1 > b.y;
  }

  function generateFloor(cols, rows, depth) {
    var cfg = FA.lookup('config', 'game');
    var map = createEmptyMap(cols, rows);
    var rooms = [];

    for (var attempt = 0; attempt < cfg.roomAttempts; attempt++) {
      var w = FA.rand(cfg.roomMinSize, cfg.roomMaxSize);
      var h = FA.rand(cfg.roomMinSize, cfg.roomMaxSize);
      var x = FA.rand(1, cols - w - 1);
      var y = FA.rand(1, rows - h - 1);
      var room = { x: x, y: y, w: w, h: h };

      var overlaps = false;
      for (var r = 0; r < rooms.length; r++) {
        if (roomsOverlap(room, rooms[r])) { overlaps = true; break; }
      }
      if (overlaps) continue;

      carveRoom(map, room);
      if (rooms.length > 0) {
        var prev = rooms[rooms.length - 1];
        var cx1 = Math.floor(prev.x + prev.w / 2);
        var cy1 = Math.floor(prev.y + prev.h / 2);
        var cx2 = Math.floor(room.x + room.w / 2);
        var cy2 = Math.floor(room.y + room.h / 2);
        if (FA.rand(0, 1) === 0) {
          carveCorridor(map, cx1, cy1, cx2, cy1);
          carveCorridor(map, cx2, cy1, cx2, cy2);
        } else {
          carveCorridor(map, cx1, cy1, cx1, cy2);
          carveCorridor(map, cx1, cy2, cx2, cy2);
        }
      }
      rooms.push(room);
    }

    if (rooms.length < 2) {
      rooms = [{ x: 2, y: 2, w: 5, h: 5 }, { x: cols - 8, y: rows - 8, w: 5, h: 5 }];
      carveRoom(map, rooms[0]);
      carveRoom(map, rooms[1]);
      carveCorridor(map, 4, 4, cols - 6, rows - 6);
    }

    // Exit in last room (stairsUp = system exit)
    var lastRoom = rooms[rooms.length - 1];
    var ex = Math.floor(lastRoom.x + lastRoom.w / 2);
    var ey = Math.floor(lastRoom.y + lastRoom.h / 2);
    map[ey][ex] = 3;
    var stairsUp = { x: ex, y: ey };

    // Terminals (1-2 per floor)
    var termCount = 1 + Math.floor(depth / 3);
    for (var ti = 0; ti < termCount && rooms.length > 2; ti++) {
      var tRoom = rooms[1 + ti];
      if (!tRoom) break;
      var ttx = tRoom.x + 1;
      var tty = tRoom.y + 1;
      if (map[tty][ttx] === 0) map[tty][ttx] = 4;
    }

    var explored = [];
    for (var ey2 = 0; ey2 < rows; ey2++) {
      explored[ey2] = [];
      for (var ex2 = 0; ex2 < cols; ex2++) explored[ey2][ex2] = false;
    }

    return { map: map, rooms: rooms, stairsUp: stairsUp, explored: explored };
  }

  function findEmptyInRooms(map, rooms, occupied) {
    for (var i = 0; i < 200; i++) {
      var room = FA.pick(rooms);
      var x = FA.rand(room.x, room.x + room.w - 1);
      var y = FA.rand(room.y, room.y + room.h - 1);
      if (map[y][x] !== 0) continue;
      var taken = false;
      for (var j = 0; j < occupied.length; j++) {
        if (occupied[j].x === x && occupied[j].y === y) { taken = true; break; }
      }
      if (!taken) return { x: x, y: y };
    }
    return { x: rooms[0].x + 1, y: rooms[0].y + 1 };
  }

  function isWalkable(map, x, y) {
    if (y < 0 || y >= map.length || x < 0 || x >= map[0].length) return false;
    return map[y][x] !== 1;
  }

  function populateFloor(map, rooms, depth) {
    var occupied = [];
    var enemies = [];
    var enemyCount = 3 + depth * 2;

    for (var i = 0; i < enemyCount; i++) {
      var epos = findEmptyInRooms(map, rooms, occupied);
      occupied.push(epos);

      var type;
      if (depth >= 3 && i === 0) type = 'sentinel';
      else if (depth >= 4 && i === 1) type = 'sentinel';
      else if (depth >= 2 && i === enemyCount - 1) type = 'tracker';
      else if (depth >= 3 && i === enemyCount - 2) type = 'tracker';
      else type = 'drone';

      var def = FA.lookup('enemies', type);
      var hpScale = 1 + (depth - 1) * 0.3;
      var atkScale = 1 + (depth - 1) * 0.2;

      enemies.push({
        id: FA.uid(), x: epos.x, y: epos.y,
        hp: Math.floor(def.hp * hpScale),
        maxHp: Math.floor(def.hp * hpScale),
        atk: Math.floor(def.atk * atkScale),
        def: def.def + Math.floor((depth - 1) / 2),
        char: def.char, color: def.color, name: def.name,
        behavior: def.behavior, stunTurns: 0,
        aiState: 'patrol', alertTarget: null, alertTimer: 0, patrolTarget: null
      });
    }

    var items = [];
    var goldDef = FA.lookup('items', 'gold');
    var potionDef = FA.lookup('items', 'potion');
    var goldCount = 5 + depth * 2;
    var potionCount = 2 + Math.floor(depth / 2);

    for (var g = 0; g < goldCount; g++) {
      var gpos = findEmptyInRooms(map, rooms, occupied);
      occupied.push(gpos);
      items.push({ id: FA.uid(), x: gpos.x, y: gpos.y, type: 'gold', char: goldDef.char, color: goldDef.color, value: goldDef.value + depth * 5 });
    }
    for (var p = 0; p < potionCount; p++) {
      var pp = findEmptyInRooms(map, rooms, occupied);
      occupied.push(pp);
      items.push({ id: FA.uid(), x: pp.x, y: pp.y, type: 'potion', char: potionDef.char, color: potionDef.color, healAmount: potionDef.healAmount });
    }

    var moduleTypes = ['emp', 'cloak', 'scanner', 'overclock', 'firewall'];
    var modCount = 1 + Math.floor(depth / 2);
    for (var m = 0; m < modCount; m++) {
      var modType = FA.pick(moduleTypes);
      var modDef = FA.lookup('modules', modType);
      var mpos = findEmptyInRooms(map, rooms, occupied);
      occupied.push(mpos);
      items.push({
        id: FA.uid(), x: mpos.x, y: mpos.y,
        type: 'module', moduleType: modType,
        char: modDef.char, color: modDef.color, name: modDef.name
      });
    }

    return { enemies: enemies, items: items, occupied: occupied };
  }

  // ============================================================
  //  OVERWORLD
  // ============================================================

  function parseOverworldMap() {
    var owCfg = FA.lookup('config', 'overworld');
    var rows = owCfg.map;
    var map = [];
    for (var y = 0; y < rows.length; y++) {
      map[y] = [];
      for (var x = 0; x < rows[y].length; x++) {
        map[y][x] = parseInt(rows[y].charAt(x));
      }
    }
    return map;
  }

  function isOverworldWalkable(map, x, y) {
    if (y < 0 || y >= map.length || x < 0 || x >= map[0].length) return false;
    var tile = map[y][x];
    return tile !== 1 && tile !== 9;
  }

  // ============================================================
  //  NPC SYSTEM
  // ============================================================

  function initNPCs() {
    var npcIds = ['lena', 'victor', 'marta', 'emil'];
    var roles = FA.shuffle(['ally', 'ally', 'traitor', 'neutral']);
    var npcs = [];
    for (var i = 0; i < npcIds.length; i++) {
      var def = FA.lookup('npcs', npcIds[i]);
      npcs.push({
        id: npcIds[i], name: def.name, char: def.char, color: def.color,
        x: def.homePos.x, y: def.homePos.y,
        allegiance: roles[i],
        homePos: def.homePos, cafePos: def.cafePos,
        schedule: def.schedule, appearsDay: def.appearsDay,
        dialogue: def.dialogue, met: false
      });
    }
    return npcs;
  }

  function getTimePeriod(t) {
    if (t < 33) return 'morning';
    if (t < 66) return 'midday';
    return 'evening';
  }

  function updateNPCPositions(state) {
    var period = getTimePeriod(state.timeOfDay);
    for (var i = 0; i < state.npcs.length; i++) {
      var npc = state.npcs[i];
      if (state.day < npc.appearsDay) { npc.x = -1; npc.y = -1; continue; }
      var loc = npc.schedule[period];
      if (loc === 'home') { npc.x = npc.homePos.x; npc.y = npc.homePos.y; }
      else if (loc === 'cafe') { npc.x = npc.cafePos.x; npc.y = npc.cafePos.y; }
      else { if (npc.x < 0) { npc.x = 10 + i * 5; npc.y = 6; } }
    }
  }

  function getNPCAt(state, x, y) {
    for (var i = 0; i < state.npcs.length; i++) {
      if (state.day < state.npcs[i].appearsDay) continue;
      if (state.npcs[i].x === x && state.npcs[i].y === y) return state.npcs[i];
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
  //  GAME START
  // ============================================================

  function startGame() {
    FA.resetState({ screen: 'start' });
    FA.clearEffects();
  }

  function beginPlaying() {
    var owCfg = FA.lookup('config', 'overworld');
    var econCfg = FA.lookup('config', 'economy');
    var owMap = parseOverworldMap();
    var npcs = initNPCs();

    FA.resetState({
      screen: 'overworld',
      owMap: owMap,
      owPlayer: { x: owCfg.playerStart.x, y: owCfg.playerStart.y },
      npcs: npcs,
      day: 1, timeOfDay: 0,
      credits: econCfg.startCredits,
      rent: econCfg.baseRent,
      workedToday: false,
      systemRevealed: false,
      systemVisits: 0, totalKills: 0, totalGold: 0,
      // System state (null until entered)
      map: null, player: null, enemies: null, items: null, rooms: null,
      explored: null, depth: 0, systemNPCs: null,
      // Shared
      mapVersion: 1, turn: 0,
      systemBubble: null,
      thoughts: [], lastThoughtTurn: -10,
      shake: 0, shakeX: 0, shakeY: 0,
      particles: [], soundWaves: [],
      _pendingEnd: null, _timeWarned: false, _curfewWarned: false,
      terminalsHacked: 0, directorMsgShown: {}
    });

    FA.clearEffects();
    var narCfg = FA.lookup('config', 'narrative');
    if (narCfg) FA.narrative.init(narCfg);
    updateNPCPositions(FA.getState());
    showNarrative('wake');
    triggerThought('morning');
  }

  // ============================================================
  //  MOVEMENT DISPATCHER
  // ============================================================

  function movePlayer(dx, dy) {
    var state = FA.getState();
    if (state.screen === 'overworld') overworldMove(dx, dy);
    else if (state.screen === 'playing') systemMove(dx, dy);
  }

  // ============================================================
  //  OVERWORLD MOVEMENT & INTERACTION
  // ============================================================

  function overworldMove(dx, dy) {
    var state = FA.getState();
    var nx = state.owPlayer.x + dx;
    var ny = state.owPlayer.y + dy;
    if (getNPCAt(state, nx, ny)) return;
    if (!isOverworldWalkable(state.owMap, nx, ny)) return;
    state.owPlayer.x = nx;
    state.owPlayer.y = ny;
    FA.playSound('step');
    state.timeOfDay++;
    state.turn++;
    if (state.timeOfDay % 10 === 0) updateNPCPositions(state);
    checkTimeWarnings(state);
    checkOverworldThoughts(state);
  }

  function interact() {
    var state = FA.getState();
    if (state.screen !== 'overworld') return;

    // Dismiss bubbles first
    if ((state.thoughts && state.thoughts.length > 0) || state.systemBubble) {
      dismissBubbles();
      return;
    }

    // Adjacent NPC
    var npc = getAdjacentNPC(state, state.owPlayer.x, state.owPlayer.y);
    if (npc) {
      npc.met = true;
      var text = npc.dialogue[state.day] || npc.dialogue._default;
      addSystemBubble(npc.name + ': "' + text + '"', npc.color);
      var econCfg = FA.lookup('config', 'economy');
      if (state.day >= econCfg.systemRevealDay && !state.systemRevealed) {
        if (npc.id === 'victor' || npc.id === 'lena') {
          state.systemRevealed = true;
          state.mapVersion = (state.mapVersion || 0) + 1;
        }
      }
      state.timeOfDay += 2;
      state.turn += 2;
      checkTimeWarnings(state);
      return;
    }

    // Tile under player
    var tile = state.owMap[state.owPlayer.y][state.owPlayer.x];
    if (tile === 6) goToBed(state);
    else if (tile === 7) workAtTerminal(state);
    else if (tile === 8) {
      if (state.systemRevealed) enterSystem(state);
      else addThought('A sealed maintenance shaft. Nothing to see.');
    }
  }

  function workAtTerminal(state) {
    if (state.workedToday) {
      addSystemBubble('> Shift already completed. Return tomorrow.', '#556');
      return;
    }
    var timeCfg = FA.lookup('config', 'time');
    var econCfg = FA.lookup('config', 'economy');
    state.workedToday = true;
    state.timeOfDay += timeCfg.workTurns;
    state.turn += timeCfg.workTurns;
    state.credits += econCfg.workPay;
    addSystemBubble('> Shift complete. +' + econCfg.workPay + ' credits.', '#fd0');
    triggerThought('work');
    checkTimeWarnings(state);
  }

  function goToBed(state) {
    var econCfg = FA.lookup('config', 'economy');
    var rent = econCfg.baseRent + (state.day - 1) * econCfg.rentIncrease;
    state.credits -= rent;
    if (state.credits < 0) {
      triggerEnding(false, 'eviction');
      return;
    }
    state.day++;
    state.timeOfDay = 0;
    state.workedToday = false;
    state._timeWarned = false;
    state._curfewWarned = false;
    state.rent = econCfg.baseRent + (state.day - 1) * econCfg.rentIncrease;
    state.mapVersion = (state.mapVersion || 0) + 1;
    addSystemBubble('> Day ' + state.day + '. Rent: -' + rent + 'cr. Balance: ' + state.credits + 'cr.', '#f44');
    updateNPCPositions(state);
    // Auto-reveal system if NPC already met
    if (state.day >= econCfg.systemRevealDay && !state.systemRevealed) {
      for (var i = 0; i < state.npcs.length; i++) {
        if (state.npcs[i].met && (state.npcs[i].id === 'victor' || state.npcs[i].id === 'lena')) {
          state.systemRevealed = true;
          state.mapVersion = (state.mapVersion || 0) + 1;
          break;
        }
      }
    }
    triggerThought('morning');
  }

  function checkTimeWarnings(state) {
    var timeCfg = FA.lookup('config', 'time');
    if (state.screen !== 'overworld') return;
    if (state.timeOfDay >= timeCfg.droneTime) {
      triggerEnding(false, 'curfew');
      return;
    }
    if (state.timeOfDay >= timeCfg.curfewTime && !state._curfewWarned) {
      state._curfewWarned = true;
      addSystemBubble('> CURFEW APPROACHING. Return to quarters.', '#f44');
    } else if (state.timeOfDay >= timeCfg.warningTime && !state._timeWarned) {
      state._timeWarned = true;
      triggerThought('evening');
    }
  }

  function checkOverworldThoughts(state) {
    if (state.turn - (state.lastThoughtTurn || 0) < 15) return;
    var period = getTimePeriod(state.timeOfDay);
    if (period === 'morning' && state.timeOfDay < 10) triggerThought('morning');
    else if (period === 'evening') triggerThought('evening');
    if (Math.abs(state.owPlayer.x - 18) < 5 && Math.abs(state.owPlayer.y - 10) < 4) {
      triggerThought('cafe');
    }
  }

  // ============================================================
  //  SYSTEM ENTRY / EXIT
  // ============================================================

  function enterSystem(state) {
    var cfg = FA.lookup('config', 'game');
    var depth = Math.min(state.systemVisits + 1, cfg.maxDepth);

    if (state.systemVisits === 0) {
      showNarrative('first_system');
    } else {
      addSystemBubble('> Entering sub-level ' + depth + '.', '#4ef');
    }

    state.systemVisits++;
    var floor = generateFloor(cfg.cols, cfg.rows, depth);
    var populated = populateFloor(floor.map, floor.rooms, depth);

    // Player spawn
    var firstRoom = floor.rooms[0];
    var px = Math.floor(firstRoom.x + firstRoom.w / 2);
    var py = Math.floor(firstRoom.y + firstRoom.h / 2);
    if (floor.map[py][px] !== 0) { px = firstRoom.x + 1; py = firstRoom.y + 1; }

    // Place met NPCs in system
    var sysNPCs = [];
    for (var i = 0; i < state.npcs.length; i++) {
      var npc = state.npcs[i];
      if (!npc.met || state.day < npc.appearsDay) continue;
      if (depth < 2 && npc.id !== 'lena') continue;
      if (depth < 3 && npc.id === 'emil') continue;
      var npos = findEmptyInRooms(floor.map, floor.rooms, populated.occupied);
      populated.occupied.push(npos);
      sysNPCs.push({
        id: npc.id, name: npc.name, char: npc.char, color: npc.color,
        x: npos.x, y: npos.y, allegiance: npc.allegiance,
        dialogue: npc.dialogue, talked: false
      });
    }

    state.screen = 'playing';
    state.map = floor.map;
    state.explored = floor.explored;
    state.rooms = floor.rooms;
    state.player = {
      x: px, y: py, hp: 20, maxHp: 20, atk: 5, def: 1,
      gold: 0, kills: 0,
      modules: [], cloakTurns: 0, overclockActive: false, firewallHp: 0
    };
    state.enemies = populated.enemies;
    state.items = populated.items;
    state.depth = depth;
    state.systemNPCs = sysNPCs;
    state.systemTurn = 0;
    state.terminalsHacked = 0;
    state.directorMsgShown = {};
    state.mapVersion = (state.mapVersion || 0) + 1;

    FA.clearEffects();
    var narCfg = FA.lookup('config', 'narrative');
    if (narCfg) FA.narrative.init(narCfg);
    triggerThought('system_enter');
  }

  function exitSystem(reason) {
    var state = FA.getState();
    var timeCfg = FA.lookup('config', 'time');
    var econCfg = FA.lookup('config', 'economy');

    // Collect loot
    if (state.player) {
      state.credits += state.player.gold;
      state.totalKills = (state.totalKills || 0) + state.player.kills;
      state.totalGold = (state.totalGold || 0) + state.player.gold;
    }

    if (reason === 'ejected') {
      state.credits = Math.max(0, state.credits - econCfg.ejectionPenalty);
    }

    state.timeOfDay += timeCfg.systemTimeCost;

    // Return to overworld
    state.screen = 'overworld';
    state.map = null; state.player = null;
    state.enemies = null; state.items = null;
    state.rooms = null; state.explored = null;
    state.systemNPCs = null;
    state.mapVersion = (state.mapVersion || 0) + 1;

    FA.clearEffects();

    if (reason === 'ejected') {
      showNarrative('ejected');
    }

    checkTimeWarnings(state);
  }

  // ============================================================
  //  SYSTEM MOVEMENT
  // ============================================================

  function systemMove(dx, dy) {
    var state = FA.getState();
    if (!state.player) return;
    var nx = state.player.x + dx;
    var ny = state.player.y + dy;

    // Attack enemy
    for (var i = 0; i < state.enemies.length; i++) {
      if (state.enemies[i].x === nx && state.enemies[i].y === ny) {
        attackEnemy(state.player, state.enemies[i], i);
        endTurn();
        return;
      }
    }

    // Bump into system NPC
    if (state.systemNPCs) {
      for (var ni = 0; ni < state.systemNPCs.length; ni++) {
        var sNpc = state.systemNPCs[ni];
        if (sNpc.x === nx && sNpc.y === ny) {
          if (!sNpc.talked) {
            sNpc.talked = true;
            var allegKey = '_system_' + sNpc.allegiance;
            var text = sNpc.dialogue[allegKey] || '...';
            addSystemBubble(sNpc.name + ': "' + text + '"', sNpc.color);
            triggerThought('system_npc');
          }
          endTurn();
          return;
        }
      }
    }

    if (!isWalkable(state.map, nx, ny)) return;
    state.player.x = nx;
    state.player.y = ny;
    FA.playSound('step');

    var tile = state.map[ny][nx];
    if (tile === 3) { exitSystem('cleared'); return; }
    if (tile === 4) hackTerminal(nx, ny, state);

    for (var j = state.items.length - 1; j >= 0; j--) {
      if (state.items[j].x === nx && state.items[j].y === ny) {
        pickupItem(state.items[j], j);
      }
    }
    endTurn();
  }

  // ============================================================
  //  COMBAT
  // ============================================================

  function attackEnemy(attacker, target, idx) {
    var state = FA.getState();
    var multiplier = 1;
    if (state.player.overclockActive) {
      multiplier = 3;
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
    propagateSound(state, target.x, target.y, 8);

    if (target.hp <= 0) {
      state.enemies.splice(idx, 1);
      state.player.kills++;
      FA.emit('entity:killed', { entity: target });

      var bx = target.x * ts + ts / 2, by = target.y * ts + ts / 2;
      for (var pi = 0; pi < 8; pi++) {
        var angle = (pi / 8) * Math.PI * 2 + Math.random() * 0.5;
        state.particles.push({
          x: bx, y: by,
          vx: Math.cos(angle) * (40 + Math.random() * 30),
          vy: Math.sin(angle) * (40 + Math.random() * 30),
          life: 500, maxLife: 500, color: target.color
        });
      }

      triggerThought('combat');

      // Revelation ending: final floor cleared
      if (state.depth >= cfg.maxDepth && state.enemies.length === 0) {
        triggerEnding(true, 'revelation');
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
    state.shake = 6;
    FA.emit('entity:damaged', { entity: state.player, damage: dmg });

    var cfg = FA.lookup('config', 'game');
    var ts = cfg.tileSize;
    FA.addFloat(state.player.x * ts + ts / 2, state.player.y * ts, '-' + dmg, '#f84', 800);

    if (state.player.hp <= 0) {
      exitSystem('ejected');
    } else if (state.player.hp <= state.player.maxHp * 0.3) {
      triggerThought('low_health');
    } else {
      triggerThought('damage');
    }
  }

  function sentinelShoot(e, state) {
    if (!state.player || state.player.cloakTurns > 0) return;
    var dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (var d = 0; d < dirs.length; d++) {
      var sx = e.x, sy = e.y;
      for (var r = 1; r <= 6; r++) {
        sx += dirs[d][0]; sy += dirs[d][1];
        if (sy < 0 || sy >= state.map.length || sx < 0 || sx >= state.map[0].length) break;
        if (state.map[sy][sx] === 1) break;
        if (sx === state.player.x && sy === state.player.y) {
          var dmg = Math.max(1, e.atk - state.player.def + FA.rand(-1, 1));
          var cfg = FA.lookup('config', 'game');
          var ts = cfg.tileSize;
          FA.addFloat(e.x * ts + ts / 2, e.y * ts, '!', '#f80', 600);
          applyDamageToPlayer(dmg, e.name, state);
          propagateSound(state, e.x, e.y, 10);
          return;
        }
      }
    }
  }

  function pickupItem(item, idx) {
    var state = FA.getState();
    if (item.type === 'module' && state.player.modules.length >= 3) {
      var cfg2 = FA.lookup('config', 'game');
      var ts2 = cfg2.tileSize;
      FA.addFloat(item.x * ts2 + ts2 / 2, item.y * ts2, 'FULL', '#f44', 600);
      return;
    }
    state.items.splice(idx, 1);
    FA.emit('item:pickup', { item: item });
    var cfg = FA.lookup('config', 'game');
    var ts = cfg.tileSize;
    if (item.type === 'gold') {
      state.player.gold += item.value;
      FA.addFloat(state.player.x * ts + ts / 2, state.player.y * ts, '+' + item.value, '#0ff', 600);
      triggerThought('pickup_data');
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

  function hasLOS(map, x1, y1, x2, y2) {
    var dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
    var sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
    var err = dx - dy;
    var cx = x1, cy = y1;
    while (true) {
      if (cx === x2 && cy === y2) return true;
      var e2 = err * 2;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
      if (cx === x2 && cy === y2) return true;
      if (cy < 0 || cy >= map.length || cx < 0 || cx >= map[0].length) return false;
      if (map[cy][cx] === 1) return false;
    }
  }

  function canStep(x, y, state, skipIdx) {
    if (!isWalkable(state.map, x, y)) return false;
    if (isOccupied(x, y, skipIdx)) return false;
    if (state.player && x === state.player.x && y === state.player.y) return false;
    return true;
  }

  function moveToward(e, tx, ty, state, skipIdx) {
    var dx = tx - e.x, dy = ty - e.y;
    var sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    var sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    var moves;
    if (Math.abs(dx) >= Math.abs(dy)) {
      moves = [{dx: sx, dy: 0}, {dx: 0, dy: sy || 1}, {dx: 0, dy: -(sy || 1)}];
    } else {
      moves = [{dx: 0, dy: sy}, {dx: sx || 1, dy: 0}, {dx: -(sx || 1), dy: 0}];
    }
    for (var i = 0; i < moves.length; i++) {
      if (moves[i].dx === 0 && moves[i].dy === 0) continue;
      var nx = e.x + moves[i].dx, ny = e.y + moves[i].dy;
      if (canStep(nx, ny, state, skipIdx)) {
        e.x = nx; e.y = ny;
        return true;
      }
    }
    return false;
  }

  function flankTarget(e, tx, ty, state, skipIdx) {
    var dx = tx - e.x, dy = ty - e.y;
    var moves;
    if (Math.abs(dx) >= Math.abs(dy)) {
      moves = [{dx: 0, dy: 1}, {dx: 0, dy: -1}];
    } else {
      moves = [{dx: 1, dy: 0}, {dx: -1, dy: 0}];
    }
    if (Math.random() > 0.5) { var t = moves[0]; moves[0] = moves[1]; moves[1] = t; }
    for (var i = 0; i < moves.length; i++) {
      var nx = e.x + moves[i].dx, ny = e.y + moves[i].dy;
      if (canStep(nx, ny, state, skipIdx)) {
        e.x = nx; e.y = ny;
        return true;
      }
    }
    return moveToward(e, tx, ty, state, skipIdx);
  }

  function randomStep(e, state, skipIdx) {
    var dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (var i = dirs.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = dirs[i]; dirs[i] = dirs[j]; dirs[j] = t;
    }
    for (var d = 0; d < dirs.length; d++) {
      var nx = e.x + dirs[d][0], ny = e.y + dirs[d][1];
      if (canStep(nx, ny, state, skipIdx)) {
        e.x = nx; e.y = ny;
        return;
      }
    }
  }

  function propagateSound(state, x, y, radius) {
    if (!state.enemies) return;
    for (var i = 0; i < state.enemies.length; i++) {
      var e = state.enemies[i];
      if (e.aiState === 'hunting') continue;
      var dist = Math.abs(e.x - x) + Math.abs(e.y - y);
      if (dist <= radius) {
        e.aiState = 'alert';
        e.alertTarget = { x: x, y: y };
        e.alertTimer = 8;
      }
    }
    if (state.soundWaves) state.soundWaves.push({ tx: x, ty: y, maxR: radius, life: 500 });
  }

  function computeEnemyAction(e, state) {
    var p = state.player;
    if (!p) return { type: 'idle' };
    var dist = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
    var cloaked = p.cloakTurns > 0;
    var sightRange = e.behavior === 'tracker' ? 20 : e.behavior === 'sentinel' ? 6 : 8;
    var canSee = !cloaked && dist <= sightRange && hasLOS(state.map, e.x, e.y, p.x, p.y);

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
          var rooms = state.rooms;
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
    if (state.screen !== 'playing' || !state.player || !state.enemies) return;
    if (state.player.cloakTurns > 0) state.player.cloakTurns--;

    for (var i = 0; i < state.enemies.length; i++) {
      if (state.screen !== 'playing' || !state.player) return;
      var e = state.enemies[i];
      if (e.stunTurns > 0) { e.stunTurns--; continue; }

      var action = computeEnemyAction(e, state);

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
          moveToward(e, state.player.x, state.player.y, state, i);
          break;
        case 'flank':
          flankTarget(e, state.player.x, state.player.y, state, i);
          break;
        case 'investigate':
          moveToward(e, e.alertTarget.x, e.alertTarget.y, state, i);
          break;
        case 'patrol':
          if (e.patrolTarget) moveToward(e, e.patrolTarget.x, e.patrolTarget.y, state, i);
          break;
        case 'random':
          randomStep(e, state, i);
          break;
      }
    }
  }

  function isOccupied(x, y, skipIdx) {
    var enemies = FA.getState().enemies;
    if (!enemies) return false;
    for (var i = 0; i < enemies.length; i++) {
      if (i === skipIdx) continue;
      if (enemies[i].x === x && enemies[i].y === y) return true;
    }
    return false;
  }

  // ============================================================
  //  MODULES
  // ============================================================

  function useModule(slotIdx) {
    var state = FA.getState();
    if (state.screen !== 'playing' || !state.player) return;
    if (slotIdx >= state.player.modules.length) return;

    var mod = state.player.modules[slotIdx];
    state.player.modules.splice(slotIdx, 1);
    var cfg = FA.lookup('config', 'game');
    var ts = cfg.tileSize;
    var px = state.player.x * ts + ts / 2, py = state.player.y * ts;

    switch (mod.type) {
      case 'emp':
        for (var i = 0; i < state.enemies.length; i++) {
          var e = state.enemies[i];
          var dist = Math.abs(e.x - state.player.x) + Math.abs(e.y - state.player.y);
          if (dist <= 5) {
            e.stunTurns = (e.stunTurns || 0) + 3;
            FA.addFloat(e.x * ts + ts / 2, e.y * ts, 'STUN', '#ff0', 800);
          }
        }
        FA.addFloat(px, py, 'EMP', '#ff0', 800);
        propagateSound(state, state.player.x, state.player.y, 12);
        break;
      case 'cloak':
        state.player.cloakTurns = 6;
        FA.addFloat(px, py, 'CLOAK', '#88f', 800);
        break;
      case 'scanner':
        for (var sy = 0; sy < state.explored.length; sy++)
          for (var sx = 0; sx < state.explored[sy].length; sx++)
            state.explored[sy][sx] = true;
        FA.addFloat(px, py, 'SCAN', '#0ff', 800);
        break;
      case 'overclock':
        state.player.overclockActive = true;
        FA.addFloat(px, py, 'OC!', '#f44', 800);
        break;
      case 'firewall':
        state.player.firewallHp = 12;
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

    // Director message
    if (!state.directorMsgShown) state.directorMsgShown = {};
    if (!state.directorMsgShown[depth]) state.directorMsgShown[depth] = 0;
    var dirMsgs = FA.lookup('config', 'director');
    var depthMsgs = dirMsgs ? dirMsgs[depth] : null;
    if (depthMsgs && state.directorMsgShown[depth] < depthMsgs.length) {
      var dirMsg = depthMsgs[state.directorMsgShown[depth]];
      state.directorMsgShown[depth]++;
      if (dirMsg !== '...') {
        addSystemBubble('> "' + dirMsg + '" \u2014 DIRECTOR', '#f80');
      }
      return;
    }

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
        for (var ry = 0; ry < state.explored.length; ry++)
          for (var rx = 0; rx < state.explored[ry].length; rx++)
            state.explored[ry][rx] = true;
        FA.addFloat(x * ts + ts / 2, y * ts, 'MAP', '#0ff', 1000);
        break;
      case 'stun':
        for (var si = 0; si < state.enemies.length; si++)
          state.enemies[si].stunTurns = (state.enemies[si].stunTurns || 0) + 3;
        FA.addFloat(x * ts + ts / 2, y * ts, 'DISRUPT', '#ff0', 1000);
        break;
      case 'intel':
        var intelList = FA.lookup('config', 'terminals').intel;
        var intel = FA.pick(intelList);
        addSystemBubble('> ' + intel, '#0ff');
        break;
    }
  }

  // ============================================================
  //  NARRATIVE & COMMUNICATION
  // ============================================================

  function showNarrative(nodeId) {
    FA.narrative.transition(nodeId);
    var narText = FA.lookup('narrativeText', nodeId);
    if (narText) addSystemBubble(narText.text, narText.color);
    var cutscene = FA.lookup('cutscenes', nodeId);
    var state = FA.getState();
    if (cutscene && state.screen !== 'cutscene') {
      startCutscene(cutscene, state);
    }
  }

  function startCutscene(def, state) {
    state.cutsceneReturn = state.screen;
    state.screen = 'cutscene';
    state.cutscene = {
      lines: def.lines.slice(),
      color: def.color || '#4ef',
      lineDelay: def.lineDelay || 200,
      timer: 0, done: false
    };
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
    state.screen = state.cutsceneReturn || 'overworld';
    state.cutscene = null;
    // Pending game end after cutscene
    if (state._pendingEnd) {
      var pe = state._pendingEnd;
      state._pendingEnd = null;
      endGame(pe.victory, pe.endingNode);
    }
  }

  function triggerEnding(victory, endingNode) {
    var state = FA.getState();
    showNarrative(endingNode);
    if (state.screen === 'cutscene') {
      state._pendingEnd = { victory: victory, endingNode: endingNode };
    } else {
      endGame(victory, endingNode);
    }
  }

  function addSystemBubble(text, color) {
    var state = FA.getState();
    var maxChars = 90;
    var words = text.split(' ');
    var lines = []; var line = '';
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (test.length > maxChars && line.length > 0) { lines.push(line); line = words[i]; }
      else line = test;
    }
    if (line) lines.push(line);
    state.systemBubble = { lines: lines, color: color || '#4ef', timer: 0, done: false, life: 8000 };
  }

  function addThought(text) {
    var state = FA.getState();
    if (!state.thoughts) state.thoughts = [];
    state.thoughts.push({ text: text, timer: 0, speed: 30, done: false, life: 8000 });
    if (state.thoughts.length > 4) state.thoughts.shift();
    state.lastThoughtTurn = state.turn;
  }

  function triggerThought(category, key) {
    var state = FA.getState();
    if (state.turn - (state.lastThoughtTurn || 0) < 5) return;
    var thoughts = FA.lookup('config', 'thoughts');
    if (!thoughts || !thoughts[category]) return;
    var pool = key !== undefined ? thoughts[category][key] : thoughts[category];
    if (!pool || !pool.length) return;
    addThought(pool[Math.floor(Math.random() * pool.length)]);
  }

  function dismissBubbles() {
    var state = FA.getState();
    state.thoughts = [];
    state.systemBubble = null;
  }

  // ============================================================
  //  TURN & END GAME
  // ============================================================

  function endTurn() {
    var state = FA.getState();
    if (state.screen !== 'playing') return;
    state.turn++;
    state.systemTurn = (state.systemTurn || 0) + 1;
    enemyTurn();
    if (state.screen === 'playing' && state.systemTurn > 0 && state.systemTurn % 20 === 0) {
      triggerThought('ambient');
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
    dismissBubbles: dismissBubbles
  };
})();
