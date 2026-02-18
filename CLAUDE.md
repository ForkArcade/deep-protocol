# Deep Protocol — ForkArcade Roguelike

Cyberpunk narrative roguelike: town overworld + system dungeons in one unified world.

## File structure

| File | Description |
|------|-------------|
| `data.js` | Data registration: enemies, items, modules, config, overworld map, narrative, dialogues, thoughts |
| `core.js` | Foundation: map gen (ROT.Map), pathfinding (ROT.Path), FOV (ROT.FOV), unified collision, map registry, bubble/thought queue, narrative helpers (`window.Core`) |
| `npc.js` | NPC AI: initialization, scheduling, movement, dialogue. NPCs stored in `state.maps.town.entities` with `type: 'npc'` (`window.NPC`) |
| `game.js` | Game logic: unified movement/combat, AI, system entry/exit (via `Core.changeMap`), modules, curfew drones, day cycle, lifecycle (`window.Game`) |
| `render.js` | Rendering: unified map layer (town sprites or dungeon palette by mapId), unified entity layer (all types), conditional lighting (town=time-of-day, dungeon=FOV), effects, dream overlay (`window.Render`) |
| `render-ui.js` | UI rendering: adaptive panel (town=zone/time/NPCs, dungeon=hull/modules/depth), bubbles, thoughts, choice menu, game over, cutscene (`window.RenderUI`) |
| `main.js` | Entry point: keybindings, unified input (all gameplay through `screen === 'playing'`), game loop, `ForkArcade.onReady/submitScore` |

## Unified world architecture

### State shape

```js
state.screen = 'playing'        // 'start', 'playing', 'cutscene', 'dream', 'victory', 'shutdown'
state.mapId = 'town'            // 'town' or depth number (1, 2, 3...)
state.maps = {                  // ALL maps stored here
  town: { grid, entities: [...npc, ...curfewDrone], items: [] },
  1:    { grid, entities: [...enemy, ...systemNpc], items, explored, rooms },
}
state.map = state.maps['town'].grid  // shortcut to current grid
state.player = { x, y, hp, maxHp, atk, def, gold, kills, modules, cloakTurns, ... }
state.depth = 0                 // 0=town, 1-5=dungeon
```

- **One player** with combat stats from game start (hp/atk/def always present)
- **entities[]** on each map holds ALL entity types: `type: 'enemy'`, `'npc'`, `'system_npc'`
- **No more** `state.owPlayer`, `state.enemies`, `state.items`, `state.npcs`, `state.explored`
- **No more** `screen === 'overworld'` — town gameplay uses `screen === 'playing'`

### Map transitions

- `Core.changeMap(targetMapId, spawnX, spawnY)` — sets mapId, updates map shortcut, moves player
- `enterSystem()` → generates dungeon in `state.maps[depth]`, calls `Core.changeMap(depth, px, py)`
- `exitSystem()` → deletes dungeon map, heals player, calls `Core.changeMap('town', ...)`
- Dreams use separate `state.dreamMap` (not in maps registry)

### Collision (unified)

- `Core.canStep(x, y, skipEntity)` — terrain + ALL entities on current map + player
- `Core.getEntityAt(x, y)` — finds entity at position
- `Core.moveToward(e, tx, ty)` — A* pathfinding + fallback (simplified signature)
- `Core.propagateSound(x, y, radius)` — alerts nearby enemies (simplified signature)

### Movement (unified)

One `movePlayer(dx, dy)` for all maps:
1. Enemy at target → bump attack
2. NPC at target → swap positions
3. System NPC at target → talk
4. Terrain check → move + tile interactions

### Curfew drones

Real enemy entities spawned on town map with `curfewDrone: true` flag. Same AI/combat as dungeon enemies. Spawned at curfew, removed on sleep.

## Engine API (window.FA)

- **Event bus**: `FA.on(event, fn)`, `FA.emit(event, data)`, `FA.off(event, fn)`
- **State**: `FA.resetState(obj)`, `FA.getState()`, `FA.setState(key, val)`
- **Registry**: `FA.register(registry, id, def)`, `FA.lookup(registry, id)`, `FA.lookupAll(registry)`
- **Game loop**: `FA.setUpdate(fn)`, `FA.setRender(fn)`, `FA.start()`, `FA.stop()` — dt in milliseconds
- **Canvas**: `FA.initCanvas(id, w, h)`, `FA.getCtx()`, `FA.getCanvas()`
- **Layers**: `FA.addLayer(name, drawFn, order)`, `FA.renderLayers()` — guard with `if (!state.player) return;`
- **Draw**: `FA.draw.clear/rect/text/bar/circle/sprite/pushAlpha/popAlpha`
- **Input**: `FA.bindKey(action, keys)`, `FA.isAction(action)`, `FA.consumeClick()`
- **Audio**: `FA.defineSound(name, fn)`, `FA.playSound(name)`
- **Effects**: `FA.addFloat(x, y, text, color, dur)`, `FA.addEffect(obj)`, `FA.updateFloats(dt)`, `FA.drawFloats()`, `FA.clearEffects()`
- **Narrative**: `FA.narrative.init(cfg)`, `.transition(graphId, nodeId, event)`, `.setVar(name, val, reason)`, `.getVar(name)`, `.getNode(graphId)`
- **Content selection**: `FA.select(entries)` — first matching entry wins
- **Utils**: `FA.rand(min,max)`, `FA.clamp(val,min,max)`, `FA.pick(arr)`, `FA.shuffle(arr)`, `FA.uid()`

## Events

| Event | Description |
|-------|-------------|
| `input:action` | Key bound to action |
| `entity:damaged` | Something took damage |
| `entity:killed` | Something died |
| `item:pickup` | Item picked up |
| `game:over` | Game ended (victory/score) |
| `narrative:transition` | Narrative graph transition |
| `narrative:varChanged` | Narrative variable changed |

## Sprite fallback

`FA.draw.sprite(category, name, x, y, size, fallbackChar, fallbackColor, frame)` — renders sprite frame, or fallback text when no sprite exists.
