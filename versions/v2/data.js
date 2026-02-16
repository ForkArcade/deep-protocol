// Roguelike — Data
(function() {
  'use strict';
  var FA = window.FA;

  FA.register('config', 'game', {
    cols: 40, rows: 25,
    tileSize: 20,
    canvasWidth: 800,
    canvasHeight: 600
  });

  FA.register('config', 'colors', {
    bg: '#0d0b1a', wall: '#1e1638', floor: '#201c3a',
    player: '#4ef', enemy: '#f66', gold: '#fd4', potion: '#4f4',
    text: '#ddd', dim: '#777', narrative: '#c8b4ff'
  });

  FA.register('config', 'scoring', {
    killMultiplier: 100,
    goldMultiplier: 10
  });

  // === ENEMIES ===
  FA.register('enemies', 'rat', {
    name: 'Szczur', char: 'r', color: '#f66',
    hp: 6, atk: 3, def: 0, xp: 10, behavior: 'chase'
  });

  // === ITEMS ===
  FA.register('items', 'gold', {
    name: 'Zloto', type: 'gold', char: '$', color: '#fd4', value: 10
  });

  FA.register('items', 'potion', {
    name: 'Mikstura', type: 'potion', char: '!', color: '#4f4', healAmount: 8
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
    variables: { rats_killed: 0, gold_found: 0 },
    graph: {
      nodes: [
        { id: 'entrance', label: 'Wejscie do lochu', type: 'scene' },
        { id: 'exploring', label: 'Eksploracja', type: 'scene' },
        { id: 'first_blood', label: 'Pierwsza krew', type: 'scene' },
        { id: 'hunter', label: 'Lowca szczurow', type: 'scene' },
        { id: 'victory', label: 'Zwyciestwo', type: 'scene' },
        { id: 'death', label: 'Smierc bohatera', type: 'scene' }
      ],
      edges: [
        { from: 'entrance', to: 'exploring' },
        { from: 'exploring', to: 'first_blood' },
        { from: 'first_blood', to: 'hunter' },
        { from: 'hunter', to: 'victory' },
        { from: 'exploring', to: 'death' },
        { from: 'first_blood', to: 'death' },
        { from: 'hunter', to: 'death' }
      ]
    }
  });

  // === NARRATIVE MESSAGES (shown in-game) ===
  FA.register('narrativeText', 'entrance', {
    text: 'Zimny podmuch wiatru uderza w twoja twarz. Wchodzisz do ciemnego lochu...',
    color: '#c8b4ff'
  });
  FA.register('narrativeText', 'exploring', {
    text: 'Slyszysz pisk szczurow w ciemnosci. Sa wszedzie.',
    color: '#c8b4ff'
  });
  FA.register('narrativeText', 'first_blood', {
    text: 'Pierwszy szczur pada. Pozostale staja sie bardziej agresywne!',
    color: '#ffa'
  });
  FA.register('narrativeText', 'hunter', {
    text: 'Jestes lowca. Szczury uciekaja przed toba, ale nie maja dokad.',
    color: '#ffa'
  });
  FA.register('narrativeText', 'victory', {
    text: 'Cisza. Loch jest twoj. Zloto blyszczy w mroku.',
    color: '#4f4'
  });
  FA.register('narrativeText', 'death', {
    text: 'Ciemnosc pochlanla cie. Loch pochlonil kolejnego smialka...',
    color: '#f44'
  });

})();
