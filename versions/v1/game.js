// Roguelike — Game Logic
(function() {
  'use strict';
  var FA = window.FA;

  function generateMap(cols, rows) {
    var map = [];
    for (var y = 0; y < rows; y++) {
      map[y] = [];
      for (var x = 0; x < cols; x++) {
        if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) {
          map[y][x] = 1;
        } else {
          map[y][x] = 0;
        }
      }
    }
    for (var i = 0; i < Math.floor(cols * rows * 0.15); i++) {
      var wx = FA.rand(2, cols - 3);
      var wy = FA.rand(2, rows - 3);
      map[wy][wx] = 1;
    }
    return map;
  }

  function isWalkable(map, x, y) {
    if (y < 0 || y >= map.length || x < 0 || x >= map[0].length) return false;
    return map[y][x] === 0;
  }

  function findEmpty(map, cols, rows, occupied) {
    for (var i = 0; i < 200; i++) {
      var x = FA.rand(1, cols - 2);
      var y = FA.rand(1, rows - 2);
      if (map[y][x] !== 0) continue;
      var taken = false;
      for (var j = 0; j < occupied.length; j++) {
        if (occupied[j].x === x && occupied[j].y === y) { taken = true; break; }
      }
      if (!taken) return { x: x, y: y };
    }
    return { x: 1, y: 1 };
  }

  function initGame() {
    var cfg = FA.lookup('config', 'game');
    var map = generateMap(cfg.cols, cfg.rows);
    var occupied = [];

    var ppos = findEmpty(map, cfg.cols, cfg.rows, occupied);
    occupied.push(ppos);

    var ratDef = FA.lookup('enemies', 'rat');
    var enemies = [];
    for (var i = 0; i < 5; i++) {
      var epos = findEmpty(map, cfg.cols, cfg.rows, occupied);
      occupied.push(epos);
      enemies.push({
        id: FA.uid(), x: epos.x, y: epos.y,
        hp: ratDef.hp, maxHp: ratDef.hp, atk: ratDef.atk, def: ratDef.def,
        char: ratDef.char, color: ratDef.color, name: ratDef.name,
        behavior: ratDef.behavior
      });
    }

    var items = [];
    var goldDef = FA.lookup('items', 'gold');
    var potionDef = FA.lookup('items', 'potion');
    for (var g = 0; g < 8; g++) {
      var gpos = findEmpty(map, cfg.cols, cfg.rows, occupied);
      occupied.push(gpos);
      items.push({ id: FA.uid(), x: gpos.x, y: gpos.y, type: 'gold', char: goldDef.char, color: goldDef.color, value: goldDef.value });
    }
    for (var p = 0; p < 3; p++) {
      var pp = findEmpty(map, cfg.cols, cfg.rows, occupied);
      occupied.push(pp);
      items.push({ id: FA.uid(), x: pp.x, y: pp.y, type: 'potion', char: potionDef.char, color: potionDef.color, healAmount: potionDef.healAmount });
    }

    FA.resetState({
      map: map,
      player: { x: ppos.x, y: ppos.y, hp: 20, maxHp: 20, atk: 5, def: 1, gold: 0, kills: 0 },
      enemies: enemies,
      items: items,
      messages: ['Witaj w lochu! Pokonaj szczury.'],
      gameOver: false,
      victory: false,
      turn: 0
    });

    FA.clearEffects();
    var narCfg = FA.lookup('config', 'narrative');
    if (narCfg) FA.narrative.init(narCfg);
    FA.narrative.transition('exploring', 'Wchodzisz do lochu');
  }

  function movePlayer(dx, dy) {
    var state = FA.getState();
    if (state.gameOver) return;
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
    addMessage('Zadajesz ' + dmg + ' obrazen ' + target.name + '!');

    var cfg = FA.lookup('config', 'game');
    var ts = cfg.tileSize;
    FA.addFloat(target.x * ts + ts / 2, target.y * ts, '-' + dmg, '#f44', 800);

    if (target.hp <= 0) {
      FA.getState().enemies.splice(idx, 1);
      FA.getState().player.kills++;
      FA.emit('entity:killed', { entity: target });
      addMessage(target.name + ' pokonany!');
      FA.narrative.setVar('rats_killed', FA.getState().player.kills, 'Pokonano ' + target.name);

      if (FA.getState().enemies.length === 0) {
        FA.narrative.transition('victory', 'Wszystkie szczury pokonane!');
        endGame(true);
      }
    }
  }

  function pickupItem(item, idx) {
    var state = FA.getState();
    state.items.splice(idx, 1);
    FA.emit('item:pickup', { item: item });
    if (item.type === 'gold') {
      state.player.gold += item.value;
      addMessage('+' + item.value + ' zlota');
      FA.narrative.setVar('gold_found', state.player.gold, 'Znaleziono zloto');
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
        addMessage(e.name + ' zadaje ' + dmg + ' obrazen!');

        var cfg = FA.lookup('config', 'game');
        var ts = cfg.tileSize;
        FA.addFloat(state.player.x * ts + ts / 2, state.player.y * ts, '-' + dmg, '#f84', 800);

        if (state.player.hp <= 0) {
          FA.narrative.transition('death', 'Gracz pokonany!');
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
    if (state.gameOver) return;
    state.turn++;
    enemyTurn();
  }

  function endGame(victory) {
    var state = FA.getState();
    state.gameOver = true;
    state.victory = victory;
    var scoring = FA.lookup('config', 'scoring');
    state.score = (state.player.kills * scoring.killMultiplier) + (state.player.gold * scoring.goldMultiplier);
    FA.emit('game:over', { victory: victory, score: state.score });
  }

  function addMessage(text) {
    var msgs = FA.getState().messages;
    msgs.push(text);
    if (msgs.length > 6) msgs.shift();
  }

  window.Game = { init: initGame, movePlayer: movePlayer };
})();
