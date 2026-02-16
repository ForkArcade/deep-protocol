// Deep Protocol — Game Logic
(function() {
  'use strict';
  var FA = window.FA;

  // === MAP GENERATION (room-based) ===

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

  function generateFloor(cols, rows, depth, maxDepth) {
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

    var stairsDown = null;
    if (depth < maxDepth) {
      var lastRoom = rooms[rooms.length - 1];
      var sdx = Math.floor(lastRoom.x + lastRoom.w / 2);
      var sdy = Math.floor(lastRoom.y + lastRoom.h / 2);
      map[sdy][sdx] = 2;
      stairsDown = { x: sdx, y: sdy };
    }

    var stairsUp = null;
    if (depth > 1) {
      var firstRoom = rooms[0];
      var sux = Math.floor(firstRoom.x + firstRoom.w / 2);
      var suy = Math.floor(firstRoom.y + firstRoom.h / 2);
      map[suy][sux] = 3;
      stairsUp = { x: sux, y: suy };
    }

    // Place terminals (1-2 per floor, in middle rooms)
    var termCount = 1 + Math.floor(depth / 3);
    for (var ti = 0; ti < termCount && rooms.length > 2; ti++) {
      var tRoom = rooms[1 + ti];
      if (!tRoom) break;
      var ttx = tRoom.x + 1;
      var tty = tRoom.y + 1;
      if (map[tty][ttx] === 0) map[tty][ttx] = 4;
    }

    var explored = [];
    for (var ey = 0; ey < rows; ey++) {
      explored[ey] = [];
      for (var ex = 0; ex < cols; ex++) explored[ey][ex] = false;
    }

    return { map: map, rooms: rooms, stairsDown: stairsDown, stairsUp: stairsUp, explored: explored };
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

  // === POPULATE FLOOR ===

  function populateFloor(map, rooms, depth) {
    var occupied = [];
    var enemies = [];
    var enemyCount = 3 + depth * 2;

    for (var i = 0; i < enemyCount; i++) {
      var epos = findEmptyInRooms(map, rooms, occupied);
      occupied.push(epos);

      // Enemy type based on depth and slot
      var type;
      if (depth >= 3 && i === 0) {
        type = 'sentinel';
      } else if (depth >= 4 && i === 1) {
        type = 'sentinel';
      } else if (depth >= 2 && i === enemyCount - 1) {
        type = 'tracker';
      } else if (depth >= 3 && i === enemyCount - 2) {
        type = 'tracker';
      } else {
        type = 'drone';
      }

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

    // Modules (1-2 per floor)
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

    return { enemies: enemies, items: items };
  }

  // === SCREENS ===

  function startGame() {
    var deathCount = 0;
    var prevDeath = null;
    try {
      deathCount = parseInt(localStorage.getItem('dp_deaths') || '0');
      prevDeath = JSON.parse(localStorage.getItem('dp_lastDeath'));
    } catch(e) {}
    FA.resetState({ screen: 'start', dpNumber: 7 + deathCount, prevDeath: prevDeath });
    FA.clearEffects();
  }

  function beginPlaying() {
    var cfg = FA.lookup('config', 'game');
    var floor = generateFloor(cfg.cols, cfg.rows, 1, cfg.maxDepth);
    var populated = populateFloor(floor.map, floor.rooms, 1);

    var firstRoom = floor.rooms[0];
    var px = Math.floor(firstRoom.x + firstRoom.w / 2);
    var py = Math.floor(firstRoom.y + firstRoom.h / 2);
    if (floor.map[py][px] !== 0) { px = firstRoom.x + 1; py = firstRoom.y + 1; }

    var floors = {};
    floors[1] = {
      map: floor.map, rooms: floor.rooms,
      enemies: populated.enemies, items: populated.items,
      stairsDown: floor.stairsDown, stairsUp: floor.stairsUp,
      explored: floor.explored
    };

    var prevState = FA.getState();
    var dpNumber = prevState.dpNumber || 7;

    FA.resetState({
      screen: 'playing',
      map: floor.map,
      explored: floor.explored,
      player: {
        x: px, y: py, hp: 20, maxHp: 20, atk: 5, def: 1, gold: 0, kills: 0,
        modules: [], cloakTurns: 0, overclockActive: false, firewallHp: 0
      },
      enemies: populated.enemies,
      items: populated.items,
      depth: 1,
      maxDepthReached: 1,
      floors: floors,
      path: 'none',
      endingNode: null,
      terminalsHacked: 0,
      dp6TracesFound: 0,
      directorMsgShown: {},
      dpNumber: dpNumber,
      messages: [],
      narrativeMessage: null,
      turn: 0,
      shake: 0, particles: [], soundWaves: [],
      thoughts: [], lastThoughtTurn: -10
    });

    FA.clearEffects();
    var narCfg = FA.lookup('config', 'narrative');
    if (narCfg) FA.narrative.init(narCfg);
    showNarrative('boot');

    // Customize boot cutscene with current DP number
    var state = FA.getState();
    if (state.cutscene && dpNumber > 7) {
      state.cutscene.lines[5] = '>  Designation.............DP-' + dpNumber;
      state.cutscene.lines[7] = '> ' + (dpNumber - 1) + ' predecessors.';
      state.cutscene.lines[11] = '> You are number ' + dpNumber + '.';
    }
  }

  // === PATH DETECTION ===

  function checkPath(state) {
    if (state.path !== 'none') return;
    var p = state.player;

    if (state.depth >= 3 && p.kills <= 2) {
      state.path = 'ghost';
      showNarrative('path_ghost');
      FA.narrative.setVar('path', 'ghost', 'Ghost protocol engaged');
      return;
    }
    if (p.kills >= 5) {
      state.path = 'hunter';
      showNarrative('path_hunter');
      FA.narrative.setVar('path', 'hunter', 'Hunter protocol engaged');
      return;
    }
    if (p.gold >= 60) {
      state.path = 'archivist';
      showNarrative('path_archivist');
      FA.narrative.setVar('path', 'archivist', 'Archivist protocol engaged');
      return;
    }
  }

  function checkClimax(state) {
    if (state.climaxShown) return;
    var p = state.player;

    if (state.path === 'hunter' && p.kills >= 15) {
      state.climaxShown = true;
      showNarrative('hunter_climax');
    } else if (state.path === 'ghost' && state.depth >= 4 && p.kills <= 4) {
      state.climaxShown = true;
      showNarrative('ghost_climax');
    } else if (state.path === 'archivist' && p.gold >= 120) {
      state.climaxShown = true;
      showNarrative('archivist_climax');
    }
  }

  function chooseEnding(state) {
    if (state.path === 'ghost') return 'end_integration';
    if (state.path === 'archivist') return 'end_transcendence';
    return 'end_extraction';
  }

  // === FLOOR TRANSITION ===

  function changeFloor(direction) {
    var state = FA.getState();
    var cfg = FA.lookup('config', 'game');
    var oldDepth = state.depth;
    var newDepth = direction === 'down' ? oldDepth + 1 : oldDepth - 1;

    state.floors[oldDepth].enemies = state.enemies;
    state.floors[oldDepth].items = state.items;
    state.floors[oldDepth].explored = state.explored;

    if (!state.floors[newDepth]) {
      var floor = generateFloor(cfg.cols, cfg.rows, newDepth, cfg.maxDepth);
      var populated = populateFloor(floor.map, floor.rooms, newDepth);
      state.floors[newDepth] = {
        map: floor.map, rooms: floor.rooms,
        enemies: populated.enemies, items: populated.items,
        stairsDown: floor.stairsDown, stairsUp: floor.stairsUp,
        explored: floor.explored
      };
    }

    var target = state.floors[newDepth];
    state.map = target.map;
    state.enemies = target.enemies;
    state.items = target.items;
    state.explored = target.explored;
    state.depth = newDepth;
    if (newDepth > state.maxDepthReached) state.maxDepthReached = newDepth;

    if (direction === 'down' && target.stairsUp) {
      state.player.x = target.stairsUp.x;
      state.player.y = target.stairsUp.y;
    } else if (direction === 'up' && target.stairsDown) {
      state.player.x = target.stairsDown.x;
      state.player.y = target.stairsDown.y;
    }

    FA.clearEffects();
    addMessage(direction === 'down' ? '> Accessing sub-level ' + newDepth + '...' : '> Returning to level ' + newDepth + '...');
    FA.narrative.setVar('depth_reached', state.maxDepthReached, 'Reached level ' + state.maxDepthReached);

    triggerThought('floor_enter', newDepth);
    if (direction === 'down' && newDepth === 2) showNarrative('descent');
    if (direction === 'down' && newDepth === 3) showNarrative('deep_descent');
    if (direction === 'down' && newDepth === 4) showNarrative('core_sector');
    if (direction === 'down' && newDepth === 5) showNarrative('director');

    checkPath(state);
    checkClimax(state);
  }

  // === NARRATIVE ===

  function showNarrative(nodeId) {
    FA.narrative.transition(nodeId);
    var narText = FA.lookup('narrativeText', nodeId);
    if (narText) {
      FA.getState().narrativeMessage = { text: narText.text, color: narText.color, life: 4000, maxLife: 4000 };
      addMessage(narText.text);
    }

    // Full-screen cutscene if defined
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
      lines: def.lines,
      color: def.color || '#4ef',
      lineDelay: def.lineDelay || 200,
      timer: 0,
      done: false
    };
  }

  function dismissCutscene() {
    var state = FA.getState();
    if (!state.cutscene) return;
    if (!state.cutscene.done) {
      // Fast-forward: jump to end of all scramble animations
      var cs = state.cutscene;
      var ld = cs.lineDelay || 200;
      var lastIdx = cs.lines.length - 1;
      cs.timer = lastIdx * ld + TextFX.totalTime(cs.lines[lastIdx]) + 1;
      cs.done = true;
      return;
    }
    state.screen = state.cutsceneReturn || 'playing';
    state.cutscene = null;
  }

  // === MODULES ===

  function useModule(slotIdx) {
    var state = FA.getState();
    if (state.screen !== 'playing') return;
    if (slotIdx >= state.player.modules.length) return;

    var mod = state.player.modules[slotIdx];
    state.player.modules.splice(slotIdx, 1);

    var cfg = FA.lookup('config', 'game');
    var ts = cfg.tileSize;

    switch (mod.type) {
      case 'emp':
        var stunned = 0;
        for (var i = 0; i < state.enemies.length; i++) {
          var e = state.enemies[i];
          var dist = Math.abs(e.x - state.player.x) + Math.abs(e.y - state.player.y);
          if (dist <= 5) {
            e.stunTurns = (e.stunTurns || 0) + 3;
            stunned++;
            FA.addFloat(e.x * ts + ts / 2, e.y * ts, 'STUN', '#ff0', 800);
          }
        }
        addMessage('> EMP PULSE — ' + stunned + ' drones disabled.');
        propagateSound(state, state.player.x, state.player.y, 12);
        break;

      case 'cloak':
        state.player.cloakTurns = 6;
        addMessage('> CLOAK ACTIVE — 6 turns of invisibility.');
        break;

      case 'scanner':
        for (var sy = 0; sy < state.explored.length; sy++) {
          for (var sx = 0; sx < state.explored[sy].length; sx++) {
            state.explored[sy][sx] = true;
          }
        }
        addMessage('> DEEP SCAN — Floor schematic downloaded.');
        break;

      case 'overclock':
        state.player.overclockActive = true;
        addMessage('> OVERCLOCK — Next attack: 3x damage.');
        break;

      case 'firewall':
        state.player.firewallHp = 12;
        addMessage('> FIREWALL — Absorbing next 12 damage.');
        break;
    }

    endTurn();
  }

  // === TERMINALS ===

  function hackTerminal(x, y, state) {
    state.map[y][x] = 5; // Mark as used
    state.terminalsHacked = (state.terminalsHacked || 0) + 1;
    FA.narrative.setVar('terminals_hacked', state.terminalsHacked, 'Hacked terminal');

    if (state.terminalsHacked === 1) showNarrative('system_access');

    var cfg = FA.lookup('config', 'game');
    var ts = cfg.tileSize;
    var depth = state.depth;

    // Director message — layered as narrative bar overlay
    if (!state.directorMsgShown) state.directorMsgShown = {};
    if (!state.directorMsgShown[depth]) state.directorMsgShown[depth] = 0;
    var dirMsgs = FA.lookup('config', 'director');
    var depthMsgs = dirMsgs ? dirMsgs[depth] : null;
    if (depthMsgs && state.directorMsgShown[depth] < depthMsgs.length) {
      var dirMsg = depthMsgs[state.directorMsgShown[depth]];
      state.directorMsgShown[depth]++;
      if (dirMsg !== '...') {
        state.narrativeMessage = { text: '> "' + dirMsg + '" \u2014 DIRECTOR', color: '#f80', life: 6000, maxLife: 6000 };
        addMessage('> DIRECTOR: ' + dirMsg);
      }
    }

    // DP-6 trace — first terminal on floors 2 and 3
    var dp6Key = '_dp6_' + depth;
    if ((depth === 2 || depth === 3) && !state[dp6Key]) {
      state[dp6Key] = true;
      var dp6cfg = FA.lookup('config', 'dp6');
      if (dp6cfg && dp6cfg.traces) {
        var traceIdx = state.dp6TracesFound || 0;
        state.dp6TracesFound = (state.dp6TracesFound || 0) + 1;
        var trace = dp6cfg.traces[traceIdx % dp6cfg.traces.length];
        showNarrative('dp6_trace');
        addMessage('> DP-6 LOG: ' + trace);
        FA.addFloat(x * ts + ts / 2, y * ts, 'DP-6', '#88f', 1200);
        addThought('DP-6 was here before me.');
        return; // DP-6 trace IS the terminal reward
      }
    }

    // Normal terminal reward
    var effects = ['module', 'module', 'reveal', 'stun', 'intel'];
    var effect = FA.pick(effects);

    switch (effect) {
      case 'module':
        var moduleTypes = ['emp', 'cloak', 'scanner', 'overclock', 'firewall'];
        var modType = FA.pick(moduleTypes);
        var modDef = FA.lookup('modules', modType);
        if (state.player.modules.length < 3) {
          state.player.modules.push({ type: modType, name: modDef.name, color: modDef.color });
          addMessage('> HACK: ' + modDef.name + ' extracted [' + state.player.modules.length + '/3]');
          FA.addFloat(x * ts + ts / 2, y * ts, modDef.name, modDef.color, 1000);
          FA.narrative.setVar('modules_found', state.player.modules.length, 'Found ' + modDef.name);
          if (state.player.modules.length === 1) showNarrative('hardware_upgrade');
          if (state.player.modules.length === 3) showNarrative('full_arsenal');
        } else {
          addMessage('> HACK: Module found but slots full [3/3]. Data lost.');
        }
        break;

      case 'reveal':
        for (var ry = 0; ry < state.explored.length; ry++) {
          for (var rx = 0; rx < state.explored[ry].length; rx++) {
            state.explored[ry][rx] = true;
          }
        }
        addMessage('> HACK: Floor schematic downloaded.');
        FA.addFloat(x * ts + ts / 2, y * ts, 'MAP', '#0ff', 1000);
        break;

      case 'stun':
        for (var si = 0; si < state.enemies.length; si++) {
          state.enemies[si].stunTurns = (state.enemies[si].stunTurns || 0) + 3;
        }
        addMessage('> HACK: Security disrupted. All hostiles stunned.');
        FA.addFloat(x * ts + ts / 2, y * ts, 'DISRUPT', '#ff0', 1000);
        break;

      case 'intel':
        var intelList = FA.lookup('config', 'terminals').intel;
        var intel = FA.pick(intelList);
        addMessage('> ' + intel);
        if (!state.narrativeMessage || state.narrativeMessage.life <= 0) {
          state.narrativeMessage = { text: '> ' + intel, color: '#0ff', life: 5000, maxLife: 5000 };
        }
        break;
    }
  }

  // === DAMAGE SYSTEM ===

  function applyDamageToPlayer(dmg, sourceName, state) {
    // Firewall absorbs
    if (state.player.firewallHp > 0) {
      var absorbed = Math.min(dmg, state.player.firewallHp);
      state.player.firewallHp -= absorbed;
      dmg -= absorbed;
      if (absorbed > 0) addMessage('Firewall absorbs ' + absorbed + '.');
      if (dmg <= 0) return;
    }

    state.player.hp -= dmg;
    state.shake = 6;
    FA.emit('entity:damaged', { entity: state.player, damage: dmg });

    var cfg = FA.lookup('config', 'game');
    var ts = cfg.tileSize;
    FA.addFloat(state.player.x * ts + ts / 2, state.player.y * ts, '-' + dmg, '#f84', 800);
    addMessage(sourceName + ' deals ' + dmg + ' damage!');

    if (state.player.hp <= 0) {
      showNarrative('shutdown');
      endGame(false, 'shutdown');
    } else if (!state.damagedShown && state.player.hp <= state.player.maxHp * 0.3) {
      state.damagedShown = true;
      showNarrative('damaged');
    }
  }

  function sentinelShoot(e, state) {
    if (state.player.cloakTurns > 0) return;
    var dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (var d = 0; d < dirs.length; d++) {
      var sx = e.x, sy = e.y;
      for (var r = 1; r <= 6; r++) {
        sx += dirs[d][0];
        sy += dirs[d][1];
        if (sy < 0 || sy >= state.map.length || sx < 0 || sx >= state.map[0].length) break;
        if (state.map[sy][sx] === 1) break;
        if (sx === state.player.x && sy === state.player.y) {
          var dmg = Math.max(1, e.atk - state.player.def + FA.rand(-1, 1));
          var cfg = FA.lookup('config', 'game');
          var ts = cfg.tileSize;
          FA.addFloat(e.x * ts + ts / 2, e.y * ts, '!', '#f80', 600);
          applyDamageToPlayer(dmg, e.name + ' FIRES', state);
          propagateSound(state, e.x, e.y, 10);
          return;
        }
      }
    }
  }

  // === MOVEMENT ===

  function movePlayer(dx, dy) {
    var state = FA.getState();
    if (state.screen !== 'playing') return;
    var nx = state.player.x + dx;
    var ny = state.player.y + dy;

    for (var i = 0; i < state.enemies.length; i++) {
      if (state.enemies[i].x === nx && state.enemies[i].y === ny) {
        attackEnemy(state.player, state.enemies[i], i);
        endTurn();
        return;
      }
    }

    if (!isWalkable(state.map, nx, ny)) return;
    state.player.x = nx;
    state.player.y = ny;
    FA.playSound('step');

    var tile = state.map[ny][nx];
    if (tile === 2) { changeFloor('down'); return; }
    if (tile === 3) { changeFloor('up'); return; }
    if (tile === 4) { hackTerminal(nx, ny, state); }

    for (var j = state.items.length - 1; j >= 0; j--) {
      if (state.items[j].x === nx && state.items[j].y === ny) {
        pickupItem(state.items[j], j);
      }
    }
    endTurn();
  }

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

    var label = multiplier > 1 ? 'OVERCLOCK -' + dmg : '-' + dmg;
    var color = multiplier > 1 ? '#f80' : '#f44';
    addMessage(multiplier > 1 ? 'OVERCLOCK STRIKE! ' + dmg + ' to ' + target.name + '!' : 'You deal ' + dmg + ' to ' + target.name + '.');

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
      addMessage(target.name + ' destroyed.');
      FA.narrative.setVar('drones_destroyed', state.player.kills, 'Destroyed ' + target.name);

      if (state.player.kills === 1) showNarrative('first_contact');
      if (state.enemies.length === 0) showNarrative('floor_clear');

      checkPath(state);
      checkClimax(state);

      if (allFloorsCleared(state)) {
        var ending = chooseEnding(state);
        showNarrative(ending);
        endGame(true, ending);
      }
    }
  }

  function allFloorsCleared(state) {
    if (state.enemies.length > 0) return false;
    if (state.maxDepthReached < FA.lookup('config', 'game').maxDepth) return false;
    for (var d = 1; d <= state.maxDepthReached; d++) {
      if (d === state.depth) continue;
      if (state.floors[d] && state.floors[d].enemies.length > 0) return false;
    }
    return true;
  }

  function pickupItem(item, idx) {
    var state = FA.getState();

    // Module: check capacity before pickup
    if (item.type === 'module' && state.player.modules.length >= 3) {
      addMessage('Module slots full [3/3]. ' + item.name + ' left on ground.');
      return;
    }

    state.items.splice(idx, 1);
    FA.emit('item:pickup', { item: item });

    if (item.type === 'gold') {
      var wasZero = state.player.gold === 0;
      state.player.gold += item.value;
      addMessage('+' + item.value + ' data');
      FA.narrative.setVar('cores_found', state.player.gold, 'Recovered data core');
      if (wasZero) showNarrative('first_core');
      checkPath(state);
      checkClimax(state);
    } else if (item.type === 'potion') {
      var heal = Math.min(item.healAmount, state.player.maxHp - state.player.hp);
      state.player.hp += heal;
      addMessage('+' + heal + ' hull repaired');
    } else if (item.type === 'module') {
      state.player.modules.push({ type: item.moduleType, name: item.name, color: item.color });
      addMessage('MODULE: ' + item.name + ' [' + state.player.modules.length + '/3]');
      FA.narrative.setVar('modules_found', state.player.modules.length, 'Found ' + item.name);
      if (state.player.modules.length === 1) showNarrative('hardware_upgrade');
      if (state.player.modules.length === 3) showNarrative('full_arsenal');
    }
  }

  // === AI SYSTEM ===

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
    if (x === state.player.x && y === state.player.y) return false;
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
    var dist = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
    var cloaked = p.cloakTurns > 0;
    var sightRange = e.behavior === 'tracker' ? 20 : e.behavior === 'sentinel' ? 6 : 8;
    var canSee = !cloaked && dist <= sightRange && hasLOS(state.map, e.x, e.y, p.x, p.y);

    // Adjacent = always attack (self-defense)
    if (dist === 1 && !cloaked) {
      e.aiState = 'hunting';
      e.alertTarget = { x: p.x, y: p.y };
      return { type: e.behavior === 'sentinel' ? 'shoot' : 'attack' };
    }

    // State transitions
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

      default: // patrol
        if (e.behavior === 'sentinel') return { type: 'idle' };
        if (!e.patrolTarget || (e.x === e.patrolTarget.x && e.y === e.patrolTarget.y)) {
          var rooms = state.floors[state.depth].rooms;
          var room = rooms[Math.floor(Math.random() * rooms.length)];
          e.patrolTarget = { x: Math.floor(room.x + room.w / 2), y: Math.floor(room.y + room.h / 2) };
        }
        return { type: 'patrol' };
    }
  }

  function enemyTurn() {
    var state = FA.getState();
    if (state.player.cloakTurns > 0) state.player.cloakTurns--;

    for (var i = 0; i < state.enemies.length; i++) {
      var e = state.enemies[i];
      if (e.stunTurns > 0) { e.stunTurns--; continue; }

      var action = computeEnemyAction(e, state);

      switch (action.type) {
        case 'shoot':
          sentinelShoot(e, state);
          if (state.player.hp <= 0) return;
          break;
        case 'attack':
          var dmg = Math.max(1, e.atk - state.player.def + FA.rand(-1, 1));
          applyDamageToPlayer(dmg, e.name, state);
          if (state.player.hp <= 0) return;
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
    for (var i = 0; i < enemies.length; i++) {
      if (i === skipIdx) continue;
      if (enemies[i].x === x && enemies[i].y === y) return true;
    }
    return false;
  }

  function endTurn() {
    var state = FA.getState();
    if (state.screen !== 'playing') return;
    state.turn++;
    if (state.turn === 1) {
      showNarrative('scanning');
      triggerThought('floor_enter', 1);
    }
    enemyTurn();
    checkThoughts(state);
  }

  function endGame(victory, endingNode) {
    var state = FA.getState();
    state.screen = victory ? 'victory' : 'shutdown';
    state.endingNode = endingNode;
    var scoring = FA.lookup('config', 'scoring');
    state.score = (state.player.kills * scoring.killMultiplier) +
                  (state.player.gold * scoring.goldMultiplier) +
                  ((state.maxDepthReached - 1) * scoring.depthBonus);

    // Permadeath tracking
    try {
      var deathCount = parseInt(localStorage.getItem('dp_deaths') || '0') + 1;
      localStorage.setItem('dp_deaths', deathCount.toString());
      localStorage.setItem('dp_lastDeath', JSON.stringify({
        designation: state.dpNumber || 7,
        depth: state.depth,
        turn: state.turn,
        kills: state.player.kills,
        victory: victory,
        ending: endingNode
      }));
    } catch(e) {}

    // Customize shutdown cutscene with DP number
    if (!victory && state.cutscene && state.dpNumber) {
      var nextDp = (state.dpNumber || 7) + 1;
      state.cutscene.lines[2] = '> Designation: DP-' + state.dpNumber;
      state.cutscene.lines[10] = '> DP-' + nextDp + ' blueprint: LOADED.';
    }

    FA.emit('game:over', { victory: victory, score: state.score });
  }

  function addMessage(text) {
    var color = '#556';
    if (text.indexOf('> HACK') === 0) color = '#0ff';
    else if (text.indexOf('OVERCLOCK STRIKE') >= 0) color = '#f80';
    else if (text.indexOf('destroyed') >= 0 || text.indexOf('deals') >= 0 || text.indexOf('damage') >= 0 || text.indexOf('absorbs') >= 0) color = '#f44';
    else if (text.charAt(0) === '+') color = '#4f4';
    else if (text.indexOf('MODULE') >= 0 || text.indexOf('Module') >= 0) color = '#ff0';
    else if (text.charAt(0) === '>') color = '#8af';
    var msgs = FA.getState().messages;
    msgs.push({ text: text, color: color });
    if (msgs.length > 6) msgs.shift();
  }

  // === THOUGHT SYSTEM ===

  function addThought(text) {
    var state = FA.getState();
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

  function checkThoughts(state) {
    var prev = state._prevThought || {};

    if (state.depth !== prev.depth) triggerThought('floor_enter', state.depth);
    if (state.player.kills > (prev.kills || 0)) triggerThought('combat');
    if (state.player.hp < (prev.hp || state.player.maxHp)) {
      if (state.player.hp < state.player.maxHp * 0.3) triggerThought('low_health');
      else triggerThought('damage');
    }
    if (state.player.gold > (prev.gold || 0)) triggerThought('pickup_data');
    if (state.player.modules.length > (prev.modules || 0)) triggerThought('pickup_module');
    if ((state.terminalsHacked || 0) > (prev.terminals || 0)) triggerThought('terminal_hack');
    if (state.path !== 'none' && state.path !== prev.path) triggerThought(state.path);
    if (state.turn > 0 && state.turn % 20 === 0) triggerThought('ambient');

    state._prevThought = {
      depth: state.depth, kills: state.player.kills, hp: state.player.hp,
      gold: state.player.gold, modules: state.player.modules.length,
      path: state.path, terminals: state.terminalsHacked || 0
    };
  }

  function dismissThought() {
    FA.getState().thoughts = [];
  }

  window.Game = {
    start: startGame,
    begin: beginPlaying,
    movePlayer: movePlayer,
    useModule: useModule,
    dismissCutscene: dismissCutscene,
    dismissThought: dismissThought
  };
})();
