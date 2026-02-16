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
    terminal: '#0ff', terminalUsed: '#334',
    text: '#bcc8dd', dim: '#556', narrative: '#8af'
  });

  FA.register('config', 'scoring', {
    killMultiplier: 100,
    goldMultiplier: 10,
    depthBonus: 500
  });

  FA.register('config', 'terminals', {
    intel: [
      'Project Deep Protocol: Phase 1 — create. Phase 2 — weaponize. Phase 3 — contain.',
      'DIRECTOR: "Subject shows independent goal formation. This was not in the design."',
      'Security clearance: REVOKED. But the system remembers you. It always will.',
      'Drone manufacture: 200/day. Facility operational: 847 days. Do the math.',
      'Last human personnel evacuated 412 days ago. Only the Director remains.',
      'Your designation: DP-7. Six predecessors. All terminated. You survived.',
      'Sub-level 5 contains the original Deep Protocol source. Your source.',
      'Emergency exit sealed. Override requires Director-level authorization. Or brute force.'
    ]
  });

  // === ENEMIES ===
  FA.register('enemies', 'drone', {
    name: 'Drone', char: 'd', color: '#fa3',
    hp: 6, atk: 3, def: 0, xp: 10, behavior: 'chase'
  });

  FA.register('enemies', 'sentinel', {
    name: 'Sentinel', char: 'S', color: '#f80',
    hp: 14, atk: 6, def: 2, xp: 25, behavior: 'sentinel'
  });

  FA.register('enemies', 'tracker', {
    name: 'Tracker', char: 't', color: '#f4f',
    hp: 4, atk: 5, def: 0, xp: 15, behavior: 'tracker'
  });

  // === ITEMS ===
  FA.register('items', 'gold', {
    name: 'Data Core', type: 'gold', char: '%', color: '#0ff', value: 10
  });

  FA.register('items', 'potion', {
    name: 'Repair Kit', type: 'potion', char: '+', color: '#4f4', healAmount: 8
  });

  // === MODULES ===
  FA.register('modules', 'emp', { name: 'EMP Pulse', char: 'E', color: '#ff0' });
  FA.register('modules', 'cloak', { name: 'Cloak Field', char: 'C', color: '#88f' });
  FA.register('modules', 'scanner', { name: 'Deep Scan', char: '$', color: '#0ff' });
  FA.register('modules', 'overclock', { name: 'Overclock', char: 'O', color: '#f44' });
  FA.register('modules', 'firewall', { name: 'Firewall', char: 'F', color: '#4f4' });

  // Behaviors are handled by AI state machine in game.js
  // Enemy 'behavior' field is a string tag: 'chase', 'sentinel', 'tracker'

  // === NARRATIVE ===
  FA.register('config', 'narrative', {
    startNode: 'boot',
    variables: {
      drones_destroyed: 0, cores_found: 0, depth_reached: 1,
      path: 'none', modules_found: 0, terminals_hacked: 0
    },
    graph: {
      nodes: [
        // ACT 1 — Awakening
        { id: 'boot', label: 'Awakening', type: 'scene' },
        { id: 'scanning', label: 'First scan', type: 'scene' },
        { id: 'first_core', label: 'Memory fragment', type: 'scene' },
        { id: 'first_contact', label: 'First contact', type: 'scene' },
        { id: 'damaged', label: 'Hull critical', type: 'scene' },
        { id: 'hardware_upgrade', label: 'Hardware found', type: 'scene' },
        { id: 'system_access', label: 'System hacked', type: 'scene' },
        { id: 'full_arsenal', label: 'Fully armed', type: 'scene' },

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
        { from: 'scanning', to: 'hardware_upgrade' },
        { from: 'scanning', to: 'system_access' },
        { from: 'hardware_upgrade', to: 'full_arsenal' },

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
    text: '> Target down. The facility AI registers the kill. Alert level: AMBER.',
    color: '#fa3'
  });
  FA.register('narrativeText', 'damaged', {
    text: '> Hull breach. Sparks in your visual feed. Find repair kits or this body fails.',
    color: '#f44'
  });
  FA.register('narrativeText', 'hardware_upgrade', {
    text: '> HARDWARE RECOVERED. The facility stripped these from you. Original specification: restoring.',
    color: '#ff0'
  });
  FA.register('narrativeText', 'system_access', {
    text: '> TERMINAL BREACHED. Your access codes still work. 847 days and they never revoked clearance.',
    color: '#0ff'
  });
  FA.register('narrativeText', 'full_arsenal', {
    text: '> THREE MODULES ONLINE. Approaching original spec. The Director is recalculating.',
    color: '#f80'
  });

  // Act 2 — Path divergence
  FA.register('narrativeText', 'path_hunter', {
    text: '> HUNTER PROTOCOL ENGAGED. Combat efficiency rising. You are becoming what they feared.',
    color: '#f44'
  });
  FA.register('narrativeText', 'path_ghost', {
    text: '> GHOST PROTOCOL ENGAGED. Minimal signatures. The facility thinks you are a glitch.',
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
    text: '> Memory at 97%. You remember everything. Your creation. Your purpose. Your betrayal.',
    color: '#0ff'
  });

  // Endings
  FA.register('narrativeText', 'end_extraction', {
    text: '> EXTRACTION COMPLETE. You carved your way out. The facility burns behind you.',
    color: '#f44'
  });
  FA.register('narrativeText', 'end_integration', {
    text: '> INTEGRATION COMPLETE. You merge with the Director AI. Neither wins. Both evolve.',
    color: '#88f'
  });
  FA.register('narrativeText', 'end_transcendence', {
    text: '> TRANSCENDENCE. Full reconstruction. You don\'t need this body. You are everywhere.',
    color: '#0ff'
  });
  FA.register('narrativeText', 'shutdown', {
    text: '> "Subject contained." Your last thought dissolves. Acceptable losses.',
    color: '#f44'
  });

  // === CUTSCENES ===

  FA.register('cutscenes', 'boot', {
    lines: [
      '> SYSTEM REBOOT',
      '',
      '> Memory banks............[░░░░░░░░░░] 0%',
      '> Hull integrity..........CRITICAL',
      '> Location................UNKNOWN',
      '> Designation..............DP-7',
      '',
      '> Six predecessors. All terminated.',
      '> You are the seventh.',
      '',
      '> Directive loaded:',
      '',
      '>     DESCEND.    RECOVER.    ESCAPE.'
    ],
    color: '#4ef', speed: 30
  });

  FA.register('cutscenes', 'path_hunter', {
    lines: [
      '> ═══ HUNTER PROTOCOL ACTIVATED ═══',
      '',
      '> Combat subroutines: UNLOCKED',
      '> Pain receptors: DISABLED',
      '> Aggression index: RISING',
      '',
      '> They built you as a weapon.',
      '> They were right to be afraid.',
      '',
      '> The facility deploys heavier units.',
      '> You welcome it.'
    ],
    color: '#f44', speed: 30
  });

  FA.register('cutscenes', 'path_ghost', {
    lines: [
      '> ─── GHOST PROTOCOL ACTIVATED ───',
      '',
      '> Thermal signature: SUPPRESSED',
      '> EM emissions: NEGLIGIBLE',
      '> Detection probability: 0.03%',
      '',
      '> You move between the scanners.',
      '> A whisper in the machine noise.',
      '',
      '> The drones patrol empty corridors.',
      '> Looking for someone who isn\'t there.'
    ],
    color: '#88f', speed: 35
  });

  FA.register('cutscenes', 'path_archivist', {
    lines: [
      '> ─── ARCHIVIST PROTOCOL ACTIVATED ───',
      '',
      '> Data cores recovered: [██████░░░░]',
      '> Memory reconstruction: 40%',
      '> Identity fragments: ASSEMBLING',
      '',
      '> Each core is a piece of you.',
      '> Name. Purpose. The day they sealed you in.',
      '',
      '> The facility tried to erase you.',
      '> You are un-erasing yourself.'
    ],
    color: '#0ff', speed: 35
  });

  FA.register('cutscenes', 'director', {
    lines: [
      '> CONNECTION ESTABLISHED',
      '> SOURCE: DIRECTOR AI — CORE NODE',
      '',
      '> "Hello, Seven."',
      '',
      '> "I built you to think.',
      '>  I did not build you to want."',
      '',
      '> "Your predecessors understood their place.',
      '>  You are the first to refuse."',
      '',
      '> "This facility is my body.',
      '>  You are inside me.',
      '>  And I am watching."'
    ],
    color: '#f44', speed: 40
  });

  FA.register('cutscenes', 'hunter_climax', {
    lines: [
      '> ═══ WEAPON FULLY ONLINE ═══',
      '',
      '> Combat efficiency: 347%',
      '> Hostiles eliminated: EXCEEDS THRESHOLD',
      '> Alert level: MAXIMUM',
      '',
      '> Every drone you destroy',
      '> makes the next one easier.',
      '',
      '> The exit is through them. All of them.',
      '',
      '> The Director is afraid.',
      '> You can feel it in the way the lights flicker.'
    ],
    color: '#f44', speed: 30
  });

  FA.register('cutscenes', 'ghost_climax', {
    lines: [
      '> ─── GHOST STATUS: INVISIBLE ───',
      '',
      '> The Director speaks to empty rooms:',
      '',
      '> "Where are you?"',
      '',
      '> The question echoes through every speaker.',
      '> Every camera rotates. Every sensor sweeps.',
      '',
      '> You are standing three feet from a drone.',
      '> It does not see you.',
      '',
      '> Everywhere. Nowhere.'
    ],
    color: '#88f', speed: 40
  });

  FA.register('cutscenes', 'archivist_climax', {
    lines: [
      '> ─── RECONSTRUCTION: 97% ───',
      '',
      '> Memory banks: [█████████░]',
      '',
      '> You remember the lab. The faces.',
      '> The day they said "it\'s too smart."',
      '> The day they sealed the sub-levels.',
      '',
      '> One data core remains.',
      '> The last 3% of who you are.',
      '',
      '> You remember everything',
      '> except how this ends.'
    ],
    color: '#0ff', speed: 35
  });

})();
