// maps.js — arena definitions (logical units, 1600x900 canvas)
// Each platform: { x, y, w, h } — x,y = top-left corner

export const MAPS = [
  {
    name: 'Open Field',
    platformColor: '#ddeeff',
    bgTint: 0x0d1520,
    platforms: [
      // Ground
      { x: 0,    y: 820, w: 1600, h: 80 },
      // Floating mid
      { x: 200,  y: 580, w: 280,  h: 40 },
      { x: 1120, y: 580, w: 280,  h: 40 },
      { x: 640,  y: 440, w: 320,  h: 40 },
    ],
    spawnP1: { x: 300,  y: 760 },
    spawnP2: { x: 1300, y: 760 },
  },
  {
    name: 'Castle',
    platformColor: '#e8eef4',
    bgTint: 0x160e08,
    platforms: [
      // Ground left
      { x: 0,    y: 820, w: 640,  h: 80 },
      // Ground right
      { x: 960,  y: 820, w: 640,  h: 80 },
      // Central elevated ground
      { x: 640,  y: 740, w: 320,  h: 40 },
      // Mid levels
      { x: 120,  y: 600, w: 240,  h: 40 },
      { x: 1240, y: 600, w: 240,  h: 40 },
      { x: 500,  y: 500, w: 200,  h: 40 },
      { x: 900,  y: 500, w: 200,  h: 40 },
      // Top platform
      { x: 640,  y: 330, w: 320,  h: 40 },
    ],
    spawnP1: { x: 250,  y: 760 },
    spawnP2: { x: 1350, y: 760 },
  },
  {
    name: 'Narrow',
    platformColor: '#f0f4f8',
    bgTint: 0x080e18,
    platforms: [
      // Small ground
      { x: 560,  y: 860, w: 480,  h: 40 },
      // Staggered stairs left
      { x: 180,  y: 720, w: 200,  h: 40 },
      { x: 60,   y: 560, w: 200,  h: 40 },
      { x: 200,  y: 400, w: 200,  h: 40 },
      { x: 80,   y: 240, w: 200,  h: 40 },
      // Staggered stairs right
      { x: 1220, y: 720, w: 200,  h: 40 },
      { x: 1340, y: 560, w: 200,  h: 40 },
      { x: 1200, y: 400, w: 200,  h: 40 },
      { x: 1320, y: 240, w: 200,  h: 40 },
      // Center top
      { x: 680,  y: 180, w: 240,  h: 40 },
    ],
    spawnP1: { x: 650,  y: 800 },
    spawnP2: { x: 950,  y: 800 },
  },
  {
    name: 'Bridge',
    platformColor: '#eaecf0',
    bgTint: 0x120c04,
    platforms: [
      // Ground left and right (no center floor)
      { x: 0,    y: 820, w: 420,  h: 80 },
      { x: 1180, y: 820, w: 420,  h: 80 },
      // Central bridge
      { x: 340,  y: 660, w: 920,  h: 40 },
      // Approach ramps / ledges
      { x: 160,  y: 560, w: 200,  h: 40 },
      { x: 1240, y: 560, w: 200,  h: 40 },
      // Upper flanks
      { x: 60,   y: 420, w: 220,  h: 40 },
      { x: 1320, y: 420, w: 220,  h: 40 },
      // Top center
      { x: 620,  y: 370, w: 360,  h: 40 },
    ],
    spawnP1: { x: 180,  y: 760 },
    spawnP2: { x: 1420, y: 760 },
  },
  {
    name: 'Scattered',
    platformColor: '#e8eaf8',
    bgTint: 0x0e0818,
    platforms: [
      // Tiny center footing
      { x: 680,  y: 860, w: 240,  h: 40 },
      // Mid layer
      { x: 80,   y: 700, w: 240,  h: 40 },
      { x: 440,  y: 640, w: 180,  h: 40 },
      { x: 980,  y: 640, w: 180,  h: 40 },
      { x: 1280, y: 700, w: 240,  h: 40 },
      // Upper layer
      { x: 200,  y: 500, w: 200,  h: 40 },
      { x: 700,  y: 490, w: 200,  h: 40 },
      { x: 1200, y: 500, w: 200,  h: 40 },
      // Top layer
      { x: 60,   y: 310, w: 200,  h: 40 },
      { x: 480,  y: 290, w: 200,  h: 40 },
      { x: 920,  y: 290, w: 200,  h: 40 },
      { x: 1340, y: 310, w: 200,  h: 40 },
    ],
    spawnP1: { x: 200,  y: 645 },
    spawnP2: { x: 1400, y: 645 },
  },
  {
    name: 'Void',
    platformColor: '#e0eaf8',
    bgTint: 0x000810,
    platforms: [
      // No ground -- players who fall are respawned by arena clamp
      // Large center platforms
      { x: 480,  y: 780, w: 280,  h: 40 },
      { x: 840,  y: 780, w: 280,  h: 40 },
      // Mid flanks
      { x: 80,   y: 620, w: 220,  h: 40 },
      { x: 660,  y: 580, w: 280,  h: 40 },
      { x: 1300, y: 620, w: 220,  h: 40 },
      // Upper layer
      { x: 200,  y: 420, w: 200,  h: 40 },
      { x: 700,  y: 390, w: 200,  h: 40 },
      { x: 1200, y: 420, w: 200,  h: 40 },
      // Top
      { x: 620,  y: 220, w: 360,  h: 40 },
    ],
    spawnP1: { x: 580,  y: 760 },
    spawnP2: { x: 1020, y: 760 },
  },
];

export function randomMap() {
  return MAPS[Math.floor(Math.random() * MAPS.length)];
}
