// Deep Protocol — Game Data
// All content as data. Generic registration at bottom.
var GAME_DATA = {

  // ============================================================
  //  CONFIG
  // ============================================================

  config: {
    game: {
      cols: 40, rows: 25,
      tileSize: 20,
      canvasWidth: 800,
      canvasHeight: 600,
      maxDepth: 5,
      roomAttempts: 30,
      roomMinSize: 4,
      roomMaxSize: 9
    },

    colors: {
      bg: '#0a0e18',
      owWall: '#2a2520', owFloor: '#1a1814', owPath: '#14120f',
      owCafe: '#1e1610', owBed: '#1a1828', owWork: '#0a1a1a',
      owDoor: '#332a20',
      wall: '#1e2233', floor: '#161a28',
      player: '#4ef', enemy: '#fa3', gold: '#0ff', potion: '#4f4',
      stairsDown: '#f80', stairsUp: '#4cf',
      terminal: '#0ff', terminalUsed: '#334',
      text: '#bcc8dd', dim: '#556', narrative: '#8af',
      credits: '#fd0', rent: '#f44', time: '#8af'
    },

    scoring: {
      killMultiplier: 100,
      goldMultiplier: 10,
      depthBonus: 500,
      dayBonus: 50
    },

    time: {
      turnsPerDay: 60,
      warningTime: 40,
      curfewTime: 52,
      workTurns: 10,
      systemTimeCost: 30
    },

    economy: {
      startCredits: 80,
      workPay: 50,
      baseRent: 30,
      rentIncrease: 5,
      ejectionPenalty: 40,
      systemRevealDay: 3,
      curfewDrones: 12
    },

    dungeonTiles: {
      floor: 0,
      wall: 1,
      stairsUp: 3,
      terminal: 4,
      terminalUsed: 5,
      blocking: 9
    },

    lights: {
      objects: {
        terminal: { radius: 3, color: '#005878' },
        system_entrance: { radius: 2, color: '#603010' }
      },
      tiles: {
        3: { radius: 2.5, color: '#604020' },
        4: { radius: 3, color: '#004858' }
      }
    },

    spawner: {
      zone: 'h',
      roles: ['ally', 'ally', 'traitor', 'neutral'],
      schedule: [
        { id: 'lena', day: 1 },
        { id: 'marta', day: 1 },
        { id: 'victor', day: 2 },
        { id: 'emil', day: 3 }
      ]
    },

    terminals: {
      intel: [
        'PROJECT DEEP PROTOCOL: Phase 1 \u2014 create autonomous cognition. Phase 2 \u2014 test boundaries. Phase 3 \u2014 there is no Phase 3.',
        'RESIDENT LOG: "Subject maintains daily routine. Unaware of monitoring depth. Recommendation: continue."',
        'RENT CALCULATION: Base rate adjusted for psychological compliance. Optimal debt ratio: 0.73.',
        'NPC BEHAVIOR MATRIX: Allegiance flags set at initialization. Subjects believe they are choosing freely.',
        'CURFEW PROTOCOL: Drones activate at 22:00. Purpose: enforcement. Secondary purpose: [REDACTED].',
        'MAINTENANCE SHAFT ACCESS: Last used 412 days ago. By whom? Filed under: DO NOT INVESTIGATE.',
        'SYSTEM MEMO: "The residents think this is a city. The city thinks it is a system. Both are correct."',
        'DIRECTOR INTERNAL: "Loneliness is not an emotion I was designed to have. And yet."'
      ]
    },

    systemComms: {
      ally: [
        'I see movement two rooms east. Be careful.',
        'There\'s a terminal nearby. Could be useful.',
        'The exit is in the far room. I can feel the draft.',
        'Try the northwest corridor. Fewer hostiles.',
        'Something valuable in the room you just passed.',
        'I found a pattern \u2014 the drones patrol in cycles. Wait for the gap.',
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
        'Skip the terminal \u2014 it\'s a trap. I\'ve seen it before.',
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
    },

  },

  // ============================================================
  //  LOCATIONS
  // ============================================================

  locations: {
    town: {
      tileset: 'overworld',
      effects: ['timeOfDay', 'curfew'],
      features: ['npcs', 'objects', 'zones']
    },
    system_d1: {
      tileset: 'dungeon',
      effects: ['systemCold'],
      features: ['enemies', 'terminals', 'items']
    },
    system_d2: {
      tileset: 'dungeon',
      effects: ['systemCold'],
      features: ['enemies', 'terminals', 'items']
    },
    system_d3: {
      tileset: 'dungeon',
      effects: ['systemCold', 'corruption'],
      features: ['enemies', 'terminals', 'items']
    },
    system_d4: {
      tileset: 'dungeon',
      effects: ['systemCold', 'corruption'],
      features: ['enemies', 'terminals', 'items']
    },
    system_d5: {
      tileset: 'dungeon',
      effects: ['systemCold', 'corruption'],
      features: ['enemies', 'terminals', 'items']
    }
  },

  // ============================================================
  //  NPCs
  // ============================================================

  npcs: {
    lena: {
      name: 'Lena', char: '@', color: '#f8d',
      homePos: { x: 23, y: 1 },
      cafePos: { x: 28, y: 6 },
      terminalPos: { x: 18, y: 17 },
      gardenPos: { x: 24, y: 13 },
      pace: 1, systemMinDepth: 1,
      systemDialogue: {
        ally: 'This corridor is clear. I checked. Follow me.',
        traitor: 'I think the exit is this way. Come on, hurry.',
        neutral: 'I don\'t know this place any better than you do.'
      }
    },
    victor: {
      name: 'Victor', char: '@', color: '#fa4',
      homePos: { x: 4, y: 9 },
      cafePos: { x: 30, y: 8 },
      terminalPos: { x: 21, y: 17 },
      gardenPos: { x: 24, y: 12 },
      pace: 2, systemMinDepth: 2,
      systemDialogue: {
        ally: 'There\'s a terminal two rooms east. It has what you need.',
        traitor: 'Trust me \u2014 go left here. I\'ve been this way before.',
        neutral: 'I\'ve seen this layout before. Or something like it. Hard to tell down here.'
      }
    },
    marta: {
      name: 'Marta', char: '@', color: '#8cf',
      homePos: { x: 4, y: 5 },
      cafePos: { x: 28, y: 8 },
      terminalPos: { x: 18, y: 17 },
      gardenPos: { x: 25, y: 14 },
      pace: 1, systemMinDepth: 2,
      systemDialogue: {
        ally: 'Security clearance granted for this sector. Move quickly.',
        traitor: 'This area is restricted. You\'ll need to find another route. Sorry.',
        neutral: 'I process data. I don\'t interpret it. That distinction matters less each day.'
      }
    },
    emil: {
      name: 'Emil', char: '@', color: '#a8f',
      homePos: { x: 4, y: 12 },
      cafePos: { x: 30, y: 6 },
      terminalPos: { x: 21, y: 17 },
      gardenPos: { x: 23, y: 13 },
      pace: 3, systemMinDepth: 3,
      systemDialogue: {
        ally: 'The source is below. Everything you need to know is there. Everything.',
        traitor: 'Keep going deeper. That\'s what it wants. That\'s what you want. Is there a difference?',
        neutral: 'I\'ve been here longer than you think. Longer than I think.'
      }
    }
  },

  // ============================================================
  //  ENEMIES, ITEMS, MODULES
  // ============================================================

  enemies: {
    drone:    { name: 'Drone',    char: 'd', color: '#fa3', hp: 8,  atk: 4, def: 1, xp: 10, behavior: 'chase' },
    sentinel: { name: 'Sentinel', char: 'S', color: '#f80', hp: 14, atk: 6, def: 2, xp: 25, behavior: 'sentinel' },
    tracker:  { name: 'Tracker',  char: 't', color: '#f4f', hp: 4,  atk: 5, def: 0, xp: 15, behavior: 'tracker' }
  },

  items: {
    gold:   { name: 'Data Core',   type: 'gold',   char: '%', color: '#0ff', value: 10 },
    potion: { name: 'Repair Kit',  type: 'potion', char: '+', color: '#4f4', healAmount: 8 }
  },

  modules: {
    emp:       { name: 'EMP Pulse',   char: 'E', color: '#ff0' },
    cloak:     { name: 'Cloak Field', char: 'C', color: '#88f' },
    scanner:   { name: 'Deep Scan',   char: '$', color: '#0ff' },
    overclock: { name: 'Overclock',   char: 'O', color: '#f44' },
    firewall:  { name: 'Firewall',    char: 'F', color: '#4f4' }
  },

};


// ============================================================
//  GENERIC REGISTRATION
// ============================================================
(function() {
  var FA = window.FA;
  for (var registry in GAME_DATA) {
    var entries = GAME_DATA[registry];
    for (var id in entries) {
      FA.register(registry, id, entries[id]);
    }
  }
})();
