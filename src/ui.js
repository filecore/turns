// ui.js — HUD, card picker, menus (2D canvas overlay)

import { ARENA_W, ARENA_H } from './renderer.js';
import { RARITY } from './cards.js';

const RARITY_BORDER = { common: '#888888', uncommon: '#5577cc', rare: '#cc44aa' };
const P_COLORS      = ['#e63946', '#457b9d'];

export class UI {
  constructor(overlayCanvas, scale) {
    this.canvas  = overlayCanvas;
    this.ctx     = overlayCanvas.getContext('2d');
    this.scale   = scale;
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const vw     = window.innerWidth;
    const vh     = window.innerHeight;
    const s      = Math.min(vw / ARENA_W, vh / ARENA_H);
    this.scale   = s;
    this.canvas.width  = Math.round(ARENA_W * s);
    this.canvas.height = Math.round(ARENA_H * s);
    this.canvas.style.width  = this.canvas.width  + 'px';
    this.canvas.style.height = this.canvas.height + 'px';
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  _px(n)  { return n * this.scale; }
  _font(size, weight = 'bold') { return `${weight} ${this._px(size)}px 'Rajdhani', 'Orbitron', sans-serif`; }

  // ── Health bars ─────────────────────────────────────────────────────────────

  drawHealthBars(p1, p2) {
    const ctx   = this.ctx;
    const barW  = this._px(280);
    const barH  = this._px(14);
    const barY  = this._px(18);
    const pad   = this._px(18);

    // P1 bar (left side)
    this._drawBar(pad, barY, barW, barH, p1.hp / p1.maxHp, P_COLORS[0]);
    // P2 bar (right side, flipped fill direction)
    this._drawBar(this.canvas.width - pad - barW, barY, barW, barH, p2.hp / p2.maxHp, P_COLORS[1], true);
  }

  _drawBar(x, y, w, h, frac, color, rightAlign = false) {
    const ctx = this.ctx;
    // Background
    ctx.fillStyle = '#333333';
    ctx.fillRect(x, y, w, h);
    // Fill
    const fill = Math.max(0, frac) * w;
    ctx.fillStyle = color;
    if (rightAlign) ctx.fillRect(x + w - fill, y, fill, h);
    else            ctx.fillRect(x, y, fill, h);
    // Flash white when low
    if (frac < 0.25) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      if (rightAlign) ctx.fillRect(x + w - fill, y, fill, h);
      else            ctx.fillRect(x, y, fill, h);
    }
  }

  // ── Score dots ──────────────────────────────────────────────────────────────

  drawScores(score1, score2) {
    const ctx   = this.ctx;
    const cx    = this.canvas.width / 2;
    const dotR  = this._px(8);
    const gap   = this._px(22);
    const y     = this._px(28);

    // P1 dots (left of center)
    for (let i = 0; i < 5; i++) {
      const x   = cx - this._px(5) - (4 - i) * gap - dotR * 2;
      const val = score1 - i;
      this._drawScoreDot(x + dotR, y, dotR, val, P_COLORS[0]);
    }
    // P2 dots (right of center)
    for (let i = 0; i < 5; i++) {
      const x   = cx + this._px(5) + i * gap;
      const val = score2 - i;
      this._drawScoreDot(x + dotR, y, dotR, val, P_COLORS[1]);
    }
  }

  _drawScoreDot(cx, cy, r, val, color) {
    const ctx = this.ctx;
    // Background circle
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#333333';
    ctx.fill();

    if (val >= 1) {
      // Full dot
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    } else if (val >= 0.5) {
      // Half dot (right half filled)
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#555555';
    ctx.lineWidth   = this._px(1.5);
    ctx.stroke();
  }

  // ── Ammo display ────────────────────────────────────────────────────────────

  drawAmmo(p1, p2) {
    this._drawAmmoFor(p1, 0);
    this._drawAmmoFor(p2, 1);
  }

  _drawAmmoFor(player, idx) {
    if (player.hp <= 0) return;
    const ctx = this.ctx;
    const sx  = this._px(player.x);
    const sy  = this._px(player.y - player.radius - 14);
    const dotW = this._px(7);
    const dotH = this._px(5);
    const gap  = this._px(3);
    const total = player.maxAmmo;
    const current = player.ammo;
    const startX = sx - ((total * (dotW + gap)) / 2);

    for (let i = 0; i < total; i++) {
      ctx.fillStyle = i < current ? P_COLORS[idx] : '#444444';
      ctx.fillRect(startX + i * (dotW + gap), sy, dotW, dotH);
    }

    if (player.reloading) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font      = this._font(10, 'normal');
      ctx.textAlign = 'center';
      ctx.fillText('RELOAD', sx, sy - this._px(6));
    }
  }

  // ── Round overlay text ──────────────────────────────────────────────────────

  drawRoundText(text, subtext = '') {
    const ctx = this.ctx;
    const cx  = this.canvas.width  / 2;
    const cy  = this.canvas.height / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.fillStyle = '#ffffff';
    ctx.font      = this._font(80);
    ctx.textAlign = 'center';
    ctx.fillText(text, cx, cy);

    if (subtext) {
      ctx.fillStyle = '#aaaaaa';
      ctx.font      = this._font(28, 'normal');
      ctx.fillText(subtext, cx, cy + this._px(52));
    }
  }

  drawWinner(playerIdx) {
    const ctx   = this.ctx;
    const cx    = this.canvas.width  / 2;
    const cy    = this.canvas.height / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = P_COLORS[playerIdx];
    ctx.font      = this._font(100);
    ctx.textAlign = 'center';
    ctx.fillText('WINNER', cx, cy - this._px(20));
    ctx.fillStyle = '#ffffff';
    ctx.font      = this._font(32, 'normal');
    ctx.fillText(`Player ${playerIdx + 1} wins the match`, cx, cy + this._px(40));
  }

  // ── Card picker ─────────────────────────────────────────────────────────────

  drawCardPicker(cards, hoveredIdx, pickerPlayerIdx, isLocalPicker) {
    const ctx = this.ctx;
    const cx  = this.canvas.width  / 2;
    const cy  = this.canvas.height / 2;

    // Dim background
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Title
    ctx.fillStyle = isLocalPicker ? P_COLORS[pickerPlayerIdx] : '#888888';
    ctx.font      = this._font(30);
    ctx.textAlign = 'center';
    const title = isLocalPicker ? 'Choose a card' : `Player ${pickerPlayerIdx + 1} is choosing...`;
    ctx.fillText(title, cx, cy - this._px(200));

    const cardW = this._px(200);
    const cardH = this._px(280);
    const gap   = this._px(22);
    const totalW = cards.length * cardW + (cards.length - 1) * gap;
    const startX = cx - totalW / 2;

    cards.forEach((card, i) => {
      const x = startX + i * (cardW + gap);
      const y = cy - cardH / 2;
      this._drawCard(ctx, x, y, cardW, cardH, card, i === hoveredIdx, isLocalPicker);
    });
  }

  _drawCard(ctx, x, y, w, h, card, hovered, interactive) {
    const r    = this._px(8);
    const bclr = RARITY_BORDER[card.rarity] || '#888';

    // Card background
    ctx.fillStyle = hovered && interactive ? '#1a1a2e' : '#111118';
    this._roundRect(ctx, x, y, w, h, r);
    ctx.fill();

    // Border
    ctx.strokeStyle = hovered && interactive ? '#ffffff' : bclr;
    ctx.lineWidth   = hovered ? this._px(3) : this._px(1.5);
    this._roundRect(ctx, x, y, w, h, r);
    ctx.stroke();

    // Rarity triangle (top right corner)
    ctx.fillStyle = bclr;
    ctx.beginPath();
    ctx.moveTo(x + w - this._px(30), y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + this._px(30));
    ctx.closePath();
    ctx.fill();

    // Card name
    ctx.fillStyle = '#ffffff';
    ctx.font      = this._font(18);
    ctx.textAlign = 'center';
    ctx.fillText(card.name, x + w / 2, y + this._px(44));

    // Rarity label
    ctx.fillStyle = bclr;
    ctx.font      = this._font(12, 'normal');
    ctx.fillText(card.rarity.toUpperCase(), x + w / 2, y + this._px(64));

    // Description (word-wrapped)
    ctx.fillStyle = '#cccccc';
    ctx.font      = this._font(13, 'normal');
    this._wrapText(ctx, card.desc, x + this._px(12), y + this._px(100), w - this._px(24), this._px(20));
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  _wrapText(ctx, text, x, y, maxW, lineH) {
    const words = text.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x + maxW / 2, y);
        y += lineH;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x + maxW / 2, y);
  }

  // ── Lobby / menu ─────────────────────────────────────────────────────────────

  drawLobby(state) {
    const ctx = this.ctx;
    const cx  = this.canvas.width  / 2;
    const cy  = this.canvas.height / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.90)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.fillStyle = '#ffffff';
    ctx.font      = this._font(64);
    ctx.textAlign = 'center';
    ctx.fillText('TURNS', cx, cy - this._px(200));

    ctx.fillStyle = '#888888';
    ctx.font      = this._font(16, 'normal');
    ctx.fillText('A browser remake of ROUNDS by Landfall Games', cx, cy - this._px(155));

    if (state.mode === 'menu') {
      this._drawButton(ctx, cx, cy - this._px(60), 'HOST GAME', '#e63946');
      this._drawButton(ctx, cx, cy + this._px(20), 'JOIN GAME', '#457b9d');
      this._drawButton(ctx, cx, cy + this._px(100), 'LOCAL 2-PLAYER', '#668844');

    } else if (state.mode === 'hosting') {
      ctx.fillStyle = '#aaaaaa';
      ctx.font      = this._font(20, 'normal');
      ctx.textAlign = 'center';
      ctx.fillText('Share this code with your opponent:', cx, cy - this._px(60));

      ctx.fillStyle = '#e63946';
      ctx.font      = this._font(80);
      ctx.fillText(state.roomCode, cx, cy + this._px(20));

      ctx.fillStyle = '#666666';
      ctx.font      = this._font(16, 'normal');
      ctx.fillText('Waiting for opponent...', cx, cy + this._px(90));

    } else if (state.mode === 'joining') {
      ctx.fillStyle = '#ffffff';
      ctx.font      = this._font(24, 'normal');
      ctx.textAlign = 'center';
      ctx.fillText('Enter room code:', cx, cy - this._px(40));

      // Input display
      const input = state.inputCode || '';
      ctx.fillStyle = '#111118';
      ctx.fillRect(cx - this._px(120), cy, this._px(240), this._px(56));
      ctx.strokeStyle = '#457b9d';
      ctx.lineWidth   = this._px(2);
      ctx.strokeRect(cx - this._px(120), cy, this._px(240), this._px(56));
      ctx.fillStyle = '#ffffff';
      ctx.font      = this._font(40);
      ctx.fillText(input + (Math.floor(Date.now() / 500) % 2 === 0 ? '|' : ''), cx, cy + this._px(42));

      if (state.error) {
        ctx.fillStyle = '#e63946';
        ctx.font      = this._font(16, 'normal');
        ctx.fillText(state.error, cx, cy + this._px(80));
      }

    } else if (state.mode === 'start_pick') {
      this._drawStartCardPick(ctx, cx, cy, state);
    }
  }

  _drawStartCardPick(ctx, cx, cy, state) {
    ctx.fillStyle = '#ffffff';
    ctx.font      = this._font(32);
    ctx.textAlign = 'center';
    ctx.fillText('Pick your starting card', cx, cy - this._px(200));
  }

  _drawButton(ctx, cx, cy, label, color) {
    const bw = this._px(280);
    const bh = this._px(52);
    ctx.fillStyle = color;
    this._roundRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, this._px(6));
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font      = this._font(22);
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + this._px(8));
  }

  // ── Lobby hit-test ─────────────────────────────────────────────────────────

  getLobbyClick(mx, my) {
    const cx = this.canvas.width  / 2;
    const cy = this.canvas.height / 2;
    const bw = this._px(280);
    const bh = this._px(52);

    if (this._hitRect(mx, my, cx - bw / 2, cy - this._px(60) - bh / 2, bw, bh)) return 'host';
    if (this._hitRect(mx, my, cx - bw / 2, cy + this._px(20) - bh / 2, bw, bh)) return 'join';
    if (this._hitRect(mx, my, cx - bw / 2, cy + this._px(100) - bh / 2, bw, bh)) return 'local';
    return null;
  }

  getCardPickerClick(cards, mx, my) {
    const cx     = this.canvas.width  / 2;
    const cy     = this.canvas.height / 2;
    const cardW  = this._px(200);
    const cardH  = this._px(280);
    const gap    = this._px(22);
    const totalW = cards.length * cardW + (cards.length - 1) * gap;
    const startX = cx - totalW / 2;

    for (let i = 0; i < cards.length; i++) {
      const x = startX + i * (cardW + gap);
      const y = cy - cardH / 2;
      if (this._hitRect(mx, my, x, y, cardW, cardH)) return i;
    }
    return -1;
  }

  getCardPickerHover(cards, mx, my) {
    return this.getCardPickerClick(cards, mx, my);
  }

  _hitRect(mx, my, x, y, w, h) {
    return mx >= x && mx <= x + w && my >= y && my <= y + h;
  }

  // ── Attribution footer ───────────────────────────────────────────────────────

  drawFooter() {
    const ctx = this.ctx;
    ctx.fillStyle = '#333333';
    ctx.font      = this._font(11, 'normal');
    ctx.textAlign = 'center';
    ctx.fillText(
      'Browser fan remake. Original ROUNDS by Landfall Games (Wilhelm Nylund). Not affiliated.',
      this.canvas.width / 2,
      this.canvas.height - this._px(8)
    );
  }
}
