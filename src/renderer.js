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
    this.scene.add(this._buildArenaBorder());

    // Groups for layered rendering
    this.platformGroup  = new THREE.Group();
    this.bulletGroup    = new THREE.Group();
    this.effectGroup    = new THREE.Group();
    this.playerGroup    = new THREE.Group();
    this.hudGroup       = new THREE.Group();
    this.scene.add(this.platformGroup, this.bulletGroup, this.effectGroup, this.playerGroup, this.hudGroup);

    // Particle pool
    this._particles = [];

    this._limbDummy = new THREE.Object3D();
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  _buildBgTexture() {
    const size = 60;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#141726';
    ctx.fillRect(0, 0, size, size);
    // Dot grid
    ctx.fillStyle = '#1e2340';
    for (let x = 0; x < size; x += 20) {
      for (let y = 0; y < size; y += 20) {
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(ARENA_W / size, ARENA_H / size);
    return tex;
  }

  _buildArenaBorder() {
    const pts = [
      new THREE.Vector3(0,       0,       -5),
      new THREE.Vector3(ARENA_W, 0,       -5),
      new THREE.Vector3(ARENA_W, ARENA_H, -5),
      new THREE.Vector3(0,       ARENA_H, -5),
      new THREE.Vector3(0,       0,       -5),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: 0x2a2a42, transparent: true, opacity: 0.9 });
    return new THREE.Line(geo, mat);
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

  spawnDeathBurst(x, y, colorHex, dirAngle) {
    // dirAngle: bullet travel angle in game coords (y-down). If provided, splatter fans
    // forward in a ~160° cone. If absent, spread is omnidirectional (edge kills etc.).
    const directed = (dirAngle !== undefined && !isNaN(dirAngle));
    const CONE = Math.PI * 0.45;  // ±81° half-cone

    const dir = () => directed
      ? dirAngle + (Math.random() - 0.5) * 2 * CONE
      : Math.random() * Math.PI * 2;

    // White central flash (no velocity)
    this.addParticle(x, y, 0, 0, 0xffffff, 0.14, 38);

    // Golden orbs -- forward splatter
    for (let i = 0; i < 6; i++) {
      const a = dir(), speed = 220 + Math.random() * 280;
      this.addParticle(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 0xffcc22, 0.65 + Math.random() * 0.45, 13 + Math.random() * 9);
    }

    // Colored shards in cone
    for (let i = 0; i < 18; i++) {
      const a = dir(), speed = 260 + Math.random() * 380;
      this.addParticle(x, y, Math.cos(a) * speed, Math.sin(a) * speed, colorHex, 0.4 + Math.random() * 0.45, 4 + Math.random() * 8);
    }

    // White sparks -- slightly wider scatter at the edges of cone
    for (let i = 0; i < 14; i++) {
      const a = directed ? dirAngle + (Math.random() - 0.5) * 2 * (CONE + 0.4) : Math.random() * Math.PI * 2;
      const speed = 400 + Math.random() * 300;
      this.addParticle(x, y, Math.cos(a) * speed, Math.sin(a) * speed, 0xffffff, 0.22 + Math.random() * 0.18, 1.5 + Math.random() * 2.5);
    }
  }

  flashPlayer(idx) {
    if (!this._playerMeshes) return;
    this._playerMeshes[idx].hitFlashTimer = 0.1;
  }

  spawnVictoryBurst(winnerColor) {
    // Multi-wave confetti burst from arena center
    const cols = [winnerColor, 0xffd700, 0xffffff, winnerColor, 0xffee66];
    for (let w = 0; w < 3; w++) {
      const delay = w * 0.18;
      const count = 20;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const speed = 250 + Math.random() * 500;
        const col   = cols[Math.floor(Math.random() * cols.length)];
        const r     = 4 + Math.random() * 9;
        const life  = 0.8 + Math.random() * 0.9 + delay;
        this.addParticle(ARENA_W / 2, ARENA_H / 2,
          Math.cos(angle) * speed, Math.sin(angle) * speed - delay * 40,
          col, life, r);
      }
    }
  }

  gunKick(idx) {
    if (!this._playerMeshes) return;
    this._playerMeshes[idx].gunKickTimer = 0.09;
  }

  hidePlayerMeshes() {
    if (!this._playerMeshes) return;
    for (const pm of this._playerMeshes) pm.root.visible = false;
  }

  // Animate background texture offset for subtle movement
  tickBg(t) {
    this._bgTex.offset.set(t * 0.004 % 1, t * 0.002 % 1);
  }

  // ── Platform rendering ──────────────────────────────────────────────────────

  _disposeChildren(group) {
    group.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    while (group.children.length) group.remove(group.children[0]);
  }

  setMapTint(hexColor) {
    if (!this._tintMesh) {
      const geo = new THREE.PlaneGeometry(ARENA_W, ARENA_H);
      const mat = new THREE.MeshBasicMaterial({ color: hexColor, transparent: true, opacity: 0.07, side: THREE.DoubleSide });
      this._tintMesh = new THREE.Mesh(geo, mat);
      this._tintMesh.position.set(ARENA_W / 2, ARENA_H / 2, -9);
      this.scene.add(this._tintMesh);
    } else {
      this._tintMesh.material.color.setHex(hexColor);
    }
  }

  buildPlatformMeshes(platforms, colorHex = '#e8eef8') {
    this._disposeChildren(this.platformGroup);
    const color = parseInt(colorHex.replace('#', ''), 16);

    for (const p of platforms) {
      // Drop shadow (offset below-right, dark blue tint)
      const shadowGeo = new THREE.PlaneGeometry(p.w + 8, p.h + 8);
      const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000820, transparent: true, opacity: 0.42, side: THREE.DoubleSide });
      const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
      shadowMesh.position.set(p.x + p.w / 2 + 8, p.y + p.h / 2 + 10, -0.5);
      this.platformGroup.add(shadowMesh);

      // Platform body
      const geo  = new THREE.PlaneGeometry(p.w, p.h);
      const mat  = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(p.x + p.w / 2, p.y + p.h / 2, 0);
      this.platformGroup.add(mesh);

      // Subtle bottom-face darkening strip (adds depth)
      const darkH = Math.min(p.h * 0.35, 14);
      const darkGeo = new THREE.PlaneGeometry(p.w, darkH);
      const darkMat = new THREE.MeshBasicMaterial({ color: 0x000820, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
      const darkMesh = new THREE.Mesh(darkGeo, darkMat);
      darkMesh.position.set(p.x + p.w / 2, p.y + p.h - darkH / 2, 0.05);
      this.platformGroup.add(darkMesh);

      // Top highlight edge (bright white line on surface)
      const edgeGeo = new THREE.PlaneGeometry(p.w, 3);
      const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
      const edgeMesh = new THREE.Mesh(edgeGeo, edgeMat);
      edgeMesh.position.set(p.x + p.w / 2, p.y + 1.5, 0.1);
      this.platformGroup.add(edgeMesh);
    }
  }

  // ── Character rendering ─────────────────────────────────────────────────────

  buildPlayerMeshes() {
    this._disposeChildren(this.playerGroup);
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
    eyeL.position.set(-0.28, -0.18, 0.1);
    eyeR.position.set( 0.28, -0.18, 0.1);
    root.add(eyeL, eyeR);

    // Mouth (thin horizontal rect)
    const mouthGeo = new THREE.PlaneGeometry(0.4, 0.08);
    const mouthMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
    const mouth    = new THREE.Mesh(mouthGeo, mouthMat);
    mouth.position.set(0, 0.28, 0.1);
    root.add(mouth);

    // Gun — orbits to aim direction; position overridden each frame in updatePlayerMesh
    const gunGeo  = new THREE.PlaneGeometry(0.9, 0.30);
    const gunMat  = new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide });
    const gun     = new THREE.Mesh(gunGeo, gunMat);
    gun.position.set(1.4, 0, 0.1);
    root.add(gun);

    // Noodle limb chains -- InstancedMesh discs behind body (z=-0.05 in root-local space)
    const limbGroup = new THREE.Group();
    limbGroup.position.z = -0.05;
    root.add(limbGroup);

    const gunArmChain  = this._buildLimbChain(7, 0.21, color);
    const backArmChain = this._buildLimbChain(7, 0.21, color);
    const legLChain    = this._buildLimbChain(8, 0.20, color);
    const legRChain    = this._buildLimbChain(8, 0.20, color);
    limbGroup.add(gunArmChain, backArmChain, legLChain, legRChain);

    // White hand ball at gun-arm end (slightly in front of limb layer)
    const handBallGeo = new THREE.CircleGeometry(0.29, 10);
    const handBallMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const handBall    = new THREE.Mesh(handBallGeo, handBallMat);
    handBall.position.z = 0.02;
    limbGroup.add(handBall);

    // Shield ball (cyan) at back-arm hand, shown when blocking
    const shieldBallGeo = new THREE.CircleGeometry(0.36, 12);
    const shieldBallMat = new THREE.MeshBasicMaterial({ color: 0x44eeff, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const shieldBall    = new THREE.Mesh(shieldBallGeo, shieldBallMat);
    shieldBall.position.z = 0.02;
    shieldBall.visible = false;
    limbGroup.add(shieldBall);

    // Block ring -- large neon ring around player while blocking
    const blockGeo = new THREE.RingGeometry(2.1, 2.45, 18);
    const blockMat = new THREE.MeshBasicMaterial({ color: 0x44eeff, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const blockArc = new THREE.Mesh(blockGeo, blockMat);
    blockArc.position.z = 0.2;
    blockArc.visible = false;
    root.add(blockArc);

    // Armor ring (steel-blue outer glow, hidden when no armor)
    const armorRingGeo = new THREE.RingGeometry(1.18, 1.35, 24);
    const armorRingMat = new THREE.MeshBasicMaterial({ color: 0x55aaff, transparent: true, opacity: 0.0, side: THREE.DoubleSide });
    const armorRing = new THREE.Mesh(armorRingGeo, armorRingMat);
    armorRing.position.z = 0.15;
    root.add(armorRing);

    // Keep hidden leg stubs so legacy mutation lines in updatePlayerMesh are harmless
    const legL = this._buildLeg();  legL.visible = false;  root.add(legL);
    const legR = this._buildLeg();  legR.visible = false;  root.add(legR);

    return { root, body, gun, eyeL, eyeR, mouth, legL, legR, blockArc, armorRing, color,
             gunArmChain, backArmChain, legLChain, legRChain, handBall, shieldBall,
             baseRadius: 1, hitFlashTimer: 0, deathTimer: 0, prevAlive: true,
             blinkTimer: 2 + Math.random() * 3, blinkActive: false, gunKickTimer: 0, facingRight: true };
  }

  _buildLeg() {
    const g   = new THREE.Group();
    const legH = 0.95;
    const legW = 0.22;
    const geo  = new THREE.PlaneGeometry(legW, legH);
    const mat  = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, legH / 2, 0);  // pivot at top (hip)
    g.add(mesh);
    return g;
  }

  _buildLimbChain(n, discRadius, color) {
    const geo = new THREE.CircleGeometry(discRadius, 8);
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    const im  = new THREE.InstancedMesh(geo, mat, n);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return im;
  }

  _updateBezierChain(im, p0x, p0y, p1x, p1y, p2x, p2y) {
    const n = im.count;
    const d = this._limbDummy;
    for (let i = 0; i < n; i++) {
      const tt = i / (n - 1), ot = 1 - tt;
      d.position.set(ot*ot*p0x + 2*ot*tt*p1x + tt*tt*p2x,
                     ot*ot*p0y + 2*ot*tt*p1y + tt*tt*p2y, 0);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
  }

  updatePlayerMesh(idx, playerState, aimAngle, t, dt = 0) {
    if (!this._playerMeshes) return;
    const pm   = this._playerMeshes[idx];
    const r    = playerState.radius;
    const dead = playerState.hp <= 0;

    // Detect alive → dead transition and start spin-shrink animation
    if (!dead && pm.deathTimer > 0) pm.deathTimer = 0;
    if (pm.prevAlive && dead) pm.deathTimer = 0.4;
    pm.prevAlive = !dead;

    if (pm.deathTimer > 0) {
      pm.deathTimer -= dt;
      const prog = 1 - Math.max(0, pm.deathTimer) / 0.4;
      pm.root.rotation.z = prog * Math.PI * 4;
      const s = Math.max(0, 1 - prog) * r;
      pm.root.scale.set(s, s, 1);
      pm.root.position.set(playerState.x, playerState.y, 1);
      pm.root.visible = true;
      if (pm.hitFlashTimer > 0) pm.hitFlashTimer -= dt;
      return;
    }

    pm.root.rotation.z = 0;
    pm.root.visible = !dead;
    if (dead) return;

    pm.root.position.set(playerState.x, playerState.y, 1);

    const hpFrac = playerState.maxHp > 0 ? playerState.hp / playerState.maxHp : 1;

    // Hit flash: briefly turn body white on hit; otherwise berserk tint at low HP
    if (pm.hitFlashTimer > 0) {
      pm.hitFlashTimer -= dt;
      pm.body.material.color.setHex(0xffffff);
    } else if (playerState.berserk && hpFrac < 0.5) {
      // Blend from base color toward orange-red as HP drops
      const rage = (0.5 - hpFrac) / 0.5;  // 0 at 50% HP, 1 at 0 HP
      const base = new THREE.Color(pm.color);
      const hot  = new THREE.Color(0xff4400);
      base.lerp(hot, rage * 0.65);
      pm.body.material.color.set(base);
    } else {
      pm.body.material.color.setHex(pm.color);
    }

    // Armor ring: pulse opacity based on armor level
    if (pm.armorRing) {
      if (playerState.armor > 0) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 3.0);
        pm.armorRing.material.opacity = (0.35 + pulse * 0.25) * (playerState.armor / 0.75);
      } else {
        pm.armorRing.material.opacity = 0;
      }
    }

    // Squash-and-stretch based on vertical velocity + landing squish
    const vy = playerState.vy || 0;
    const land = playerState.landTimer || 0;
    const landSquish = land > 0 ? (land / 0.12) * 0.28 : 0;
    const idle  = playerState.onGround && Math.abs(playerState.vx || 0) < 20;
    const idleBob = idle ? Math.sin(t * 2.5) * 0.03 : 0;
    const stretchY = land > 0 ? (1.0 - landSquish) : (vy < -280 ? 1.12 : (vy > 280 && !playerState.onGround) ? 0.88 : 1.0 + idleBob);
    const stretchX = land > 0 ? (1.0 + landSquish) : (vy < -280 ? 0.9  : (vy > 280 && !playerState.onGround) ? 1.1  : 1.0 - idleBob * 0.5);

    // Eye blink
    pm.blinkTimer -= dt;
    if (!pm.blinkActive && pm.blinkTimer <= 0) {
      pm.blinkActive = true;
      pm.blinkTimer  = 0.1;
    }
    if (pm.blinkActive) {
      pm.eyeL.scale.y = 0.08;
      pm.eyeR.scale.y = 0.08;
      if (pm.blinkTimer <= 0) {
        pm.blinkActive = false;
        pm.blinkTimer  = 2.5 + Math.random() * 3.5;
        pm.eyeL.scale.y = 1;
        pm.eyeR.scale.y = 1;
      }
    } else {
      pm.eyeL.scale.y = 1;
      pm.eyeR.scale.y = 1;
    }

    // Expression reacts to HP
    const lowHp  = hpFrac < 0.25;
    pm.mouth.scale.set(lowHp ? 1.6 : 1, lowHp ? 1.8 : 1, 1);
    pm.mouth.position.y = lowHp ? 0.22 : 0.28;
    // Half-squint eyes at low HP (unless mid-blink)
    if (lowHp && !pm.blinkActive) {
      pm.eyeL.scale.y = 0.45;
      pm.eyeR.scale.y = 0.45;
    }

    const vx = playerState.vx || 0;
    if (vx > 15)  pm.facingRight = true;
    if (vx < -15) pm.facingRight = false;
    const facingRight = pm.facingRight;
    pm.root.scale.set(facingRight ? r * stretchX : -r * stretchX, r * stretchY, 1);

    const localAngle = facingRight ? aimAngle : Math.PI - aimAngle;
    if (pm.gunKickTimer > 0) {
      pm.gunKickTimer -= dt;
      const kickFrac = Math.max(0, pm.gunKickTimer / 0.09);
      const dist = 1.4 - kickFrac * 0.42;
      pm.gun.position.set(Math.cos(localAngle) * dist, -Math.sin(localAngle) * dist, 0.1);
    } else {
      pm.gun.position.set(Math.cos(localAngle) * 1.4, -Math.sin(localAngle) * 1.4, 0.1);
    }
    pm.gun.rotation.z = localAngle;

    // ── Noodle limb chains ───────────────────────────────────────────────────────
    const a = localAngle;
    const walking   = playerState.onGround && Math.abs(playerState.vx || 0) > 10;
    const walkPhase = (t * 8) % (Math.PI * 2);

    // Gun arm (aim direction)
    const sGx = Math.cos(a) * 0.68,  sGy = -Math.sin(a) * 0.68;
    const hGx = Math.cos(a) * 1.4,   hGy = -Math.sin(a) * 1.4;
    const perpX = Math.sin(a), perpY = Math.cos(a);
    const wobG  = Math.sin(t * 6.2 + idx * 1.8) * 0.7;
    this._updateBezierChain(pm.gunArmChain,  sGx, sGy,
      (sGx + hGx) / 2 + perpX * wobG, (sGy + hGy) / 2 + perpY * wobG,  hGx, hGy);

    // Back arm (opposite direction from aim -- always the hand away from opponent)
    const sBx = -Math.cos(a) * 0.68, sBy = Math.sin(a) * 0.68;
    const bSwing = walking ? Math.sin(walkPhase + Math.PI) * 0.35 : 0;
    const hBx = -Math.cos(a) * 1.4 + bSwing;
    const hBy =  Math.sin(a) * 1.4 + 0.25;  // slight droop (y+ = down)
    const wobB = Math.sin(t * 4.8 + idx * 2.3) * 0.5;
    this._updateBezierChain(pm.backArmChain, sBx, sBy,
      (sBx + hBx) / 2 + wobB, (sBy + hBy) / 2,  hBx, hBy);

    // Hand ball lives in the back arm (free hand / shield hand) -- never at gun arm
    pm.handBall.position.set(hBx, hBy, 0.02);
    pm.shieldBall.visible = false;  // shieldBall replaced by handBall color change
    if (playerState.blocking) {
      pm.handBall.material.color.setHex(0x44eeff);
      pm.handBall.material.opacity = 0.7 + 0.3 * Math.sin(t * 22);
    } else {
      pm.handBall.material.color.setHex(0xffffff);
      pm.handBall.material.opacity = 1.0;
    }

    // Left leg
    const swingL = walking ? Math.sin(walkPhase)           * 0.5 : 0;
    const wobL   = Math.sin(t * 5.5 + 0.4) * (walking ? 0.22 : 0.05);
    const fLx = -0.30 + swingL, fLy = 0.52 + 0.92;
    this._updateBezierChain(pm.legLChain, -0.30, 0.52,
      (-0.30 + fLx) / 2 + wobL, (0.52 + fLy) / 2,  fLx, fLy);

    // Right leg
    const swingR = walking ? Math.sin(walkPhase + Math.PI) * 0.5 : 0;
    const wobR   = Math.sin(t * 5.5 + Math.PI + 0.4) * (walking ? 0.22 : 0.05);
    const fRx = 0.30 + swingR, fRy = 0.52 + 0.92;
    this._updateBezierChain(pm.legRChain,  0.30, 0.52,
      (0.30 + fRx) / 2 + wobR, (0.52 + fRy) / 2,  fRx, fRy);

    pm.blockArc.visible = playerState.blocking;
    if (playerState.blocking) {
      pm.blockArc.material.opacity = 0.65 + 0.35 * Math.sin(t * 22);
    }
  }

  // ── Bullet rendering ────────────────────────────────────────────────────────

  syncBullets(bullets) {
    this._disposeChildren(this.bulletGroup);

    for (const b of bullets) {
      const ownerColor = parseInt(PLAYER_COLORS[b.owner]?.replace('#', '') || 'ffffff', 16);
      const bulletColor = b.explosive ? 0xff6600 : (b.homing ? 0xffbb22 : (b.noGravity ? 0xffffdd : (b.piercing ? 0x88ff88 : ownerColor)));

      const geo  = new THREE.CircleGeometry(b.radius, 8);
      const mat  = new THREE.MeshBasicMaterial({ color: bulletColor, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(b.x, b.y, 1.5);
      this.bulletGroup.add(mesh);

      // Explosive: outer ring to signal blast radius
      if (b.explosive) {
        const ringGeo = new THREE.RingGeometry(b.radius * 1.3, b.radius * 1.7, 12);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xff9933, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
        const ring    = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(b.x, b.y, 1.4);
        this.bulletGroup.add(ring);
      }

      // Homing bullets: long red laser trail extending backward from velocity direction
      if (b.homing) {
        const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        if (speed > 0) {
          const trailLen = 260;
          const nx = b.vx / speed, ny = b.vy / speed;
          const trailMat = new THREE.LineBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.7 });
          const trailGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(b.x - nx * trailLen, b.y - ny * trailLen, 1.4),
            new THREE.Vector3(b.x, b.y, 1.4),
          ]);
          this.bulletGroup.add(new THREE.Line(trailGeo, trailMat));
        }
      } else if (b.prevX !== undefined) {
        // Short one-frame tail for non-homing bullets
        const tailColor = b.explosive ? 0xff9933 : 0xffffff;
        const tailMat = new THREE.LineBasicMaterial({ color: tailColor, transparent: true, opacity: 0.35 });
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
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
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
