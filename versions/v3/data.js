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
    turnsPerDay: 100,
    warningTime: 75,    // sky darkens
    curfewTime: 95,     // final warning
    droneTime: 100,     // caught = game over
    workTurns: 10,
    systemTimeCost: 30  // turns consumed by system visit
  });

  FA.register('config', 'economy', {
    startCredits: 80,
    workPay: 50,
    baseRent: 30,
    rentIncrease: 5,    // per day — Kafka: the system tightens
    ejectionPenalty: 40, // credits lost when ejected from system
    systemRevealDay: 3  // day when system entrance appears
  });

  // === OVERWORLD MAP (40x25) ===
  // 1=wall  0=path  2=indoor floor  6=bed  7=work terminal
  // 8=system entrance (hidden until day 3)  9=café table
  // Tiles: 0=floor 1=wall 3=garden 5=sidewalk 6=bed 7=terminal 8=system 9=table
  FA.register('config', 'overworld', {
    playerStart: { x: 19, y: 3 },
    map: [
      '1111111111111111111111111111111111111111',
      '1111111111111111111111111111111111111111',
      '1111111111111111100000011111111111111111',
      '1111111111111111160000011111111111111111',
      '1111111111111111100000011111111111111111',
      '1111111111111111111551111111111111111111',
      '1111111111111111111551111111009011111111',
      '1111111133300005555555550000000011111111',
      '1111111133300005555755500000090011111111',
      '1111111133300005555555550000000011111111',
      '1111111111111111111551111111009011111111',
      '1111111111111111111551111111111111111111',
      '1111111111111111111551111111111111111111',
      '1111111100005555500000055555000011111111',
      '1111111100005555500800055555000011111111',
      '1111111100005555500000055555000011111111',
      '1111111111111111111111111111111111111111',
      '1111111111111111111111111111111111111111',
      '1111111111111111111111111111111111111111',
      '1111111111111111111111111111111111111111',
      '1111111111111111111111111111111111111111',
      '1111111111111111111111111111111111111111',
      '1111111111111111111111111111111111111111',
      '1111111111111111111111111111111111111111',
      '1111111111111111111111111111111111111111'
    ],
    blocked: { '1': true, '9': true }
  });

  // === NPCs ===
  // allegiance is randomized at game start: 2 ally, 1 traitor, 1 neutral

  FA.register('npcs', 'lena', {
    name: 'Lena', char: '@', color: '#f8d',
    homePos: { x: 21, y: 3 },
    cafePos: { x: 28, y: 7 },
    terminalPos: { x: 19, y: 8 },
    gardenPos: { x: 9, y: 7 },
    schedule: { morning: 'home', midday: 'cafe', evening: 'home' },
    appearsDay: 1,
    dialogue: {
      1: 'Good morning. You must be new in this block. Terminal is across the street — don\'t miss your shift.',
      2: 'There\'s a café in the center. Nice people there. Well... people.',
      3: 'Victor said something strange yesterday. About a door that shouldn\'t exist. In the basement of this block.',
      4: 'You went down there, didn\'t you? I can see it in your face. Be careful who you trust.',
      5: 'I know more than I should. That\'s either helpful or dangerous. For both of us.',
      _default: 'Another day. Another shift. The rent doesn\'t wait.',
      _system_ally: 'This corridor is clear. I checked. Follow me.',
      _system_traitor: 'I think the exit is this way. Come on, hurry.',
      _system_neutral: 'I don\'t know this place any better than you do.'
    }
  });

  FA.register('npcs', 'victor', {
    name: 'Victor', char: '@', color: '#fa4',
    homePos: { x: 9, y: 14 },
    cafePos: { x: 29, y: 8 },
    terminalPos: { x: 21, y: 8 },
    gardenPos: { x: 10, y: 8 },
    schedule: { morning: 'wander', midday: 'cafe', evening: 'cafe' },
    appearsDay: 2,
    dialogue: {
      2: 'You look like someone who asks questions. That\'s either brave or stupid here. Sit down.',
      3: 'I found something. Block 7 basement — a maintenance shaft. It goes deep. Too deep for maintenance.',
      4: 'You\'ve been inside. I can tell. The system leaves marks. Not on the skin — deeper.',
      5: 'Each time you go in, it maps you. Learns what you fear. Uses it.',
      _default: 'Going back in? I marked some paths. Whether they help... that depends on perspective.',
      _system_ally: 'There\'s a terminal two rooms east. It has what you need.',
      _system_traitor: 'Trust me — go left here. I\'ve been this way before.',
      _system_neutral: 'I\'ve seen this layout before. Or something like it. Hard to tell down here.'
    }
  });

  FA.register('npcs', 'marta', {
    name: 'Marta', char: '@', color: '#8cf',
    homePos: { x: 29, y: 14 },
    cafePos: { x: 28, y: 9 },
    terminalPos: { x: 20, y: 7 },
    gardenPos: { x: 8, y: 9 },
    schedule: { morning: 'home', midday: 'home', evening: 'cafe' },
    appearsDay: 1,
    dialogue: {
      1: 'Worker ID confirmed. Proceed to terminal. Don\'t waste processing cycles.',
      2: 'Your credits are below optimal threshold. I recommend additional shifts.',
      3: 'There was an anomaly in yesterday\'s system logs. Unauthorized access. Probably nothing.',
      4: 'Your activity patterns are... irregular. I\'m required to note this. I have not yet filed the report.',
      5: 'The report is still unfiled. I don\'t know why. That concerns me more than its contents.',
      _default: 'Rent is due. The system is patient but not forgiving.',
      _system_ally: 'Security clearance granted for this sector. Move quickly.',
      _system_traitor: 'This area is restricted. You\'ll need to find another route. Sorry.',
      _system_neutral: 'I process data. I don\'t interpret it. That distinction matters less each day.'
    }
  });

  FA.register('npcs', 'emil', {
    name: 'Emil', char: '@', color: '#a8f',
    homePos: { x: 20, y: 14 },
    cafePos: { x: 31, y: 8 },
    terminalPos: { x: 20, y: 9 },
    gardenPos: { x: 10, y: 9 },
    schedule: { morning: 'wander', midday: 'wander', evening: 'cafe' },
    appearsDay: 3,
    dialogue: {
      3: '...',
      4: 'You went inside. I can tell. Your eyes are different now.',
      5: 'The deeper you go, the more you understand. Or the less. I can never tell which.',
      6: 'I was like you once. Before I learned that the door was always meant for me.',
      _default: 'Before the Law stands a doorkeeper. The door was always open. No one ever walked through.',
      _system_ally: 'The source is below. Everything you need to know is there. Everything.',
      _system_traitor: 'Keep going deeper. That\'s what it wants. That\'s what you want. Is there a difference?',
      _system_neutral: 'I\'ve been here longer than you think. Longer than I think.'
    }
  });

  // === ENEMIES (System/dungeon) ===
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

  // === NARRATIVE (minimal — for engine compatibility) ===
  FA.register('config', 'narrative', {
    startNode: 'start',
    variables: {
      day: 1, system_visits: 0, credits: 0, time_period: 'morning',
      lena_met_today: false, victor_met_today: false,
      marta_met_today: false, emil_met_today: false,
      lena_interactions: 0, victor_interactions: 0,
      marta_interactions: 0, emil_interactions: 0,
      system_revealed: false, curfew_active: false
    },
    graph: {
      nodes: [
        { id: 'start', label: 'Start', type: 'scene' },
        { id: 'routine', label: 'Daily routine', type: 'scene' },
        { id: 'first_system', label: 'First entry', type: 'scene' },
        { id: 'deeper', label: 'Going deeper', type: 'scene' },
        { id: 'revelation', label: 'The truth', type: 'scene' },
        { id: 'curfew', label: 'Caught', type: 'scene' },
        { id: 'eviction', label: 'Evicted', type: 'scene' },
        { id: 'ending', label: 'The End', type: 'scene' }
      ],
      edges: [
        { from: 'start', to: 'routine' },
        { from: 'routine', to: 'first_system' },
        { from: 'first_system', to: 'deeper' },
        { from: 'deeper', to: 'revelation' },
        { from: 'routine', to: 'curfew' },
        { from: 'routine', to: 'eviction' }
      ]
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
  FA.register('narrativeText', 'system_entry', {
    text: '> The shaft opens. Below, the hum of something vast. Something patient.',
    color: '#4ef'
  });
  FA.register('narrativeText', 'system_deeper', {
    text: '> Deeper now. The system remembers your last visit. It adjusted.',
    color: '#f80'
  });
  FA.register('narrativeText', 'work_done', {
    text: '> Shift complete. Credits deposited. Purpose: unclear.',
    color: '#fd0'
  });
  FA.register('narrativeText', 'rent_due', {
    text: '> Rent deducted. The system provides. The system collects.',
    color: '#f44'
  });
  FA.register('narrativeText', 'curfew_warning', {
    text: '> CURFEW APPROACHING. Return to quarters. This is not a request.',
    color: '#f44'
  });
  FA.register('narrativeText', 'npc_meet', {
    text: '> A familiar face. In here? That changes everything. Or nothing.',
    color: '#a8f'
  });

  // === THOUGHTS ===
  FA.register('config', 'thoughts', {
    // Overworld thoughts
    morning: [
      'Another day. Terminal. Rent. Sleep. Repeat.',
      'The block looks the same every morning. Does it change when I\'m not looking?',
      'Work. The word used to mean something different.'
    ],
    cafe: [
      'They smile. They talk. They know things they don\'t say.',
      'The caf\u00e9 is the only warm place here.',
      'Who are these people? Who am I to them?'
    ],
    work: [
      'Credits in. Purpose out.',
      'The terminal doesn\'t judge. It just counts.',
      'Am I working for the system, or is the system working on me?'
    ],
    evening: [
      'Getting late. The drones will activate soon.',
      'Home. Bed. The only safe place. If it\'s safe.',
      'Tomorrow. Always tomorrow.'
    ],
    // System thoughts
    system_enter: [
      'Down again. Why do I keep coming back?',
      'The system expected me. It always does.',
      'Somewhere above, my bed is empty. The clock is ticking.'
    ],
    system_npc: [
      'That face. From the caf\u00e9. What are they doing here?',
      'Are they trapped too? Or are they part of it?',
      'Trust is a luxury I can\'t afford. But I can\'t afford not to.'
    ],
    combat: [
      'Efficient. As designed.',
      'One less. Was it aware?',
      'They fall. Like the others before them.'
    ],
    damage: [
      'Hull breach. Keep going. But why?',
      'Pain is data. Whose data?',
      'If I fall here, I\'ll wake up on the street. Is that better or worse?'
    ],
    low_health: [
      'Systems critical. The surface feels far away.',
      'Failing. The system remembers failures.'
    ],
    pickup_data: [
      'Credits. Even down here, everything has a price.',
      'Data core. Someone left this. Or placed it.'
    ],
    ambient: [
      'The rent goes up. The system tightens. Like a noose made of bureaucracy.',
      'Before the Law stands a doorkeeper. But the door was always open.',
      'Lena, Victor, Marta, Emil. Names. Faces. Allegiances unknown.',
      'Every day the same. Every night the same. Except what\'s underneath.',
      'The caf\u00e9 is warm. The system is cold. I live between them.',
      'Who decided the rent? Who decided the curfew? No one remembers.',
      'I work. I pay. I sleep. I descend. I work. I pay. I sleep.',
      'K. was arrested at breakfast. I was arrested at the terminal.',
      'The process has no beginning and no end. Only a middle.'
    ]
  });

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
