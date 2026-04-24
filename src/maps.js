// maps.js — arena definitions (logical units, 1600x900 canvas)
// Each platform: { x, y, w, h } — x,y = top-left corner

export const MAPS = [
  {
    name: 'Open Field',
    platforms: [
      // Ground
      { x: 0,    y: 820, w: 1600, h: 80 },
      // Floating mid
      { x: 200,  y: 580, w: 280,  h: 18 },
      { x: 1120, y: 580, w: 280,  h: 18 },
      { x: 640,  y: 440, w: 320,  h: 18 },
    ],
    spawnP1: { x: 300,  y: 760 },
    spawnP2: { x: 1300, y: 760 },
  },
  {
    name: 'Castle',
    platforms: [
      // Ground left
      { x: 0,    y: 820, w: 640,  h: 80 },
      // Ground right
      { x: 960,  y: 820, w: 640,  h: 80 },
      // Central elevated ground
      { x: 640,  y: 740, w: 320,  h: 18 },
      // Mid levels
      { x: 120,  y: 600, w: 240,  h: 18 },
      { x: 1240, y: 600, w: 240,  h: 18 },
      { x: 500,  y: 500, w: 200,  h: 18 },
      { x: 900,  y: 500, w: 200,  h: 18 },
      // Top platform
      { x: 640,  y: 330, w: 320,  h: 18 },
    ],
    spawnP1: { x: 250,  y: 760 },
    spawnP2: { x: 1350, y: 760 },
  },
  {
    name: 'Narrow',
    platforms: [
      // Small ground
      { x: 560,  y: 860, w: 480,  h: 40 },
      // Staggered stairs left
      { x: 180,  y: 720, w: 200,  h: 18 },
      { x: 60,   y: 560, w: 200,  h: 18 },
      { x: 200,  y: 400, w: 200,  h: 18 },
      { x: 80,   y: 240, w: 200,  h: 18 },
      // Staggered stairs right
      { x: 1220, y: 720, w: 200,  h: 18 },
      { x: 1340, y: 560, w: 200,  h: 18 },
      { x: 1200, y: 400, w: 200,  h: 18 },
      { x: 1320, y: 240, w: 200,  h: 18 },
      // Center top
      { x: 680,  y: 180, w: 240,  h: 18 },
    ],
    spawnP1: { x: 650,  y: 800 },
    spawnP2: { x: 950,  y: 800 },
  },
];

export function randomMap() {
  return MAPS[Math.floor(Math.random() * MAPS.length)];
}
