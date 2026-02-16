# Roguelike — ForkArcade

Procedural dungeons, permadeath, tile-based movement, turn-based combat.

## File structure

| File | Description |
|------|-------------|
| `data.js` | Data registration: `FA.register('enemies', ...)`, `FA.register('items', ...)`, config, behaviors, narrative |
| `game.js` | Logic: map generation, movement, combat, AI, turns |
| `render.js` | Rendering layers: map, entities, floats, UI, overlay |
| `main.js` | Entry point: keybindings, event wiring, game loop, `ForkArcade.onReady/submitScore` |

Files copied by the platform (do not edit):
- `fa-engine.js`, `fa-renderer.js`, `fa-input.js`, `fa-audio.js`, `fa-narrative.js` — engine
- `forkarcade-sdk.js` — SDK
- `sprites.js` — generated from `_sprites.json`

## Engine API (window.FA)

- **Event bus**: `FA.on(event, fn)`, `FA.emit(event, data)`, `FA.off(event, fn)`
- **State**: `FA.resetState(obj)`, `FA.getState()`, `FA.setState(key, val)`
- **Registry**: `FA.register(registry, id, def)`, `FA.lookup(registry, id)`, `FA.lookupAll(registry)`
- **Game loop**: `FA.setUpdate(fn)`, `FA.setRender(fn)`, `FA.start()`, `FA.stop()`
- **Canvas**: `FA.initCanvas(id, w, h)`, `FA.getCtx()`, `FA.getCanvas()`
- **Layers**: `FA.addLayer(name, drawFn, order)`, `FA.renderLayers()`
- **Draw**: `FA.draw.clear/rect/text/bar/circle/sprite/withAlpha`
- **Input**: `FA.bindKey(action, keys)`, `FA.isAction(action)`, `FA.consumeClick()`
- **Audio**: `FA.defineSound(name, fn)`, `FA.playSound(name)` — built-in: hit, pickup, death, step, spell, levelup
- **Effects**: `FA.addFloat(x, y, text, color, dur)`, `FA.addEffect(obj)`, `FA.updateFloats(dt)`
- **Narrative**: `FA.narrative.init(cfg)`, `.transition(nodeId, event)`, `.setVar(name, val, reason)`
- **Utils**: `FA.rand(min,max)`, `FA.clamp`, `FA.pick(arr)`, `FA.shuffle(arr)`, `FA.uid()`

## Events

| Event | Description |
|-------|-------------|
| `input:action` | Key bound to action |
| `entity:damaged` | Something took damage |
| `entity:killed` | Something died |
| `item:pickup` | Item picked up |
| `game:over` | Game ended (victory/score) |
| `state:changed` | State changed |
| `narrative:transition` | Narrative graph transition |

## Scoring

`ForkArcade.submitScore(score)` in the `game:over` handler.

## Sprite fallback

`FA.draw.sprite(category, name, x, y, size, fallbackChar, fallbackColor, frame)` — renders sprite frame, or fallback text when no sprite exists. Frame index selects variant.
