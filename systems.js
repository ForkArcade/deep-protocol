// Deep Protocol — Module & Terminal Systems
// Extracted from game.js.
(function() {
  'use strict';
  var FA = window.FA;
  var Core = window.Core;
  var cfg = FA.lookup('config', 'game');
  var ts = cfg.tileSize;

  var EMP_RANGE = 5;
  var EMP_STUN_TURNS = 3;
  var CLOAK_TURNS = 6;
  var FIREWALL_HP = 12;

  // ============================================================
  //  MODULES
  // ============================================================

  function useModule(slotIdx) {
    var state = FA.getState();
    if (state.screen !== 'playing' || !state.player) return;
    if (slotIdx >= state.player.modules.length) return;

    var mod = state.player.modules[slotIdx];
    state.player.modules.splice(slotIdx, 1);
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
  }

  // ============================================================
  //  TERMINALS
  // ============================================================

  function hackTerminal(x, y, state) {
    state.map[y][x] = 5;
    state.mapVersion = (state.mapVersion || 0) + 1;
    state.terminalsHacked = (state.terminalsHacked || 0) + 1;
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

  window.Systems = {
    useModule: useModule,
    hackTerminal: hackTerminal
  };
})();
