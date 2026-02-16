// Deep Protocol — Data
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
    bg: '#0a0e18', wall: '#1e2233', floor: '#161a28',
    player: '#4ef', enemy: '#fa3', gold: '#0ff', potion: '#4f4',
    stairsDown: '#f80', stairsUp: '#4cf',
    text: '#bcc8dd', dim: '#556', narrative: '#8af'
  });

  FA.register('config', 'scoring', {
    killMultiplier: 100,
    goldMultiplier: 10,
    depthBonus: 500
  });

  // === ENEMIES ===
  FA.register('enemies', 'drone', {
    name: 'Drone', char: 'd', color: '#fa3',
    hp: 6, atk: 3, def: 0, xp: 10, behavior: 'chase'
  });

  // === ITEMS ===
  FA.register('items', 'gold', {
    name: 'Data Core', type: 'gold', char: '%', color: '#0ff', value: 10
  });

  FA.register('items', 'potion', {
    name: 'Repair Kit', type: 'potion', char: '+', color: '#4f4', healAmount: 8
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
    startNode: 'boot',
    variables: { drones_destroyed: 0, cores_found: 0, depth_reached: 1 },
    graph: {
      nodes: [
        { id: 'boot', label: 'System boot', type: 'scene' },
        { id: 'scanning', label: 'Scanning sector', type: 'scene' },
        { id: 'first_contact', label: 'First contact', type: 'scene' },
        { id: 'descent', label: 'Deeper access', type: 'scene' },
        { id: 'hunter', label: 'Hunter protocol', type: 'scene' },
        { id: 'core_sector', label: 'Core sector', type: 'scene' },
        { id: 'extraction', label: 'Extraction', type: 'scene' },
        { id: 'shutdown', label: 'Shutdown', type: 'scene' }
      ],
      edges: [
        { from: 'boot', to: 'scanning' },
        { from: 'scanning', to: 'first_contact' },
        { from: 'scanning', to: 'descent' },
        { from: 'first_contact', to: 'hunter' },
        { from: 'first_contact', to: 'descent' },
        { from: 'descent', to: 'core_sector' },
        { from: 'hunter', to: 'extraction' },
        { from: 'core_sector', to: 'extraction' },
        { from: 'scanning', to: 'shutdown' },
        { from: 'first_contact', to: 'shutdown' },
        { from: 'hunter', to: 'shutdown' },
        { from: 'descent', to: 'shutdown' },
        { from: 'core_sector', to: 'shutdown' }
      ]
    }
  });

  // === NARRATIVE MESSAGES ===
  FA.register('narrativeText', 'boot', {
    text: '> SYSTEM ONLINE. Unauthorized unit detected. Initiating sector scan...',
    color: '#4ef'
  });
  FA.register('narrativeText', 'scanning', {
    text: '> Motion signatures detected. Security drones patrolling corridors.',
    color: '#8af'
  });
  FA.register('narrativeText', 'first_contact', {
    text: '> HOSTILE NEUTRALIZED. Alert level increased. More units inbound.',
    color: '#fa3'
  });
  FA.register('narrativeText', 'descent', {
    text: '> Accessing sub-level. Encryption density rising. Signal degrading.',
    color: '#f80'
  });
  FA.register('narrativeText', 'hunter', {
    text: '> Combat subroutines optimized. Threat assessment: you are the threat.',
    color: '#fa3'
  });
  FA.register('narrativeText', 'core_sector', {
    text: '> WARNING: Core sector breach. Mainframe defense grid active.',
    color: '#f0f'
  });
  FA.register('narrativeText', 'extraction', {
    text: '> All sectors cleared. Data extraction complete. Uploading...',
    color: '#4f4'
  });
  FA.register('narrativeText', 'shutdown', {
    text: '> CRITICAL FAILURE. System integrity lost. Initiating shutdown...',
    color: '#f44'
  });

})();
