// renderer.js — Three.js orthographic rendering layer

import * as THREE from 'three';

export const ARENA_W = 1600;
export const ARENA_H = 900;

const PLAYER_COLORS = ['#e63946', '#457b9d'];

// Rarity corner colors
const RARITY_COLOR = { common: '#888888', uncommon: '#5577cc', rare: '#cc44aa' };

export class Renderer {
  constructor(canvas) {
    this.canvas   = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene  = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, ARENA_W, 0, ARENA_H, -100, 100);
    this.camera.position.z = 10;

    // Scale factor (logical to screen pixels)
    this.scale  = 1;
    this.shake  = { x: 0, y: 0, timer: 0, mag: 0 };

    // Background grid pattern (thin diagonal lines via canvas texture)
    this._bgTex    = this._buildBgTexture();
    this._bgMesh   = this._buildBgMesh();
    this.scene.add(this._bgMesh);

    // Groups for layered rendering
    this.platformGroup  = new THREE.Group();
    this.bulletGroup    = new THREE.Group();
    this.effectGroup    = new THREE.Group();
    this.playerGroup    = new THREE.Group();
    this.hudGroup       = new THREE.Group();
    this.scene.add(this.platformGroup, this.bulletGroup, this.effectGroup, this.playerGroup, this.hudGroup);

    // Particle pool
    this._particles = [];

    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  _buildBgTexture() {
    const size = 80;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0d0d10';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 1;
    // Diagonal grid
    for (let i = -size; i < size * 2; i += 20) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + size, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i - size, size); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(ARENA_W / size, ARENA_H / size);
    return tex;
  }

  _buildBgMesh() {
    const geo  = new THREE.PlaneGeometry(ARENA_W, ARENA_H);
    const mat  = new THREE.MeshBasicMaterial({ map: this._bgTex, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(ARENA_W / 2, ARENA_H / 2, -10);
    return mesh;
  }

  _resize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scaleX = vw / ARENA_W;
    const scaleY = vh / ARENA_H;
    this.scale = Math.min(scaleX, scaleY);

    const w = Math.round(ARENA_W * this.scale);
    const h = Math.round(ARENA_H * this.scale);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width  = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  screenToArena(sx, sy) {
    const rect   = this.canvas.getBoundingClientRect();
    const relX   = (sx - rect.left) / this.scale;
    const relY   = (sy - rect.top)  / this.scale;
    return { x: relX, y: relY };
  }

  triggerShake(mag = 6, duration = 0.18) {
    this.shake.mag   = mag;
    this.shake.timer = duration;
  }

  addParticle(x, y, vx, vy, color, life, radius) {
    const geo  = new THREE.CircleGeometry(radius, 6);
    const mat  = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, 2);
    this.effectGroup.add(mesh);
    this._particles.push({ mesh, vx, vy, life, maxLife: life });
  }

  spawnHitBurst(x, y, colorHex) {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const angle  = (i / count) * Math.PI * 2;
      const speed  = 120 + Math.random() * 160;
      const radius = 3 + Math.random() * 4;
      this.addParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, colorHex, 0.4 + Math.random() * 0.2, radius);
    }
  }

  // Animate background texture offset for subtle movement
  tickBg(t) {
    this._bgTex.offset.set(t * 0.004 % 1, t * 0.002 % 1);
  }

  // ── Platform rendering ──────────────────────────────────────────────────────

  buildPlatformMeshes(platforms) {
    while (this.platformGroup.children.length) this.platformGroup.remove(this.platformGroup.children[0]);

    for (const p of platforms) {
      const geo  = new THREE.PlaneGeometry(p.w, p.h);
      const mat  = new THREE.MeshBasicMaterial({ color: 0xededed, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(p.x + p.w / 2, p.y + p.h / 2, 0);
      this.platformGroup.add(mesh);

      // Top glow edge
      const edgeGeo = new THREE.PlaneGeometry(p.w, 3);
      const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      const edgeMesh = new THREE.Mesh(edgeGeo, edgeMat);
      edgeMesh.position.set(p.x + p.w / 2, p.y + 1, 0.1);
      this.platformGroup.add(edgeMesh);
    }
  }

  // ── Character rendering ─────────────────────────────────────────────────────

  buildPlayerMeshes() {
    while (this.playerGroup.children.length) this.playerGroup.remove(this.playerGroup.children[0]);
    this._playerMeshes = [this._buildPlayerMesh(0), this._buildPlayerMesh(1)];
    for (const m of this._playerMeshes) this.playerGroup.add(m.root);
  }

  _buildPlayerMesh(idx) {
    const color  = parseInt(PLAYER_COLORS[idx].replace('#', ''), 16);
    const root   = new THREE.Group();

    // Body circle
    const bodyGeo  = new THREE.CircleGeometry(1, 24);
    const bodyMat  = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    const body     = new THREE.Mesh(bodyGeo, bodyMat);
    root.add(body);

    // Black outline ring (slightly larger)
    const outlineGeo = new THREE.RingGeometry(1, 1.12, 24);
    const outlineMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
    const outline    = new THREE.Mesh(outlineGeo, outlineMat);
    root.add(outline);

    // Eyes (two dots)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
    const eyeGeo = new THREE.CircleGeometry(0.1, 8);
    const eyeL   = new THREE.Mesh(eyeGeo, eyeMat);
    const eyeR   = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.3, -0.2, 0.1);
    eyeR.position.set( 0.3, -0.2, 0.1);
    root.add(eyeL, eyeR);

    // Gun (small rectangle attached to arm direction)
    const gunGeo  = new THREE.PlaneGeometry(0.7, 0.25);
    const gunMat  = new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide });
    const gun     = new THREE.Mesh(gunGeo, gunMat);
    gun.position.set(1.0, 0, 0.1);
    root.add(gun);

    // Left leg group
    const legL = this._buildLeg(color);
    legL.position.set(-0.3, 0.8, 0.05);
    root.add(legL);

    const legR = this._buildLeg(color);
    legR.position.set( 0.3, 0.8, 0.05);
    root.add(legR);

    // Block arc (hidden by default)
    const blockGeo = new THREE.RingGeometry(1.3, 1.6, 20, 1, -Math.PI / 2.2, Math.PI / 1.1);
    const blockMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const blockArc = new THREE.Mesh(blockGeo, blockMat);
    blockArc.position.z = 0.2;
    blockArc.visible = false;
    root.add(blockArc);

    return { root, body, gun, legL, legR, blockArc, color, baseRadius: 1 };
  }

  _buildLeg(color) {
    const g    = new THREE.Group();
    const mat  = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
    const pts  = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.1, 0.5, 0), new THREE.Vector3(0, 1.0, 0)];
    const geo  = new THREE.BufferGeometry().setFromPoints(pts);
    g.add(new THREE.Line(geo, mat));
    return g;
  }

  updatePlayerMesh(idx, playerState, aimAngle, t) {
    if (!this._playerMeshes) return;
    const pm   = this._playerMeshes[idx];
    const r    = playerState.radius;
    const dead = playerState.hp <= 0;

    pm.root.visible = !dead;
    if (dead) return;

    pm.root.position.set(playerState.x, playerState.y, 1);
    pm.root.scale.set(r, r, 1);

    // Rotate root to face aim direction (flip if aiming left)
    const facingRight = Math.cos(aimAngle) >= 0;
    pm.root.scale.x = facingRight ? r : -r;

    // Gun points in aim direction
    const localAngle = facingRight ? aimAngle : Math.PI - aimAngle;
    pm.gun.position.set(Math.cos(localAngle) * 1.1, -Math.sin(localAngle) * 1.1, 0.1);
    pm.gun.rotation.z = localAngle;

    // Simple leg walk animation
    const walkPhase = (t * 8) % (Math.PI * 2);
    pm.legL.rotation.z = playerState.vx !== 0 ? Math.sin(walkPhase) * 0.4 : 0;
    pm.legR.rotation.z = playerState.vx !== 0 ? Math.sin(walkPhase + Math.PI) * 0.4 : 0;

    // Compress legs on landing (squat)
    const squat = playerState.onGround ? 1 : 0.9;
    pm.legL.scale.y = squat;
    pm.legR.scale.y = squat;

    // Block arc
    pm.blockArc.visible = playerState.blocking;
    if (playerState.blocking) {
      pm.blockArc.rotation.z = facingRight ? aimAngle : Math.PI - aimAngle;
    }
  }

  // ── Bullet rendering ────────────────────────────────────────────────────────

  syncBullets(bullets) {
    // Remove all and rebuild (small count expected)
    while (this.bulletGroup.children.length) this.bulletGroup.remove(this.bulletGroup.children[0]);

    for (const b of bullets) {
      const geo  = new THREE.CircleGeometry(b.radius, 8);
      const mat  = new THREE.MeshBasicMaterial({ color: parseInt(PLAYER_COLORS[b.owner].replace('#', ''), 16), side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(b.x, b.y, 1.5);
      this.bulletGroup.add(mesh);

      // Tail
      if (b.prevX !== undefined) {
        const tailMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
        const tailGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(b.prevX, b.prevY, 1.4),
          new THREE.Vector3(b.x,     b.y,     1.4),
        ]);
        this.bulletGroup.add(new THREE.Line(tailGeo, tailMat));
      }
    }
  }

  // ── Particles tick ──────────────────────────────────────────────────────────

  tickParticles(dt) {
    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.effectGroup.remove(p.mesh);
        this._particles.splice(i, 1);
        continue;
      }
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.material.opacity = p.life / p.maxLife;
      p.mesh.material.transparent = true;
    }
  }

  // ── HUD rendering ───────────────────────────────────────────────────────────

  // HUD is drawn on a separate 2D canvas overlay (simpler than Three.js sprites)
  // Renderer just exposes a render() call; HUD is handled by ui.js

  // ── Main render ─────────────────────────────────────────────────────────────

  render(dt, t) {
    // Screen shake
    if (this.shake.timer > 0) {
      this.shake.timer -= dt;
      const s = this.shake.mag * (this.shake.timer > 0 ? 1 : 0);
      this.shake.x = (Math.random() * 2 - 1) * s;
      this.shake.y = (Math.random() * 2 - 1) * s;
    } else {
      this.shake.x = 0;
      this.shake.y = 0;
    }
    this.camera.position.x = this.shake.x;
    this.camera.position.y = this.shake.y;
    this.camera.updateProjectionMatrix();

    this.tickBg(t);
    this.tickParticles(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
