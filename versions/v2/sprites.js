// sprites.js — ForkArcade pixel art sprites
// Generated from _sprites.json by create_sprite tool

var SPRITE_DEFS = {}

function drawSprite(ctx, spriteDef, x, y, size, frame) {
  if (!spriteDef) return false
  frame = frame || 0
  frame = frame % spriteDef.frames.length
  var key = size + '_' + frame
  if (!spriteDef._c) spriteDef._c = {}
  if (!spriteDef._c[key]) {
    var cv = document.createElement('canvas')
    cv.width = size
    cv.height = size
    var cc = cv.getContext('2d')
    var pixels = spriteDef.frames[frame]
    var pw = size / spriteDef.w
    var ph = size / spriteDef.h
    for (var row = 0; row < spriteDef.h; row++) {
      var line = pixels[row]
      for (var col = 0; col < spriteDef.w; col++) {
        var ch = line[col]
        if (ch === ".") continue
        var color = spriteDef.palette[ch]
        if (!color) continue
        cc.fillStyle = color
        cc.fillRect(col * pw, row * ph, Math.ceil(pw), Math.ceil(ph))
      }
    }
    spriteDef._c[key] = cv
  }
  var ox = spriteDef.origin[0] * (size / spriteDef.w)
  var oy = spriteDef.origin[1] * (size / spriteDef.h)
  ctx.drawImage(spriteDef._c[key], x - ox, y - oy)
  return true
}

function getSprite(category, name) {
  return SPRITE_DEFS[category] && SPRITE_DEFS[category][name] || null
}

function spriteFrames(spriteDef) {
  return spriteDef ? spriteDef.frames.length : 0
}
