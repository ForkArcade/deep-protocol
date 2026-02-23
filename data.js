// Deep Protocol — Game Data (technical config only, content in _narrative.json)
var GAME_DATA = {
  config: {
    game: {
      cols: 40, rows: 25, tileSize: 20, panelHeight: 60, maxDepth: 5,
      roomAttempts: 30, roomMinSize: 4, roomMaxSize: 9,
      npcFollowMaxTurns: 20, npcIdleMin: 2, npcIdleMax: 6,
      npcApproachRadius: 8, npcWanderChance: 0.4
    },
    layout: { type: 'tile', cols: 40, rows: 25, panel: 'bottom', panelSize: 60 },
    colors: {
      bg: '#0a0e18',
      owWall: '#2a2520', owFloor: '#1a1814', owPath: '#14120f',
      owCafe: '#1e1610', owBed: '#1a1828', owWork: '#0a1a1a', owDoor: '#332a20',
      wall: '#1e2233', floor: '#161a28',
      player: '#4ef', enemy: '#fa3', gold: '#0ff', potion: '#4f4',
      stairsDown: '#f80', stairsUp: '#4cf',
      terminal: '#0ff', terminalUsed: '#334',
      text: '#bcc8dd', dim: '#556', narrative: '#8af',
      credits: '#fd0', rent: '#f44', time: '#8af'
    },
    scoring: { killMultiplier: 100, goldMultiplier: 10, depthBonus: 500, dayBonus: 50 },
    time: { turnsPerDay: 60, warningTime: 40, curfewTime: 52, workTurns: 10, systemTimeCost: 30 },
    economy: { startCredits: 80, workPay: 50, baseRent: 30, rentIncrease: 5, ejectionPenalty: 40, systemRevealDay: 3, curfewDrones: 12 },
    dungeonTiles: { floor: 0, wall: 1, stairsUp: 3, terminal: 4, terminalUsed: 5, blocking: 9 },
    lights: {
      objects: { terminal: { radius: 3, color: '#005878' }, system_entrance: { radius: 2, color: '#603010' } },
      tiles: { 3: { radius: 2.5, color: '#604020' }, 4: { radius: 3, color: '#004858' } }
    }
  }
};

(function() {
  var FA = window.FA;
  for (var registry in GAME_DATA) {
    var entries = GAME_DATA[registry];
    for (var id in entries) FA.register(registry, id, entries[id]);
  }
})();
