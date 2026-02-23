# Deep Protocol — ForkArcade Roguelike

Cyberpunk narrative roguelike: town overworld (sprite-based) + system dungeons (FOV-based) in one unified world. Day cycle, economy, curfew, NPC allegiance, module system, multi-graph narrative.

## Architecture: CDN engine + local game code

Engine loaded from CDN (`cdn.jsdelivr.net/gh/ForkArcade/forkarcade-engine@2.3.0/`). Game code is local. **Never recreate CDN-provided functions locally.**

### CDN provides (do NOT reimplement)

| CDN file | Globals provided |
|----------|-----------------|
| `fa-engine.js` | `window.FA` — state, registry, events, game loop, layers, draw API |
| `fa-renderer.js` | `window.getLayout()`, `window.getSprite(cat, name)`, `window.drawSprite(ctx, def, x, y, size, frame)`, `window.spriteFrames(def)` |
| `fa-textfx.js` | `window.TextFX.render(ctx, text, elapsed, x, y, opts)`, `window.TextFX.totalTime(text, opts)` |
| `fa-input.js` | Input handling for FA |
| `fa-audio.js` | Audio for FA |
| `fa-ui.js` | `FA.ui` — immediate-mode UI primitives (NOT game-specific HUD) |
| `fa-narrative.js` | `FA.narrative` — multi-graph narrative engine |
| `skins/cyber.js` | Cyberpunk theme for FA.ui |
| `lib/rot.min.js` | `ROT.Map.Digger`, `ROT.Path.AStar`, `ROT.FOV.PreciseShadowcasting` |
| `forkarcade-sdk.js` | Platform bridge (filtered out by gameLoader) |

### `getLayout()` contract (most-used CDN function)

```js
var L = getLayout();
// L.W, L.H        — canvas width/height (responsive, changes on resize)
// L.ts             — tile size in pixels (computed from canvas size)
// L.ox, L.oy       — map offset (centering)
// L.mapW, L.mapH   — map area in pixels
// L.panelY          — Y position of bottom panel
// L.cols, L.rows    — grid dimensions
```

## Local file structure

| File | LOC | Description |
|------|----:|-------------|
| `data.js` | 39 | Technical config only: game grid, colors, scoring, time, economy, tiles, lights. Registers to `FA.register('config', ...)` |
| `_narrative.json` | 901 | **All game content**: NPCs, dialogues, thoughts, cutscenes, enemies, items, modules, behaviors, locations, narrative graphs, director messages |
| `core.js` | 632 | Map gen (ROT.Map), FOV, pathfinding, collision, Location API, bubble/thought system, narrative helpers (`window.Core`, `window.Location`) |
| `npc.js` | 552 | NPC init (allegiance shuffle), scheduling, movement, dialogue, dreams, time warnings (`window.NPC`) |
| `combat.js` | 425 | Attack, damage, AI turns, item pickup, modules, terminal hacking (`window.Combat`) |
| `game.js` | 698 | Game orchestrator: start, movement, interaction, system entry/exit, economy, endings, memories (`window.Game`) |
| `render.js` | 717 | Map rendering (sprites + autotile), entities, lighting/FOV, effects, scanlines (`window.Render`) |
| `render-ui.js` | 420 | HUD panel, system bubbles, thought bubbles, choice menu, game over, cutscene (`window.RenderUI`) |
| `main.js` | 204 | Canvas init, keybindings, input routing, game loop timers, `Render.setup()`, `RenderUI.setup()`, `FA.start()` |
| `maps.js` | 183 | Generated from `_maps.json` — `getMapGrid()`, `getMapObjects()`, `getMapZones()` |
| `sprites.js` | 28 | Generated from `_sprites.json` — `FA.assets.spritesheet`, `FA.assets.spriteDefs` |

### Data split: `data.js` vs `_narrative.json`

- **`data.js`** — technical numbers: grid size, colors, scoring formula, timing, economy. Loaded synchronously as `<script>`.
- **`_narrative.json`** — all game content: NPCs, dialogues, cutscenes, enemies, items, modules, locations. Fetched async by `Game.begin()` → `_registerNarrative()`.
- **Rule**: game tuning and content goes in `_narrative.json`, not in JS files.

## Screens

`start` → `playing` → `cutscene` / `dream` → `victory` / `shutdown`

## State shape (initialized in `_startPlaying()`)

```js
state = {
  screen,                    // 'start'|'playing'|'cutscene'|'dream'|'victory'|'shutdown'
  mapId,                     // 'town' or 'system_d1'..'system_d5'
  maps: {                    // unified registry — all maps
    town: { grid, entities, items, explored, effects, objects, zones },
    system_dN: { grid, entities, items, explored, rooms, effects }
  },
  map,                       // shortcut → maps[mapId].grid
  depth,                     // 0=town, 1-5=dungeon
  visible,                   // FOV 2D array (0..1)

  player: { x, y, hp, maxHp, atk, def, gold, kills, modules,
            cloakTurns, overclockActive, firewallHp },

  // Time & economy
  day, timeOfDay, credits, rent, workedToday,

  // Progression
  systemRevealed, systemVisits, totalKills, totalGold,
  terminalsHacked, directorMsgShown,

  // UI (created on demand, not all present at init)
  systemBubble,              // { lines, color, timer, done, source? }
  thoughts,                  // [{ text, timer, done }]
  choiceMenu,                // { title, options, timer, selectedIndex } — created by showChoiceMenu()
  shake, shakeX, shakeY, particles, soundWaves,

  // Turn
  turn, systemTurn,

  // Dream (set when entering dream)
  dreamMap, dreamExplored, dreamDepth, dreamText, dreamTimer,

  // Cutscene (set by Core.startCutscene)
  cutscene, cutsceneReturn,

  // End (set by endGame)
  endingNode, score, finalStats,

  // Internal
  mapVersion,                // incremented to force map re-render
  townReturnPos,             // saved position before system entry
  _activeMemories,           // meta-progression milestones
  _pendingEnd,               // deferred ending after cutscene
  _pendingDialogueChoice     // NPC dialogue choice awaiting bubble dismiss
}
```

## Registries

`data.js` registers: `config.game`, `config.colors`, `config.scoring`, `config.time`, `config.economy`, `config.dungeonTiles`, `config.lights`

`_narrative.json` registers (via `_registerNarrative()`):
- **Dicts**: behaviors, dialogues, thoughts, cutscenes, narrativeText, relationshipEffects, actors, locations, npcs, enemies, items, modules
- **Configs**: needs, jobs, moods, cafe, garden, busyLines, moodDialogues, memories, systemComms, terminals, spawner, director
- **Other**: notices.board

## Exports

### window.Location (core.js)
`get(mapId)`, `tileset(m)`, `hasEffect(m, name)`, `hasFeature(m, name)`, `depth(m)`, `isSystem(m)`

### window.Core (core.js)
`generateFloor`, `parseOverworldMap`, `populateFloor`, `computeVisibility`, `isWalkable`, `canStep`, `getEntityAt`, `getObjectAtPos`, `hasLOS`, `moveToward`, `flankTarget`, `randomStep`, `propagateSound`, `addSystemBubble`, `addThought`, `triggerThought`, `dismissBubbles`, `tickBubbles`, `showNarrative`, `selectDialogue`, `startCutscene`, `triggerEnding`, `changeMap`, `isConfidant`, `findEmptyInRooms`, `moveTowardSimple`

### window.Combat (combat.js)
`attack`, `applyDamage`, `enemyTurn`, `pickup`, `useModule`, `hackTerminal`

### window.NPC (npc.js)
`initNPCs`, `getTimePeriod`, `getNPCs`, `selectNPCGoal`, `npcOverworldTurn`, `updateNPCPositions`, `getAdjacentNPC`, `talkToNPC`, `checkTimeWarnings`, `checkOverworldThoughts`, `showBedChoice`, `dismissDream`

### window.Game (game.js)
`start`, `begin`, `movePlayer`, `interact`, `useModule`, `dismissCutscene`, `dismissDream`, `dismissBubbles`, `choiceUp`, `choiceDown`, `confirmChoice`, `_endGame`, `_handlePlayerDeath`, `_showChoiceMenu`, `_exitSystem`

### window.Render (render.js)
`setup()`, `scanlineCanvas`

### window.RenderUI (render-ui.js)
`setup()`

## AI (3-state: patrol → alert → hunting)

- **patrol**: Wander to random room centers
- **alert** (8-turn timer): Investigate last known position
- **hunting**: Chase player via A*; adjacent → attack
- **Sentinel**: Stationary, 4-directional beam attack (6 tiles)
- **Tracker**: Flanking movement (perpendicular approach)
- **Boss**: Stationary, shoots + summons drones + taunts
- **Curfew drones**: Always hunting, spawned on town map at curfew

## Combat

```
dmg = max(1, (atk - def + rand(-1, 2)) * multiplier)
```
Overclock = 3x multiplier next hit. Firewall absorbs damage first.

## Day cycle

`timeOfDay` 0→60 per day. Periods: morning (0-20), midday (20-40), evening (40-60). Warning at 40, curfew at 52. Sleep resets day, charges rent, may trigger dream.

## Score

```
score = totalKills × 100 + credits × 10 + systemVisits × 500 + days × 50
```
