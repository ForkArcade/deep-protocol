// Roguelike — Data
(function() {
  'use strict';
  var FA = window.FA;

  FA.register('config', 'game', {
    cols: 40, rows: 25,
    tileSize: 20,
    canvasWidth: 800,
    canvasHeight: 600,
    maxDepth: 5,
    roomAttempts: 30,
    roomMinSize: 4,
    roomMaxSize: 9
  });

  FA.register('config', 'colors', {
    bg: '#0d0b1a', wall: '#1e1638', floor: '#201c3a',
    player: '#4ef', enemy: '#f66', gold: '#fd4', potion: '#4f4',
    stairsDown: '#f80', stairsUp: '#4cf',
    text: '#ddd', dim: '#777', narrative: '#c8b4ff'
  });

  FA.register('config', 'scoring', {
    killMultiplier: 100,
    goldMultiplier: 10,
    depthBonus: 500
  });

  // === ENEMIES ===
  FA.register('enemies', 'rat', {
    name: 'Rat', char: 'r', color: '#f66',
    hp: 6, atk: 3, def: 0, xp: 10, behavior: 'chase'
  });

  // === ITEMS ===
  FA.register('items', 'gold', {
    name: 'Gold', type: 'gold', char: '$', color: '#fd4', value: 10
  });

  FA.register('items', 'potion', {
    name: 'Potion', type: 'potion', char: '!', color: '#4f4', healAmount: 8
  });

  // === BEHAVIORS ===
  FA.register('behaviors', 'chase', {
    act: function(entity, state) {
      var dx = 0, dy = 0;
      var p = state.player;
      if (Math.abs(p.x - entity.x) + Math.abs(p.y - entity.y) <= 6) {
        dx = p.x > entity.x ? 1 : (p.x < entity.x ? -1 : 0);
        dy = p.y > entity.y ? 1 : (p.y < entity.y ? -1 : 0);
        if (dx !== 0 && dy !== 0) {
          if (FA.rand(0, 1) === 0) dx = 0; else dy = 0;
        }
      } else {
        var dirs = [[1,0],[-1,0],[0,1],[0,-1]];
        var d = FA.pick(dirs);
        dx = d[0]; dy = d[1];
      }
      return { type: 'move', dx: dx, dy: dy };
    }
  });

  // === NARRATIVE ===
  FA.register('config', 'narrative', {
    startNode: 'entrance',
    variables: { rats_killed: 0, gold_found: 0, depth_reached: 1 },
    graph: {
      nodes: [
        { id: 'entrance', label: 'Dungeon entrance', type: 'scene' },
        { id: 'exploring', label: 'Exploring', type: 'scene' },
        { id: 'first_blood', label: 'First blood', type: 'scene' },
        { id: 'descent', label: 'Going deeper', type: 'scene' },
        { id: 'hunter', label: 'Rat hunter', type: 'scene' },
        { id: 'deep_dungeon', label: 'Deep dungeon', type: 'scene' },
        { id: 'victory', label: 'Victory', type: 'scene' },
        { id: 'death', label: 'Hero death', type: 'scene' }
      ],
      edges: [
        { from: 'entrance', to: 'exploring' },
        { from: 'exploring', to: 'first_blood' },
        { from: 'exploring', to: 'descent' },
        { from: 'first_blood', to: 'hunter' },
        { from: 'first_blood', to: 'descent' },
        { from: 'descent', to: 'deep_dungeon' },
        { from: 'hunter', to: 'victory' },
        { from: 'deep_dungeon', to: 'victory' },
        { from: 'exploring', to: 'death' },
        { from: 'first_blood', to: 'death' },
        { from: 'hunter', to: 'death' },
        { from: 'descent', to: 'death' },
        { from: 'deep_dungeon', to: 'death' }
      ]
    }
  });

  // === NARRATIVE MESSAGES ===
  FA.register('narrativeText', 'entrance', {
    text: 'A cold gust hits your face. You enter the dark dungeon...',
    color: '#c8b4ff'
  });
  FA.register('narrativeText', 'exploring', {
    text: 'You hear rats squeaking in the darkness. They are everywhere.',
    color: '#c8b4ff'
  });
  FA.register('narrativeText', 'first_blood', {
    text: 'The first rat falls. The others become more aggressive!',
    color: '#ffa'
  });
  FA.register('narrativeText', 'descent', {
    text: 'Stairs lead deeper into the earth. The air grows colder.',
    color: '#f80'
  });
  FA.register('narrativeText', 'hunter', {
    text: 'You are the hunter. Rats flee before you, but there is nowhere to hide.',
    color: '#ffa'
  });
  FA.register('narrativeText', 'deep_dungeon', {
    text: 'The walls pulse with an eerie glow. Something ancient lurks below.',
    color: '#f0f'
  });
  FA.register('narrativeText', 'victory', {
    text: 'Silence. The dungeon is yours. Gold gleams in the dark.',
    color: '#4f4'
  });
  FA.register('narrativeText', 'death', {
    text: 'Darkness swallows you. The dungeon claims another adventurer...',
    color: '#f44'
  });

})();
