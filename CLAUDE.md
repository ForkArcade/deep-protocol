# Deep Protocol — ForkArcade Roguelike

Cyberpunk narrative roguelike: town overworld (sprite-based) + system dungeons (ASCII palette) in one unified world. Day cycle, economy, curfew, NPC allegiance, module system, multi-graph narrative.

## File structure

| File | LOC | Description |
|------|----:|-------------|
| `text-fx.js` | 83 | Split-flap text animation (Solari board style) (`window.TextFX`) |
| `data.js` | 657 | All `FA.register` calls: config, NPCs, behaviors, enemies, items, modules, dialogues, thoughts, cutscenes, narrative |
| `core.js` | 552 | Map gen (ROT.Map), FOV (ROT.FOV), pathfinding (ROT.Path), collision, map registry, bubble/thought queue, narrative helpers (`window.Core`) |
| `npc.js` | 296 | NPC init (allegiance shuffle), scheduling, movement, dialogue (`window.NPC`) |
| `game.js` | 1129 | Movement, combat, modules, AI, system entry/exit, day cycle, curfew, economy, dreams, endings (`window.Game`) |
| `render.js` | 666 | Map (town sprites / dungeon palette), entities, lighting/FOV, effects (`window.Render`) |
| `render-ui.js` | 363 | HUD panel, system bubbles, thought bubbles, choice menu, game over, cutscene (`window.RenderUI`) |
| `main.js` | 216 | Canvas init, keybindings, input routing, game loop timers, FA.start() |
| `maps.js` | 167 | Generated from `_maps.json` — overworld grid, objects, zones |
| `sprites.js` | 523 | Generated from `_sprites.json` — tile/entity pixel art |

Do not edit: `rot.min.js`, `fa-engine.js`, `fa-renderer.js`, `fa-input.js`, `fa-audio.js`, `forkarcade-sdk.js`, `fa-narrative.js`

## Screens

`start` → `playing` → `cutscene` / `dream` → `victory` / `shutdown`

## State shape

```js
state = {
  screen,                    // 'start'|'playing'|'cutscene'|'dream'|'victory'|'shutdown'
  mapId,                     // 'town' or depth number (1-5)
  maps: {                    // unified registry — all maps
    town: { grid, entities, items, explored, effects, objects, zones },
    [depth]: { grid, entities, items, explored, rooms, effects }
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

  // UI
  systemBubble, thoughts, bubbleQueue, choiceMenu,
  shake, particles, soundWaves,

  // Turn
  turn, systemTurn, lastThoughtTurn,

  // Dream
  dreamMap, dreamExplored, dreamDepth, dreamText, dreamTimer,

  // Cutscene
  cutscene, cutsceneReturn,

  // End
  endingNode, score, finalStats
}
```

## Registries (data.js)

| Registry | Keys |
|----------|------|
| `config` | game, colors, scoring, time, economy, dungeonTiles, director, terminals, narrative, systemComms |
| `npcs` | lena, victor, marta, emil |
| `behaviors` | lena, victor, marta, emil (FA.select arrays) |
| `dialogues` | lena, victor, marta, emil (FA.select arrays) |
| `notices` | board (FA.select array) |
| `enemies` | drone, sentinel, tracker |
| `items` | gold, potion |
| `modules` | emp, cloak, scanner, overclock, firewall |
| `cutscenes` | wake, first_system, ejected, curfew, eviction, revelation |
| `narrativeText` | first_system, ejected |
| `thoughts` | morning, cafe, work, evening, system_enter, system_npc, combat, damage, low_health, pickup_data, ambient |

## Core exports (window.Core)

| Function | Purpose |
|----------|---------|
| `generateFloor(cols, rows, depth)` | ROT.Map.Digger → map, rooms, stairs, explored |
| `parseOverworldMap()` | Load town grid from MAP_DEFS, bake blocking objects as tile 9 |
| `populateFloor(map, rooms, depth)` | Spawn enemies + items scaled by depth |
| `computeVisibility(map, px, py, r)` | ROT.FOV → visibility grid 0..1 |
| `isWalkable(map, x, y)` | Tile !== 1 |
| `canStep(x, y, skip)` | Terrain + entities + player |
| `getEntityAt(x, y)` | Find entity on current map |
| `getObjectAtPos(x, y)` | Find town object (bed, terminal, etc.) |
| `hasLOS(map, x1, y1, x2, y2)` | Bresenham for AI sight |
| `moveToward(e, tx, ty)` | A* + cardinal fallback |
| `flankTarget(e, tx, ty)` | Perpendicular movement (tracker AI) |
| `randomStep(e)` | Shuffle + try 4 dirs |
| `propagateSound(x, y, r)` | Alert nearby enemies |
| `addSystemBubble(text, color)` | Enqueue/create system message |
| `addThought(text)` | Enqueue/create player thought |
| `triggerThought(category)` | FA.select from thought pool, 5-turn cooldown |
| `dismissBubbles()` | Clear active, dequeue next |
| `showNarrative(graphId, nodeId)` | Transition + show bubble + optional cutscene |
| `selectDialogue(npcId)` | FA.select from dialogue pool |
| `startCutscene(def, state)` | Enter cutscene screen |
| `triggerEnding(endingNode)` | Queue ending after cutscene |
| `changeMap(id, sx, sy)` | Switch map, move player |

## NPC exports (window.NPC)

| Function | Purpose |
|----------|---------|
| `initNPCs()` | Create 4 NPCs, shuffle allegiance (2 ally, 1 traitor, 1 neutral) |
| `getTimePeriod(t)` | Map timeOfDay → morning/midday/evening |
| `getNPCs(state)` | Filter town entities to NPCs |
| `selectNPCGoal(npc, state)` | Update goal from behavior registry |
| `npcOverworldTurn(state)` | Move all NPCs + check adjacent talk |
| `updateNPCPositions(state)` | Recompute goals on new day |
| `getNPCAt(state, x, y)` | Find NPC at position |
| `getAdjacentNPC(state, px, py)` | Find NPC within 1 tile |
| `talkToNPC(npc, state)` | Select dialogue + display + mark talked |

## Game exports (window.Game)

| Function | Purpose |
|----------|---------|
| `start()` | Reset to start screen |
| `begin()` | Init town, NPCs, narrative, start playing |
| `movePlayer(dx, dy)` | Unified: bump attack / NPC swap / system NPC talk / move / tile interactions |
| `interact()` | SPACE: dismiss bubbles, talk adjacent NPC, use town objects |
| `useModule(idx)` | Activate module (EMP/cloak/scanner/overclock/firewall) |
| `dismissCutscene()` | Skip or close cutscene |
| `dismissDream()` | Exit dream → playing |
| `dismissBubbles()` | Clear bubbles |
| `selectChoice(idx)` | Pick choice menu option |
| `dismissChoice()` | Close choice menu |

## AI (3-state: patrol → alert → hunting)

- **patrol**: Wander to random room centers
- **alert** (8-turn timer): Investigate last known position
- **hunting**: Chase player via A*; adjacent → attack
- **Sentinel**: 4-directional beam attack (6 tiles)
- **Tracker**: Flanking movement (perpendicular approach)
- **Curfew drones**: Always hunting, spawned on town map at curfew

## Combat

```
dmg = max(1, (atk - def + rand(-1, 2)) * multiplier)
```
Overclock = 3x multiplier next hit. Firewall absorbs damage first.

## Modules

| Module | Effect |
|--------|--------|
| EMP | Stun enemies in radius 3 for 3 turns |
| Cloak | Invisible for 8 turns |
| Scanner | Reveal all entities on current map |
| Overclock | 3x damage on next attack |
| Firewall | Absorb next 10 damage |

## Day cycle

`timeOfDay` 0→60 per day. Periods: morning (0-20), midday (20-40), evening (40-60). Curfew at 50. Sleep resets day, charges rent, may trigger dream.

## Score

```
score = totalKills × killMultiplier + credits × goldMultiplier + systemVisits × depthBonus + days × dayBonus
```

## Endings

| Node | Trigger |
|------|---------|
| `revelation` | Victory — complete the system |
| `curfew` | Killed by curfew drones |
| `eviction` | Can't pay rent |
| `shutdown` | HP reaches 0 in dungeon |

## Rendering

- **Town**: Sprite-based tiles from `_sprites.json`, autotile walls (neighbor mask), objects overlay, time-of-day darkening
- **Dungeon**: Palette-based ASCII, depth-dependent colors, 3D wall perspective (cap/face/sides), corruption scanlines at depth ≥ 3
- **Dream**: Dungeon rendering + purple tint + flicker + scrambled text
- **HUD**: 3-row panel — HP/ATK/DEF/credits/day (row 1), modules/buffs (row 2), context actions/NPC tags (row 3)
- **Bubbles**: Typewriter system bubble (centered) + thought bubble (follows player)

## Engine API (window.FA)

- **State**: `FA.resetState(obj)`, `FA.getState()`, `FA.setState(key, val)`
- **Registry**: `FA.register(reg, id, def)`, `FA.lookup(reg, id)`, `FA.lookupAll(reg)`
- **Events**: `FA.on(event, fn)`, `FA.emit(event, data)`
- **Game loop**: `FA.setUpdate(fn)`, `FA.setRender(fn)`, `FA.start()` — dt in milliseconds
- **Layers**: `FA.addLayer(name, drawFn, order)`, `FA.renderLayers()`
- **Draw**: `FA.draw.clear/rect/text/bar/circle/sprite/pushAlpha/popAlpha`
- **Input**: `FA.bindKey(action, keys)`, `FA.isAction(action)`
- **Audio**: `FA.defineSound(name, fn)`, `FA.playSound(name)`
- **Effects**: `FA.addFloat(x, y, text, color, dur)`, `FA.updateFloats(dt)`, `FA.drawFloats()`
- **Narrative**: `FA.narrative.init(cfg)`, `.transition(graph, node)`, `.setVar(name, val)`, `.getVar(name)`
- **Content selection**: `FA.select(entries)` — first matching entry wins
- **Utils**: `FA.rand(min,max)`, `FA.pick(arr)`, `FA.shuffle(arr)`, `FA.uid()`
