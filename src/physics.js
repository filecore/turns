// physics.js — gravity, platform collision, wall jump, double jump

export const GRAVITY       = 1400;   // px/s^2 — lower gives ~290-unit single jump, reachable platforms
export const TERMINAL_VEL  = 1600;   // px/s
export const JUMP_VEL      = -900;
export const WALL_JUMP_VX  = 480;
export const WALL_JUMP_VY  = -820;
export const MOVE_SPEED    = 340;
export const FRICTION      = 0.82;   // horizontal friction when grounded (per frame factor)

export function createPlayerPhysics() {
  return {
    x: 0, y: 0,
    vx: 0, vy: 0,
    onGround: false,
    onWall: 0,          // -1 left wall, 0 none, 1 right wall
    jumpsLeft: 1,       // extra jumps (double jump counts as 1 stored)
    wallJumpCooldown: 0,
    coyoteTimer: 0,     // brief window to jump after walking off a ledge
  };
}

// AABB overlap test
function overlaps(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// Resolve player circle vs platforms
// Player is treated as a circle for display but AABB for physics (radius-based box)
export function resolvePlatforms(phys, radius, platforms, dt) {
  const diameter = radius * 2;
  let px = phys.x - radius;
  let py = phys.y - radius;

  phys.onGround = false;
  phys.onWall   = 0;

  for (const plat of platforms) {
    if (!overlaps(px, py, diameter, diameter, plat.x, plat.y, plat.w, plat.h)) continue;

    const overlapLeft   = (px + diameter) - plat.x;
    const overlapRight  = (plat.x + plat.w) - px;
    const overlapTop    = (py + diameter) - plat.y;
    const overlapBottom = (plat.y + plat.h) - py;

    const minH = Math.min(overlapLeft, overlapRight);
    const minV = Math.min(overlapTop, overlapBottom);

    if (minV < minH) {
      // Vertical collision
      if (overlapTop < overlapBottom) {
        // Landing on top
        phys.y = plat.y - radius;
        if (phys.vy > 0) phys.vy = 0;
        phys.onGround = true;
        phys.jumpsLeft = 1;
      } else {
        // Hitting ceiling
        phys.y = plat.y + plat.h + radius;
        if (phys.vy < 0) phys.vy = 0;
      }
    } else {
      // Horizontal collision (wall)
      if (overlapLeft < overlapRight) {
        phys.x = plat.x - radius;
        phys.onWall = 1;
      } else {
        phys.x = plat.x + plat.w + radius;
        phys.onWall = -1;
      }
      if (phys.vx !== 0) phys.vx = 0;
    }
    // Recompute box after push
    px = phys.x - radius;
    py = phys.y - radius;
  }
}

export function applyGravity(phys, dt) {
  phys.vy += GRAVITY * dt;
  if (phys.vy > TERMINAL_VEL) phys.vy = TERMINAL_VEL;
}

export function applyVelocity(phys, dt) {
  phys.x += phys.vx * dt;
  phys.y += phys.vy * dt;
}

// Clamp player inside arena bounds
// Also sets onWall so players can wall-jump off the arena edges
export function clampToArena(phys, radius, arenaW, arenaH) {
  if (phys.x - radius < 0)       { phys.x = radius;          if (phys.vx < 0) phys.vx = 0; phys.onWall = -1; }
  if (phys.x + radius > arenaW)  { phys.x = arenaW - radius; if (phys.vx > 0) phys.vx = 0; phys.onWall =  1; }
  if (phys.y - radius < 0)        { phys.y = radius;            if (phys.vy < 0) phys.vy = 0; }
  if (phys.y + radius > arenaH)  { phys.y = arenaH - radius;  if (phys.vy > 0) phys.vy = 0; }
}

export function doJump(phys) {
  // Ground or coyote-time jump
  if (phys.onGround || phys.coyoteTimer > 0) {
    phys.vy = JUMP_VEL;
    phys.onGround   = false;
    phys.coyoteTimer = 0;
    return true;
  }
  if (phys.onWall !== 0 && phys.wallJumpCooldown <= 0) {
    phys.vy = WALL_JUMP_VY;
    phys.vx = -phys.onWall * WALL_JUMP_VX;
    phys.wallJumpCooldown = 0.25;
    phys.onWall = 0;
    return true;
  }
  if (phys.jumpsLeft > 0) {
    phys.vy = JUMP_VEL * 0.88;
    phys.jumpsLeft--;
    return true;
  }
  return false;
}
