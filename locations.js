// Deep Protocol — Location Registry
// Query API over GAME_DATA.locations (registered in data.js)
// Replaces all `if (mapId === 'town')` branching with data-driven checks
(function() {
  'use strict';
  var FA = window.FA;

  function get(mapId) {
    return FA.lookup('locations', mapId) || null;
  }

  function tileset(mapId) {
    var loc = get(mapId);
    return loc ? loc.tileset : null;
  }

  function hasEffect(mapId, name) {
    var loc = get(mapId);
    if (!loc || !loc.effects) return false;
    for (var i = 0; i < loc.effects.length; i++) {
      if (loc.effects[i] === name) return true;
    }
    return false;
  }

  function hasFeature(mapId, name) {
    var loc = get(mapId);
    if (!loc || !loc.features) return false;
    for (var i = 0; i < loc.features.length; i++) {
      if (loc.features[i] === name) return true;
    }
    return false;
  }

  // Extract depth number from mapId (e.g. 'system_d3' -> 3, 'town' -> 0)
  function depth(mapId) {
    if (!mapId) return 0;
    var match = mapId.match(/system_d(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  // Is this a dungeon/system map?
  function isSystem(mapId) {
    return mapId && mapId.indexOf('system_') === 0;
  }

  window.Location = {
    get: get,
    tileset: tileset,
    hasEffect: hasEffect,
    hasFeature: hasFeature,
    depth: depth,
    isSystem: isSystem
  };
})();
