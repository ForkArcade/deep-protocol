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
      bg: '#000000',
      owWall: '#2a2520', owFloor: '#1a1814', owPath: '#14120f',
      owCafe: '#1e1610', owBed: '#1a1828', owWork: '#0a1a1a', owDoor: '#332a20',
      wall: '#1e2233', floor: '#161a28',
      player: '#4ef', enemy: '#fa3', gold: '#0ff', potion: '#4f4',
      stairsDown: '#f80', stairsUp: '#4cf',
      terminal: '#0ff', terminalUsed: '#334',
      text: '#bcc8dd', dim: '#556', narrative: '#8af',
      credits: '#fd0', rent: '#f44', time: '#8af',
      // HP bar
      hpHigh: '#4f4', hpMid: '#fa4', hpLow: '#f44', hpBarBg: '#0a1a0a',
      // Time periods
      periodMorning: '#d8b060', periodMidday: '#e0a030', periodEvening: '#c06030', periodCurfew: '#f44',
      // Time bar
      timeBarDanger: '#f44', timeBarWarning: '#e08030', timeBarNormal: '#c8a050', timeBarBg: '#1a1610',
      // Buffs
      buffCloak: '#88f', buffOverclock: '#f44', buffFirewall: '#4f4',
      // Actions
      actionLodging: '#8878cc', actionTerminal: '#88aa66', actionTerminalDone: '#443',
      actionNotices: '#aa9a50', actionCafe: '#e8a040', actionGarden: '#6a4', actionSystem: '#f80',
      actionDisabled: '#644', actionCancel: '#665',
      // Combat floats
      floatDamage: '#f44', floatOverclock: '#f80', floatPlayerDmg: '#f84',
      floatHeal: '#4f4', floatGold: '#0ff', floatBoss: '#0ff', floatFull: '#f44',
      // Module use
      moduleEmp: '#ff0', moduleCloak: '#88f', moduleScanner: '#0ff',
      moduleOverclock: '#f44', moduleFirewall: '#4f4', moduleMap: '#0ff',
      moduleDisrupt: '#ff0', moduleIntel: '#0ff',
      // Effects
      glitch: ['#f00', '#0ff', '#f0f', '#ff0'], corruption: '#208', systemCold: '#004',
      curfewOverlay: '#f00', curfewSmoke: '#f10', soundWave: '#ff0',
      // Start screen
      startBg: '#060a14', startTitle: '#4ef',
      // Dream
      dreamOverlay: '#080420', dreamGlitch: '#4ef',
      // Endings
      endingSuccess: '#0ff', endingFailure: '#f44',
      // UI misc
      slotNumber: '#3a5060', emptySlot: '#1a2530', divesLabel: '#664',
      moodLow: '#f44', moodHigh: '#4f4',
      choiceMenu: '#8878cc', choiceOption: '#aa9', keyLabel: '#554',
      memoryHeader: '#4ef', memoryText: '#3a7a8a',
      systemVisitStat: '#f80', scoreFinal: '#fff',
      dialogueChoice: '#aa9', missingTile: '#222',
      scanline: '#000'
    },
    scoring: { killMultiplier: 100, goldMultiplier: 10, depthBonus: 500, dayBonus: 50 },
    time: { turnsPerDay: 60, warningTime: 40, curfewTime: 52, workTurns: 10, systemTimeCost: 30 },
    economy: { startCredits: 80, workPay: 50, baseRent: 30, rentIncrease: 5, ejectionPenalty: 40, systemRevealDay: 3, curfewDrones: 12 },
    dungeonTiles: { floor: 0, wall: 1, stairsUp: 3, terminal: 4, terminalUsed: 5, blocking: 9 },
    lights: {
      objects: { terminal: { radius: 3, color: '#005878' }, system_entrance: { radius: 2, color: '#603010' } },
      tiles: { 3: { radius: 2.5, color: '#604020' }, 4: { radius: 3, color: '#004858' } }
    },
    fov: {
      overworld: 14, systemBase: 10, systemDepthPenalty: 0.5, victorBonus: 2
    },
    combat: {
      shakeIntensity: 6, shakeDecay: 0.012,
      overclockMultiplier: 3, moduleSlotLimit: 3, stunTurnsDefault: 3,
      particleCount: 8, particleLife: 500, particleDrag: 0.97,
      lowHpThreshold: 0.3
    },
    enemyAI: {
      sightRange: { tracker: 20, sentinel: 6, default: 8 },
      alertTimer: 8, flankRange: 4, sentinelShootRange: 6,
      soundPropagation: { combat: 8, shoot: 10, ability: 12 }
    },
    scaling: {
      droneHpScale: 0.3, droneAtkScale: 0.2, droneDefPerDepth: 0.5,
      dungeonDigBase: 0.35, dungeonDigPerDepth: 0.03
    },
    timeCosts: { npcInteraction: 2, noticeBoard: 1 },
    intervals: {
      npcComm: 12, ambientThought: 20, thoughtCooldown: 5,
      overworldThoughtCooldown: 15, morningThoughtLimit: 10
    },
    bubble: {
      maxChars: 36, fadeSteps: 5, lineDelay: 200,
      thoughtFadeSteps: 5, thoughtRevealSpeed: 30, soundAlertTimer: 8
    },
    rendering: {
      scanlineStride: 3,
      lighting: { bright: 0.97, penumbra: 0.88, explored: 0.72, unexplored: 0.96, staticFalloff: 0.6 },
      glow: { item: 0.15, module: 0.25, npc: 0.15, systemNpc: 0.2, enemy: 0.25, player: 0.2, cloakGlow: 0.12, cloakSprite: 0.35 },
      hpThresholds: { mid: 0.5, low: 0.25 },
      timeThresholds: { danger: 0.95, warning: 0.75 },
      npcTagDistance: 10, npcTagDimDistance: 5, sentinelBeamAlpha: 0.12,
      wallShadow: { alpha: 0.35, size: 0.25, cornerAlpha: 0.2 }
    },
    effects: {
      startScreen: { glitchChance: 0.02, overlayAlpha: 0.75, glowAlpha: 0.08, borderAlpha: 0.15,
                      taglineMs: 8000, taglineVisibleMs: 3000, pulseDivisor: 500,
                      fx: { color: '#556', dimColor: '#223', size: 14, duration: 80, charDelay: 8, flicker: 30 } },
      dream: { pulseRate: 0.002, darkness: 0.55, scanlineAlpha: 0.12, vignetteAlpha: 0.6,
               glitchChance: 0.07, glitchAlpha: 0.03, spacePromptMs: 1500, spaceBlinkMs: 600,
               depthMin: 1, depthMax: 3,
               textFx: { color: '#4ef', dimColor: '#0a2a2a', size: 11, duration: 80, charDelay: 8, flicker: 40 } },
      textFx: {
        systemBubble: { dimColor: '#1a3030', size: 11, duration: 60, charDelay: 6, flicker: 25 },
        thought:      { color: '#4ef', dimColor: '#1a4040', size: 11, duration: 60, charDelay: 6, flicker: 25 },
        choice:       { dimColor: '#1a1530', size: 11, duration: 60, charDelay: 6, flicker: 25 },
        choiceOption:  { dimColor: '#1a1530', size: 11, duration: 60, charDelay: 4, flicker: 20 },
        cutscene:     { dimColor: '#1a4a4a', size: 15, duration: 100, charDelay: 8, flicker: 30 }
      },
      curfew: { redAlpha: 0.25, smokeMultiplier: 8, pulseRate: 0.002 },
      corruption: { minDepth: 3, intensity: 0.01, chance: 0.05, alpha: 0.03 },
      alert: { overlayAlpha: 0.06 },
      depthGlitch: { ratePerDepth: 0.002, minAlpha: 0.06, maxAlpha: 0.12 },
      timeOfDay: { startDarkness: 0.6, maxAlpha: 0.4, color: '#000008' },
      systemColdAlpha: 0.03,
      soundWaveAlpha: 0.15, soundWaveLife: 500
    },
    confidantEffects: {
      lena:   { curfewDroneReduction: 4, curfewDroneMin: 4 },
      victor: { fovBonus: 2 },
      marta:  { rentReduction: 10, rentMin: 10 },
      emil:   { skipToDepth: 2 }
    },
    endings: {
      revelation: { title: 'THE DOOR WAS ALWAYS OPEN', color: '#0ff' },
      curfew:     { title: 'CURFEW VIOLATION', color: '#f44' },
      eviction:   { title: 'EVICTION NOTICE', color: '#f44' },
      shutdown:   { title: 'SYSTEM SHUTDOWN', color: '#f44' }
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
