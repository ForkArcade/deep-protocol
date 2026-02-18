#!/usr/bin/env node
// Generate dungeon tile sprites from PALETTES data
// Same frame patterns as overworld tiles, different palette per depth
// Run: node _gen_dungeon_sprites.js

var fs = require('fs');
var path = require('path');

var PALETTES = [
  { C:'#322a22', F:'#2a2520', P:'#3a3228', S:'#241e18', I:'#1a1610', L:'#3a3025', A:'#1a1814', B:'#1c1a16', D:'#22201a' },
  { C:'#181d30', F:'#252b42', P:'#2e3550', S:'#1f2538', I:'#10141f', L:'#333c55', A:'#161a28', B:'#181c2a', D:'#1e2335' },
  { C:'#1d1d2e', F:'#2d2b3e', P:'#383545', S:'#272536', I:'#15141e', L:'#3e3c50', A:'#1b1a27', B:'#1d1c29', D:'#252333' },
  { C:'#261d18', F:'#3b2b20', P:'#4a3528', S:'#30251c', I:'#1a1410', L:'#4a3c30', A:'#221a16', B:'#241c18', D:'#2e231e' },
  { C:'#2a1818', F:'#3e2222', P:'#4c2b2b', S:'#331c1c', I:'#1c1010', L:'#4c3030', A:'#261515', B:'#281717', D:'#321e1e' },
  { C:'#301414', F:'#451e1e', P:'#552828', S:'#3a1818', I:'#200e0e', L:'#552a2a', A:'#2a1212', B:'#2c1414', D:'#381a1a' }
];

// Read existing _sprites.json
var spritesPath = path.join(__dirname, '_sprites.json');
var sprites = JSON.parse(fs.readFileSync(spritesPath, 'utf8'));

// Extract frame templates from existing overworld tiles
var wallFrames = sprites.tiles.wall.frames;
var floorFrames = sprites.tiles.floor.frames;

// Generate dungeon tiles for each depth
for (var d = 0; d < PALETTES.length; d++) {
  var pal = PALETTES[d];

  // Floor sprite: 2 frames, palette ABD
  sprites.tiles['dungeon_d' + d + '_floor'] = {
    w: 10, h: 10,
    palette: { A: pal.A, B: pal.B, D: pal.D },
    origin: [0, 0],
    frames: floorFrames
  };

  // Wall sprite: 16 frames, palette CFPSIL
  sprites.tiles['dungeon_d' + d + '_wall'] = {
    w: 10, h: 10,
    palette: { C: pal.C, F: pal.F, P: pal.P, S: pal.S, I: pal.I, L: pal.L },
    origin: [0, 0],
    frames: wallFrames
  };
}

// Special dungeon tiles (depth-independent)
sprites.tiles['dungeon_stairs'] = {
  w: 10, h: 10,
  palette: { B: '#001a1a', H: '#4cf', T: '#ffffff' },
  origin: [0, 0],
  frames: [[
    'BBBBBBBBBB',
    'BBBBBBBBBB',
    'BBHHHHHHBB',
    'BBHBBBBHBB',
    'BBHBTBBHBB',
    'BBHBBBBHBB',
    'BBHBBBBHBB',
    'BBHHHHHHBB',
    'BBBBBBBBBB',
    'BBBBBBBBBB'
  ]]
};

sprites.tiles['dungeon_terminal'] = {
  w: 10, h: 10,
  palette: { B: '#0a2a2a', C: '#00ffff', F: '#161a28' },
  origin: [0, 0],
  frames: [[
    'FFFFFFFFFF',
    'FFBBBBBBFF',
    'FFBCCCCBFF',
    'FFBBBBBBFF',
    'FFBBBBBBFF',
    'FFBBBBBBFF',
    'FFBBBBBBFF',
    'FFBCCCCBFF',
    'FFBBBBBBFF',
    'FFFFFFFFFF'
  ]]
};

sprites.tiles['dungeon_terminal_used'] = {
  w: 10, h: 10,
  palette: { B: '#0a1515', D: '#223344', F: '#161a28' },
  origin: [0, 0],
  frames: [[
    'FFFFFFFFFF',
    'FFBBBBBBFF',
    'FFBDDDDBFF',
    'FFBBBBBBFF',
    'FFBBBBBBFF',
    'FFBBBBBBFF',
    'FFBBBBBBFF',
    'FFBDDDDBFF',
    'FFBBBBBBFF',
    'FFFFFFFFFF'
  ]]
};

// Write updated _sprites.json
fs.writeFileSync(spritesPath, JSON.stringify(sprites, null, 2) + '\n');

// Count what was generated
var tileKeys = Object.keys(sprites.tiles);
var dungeonKeys = tileKeys.filter(function(k) { return k.indexOf('dungeon_') === 0; });
var totalFrames = 0;
dungeonKeys.forEach(function(k) { totalFrames += sprites.tiles[k].frames.length; });
console.log('Generated ' + dungeonKeys.length + ' dungeon tile sprites (' + totalFrames + ' frames total)');
console.log('Sprites: ' + dungeonKeys.join(', '));
