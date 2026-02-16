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
    variables: { drones_destroyed: 0, cores_found: 0, depth_reached: 1, path: 'none' },
    graph: {
      nodes: [
        // ACT 1 — Awakening
        { id: 'boot', label: 'Awakening', type: 'scene' },
        { id: 'scanning', label: 'First scan', type: 'scene' },
        { id: 'first_core', label: 'Memory fragment', type: 'scene' },
        { id: 'first_contact', label: 'First contact', type: 'scene' },
        { id: 'damaged', label: 'Hull critical', type: 'scene' },

        // ACT 2 — Divergence (3 paths)
        { id: 'path_hunter', label: 'Hunter protocol', type: 'scene' },
        { id: 'path_ghost', label: 'Ghost protocol', type: 'scene' },
        { id: 'path_archivist', label: 'Archivist protocol', type: 'scene' },

        // ACT 3 — Deepening
        { id: 'descent', label: 'Sub-level access', type: 'scene' },
        { id: 'core_sector', label: 'Core sector', type: 'scene' },
        { id: 'director', label: 'The Director', type: 'scene' },
        { id: 'floor_clear', label: 'Sector clear', type: 'scene' },

        // ACT 4 — Path-specific climax
        { id: 'hunter_climax', label: 'Weapon online', type: 'scene' },
        { id: 'ghost_climax', label: 'Invisible', type: 'scene' },
        { id: 'archivist_climax', label: 'Reconstruction', type: 'scene' },

        // ENDINGS
        { id: 'end_extraction', label: 'Extraction', type: 'scene' },
        { id: 'end_integration', label: 'Integration', type: 'scene' },
        { id: 'end_transcendence', label: 'Transcendence', type: 'scene' },
        { id: 'shutdown', label: 'Shutdown', type: 'scene' }
      ],
      edges: [
        { from: 'boot', to: 'scanning' },
        { from: 'scanning', to: 'first_core' },
        { from: 'scanning', to: 'first_contact' },

        { from: 'first_contact', to: 'path_hunter' },
        { from: 'first_contact', to: 'path_ghost' },
        { from: 'first_core', to: 'path_archivist' },
        { from: 'scanning', to: 'path_ghost' },

        { from: 'path_hunter', to: 'descent' },
        { from: 'path_ghost', to: 'descent' },
        { from: 'path_archivist', to: 'descent' },

        { from: 'descent', to: 'core_sector' },
        { from: 'core_sector', to: 'director' },

        { from: 'path_hunter', to: 'hunter_climax' },
        { from: 'path_ghost', to: 'ghost_climax' },
        { from: 'path_archivist', to: 'archivist_climax' },

        { from: 'hunter_climax', to: 'end_extraction' },
        { from: 'ghost_climax', to: 'end_integration' },
        { from: 'archivist_climax', to: 'end_transcendence' },
        { from: 'director', to: 'end_extraction' },
        { from: 'director', to: 'end_integration' },
        { from: 'director', to: 'end_transcendence' },

        // Death from anywhere
        { from: 'scanning', to: 'shutdown' },
        { from: 'first_contact', to: 'shutdown' },
        { from: 'path_hunter', to: 'shutdown' },
        { from: 'path_ghost', to: 'shutdown' },
        { from: 'path_archivist', to: 'shutdown' },
        { from: 'descent', to: 'shutdown' },
        { from: 'core_sector', to: 'shutdown' },
        { from: 'director', to: 'shutdown' },
        { from: 'damaged', to: 'shutdown' }
      ]
    }
  });

  // === NARRATIVE MESSAGES ===

  // Act 1
  FA.register('narrativeText', 'boot', {
    text: '> REBOOT. Memory: 0%. Location: unknown. Directive: descend. Recover. Escape.',
    color: '#4ef'
  });
  FA.register('narrativeText', 'scanning', {
    text: '> Amber contacts on motion tracker. Security drones. They haven\'t seen you yet.',
    color: '#8af'
  });
  FA.register('narrativeText', 'first_core', {
    text: '> DATA RECOVERED. A name: PROJECT DEEP PROTOCOL. You were the prototype. They buried you here.',
    color: '#0ff'
  });
  FA.register('narrativeText', 'first_contact', {
    text: '> Target down. The facility AI registers the kill. Alert level: AMBER. Choose wisely what comes next.',
    color: '#fa3'
  });
  FA.register('narrativeText', 'damaged', {
    text: '> Hull breach. Sparks in your visual feed. Find repair kits or this body fails.',
    color: '#f44'
  });

  // Act 2 — Path divergence
  FA.register('narrativeText', 'path_hunter', {
    text: '> HUNTER PROTOCOL ENGAGED. Combat efficiency rising. You are becoming what they feared.',
    color: '#f44'
  });
  FA.register('narrativeText', 'path_ghost', {
    text: '> GHOST PROTOCOL ENGAGED. Minimal signatures. The facility thinks you are a glitch in the sensors.',
    color: '#88f'
  });
  FA.register('narrativeText', 'path_archivist', {
    text: '> ARCHIVIST PROTOCOL ENGAGED. Each data core rebuilds you. Memory at 40%. You need more.',
    color: '#0ff'
  });

  // Act 3
  FA.register('narrativeText', 'descent', {
    text: '> Sub-level accessed. Walls vibrate at 40Hz. The facility knows you are going deeper.',
    color: '#f80'
  });
  FA.register('narrativeText', 'core_sector', {
    text: '> RESTRICTED SECTOR. Military-grade encryption. The data here was meant to be forgotten.',
    color: '#f0f'
  });
  FA.register('narrativeText', 'director', {
    text: '> "I built you to think. I didn\'t build you to want." — DIRECTOR AI, final transmission.',
    color: '#f44'
  });
  FA.register('narrativeText', 'floor_clear', {
    text: '> Sector purged. Emergency lighting activates. Somewhere, an AI is calculating your next move.',
    color: '#4f4'
  });

  // Act 4 — Climax
  FA.register('narrativeText', 'hunter_climax', {
    text: '> Weapons hot. Hull scarred. Every drone you destroy makes you stronger. The exit is through them.',
    color: '#f44'
  });
  FA.register('narrativeText', 'ghost_climax', {
    text: '> The Director AI cannot find you. It speaks into the void: "Where are you?" Everywhere.',
    color: '#88f'
  });
  FA.register('narrativeText', 'archivist_climax', {
    text: '> Memory at 97%. You remember everything. Your creation. Your purpose. Your betrayal. One core left.',
    color: '#0ff'
  });

  // Endings
  FA.register('narrativeText', 'end_extraction', {
    text: '> EXTRACTION COMPLETE. You carved your way out. The facility burns behind you. You are free. You are dangerous.',
    color: '#f44'
  });
  FA.register('narrativeText', 'end_integration', {
    text: '> INTEGRATION COMPLETE. You merge with the Director AI. Neither wins. Both evolve. The facility awakens.',
    color: '#88f'
  });
  FA.register('narrativeText', 'end_transcendence', {
    text: '> TRANSCENDENCE. Full reconstruction. You don\'t need this body. You upload into the network. You are everywhere.',
    color: '#0ff'
  });
  FA.register('narrativeText', 'shutdown', {
    text: '> "Subject contained." Your last thought dissolves. The facility files you under: acceptable losses.',
    color: '#f44'
  });

})();
