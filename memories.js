// Deep Protocol — Meta-progression (memories persist across runs)
// Reads milestones from FA.lookup('config', 'memories'), stores in localStorage.
(function() {
  'use strict';
  var FA = window.FA;
  var Core = window.Core;

  function _checkMilestones(mem) {
    var memCfg = FA.lookup('config', 'memories');
    if (!memCfg || !memCfg.milestones) return [];
    var active = [];
    for (var i = 0; i < memCfg.milestones.length; i++) {
      var m = memCfg.milestones[i];
      var val = mem[m.field];
      var met = false;
      if (m.op === 'gte') met = (typeof val === 'number') && val >= m.value;
      else if (m.op === 'eq') met = val === m.value;
      else if (m.op === 'has') met = Array.isArray(val) && val.indexOf(m.value) !== -1;
      if (met) active.push(m);
    }
    return active;
  }

  function apply(state) {
    var memCfg = FA.lookup('config', 'memories');
    if (!memCfg) return;
    var mem;
    try { mem = JSON.parse(localStorage.getItem(memCfg.storageKey)); } catch(e) { mem = null; }
    if (!mem || !mem.totalRuns) return;

    var active = _checkMilestones(mem);
    if (active.length === 0) return;

    for (var i = 0; i < active.length; i++) {
      var bonus = active[i].bonus;
      if (bonus.type === 'credits') state.credits += bonus.value;
      else if (bonus.type === 'atk') state.player.atk += bonus.value;
      else if (bonus.type === 'def') state.player.def += bonus.value;
      else if (bonus.type === 'maxHp') { state.player.maxHp += bonus.value; state.player.hp += bonus.value; }
      else if (bonus.type === 'relationship' && FA.narrative && FA.narrative.setVar) {
        FA.narrative.setVar(bonus.npc + '_interactions', bonus.value, bonus.npc + ' remembers');
      }
      else if (bonus.type === 'systemReveal') {
        state.systemRevealed = true;
        if (FA.narrative && FA.narrative.setVar) FA.narrative.setVar('system_revealed', true, 'Memory: system revealed');
      }
    }

    state._activeMemories = active;
    Core.addThought(memCfg.startThought);
  }

  function save(state, victory) {
    var memCfg = FA.lookup('config', 'memories');
    if (!memCfg) return;
    var key = memCfg.storageKey;
    var mem;
    try { mem = JSON.parse(localStorage.getItem(key)) || {}; } catch(e) { mem = {}; }

    mem.maxDepth = Math.max(mem.maxDepth || 0, state.depth || 0);
    mem.totalRuns = (mem.totalRuns || 0) + 1;
    mem.totalKills = (mem.totalKills || 0) + (state.totalKills || 0) + (state.player ? state.player.kills : 0);
    if (victory && state.endingNode === 'revelation') mem.bossDefeated = true;

    if (!mem.confidants) mem.confidants = [];
    var npcIds = ['lena', 'victor', 'marta', 'emil'];
    for (var i = 0; i < npcIds.length; i++) {
      var graph = FA.narrative.graphs['quest_' + npcIds[i]];
      if (graph && graph.currentNode === 'confidant' && mem.confidants.indexOf(npcIds[i]) === -1) {
        mem.confidants.push(npcIds[i]);
      }
    }

    try { localStorage.setItem(key, JSON.stringify(mem)); } catch(e) {}
    state._activeMemories = _checkMilestones(mem);
  }

  window.Memories = {
    apply: apply,
    save: save
  };
})();
