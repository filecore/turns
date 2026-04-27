// game.js — core game loop and state machine

import { Renderer, ARENA_W, ARENA_H } from './renderer.js';
import { UI } from './ui.js';
import { Network } from './network.js';
import { playShoot, playReload, playBlock, playHit, playDeath, playUiTick, playLowHp, playRicochet, playExplosion, playSniper, startAmbient, stopAmbient } from './audio.js';
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
    regen: 0, bulletExplosive: false, deadManHand: false, speedLoader: false, freshReload: false,
    berserk: false, armor: 0, volatile: false,
    bulletNoGravity: false, bulletPiercing: false, slippery: false,
    maxExtraJumps: 0,
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
function createBullet(owner, x, y, vx, vy, radius, damage, bounces, homing, explosive = false, noGravity = false, piercing = false) {
  // hasBouncedOff: owner immune until bullet ricochets off a platform or wall
  // lifetime: auto-expire after 5s to prevent accumulation from bouncing
  return { id: bulletIdCounter++, owner, x, y, vx, vy, radius, damage, bounces, homing, explosive, noGravity, piercing, prevX: x, prevY: y, hasBouncedOff: false, hitCooldowns: {}, lifetime: 5.0 };
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
    this.paused         = false;

    this.lobbyState  = { mode: 'menu', roomCode: '', inputCode: '', error: '' };

    this._keys        = {};
    this._mouseAngle  = 0;
    this._mouseX      = 0;
    this._mouseY      = 0;
    this._prevTime    = 0;
    this._frameId     = null;
    this._fightOver    = false;  // guard against double-death in same tick
    this._pendingBlock = false;  // guest right-click block flag
    this._pendingShoot = false;  // guest left-click shoot flag
    this._prevLobbyHover = null;
    this.matchWinner   = 0;
    this.isAI          = false;
    this.aiDifficulty  = 'normal';
    this._aiAimOffset  = 0;
    this._aiAimTimer   = 0;
    // AI parameter fields (set by _applyAIDifficulty)
    this._aiAimRange      = 0.14;
    this._aiAimMinT       = 0.08;
    this._aiAimMaxT       = 0.12;
    this._aiShootThresh   = 0.92;
    this._aiShootRate     = 5;
    this._aiTargetDist    = 280;
    this._aiBlockRate     = 0.3;
    this._aiSmartCards    = true;
    this._lobbyMapTimer   = 4.0;

    this._bindInput();

    // Build a lobby arena preview so the background is lit on first load
    const lobbyMap = randomMap();
    this._lobbyMapName = lobbyMap.name;
    this.renderer.setMapTint(lobbyMap.bgTint || 0x111122);
    this.renderer.buildPlatformMeshes(lobbyMap.platforms, lobbyMap.platformColor);
  }

  // ── Input binding ────────────────────────────────────────────────────────────

  _bindInput() {
    const gameKeys = new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space']);
    window.addEventListener('keydown', e => {
      if (this.state !== 'lobby' && gameKeys.has(e.code)) e.preventDefault();
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
      const r = this.ui.canvas.getBoundingClientRect();
      this._canvasMouseX = e.clientX - r.left;
      this._canvasMouseY = e.clientY - r.top;
      if (this.state === 'card_pick' || this.state === 'start_pick') {
        const aiTurn = this.isAI && this.pickerIdx === 1;
        if (!aiTurn) {
          const prev = this.cardHovered;
          this.cardHovered = this.ui.getCardPickerHover(this.cardOffer, this._canvasMouseX, this._canvasMouseY);
          if (this.cardHovered >= 0 && this.cardHovered !== prev) playUiTick();
        }
      }
      if (this.state === 'lobby') {
        const hover = this.ui.getLobbyClick(this._canvasMouseX, this._canvasMouseY, this.lobbyState.mode);
        if (hover && hover !== this._prevLobbyHover) playUiTick();
        this._prevLobbyHover = hover;
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

    if (e.code === 'Escape' && this.state === 'fight' && !this.isOnline) {
      this.paused = !this.paused;
    }

    // Card picker keyboard navigation
    if (this.state === 'start_pick' || this.state === 'card_pick') {
      const n = this.cardOffer?.length || 0;
      if (!n) return;
      const localIdx = this.isHost ? 0 : 1;
      const canPick = !this.isOnline || localIdx === this.pickerIdx;
      const canPickAI = !this.isAI || this.pickerIdx === 0;
      if (!canPick || !canPickAI) return;

      if (this.cardHovered < 0) this.cardHovered = 0;
      if (e.code === 'ArrowLeft')  { this.cardHovered = this.cardHovered <= 0 ? n - 1 : this.cardHovered - 1; }
      if (e.code === 'ArrowRight') { this.cardHovered = this.cardHovered >= n - 1 ? 0 : this.cardHovered + 1; }
      if (e.code === 'Enter' || e.code === 'Space') {
        const idx = this.cardHovered >= 0 ? this.cardHovered : 0;
        if (this.state === 'start_pick') this._pickCard(idx);
        else                             this._pickCardRound(idx);
      }
    }

    if (this.state === 'fight') {
      const p = this.isHost ? this.players[0] : this.players[1];
      if (!p || p.hp <= 0) return;
      if (e.code === 'KeyW') {
        const target = this.isHost || this.isLocal ? this.players[0] : this.players[1];
        if (target && target.hp > 0) {
          const wasAir = !target.onGround && target.coyoteTimer <= 0;
          if (doJump(target) && wasAir) this._spawnJumpPuff(target, 0);
          this._sendInput();
        }
      }
      if (e.code === 'ArrowUp') {
        if (this.isLocal) {
          const p2 = this.players[1];
          if (p2 && p2.hp > 0) {
            const wasAir = !p2.onGround && p2.coyoteTimer <= 0;
            if (doJump(p2) && wasAir) this._spawnJumpPuff(p2, 1);
          }
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

    if (e.button === 0) {
      if (this.isOnline && !this.isHost) {
        // Guest: signal shoot via next continuous input send
        this._pendingShoot = true;
        this._sendContinuousInput();
        this._pendingShoot = false;
      }
      this._tryShoot(p, localIdx);
    }
    if (e.button === 2) {
      if (this.isOnline && !this.isHost) {
        // Guest: signal block via next continuous input send
        this._pendingBlock = true;
        this._sendContinuousInput();
        this._pendingBlock = false;
      } else {
        this._startBlock(p);
      }
    }
  }

  _onOverlayClick(mx, my) {
    if (this.state === 'lobby') {
      if (this.lobbyState.mode === 'menu') {
        const action = this.ui.getLobbyClick(mx, my, 'menu');
        if (action === 'host')  this._doHost();
        if (action === 'join')  { this.lobbyState.mode = 'joining'; this.lobbyState.error = ''; }
        if (action === 'local') this._startLocal();
        if (action === 'ai')    this.lobbyState.mode = 'ai_difficulty';
      } else if (this.lobbyState.mode === 'ai_difficulty') {
        const action = this.ui.getLobbyClick(mx, my, 'ai_difficulty');
        if (action === 'back')   this.lobbyState.mode = 'menu';
        if (action === 'easy')   { this.aiDifficulty = 'easy';   this._startAI(); }
        if (action === 'normal') { this.aiDifficulty = 'normal'; this._startAI(); }
        if (action === 'hard')   { this.aiDifficulty = 'hard';   this._startAI(); }
      }
    }

    if (this.state === 'start_pick') {
      const localIdx = this.isHost ? 0 : 1;
      if (this.isOnline && localIdx !== this.pickerIdx) return;
      if (this.isAI && this.pickerIdx !== 0) return;  // AI picks for P2; block human click
      const picked = this.ui.getCardPickerClick(this.cardOffer, mx, my);
      if (picked >= 0) this._pickCard(picked);
    }

    if (this.state === 'card_pick') {
      const localIdx = this.isHost ? 0 : 1;
      if (this.isOnline && localIdx !== this.pickerIdx) return;
      if (this.isAI && this.pickerIdx !== 0) return;  // AI picks for P2; block human click
      const picked = this.ui.getCardPickerClick(this.cardOffer, mx, my);
      if (picked >= 0) this._pickCardRound(picked);
    }

    if (this.state === 'match_end') {
      const action = this.ui.getMatchEndClick(mx, my);
      if (action === 'rematch') this._doRematch();
      else                      this._goToLobby();
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
    this.net.onOpponentLeft = () => {
      this._goToLobby();
      this.lobbyState.error = 'Opponent disconnected';
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
      this.state       = 'match_end';
      this.matchWinner = msg.winnerIdx;
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
        left:  !!(this._keys['ArrowLeft']  || this._keys['KeyA']),
        right: !!(this._keys['ArrowRight'] || this._keys['KeyD']),
        jump:  !!(this._keys['ArrowUp']    || this._keys['KeyW']),
        shoot: !!(this._keys['Numpad0']    || this._pendingShoot),
        block: !!(this._keys['NumpadEnter'] || this._keys['ShiftLeft'] || this._keys['ShiftRight'] || this._pendingBlock),
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
      bullets: this.bullets.map(b => ({ id: b.id, x: b.x, y: b.y, prevX: b.prevX, prevY: b.prevY, owner: b.owner, radius: b.radius, explosive: b.explosive || false, homing: b.homing || false })),
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
      score: p.score, fightWins: p.fightWins, landTimer: p.landTimer || 0,
      cards: (p.cards || []).map(c => c.id),
      // Visual effect properties for guest rendering
      armor: p.armor || 0, berserk: p.berserk || false,
      tasteTimer: p.tasteTimer || 0, regen: p.regen || 0,
      leech: p.leech || 0, damageDecay: p.damageDecay || false,
      deadManHand: p.deadManHand || false, volatile: p.volatile || false,
      _decayQueue: p._decayQueue || null,
    };
  }

  _applyRemoteState(msg) {
    for (const [pi, key] of [[0, 'p1'], [1, 'p2']]) {
      const snap   = msg[key];
      const player = this.players[pi];
      if (!snap || !player) continue;

      const prevHp   = player.hp;
      const prevCards = player.cards;
      Object.assign(player, snap);
      player.cards = Array.isArray(snap.cards)
        ? snap.cards.map(id => CARDS.find(c => c.id === id)).filter(Boolean)
        : prevCards;

      const delta = prevHp - player.hp;
      if (delta > 0 && prevHp > 0) {
        const col = pi === 0 ? '#e63946' : '#457b9d';
        this._dmgNumbers.push({ x: player.x, y: player.y - player.radius, amount: Math.round(delta), timer: 0.9, maxTimer: 0.9, color: col });
        this.renderer.spawnHitBurst(player.x, player.y, pi === 0 ? 0xe63946 : 0x457b9d);
        this.renderer.flashPlayer(pi);
        this.renderer.triggerShake(5, 0.18);
        playHit();
      }
    }
    this.bullets = msg.bullets || [];
  }

  // ── Match setup ───────────────────────────────────────────────────────────────

  _startLocal() {
    this.isLocal  = true;
    this.isOnline = false;
    this.isHost   = true;
    this.isAI     = false;
    this._startStartPick();
  }

  _startAI() {
    this.isLocal  = true;
    this.isOnline = false;
    this.isHost   = true;
    this.isAI     = true;
    this._applyAIDifficulty();
    this._startStartPick();
  }

  _applyAIDifficulty() {
    if (this.aiDifficulty === 'easy') {
      this._aiAimRange    = 0.55;
      this._aiAimMinT     = 0.25;
      this._aiAimMaxT     = 0.20;
      this._aiShootThresh = 0.70;
      this._aiShootRate   = 2.5;
      this._aiTargetDist  = 420;
      this._aiBlockRate   = 0.10;
      this._aiSmartCards  = false;
    } else if (this.aiDifficulty === 'hard') {
      this._aiAimRange    = 0.05;
      this._aiAimMinT     = 0.03;
      this._aiAimMaxT     = 0.04;
      this._aiShootThresh = 0.96;
      this._aiShootRate   = 9;
      this._aiTargetDist  = 240;
      this._aiBlockRate   = 0.55;
      this._aiSmartCards  = true;
    } else {
      this._aiAimRange    = 0.14;
      this._aiAimMinT     = 0.08;
      this._aiAimMaxT     = 0.12;
      this._aiShootThresh = 0.92;
      this._aiShootRate   = 5;
      this._aiTargetDist  = 280;
      this._aiBlockRate   = 0.30;
      this._aiSmartCards  = true;
    }
  }

  _startStartPick() {
    this.state = 'start_pick';
    this.startPickPhase = 0;
    this.map   = randomMap();
    const spawn = this.map;
    this.players[0] = createPlayer(spawn.spawnP1.x, spawn.spawnP1.y);
    this.players[1] = createPlayer(spawn.spawnP2.x, spawn.spawnP2.y);
    this.renderer.setMapTint(this.map.bgTint || 0x111122);
    this.renderer.buildPlatformMeshes(this.map.platforms, this.map.platformColor);
    this.renderer.buildPlayerMeshes();

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
    // phase mirrors pickerIdx so guest's _advanceStartPickOrFight logic is correct
    this.startPickPhase = msg.pickerIdx;
    // Only create players on first start_pick -- second call (P2's turn) must not wipe P1's card
    if (!this.players[0]) {
      const spawn = randomMap();
      this.map = spawn;
      this.players[0] = createPlayer(spawn.spawnP1.x, spawn.spawnP1.y);
      this.players[1] = createPlayer(spawn.spawnP2.x, spawn.spawnP2.y);
      this.renderer.setMapTint(this.map.bgTint || 0x111122);
      this.renderer.buildPlatformMeshes(this.map.platforms, this.map.platformColor);
      this.renderer.buildPlayerMeshes();
    }
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
      if (this.isAI) this._scheduleAIPick('start_pick');
    } else {
      if (this.isOnline && !this.isHost) return; // guest waits for fight_start from host
      this._startFight();
    }
  }

  _scheduleAIPick(phase) {
    const offer = this.cardOffer || [];
    if (!offer.length) return;
    const chosenIdx = this._aiChooseCard(offer, this.players[1]);

    // Wander over 2-3 random cards so the human can follow along
    const wanderSteps = 2 + Math.floor(Math.random() * 2);
    let delay = 900 + Math.random() * 400;

    for (let i = 0; i < wanderSteps; i++) {
      const randIdx = Math.floor(Math.random() * offer.length);
      const d = delay;
      setTimeout(() => {
        if (this.state !== phase || this.pickerIdx !== 1) return;
        this.cardHovered = randIdx;
      }, d);
      delay += 500 + Math.random() * 350;
    }

    // Settle on the chosen card
    setTimeout(() => {
      if (this.state !== phase || this.pickerIdx !== 1) return;
      this.cardHovered = chosenIdx;
    }, delay);
    delay += 700 + Math.random() * 400;

    // Confirm pick
    setTimeout(() => {
      if (this.state !== phase || this.pickerIdx !== 1) return;
      this.cardHovered = -1;
      if (phase === 'start_pick') this._pickCard(chosenIdx);
      else                        this._pickCardRound(chosenIdx);
    }, delay);
  }

  _aiChooseCard(offer, aiPlayer) {
    if (!this._aiSmartCards) return Math.floor(Math.random() * offer.length);

    const owned   = new Set((aiPlayer?.cards || []).map(c => c.id));
    const ownedArr = (aiPlayer?.cards || []).map(c => c.id);

    // Card utility scores
    const PREF = {
      haste: 3, quick_hands: 3, chaser: 3, leech: 3, regeneration: 3,
      tank: 2, glass_cannon: 2, bouncy: 2, taste_of_blood: 2, explosive_rounds: 2,
      dead_mans_hand: 3, speed_loader: 2, bigger_magazine: 1,
      extra_ammo: 1, quick_reload: 1, big_bullet: 1, burst: 1, huge: 1,
      shields_up: 1, decay: 1, defender: 1, pristine_perseverance: 2,
      berserk: 3, armor: 2, volatile: 2,
      sniper: 2, drill: 3, slippery: 1, extra_jump: 2,
    };

    let bestIdx = 0, bestScore = -Infinity;
    offer.forEach((card, i) => {
      let score = PREF[card.id] || 1;

      // Penalise duplicates except stackable cards
      const stackable = new Set(['extra_ammo', 'bouncy', 'quick_reload', 'haste', 'regeneration', 'bigger_magazine', 'armor', 'extra_jump']);
      if (owned.has(card.id) && !stackable.has(card.id)) score -= 4;

      // Synergies
      if (card.id === 'chaser'    && ownedArr.includes('bouncy'))    score += 1;
      if (card.id === 'leech'     && ownedArr.includes('glass_cannon')) score += 2;
      if (card.id === 'tank'      && ownedArr.includes('shields_up')) score += 1;
      if (card.id === 'quick_hands' && ownedArr.includes('burst'))     score += 1;
      if (card.id === 'dead_mans_hand' && ownedArr.includes('glass_cannon')) score += 3;
      if (card.id === 'speed_loader' && ownedArr.includes('quick_reload'))   score += 2;
      if (card.id === 'berserk'   && ownedArr.includes('dead_mans_hand')) score += 2;
      if (card.id === 'volatile'  && ownedArr.includes('defender'))   score += 2;
      if (card.id === 'drill'     && ownedArr.includes('bouncy'))    score += 2;
      if (card.id === 'sniper'    && ownedArr.includes('quick_hands')) score += 1;

      // Small random tiebreak so AI doesn't always pick identically
      score += Math.random() * 0.5;

      if (score > bestScore) { bestScore = score; bestIdx = i; }
    });
    return bestIdx;
  }

  _startFight() {
    this.state = 'fight';
    this.bullets = [];
    this._dmgNumbers = [];
    this._fightOver = false;
    this.map = randomMap();
    this.renderer.setMapTint(this.map.bgTint || 0x111122);
    this.renderer.buildPlatformMeshes(this.map.platforms, this.map.platformColor);
    this.renderer.buildPlayerMeshes();

    // Reset positions and hp
    for (let i = 0; i < 2; i++) {
      const p = this.players[i];
      const spawn = i === 0 ? this.map.spawnP1 : this.map.spawnP2;
      p.x = spawn.x; p.y = spawn.y; p.vx = 0; p.vy = 0;
      p.hp = p.maxHp; p.ammo = p.maxAmmo; p.reloading = false; p.reloadTimer = 0;
      p.blocking = false; p.blockTimer = 0; p.blockDurationTimer = 0; p.shootTimer = 0;
      p.tasteTimer = 0; p.pristineFired = false; p._decayQueue = null; p.landTimer = 0; p.coyoteTimer = 0; p.freshReload = false;
    }

    if (this.isOnline && this.isHost) {
      this.net.send({ type: 'fight_start', mapIdx: MAPS.indexOf(this.map), lastCard: this._lastPickedCard?.name || null });
    }

    let hint = '';
    const fightNum = (this.players[0]?.fightWins || 0) + (this.players[1]?.fightWins || 0) + 1;
    const isFirstFight = (this.players[0]?.score || 0) === 0 && (this.players[1]?.score || 0) === 0 && fightNum === 1;
    if (isFirstFight) {
      if (this.isAI)          hint = `WASD + mouse   LClick shoot   RClick block   AI: ${this.aiDifficulty.toUpperCase()}`;
      else if (this.isLocal)  hint = 'P1: WASD + LClick  |  P2: Arrows + / to shoot  .  to block';
      else if (this.isOnline) hint = 'WASD + mouse   LClick shoot   RClick block';
    }
    let midtext = `${this.map?.name || ''} • Fight ${fightNum}`;
    if (this._lastPickedCard) {
      midtext += `  |  +${this._lastPickedCard.name}`;
      this._lastPickedCard = null;
    }
    this._showOverlay('FIGHT', hint, 2.0, () => {}, '#ffffff', midtext);
    startAmbient();
  }

  _receiveFightStart(msg) {
    this.map = MAPS[msg.mapIdx] || randomMap();
    this.state = 'fight';
    this.bullets = [];
    this._dmgNumbers = [];
    this._fightOver = false;
    this.overlayText  = '';
    this.overlayTimer = 0;
    this._overlayCallback = null;
    this.renderer.setMapTint(this.map.bgTint || 0x111122);
    this.renderer.buildPlatformMeshes(this.map.platforms, this.map.platformColor);
    this.renderer.buildPlayerMeshes();
    startAmbient();
    const gFightNum = (this.players[0]?.fightWins || 0) + (this.players[1]?.fightWins || 0) + 1;
    const gIsFirst  = (this.players[0]?.score || 0) === 0 && (this.players[1]?.score || 0) === 0 && gFightNum === 1;
    const gHint     = gIsFirst ? 'WASD / Arrows + mouse   LClick shoot   RClick block' : '';
    let gMidtext  = `${this.map?.name || ''} • Fight ${gFightNum}`;
    if (msg.lastCard) gMidtext += `  |  +${msg.lastCard}`;
    this._showOverlay('FIGHT', gHint, 2.0, () => {}, '#ffffff', gMidtext);
  }

  // ── Round / match logic ───────────────────────────────────────────────────────

  _onPlayerDied(deadIdx) {
    if (this._fightOver) return;
    this._fightOver = true;
    const survivorIdx = 1 - deadIdx;
    const survivor = this.players[survivorIdx];
    survivor.fightWins = (survivor.fightWins || 0) + 1;
    survivor.score    += 0.5;
    const scoreCol = survivorIdx === 0 ? '#e63946' : '#457b9d';
    this._dmgNumbers.push({ x: this.players[survivorIdx].x, y: this.players[survivorIdx].y - this.players[survivorIdx].radius * 2.5, amount: 0, timer: 1.2, maxTimer: 1.2, color: scoreCol, label: '+0.5' });

    stopAmbient();
    playDeath();
    const dead = this.players[deadIdx];
    if (dead) {
      const deathColor = deadIdx === 0 ? 0xe63946 : 0x457b9d;
      this.renderer.spawnDeathBurst(dead.x, dead.y, deathColor, dead.lastHitAngle);
      this.renderer.triggerShake(10, 0.35);
    }
    const winColor = survivorIdx === 0 ? '#e63946' : '#457b9d';
    const s0 = this.players[0]?.score || 0;
    const s1 = this.players[1]?.score || 0;
    const scoreSubtext = `${s0 % 1 === 0 ? s0 : s0.toFixed(1)}  -  ${s1 % 1 === 0 ? s1 : s1.toFixed(1)}`;

    if (this.isOnline && this.isHost) {
      this.net.send({ type: 'fight_result', winnerIdx: survivorIdx });
    }

    this._showOverlay(`Player ${survivorIdx + 1} wins`, scoreSubtext, 3.0, () => {
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
    this.state       = 'match_end';
    this.matchWinner = winnerIdx;
    const victoryColor = winnerIdx === 0 ? 0xe63946 : 0x457b9d;
    this.renderer.spawnVictoryBurst(victoryColor);
    if (this.isOnline && this.isHost) {
      this.net.send({ type: 'match_end', winnerIdx });
    }
  }

  _receiveFightResult(msg) {
    stopAmbient();
    const winColor = msg.winnerIdx === 0 ? '#e63946' : '#457b9d';
    const deadIdx  = 1 - msg.winnerIdx;
    const dead     = this.players[deadIdx];
    playDeath();
    if (dead) {
      const deathColor = deadIdx === 0 ? 0xe63946 : 0x457b9d;
      this.renderer.spawnDeathBurst(dead.x, dead.y, deathColor);
      this.renderer.triggerShake(10, 0.35);
    }
    const s0 = this.players[0]?.score || 0;
    const s1 = this.players[1]?.score || 0;
    const scoreSubtext = `${s0 % 1 === 0 ? s0 : s0.toFixed(1)}  -  ${s1 % 1 === 0 ? s1 : s1.toFixed(1)}`;
    this._showOverlay(`Player ${msg.winnerIdx + 1} wins`, scoreSubtext, 1.6, () => {
      this.overlayText = '';
    }, winColor);
  }

  _doRematch() {
    if (this.isOnline && !this.isHost) { this._goToLobby(); return; }
    stopAmbient();
    this.bullets    = [];
    this._dmgNumbers = [];
    this._fightOver  = false;
    this.overlayText = '';
    this.overlayTimer = 0;
    this._overlayCallback = null;
    this._startStartPick();
  }

  _goToLobby() {
    stopAmbient();
    this.state      = 'lobby';
    this.paused     = false;
    this.isLocal      = false;
    this.isOnline     = false;
    this.isHost       = true;
    this.isAI         = false;
    this._aiAimOffset = 0;
    this._aiAimTimer  = 0;
    this.players      = [null, null];
    this.bullets    = [];
    this.overlayText = '';
    this.overlayTimer = 0;
    this.renderer.hidePlayerMeshes();
    this.renderer.syncBullets([]);
    // Refresh lobby arena preview
    const lobbyMap = randomMap();
    this._lobbyMapName = lobbyMap.name;
    this.renderer.setMapTint(lobbyMap.bgTint || 0x111122);
    this.renderer.buildPlatformMeshes(lobbyMap.platforms, lobbyMap.platformColor);
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
    if (this.isAI && loserIdx === 1) this._scheduleAIPick('card_pick');
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
    this._lastPickedCard = card;
    this._startFight();
  }

  // ── Overlay helper ────────────────────────────────────────────────────────────

  _showOverlay(text, subtext, duration, callback, color = '#ffffff', midtext = '') {
    this.overlayText     = text;
    this.overlaySubtext  = subtext;
    this.overlayMidtext  = midtext;
    this.overlayColor    = color;
    this.overlayTimer    = duration;
    this.overlayMaxTimer = duration;
    this._overlayCallback = callback;
  }

  // ── Shooting ─────────────────────────────────────────────────────────────────

  _tryShoot(p, playerIdx) {
    if (p.ammo <= 0 || p.reloading) return;
    if (p.shootTimer > 0 && !p.freshReload) return;
    p.freshReload = false;
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
      this.bullets.push(createBullet(playerIdx, p.x, p.y, bvx, bvy, p.bulletRadius, p.bulletDamage, p.bulletBounces, p.bulletHoming, p.bulletExplosive, p.bulletNoGravity || false, p.bulletPiercing || false));
    }

    // Muzzle flash at gun tip
    const tipX = p.x + Math.cos(p.aimAngle) * p.radius * 2.5;
    const tipY = p.y - Math.sin(p.aimAngle) * p.radius * 2.5;
    const dmhActive = p.deadManHand && p.maxHp > 0 && p.hp / p.maxHp < 0.5;
    const flashCol = p.bulletExplosive ? 0xff8800 : (p.bulletHoming ? 0x22ddff : (p.bulletNoGravity ? 0xffffcc : (p.bulletPiercing ? 0x88ff88 : (dmhActive ? 0xff2244 : 0xffffaa))));
    this.renderer.addParticle(tipX, tipY, Math.cos(p.aimAngle) * 60, -Math.sin(p.aimAngle) * 60, 0xffffff, 0.055, p.bulletRadius * 2.2);
    this.renderer.addParticle(tipX, tipY, Math.cos(p.aimAngle) * 30, -Math.sin(p.aimAngle) * 30, flashCol, 0.09, p.bulletRadius * 1.4);

    this.renderer.gunKick(playerIdx);
    if (p.bulletNoGravity) playSniper(); else playShoot();
    if (p.ammo === 0) {
      if (p.autoBlockOnLastShot) this._startBlock(p);
      this._startReload(p);
    }
  }

  _spawnJumpPuff(p, idx) {
    const col = idx === 0 ? 0xe63946 : 0x457b9d;
    for (let i = 0; i < 5; i++) {
      const a = Math.PI / 2 + (Math.random() - 0.5) * 1.0;  // downward fan
      this.renderer.addParticle(p.x + (Math.random() - 0.5) * p.radius, p.y, Math.cos(a) * 90, Math.sin(a) * 90, col, 0.25, 4);
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
    if (this.paused) return;

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
    this._updateBullets(dt);
  }

  _updatePlayer(p, idx, dt, opponent) {
    if (p.hp <= 0) return;

    // Decay damage over time
    if (p.damageDecay && p._decayQueue) {
      let ddt = 0;
      const firedShooterIdxs = [];
      const firedAmounts = [];
      for (const tick of p._decayQueue) {
        tick.timer -= dt;
        if (tick.timer <= 0) {
          ddt += tick.amount;
          firedShooterIdxs.push(tick.shooterIdx ?? -1);
          firedAmounts.push(tick.amount);
        }
      }
      p._decayQueue = p._decayQueue.filter(t => t.timer > 0);
      if (ddt > 0) {
        this._applyDamage(p, idx, ddt, null);
        this._dmgNumbers.push({ x: p.x + (Math.random() - 0.5) * 20, y: p.y - p.radius, amount: Math.round(ddt), timer: 0.7, maxTimer: 0.7, color: '#dd8822' });
        // Leech heals per fired tick
        for (let ti = 0; ti < firedShooterIdxs.length; ti++) {
          const s = this.players[firedShooterIdxs[ti]];
          if (s && s.leech > 0 && s.hp > 0) {
            const heal = firedAmounts[ti] * s.leech;
            s.hp = Math.min(s.maxHp, s.hp + heal);
            this._dmgNumbers.push({ x: s.x + (Math.random() - 0.5) * 20, y: s.y - s.radius, label: `+${Math.round(heal)}`, timer: 0.8, maxTimer: 0.8, color: '#44ff88' });
          }
        }
      }
    }

    // Taste of blood
    if (p.tasteTimer > 0) { p.tasteTimer -= dt; }
    // Berserk: speed scales with missing HP
    const hpFracBerserk = (p.berserk && p.maxHp > 0) ? (1 - p.hp / p.maxHp) : 0;
    const berserkMult   = 1 + hpFracBerserk * 0.8;
    const speedMult = ((p.tasteTimer > 0) ? 1.5 : 1.0) * (p.speedMult || 1.0) * berserkMult;

    // Regeneration
    if (p.regen > 0 && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
      if (!p._regenTimer) p._regenTimer = 0;
      p._regenTimer -= dt;
      if (p._regenTimer <= 0) {
        p._regenTimer = 0.45;
        const regenTick = Math.round(p.regen * 0.45);
        this._dmgNumbers.push({ x: p.x + (Math.random() - 0.5) * 35, y: p.y - p.radius * 1.6, label: `+${regenTick}`, timer: 0.7, maxTimer: 0.7, color: '#44ff88' });
      }
    }

    // Shoot timer
    if (p.shootTimer > 0) p.shootTimer -= dt;

    // Reload
    if (p.reloading) {
      p.reloadTimer -= dt;
      if (p.reloadTimer <= 0) { p.reloading = false; p.ammo = p.maxAmmo; if (p.speedLoader) p.freshReload = true; }
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
      this.renderer.spawnDeathBurst(p.x, p.y, 0xffd700);
      this._dmgNumbers.push({ x: p.x, y: p.y - p.radius * 2, label: '+400', timer: 1.4, maxTimer: 1.4, color: '#ffd700' });
    }

    const isLocal = this.isLocal;

    // Aim from local mouse: host controls P1, local mode P2 auto-aims toward P1
    const hostControlsThis  = this.isHost  && idx === 0;
    const localP2           = isLocal      && idx === 1;
    if (hostControlsThis) {
      p.aimAngle = Math.atan2(-(this._mouseY - p.y), this._mouseX - p.x);
    } else if (localP2) {
      const opp = this.players[0];
      if (opp) {
        if (this.isAI) {
          // Refresh aim offset periodically for a natural wobble (not per-frame jitter)
          this._aiAimTimer -= dt;
          if (this._aiAimTimer <= 0) {
            this._aiAimOffset = (Math.random() - 0.5) * this._aiAimRange * 2;
            this._aiAimTimer  = this._aiAimMinT + Math.random() * this._aiAimMaxT;
          }
          if (p.bulletHoming) {
            // Homing bullets self-steer; aim directly at opponent
            p.aimAngle = Math.atan2(-(opp.y - p.y), opp.x - p.x) + this._aiAimOffset;
          } else {
            const dx0 = opp.x - p.x, dy0 = opp.y - p.y;
            const dist0 = Math.sqrt(dx0 * dx0 + dy0 * dy0) || 1;
            const travelTime = dist0 / p.bulletSpeed;
            const leadX = opp.x + opp.vx * travelTime;
            const leadY = opp.y + opp.vy * travelTime * 0.4;
            p.aimAngle = Math.atan2(-(leadY - p.y), leadX - p.x) + this._aiAimOffset;
          }
        } else {
          p.aimAngle = Math.atan2(-(opp.y - p.y), opp.x - p.x);
        }
      }
    }

    // Movement input
    const moveMult = MOVE_SPEED * speedMult;
    if (idx === 0 && this.isHost || isLocal && idx === 0) {
      if (this._keys['KeyA']) p.vx -= moveMult * dt * 12;
      if (this._keys['KeyD']) p.vx += moveMult * dt * 12;
    }
    if ((idx === 1 && !this.isHost) || (isLocal && idx === 1 && !this.isAI)) {
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
      if (this.isAI && opponent && opponent.hp > 0) {
        // Dodge bullets heading toward AI
        for (const b of this.bullets) {
          if (b.owner === 1) continue;
          const bDx = b.x - p.x;
          const bDy = b.y - p.y;
          const bDist = Math.hypot(bDx, bDy);
          if (bDist < 220) {
            const bSpd = Math.hypot(b.vx, b.vy) || 1;
            const approach = (-b.vx * bDx - b.vy * bDy) / (bSpd * bDist);
            if (approach > 0.75) {
              if (Math.random() < 0.35) doJump(p);
              if (Math.random() < 0.25) p.vx += (Math.random() > 0.5 ? 1 : -1) * moveMult * 0.6;
              break;
            }
          }
        }
        // Dead Man's Hand: go aggressive at low HP (close distance, shoot more)
        const hpFracAI = p.maxHp > 0 ? p.hp / p.maxHp : 1;
        const dmhAggro = p.deadManHand && hpFracAI < 0.4;
        // Opponent-card awareness: stay further back vs explosive/bouncy, block more vs glass cannon
        const oppCards = (opponent.cards || []).map(c => c.id);
        const oppHasBigThreat = oppCards.includes('explosive_rounds') || oppCards.includes('bouncy');
        const oppHasGlassCannon = oppCards.includes('glass_cannon');
        const oppHasSniper = oppCards.includes('sniper');
        // Maintain distance; adjust based on cards and aggro
        const dx  = opponent.x - p.x;
        const baseTgt = this._aiTargetDist;
        const tgt = dmhAggro ? 180 : (oppHasBigThreat ? Math.max(baseTgt, 360) : baseTgt);
        if      (Math.abs(dx) > tgt + 60) p.vx += Math.sign(dx) * moveMult * dt * 12;
        else if (Math.abs(dx) < tgt - 60) p.vx -= Math.sign(dx) * moveMult * dt * 12;
        // Jump toward opponent height; occasional random jumps to use platforms
        const jumpTowardOpp = opponent.y < p.y - 100 ? 3.5 : 0.5;
        const randomJump    = p.onGround ? 0.4 : 0;
        if ((p.onGround || p.coyoteTimer > 0) && Math.random() < dt * (jumpTowardOpp + randomJump)) doJump(p);
        if (p.onWall && Math.random() < dt * 8) doJump(p);
        // Shoot when aimed; more aggressive when dmhAggro
        const dist = Math.hypot(opponent.x - p.x, opponent.y - p.y) || 1;
        const dot  = (dx * Math.cos(p.aimAngle) - (opponent.y - p.y) * Math.sin(p.aimAngle)) / dist;
        const shootThresh = dmhAggro ? Math.max(this._aiShootThresh - 0.04, 0.84) : this._aiShootThresh;
        const shootRate   = dmhAggro ? this._aiShootRate * 1.4 : this._aiShootRate;
        if (dot > shootThresh && Math.random() < dt * shootRate) this._tryShoot(p, 1);
        // Block: more when opponent has glass cannon or sniper, less when AI is dmhAggro
        const blockRate = (oppHasGlassCannon || oppHasSniper) ? Math.min(this._aiBlockRate * 2, 0.7) : this._aiBlockRate;
        if (p.reloading && Math.random() < dt * 1.5) this._startBlock(p);
        else if (!dmhAggro && Math.random() < dt * blockRate) this._startBlock(p);
      } else if (!this.isAI) {
        if (this._keys['Numpad0'] || this._keys['Slash']) this._tryShoot(p, 1);
        if (this._keys['NumpadEnter'] || this._keys['Period']) this._startBlock(p);
      }
    }

    // Clamp horizontal velocity
    const maxV = MOVE_SPEED * speedMult;
    if (p.vx >  maxV) p.vx =  maxV;
    if (p.vx < -maxV) p.vx = -maxV;

    // Physics
    if (p.wallJumpCooldown > 0) p.wallJumpCooldown -= dt;
    const wasOnGround = p.onGround;
    applyGravity(p, dt);
    applyVelocity(p, dt);
    resolvePlatforms(p, p.radius, this.map.platforms, dt);

    // Detect arena-edge hits before clamping
    const preWallVx = p.vx, preWallVy = p.vy;
    const hitLeft   = p.x - p.radius < 0;
    const hitRight  = p.x + p.radius > ARENA_W;
    const hitTop    = p.y - p.radius < 0;
    const hitBottom = p.y + p.radius > ARENA_H;
    clampToArena(p, p.radius, ARENA_W, ARENA_H);

    // Arena-edge damage and bounce-back (all four edges)
    if (hitLeft || hitRight || hitTop || hitBottom) {
      const impactSpeed = (hitTop || hitBottom) ? Math.abs(preWallVy) : Math.abs(preWallVx);
      if (impactSpeed > 80) {
        if (p.blocking) {
          // Super bounce -- throws player ~half arena distance
          const superVx = (hitTop || hitBottom) ? (preWallVx * 0.5) : (hitLeft ? 1300 : -1300);
          const superVy = hitTop ? 900 : (hitBottom ? -900 : Math.min(preWallVy * 0.4, -700));
          p.vx = superVx;
          p.vy = superVy;
          this.renderer.triggerShake(10, 0.3);
        } else {
          // Damage proportional to impact speed, capped at 30
          const wallDmg = Math.min(30, Math.round(impactSpeed * 0.08));
          this._applyDamage(p, idx, wallDmg, null);
          const wallDmgCol = idx === 0 ? '#e63946' : '#457b9d';
          this._dmgNumbers.push({ x: p.x + (Math.random() - 0.5) * 20, y: p.y - p.radius, amount: wallDmg, timer: 0.9, maxTimer: 0.9, color: wallDmgCol });
          // Bounce back from edge
          if (hitLeft)   p.vx =  Math.abs(preWallVx) * 0.6;
          if (hitRight)  p.vx = -Math.abs(preWallVx) * 0.6;
          if (hitTop)    p.vy =  Math.abs(preWallVy) * 0.5;
          if (hitBottom) p.vy = -Math.abs(preWallVy) * 0.5;
          this.renderer.triggerShake(5, 0.15);
        }
      }
    }

    // Extra Jump card: grant bonus air jumps whenever grounded
    if (p.onGround && p.maxExtraJumps > 0) p.jumpsLeft = 1 + p.maxExtraJumps;

    // Landing squish + dust particles on hard impact
    if (!wasOnGround && p.onGround) {
      p.landTimer = 0.12;
      if (Math.abs(p.vy) > 200) {
        const dustCol = idx === 0 ? 0xe63946 : 0x457b9d;
        for (let d = 0; d < 4; d++) {
          const a = Math.PI + (Math.random() - 0.5) * 0.9;
          this.renderer.addParticle(p.x + (Math.random() - 0.5) * p.radius, p.y + p.radius, Math.cos(a) * 80, -20, dustCol, 0.22, 4);
        }
      }
    }
    if (p.landTimer > 0) p.landTimer -= dt;

    // Coyote time: open a brief jump window when walking off a ledge
    if (wasOnGround && !p.onGround && p.vy > 0) p.coyoteTimer = 0.12;
    if (p.coyoteTimer > 0) p.coyoteTimer -= dt;

    // Friction (Slippery card reduces ground grip)
    if (p.onGround) p.vx *= Math.pow(p.slippery ? 0.96 : FRICTION, dt * 60);

    // Taste of Blood speed trail -- particles behind fast-moving player
    if (p.tasteTimer > 0 && Math.abs(p.vx) > 180 && Math.random() < 0.35) {
      const col = idx === 0 ? 0xff4455 : 0x4488ee;
      this.renderer.addParticle(
        p.x - Math.sign(p.vx) * p.radius * 0.8, p.y,
        p.vx * 0.08, 0, col, 0.18, 5
      );
    }
  }

  _updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.prevX = b.x; b.prevY = b.y;

      // Homing -- targets the opponent (other player)
      if (b.homing) {
        const target = this.players[1 - b.owner];
        if (target && target.hp > 0) {
          const dx = target.x - b.x;
          const dy = target.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const steer = 1200;
          b.vx += (dx / dist) * steer * dt;
          b.vy += (dy / dist) * steer * dt;
        }
      }

      if (!b.noGravity) b.vy += GRAVITY * 0.25 * dt;  // bullets arc under partial gravity
      b.x  += b.vx * dt;
      b.y  += b.vy * dt;

      // Tick per-player hit cooldowns for piercing bullets
      if (b.hitCooldowns) {
        for (const k in b.hitCooldowns) {
          b.hitCooldowns[k] -= dt;
          if (b.hitCooldowns[k] <= 0) delete b.hitCooldowns[k];
        }
      }

      // Wall/ceiling bounces (Bouncy card)
      if (b.bounces > 0) {
        if (b.x - b.radius < 0 || b.x + b.radius > ARENA_W) { b.vx = -b.vx; b.x = Math.max(b.radius, Math.min(ARENA_W - b.radius, b.x)); b.bounces--; b.hasBouncedOff = true; playRicochet(); }
        if (b.y - b.radius < 0)                              { b.vy = -b.vy; b.y = b.radius; b.bounces--; b.hasBouncedOff = true; playRicochet(); }
      }

      // Platform collision -- bounce only if bullet has bounces remaining (Bouncy card)
      let bouncedPlat = false;
      for (const plat of this.map.platforms) {
        if (b.x + b.radius > plat.x && b.x - b.radius < plat.x + plat.w &&
            b.y + b.radius > plat.y && b.y - b.radius < plat.y + plat.h) {
          for (let sp = 0; sp < 3; sp++) {
            const a = Math.random() * Math.PI * 2;
            this.renderer.addParticle(b.x, b.y, Math.cos(a) * 120, Math.sin(a) * 120, 0xffdd88, 0.22, 3);
          }
          if (b.bounces > 0) {
            const fromTop    = b.prevY + b.radius <= plat.y;
            const fromBottom = b.prevY - b.radius >= plat.y + plat.h;
            const fromLeft   = b.prevX + b.radius <= plat.x;
            const fromRight  = b.prevX - b.radius >= plat.x + plat.w;
            if (fromTop || fromBottom) {
              b.vy = fromTop ? -Math.abs(b.vy) : Math.abs(b.vy);
              b.y  = fromTop ? plat.y - b.radius : plat.y + plat.h + b.radius;
            } else if (fromLeft || fromRight) {
              b.vx = fromLeft ? -Math.abs(b.vx) : Math.abs(b.vx);
              b.x  = fromLeft ? plat.x - b.radius : plat.x + plat.w + b.radius;
            } else {
              b.vy = -b.vy;
            }
            b.bounces--;
            b.hasBouncedOff = true;
            bouncedPlat = true;
            playRicochet();
          } else {
            this.bullets.splice(i, 1);
            bouncedPlat = true;
          }
          break;
        }
      }
      // Lifetime and out-of-bounds expiry -- always runs, even on bounce frames
      b.lifetime -= dt;
      if (b.lifetime <= 0 || b.x < -100 || b.x > ARENA_W + 100 || b.y < -100 || b.y > ARENA_H + 100) {
        this.bullets.splice(i, 1); continue;
      }

      if (bouncedPlat) continue;  // skip hit check; bullet persists until next frame

      // Hit player -- check both players (friendly fire enabled)
      // Owner can only be hit by their own bullet after it has bounced off something
      let bulletConsumed = false;
      for (let pi = 0; pi < 2; pi++) {
        const target = this.players[pi];
        if (!target || target.hp <= 0) continue;
        if (pi === b.owner && !b.hasBouncedOff) continue;
        if (b.hitCooldowns && b.hitCooldowns[pi] > 0) continue;  // piercing hit cooldown
        const dx   = b.x - target.x;
        const dy   = b.y - target.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < b.radius + target.radius) {
          if (target.blocking) {
            b.vx = -b.vx; b.vy = -b.vy; b.owner = pi;
            if (target.volatile) b.damage *= 2;
            this.renderer.triggerShake(3, 0.1);
            this.renderer.spawnHitBurst(target.x, target.y, target.volatile ? 0xff6622 : 0x88ddff);
            playBlock();
            if (!b.piercing) break;  // reflected bullet doesn't continue through
          } else {
            this._dealDamage(b, target, pi, b.owner);
            if (b.piercing) {
              b.hitCooldowns[pi] = 0.35;  // can't re-hit this player for 350ms
              b.hasBouncedOff = true;     // allow owner to be hit on pass-through
            } else {
              this.bullets.splice(i, 1);
              bulletConsumed = true;
              break;
            }
          }
        }
      }
      if (bulletConsumed) continue;
    }
  }

  _dealDamage(bullet, target, targetIdx, shooterIdx) {
    const shooter = (shooterIdx >= 0 && shooterIdx < 2) ? this.players[shooterIdx] : null;
    target.lastHitAngle = Math.atan2(bullet.vy, bullet.vx);
    let dmg = bullet.damage;

    // Dead Man's Hand: scale damage with shooter's missing HP (up to +90%)
    if (shooter && shooter.deadManHand && shooter.maxHp > 0) {
      const missingFrac = 1 - shooter.hp / shooter.maxHp;
      dmg *= 1 + missingFrac * 0.9;
    }

    // Armor: reduce incoming damage
    if (target.armor > 0) dmg *= (1 - target.armor);

    if (target.damageDecay) {
      if (!target._decayQueue) target._decayQueue = [];
      // Pass shooter index so leech heals as each tick fires
      const si = shooter ? this.players.indexOf(shooter) : -1;
      target._decayQueue.push({ amount: dmg / 4, timer: 1.0, shooterIdx: si });
      target._decayQueue.push({ amount: dmg / 4, timer: 2.0, shooterIdx: si });
      target._decayQueue.push({ amount: dmg / 4, timer: 3.0, shooterIdx: si });
      target._decayQueue.push({ amount: dmg / 4, timer: 4.0, shooterIdx: si });
    } else {
      this._applyDamage(target, targetIdx, dmg, shooter);
      if (shooter && shooter.leech > 0) {
        const heal = dmg * shooter.leech;
        shooter.hp = Math.min(shooter.maxHp, shooter.hp + heal);
        const si = this.players.indexOf(shooter);
        if (si >= 0) {
          this._dmgNumbers.push({ x: shooter.x + (Math.random() - 0.5) * 20, y: shooter.y - shooter.radius, amount: Math.round(heal), timer: 1.0, maxTimer: 1.0, color: '#44ff88', label: `+${Math.round(heal)}` });
        }
      }
    }
    if (shooter && shooter.tasteOfBlood) {
      shooter.tasteTimer = 3.0;
    }

    // Explosive splash: deal 50% damage to nearby players (including shooter)
    if (bullet.explosive) {
      const SPLASH_RADIUS = 120;
      const SPLASH_MULT = 0.5;
      playExplosion();
      this.renderer.spawnDeathBurst(target.x, target.y, 0xffaa00, Math.atan2(bullet.vy, bullet.vx));
      for (let pi = 0; pi < this.players.length; pi++) {
        if (pi === targetIdx) continue;
        const sp = this.players[pi];
        if (!sp || sp.hp <= 0) continue;
        const dx = sp.x - target.x, dy = sp.y - target.y;
        if (Math.sqrt(dx * dx + dy * dy) <= SPLASH_RADIUS) {
          const splashDmg = bullet.damage * SPLASH_MULT;
          this._applyDamage(sp, pi, splashDmg, null);
          this._dmgNumbers.push({ x: sp.x, y: sp.y - sp.radius, amount: Math.round(splashDmg), timer: 0.9, maxTimer: 0.9, color: '#ffaa00' });
          this.renderer.spawnHitBurst(sp.x, sp.y, 0xffaa00);
        }
      }
    }

    // Knockback: horizontal push in bullet travel direction + upward impulse
    const angle = Math.atan2(bullet.vy, bullet.vx);
    target.vx += Math.cos(angle) * 220;
    target.vy -= 160;  // always knock upward for satisfying hit feel

    this.renderer.spawnHitBurst(target.x, target.y, targetIdx === 0 ? 0xe63946 : 0x457b9d);
    this.renderer.flashPlayer(targetIdx);
    this.renderer.triggerShake(5, 0.18);
    playHit();
    const dmgColor = target.damageDecay ? '#dd8822' : (targetIdx === 0 ? '#e63946' : '#457b9d');
    this._dmgNumbers.push({ x: target.x + (Math.random() - 0.5) * 28, y: target.y - target.radius, amount: Math.round(dmg), timer: 0.9, maxTimer: 0.9, color: dmgColor });
  }

  _applyDamage(target, targetIdx, dmg, shooter) {
    const prevFrac = target.maxHp > 0 ? target.hp / target.maxHp : 0;
    target.hp -= dmg;
    if (target.hp <= 0) {
      target.hp = 0;
      this._onPlayerDied(targetIdx);
    } else if (prevFrac > 0.25 && target.hp / target.maxHp <= 0.25) {
      playLowHp();
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

    // Cycle lobby arena preview every 4s
    if (this.state === 'lobby') {
      this._lobbyMapTimer -= dt;
      if (this._lobbyMapTimer <= 0) {
        this._lobbyMapTimer = 4.0;
        const m = randomMap();
        this._lobbyMapName = m.name;
        this.renderer.setMapTint(m.bgTint || 0x111122);
        this.renderer.buildPlatformMeshes(m.platforms, m.platformColor);
      }
    }

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
    if (this.state === 'start_pick') {
      if (this.players[0]) this.renderer.updatePlayerMesh(0, this.players[0], 0, t, dt);
      if (this.players[1]) this.renderer.updatePlayerMesh(1, this.players[1], Math.PI, t, dt);
    }
    if (this.state === 'fight' || this.state === 'match_end' || this.state === 'card_pick') {
      this.renderer.syncBullets(this.state === 'fight' ? this.bullets : []);
      if (this.players[0]) this.renderer.updatePlayerMesh(0, this.players[0], this.players[0].aimAngle, t, dt);
      if (this.players[1]) this.renderer.updatePlayerMesh(1, this.players[1], this.players[1].aimAngle, t, dt);
    }

    this.renderer.render(dt, t);
    this.ui.clear();

    if (this.state === 'lobby' || this.state === 'start_pick') {
      const ls = { ...this.lobbyState };
      if (this.state === 'start_pick') {
        ls.mode = 'start_pick';
        const isLocalPicker = this.isAI ? this.pickerIdx === 0
          : (this.isLocal || (this.isHost && this.pickerIdx === 0) || (!this.isHost && this.pickerIdx === 1));
        const pickerCards = this.players[this.pickerIdx]?.cards || [];
        this.ui.drawCardPicker(this.cardOffer, this.cardHovered, this.pickerIdx, isLocalPicker, pickerCards, 0);
      } else {
        this.ui.drawLobby(ls, t, this._canvasMouseX || 0, this._canvasMouseY || 0, this._lobbyMapName || '');
      }
      this.ui.drawFooter();
      return;
    }

    if (this.state === 'fight') {
      const p1 = this.players[0];
      const p2 = this.players[1];
      if (p1 && p2) {
        this.ui.drawNoodleArms(p1, p2, t);
        this.ui.drawHealthBars(p1, p2, t);
        this.ui.drawScores(p1.score, p2.score);
        this.ui.drawAmmo(p1, p2);
        this.ui.drawCardStrips(p1.cards || [], p2.cards || []);
        if (this.isOnline) this.ui.drawYouIndicator(this.isHost ? 0 : 1);
        if (this.isAI) this.ui.drawAILabel(this.aiDifficulty);
      }
      if (this._dmgNumbers.length > 0) this.ui.drawDamageNumbers(this._dmgNumbers);
      if (this.overlayText) {
        const ovMax  = this.overlayMaxTimer || 1;
        const ovFrac = Math.max(0, Math.min(1, this.overlayTimer / ovMax));
        this.ui.drawRoundText(this.overlayText, this.overlaySubtext, this.overlayColor, this.overlayMidtext || '', ovFrac);
      }
      if (this.paused) this.ui.drawPause();
    }

    if (this.state === 'card_pick') {
      this.ui.drawNoodleArms(this.players[0], this.players[1], t);
      const isLocalPicker = this.isAI ? this.pickerIdx === 0
        : (this.isLocal || (this.isHost && this.pickerIdx === 0) || (!this.isHost && this.pickerIdx === 1));
      const pickerCards = this.players[this.pickerIdx]?.cards || [];
      const fightNum = (this.players[0]?.fightWins || 0) + (this.players[1]?.fightWins || 0) + 1;
      this.ui.drawCardPicker(this.cardOffer, this.cardHovered, this.pickerIdx, isLocalPicker, pickerCards, fightNum);
    }

    if (this.state === 'match_end') {
      this.ui.drawNoodleArms(this.players[0], this.players[1], t);
      this.ui.drawWinner(this.matchWinner, this.players[0]?.score || 0, this.players[1]?.score || 0, this.players[0]?.cards || [], this.players[1]?.cards || [], this.isOnline && !this.isHost, this._canvasMouseX || 0, this._canvasMouseY || 0);
    }

    this.ui.drawFooter();
  }
}
