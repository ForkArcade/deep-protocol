// Deep Protocol — Combat & AI System
// Extracted from game.js. References window.Game at runtime for death handling.
(function() {
  'use strict';
  var FA = window.FA;
  var Core = window.Core;
  var cfg = FA.lookup('config', 'game');
  var colors = FA.lookup('config', 'colors');
  var combatCfg = FA.lookup('config', 'combat');
  var aiCfg = FA.lookup('config', 'enemyAI');
  var scaleCfg = FA.lookup('config', 'scaling');

  var TILES = FA.lookup('config', 'dungeonTiles') || { floor: 0, wall: 1, stairsUp: 3, terminal: 4, terminalUsed: 5 };

  function attackEnemy(attacker, target) {
    var state = FA.getState();
    var L = getLayout();
    var ts = L.ts, ox = L.ox, oy = L.oy;
    var multiplier = 1;
    if (state.player.overclockActive) {
      multiplier = combatCfg.overclockMultiplier;
      state.player.overclockActive = false;
    }
    var dmg = Math.max(1, Math.floor((attacker.atk - target.def + FA.rand(-1, 2)) * multiplier));
    target.hp -= dmg;
    FA.emit('entity:damaged', { entity: target, damage: dmg });

    var label = multiplier > 1 ? 'OC -' + dmg : '-' + dmg;
    var color = multiplier > 1 ? colors.floatOverclock : colors.floatDamage;
    FA.addFloat(ox + target.x * ts + ts / 2, oy + target.y * ts, label, color, 800);
    Core.propagateSound(target.x, target.y, aiCfg.soundPropagation.combat);

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
      for (var pi = 0; pi < combatCfg.particleCount; pi++) {
        var angle = (pi / combatCfg.particleCount) * Math.PI * 2 + Math.random() * 0.5;
        state.particles.push({
          x: bx, y: by,
          vx: Math.cos(angle) * (40 + Math.random() * 30),
          vy: Math.sin(angle) * (40 + Math.random() * 30),
          life: combatCfg.particleLife, maxLife: combatCfg.particleLife, color: target.color
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
    state.shake = combatCfg.shakeIntensity;
    FA.emit('entity:damaged', { entity: state.player, damage: dmg });
    FA.addFloat(ox + state.player.x * ts + ts / 2, oy + state.player.y * ts, '-' + dmg, colors.floatPlayerDmg, 800);

    if (state.player.hp <= 0) {
      window.Game._handlePlayerDeath(state);
    } else if (state.player.hp <= state.player.maxHp * combatCfg.lowHpThreshold) {
      Core.triggerThought('low_health');
    } else {
      Core.triggerThought('damage');
    }
  }

  function sentinelShoot(e, state) {
    if (!state.player || state.player.cloakTurns > 0) return;
    rangedShoot(e, state, aiCfg.sentinelShootRange);
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
          FA.addFloat(ox + e.x * ts + ts / 2, oy + e.y * ts, '!', colors.floatOverclock, 600);
          applyDamageToPlayer(dmg, e.name, state);
          Core.propagateSound(e.x, e.y, aiCfg.soundPropagation.shoot);
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

    // Shoot phase
    rangedShoot(e, state, bossDef.shootRange);

    // Summon phase
    if (e.bossTimer % bossDef.summonInterval === 0 && e.summonCount < bossDef.maxSummons) {
      var entities = state.maps[state.mapId].entities;
      var activeSummons = 0;
      for (var si = 0; si < entities.length; si++) {
        if (entities[si].summoner === e.id) activeSummons++;
      }
      if (activeSummons < bossDef.maxSummons) {
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
          var hpScale = 1 + (depth - 1) * scaleCfg.droneHpScale;
          var atkScale = 1 + (depth - 1) * scaleCfg.droneAtkScale;
          entities.push({
            id: FA.uid(), type: 'enemy', x: spawnPos.x, y: spawnPos.y,
            hp: Math.floor(droneDef.hp * hpScale),
            maxHp: Math.floor(droneDef.hp * hpScale),
            atk: Math.floor(droneDef.atk * atkScale),
            def: droneDef.def + Math.floor((depth - 1) * scaleCfg.droneDefPerDepth),
            char: droneDef.char, color: droneDef.color, name: droneDef.name,
            behavior: droneDef.behavior, stunTurns: 0,
            aiState: 'hunting', alertTarget: { x: state.player.x, y: state.player.y },
            alertTimer: 0, patrolTarget: null,
            summoner: e.id
          });
          e.summonCount++;
          FA.addFloat(ox + e.x * ts + ts / 2, oy + e.y * ts, 'SUMMON', colors.floatBoss, 800);
          Core.propagateSound(e.x, e.y, aiCfg.soundPropagation.ability);
        }
      }
    }

    // Taunt phase
    if (e.bossTimer % bossDef.tauntInterval === 0 && bossDef.taunts && bossDef.taunts.length > 0) {
      var taunt = FA.pick(bossDef.taunts);
      Core.addSystemBubble('> DIRECTOR: ' + taunt, colors.floatBoss);
    }
  }

  function pickupItem(item, idx) {
    var state = FA.getState();
    var L = getLayout();
    var ts = L.ts, ox = L.ox, oy = L.oy;
    var mapData = state.maps[state.mapId];
    if (item.type === 'module' && state.player.modules.length >= combatCfg.moduleSlotLimit) {
      FA.addFloat(ox + item.x * ts + ts / 2, oy + item.y * ts, 'FULL', colors.floatFull, 600);
      return;
    }
    mapData.items.splice(idx, 1);
    FA.emit('item:pickup', { item: item });
    if (item.type === 'gold') {
      state.player.gold += item.value;
      FA.addFloat(ox + state.player.x * ts + ts / 2, oy + state.player.y * ts, '+' + item.value, colors.floatGold, 600);
      Core.triggerThought('pickup_data');
    } else if (item.type === 'potion') {
      var heal = Math.min(item.healAmount, state.player.maxHp - state.player.hp);
      state.player.hp += heal;
      FA.addFloat(ox + state.player.x * ts + ts / 2, oy + state.player.y * ts, '+' + heal, colors.floatHeal, 600);
    } else if (item.type === 'module') {
      state.player.modules.push({ type: item.moduleType, name: item.name, color: item.color });
      FA.addFloat(ox + state.player.x * ts + ts / 2, oy + state.player.y * ts, item.name, item.color, 800);
    }
  }

  function computeEnemyAction(e, state, rooms) {
    var p = state.player;
    if (!p) return { type: 'idle' };
    var dist = Math.abs(e.x - p.x) + Math.abs(e.y - p.y);
    var cloaked = p.cloakTurns > 0;

    if (e.behavior === 'boss') {
      e.aiState = 'hunting';
      e.alertTarget = { x: p.x, y: p.y };
      return { type: 'boss' };
    }

    if (e.curfewDrone) {
      if (dist === 1) return { type: 'attack' };
      return { type: 'chase' };
    }

    var sightRange = aiCfg.sightRange[e.behavior] || aiCfg.sightRange.default;
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
      e.alertTimer = aiCfg.alertTimer;
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
        if (e.behavior === 'tracker' && dist <= aiCfg.flankRange) return { type: 'flank' };
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

  function useModule(slotIdx) {
    var state = FA.getState();
    if (state.screen !== 'playing' || !state.player) return;
    if (slotIdx >= state.player.modules.length) return;
    var L = getLayout();
    var ts = L.ts, ox = L.ox, oy = L.oy;
    var mod = state.player.modules[slotIdx];
    var modDef = FA.lookup('modules', mod.type);
    state.player.modules.splice(slotIdx, 1);
    FA.playSound('module');
    var px = ox + state.player.x * ts + ts / 2, py = oy + state.player.y * ts;
    var mapData = state.maps[state.mapId];
    switch (mod.type) {
      case 'emp':
        var empRange = modDef.range || 5, empStun = modDef.stunTurns || combatCfg.stunTurnsDefault;
        for (var i = 0; i < mapData.entities.length; i++) {
          var e = mapData.entities[i];
          if (e.type !== 'enemy') continue;
          if (Math.abs(e.x - state.player.x) + Math.abs(e.y - state.player.y) <= empRange) {
            e.stunTurns = (e.stunTurns || 0) + empStun;
            FA.addFloat(ox + e.x * ts + ts / 2, oy + e.y * ts, 'STUN', colors.moduleEmp, 800);
          }
        }
        FA.addFloat(px, py, 'EMP', colors.moduleEmp, 800);
        Core.propagateSound(state.player.x, state.player.y, aiCfg.soundPropagation.ability);
        break;
      case 'cloak': state.player.cloakTurns = modDef.turns || 6; FA.addFloat(px, py, 'CLOAK', colors.moduleCloak, 800); break;
      case 'scanner':
        var explored = mapData.explored;
        if (explored) for (var sy = 0; sy < explored.length; sy++) for (var sx = 0; sx < explored[sy].length; sx++) explored[sy][sx] = true;
        FA.addFloat(px, py, 'SCAN', colors.moduleScanner, 800);
        break;
      case 'overclock': state.player.overclockActive = true; FA.addFloat(px, py, 'OC!', colors.moduleOverclock, 800); break;
      case 'firewall': state.player.firewallHp = modDef.hp || 12; FA.addFloat(px, py, 'SHIELD', colors.moduleFirewall, 800); break;
    }
  }

  function hackTerminal(x, y, state) {
    var L = getLayout();
    var ts = L.ts, ox = L.ox, oy = L.oy;
    if (y >= 0 && y < state.map.length && x >= 0 && x < state.map[y].length) state.map[y][x] = TILES.terminalUsed;
    state.mapVersion = (state.mapVersion || 0) + 1;
    FA.playSound('hack');
    state.terminalsHacked = (state.terminalsHacked || 0) + 1;
    var depth = state.depth;
    if (!state.directorMsgShown) state.directorMsgShown = {};
    if (!state.directorMsgShown[depth]) state.directorMsgShown[depth] = 0;
    var dirMsgs = FA.lookup('config', 'director');
    var depthMsgs = dirMsgs ? dirMsgs[depth] : null;
    if (depthMsgs && state.directorMsgShown[depth] < depthMsgs.length) {
      var dirMsg = depthMsgs[state.directorMsgShown[depth]];
      state.directorMsgShown[depth]++;
      if (dirMsg !== '...') Core.addSystemBubble('> "' + dirMsg + '" \u2014 DIRECTOR', colors.floatOverclock);
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
        if (state.player.modules.length < combatCfg.moduleSlotLimit) {
          state.player.modules.push({ type: modType, name: modDef.name, color: modDef.color });
          FA.addFloat(ox + x * ts + ts / 2, oy + y * ts, modDef.name, modDef.color, 1000);
        } else FA.addFloat(ox + x * ts + ts / 2, oy + y * ts, 'FULL', colors.floatFull, 800);
        break;
      case 'reveal':
        var rExplored = mapData.explored;
        if (rExplored) for (var ry = 0; ry < rExplored.length; ry++) for (var rx = 0; rx < rExplored[ry].length; rx++) rExplored[ry][rx] = true;
        FA.addFloat(ox + x * ts + ts / 2, oy + y * ts, 'MAP', colors.moduleMap, 1000);
        break;
      case 'stun':
        var stunDef = FA.lookup('modules', 'emp');
        var stunTurns = stunDef ? stunDef.stunTurns || combatCfg.stunTurnsDefault : combatCfg.stunTurnsDefault;
        for (var si = 0; si < mapData.entities.length; si++)
          if (mapData.entities[si].type === 'enemy') mapData.entities[si].stunTurns = (mapData.entities[si].stunTurns || 0) + stunTurns;
        FA.addFloat(ox + x * ts + ts / 2, oy + y * ts, 'DISRUPT', colors.moduleDisrupt, 1000);
        break;
      case 'intel':
        var intelList = FA.lookup('config', 'terminals').intel;
        Core.addSystemBubble('> ' + FA.pick(intelList), colors.moduleIntel);
        break;
    }
  }

  window.Combat = {
    attack: attackEnemy,
    applyDamage: applyDamageToPlayer,
    enemyTurn: enemyTurn,
    pickup: pickupItem,
    useModule: useModule,
    hackTerminal: hackTerminal
  };
})();
