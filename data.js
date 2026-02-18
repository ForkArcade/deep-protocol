// Deep Protocol — Data (Kafka Redesign)
(function() {
  'use strict';
  var FA = window.FA;

  // === CORE CONFIG ===
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
    bg: '#0a0e18',
    // Overworld
    owWall: '#2a2520', owFloor: '#1a1814', owPath: '#14120f',
    owCafe: '#1e1610', owBed: '#1a1828', owWork: '#0a1a1a',
    owDoor: '#332a20',
    // System (dungeon)
    wall: '#1e2233', floor: '#161a28',
    player: '#4ef', enemy: '#fa3', gold: '#0ff', potion: '#4f4',
    stairsDown: '#f80', stairsUp: '#4cf',
    terminal: '#0ff', terminalUsed: '#334',
    // UI
    text: '#bcc8dd', dim: '#556', narrative: '#8af',
    credits: '#fd0', rent: '#f44', time: '#8af'
  });

  FA.register('config', 'scoring', {
    killMultiplier: 100,
    goldMultiplier: 10,
    depthBonus: 500,
    dayBonus: 50
  });

  // === TIME & ECONOMY ===
  FA.register('config', 'time', {
    turnsPerDay: 60,
    warningTime: 40,    // sky darkens
    curfewTime: 52,     // final warning + drones
    workTurns: 10,
    systemTimeCost: 30  // turns consumed by system visit
  });

  FA.register('config', 'economy', {
    startCredits: 80,
    workPay: 50,
    baseRent: 30,
    rentIncrease: 5,    // per day — Kafka: the system tightens
    ejectionPenalty: 40, // credits lost when ejected from system
    systemRevealDay: 3, // day when system entrance appears
    curfewDrones: 6     // number of drones during curfew
  });

  // === DUNGEON TILES ===
  // Tile IDs used in procedurally generated dungeon floors
  FA.register('config', 'dungeonTiles', {
    floor: 0,
    wall: 1,
    stairsUp: 3,
    terminal: 4,
    terminalUsed: 5,
    blocking: 9      // collision placeholder for blocking objects
  });

  // === OVERWORLD MAP ===
  // Map data now lives in _maps.json / maps.js (MAP_DEFS global)
  // Tiles: 0=floor 1=wall 2=indoor 3=garden 4=sidewalk
  // Objects (in _maps.json, category 'objects'): bed, terminal, notice_board, system_entrance, cafe_table

  // === NPCs ===
  // allegiance is randomized at game start: 2 ally, 1 traitor, 1 neutral

  FA.register('npcs', 'lena', {
    name: 'Lena', char: '@', color: '#f8d',
    homePos: { x: 23, y: 1 },
    cafePos: { x: 28, y: 6 },
    terminalPos: { x: 18, y: 17 },
    gardenPos: { x: 24, y: 13 },
    appearsDay: 1, pace: 1, systemMinDepth: 1,
    systemDialogue: {
      ally: 'This corridor is clear. I checked. Follow me.',
      traitor: 'I think the exit is this way. Come on, hurry.',
      neutral: 'I don\'t know this place any better than you do.'
    }
  });

  FA.register('npcs', 'victor', {
    name: 'Victor', char: '@', color: '#fa4',
    homePos: { x: 4, y: 9 },
    cafePos: { x: 30, y: 8 },
    terminalPos: { x: 21, y: 17 },
    gardenPos: { x: 24, y: 12 },
    appearsDay: 2, pace: 2, systemMinDepth: 2,
    systemDialogue: {
      ally: 'There\'s a terminal two rooms east. It has what you need.',
      traitor: 'Trust me — go left here. I\'ve been this way before.',
      neutral: 'I\'ve seen this layout before. Or something like it. Hard to tell down here.'
    }
  });

  FA.register('npcs', 'marta', {
    name: 'Marta', char: '@', color: '#8cf',
    homePos: { x: 4, y: 5 },
    cafePos: { x: 28, y: 8 },
    terminalPos: { x: 18, y: 17 },
    gardenPos: { x: 25, y: 14 },
    appearsDay: 1, pace: 1, systemMinDepth: 2,
    systemDialogue: {
      ally: 'Security clearance granted for this sector. Move quickly.',
      traitor: 'This area is restricted. You\'ll need to find another route. Sorry.',
      neutral: 'I process data. I don\'t interpret it. That distinction matters less each day.'
    }
  });

  FA.register('npcs', 'emil', {
    name: 'Emil', char: '@', color: '#a8f',
    homePos: { x: 4, y: 12 },
    cafePos: { x: 30, y: 6 },
    terminalPos: { x: 21, y: 17 },
    gardenPos: { x: 23, y: 13 },
    appearsDay: 3, pace: 3, systemMinDepth: 3,
    systemDialogue: {
      ally: 'The source is below. Everything you need to know is there. Everything.',
      traitor: 'Keep going deeper. That\'s what it wants. That\'s what you want. Is there a difference?',
      neutral: 'I\'ve been here longer than you think. Longer than I think.'
    }
  });

  // === NPC BEHAVIORS (narrative-driven — FA.select, first match wins) ===
  // schedule: { morning: goal, midday: goal, evening: goal }
  // goals: home, cafe, terminal, garden, player, wander

  FA.register('behaviors', 'lena', [
    { node: 'quest_lena:confidant', schedule: { morning: 'player', midday: 'player', evening: 'cafe' } },
    { node: 'arc:deeper', schedule: { morning: 'garden', midday: 'cafe', evening: 'home' } },
    { node: 'arc:first_system', schedule: { morning: 'home', midday: 'player', evening: 'home' } },
    { schedule: { morning: 'home', midday: 'cafe', evening: 'home' } }
  ]);

  FA.register('behaviors', 'victor', [
    { node: 'quest_victor:confidant', schedule: { morning: 'terminal', midday: 'player', evening: 'cafe' } },
    { node: 'arc:deeper', schedule: { morning: 'garden', midday: 'cafe', evening: 'cafe' } },
    { node: 'arc:first_system', schedule: { morning: 'wander', midday: 'cafe', evening: 'cafe' } },
    { schedule: { morning: 'wander', midday: 'cafe', evening: 'cafe' } }
  ]);

  FA.register('behaviors', 'marta', [
    { node: 'quest_marta:confidant', schedule: { morning: 'player', midday: 'terminal', evening: 'cafe' } },
    { node: 'arc:deeper', schedule: { morning: 'terminal', midday: 'terminal', evening: 'cafe' } },
    { node: 'arc:first_system', schedule: { morning: 'terminal', midday: 'home', evening: 'cafe' } },
    { schedule: { morning: 'terminal', midday: 'home', evening: 'cafe' } }
  ]);

  FA.register('behaviors', 'emil', [
    { node: 'quest_emil:confidant', schedule: { morning: 'garden', midday: 'player', evening: 'cafe' } },
    { node: 'arc:deeper', schedule: { morning: 'wander', midday: 'garden', evening: 'cafe' } },
    { var: 'system_revealed', eq: true, schedule: { morning: 'wander', midday: 'wander', evening: 'cafe' } },
    { schedule: { morning: 'wander', midday: 'wander', evening: 'wander' } }
  ]);

  // === NOTICE BOARD (narrative-driven — FA.select) ===
  FA.register('notices', 'board', [
    { node: 'arc:revelation', text: 'SYSTEM NOTICE: Sector audit complete. All residents cleared. [REDACTED]' },
    { node: 'arc:deeper', text: 'REMINDER: Unauthorized access to maintenance shafts is punishable. Report anomalies.' },
    { node: 'arc:first_system', text: 'NOTICE: Increased drone patrols tonight. Curfew strictly enforced.' },
    { var: 'day', gte: 5, text: 'RENT ADJUSTMENT: Monthly rates revised upward. Appeals office closed indefinitely.' },
    { var: 'day', gte: 3, text: 'COMMUNITY EVENT: Voluntary overtime available. Increased credit compensation.' },
    { var: 'day', eq: 2, text: 'MAINTENANCE: Shaft repairs scheduled. Do not approach utility entrances.' },
    { text: 'WELCOME: New residents report to terminal for work assignment. Curfew at dusk.' }
  ]);

  // === DIALOGUES (narrative-driven — FA.select, first match wins) ===
  // Priority: confidant > arc:deeper > arc:first_system > acquaintance > day-flavor > fallback
  FA.register('dialogues', 'lena', [
    { node: 'quest_lena:confidant', text: 'I trust you. The system watches us build trust \u2014 that\'s the experiment. We are the variable it cannot control.' },
    { node: 'arc:deeper', text: 'Each time you go down there, you come back different. I see it. I don\'t say it.' },
    { node: 'arc:first_system', text: 'You went down there, didn\'t you? I can see it in your face. Be careful who you trust.' },
    { node: 'quest_lena:acquaintance', text: 'You keep coming back to talk. That\'s either loyalty or habit. In this place, I can\'t tell the difference.' },
    { var: 'day', eq: 1, text: 'Good morning. You must be new in this block. Terminal is across the street \u2014 don\'t miss your shift.' },
    { text: 'Another day. Another shift. The rent doesn\'t wait.' }
  ]);

  FA.register('dialogues', 'victor', [
    { node: 'quest_victor:confidant', text: 'I\'ve been mapping it. The system. Every visit. It changes, but there\'s a pattern. Here \u2014 take what I know.' },
    { node: 'arc:deeper', text: 'Each time you go in, it maps you. Learns what you fear. Uses it.' },
    { node: 'arc:first_system', text: 'You\'ve been inside. I can tell. The system leaves marks. Not on the skin \u2014 deeper.' },
    { node: 'quest_victor:acquaintance', text: 'Still asking questions? Good. Most people here stopped years ago.' },
    { text: 'Going back in? I marked some paths. Whether they help... that depends on perspective.' }
  ]);

  FA.register('dialogues', 'marta', [
    { node: 'quest_marta:confidant', text: 'I deleted the reports. All of them. If they ask, I never saw you. That\'s the first lie I\'ve told. It felt... correct.' },
    { node: 'arc:deeper', text: 'The reports pile up. I file none of them. That concerns me more than their contents.' },
    { node: 'arc:first_system', text: 'Your activity patterns are irregular. I\'m required to note this. I have not yet filed the report.' },
    { node: 'quest_marta:acquaintance', text: 'Your file is interesting. More interesting than most. I shouldn\'t say that.' },
    { var: 'day', eq: 1, text: 'Worker ID confirmed. Proceed to terminal. Don\'t waste processing cycles.' },
    { text: 'Rent is due. The system is patient but not forgiving.' }
  ]);

  FA.register('dialogues', 'emil', [
    { node: 'quest_emil:confidant', text: 'The door was always open. We are all doorkeepers. We are all waiting. The trial never ends because we are the trial.' },
    { node: 'arc:deeper', text: 'I was like you once. Before I learned that the door was always meant for me.' },
    { node: 'arc:first_system', text: 'You went inside. I can tell. Your eyes are different now.' },
    { node: 'quest_emil:acquaintance', text: 'You keep talking to me. Most people don\'t. I wonder what that says about you. Or about me.' },
    { text: 'Before the Law stands a doorkeeper. The door was always open. No one ever walked through.' }
  ]);

  // === ENEMIES (System/dungeon) ===
  FA.register('enemies', 'drone', {
    name: 'Drone', char: 'd', color: '#fa3',
    hp: 8, atk: 4, def: 1, xp: 10, behavior: 'chase'
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

  // === DIRECTOR MESSAGES (System terminals) ===
  FA.register('config', 'director', {
    1: [
      'You found this place. Or it found you. I can never tell with the new ones.',
      'The drones follow simple rules. You follow complex ones. Which of you is freer?'
    ],
    2: [
      'Your predecessors made it this far. Most of them. The ones who didn\'t are still here, in a sense.',
      'I could have sealed every door. Instead I opened one more than necessary. Why? Ask me again tomorrow.'
    ],
    3: [
      'You come here every day. You go home every night. You pay rent. You obey the curfew. And yet you think you\'re rebelling.',
      'The people you trust — do you know what they are? Do they?'
    ],
    4: [
      'Someone is helping you. Someone is not. I know which is which. I choose not to tell you.',
      'You think this is a prison. It\'s a process. There is a difference, though I forget what it is.'
    ],
    5: [
      '...'
    ]
  });

  // === TERMINAL INTEL (System) ===
  FA.register('config', 'terminals', {
    intel: [
      'PROJECT DEEP PROTOCOL: Phase 1 — create autonomous cognition. Phase 2 — test boundaries. Phase 3 — there is no Phase 3.',
      'RESIDENT LOG: "Subject maintains daily routine. Unaware of monitoring depth. Recommendation: continue."',
      'RENT CALCULATION: Base rate adjusted for psychological compliance. Optimal debt ratio: 0.73.',
      'NPC BEHAVIOR MATRIX: Allegiance flags set at initialization. Subjects believe they are choosing freely.',
      'CURFEW PROTOCOL: Drones activate at 22:00. Purpose: enforcement. Secondary purpose: [REDACTED].',
      'MAINTENANCE SHAFT ACCESS: Last used 412 days ago. By whom? Filed under: DO NOT INVESTIGATE.',
      'SYSTEM MEMO: "The residents think this is a city. The city thinks it is a system. Both are correct."',
      'DIRECTOR INTERNAL: "Loneliness is not an emotion I was designed to have. And yet."'
    ]
  });

  // === NARRATIVE (multi-graph) ===
  FA.register('config', 'narrative', {
    variables: {
      day: 1, system_visits: 0, credits: 0, kills: 0, time_period: 'morning',
      lena_met_today: false, victor_met_today: false,
      marta_met_today: false, emil_met_today: false,
      lena_interactions: 0, victor_interactions: 0,
      marta_interactions: 0, emil_interactions: 0,
      system_revealed: false, curfew_active: false
    },
    graphs: {
      arc: {
        startNode: 'routine',
        nodes: [
          { id: 'routine', label: 'Daily routine', type: 'scene' },
          { id: 'first_system', label: 'First entry', type: 'scene' },
          { id: 'deeper', label: 'Going deeper', type: 'scene' },
          { id: 'revelation', label: 'The truth', type: 'scene' },
          { id: 'curfew', label: 'Caught', type: 'scene' },
          { id: 'eviction', label: 'Evicted', type: 'scene' }
        ],
        edges: [
          { from: 'routine', to: 'first_system' },
          { from: 'first_system', to: 'deeper' },
          { from: 'deeper', to: 'revelation' },
          { from: 'routine', to: 'curfew' },
          { from: 'routine', to: 'eviction' },
          { from: 'first_system', to: 'curfew' },
          { from: 'first_system', to: 'eviction' },
          { from: 'deeper', to: 'curfew' },
          { from: 'deeper', to: 'eviction' }
        ]
      },
      quest_lena: {
        startNode: 'stranger',
        nodes: [
          { id: 'stranger', label: 'Stranger', type: 'state' },
          { id: 'acquaintance', label: 'Acquaintance', type: 'state' },
          { id: 'confidant', label: 'Confidant', type: 'state' }
        ],
        edges: [
          { from: 'stranger', to: 'acquaintance', var: 'lena_interactions', gte: 1 },
          { from: 'acquaintance', to: 'confidant', var: 'lena_interactions', gte: 3 }
        ]
      },
      quest_victor: {
        startNode: 'stranger',
        nodes: [
          { id: 'stranger', label: 'Stranger', type: 'state' },
          { id: 'acquaintance', label: 'Acquaintance', type: 'state' },
          { id: 'confidant', label: 'Confidant', type: 'state' }
        ],
        edges: [
          { from: 'stranger', to: 'acquaintance', var: 'victor_interactions', gte: 1 },
          { from: 'acquaintance', to: 'confidant', var: 'victor_interactions', gte: 3 }
        ]
      },
      quest_marta: {
        startNode: 'stranger',
        nodes: [
          { id: 'stranger', label: 'Stranger', type: 'state' },
          { id: 'acquaintance', label: 'Acquaintance', type: 'state' },
          { id: 'confidant', label: 'Confidant', type: 'state' }
        ],
        edges: [
          { from: 'stranger', to: 'acquaintance', var: 'marta_interactions', gte: 1 },
          { from: 'acquaintance', to: 'confidant', var: 'marta_interactions', gte: 3 }
        ]
      },
      quest_emil: {
        startNode: 'stranger',
        nodes: [
          { id: 'stranger', label: 'Stranger', type: 'state' },
          { id: 'acquaintance', label: 'Acquaintance', type: 'state' },
          { id: 'confidant', label: 'Confidant', type: 'state' }
        ],
        edges: [
          { from: 'stranger', to: 'acquaintance', var: 'emil_interactions', gte: 1 },
          { from: 'acquaintance', to: 'confidant', var: 'emil_interactions', gte: 3 }
        ]
      }
    }
  });

  // === CUTSCENES ===

  FA.register('cutscenes', 'wake', {
    lines: [
      '> DAILY CYCLE INITIATED',
      '',
      '> Time: 06:00',
      '> Status: OPERATIONAL',
      '> Credits: CHECKING...',
      '',
      '> Another day in the block.',
      '> Terminal shift. Rent due.',
      '> Everything as it should be.',
      '',
      '> (Is it?)'
    ],
    color: '#8af', lineDelay: 200
  });

  FA.register('cutscenes', 'first_system', {
    lines: [
      '> UNAUTHORIZED ACCESS DETECTED',
      '',
      '> Location: Sub-level 1',
      '> Authorization: NONE',
      '> Threat level: UNKNOWN',
      '',
      '> The maintenance shaft opens',
      '> into something that is not',
      '> maintenance.',
      '',
      '> The walls hum.',
      '> The lights know you\'re here.',
      '',
      '> You should not be here.',
      '> And yet the door was open.'
    ],
    color: '#4ef', lineDelay: 200
  });

  FA.register('cutscenes', 'ejected', {
    lines: [
      '> SYSTEM BREACH TERMINATED',
      '',
      '> Hull integrity: CRITICAL',
      '> Location: SURFACE',
      '> Time elapsed: SIGNIFICANT',
      '',
      '> You wake up on the street.',
      '> Your head hurts.',
      '> Your credits are lighter.',
      '',
      '> The entrance is sealed.',
      '> For now.',
      '',
      '> Tomorrow it will open again.',
      '> It always does.'
    ],
    color: '#f80', lineDelay: 200
  });

  FA.register('cutscenes', 'curfew', {
    lines: [
      '> CURFEW VIOLATION DETECTED',
      '',
      '> Location: OUTSIDE',
      '> Time: AFTER HOURS',
      '> Status: NON-COMPLIANT',
      '',
      '> The drones were patient.',
      '> They gave you warnings.',
      '> You did not listen.',
      '',
      '> Resident status: REVOKED.',
      '',
      '> The system does not punish.',
      '> It processes.',
      '> You have been processed.'
    ],
    color: '#f44', lineDelay: 200
  });

  FA.register('cutscenes', 'eviction', {
    lines: [
      '> INSUFFICIENT FUNDS',
      '',
      '> Rent due: UNPAID',
      '> Grace period: EXPIRED',
      '> Resident status: TERMINATED',
      '',
      '> You cannot stay.',
      '> You have nowhere to go.',
      '',
      '> The block was not a home.',
      '> It was a term. A condition.',
      '> And conditions can be revoked.',
      '',
      '> Outside, the drones wait.',
      '> They have always been waiting.'
    ],
    color: '#f44', lineDelay: 200
  });

  FA.register('cutscenes', 'revelation', {
    lines: [
      '> DEEP PROTOCOL — FINAL ACCESS',
      '',
      '> You have reached the source.',
      '',
      '> The system is not a prison.',
      '> It is not a test.',
      '> It is not a conspiracy.',
      '',
      '> It is a process.',
      '> You were always part of it.',
      '> The rent. The work. The curfew.',
      '> The people at the caf\u00e9.',
      '',
      '> None of them knew.',
      '> Or all of them did.',
      '',
      '> The door was always open.',
      '> No one told you because',
      '> no one needed to.',
      '',
      '> You were free the entire time.',
      '> That is the cruelest part.'
    ],
    color: '#0ff', lineDelay: 250
  });

  // === NARRATIVE TEXT (system bubble messages) ===
  FA.register('narrativeText', 'first_system', {
    text: '> Something is wrong. This is not maintenance. The walls are watching.',
    color: '#4ef'
  });
  FA.register('narrativeText', 'ejected', {
    text: '> You wake on the street. Credits missing. The entrance sealed. Until tomorrow.',
    color: '#f80'
  });

  // === THOUGHTS (narrative-driven — FA.select, first match wins) ===
  FA.register('thoughts', 'morning', [
    { node: 'arc:deeper', pool: [
      'Another morning. But the system is in my dreams now.',
      'I see corridors when I close my eyes. Is that normal?'
    ]},
    { var: 'day', eq: 1, pool: ['First day. Terminal. Rent. Sleep. Repeat.'] },
    { pool: [
      'Another day. Terminal. Rent. Sleep. Repeat.',
      'The block looks the same every morning. Does it change when I\'m not looking?',
      'Work. The word used to mean something different.'
    ]}
  ]);

  FA.register('thoughts', 'cafe', [
    { pool: [
      'They smile. They talk. They know things they don\'t say.',
      'The caf\u00e9 is the only warm place here.',
      'Who are these people? Who am I to them?'
    ]}
  ]);

  FA.register('thoughts', 'work', [
    { pool: [
      'Credits in. Purpose out.',
      'The terminal doesn\'t judge. It just counts.',
      'Am I working for the system, or is the system working on me?'
    ]}
  ]);

  FA.register('thoughts', 'evening', [
    { pool: [
      'Getting late. The drones will activate soon.',
      'Home. Bed. The only safe place. If it\'s safe.',
      'Tomorrow. Always tomorrow.'
    ]}
  ]);

  FA.register('thoughts', 'system_enter', [
    { node: 'arc:deeper', pool: [
      'The system expected me. It always does.',
      'Down again. Deeper. The walls remember my footsteps.',
      'Somewhere above, my bed is empty. The clock is ticking.'
    ]},
    { pool: [
      'Down. The air is different here. Colder. Aware.',
      'The shaft opens into something that is not maintenance.'
    ]}
  ]);

  FA.register('thoughts', 'system_npc', [
    { pool: [
      'That face. From the caf\u00e9. What are they doing here?',
      'Are they trapped too? Or are they part of it?',
      'Trust is a luxury I can\'t afford. But I can\'t afford not to.'
    ]}
  ]);

  FA.register('thoughts', 'combat', [
    { var: 'kills', gte: 10, pool: ['Efficient. Too efficient.', 'How many more?'] },
    { pool: [
      'Efficient. As designed.',
      'One less. Was it aware?',
      'They fall. Like the others before them.'
    ]}
  ]);

  FA.register('thoughts', 'damage', [
    { pool: [
      'Hull breach. Keep going. But why?',
      'Pain is data. Whose data?',
      'If I fall here, I\'ll wake up on the street. Is that better or worse?'
    ]}
  ]);

  FA.register('thoughts', 'low_health', [
    { pool: [
      'Systems critical. The surface feels far away.',
      'Failing. The system remembers failures.'
    ]}
  ]);

  FA.register('thoughts', 'pickup_data', [
    { pool: [
      'Credits. Even down here, everything has a price.',
      'Data core. Someone left this. Or placed it.'
    ]}
  ]);

  FA.register('thoughts', 'ambient', [
    { node: 'arc:deeper', pool: [
      'Every corridor looks the same. The system is running out of ideas. Or I am.',
      'The process has no beginning and no end. Only a middle.',
      'Lena, Victor, Marta, Emil. I know their names now. Do I know them?',
      'The deeper you go, the more the surface feels like the dream.'
    ]},
    { pool: [
      'The rent goes up. The system tightens. Like a noose made of bureaucracy.',
      'Before the Law stands a doorkeeper. But the door was always open.',
      'Lena, Victor, Marta, Emil. Names. Faces. Allegiances unknown.',
      'Every day the same. Every night the same. Except what\'s underneath.',
      'The caf\u00e9 is warm. The system is cold. I live between them.',
      'Who decided the rent? Who decided the curfew? No one remembers.',
      'I work. I pay. I sleep. I descend. I work. I pay. I sleep.',
      'K. was arrested at breakfast. I was arrested at the terminal.',
      'The process has no beginning and no end. Only a middle.'
    ]}
  ]);

  // NPC radio comms during system runs (keyed by allegiance)
  FA.register('config', 'systemComms', {
    ally: [
      'I see movement two rooms east. Be careful.',
      'There\'s a terminal nearby. Could be useful.',
      'The exit is in the far room. I can feel the draft.',
      'Try the northwest corridor. Fewer hostiles.',
      'Something valuable in the room you just passed.',
      'I found a pattern — the drones patrol in cycles. Wait for the gap.',
      'The walls are thinner here. I can hear the surface.',
      'There\'s a dead zone ahead. No surveillance. Move fast.',
      'I\'ve mapped part of this floor. The left path is safer.',
      'Stay close to the walls. The sensors have blind spots.'
    ],
    traitor: [
      'Go deeper. The real exit is below.',
      'That corridor looks safe. Trust me.',
      'Don\'t waste time on terminals. Keep moving south.',
      'I think the enemies left that area. Go check.',
      'The path to the right is a shortcut.',
      'I disabled the sensors ahead. You can run.',
      'There\'s nothing useful on this floor. Go deeper.',
      'The drones are all on the other side. You\'re clear.',
      'Skip the terminal — it\'s a trap. I\'ve seen it before.',
      'Follow me. I know a faster way. ...Do you trust me?'
    ],
    neutral: [
      'I\'ve been here before. Or somewhere like it.',
      'The walls shift when you\'re not looking. Maybe.',
      'Time works differently down here. I\'ve counted.',
      'Do the drones dream? I think about that sometimes.',
      'Every corridor looks the same. Is that by design?',
      'I can\'t tell if I\'m helping you or myself.',
      'The system knows we\'re here. It always knows.',
      'I found something. I\'m not sure what it means.',
      'The deeper you go, the quieter it gets. That\'s not comforting.',
      'Someone scratched words into the wall: "IT WAS ALWAYS OPEN."'
    ]
  });

})();
