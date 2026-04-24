// game.js — core game loop and state machine

import { Renderer, ARENA_W, ARENA_H } from './renderer.js';
import { UI } from './ui.js';
import { Network } from './network.js';
import { playShoot, playReload, playBlock, playHit, playDeath, playUiTick } from './audio.js';
import { MAPS, randomMap } from './maps.js';
import { CARDS, drawCardOffer } from './cards.js';
import {
  GRAVITY, JUMP_VEL, WALL_JUMP_VX, WALL_JUMP_VY, MOVE_SPEED, FRICTION,
  createPlayerPhysics, resolvePlatforms, applyGravity, applyVelocity, clampToArena, doJump
} from './physics.js';

// ── Constants ────────────────────────────────────────────────────────────────

const RELAY_URL      = window.RELAY_URL || 'ws://localhost:8765';
const DEFAULT_HP     = 180;
const BASE_DAMAGE    = 108;  // ~60% of 180
const BASE_AMMO      = 3;
const BASE_RELOAD    = 1.0;
const BULLET_SPEED   = 820;
const BULLET_RADIUS  = 8;
const BLOCK_COOLDOWN = 2.0;
const BLOCK_DURATION = 0.22;
const SHOOT_COOLDOWN = 0.15;
const RECOIL_VX      = 140;

// ── Default player stats ─────────────────────────────────────────────────────

function defaultStats() {
  return {
    maxHp: DEFAULT_HP, hp: DEFAULT_HP,
    maxAmmo: BASE_AMMO, ammo: BASE_AMMO,
    reloadTime: BASE_RELOAD, reloadTimer: 0, reloading: false,
    bulletDamage: BASE_DAMAGE, bulletRadius: BULLET_RADIUS, bulletSpeed: BULLET_SPEED,
    bulletsPerShot: 1, bulletBounces: 0, bulletHoming: false,
    shootCooldown: SHOOT_COOLDOWN, shootTimer: 0,
    blockCooldown: BLOCK_COOLDOWN, blockTimer: 0, blockDurationTimer: 0, blocking: false, blockHeld: false,
    autoBlockOnLastShot: false, damageDecay: false, leech: 0,
    tasteOfBlood: false, tasteTimer: 0,
    pristineBonus: false, pristineFired: false,
    radius: BULLET_RADIUS * 2.8,  // visual + physics radius
    speedMult: 1.0,
  };
}

// ── Player object ─────────────────────────────────────────────────────────────

function createPlayer(spawnX, spawnY) {
  return {
    ...createPlayerPhysics(),
    ...defaultStats(),
    x: spawnX, y: spawnY,
    aimAngle: 0,
    cards: [],
    score: 0,
    fightWins: 0,
  };
}

// ── Bullet object ─────────────────────────────────────────────────────────────

let bulletIdCounter = 0;
function createBullet(owner, x, y, vx, vy, radius, damage, bounces, homing) {
  return { id: bulletIdCounter++, owner, x, y, vx, vy, radius, damage, bounces, homing, prevX: x, prevY: y };
}

// ── Main Game class ───────────────────────────────────────────────────────────

export class Game {
  constructor(canvasThree, canvasHud) {
    this.renderer  = new Renderer(canvasThree);
    this.ui        = new UI(canvasHud, 1);
    this.net       = null;

    this.state     = 'lobby';     // lobby | start_pick | fight | card_pick | match_end
    this.isHost    = true;
    this.isOnline  = false;
    this.isLocal   = false;       // local vs AI

    this.map       = null;
    this.players   = [null, null];
    this.bullets   = [];
    this.pendingInput = null;     // for guest input buffer

    this.cardOffer     = [];
    this.cardHovered   = -1;
    this.pickerIdx     = 0;       // which player is picking a card
    this.startPickPhase = 0;      // 0 = p1 picks, 1 = p2 picks, 2 = done

    this.overlayTimer   = 0;
    this.overlayText    = '';
    this.overlaySubtext = '';
    this.overlayColor   = '#ffffff';
    this._dmgNumbers    = [];   // { x, y, amount, timer, color }

    this.lobbyState  = { mode: 'menu', roomCode: '', inputCode: '', error: '' };

    this._keys       = {};
    this._mouseAngle = 0;
    this._mouseX     = 0;
    this._mouseY     = 0;
    this._prevTime   = 0;
    this._frameId    = null;

    this._bindInput();
  }

  // ── Input binding ────────────────────────────────────────────────────────────

  _bindInput() {
    window.addEventListener('keydown', e => {
      this._keys[e.code] = true;
      this._onKeyDown(e);
    });
    window.addEventListener('keyup', e => {
      this._keys[e.code] = false;
    });
    // Use window for mouse events -- HUD canvas sits on top and blocks renderer canvas
    window.addEventListener('mousemove', e => {
      const pos = this.renderer.screenToArena(e.clientX, e.clientY);
      this._mouseX = pos.x;
      this._mouseY = pos.y;
      if (this.state === 'card_pick' || this.state === 'start_pick') {
        const r = this.ui.canvas.getBoundingClientRect();
        this.cardHovered = this.ui.getCardPickerHover(this.cardOffer, e.clientX - r.left, e.clientY - r.top);
      }
    });
    window.addEventListener('mousedown', e => {
      this._onMouseDown(e);
      const r = this.ui.canvas.getBoundingClientRect();
      this._onOverlayClick(e.clientX - r.left, e.clientY - r.top);
    });
    window.addEventListener('contextmenu', e => e.preventDefault());
  }

  _onKeyDown(e) {
    if (this.state === 'lobby' && this.lobbyState.mode === 'joining') {
      if (e.key === 'Enter') {
        this._doJoin(this.lobbyState.inputCode);
      } else if (e.key === 'Backspace') {
        this.lobbyState.inputCode = this.lobbyState.inputCode.slice(0, -1);
      } else if (e.key.length === 1) {
        this.lobbyState.inputCode = (this.lobbyState.inputCode + e.key).toUpperCase().slice(0, 4);
      }
    }

    if (this.state === 'fight') {
      const p = this.isHost ? this.players[0] : this.players[1];
      if (!p || p.hp <= 0) return;
      if (e.code === 'KeyW') {
        const target = this.isHost || this.isLocal ? this.players[0] : this.players[1];
        if (target && target.hp > 0) { doJump(target); this._sendInput(); }
      }
      if (e.code === 'ArrowUp') {
        if (this.isLocal) {
          const p2 = this.players[1];
          if (p2 && p2.hp > 0) doJump(p2);
        } else if (!this.isHost) {
          if (p && p.hp > 0) { doJump(p); this._sendInput(); }
        }
      }
    }
  }

  _onMouseDown(e) {
    if (this.state !== 'fight') return;
    const localIdx = this.isHost ? 0 : 1;
    const p = this.players[localIdx];
    if (!p || p.hp <= 0) return;

    if (e.button === 0) this._tryShoot(p, localIdx);
    if (e.button === 2) this._startBlock(p);
  }

  _onOverlayClick(mx, my) {
    if (this.state === 'lobby') {
      if (this.lobbyState.mode === 'menu') {
        const action = this.ui.getLobbyClick(mx, my);
        if (action === 'host') this._doHost();
        if (action === 'join') { this.lobbyState.mode = 'joining'; this.lobbyState.error = ''; }
        if (action === 'local') this._startLocal();
      }
    }

    if (this.state === 'start_pick') {
      const localIdx = this.isHost ? 0 : 1;
      if (this.isOnline && localIdx !== this.pickerIdx) return;
      const picked = this.ui.getCardPickerClick(this.cardOffer, mx, my);
      if (picked >= 0) this._pickCard(picked);
    }

    if (this.state === 'card_pick') {
      const localIdx = this.isHost ? 0 : 1;
      if (this.isOnline && localIdx !== this.pickerIdx) return;
      const picked = this.ui.getCardPickerClick(this.cardOffer, mx, my);
      if (picked >= 0) this._pickCardRound(picked);
    }

    if (this.state === 'match_end') {
      this._goToLobby();
    }
  }

  // ── Networking ────────────────────────────────────────────────────────────────

  _doHost() {
    const code = this._genCode();
    this.net   = new Network(RELAY_URL);
    this.isOnline = true;
    this.isHost   = true;
    this.lobbyState = { mode: 'hosting', roomCode: code, inputCode: '', error: '' };

    this.net.onConnected = () => {};
    this.net.onOpponentJoined = () => {
      this._startStartPick();
    };
    this.net.onMessage = msg => this._onNetMessage(msg);
    this.net.onError   = err => { this.lobbyState.error = err; };
    this.net.connect('host', code);
  }

  _doJoin(code) {
    if (code.length < 4) { this.lobbyState.error = 'Enter 4-character code'; return; }
    this.net   = new Network(RELAY_URL);
    this.isOnline = true;
    this.isHost   = false;
    this.lobbyState.error = '';

    this.net.onConnected = () => {};
    this.net.onOpponentLeft = () => {
      this.state = 'lobby';
      this.lobbyState = { mode: 'menu', roomCode: '', inputCode: '', error: 'Opponent disconnected' };
    };
    this.net.onMessage = msg => this._onNetMessage(msg);
    this.net.onError   = err => { this.lobbyState.error = err; };
    this.net.connect('guest', code);
  }

  _onNetMessage(msg) {
    if (!msg) return;

    if (msg.type === 'start_pick') {
      this._receiveStartPick(msg);
      return;
    }
    if (msg.type === 'start_pick_card') {
      this._receiveStartPickCard(msg);
      return;
    }
    if (msg.type === 'fight_start') {
      this._receiveFightStart(msg);
      return;
    }
    if (msg.type === 'input' && this.isHost) {
      this.pendingInput = msg;
      return;
    }
    if (msg.type === 'state' && !this.isHost) {
      this._applyRemoteState(msg);
      return;
    }
    if (msg.type === 'card_pick') {
      this._receiveCardPick(msg);
      return;
    }
    if (msg.type === 'card_pick_choice' && this.isHost) {
      const card = CARDS.find(c => c.id === msg.cardId);
      if (card && this.players[this.pickerIdx]) {
        card.apply(this.players[this.pickerIdx]);
        this.players[this.pickerIdx].cards.push(card);
      }
      this._startFight();
      return;
    }
    if (msg.type === 'fight_result' && !this.isHost) {
      this._receiveFightResult(msg);
      return;
    }
    if (msg.type === 'match_end' && !this.isHost) {
      this.state = 'match_end';
      return;
    }
  }

  _genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  _sendInput() {
    if (!this.isOnline || this.isHost) return;
    this._sendContinuousInput();
  }

  _sendContinuousInput() {
    if (!this.isOnline || this.isHost) return;
    const mouseAngle = Math.atan2(-(this._mouseY - (this.players[1]?.y || 450)), this._mouseX - (this.players[1]?.x || 800));
    this.net.send({
      type: 'input',
      keys: {
        left:  !!this._keys['ArrowLeft'],
        right: !!this._keys['ArrowRight'],
        jump:  !!this._keys['ArrowUp'],
        shoot: !!this._keys['Numpad0'],
        block: !!this._keys['NumpadEnter'],
      },
      mouseAngle,
    });
  }

  _broadcastState() {
    if (!this.isOnline || !this.isHost) return;
    const snap = {
      type: 'state',
      p1: this._snapPlayer(this.players[0]),
      p2: this._snapPlayer(this.players[1]),
      bullets: this.bullets.map(b => ({ id: b.id, x: b.x, y: b.y, prevX: b.prevX, prevY: b.prevY, owner: b.owner, radius: b.radius })),
    };
    this.net.send(snap);
  }

  _snapPlayer(p) {
    if (!p) return null;
    return {
      x: p.x, y: p.y, vx: p.vx, vy: p.vy,
      hp: p.hp, maxHp: p.maxHp,
      ammo: p.ammo, maxAmmo: p.maxAmmo,
      reloading: p.reloading, reloadTimer: p.reloadTimer, reloadTime: p.reloadTime,
      blocking: p.blocking, blockTimer: p.blockTimer, blockCooldown: p.blockCooldown,
      radius: p.radius, aimAngle: p.aimAngle, onGround: p.onGround,
      score: p.score, fightWins: p.fightWins,
    };
  }

  _applyRemoteState(msg) {
    if (msg.p1 && this.players[0]) Object.assign(this.players[0], msg.p1);
    if (msg.p2 && this.players[1]) Object.assign(this.players[1], msg.p2);
    this.bullets = msg.bullets || [];
  }

  // ── Match setup ───────────────────────────────────────────────────────────────

  _startLocal() {
    this.isLocal  = true;
    this.isOnline = false;
    this.isHost   = true;
    this._startStartPick();
  }

  _startStartPick() {
    this.state = 'start_pick';
    this.startPickPhase = 0;
    this.map   = randomMap();
    const spawn = this.map;
    this.players[0] = createPlayer(spawn.spawnP1.x, spawn.spawnP1.y);
    this.players[1] = createPlayer(spawn.spawnP2.x, spawn.spawnP2.y);

    this.cardOffer = drawCardOffer(5);
    this.pickerIdx = 0;

    if (this.isOnline && this.isHost) {
      this.net.send({ type: 'start_pick', offer: this.cardOffer.map(c => c.id), pickerIdx: 0 });
    }
  }

  _receiveStartPick(msg) {
    this.state     = 'start_pick';
    this.cardOffer = msg.offer.map(id => CARDS.find(c => c.id === id));
    this.pickerIdx = msg.pickerIdx;
    this.startPickPhase = 0;
    const spawn = randomMap();
    this.map = spawn;
    this.players[0] = createPlayer(spawn.spawnP1.x, spawn.spawnP1.y);
    this.players[1] = createPlayer(spawn.spawnP2.x, spawn.spawnP2.y);
  }

  _pickCard(idx) {
    playUiTick();
    const card = this.cardOffer[idx];
    card.apply(this.players[this.pickerIdx]);
    this.players[this.pickerIdx].cards.push(card);

    if (this.isOnline) {
      this.net.send({ type: 'start_pick_card', cardId: card.id, pickerIdx: this.pickerIdx });
    }

    this._advanceStartPickOrFight();
  }

  _receiveStartPickCard(msg) {
    const card = CARDS.find(c => c.id === msg.cardId);
    if (card && this.players[msg.pickerIdx]) {
      card.apply(this.players[msg.pickerIdx]);
      this.players[msg.pickerIdx].cards.push(card);
    }
    this._advanceStartPickOrFight();
  }

  _advanceStartPickOrFight() {
    if (this.startPickPhase === 0) {
      this.startPickPhase = 1;
      this.pickerIdx = 1;
      this.cardOffer = drawCardOffer(5);
      if (this.isOnline && this.isHost) {
        this.net.send({ type: 'start_pick', offer: this.cardOffer.map(c => c.id), pickerIdx: 1 });
      }
    } else {
      if (this.isOnline && !this.isHost) return; // guest waits for fight_start from host
      this._startFight();
    }
  }

  _startFight() {
    this.state = 'fight';
    this.bullets = [];
    this.map = randomMap();
    this.renderer.buildPlatformMeshes(this.map.platforms);
    this.renderer.buildPlayerMeshes();

    // Reset positions and hp
    for (let i = 0; i < 2; i++) {
      const p = this.players[i];
      const spawn = i === 0 ? this.map.spawnP1 : this.map.spawnP2;
      p.x = spawn.x; p.y = spawn.y; p.vx = 0; p.vy = 0;
      p.hp = p.maxHp; p.ammo = p.maxAmmo; p.reloading = false; p.reloadTimer = 0;
      p.blocking = false; p.blockTimer = 0; p.blockDurationTimer = 0; p.shootTimer = 0;
      p.tasteTimer = 0; p.pristineFired = false; p._decayQueue = null;
    }

    if (this.isOnline && this.isHost) {
      this.net.send({ type: 'fight_start', mapIdx: MAPS.indexOf(this.map) });
    }

    const hint = this.isLocal ? 'P1: WASD + Click     P2: Arrows + Numpad0' : '';
    this._showOverlay('FIGHT', hint, 1.2, () => {});
  }

  _receiveFightStart(msg) {
    this.map = MAPS[msg.mapIdx] || randomMap();
    this.state = 'fight';
    this.bullets = [];
    this.overlayText  = '';
    this.overlayTimer = 0;
    this._overlayCallback = null;
    this.renderer.buildPlatformMeshes(this.map.platforms);
    this.renderer.buildPlayerMeshes();
    this._showOverlay('FIGHT', '', 1.2, () => {});
  }

  // ── Round / match logic ───────────────────────────────────────────────────────

  _onPlayerDied(deadIdx) {
    const survivorIdx = 1 - deadIdx;
    const survivor = this.players[survivorIdx];
    survivor.fightWins = (survivor.fightWins || 0) + 1;
    survivor.score    += 0.5;

    playDeath();
    const winColor = survivorIdx === 0 ? '#e63946' : '#457b9d';

    if (this.isOnline && this.isHost) {
      this.net.send({ type: 'fight_result', winnerIdx: survivorIdx });
    }

    this._showOverlay(`Player ${survivorIdx + 1} wins`, '', 1.6, () => {
      if (survivor.score >= 5) {
        this._endMatch(survivorIdx);
      } else if (survivor.fightWins >= 2) {
        survivor.fightWins = 0;
        this.players[deadIdx].fightWins = 0;
        this._startCardPick(deadIdx);
      } else {
        this._startFight();
      }
    }, winColor);
  }

  _endMatch(winnerIdx) {
    this.state = 'match_end';
    if (this.isOnline && this.isHost) {
      this.net.send({ type: 'match_end', winnerIdx });
    }
  }

  _receiveFightResult(msg) {
    const winColor = msg.winnerIdx === 0 ? '#e63946' : '#457b9d';
    playDeath();
    this._showOverlay(`Player ${msg.winnerIdx + 1} wins`, '', 1.6, () => {
      this.overlayText = '';
    }, winColor);
  }

  _goToLobby() {
    this.state      = 'lobby';
    this.isLocal    = false;
    this.isOnline   = false;
    this.isHost     = true;
    this.players    = [null, null];
    this.bullets    = [];
    this.lobbyState = { mode: 'menu', roomCode: '', inputCode: '', error: '' };
    if (this.net) {
      this.net.onOpponentLeft = null;
      this.net.onMessage      = null;
      this.net.disconnect();
      this.net = null;
    }
  }

  _startCardPick(loserIdx) {
    this.state      = 'card_pick';
    this.pickerIdx  = loserIdx;
    this.cardOffer  = drawCardOffer(5);
    this.cardHovered = -1;

    if (this.isOnline && this.isHost) {
      this.net.send({ type: 'card_pick', offer: this.cardOffer.map(c => c.id), pickerIdx: loserIdx });
    }
  }

  _receiveCardPick(msg) {
    this.state     = 'card_pick';
    this.pickerIdx = msg.pickerIdx;
    this.cardOffer = msg.offer.map(id => CARDS.find(c => c.id === id));
    this.cardHovered = -1;
  }

  _pickCardRound(idx) {
    if (this.state !== 'card_pick') return;
    const localIdx = this.isHost ? 0 : 1;
    if (this.isOnline && localIdx !== this.pickerIdx) return;

    playUiTick();
    const card = this.cardOffer[idx];
    card.apply(this.players[this.pickerIdx]);
    this.players[this.pickerIdx].cards.push(card);

    if (this.isOnline) {
      this.net.send({ type: 'card_pick_choice', cardId: card.id });
    }
    if (this.isOnline && !this.isHost) return; // guest waits for fight_start from host
    this._startFight();
  }

  // ── Overlay helper ────────────────────────────────────────────────────────────

  _showOverlay(text, subtext, duration, callback, color = '#ffffff') {
    this.overlayText    = text;
    this.overlaySubtext = subtext;
    this.overlayColor   = color;
    this.overlayTimer   = duration;
    this._overlayCallback = callback;
  }

  // ── Shooting ─────────────────────────────────────────────────────────────────

  _tryShoot(p, playerIdx) {
    if (p.ammo <= 0 || p.shootTimer > 0 || p.reloading) return;
    p.ammo--;
    p.shootTimer = p.shootCooldown;

    // Recoil
    p.vx -= Math.cos(p.aimAngle) * RECOIL_VX;

    const spread = (p.bulletsPerShot - 1) * 0.08;
    for (let i = 0; i < p.bulletsPerShot; i++) {
      const angleOffset = p.bulletsPerShot > 1 ? (i / (p.bulletsPerShot - 1) - 0.5) * spread * 2 : 0;
      const a = p.aimAngle + angleOffset;
      const bvx = Math.cos(a) * p.bulletSpeed;
      const bvy = -Math.sin(a) * p.bulletSpeed;
      this.bullets.push(createBullet(playerIdx, p.x, p.y, bvx, bvy, p.bulletRadius, p.bulletDamage, p.bulletBounces, p.bulletHoming));
    }

    playShoot();
    if (p.ammo === 0) {
      if (p.autoBlockOnLastShot) this._startBlock(p);
      this._startReload(p);
    }
  }

  _startReload(p) {
    p.reloading   = true;
    p.reloadTimer = p.reloadTime;
    playReload();
  }

  _startBlock(p) {
    if (p.blockTimer > 0) return;
    p.blocking          = true;
    p.blockDurationTimer = BLOCK_DURATION;
    p.blockTimer        = p.blockCooldown;
    playBlock();
  }

  // ── Game tick ─────────────────────────────────────────────────────────────────

  _tick(dt) {
    if (this.state !== 'fight') return;

    // Overlay timer (runs on host only in online mode)
    if (this.overlayTimer > 0) {
      this.overlayTimer -= dt;
      if (this.overlayTimer <= 0 && this._overlayCallback) {
        const cb = this._overlayCallback;
        this._overlayCallback = null;
        this.overlayText = '';
        cb();
      }
      return;
    }

    // Tick floating damage numbers
    for (let i = this._dmgNumbers.length - 1; i >= 0; i--) {
      this._dmgNumbers[i].timer -= dt;
      this._dmgNumbers[i].y    -= 60 * dt;  // float upward (arena units/s)
      if (this._dmgNumbers[i].timer <= 0) this._dmgNumbers.splice(i, 1);
    }

    // Guest does not simulate -- it sends inputs and receives authoritative state
    if (this.isOnline && !this.isHost) {
      this._sendContinuousInput();
      return;
    }

    const p1 = this.players[0];
    const p2 = this.players[1];

    this._updatePlayer(p1, 0, dt, p2);
    this._updatePlayer(p2, 1, dt, p1);
    this._updateBullets(dt, p1, p2);
  }

  _updatePlayer(p, idx, dt, opponent) {
    if (p.hp <= 0) return;

    // Decay damage over time
    if (p.damageDecay && p._decayQueue) {
      let ddt = 0;
      for (const tick of p._decayQueue) { tick.timer -= dt; if (tick.timer <= 0) ddt += tick.amount; }
      p._decayQueue = p._decayQueue.filter(t => t.timer > 0);
      if (ddt > 0) this._applyDamage(p, idx, ddt, null);
    }

    // Taste of blood
    if (p.tasteTimer > 0) { p.tasteTimer -= dt; }
    const speedMult = (p.tasteTimer > 0) ? 1.5 : 1.0;

    // Shoot timer
    if (p.shootTimer > 0) p.shootTimer -= dt;

    // Reload
    if (p.reloading) {
      p.reloadTimer -= dt;
      if (p.reloadTimer <= 0) { p.reloading = false; p.ammo = p.maxAmmo; }
    }

    // Block cooldown and active duration
    if (p.blockTimer > 0) p.blockTimer -= dt;
    if (p.blocking) {
      p.blockDurationTimer -= dt;
      if (p.blockDurationTimer <= 0) p.blocking = false;
    }

    // Pristine perseverance: grant HP bonus once if above 90%
    if (p.pristineBonus && !p.pristineFired && p.hp / p.maxHp > 0.9) {
      p.hp += 400;
      if (p.hp > p.maxHp) p.maxHp = p.hp;
      p.pristineFired = true;
    }

    const isLocal = this.isLocal;

    // Aim from local mouse: host controls P1, local mode P2 auto-aims toward P1
    const hostControlsThis  = this.isHost  && idx === 0;
    const localP2           = isLocal      && idx === 1;
    if (hostControlsThis) {
      p.aimAngle = Math.atan2(-(this._mouseY - p.y), this._mouseX - p.x);
    } else if (localP2) {
      const opp = this.players[0];
      if (opp) p.aimAngle = Math.atan2(-(opp.y - p.y), opp.x - p.x);
    }

    // Movement input
    const moveMult = MOVE_SPEED * speedMult;
    if (idx === 0 && this.isHost || isLocal && idx === 0) {
      if (this._keys['KeyA']) p.vx -= moveMult * dt * 12;
      if (this._keys['KeyD']) p.vx += moveMult * dt * 12;
    }
    if (idx === 1 && !this.isHost || isLocal && idx === 1) {
      if (this._keys['ArrowLeft'])  p.vx -= moveMult * dt * 12;
      if (this._keys['ArrowRight']) p.vx += moveMult * dt * 12;
    }

    // Apply guest input on host
    if (idx === 1 && this.isHost && this.isOnline && this.pendingInput) {
      const inp = this.pendingInput;
      if (inp.keys.left)  p.vx -= moveMult * dt * 12;
      if (inp.keys.right) p.vx += moveMult * dt * 12;
      if (inp.keys.jump)  doJump(p);
      if (inp.keys.shoot) this._tryShoot(p, 1);
      if (inp.keys.block) this._startBlock(p);
      p.aimAngle = inp.mouseAngle;
      this.pendingInput = null;
    }

    // Block for P1 via Shift (shoot comes from mousedown)
    if ((idx === 0 && this.isHost) || (isLocal && idx === 0)) {
      if (this._keys['ShiftLeft'] || this._keys['ShiftRight']) this._startBlock(p);
    }
    if (isLocal && idx === 1) {
      if (this._keys['Numpad0']) this._tryShoot(p, 1);
      if (this._keys['NumpadEnter']) this._startBlock(p);
    }

    // Clamp horizontal velocity
    const maxV = MOVE_SPEED * speedMult;
    if (p.vx >  maxV) p.vx =  maxV;
    if (p.vx < -maxV) p.vx = -maxV;

    // Physics
    if (p.wallJumpCooldown > 0) p.wallJumpCooldown -= dt;
    applyGravity(p, dt);
    applyVelocity(p, dt);
    resolvePlatforms(p, p.radius, this.map.platforms, dt);
    clampToArena(p, p.radius, ARENA_W, ARENA_H);

    // Friction
    if (p.onGround) p.vx *= Math.pow(FRICTION, dt * 60);
  }

  _updateBullets(dt, p1, p2) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.prevX = b.x; b.prevY = b.y;

      // Homing
      if (b.homing) {
        const target = b.owner === 0 ? p2 : p1;
        if (target && target.hp > 0) {
          const dx = target.x - b.x;
          const dy = target.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const steer = 1200;
          b.vx += (dx / dist) * steer * dt;
          b.vy += (dy / dist) * steer * dt;
        }
      }

      b.vy += GRAVITY * 0.25 * dt;  // bullets arc under partial gravity
      b.x  += b.vx * dt;
      b.y  += b.vy * dt;

      // Wall/ceiling bounces
      if (b.bounces > 0) {
        if (b.x - b.radius < 0 || b.x + b.radius > ARENA_W) { b.vx = -b.vx; b.x = Math.max(b.radius, Math.min(ARENA_W - b.radius, b.x)); b.bounces--; }
        if (b.y - b.radius < 0)                              { b.vy = -b.vy; b.y = b.radius; b.bounces--; }
      }

      // Platform bounce/stop
      let hitPlat = false;
      for (const plat of this.map.platforms) {
        if (b.x + b.radius > plat.x && b.x - b.radius < plat.x + plat.w &&
            b.y + b.radius > plat.y && b.y - b.radius < plat.y + plat.h) {
          if (b.bounces > 0) { b.vy = -Math.abs(b.vy); b.bounces--; b.y = plat.y - b.radius; }
          else { hitPlat = true; }
          break;
        }
      }
      if (hitPlat) { this.bullets.splice(i, 1); continue; }

      // Out of bounds (no bounces)
      if (b.x < -100 || b.x > ARENA_W + 100 || b.y < -100 || b.y > ARENA_H + 100) {
        this.bullets.splice(i, 1); continue;
      }

      // Hit player
      const target = b.owner === 0 ? p2 : p1;
      const targetIdx = b.owner === 0 ? 1 : 0;
      if (target && target.hp > 0) {
        const dx   = b.x - target.x;
        const dy   = b.y - target.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < b.radius + target.radius) {
          if (target.blocking) {
            // Deflect
            b.vx = -b.vx; b.vy = -b.vy; b.owner = targetIdx;
            this.renderer.triggerShake(3, 0.1);
          } else {
            this._dealDamage(b, target, targetIdx, b.owner);
            this.bullets.splice(i, 1);
          }
        }
      }
    }
  }

  _dealDamage(bullet, target, targetIdx, shooterIdx) {
    const shooter = this.players[shooterIdx];
    let dmg = bullet.damage;

    if (target.damageDecay) {
      if (!target._decayQueue) target._decayQueue = [];
      target._decayQueue.push({ amount: dmg / 4, timer: 1.0 });
      target._decayQueue.push({ amount: dmg / 4, timer: 2.0 });
      target._decayQueue.push({ amount: dmg / 4, timer: 3.0 });
      target._decayQueue.push({ amount: dmg / 4, timer: 4.0 });
    } else {
      this._applyDamage(target, targetIdx, dmg, shooter);
    }

    if (shooter && shooter.leech > 0) {
      shooter.hp = Math.min(shooter.maxHp, shooter.hp + dmg * shooter.leech);
    }
    if (shooter && shooter.tasteOfBlood) {
      shooter.tasteTimer = 3.0;
    }

    // Knockback
    const angle = Math.atan2(bullet.vy, bullet.vx);
    target.vx += Math.cos(angle) * 180;
    target.vy += Math.sin(angle) * 80;

    this.renderer.spawnHitBurst(target.x, target.y, targetIdx === 0 ? 0xe63946 : 0x457b9d);
    this.renderer.triggerShake(5, 0.18);
    playHit();
    const dmgColor = targetIdx === 0 ? '#e63946' : '#457b9d';
    this._dmgNumbers.push({ x: target.x, y: target.y - target.radius, amount: Math.round(bullet.damage), timer: 0.9, color: dmgColor });
  }

  _applyDamage(target, targetIdx, dmg, shooter) {
    target.hp -= dmg;
    if (target.hp <= 0) {
      target.hp = 0;
      this._onPlayerDied(targetIdx);
    }
  }

  // ── Main loop ─────────────────────────────────────────────────────────────────

  start() {
    this._prevTime = performance.now();
    const loop = (now) => {
      this._frameId = requestAnimationFrame(loop);
      const dt = Math.min((now - this._prevTime) / 1000, 0.05);
      this._prevTime = now;
      this._update(dt, now / 1000);
    };
    requestAnimationFrame(loop);
  }

  _update(dt, t) {
    this._tick(dt);

    // Broadcast state from host at ~60hz
    if (this.isOnline && this.isHost && this.state === 'fight') {
      this._broadcastState();
    }

    this._dt = dt;
    this._draw(t);
  }

  _draw(t) {
    const dt = this._dt || 0;

    // Update meshes before rendering so Three.js sees current frame state
    if (this.state === 'fight' || this.state === 'match_end') {
      this.renderer.syncBullets(this.bullets);
      if (this.players[0]) this.renderer.updatePlayerMesh(0, this.players[0], this.players[0].aimAngle, t);
      if (this.players[1]) this.renderer.updatePlayerMesh(1, this.players[1], this.players[1].aimAngle, t);
    }

    this.renderer.render(dt, t);
    this.ui.clear();

    if (this.state === 'lobby' || this.state === 'start_pick') {
      const ls = { ...this.lobbyState };
      if (this.state === 'start_pick') {
        ls.mode = 'start_pick';
        const isLocalPicker = this.isLocal || (this.isHost && this.pickerIdx === 0) || (!this.isHost && this.pickerIdx === 1);
        const pickerCards = this.players[this.pickerIdx]?.cards || [];
        this.ui.drawCardPicker(this.cardOffer, this.cardHovered, this.pickerIdx, isLocalPicker, pickerCards);
      } else {
        this.ui.drawLobby(ls);
      }
      this.ui.drawFooter();
      return;
    }

    if (this.state === 'fight') {
      const p1 = this.players[0];
      const p2 = this.players[1];
      if (p1 && p2) {
        this.ui.drawHealthBars(p1, p2);
        this.ui.drawScores(p1.score, p2.score);
        this.ui.drawAmmo(p1, p2);
        this.ui.drawCardStrips(p1.cards || [], p2.cards || []);
      }
      if (this._dmgNumbers.length > 0) this.ui.drawDamageNumbers(this._dmgNumbers);
      if (this.overlayText) {
        this.ui.drawRoundText(this.overlayText, this.overlaySubtext, this.overlayColor);
      }
    }

    if (this.state === 'card_pick') {
      const isLocalPicker = this.isLocal || (this.isHost && this.pickerIdx === 0) || (!this.isHost && this.pickerIdx === 1);
      const pickerCards = this.players[this.pickerIdx]?.cards || [];
      this.ui.drawCardPicker(this.cardOffer, this.cardHovered, this.pickerIdx, isLocalPicker, pickerCards);
    }

    if (this.state === 'match_end') {
      const winnerIdx = this.players[0].score >= 5 ? 0 : 1;
      this.ui.drawWinner(winnerIdx);
    }

    this.ui.drawFooter();
  }
}
