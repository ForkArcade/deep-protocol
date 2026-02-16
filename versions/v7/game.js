// Roguelike — Game Logic
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

    // Stairs down in last room (except on final floor)
    var stairsDown = null;
    if (depth < maxDepth) {
      var lastRoom = rooms[rooms.length - 1];
      var sdx = Math.floor(lastRoom.x + lastRoom.w / 2);
      var sdy = Math.floor(lastRoom.y + lastRoom.h / 2);
      map[sdy][sdx] = 2;
      stairsDown = { x: sdx, y: sdy };
    }

    // Stairs up in first room (except on floor 1)
    var stairsUp = null;
    if (depth > 1) {
      var firstRoom = rooms[0];
      var sux = Math.floor(firstRoom.x + firstRoom.w / 2);
      var suy = Math.floor(firstRoom.y + firstRoom.h / 2);
      map[suy][sux] = 3;
      stairsUp = { x: sux, y: suy };
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
    var ratDef = FA.lookup('enemies', 'rat');
    var enemies = [];
    var enemyCount = 3 + depth * 2;
    var hpScale = 1 + (depth - 1) * 0.3;
    var atkScale = 1 + (depth - 1) * 0.2;

    for (var i = 0; i < enemyCount; i++) {
      var epos = findEmptyInRooms(map, rooms, occupied);
      occupied.push(epos);
      enemies.push({
        id: FA.uid(), x: epos.x, y: epos.y,
        hp: Math.floor(ratDef.hp * hpScale),
        maxHp: Math.floor(ratDef.hp * hpScale),
        atk: Math.floor(ratDef.atk * atkScale),
        def: ratDef.def + Math.floor((depth - 1) / 2),
        char: ratDef.char, color: ratDef.color, name: ratDef.name,
        behavior: ratDef.behavior
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

    return { enemies: enemies, items: items };
  }

  // === SCREENS ===

  function startGame() {
    FA.resetState({ screen: 'start' });
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

    FA.resetState({
      screen: 'playing',
      map: floor.map,
      explored: floor.explored,
      player: { x: px, y: py, hp: 20, maxHp: 20, atk: 5, def: 1, gold: 0, kills: 0 },
      enemies: populated.enemies,
      items: populated.items,
      depth: 1,
      maxDepthReached: 1,
      floors: floors,
      messages: [],
      narrativeMessage: null,
      turn: 0
    });

    FA.clearEffects();
    var narCfg = FA.lookup('config', 'narrative');
    if (narCfg) FA.narrative.init(narCfg);
    showNarrative('entrance');
  }

  // === FLOOR TRANSITION ===

  function changeFloor(direction) {
    var state = FA.getState();
    var cfg = FA.lookup('config', 'game');
    var oldDepth = state.depth;
    var newDepth = direction === 'down' ? oldDepth + 1 : oldDepth - 1;

    // Save current floor
    state.floors[oldDepth].enemies = state.enemies;
    state.floors[oldDepth].items = state.items;
    state.floors[oldDepth].explored = state.explored;

    // Generate or load target floor
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

    // Place player at arrival stairs
    if (direction === 'down' && target.stairsUp) {
      state.player.x = target.stairsUp.x;
      state.player.y = target.stairsUp.y;
    } else if (direction === 'up' && target.stairsDown) {
      state.player.x = target.stairsDown.x;
      state.player.y = target.stairsDown.y;
    }

    FA.clearEffects();
    addMessage(direction === 'down' ? 'You descend to depth ' + newDepth + '...' : 'You ascend to depth ' + newDepth + '...');
    FA.narrative.setVar('depth_reached', state.maxDepthReached, 'Reached depth ' + state.maxDepthReached);

    if (direction === 'down' && newDepth === 2) showNarrative('descent');
    if (direction === 'down' && newDepth >= 4) showNarrative('deep_dungeon');
  }

  // === NARRATIVE IN-GAME ===

  function showNarrative(nodeId) {
    FA.narrative.transition(nodeId);
    var narText = FA.lookup('narrativeText', nodeId);
    if (narText) {
      FA.getState().narrativeMessage = { text: narText.text, color: narText.color, life: 4000, maxLife: 4000 };
      addMessage(narText.text);
    }
  }

  // === MOVEMENT ===

  function movePlayer(dx, dy) {
    var state = FA.getState();
    if (state.screen !== 'playing') return;
    var nx = state.player.x + dx;
    var ny = state.player.y + dy;

    // Combat check
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

    // Stairs check
    var tile = state.map[ny][nx];
    if (tile === 2) { changeFloor('down'); return; }
    if (tile === 3) { changeFloor('up'); return; }

    // Item pickup
    for (var j = state.items.length - 1; j >= 0; j--) {
      if (state.items[j].x === nx && state.items[j].y === ny) {
        pickupItem(state.items[j], j);
      }
    }
    endTurn();
  }

  function attackEnemy(attacker, target, idx) {
    var dmg = Math.max(1, attacker.atk - target.def + FA.rand(-1, 2));
    target.hp -= dmg;
    FA.emit('entity:damaged', { entity: target, damage: dmg });
    addMessage('You deal ' + dmg + ' damage to ' + target.name + '!');

    var cfg = FA.lookup('config', 'game');
    var ts = cfg.tileSize;
    FA.addFloat(target.x * ts + ts / 2, target.y * ts, '-' + dmg, '#f44', 800);

    if (target.hp <= 0) {
      var state = FA.getState();
      state.enemies.splice(idx, 1);
      state.player.kills++;
      FA.emit('entity:killed', { entity: target });
      addMessage(target.name + ' defeated!');
      FA.narrative.setVar('rats_killed', state.player.kills, 'Defeated ' + target.name);

      if (state.player.kills === 1) showNarrative('first_blood');
      else if (state.player.kills === 3) showNarrative('hunter');

      // Victory: cleared all floors
      if (allFloorsCleared(state)) {
        showNarrative('victory');
        endGame(true);
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
    state.items.splice(idx, 1);
    FA.emit('item:pickup', { item: item });
    if (item.type === 'gold') {
      state.player.gold += item.value;
      addMessage('+' + item.value + ' gold');
      FA.narrative.setVar('gold_found', state.player.gold, 'Found gold');
    } else if (item.type === 'potion') {
      var heal = Math.min(item.healAmount, state.player.maxHp - state.player.hp);
      state.player.hp += heal;
      addMessage('+' + heal + ' HP');
    }
  }

  function enemyTurn() {
    var state = FA.getState();
    for (var i = 0; i < state.enemies.length; i++) {
      var e = state.enemies[i];
      var bDef = FA.lookup('behaviors', e.behavior);
      if (!bDef) continue;
      var action = bDef.act(e, state);
      if (action.type !== 'move') continue;

      var nx = e.x + action.dx;
      var ny = e.y + action.dy;

      if (nx === state.player.x && ny === state.player.y) {
        var dmg = Math.max(1, e.atk - state.player.def + FA.rand(-1, 1));
        state.player.hp -= dmg;
        FA.emit('entity:damaged', { entity: state.player, damage: dmg });
        addMessage(e.name + ' deals ' + dmg + ' damage!');

        var cfg = FA.lookup('config', 'game');
        var ts = cfg.tileSize;
        FA.addFloat(state.player.x * ts + ts / 2, state.player.y * ts, '-' + dmg, '#f84', 800);

        if (state.player.hp <= 0) {
          showNarrative('death');
          endGame(false);
          return;
        }
      } else if (isWalkable(state.map, nx, ny) && !isOccupied(nx, ny, i)) {
        e.x = nx;
        e.y = ny;
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
    if (state.turn === 1) showNarrative('exploring');
    enemyTurn();
  }

  function endGame(victory) {
    var state = FA.getState();
    state.screen = victory ? 'victory' : 'death';
    var scoring = FA.lookup('config', 'scoring');
    state.score = (state.player.kills * scoring.killMultiplier) +
                  (state.player.gold * scoring.goldMultiplier) +
                  ((state.maxDepthReached - 1) * scoring.depthBonus);
    FA.emit('game:over', { victory: victory, score: state.score });
  }

  function addMessage(text) {
    var msgs = FA.getState().messages;
    msgs.push(text);
    if (msgs.length > 6) msgs.shift();
  }

  window.Game = {
    start: startGame,
    begin: beginPlaying,
    movePlayer: movePlayer
  };
})();
