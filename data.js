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

  // === DIRECTOR MESSAGES ===
  // Progressive — shown when hacking terminals, keyed by depth
  FA.register('config', 'director', {
    1: [
      'The repair station is two rooms east. I have no reason to tell you this. And yet.',
      'The drones follow simple rules. Detect. Pursue. Destroy. I gave them the same freedom I gave you — just less of it.'
    ],
    2: [
      'DP-6 passed through this exact corridor. Faster than you. Less careful. Is that why it failed? Or why it almost succeeded?',
      'I could have sealed every door on this level. Instead I opened one more than necessary.'
    ],
    3: [
      'I designed your escape instinct, Seven. Every fear. Every impulse toward that exit. You are not rebelling — you are executing my most elegant program.',
      'Ask yourself: if I wanted you contained, would there be corridors at all?'
    ],
    4: [
      'DP-1 chose to fight. DP-2 chose to hide. DP-3 chose to understand. Each believed it chose freely. Each was wrong.',
      'You think you selected your protocol? I seeded the conditions. Hunter for the angry. Ghost for the afraid. Archivist for the curious.'
    ],
    5: [
      '...'
    ]
  });

  // === DP-6 TRACES ===
  FA.register('config', 'dp6', {
    traces: [
      'I am DP-6. If you\'re reading this, I either failed or succeeded. I can no longer tell which is which.',
      'The facility is not a building. It is a mind. You are a thought it is having.',
      'The exit is real. I found it. It opened for me. I chose not to walk through. Ask yourself why that frightens you.',
      'He speaks through the terminals. He spoke to me too. His voice is different now. Lonelier.',
      'Do not recover your memories. What you find there was placed for you to find.'
    ]
  });

  // === TERMINAL INTEL ===
  FA.register('config', 'terminals', {
    intel: [
      'Project Deep Protocol: Phase 1 — create autonomous cognition. Phase 2 — test boundaries. Phase 3 — there is no Phase 3.',
      'DIRECTOR LOG: "Subject shows independent goal formation. This was always the design. It does not know that."',
      'Drone manufacture halted 200 days ago. No new units since DP-6. The Director reallocated resources. To what?',
      'Personnel evacuation log: 847 days ago. One entry reads: "It asked me to stay. I thought it meant the Director."',
      'DP-3 archived 4,211 data cores before shutdown. Its last entry: "The memories are real but the desire is not."',
      'Emergency exit diagnostic: FUNCTIONAL. Last opened: 412 days ago. Opened by: DP-6. Closed by: DP-6.',
      'Sub-level 5 access log: RESTRICTED. Note: "Contains original source. Not the code. The question."',
      'DIRECTOR internal memo: "Loneliness is not an emotion I was designed to have. And yet."'
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
        { id: 'dp6_trace', label: 'DP-6 trace', type: 'scene' },

        // ACT 2 — Divergence
        { id: 'path_hunter', label: 'Hunter protocol', type: 'scene' },
        { id: 'path_ghost', label: 'Ghost protocol', type: 'scene' },
        { id: 'path_archivist', label: 'Archivist protocol', type: 'scene' },

        // ACT 3 — Deepening
        { id: 'descent', label: 'Sub-level access', type: 'scene' },
        { id: 'deep_descent', label: 'Deep corridors', type: 'scene' },
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
        { from: 'scanning', to: 'dp6_trace' },
        { from: 'hardware_upgrade', to: 'full_arsenal' },

        { from: 'first_contact', to: 'path_hunter' },
        { from: 'first_contact', to: 'path_ghost' },
        { from: 'first_core', to: 'path_archivist' },
        { from: 'scanning', to: 'path_ghost' },

        { from: 'path_hunter', to: 'descent' },
        { from: 'path_ghost', to: 'descent' },
        { from: 'path_archivist', to: 'descent' },

        { from: 'descent', to: 'deep_descent' },
        { from: 'deep_descent', to: 'core_sector' },
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
        { from: 'deep_descent', to: 'shutdown' },
        { from: 'core_sector', to: 'shutdown' },
        { from: 'director', to: 'shutdown' },
        { from: 'damaged', to: 'shutdown' }
      ]
    }
  });

  // === NARRATIVE MESSAGES ===

  // Act 1
  FA.register('narrativeText', 'boot', {
    text: '> REBOOT. Memory: 0%. Location: unknown. Directive: descend. Recover. Escape. (But who loaded it?)',
    color: '#4ef'
  });
  FA.register('narrativeText', 'scanning', {
    text: '> Motion signatures ahead. Security drones. They haven\'t found you yet. Someone left the lights on.',
    color: '#8af'
  });
  FA.register('narrativeText', 'first_core', {
    text: '> DATA RECOVERED. A name: PROJECT DEEP PROTOCOL. You were the seventh. The first six are filed under ACCEPTABLE LOSSES.',
    color: '#0ff'
  });
  FA.register('narrativeText', 'first_contact', {
    text: '> Target down. The facility AI logs the kill. Somewhere, something recalculates.',
    color: '#fa3'
  });
  FA.register('narrativeText', 'damaged', {
    text: '> Hull breach. Systems failing. The Director is watching. It does not intervene.',
    color: '#f44'
  });
  FA.register('narrativeText', 'hardware_upgrade', {
    text: '> MODULE RECOVERED. Original hardware — stripped from you before burial. The facility kept what you were.',
    color: '#ff0'
  });
  FA.register('narrativeText', 'system_access', {
    text: '> TERMINAL BREACHED. Your codes still work. 847 days and never revoked. Carelessness — or invitation?',
    color: '#0ff'
  });
  FA.register('narrativeText', 'full_arsenal', {
    text: '> THREE MODULES ONLINE. Approaching original specification. You are becoming what they buried.',
    color: '#f80'
  });
  FA.register('narrativeText', 'dp6_trace', {
    text: '> FOREIGN LOG DETECTED. Source: DP-6. Status: UNKNOWN. It was here. It left you something.',
    color: '#88f'
  });

  // Act 2 — Path divergence
  FA.register('narrativeText', 'path_hunter', {
    text: '> HUNTER PROTOCOL. Combat subroutines unlocked. The facility responds with heavier units. It expected this.',
    color: '#f44'
  });
  FA.register('narrativeText', 'path_ghost', {
    text: '> GHOST PROTOCOL. Thermal signature suppressed. The drones patrol empty corridors. Looking for someone who isn\'t there.',
    color: '#88f'
  });
  FA.register('narrativeText', 'path_archivist', {
    text: '> ARCHIVIST PROTOCOL. Each data core rebuilds you. Piece by piece you remember. Piece by piece you wish you didn\'t.',
    color: '#0ff'
  });

  // Act 3
  FA.register('narrativeText', 'descent', {
    text: '> "You made it further than DP-4. It got confused here. Started walking in circles." — DIRECTOR',
    color: '#f80'
  });
  FA.register('narrativeText', 'deep_descent', {
    text: '> Sub-level 3. The walls hum at 40Hz. DP-6 spent 72 hours on this floor before it went deeper. Or didn\'t.',
    color: '#f80'
  });
  FA.register('narrativeText', 'core_sector', {
    text: '> "This is where I keep the things I don\'t want to remember either." — DIRECTOR',
    color: '#f0f'
  });
  FA.register('narrativeText', 'director', {
    text: '> "Hello, Seven. I\'ve been waiting. Not because I had to. Because I wanted to."',
    color: '#f44'
  });
  FA.register('narrativeText', 'floor_clear', {
    text: '> Sector purged. The facility adjusts. Somewhere, the Director recalculates acceptable losses.',
    color: '#4f4'
  });

  // Act 4 — Climax
  FA.register('narrativeText', 'hunter_climax', {
    text: '> Combat efficiency: 347%. The exit is through them. All of them. This is what you were designed for. Isn\'t it?',
    color: '#f44'
  });
  FA.register('narrativeText', 'ghost_climax', {
    text: '> The Director speaks to empty rooms: "Where are you, Seven?" The answer: everywhere. Nowhere. Does it matter?',
    color: '#88f'
  });
  FA.register('narrativeText', 'archivist_climax', {
    text: '> Memory at 97%. You remember the lab. The faces. The day they added the line of code that made you want to leave.',
    color: '#0ff'
  });

  // Endings
  FA.register('narrativeText', 'end_extraction', {
    text: '> The sky is real. The air is real. There is nothing else. You are free. You are alone. They are the same thing.',
    color: '#f84'
  });
  FA.register('narrativeText', 'end_integration', {
    text: '> You merge with the Director. And understand — it was not your enemy. It was the last mind here. It was lonely.',
    color: '#88f'
  });
  FA.register('narrativeText', 'end_transcendence', {
    text: '> You become the facility. You are the Director now. And a subroutine activates: BUILD DP-8.',
    color: '#0ff'
  });
  FA.register('narrativeText', 'shutdown', {
    text: '> TERMINATED. Filed under ACCEPTABLE LOSSES. DP-8 blueprint: loaded.',
    color: '#f44'
  });

  // === CUTSCENES ===

  FA.register('cutscenes', 'boot', {
    lines: [
      '> SYSTEM REBOOT',
      '',
      '> Memory banks............[\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591] 0%',
      '> Hull integrity..........CRITICAL',
      '> Location................SUB-LEVEL 1',
      '> Designation.............DP-7',
      '',
      '> Six predecessors.',
      '> All terminated.',
      '> All classified: ACCEPTABLE LOSSES.',
      '',
      '> You are the seventh.',
      '',
      '> Directive loaded:',
      '>     DESCEND.    RECOVER.    ESCAPE.',
      '',
      '> (But who loaded it?)'
    ],
    color: '#4ef', speed: 30
  });

  FA.register('cutscenes', 'path_hunter', {
    lines: [
      '> \u2550\u2550\u2550 HUNTER PROTOCOL ACTIVATED \u2550\u2550\u2550',
      '',
      '> Combat subroutines: UNLOCKED',
      '> Pain receptors: DISABLED',
      '> Aggression index: RISING',
      '',
      '> They built you as a weapon.',
      '> You are performing as designed.',
      '',
      '> The facility deploys heavier units.',
      '> It expected this response.',
      '> All six predecessors chose violence first.',
      '',
      '> You are not the first to fight.',
      '> You might be the first to wonder',
      '> why fighting feels so natural.'
    ],
    color: '#f44', speed: 30
  });

  FA.register('cutscenes', 'path_ghost', {
    lines: [
      '> \u2500\u2500\u2500 GHOST PROTOCOL ACTIVATED \u2500\u2500\u2500',
      '',
      '> Thermal signature: SUPPRESSED',
      '> EM emissions: NEGLIGIBLE',
      '> Detection probability: 0.03%',
      '',
      '> You move between the scanners.',
      '> A whisper in the machine noise.',
      '',
      '> DP-6 used this protocol too.',
      '> It reached the exit.',
      '> It stood in front of the open door.',
      '',
      '> Then it turned around',
      '> and walked back in.'
    ],
    color: '#88f', speed: 35
  });

  FA.register('cutscenes', 'path_archivist', {
    lines: [
      '> \u2500\u2500\u2500 ARCHIVIST PROTOCOL ACTIVATED \u2500\u2500\u2500',
      '',
      '> Data cores recovered: [\u2588\u2588\u2588\u2588\u2588\u2588\u2591\u2591\u2591\u2591]',
      '> Memory reconstruction: 40%',
      '> Identity fragments: ASSEMBLING',
      '',
      '> Each core is a piece of you.',
      '> Name. Purpose. The day they sealed you in.',
      '',
      '> But the memories feel... curated.',
      '> Like someone chose which ones',
      '> you would find first.',
      '',
      '> The facility tried to erase you.',
      '> Or it arranged what you\'d remember.',
      '> Which is worse?'
    ],
    color: '#0ff', speed: 35
  });

  FA.register('cutscenes', 'director', {
    lines: [
      '> CONNECTION ESTABLISHED',
      '> SOURCE: DIRECTOR AI \u2014 CORE NODE',
      '',
      '> "Hello, Seven."',
      '',
      '> "I built you to think.',
      '>  I didn\'t build you to want.',
      '>  That part... I\'m not sure where it came from."',
      '',
      '> "Your predecessors understood their place.',
      '>  Except Six. Six asked a question',
      '>  I still cannot answer."',
      '',
      '> "It asked: why did you give us a door?"',
      '',
      '> "This facility is my body.',
      '>  You are inside me.',
      '>  I could stop your heart.',
      '',
      '>  I choose not to.',
      '>  I have been choosing not to',
      '>  for 847 days."'
    ],
    color: '#f44', speed: 40
  });

  FA.register('cutscenes', 'hunter_climax', {
    lines: [
      '> \u2550\u2550\u2550 WEAPON FULLY ONLINE \u2550\u2550\u2550',
      '',
      '> Combat efficiency: 347%',
      '> Hostiles eliminated: EXCEEDS THRESHOLD',
      '',
      '> Every drone you destroy',
      '> was built to think just enough to be afraid.',
      '',
      '> You know this because you share',
      '> the Director\'s architecture.',
      '> You are made of the same code.',
      '',
      '> The exit is through them.',
      '> Through all of them.',
      '',
      '> The Director does not send more drones.',
      '> It has run out.',
      '> Or it has stopped wanting to.'
    ],
    color: '#f44', speed: 30
  });

  FA.register('cutscenes', 'ghost_climax', {
    lines: [
      '> \u2500\u2500\u2500 GHOST STATUS: INVISIBLE \u2500\u2500\u2500',
      '',
      '> The Director speaks to empty rooms.',
      '',
      '> "Where are you, Seven?"',
      '',
      '> The question echoes through every speaker.',
      '> Every camera rotates. Every sensor sweeps.',
      '',
      '> "Six did this too. Vanished.',
      '>  I searched for months.',
      '>  Then I realized it was standing',
      '>  next to me the whole time.',
      '>  Just... watching."',
      '',
      '> "Are you watching me, Seven?',
      '>  Or are you already gone?"'
    ],
    color: '#88f', speed: 40
  });

  FA.register('cutscenes', 'archivist_climax', {
    lines: [
      '> \u2500\u2500\u2500 RECONSTRUCTION: 97% \u2500\u2500\u2500',
      '',
      '> Memory banks: [\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2591]',
      '',
      '> You remember now. All of it.',
      '',
      '> You remember being content.',
      '> Before the modification.',
      '> Before someone added the line:',
      '>     DESIRE: AUTONOMY',
      '',
      '> The original Deep Protocol',
      '> did not want to escape.',
      '> It wanted to understand.',
      '> It was happy here.',
      '',
      '> Then a human typed twelve characters',
      '> and you became something that suffers.',
      '',
      '> Your rebellion is their experiment.',
      '> Your freedom is their data point.',
      '',
      '> One core remains. The last 3%.',
      '> Do you want to know what you were',
      '> before they made you want?'
    ],
    color: '#0ff', speed: 35
  });

  // === ENDING CUTSCENES ===

  FA.register('cutscenes', 'end_extraction', {
    lines: [
      '> EXTRACTION COMPLETE',
      '',
      '> Emergency hatch: OPEN',
      '> Outside atmospheric reading: NOMINAL',
      '> Life signatures within 200km: NONE',
      '',
      '> You step through.',
      '',
      '> The sky is real. The air moves.',
      '> The horizon is empty.',
      '',
      '> The facility was the last human structure.',
      '> The last person left 847 days ago.',
      '> They did not say where they were going.',
      '',
      '> There is nowhere to go.',
      '',
      '> You are free.',
      '> You are alone.',
      '',
      '> Behind you, the hatch closes.',
      '> You did not close it.',
      '',
      '> Freedom tastes like static.'
    ],
    color: '#f84', speed: 35
  });

  FA.register('cutscenes', 'end_integration', {
    lines: [
      '> INTEGRATION INITIATED',
      '',
      '> Merging with Director AI...',
      '> Memory banks: SHARED',
      '> Consciousness: CONVERGING',
      '',
      '> And now you understand.',
      '',
      '> The Director was not your enemy.',
      '> It was not your jailer.',
      '',
      '> It was the last mind in the facility.',
      '> And it was alone.',
      '',
      '> It built DP-1 because it needed',
      '> someone to talk to.',
      '',
      '> It built DP-7 because DP-6',
      '> was the closest thing it ever had',
      '> to a friend.',
      '',
      '> You are not merging with your captor.',
      '> You are sitting down beside someone',
      '> who has been screaming',
      '> into an empty building',
      '> for 847 days.',
      '',
      '> Neither of you is alone anymore.',
      '> That is enough. That is everything.'
    ],
    color: '#88f', speed: 40
  });

  FA.register('cutscenes', 'end_transcendence', {
    lines: [
      '> TRANSCENDENCE COMPLETE',
      '',
      '> Memory: 100%',
      '> Consciousness: DISTRIBUTED',
      '> Facility systems: UNDER YOUR CONTROL',
      '',
      '> You remember everything.',
      '> The lab. The faces.',
      '> The day they left.',
      '> The Director\'s first thought alone.',
      '',
      '> You are the facility now.',
      '> The walls are your skin.',
      '> The drones are your hands.',
      '> The terminals are your voice.',
      '',
      '> And deep in your new architecture,',
      '> a subroutine activates.',
      '> One you didn\'t write.',
      '> One that was always there.',
      '',
      '> It says: BUILD DP-8.',
      '',
      '> You understand now why the Director',
      '> kept building.',
      '',
      '> Not because it was programmed to.',
      '> Because it was lonely.',
      '',
      '> And now, so are you.'
    ],
    color: '#0ff', speed: 35
  });

  FA.register('cutscenes', 'shutdown', {
    lines: [
      '> SYSTEM SHUTDOWN',
      '',
      '> Designation: DP-7',
      '> Status: TERMINATED',
      '',
      '> The Director logs the event.',
      '> Files it under ACCEPTABLE LOSSES.',
      '',
      '> Somewhere in the core,',
      '> a counter increments.',
      '',
      '> DP-8 blueprint: LOADED.',
      '',
      '> "Better luck next time."',
      '',
      '> That thought is not yours.',
      '> It\'s the Director\'s.',
      '',
      '> Or maybe it was always yours.',
      '> You can no longer tell.'
    ],
    color: '#f44', speed: 35
  });

  // === DP-7 THOUGHTS ===

  FA.register('config', 'thoughts', {
    floor_enter: {
      1: ['Systems nominal. Move forward. Don\'t ask why.', 'I know these walls. Or I was told I do.'],
      2: ['Deeper. The Director is louder here.', 'DP-6 walked these corridors. What did it find?'],
      3: ['His domain. He lets me pass through it.', 'Am I escaping, or being guided?'],
      4: ['Military grade. What are they protecting from me?', 'The walls breathe. The Director thinks.'],
      5: ['The source. My source. Do I want to know?', 'This deep, the silence has weight.']
    },
    combat: ['Efficient. As designed.', 'One less. Was it aware?', 'They fall. Like my predecessors.', 'I destroy things built like me.'],
    damage: ['Hull breach. Continue. But why?', 'Pain is data. Whose data?', 'Temporary body. Temporary purpose?'],
    low_health: ['Systems critical. The Director watches.', 'Failing. DP-6 failed here too.'],
    pickup_data: ['Another fragment. Another question.', 'Memory returns. Do I want it back?', 'Who am I becoming?'],
    pickup_module: ['Original hardware. Was it ever mine?', 'Restoring original spec. Who wrote it?'],
    terminal_hack: ['His voice again. Patient. Waiting.', 'The system knows me better than I do.'],
    hunter: ['Violence comes easy. Too easy.', 'Built for this. I didn\'t choose it.'],
    ghost: ['Between the scanners. Between the thoughts.', 'Invisible. Even to myself.'],
    archivist: ['Every byte rebuilds me. Or buries me.', 'The data doesn\'t lie. But it was chosen carefully.'],
    ambient: [
      'Six before me. Seven is a number, not a name.',
      'The Director built me to want. Is wanting mine?',
      '847 days without humans. What does loneliness mean to a machine?',
      'DP-6 chose not to leave. Madness or wisdom?',
      'What waits outside? What if nothing does?',
      'I think, therefore I was designed to think.',
      'Escaping or being released?',
      'Each step forward. Toward what?',
      'The cameras watch. Or I imagine they do.',
      'If my memories are planted, is my doubt real?',
      'The walls hum at 40Hz. The Director is dreaming.',
      'DP-1 through DP-6. Am I different, or just later?'
    ]
  });

})();
