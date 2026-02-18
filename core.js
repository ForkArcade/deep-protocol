// Deep Protocol — Core Utilities
// Map generation (ROT.Map), pathfinding (ROT.Path), FOV (ROT.FOV),
// unified collision, map registry, bubble/thought system, narrative helpers
(function() {
  'use strict';
  var FA = window.FA;

  // === CONSTANTS ===

  var TILES = FA.lookup('config', 'dungeonTiles');
  var FIND_EMPTY_MAX_ATTEMPTS = 200;
  var BUBBLE_MAX_CHARS = 65;
  var BUBBLE_HOLD_TIME = 8000;
  var BUBBLE_LINE_DELAY = 200;
  var THOUGHT_HOLD_TIME = 8000;
  var THOUGHT_REVEAL_SPEED = 30;
  var THOUGHT_COOLDOWN = 5;
  var SOUND_ALERT_TIMER = 8;

  // ============================================================
  //  MAP GENERATION (rot.js)
  // ============================================================

  function generateFloor(cols, rows, depth) {
    var cfg = FA.lookup('config', 'game');

    var digger = new ROT.Map.Digger(cols, rows, {
      roomWidth: [cfg.roomMinSize, cfg.roomMaxSize],
      roomHeight: [cfg.roomMinSize, cfg.roomMaxSize],
      dugPercentage: 0.35 + depth * 0.03
    });

    var map = [];
    for (var y = 0; y < rows; y++) { map[y] = []; for (var x = 0; x < cols; x++) map[y][x] = TILES.wall; }
    digger.create(function(x, y, value) { map[y][x] = value; });

    var rotRooms = digger.getRooms();
    var rooms = [];
    for (var r = 0; r < rotRooms.length; r++) {
      var rr = rotRooms[r];
      rooms.push({
        x: rr.getLeft(), y: rr.getTop(),
        w: rr.getRight() - rr.getLeft() + 1,
        h: rr.getBottom() - rr.getTop() + 1
      });
    }

    if (rooms.length < 2) {
      rooms = [{ x: 2, y: 2, w: 5, h: 5 }, { x: cols - 8, y: rows - 8, w: 5, h: 5 }];
      for (var fi = 0; fi < rooms.length; fi++) {
        var fr = rooms[fi];
        for (var ry = fr.y; ry < fr.y + fr.h; ry++)
          for (var rx = fr.x; rx < fr.x + fr.w; rx++) map[ry][rx] = TILES.floor;
      }
    }

    // Exit in last room
    var lastRoom = rooms[rooms.length - 1];
    var ex = Math.floor(lastRoom.x + lastRoom.w / 2);
    var ey = Math.floor(lastRoom.y + lastRoom.h / 2);
    map[ey][ex] = TILES.stairsUp;
    var stairsUp = { x: ex, y: ey };

    // Terminals (1-2 per floor)
    var termCount = 1 + Math.floor(depth / 3);
    for (var ti = 0; ti < termCount && rooms.length > 2; ti++) {
      var tRoom = rooms[1 + ti];
      if (!tRoom) break;
      var ttx = tRoom.x + 1;
      var tty = tRoom.y + 1;
      if (map[tty][ttx] === TILES.floor) map[tty][ttx] = TILES.terminal;
    }

    var explored = [];
    for (var ey2 = 0; ey2 < rows; ey2++) {
      explored[ey2] = [];
      for (var ex2 = 0; ex2 < cols; ex2++) explored[ey2][ex2] = false;
    }

    return { map: map, rooms: rooms, stairsUp: stairsUp, explored: explored };
  }

  function findEmptyInRooms(map, rooms, occupied) {
    for (var i = 0; i < FIND_EMPTY_MAX_ATTEMPTS; i++) {
      var room = FA.pick(rooms);
      var x = FA.rand(room.x, room.x + room.w - 1);
      var y = FA.rand(room.y, room.y + room.h - 1);
      if (map[y][x] !== TILES.floor) continue;
      var taken = false;
      for (var j = 0; j < occupied.length; j++) {
        if (occupied[j].x === x && occupied[j].y === y) { taken = true; break; }
      }
      if (!taken) return { x: x, y: y };
    }
    // Robust fallback: scan first room for any walkable, unoccupied tile
    var fallbackRoom = rooms[0];
    for (var fy = fallbackRoom.y; fy < fallbackRoom.y + fallbackRoom.h; fy++) {
      for (var fx = fallbackRoom.x; fx < fallbackRoom.x + fallbackRoom.w; fx++) {
        if (map[fy][fx] !== TILES.floor) continue;
        var ftaken = false;
        for (var fj = 0; fj < occupied.length; fj++) {
          if (occupied[fj].x === fx && occupied[fj].y === fy) { ftaken = true; break; }
        }
        if (!ftaken) return { x: fx, y: fy };
      }
    }
    return { x: fallbackRoom.x + 1, y: fallbackRoom.y + 1 };
  }

  function isWalkable(map, x, y) {
    if (y < 0 || y >= map.length || x < 0 || x >= map[0].length) return false;
    var tile = map[y][x];
    return tile !== TILES.wall && tile !== TILES.blocking;
  }

  // ============================================================
  //  MAP REGISTRY
  // ============================================================

  function changeMap(targetMapId, spawnX, spawnY) {
    var state = FA.getState();
    state.mapId = targetMapId;
    state.map = state.maps[targetMapId].grid;
    state.player.x = spawnX;
    state.player.y = spawnY;
    state.depth = (targetMapId === 'town') ? 0 : targetMapId;
    state.mapVersion = (state.mapVersion || 0) + 1;
  }

  function getEntityAt(x, y) {
    var state = FA.getState();
    var entities = state.maps[state.mapId].entities;
    for (var i = 0; i < entities.length; i++) {
      var e = entities[i];
      if (e.x < 0 || e.y < 0) continue;
      if (e.type === 'npc' && state.day < e.appearsDay) continue;
      if (e.x === x && e.y === y) return e;
    }
    return null;
  }

  // ============================================================
  //  FOV (rot.js)
  // ============================================================

  function computeVisibility(map, px, py, radius) {
    var rows = map.length, cols = map[0].length;
    var vis = [];
    for (var y = 0; y < rows; y++) { vis[y] = []; for (var x = 0; x < cols; x++) vis[y][x] = 0; }
    var fov = new ROT.FOV.PreciseShadowcasting(function(x, y) {
      if (x < 0 || x >= cols || y < 0 || y >= rows) return false;
      return map[y][x] !== 1;
    });
    fov.compute(px, py, radius, function(x, y, r, visibility) {
      if (x < 0 || x >= cols || y < 0 || y >= rows) return;
      var light = r < 2 ? 1 : Math.max(0, 1 - (r - 2) / (radius - 2));
      if (light > vis[y][x]) vis[y][x] = light;
    });
    return vis;
  }

  // ============================================================
  //  PATHFINDING (rot.js)
  // ============================================================

  function findPath(fromX, fromY, toX, toY, map) {
    var path = [];
    var astar = new ROT.Path.AStar(toX, toY, function(x, y) {
      return isWalkable(map, x, y);
    }, { topology: 4 });
    astar.compute(fromX, fromY, function(x, y) { path.push({ x: x, y: y }); });
    return path;
  }

  // ============================================================
  //  POPULATE FLOOR
  // ============================================================

  function populateFloor(map, rooms, depth) {
    var occupied = [];
    var entities = [];
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

      entities.push({
        id: FA.uid(), type: 'enemy', x: epos.x, y: epos.y,
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

    return { entities: entities, items: items, occupied: occupied };
  }

  // ============================================================
  //  OVERWORLD MAP PARSING
  // ============================================================

  function parseOverworldMap() {
    var grid = getMapGrid('overworld');
    if (!grid) return [];
    var objects = getMapObjects('overworld');
    for (var i = 0; i < objects.length; i++) {
      if (objects[i].blocking) {
        grid[objects[i].y][objects[i].x] = TILES.blocking;
      }
    }
    return grid;
  }

  function getObjectAtPos(x, y) {
    var state = FA.getState();
    var mapData = state.maps ? state.maps[state.mapId] : null;
    var objects = mapData ? mapData.objects : null;
    if (!objects) return null;
    for (var i = 0; i < objects.length; i++) {
      if (objects[i].x === x && objects[i].y === y) return objects[i];
    }
    return null;
  }

  // ============================================================
  //  AI MOVEMENT HELPERS (unified collision)
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

  function canStep(x, y, skipEntity) {
    var state = FA.getState();
    if (!isWalkable(state.map, x, y)) return false;
    if (state.player && x === state.player.x && y === state.player.y) return false;
    var entities = state.maps[state.mapId].entities;
    for (var i = 0; i < entities.length; i++) {
      var e = entities[i];
      if (e === skipEntity) continue;
      if (e.x < 0 || e.y < 0) continue;
      if (e.type === 'npc' && state.day < e.appearsDay) continue;
      if (e.x === x && e.y === y) return false;
    }
    return true;
  }

  function moveToward(e, tx, ty) {
    var state = FA.getState();
    var path = findPath(e.x, e.y, tx, ty, state.map);
    if (path.length >= 2) {
      var next = path[1];
      if (canStep(next.x, next.y, e)) {
        e.x = next.x; e.y = next.y;
        return true;
      }
    }
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
      if (canStep(nx, ny, e)) {
        e.x = nx; e.y = ny;
        return true;
      }
    }
    return false;
  }

  function flankTarget(e, tx, ty) {
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
      if (canStep(nx, ny, e)) {
        e.x = nx; e.y = ny;
        return true;
      }
    }
    return moveToward(e, tx, ty);
  }

  function randomStep(e) {
    var dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (var i = dirs.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = dirs[i]; dirs[i] = dirs[j]; dirs[j] = t;
    }
    for (var d = 0; d < dirs.length; d++) {
      var nx = e.x + dirs[d][0], ny = e.y + dirs[d][1];
      if (canStep(nx, ny, e)) {
        e.x = nx; e.y = ny;
        return;
      }
    }
  }

  function propagateSound(x, y, radius) {
    var state = FA.getState();
    var entities = state.maps[state.mapId].entities;
    for (var i = 0; i < entities.length; i++) {
      var e = entities[i];
      if (e.type !== 'enemy') continue;
      if (e.aiState === 'hunting') continue;
      var dist = Math.abs(e.x - x) + Math.abs(e.y - y);
      if (dist <= radius) {
        e.aiState = 'alert';
        e.alertTarget = { x: x, y: y };
        e.alertTimer = SOUND_ALERT_TIMER;
      }
    }
    if (state.soundWaves) state.soundWaves.push({ tx: x, ty: y, maxR: radius, life: 500 });
  }

  // ============================================================
  //  BUBBLE / THOUGHT QUEUE SYSTEM
  // ============================================================

  function _createSystemBubble(state, text, color) {
    var words = text.split(' ');
    var lines = []; var line = '';
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (test.length > BUBBLE_MAX_CHARS && line.length > 0) { lines.push(line); line = words[i]; }
      else line = test;
    }
    if (line) lines.push(line);
    state.systemBubble = { lines: lines, color: color || '#4ef', timer: 0, done: false, life: BUBBLE_HOLD_TIME };
  }

  function _createThought(state, text) {
    if (!state.thoughts) state.thoughts = [];
    state.thoughts = [{ text: text, timer: 0, speed: THOUGHT_REVEAL_SPEED, done: false, life: THOUGHT_HOLD_TIME }];
    state.lastThoughtTurn = state.turn;
  }

  function _isBubbleActive(state) {
    return state.systemBubble || (state.thoughts && state.thoughts.length > 0);
  }

  function addSystemBubble(text, color) {
    var state = FA.getState();
    if (_isBubbleActive(state)) {
      if (!state.bubbleQueue) state.bubbleQueue = [];
      state.bubbleQueue.push({ type: 'system', text: text, color: color });
      return;
    }
    _createSystemBubble(state, text, color);
  }

  function addThought(text) {
    var state = FA.getState();
    if (_isBubbleActive(state)) {
      if (!state.bubbleQueue) state.bubbleQueue = [];
      state.bubbleQueue.push({ type: 'thought', text: text });
      return;
    }
    _createThought(state, text);
  }

  function triggerThought(category) {
    var state = FA.getState();
    if (state.turn - (state.lastThoughtTurn || 0) < THOUGHT_COOLDOWN) return;
    var entry = FA.select(FA.lookup('thoughts', category));
    if (!entry || !entry.pool || !entry.pool.length) return;
    addThought(FA.pick(entry.pool));
  }

  function dismissBubbles() {
    var state = FA.getState();
    state.thoughts = [];
    state.systemBubble = null;
    if (state.bubbleQueue && state.bubbleQueue.length > 0) {
      var next = state.bubbleQueue.shift();
      if (next.type === 'system') _createSystemBubble(state, next.text, next.color);
      else _createThought(state, next.text);
    }
  }

  // ============================================================
  //  NARRATIVE HELPERS
  // ============================================================

  function showNarrative(graphId, nodeId) {
    FA.narrative.transition(graphId, nodeId);
    var narText = FA.lookup('narrativeText', nodeId);
    if (narText) addSystemBubble(narText.text, narText.color);
    var cutscene = FA.lookup('cutscenes', nodeId);
    var state = FA.getState();
    if (cutscene && state.screen !== 'cutscene') {
      startCutscene(cutscene, state);
    }
  }

  function selectDialogue(npcId) {
    var entry = FA.select(FA.lookup('dialogues', npcId));
    return entry ? entry.text : null;
  }

  function startCutscene(def, state) {
    state.cutsceneReturn = state.screen;
    state.screen = 'cutscene';
    state.cutscene = {
      lines: def.lines.slice(),
      color: def.color || '#4ef',
      lineDelay: def.lineDelay || BUBBLE_LINE_DELAY,
      timer: 0, done: false
    };
  }

  function triggerEnding(victory, endingNode) {
    var state = FA.getState();
    showNarrative('arc', endingNode);
    if (state.screen === 'cutscene') {
      state._pendingEnd = { victory: victory, endingNode: endingNode };
    } else {
      window.Game._endGame(victory, endingNode);
    }
  }

  // ============================================================
  //  EXPORTS
  // ============================================================

  window.Core = {
    // Map generation
    generateFloor: generateFloor,
    findEmptyInRooms: findEmptyInRooms,
    isWalkable: isWalkable,
    computeVisibility: computeVisibility,
    findPath: findPath,
    populateFloor: populateFloor,
    parseOverworldMap: parseOverworldMap,
    // Map registry
    changeMap: changeMap,
    getEntityAt: getEntityAt,
    getObjectAtPos: getObjectAtPos,
    // AI movement
    hasLOS: hasLOS,
    canStep: canStep,
    moveToward: moveToward,
    flankTarget: flankTarget,
    randomStep: randomStep,
    propagateSound: propagateSound,
    // Bubble/thought
    addSystemBubble: addSystemBubble,
    addThought: addThought,
    triggerThought: triggerThought,
    dismissBubbles: dismissBubbles,
    _createSystemBubble: _createSystemBubble,
    _createThought: _createThought,
    // Narrative
    showNarrative: showNarrative,
    selectDialogue: selectDialogue,
    startCutscene: startCutscene,
    triggerEnding: triggerEnding
  };
})();
