// Deep Protocol — Combat & AI System
// Extracted from game.js. References window.Game at runtime for death handling.
(function() {
  'use strict';
  var FA = window.FA;
  var Core = window.Core;
  var cfg = FA.lookup('config', 'game');

  var SHAKE_INTENSITY = 6;
  var SENTINEL_SHOOT_RANGE = 6;
  var OVERCLOCK_MULTIPLIER = 3;
  var PARTICLE_COUNT = 8;
  var PARTICLE_LIFE = 500;

  // ============================================================
  //  ATTACK
  // ============================================================

  function attackEnemy(attacker, target) {
    var state = FA.getState();
    var L = getLayout();
    var ts = L.ts, ox = L.ox, oy = L.oy;
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
    FA.addFloat(ox + target.x * ts + ts / 2, oy + target.y * ts, label, color, 800);
    Core.propagateSound(target.x, target.y, 8);

    if (target.hp <= 0) {
      var entities = state.maps[state.mapId].entities;
      for (var i = 0; i < entities.length; i++) {
        if (entities[i] === target) { entities.splice(i, 1); break; }
      }
      state.player.kills++;
      if (FA.narrative && FA.narrative.setVar) {
        FA.narrative.setVar('kills', (state.totalKills || 0) + state.player.kills, 'Destroyed ' + target.name);
      }
      FA.emit('entity:killed', { entity: target });

      var bx = ox + target.x * ts + ts / 2, by = oy + target.y * ts + ts / 2;
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

      // Victory check — all enemies dead on final depth
      if (Location.isSystem(state.mapId) && state.depth >= cfg.maxDepth) {
        var hasEnemies = false;
        for (var ei = 0; ei < entities.length; ei++) {
          if (entities[ei].type === 'enemy') { hasEnemies = true; break; }
        }
        if (!hasEnemies) Core.triggerEnding(true, 'revelation');
      }
    }
  }

  // ============================================================
  //  PLAYER DAMAGE
  // ============================================================

  function applyDamageToPlayer(dmg, sourceName, state) {
    if (state.player.firewallHp > 0) {
      var absorbed = Math.min(dmg, state.player.firewallHp);
      state.player.firewallHp -= absorbed;
      dmg -= absorbed;
      if (dmg <= 0) return;
    }

    var L = getLayout();
    var ts = L.ts, ox = L.ox, oy = L.oy;
    state.player.hp -= dmg;
    state.shake = SHAKE_INTENSITY;
    FA.emit('entity:damaged', { entity: state.player, damage: dmg });
    FA.addFloat(ox + state.player.x * ts + ts / 2, oy + state.player.y * ts, '-' + dmg, '#f84', 800);

    if (state.player.hp <= 0) {
      // Delegate death to game.js (runtime reference)
      window.Game._handlePlayerDeath(state);
    } else if (state.player.hp <= state.player.maxHp * 0.3) {
      Core.triggerThought('low_health');
    } else {
      Core.triggerThought('damage');
    }
  }

  function sentinelShoot(e, state) {
    if (!state.player || state.player.cloakTurns > 0) return;
    rangedShoot(e, state, SENTINEL_SHOOT_RANGE);
  }

  function rangedShoot(e, state, range) {
    if (!state.player || state.player.cloakTurns > 0) return;
    var L = getLayout();
    var ts = L.ts, ox = L.ox, oy = L.oy;
    var dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (var d = 0; d < dirs.length; d++) {
      var sx = e.x, sy = e.y;
      for (var r = 1; r <= range; r++) {
        sx += dirs[d][0]; sy += dirs[d][1];
        if (sy < 0 || sy >= state.map.length || sx < 0 || sx >= state.map[0].length) break;
        if (state.map[sy][sx] === 1) break;
        if (sx === state.player.x && sy === state.player.y) {
          var dmg = Math.max(1, e.atk - state.player.def + FA.rand(-1, 1));
          FA.addFloat(ox + e.x * ts + ts / 2, oy + e.y * ts, '!', '#f80', 600);
          applyDamageToPlayer(dmg, e.name, state);
          Core.propagateSound(e.x, e.y, 10);
          return;
        }
      }
    }
  }

  function bossAction(e, state) {
    var L = getLayout();
    var ts = L.ts, ox = L.ox, oy = L.oy;
    var bossDef = FA.lookup('actors', 'director_core');
    e.bossTimer++;

    // Shoot phase: fire in 4 cardinal directions using boss shootRange
    rangedShoot(e, state, bossDef.shootRange);

    // Summon phase: every summonInterval turns, spawn a drone if under maxSummons
    if (e.bossTimer % bossDef.summonInterval === 0 && e.summonCount < bossDef.maxSummons) {
      // Count active summoned drones
      var entities = state.maps[state.mapId].entities;
      var activeSummons = 0;
      for (var si = 0; si < entities.length; si++) {
        if (entities[si].summoner === e.id) activeSummons++;
      }
      if (activeSummons < bossDef.maxSummons) {
        // Find adjacent walkable tile for drone
        var adjDirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
        var spawnPos = null;
        for (var ai = 0; ai < adjDirs.length; ai++) {
          var ax = e.x + adjDirs[ai][0], ay = e.y + adjDirs[ai][1];
          if (Core.canStep(ax, ay, e)) {
            spawnPos = { x: ax, y: ay };
            break;
          }
        }
        if (spawnPos) {
          var droneDef = FA.lookup('enemies', bossDef.summonType);
          var depth = state.depth || 5;
          var hpScale = 1 + (depth - 1) * 0.3;
          var atkScale = 1 + (depth - 1) * 0.2;
          entities.push({
            id: FA.uid(), type: 'enemy', x: spawnPos.x, y: spawnPos.y,
            hp: Math.floor(droneDef.hp * hpScale),
            maxHp: Math.floor(droneDef.hp * hpScale),
            atk: Math.floor(droneDef.atk * atkScale),
            def: droneDef.def + Math.floor((depth - 1) / 2),
            char: droneDef.char, color: droneDef.color, name: droneDef.name,
            behavior: droneDef.behavior, stunTurns: 0,
            aiState: 'hunting', alertTarget: { x: state.player.x, y: state.player.y },
            alertTimer: 0, patrolTarget: null,
            summoner: e.id
          });
          e.summonCount++;
          FA.addFloat(ox + e.x * ts + ts / 2, oy + e.y * ts, 'SUMMON', '#0ff', 800);
          Core.propagateSound(e.x, e.y, 12);
        }
      }
    }

    // Taunt phase: every tauntInterval turns, show a random taunt
    if (e.bossTimer % bossDef.tauntInterval === 0 && bossDef.taunts && bossDef.taunts.length > 0) {
      var taunt = FA.pick(bossDef.taunts);
      Core.addSystemBubble('> DIRECTOR: ' + taunt, '#0ff');
    }
  }

  // ============================================================
  //  PICKUP
  // ============================================================

  function pickupItem(item, idx) {
    var state = FA.getState();
    var L = getLayout();
    var ts = L.ts, ox = L.ox, oy = L.oy;
    var mapData = state.maps[state.mapId];
    if (item.type === 'module' && state.player.modules.length >= 3) {
      FA.addFloat(ox + item.x * ts + ts / 2, oy + item.y * ts, 'FULL', '#f44', 600);
      return;
    }
    mapData.items.splice(idx, 1);
    FA.emit('item:pickup', { item: item });
    if (item.type === 'gold') {
      state.player.gold += item.value;
      FA.addFloat(ox + state.player.x * ts + ts / 2, oy + state.player.y * ts, '+' + item.value, '#0ff', 600);
      Core.triggerThought('pickup_data');
    } else if (item.type === 'potion') {
      var heal = Math.min(item.healAmount, state.player.maxHp - state.player.hp);
      state.player.hp += heal;
      FA.addFloat(ox + state.player.x * ts + ts / 2, oy + state.player.y * ts, '+' + heal, '#4f4', 600);
    } else if (item.type === 'module') {
      state.player.modules.push({ type: item.moduleType, name: item.name, color: item.color });
      FA.addFloat(ox + state.player.x * ts + ts / 2, oy + state.player.y * ts, item.name, item.color, 800);
    }
  }

  // ============================================================
  //  AI
  // ============================================================

  function computeEnemyAction(e, state, rooms) {
    var p = state.player;
    if (!p) return { type: 'idle' };
    var dist = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
    var cloaked = p.cloakTurns > 0;

    // Boss behavior — always knows where player is, stationary
    if (e.behavior === 'boss') {
      e.aiState = 'hunting';
      e.alertTarget = { x: p.x, y: p.y };
      return { type: 'boss' };
    }

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
    var zones = mapData.zones || null;

    for (var i = 0; i < entities.length; i++) {
      if (state.screen !== 'playing' || !state.player) return;
      var e = entities[i];
      if (e.type !== 'enemy') continue;
      if (e.stunTurns > 0) { e.stunTurns--; continue; }

      var action = computeEnemyAction(e, state, rooms);
      var prevX = e.x, prevY = e.y;

      switch (action.type) {
        case 'boss':
          bossAction(e, state);
          break;
        case 'shoot':
          sentinelShoot(e, state);
          break;
        case 'attack':
          if (e.curfewDrone && zones && state.player && zones[state.player.y] && zones[state.player.y][state.player.x] === 'h') break;
          if (state.player) {
            var dmg = Math.max(1, e.atk - state.player.def + FA.rand(-1, 1));
            applyDamageToPlayer(dmg, e.name, state);
          }
          break;
        case 'chase':
          if (e.curfewDrone) Core.moveTowardSimple(e, state.player.x, state.player.y);
          else Core.moveToward(e, state.player.x, state.player.y);
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

      if (e.curfewDrone && zones && zones[e.y] && zones[e.y][e.x] === 'h') {
        e.x = prevX; e.y = prevY;
      }
    }
  }

  window.Combat = {
    attack: attackEnemy,
    applyDamage: applyDamageToPlayer,
    enemyTurn: enemyTurn,
    pickup: pickupItem
  };
})();
