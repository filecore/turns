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
  _font(size, weight = 'bold') { return `${weight} ${this._px(size)}px 'Nunito', sans-serif`; }

  // ── Health bars ─────────────────────────────────────────────────────────────

  drawHealthBars(p1, p2, t = 0) {
    if (p1.hp > 0) this._drawHealthAboveHead(p1, 0, t);
    if (p2.hp > 0) this._drawHealthAboveHead(p2, 1, t);
  }

  _drawHealthAboveHead(player, idx, t = 0) {
    const ctx  = this.ctx;
    const barW = this._px(player.radius * 4);
    const barH = this._px(5);
    const cx   = this._px(player.x);
    const y    = this._px(player.y - player.radius - 10) - barH;
    const x    = cx - barW / 2;
    const frac = Math.max(0, player.hp / player.maxHp);

    // HP-based bar color: player color → orange warning → red critical
    let barColor;
    if (frac > 0.5)      barColor = P_COLORS[idx];
    else if (frac > 0.25) barColor = '#e8a020';
    else                  barColor = '#ff2222';

    // Critical HP pulse: alpha flicker when below 25%
    if (frac < 0.25 && frac > 0) {
      ctx.globalAlpha = 0.7 + Math.sin(t * 14) * 0.3;
    }

    // P1 / P2 label above the bar
    ctx.fillStyle  = P_COLORS[idx];
    ctx.font       = this._font(11, 'normal');
    ctx.textAlign  = 'center';
    ctx.fillText(`P${idx + 1}`, cx, y - this._px(3));
    ctx.globalAlpha = 1;  // ensure label is always solid
    ctx.fillStyle = '#222233';
    ctx.fillRect(x, y, barW, barH);

    if (frac < 0.25 && frac > 0) ctx.globalAlpha = 0.7 + Math.sin(t * 14) * 0.3;
    ctx.fillStyle = barColor;
    ctx.fillRect(x, y, frac * barW, barH);
    ctx.globalAlpha = 1;

    // Decay ghost: show pending decay damage as darker segment after current HP
    if (player._decayQueue && player._decayQueue.length > 0 && player.maxHp > 0) {
      const pendingDmg = player._decayQueue.reduce((s, t) => s + t.amount, 0);
      const pendingFrac = Math.min(frac, pendingDmg / player.maxHp);
      ctx.fillStyle = '#dd7700';
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x + (frac - pendingFrac) * barW, y, pendingFrac * barW, barH);
      ctx.globalAlpha = 1;
    }

    // Block cooldown bar (below health bar)
    const blockBarH = this._px(3);
    const blockY    = y + barH + this._px(2);
    const blockReady = !player.blockTimer || player.blockTimer <= 0;
    if (!blockReady) {
      const blockFrac = 1 - Math.max(0, player.blockTimer) / (player.blockCooldown || 2);
      ctx.fillStyle = '#222222';
      ctx.fillRect(x, blockY, barW, blockBarH);
      ctx.fillStyle = '#55aaff';
      ctx.fillRect(x, blockY, blockFrac * barW, blockBarH);
    } else {
      ctx.fillStyle = '#55aaff';
      ctx.fillRect(x, blockY, barW, blockBarH);
    }

    // Status effect badges
    const badges = [];
    if (player.regen > 0)      badges.push({ label: `+${player.regen}/s`, bg: '#1a4d1a', fg: '#55dd55' });
    if (player.leech > 0)      badges.push({ label: 'LEECH',  bg: '#2a1040', fg: '#cc66ff' });
    if (player.berserk)        badges.push({ label: 'BERSERK',bg: '#401010', fg: '#ff6633' });
    if (player.armor > 0)      badges.push({ label: `ARM${Math.round(player.armor * 100)}%`, bg: '#102040', fg: '#55aaff' });
    if (player.damageDecay)    badges.push({ label: 'DECAY',  bg: '#3a1f00', fg: '#ffaa44' });
    if (player.deadManHand)    badges.push({ label: 'DMH',    bg: '#3a0010', fg: '#ff3355' });
    if (player.volatile)       badges.push({ label: 'VOLTL',  bg: '#2a1800', fg: '#ffcc00' });

    if (badges.length > 0) {
      ctx.font = this._font(8, 'normal');
      const padX = this._px(4), padY = this._px(2);
      const bH   = this._px(12);
      let bx = cx - barW / 2;
      const badgeY = blockY + blockBarH + this._px(3);
      for (const b of badges) {
        ctx.font = this._font(8, 'normal');
        const tw = ctx.measureText(b.label).width;
        const bw = tw + padX * 2;
        ctx.fillStyle = b.bg;
        this._roundRect(ctx, bx, badgeY, bw, bH, this._px(2));
        ctx.fill();
        ctx.fillStyle = b.fg;
        ctx.textAlign = 'left';
        ctx.fillText(b.label, bx + padX, badgeY + bH - padY - this._px(1));
        bx += bw + this._px(3);
      }
    }
  }

  // ── Online YOU indicator ───────────────────────────────────────────────────

  drawYouIndicator(playerIdx) {
    const ctx = this.ctx;
    const cx  = this.canvas.width / 2;
    const y   = this._px(52);
    const lbl = playerIdx === 0 ? 'YOU' : '';
    const lbr = playerIdx === 1 ? 'YOU' : '';

    ctx.font      = this._font(11, 'normal');
    ctx.fillStyle = P_COLORS[playerIdx];

    if (lbl) {
      ctx.textAlign = 'right';
      ctx.fillText(lbl, cx - this._px(8), y);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(lbr, cx + this._px(8), y);
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

    // "first to 5" hint
    ctx.font = this._font(10, '400');
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.textAlign = 'center';
    ctx.fillText('first to 5', cx, y + dotR + this._px(13));
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
    // Draw near the gun: gun is fixed to viewer's right side of the player
    const facingRight = Math.cos(player.aimAngle || 0) >= 0;
    const side  = facingRight ? 1 : -1;
    const gx    = player.x + side * player.radius * 1.2;
    const gy    = player.y - player.radius * 0.4;
    const sx    = this._px(gx);
    const sy    = this._px(gy);
    const total   = player.maxAmmo;
    const current = player.ammo;

    if (total > 9) {
      // Compact display: "N / MAX" text for large magazines
      ctx.fillStyle = P_COLORS[idx];
      ctx.font      = this._font(11, '600');
      ctx.textAlign = 'center';
      ctx.fillText(`${current}/${total}`, sx, sy + this._px(5));
    } else {
      const dotW  = this._px(6);
      const dotH  = this._px(4);
      const gap   = this._px(3);
      const startX  = sx - (total * (dotW + gap) - gap) / 2;
      for (let i = 0; i < total; i++) {
        ctx.fillStyle = i < current ? P_COLORS[idx] : '#444444';
        ctx.fillRect(startX + i * (dotW + gap), sy, dotW, dotH);
      }
    }

    if (player.reloading) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font      = this._font(10, 'normal');
      ctx.textAlign = 'center';
      ctx.fillText('RELOAD', sx, sy - this._px(7));
      const reloadFrac = player.reloadTime > 0 ? 1 - Math.max(0, player.reloadTimer) / player.reloadTime : 1;
      const reloadW = this._px(Math.min(total, 9) * 9 + 10);
      const reloadX = sx - reloadW / 2;
      ctx.fillStyle = '#222222';
      ctx.fillRect(reloadX, sy + this._px(6), reloadW, this._px(2));
      ctx.fillStyle = P_COLORS[idx];
      ctx.fillRect(reloadX, sy + this._px(6), reloadFrac * reloadW, this._px(2));
    }
  }

  // ── Noodle arms ─────────────────────────────────────────────────────────────

  drawNoodleArms(p1, p2, t) {
    // limbs rendered in Three.js behind body
  }

  // ── Floating damage numbers ─────────────────────────────────────────────────

  // ── Card strip (bottom corners, shows active cards per player) ─────────────

  drawCardStrips(p1Cards, p2Cards) {
    const bh     = this.canvas.height;
    const pad    = this._px(8);
    const bottom = bh - this._px(28);
    const chipH  = this._px(17);
    const chipGap = this._px(4);

    p1Cards.forEach((c, i) => {
      const y = bottom - (p1Cards.length - 1 - i) * (chipH + chipGap);
      this._drawCardChip(this.ctx, c, pad, y, 'left');
    });
    p2Cards.forEach((c, i) => {
      const y = bottom - (p2Cards.length - 1 - i) * (chipH + chipGap);
      this._drawCardChip(this.ctx, c, this.canvas.width - pad, y, 'right');
    });
  }

  _drawCardChip(ctx, card, anchorX, cy, align) {
    const bclr = RARITY_BORDER[card.rarity] || '#888888';
    ctx.font = this._font(10, '600');
    const tw = ctx.measureText(card.name).width;
    const ph = this._px(17);
    const pw = this._px(7);
    const w  = tw + pw * 2;
    const r  = this._px(4);
    const x  = align === 'left' ? anchorX : anchorX - w;
    const y  = cy - ph / 2;

    ctx.globalAlpha = 0.88;
    ctx.fillStyle = bclr;
    ctx.globalAlpha = 0.18;
    this._roundRect(ctx, x, y, w, ph, r);
    ctx.fill();

    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = bclr;
    ctx.lineWidth   = this._px(1);
    this._roundRect(ctx, x, y, w, ph, r);
    ctx.stroke();

    ctx.globalAlpha = 0.9;
    ctx.fillStyle   = '#ffffff';
    ctx.textAlign   = 'left';
    ctx.fillText(card.name, x + pw, cy + this._px(3.5));
    ctx.globalAlpha = 1;
  }

  drawDamageNumbers(numbers) {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    for (const n of numbers) {
      const alpha = Math.max(0, n.timer / (n.maxTimer || 0.9));
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = n.color;
      ctx.font        = this._font(n.label ? 20 : 16);
      const label = n.label || `-${n.amount}`;
      ctx.fillText(label, this._px(n.x), this._px(n.y));
    }
    ctx.globalAlpha = 1;
  }

  // ── Round overlay text ──────────────────────────────────────────────────────

  drawRoundText(text, subtext = '', color = '#ffffff', midtext = '', frac = 0.5) {
    const ctx = this.ctx;
    const cx  = this.canvas.width  / 2;
    const cy  = this.canvas.height / 2;

    // frac: 1=just appeared, 0=about to disappear. punch-in on arrival.
    const punchT = Math.max(0, (frac - 0.75) / 0.25);  // 1→0 during first 25% of duration
    const scale  = 1 + punchT * 0.35;
    const alpha  = frac < 0.12 ? frac / 0.12 : 1;      // quick fade out at end

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    ctx.fillStyle = color;
    ctx.font      = this._font(80);
    ctx.textAlign = 'center';
    ctx.fillText(text, 0, 0);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    if (midtext) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font      = this._font(22, '600');
      ctx.textAlign = 'center';
      ctx.fillText(midtext.toUpperCase(), cx, cy + this._px(44));
    }

    if (subtext) {
      ctx.fillStyle = '#aaaaaa';
      ctx.font      = this._font(20, '400');
      ctx.textAlign = 'center';
      ctx.fillText(subtext, cx, cy + this._px(80));
    }
    ctx.restore();
  }

  drawWinner(playerIdx, score1 = 0, score2 = 0, p1Cards = [], p2Cards = [], isGuest = false, mx = 0, my = 0) {
    const ctx   = this.ctx;
    const cx    = this.canvas.width  / 2;
    const cy    = this.canvas.height / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = P_COLORS[playerIdx];
    ctx.font      = this._font(100);
    ctx.textAlign = 'center';
    ctx.fillText('WINNER', cx, cy - this._px(30));
    ctx.fillStyle = '#ffffff';
    ctx.font      = this._font(32, 'normal');
    ctx.fillText(`Player ${playerIdx + 1} wins the match`, cx, cy + this._px(30));

    // Final scores
    ctx.font      = this._font(26, 'normal');
    ctx.fillStyle = P_COLORS[0];
    ctx.textAlign = 'right';
    ctx.fillText(`P1  ${score1}`, cx - this._px(14), cy + this._px(80));
    ctx.fillStyle = '#555555';
    ctx.textAlign = 'center';
    ctx.fillText('|', cx, cy + this._px(80));
    ctx.fillStyle = P_COLORS[1];
    ctx.textAlign = 'left';
    ctx.fillText(`${score2}  P2`, cx + this._px(14), cy + this._px(80));

    // Card stacks (sides, max 8 shown each to avoid overflow)
    const chipH  = this._px(16);
    const chipGap = this._px(3);
    const pad    = this._px(20);
    const baseY  = cy + this._px(108);
    const maxChips = 8;

    [p1Cards, p2Cards].forEach((cards, pIdx) => {
      const align = pIdx === 0 ? 'left' : 'right';
      const anchorX = pIdx === 0 ? pad : this.canvas.width - pad;
      const shown = cards.slice(0, maxChips);
      shown.forEach((c, i) => {
        const y = baseY + i * (chipH + chipGap);
        this._drawCardChip(ctx, c, anchorX, y + chipH / 2, align);
      });
      if (cards.length > maxChips) {
        const extraY = baseY + maxChips * (chipH + chipGap) + chipH / 2;
        ctx.font      = this._font(10, 'normal');
        ctx.fillStyle = '#666666';
        ctx.textAlign = align;
        ctx.fillText(`+${cards.length - maxChips} more`, anchorX, extraY);
      }
    });

    // Rematch button (host and local/AI only; guest returns to lobby)
    const rematchY = cy + this._px(210);
    if (!isGuest) {
      const bw = this._px(280), bh = this._px(52);
      const rematchHov = this._hitRect(mx, my, cx - bw / 2, rematchY - bh / 2, bw, bh);
      this._drawButton(ctx, cx, rematchY, 'PLAY AGAIN', '#446688', rematchHov);
      ctx.fillStyle = '#444455';
      ctx.font      = this._font(14, 'normal');
      ctx.textAlign = 'center';
      ctx.fillText('or click anywhere else to return to menu', cx, rematchY + this._px(42));
    } else {
      ctx.fillStyle = '#555566';
      ctx.font      = this._font(18, 'normal');
      ctx.textAlign = 'center';
      ctx.fillText('Click to return to menu', cx, rematchY);
    }
  }

  getMatchEndClick(mx, my) {
    const cx = this.canvas.width  / 2;
    const cy = this.canvas.height / 2;
    const bw = this._px(280);
    const bh = this._px(52);
    const rematchY = cy + this._px(210);
    if (this._hitRect(mx, my, cx - bw / 2, rematchY - bh / 2, bw, bh)) return 'rematch';
    return 'menu';
  }

  // ── Pause overlay ───────────────────────────────────────────────────────────

  drawPause() {
    const ctx = this.ctx;
    const cx  = this.canvas.width  / 2;
    const cy  = this.canvas.height / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.fillStyle = '#ffffff';
    ctx.font      = this._font(64);
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', cx, cy);

    ctx.fillStyle = '#555566';
    ctx.font      = this._font(20, '400');
    ctx.fillText('Press ESC to resume', cx, cy + this._px(52));

    // Controls hint
    const lines = [
      'P1: WASD move  W jump  mouse aim  click shoot  Shift block',
      'P2: Arrows move  ArrowUp jump  auto-aim  / shoot  . block',
    ];
    ctx.font      = this._font(12, '400');
    ctx.fillStyle = '#444455';
    lines.forEach((l, i) => ctx.fillText(l, cx, cy + this._px(96 + i * 20)));
  }

  // ── Card picker ─────────────────────────────────────────────────────────────

  drawCardPicker(cards, hoveredIdx, pickerPlayerIdx, isLocalPicker, existingCards = [], fightNum = 0) {
    const ctx = this.ctx;
    const cx  = this.canvas.width  / 2;
    const cy  = this.canvas.height / 2;

    // Dim background -- slightly transparent so arena preview shows through
    ctx.fillStyle = 'rgba(0,0,0,0.68)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Fight number label
    if (fightNum > 0) {
      ctx.font      = this._font(13, '400');
      ctx.fillStyle = '#444466';
      ctx.textAlign = 'center';
      ctx.fillText(`FIGHT ${fightNum}`, cx, cy - this._px(226));
    }

    // Title
    const pColor = P_COLORS[pickerPlayerIdx] || '#ffffff';
    ctx.font      = this._font(30);
    ctx.textAlign = 'center';
    if (isLocalPicker) {
      ctx.fillStyle = pColor;
      ctx.fillText(`Player ${pickerPlayerIdx + 1}: Choose a card`, cx, cy - this._px(200));
    } else {
      ctx.fillStyle = '#555566';
      ctx.fillText(`Player ${pickerPlayerIdx + 1} is choosing...`, cx, cy - this._px(200));
    }

    // Existing cards strip
    if (existingCards.length > 0) {
      ctx.font      = this._font(13, 'normal');
      ctx.textAlign = 'center';
      const labels = existingCards.map(c => c.name).join('  |  ');
      ctx.fillStyle = '#666666';
      ctx.fillText(labels, cx, cy - this._px(168));
    }

    const cardW = this._px(200);
    const cardH = this._px(270);
    const gap   = this._px(22);
    const totalW = cards.length * cardW + (cards.length - 1) * gap;
    const startX = cx - totalW / 2;

    const STACKABLE = new Set(['extra_ammo', 'bouncy', 'quick_reload', 'haste', 'regeneration', 'bigger_magazine']);
    cards.forEach((card, i) => {
      const x = startX + i * (cardW + gap);
      const y = cy - cardH / 2 + this._px(18);  // shift down to make room for name above

      // Card name drawn above the frame
      ctx.font      = this._font(12, '700');
      ctx.textAlign = 'center';
      ctx.fillStyle = (i === hoveredIdx && isLocalPicker) ? '#ffffff' : 'rgba(255,255,255,0.42)';
      ctx.fillText(card.name.toUpperCase(), x + cardW / 2, y - this._px(8));

      const ownCount = existingCards.filter(c => c.id === card.id).length;
      this._drawCard(ctx, x, y, cardW, cardH, card, i === hoveredIdx, isLocalPicker, ownCount, STACKABLE.has(card.id));
    });
  }

  _drawCard(ctx, x, y, w, h, card, hovered, interactive, ownCount = 0, stackable = false) {
    const r    = this._px(8);
    const bclr = RARITY_BORDER[card.rarity] || '#888';

    if (!hovered || !interactive) {
      // Unexplored: very dark body, subtle rarity glow on border
      ctx.fillStyle = '#070810';
      this._roundRect(ctx, x, y, w, h, r);
      ctx.fill();

      ctx.strokeStyle = bclr;
      ctx.lineWidth   = this._px(1.5);
      ctx.globalAlpha = 0.25;
      this._roundRect(ctx, x, y, w, h, r);
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }

    // Hovered: full card reveal
    ctx.fillStyle = '#141828';
    this._roundRect(ctx, x, y, w, h, r);
    ctx.fill();

    // Rarity-colored header band (top portion)
    const hdH = this._px(115);
    ctx.save();
    this._roundRect(ctx, x, y, w, h, r);
    ctx.clip();
    ctx.fillStyle = bclr;
    ctx.globalAlpha = 0.38;
    ctx.fillRect(x, y, w, hdH);
    ctx.globalAlpha = 1;
    ctx.restore();

    // Illustration area: colored circle
    const icCx = x + w / 2;
    const icCy = y + this._px(46);
    const icR  = this._px(28);
    ctx.beginPath();
    ctx.arc(icCx, icCy, icR, 0, Math.PI * 2);
    ctx.fillStyle = bclr;
    ctx.globalAlpha = 0.55;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(icCx, icCy, icR, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = this._px(1.5);
    ctx.globalAlpha = 0.35;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Initial letter inside circle
    ctx.fillStyle = '#ffffff';
    ctx.font      = this._font(26);
    ctx.textAlign = 'center';
    ctx.fillText(card.name.charAt(0).toUpperCase(), icCx, icCy + this._px(9));

    // Rarity label below illustration
    ctx.fillStyle = bclr;
    ctx.font      = this._font(9, '700');
    ctx.textAlign = 'center';
    ctx.fillText(card.rarity.toUpperCase(), x + w / 2, y + hdH - this._px(7));

    // Bright border on hover
    ctx.strokeStyle = bclr;
    ctx.lineWidth   = this._px(2);
    this._roundRect(ctx, x, y, w, h, r);
    ctx.stroke();

    // Ownership indicator
    let descStartY = y + hdH + this._px(16);
    if (ownCount > 0) {
      if (stackable) {
        ctx.fillStyle = '#88cc88';
        ctx.font      = this._font(10, '600');
        ctx.textAlign = 'center';
        ctx.fillText(`×${ownCount} owned`, x + w / 2, descStartY);
      } else {
        ctx.fillStyle = '#886644';
        ctx.font      = this._font(10, '600');
        ctx.textAlign = 'center';
        ctx.fillText('ALREADY OWNED', x + w / 2, descStartY);
      }
      descStartY += this._px(16);
    }

    // Description: one line per \n entry
    ctx.fillStyle = '#c8cce0';
    ctx.font      = this._font(12, '400');
    this._drawDescLines(ctx, card.desc, x + this._px(12), descStartY, w - this._px(24), this._px(19));
  }

  _drawDescLines(ctx, desc, x, y, maxW, lineH) {
    if (!desc) return;
    for (const line of desc.split('\n')) {
      this._wrapText(ctx, line, x, y, maxW, lineH);
      y += lineH;
    }
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

  drawLobby(state, t = 0, mx = 0, my = 0, mapName = '') {
    const ctx = this.ctx;
    const cx  = this.canvas.width  / 2;
    const cy  = this.canvas.height / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.90)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Dim map name watermark
    if (mapName) {
      ctx.font      = this._font(13, 'normal');
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.textAlign = 'right';
      ctx.fillText(mapName, this.canvas.width - this._px(14), this.canvas.height - this._px(22));
    }

    // Pulsing glow on title
    const titleY   = cy - this._px(200);
    const pulse    = 0.5 + 0.5 * Math.sin(t * 1.4);
    const glowAlpha = 0.18 + pulse * 0.22;
    const glowBlur  = this._px(28 + pulse * 18);
    ctx.save();
    ctx.font      = this._font(64);
    ctx.textAlign = 'center';
    ctx.shadowColor = `rgba(255,255,255,${glowAlpha})`;
    ctx.shadowBlur  = glowBlur;
    ctx.fillStyle   = '#ffffff';
    ctx.fillText('TURNS', cx, titleY);
    ctx.shadowBlur = 0;
    ctx.restore();

    ctx.fillStyle = '#888888';
    ctx.font      = this._font(16, 'normal');
    ctx.fillText('A browser remake of ROUNDS by Landfall Games', cx, cy - this._px(155));

    if (state.mode === 'menu') {
      const bw = this._px(280), bh = this._px(52);
      const hov = (btnCy) => this._hitRect(mx, my, cx - bw/2, btnCy - bh/2, bw, bh);
      this._drawButton(ctx, cx, cy - this._px(80), 'HOST GAME', '#e63946', hov(cy - this._px(80)));
      this._drawButton(ctx, cx, cy, 'JOIN GAME', '#457b9d', hov(cy));
      this._drawButton(ctx, cx, cy + this._px(80), 'LOCAL 2-PLAYER', '#668844', hov(cy + this._px(80)));
      this._drawButton(ctx, cx, cy + this._px(160), 'SOLO (vs AI)', '#557755', hov(cy + this._px(160)));

    } else if (state.mode === 'ai_difficulty') {
      ctx.fillStyle = '#aaaaaa';
      ctx.font      = this._font(20, 'normal');
      ctx.textAlign = 'center';
      ctx.fillText('Choose AI difficulty:', cx, cy - this._px(120));

      const bw = this._px(240), bh = this._px(52);
      const hov = (btnCy) => this._hitRect(mx, my, cx - bw/2, btnCy - bh/2, bw, bh);
      this._drawButton(ctx, cx, cy - this._px(40), 'EASY',   '#448844', hov(cy - this._px(40)));
      this._drawButton(ctx, cx, cy + this._px(40), 'NORMAL', '#557755', hov(cy + this._px(40)));
      this._drawButton(ctx, cx, cy + this._px(120), 'HARD',  '#aa4433', hov(cy + this._px(120)));

      // Back link
      const backHov = this._hitRect(mx, my, cx - this._px(60), cy + this._px(185), this._px(120), this._px(28));
      ctx.fillStyle = backHov ? '#ffffff' : '#666666';
      ctx.font      = this._font(16, 'normal');
      ctx.fillText('< BACK', cx, cy + this._px(200));

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

    }
  }

  _drawButton(ctx, cx, cy, label, color, hovered = false) {
    const bw = this._px(280);
    const bh = this._px(52);
    ctx.save();
    if (hovered) {
      ctx.shadowColor = color;
      ctx.shadowBlur  = this._px(12);
      ctx.globalAlpha = 1.0;
    } else {
      ctx.globalAlpha = 0.88;
    }
    ctx.fillStyle = color;
    this._roundRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, this._px(6));
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font      = this._font(22);
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + this._px(8));
    ctx.restore();
  }

  // ── Lobby hit-test ─────────────────────────────────────────────────────────

  getLobbyClick(mx, my, mode = 'menu') {
    const cx = this.canvas.width  / 2;
    const cy = this.canvas.height / 2;

    if (mode === 'ai_difficulty') {
      const bw = this._px(240), bh = this._px(52);
      if (this._hitRect(mx, my, cx - bw / 2, cy - this._px(40)  - bh / 2, bw, bh)) return 'easy';
      if (this._hitRect(mx, my, cx - bw / 2, cy + this._px(40)  - bh / 2, bw, bh)) return 'normal';
      if (this._hitRect(mx, my, cx - bw / 2, cy + this._px(120) - bh / 2, bw, bh)) return 'hard';
      if (this._hitRect(mx, my, cx - this._px(60), cy + this._px(185), this._px(120), this._px(28))) return 'back';
      return null;
    }

    const bw = this._px(280);
    const bh = this._px(52);
    if (this._hitRect(mx, my, cx - bw / 2, cy - this._px(80)  - bh / 2, bw, bh)) return 'host';
    if (this._hitRect(mx, my, cx - bw / 2, cy                 - bh / 2, bw, bh)) return 'join';
    if (this._hitRect(mx, my, cx - bw / 2, cy + this._px(80)  - bh / 2, bw, bh)) return 'local';
    if (this._hitRect(mx, my, cx - bw / 2, cy + this._px(160) - bh / 2, bw, bh)) return 'ai';
    return null;
  }

  getCardPickerClick(cards, mx, my) {
    const cx     = this.canvas.width  / 2;
    const cy     = this.canvas.height / 2;
    const cardW  = this._px(200);
    const cardH  = this._px(270);
    const gap    = this._px(22);
    const totalW = cards.length * cardW + (cards.length - 1) * gap;
    const startX = cx - totalW / 2;

    for (let i = 0; i < cards.length; i++) {
      const x = startX + i * (cardW + gap);
      const y = cy - cardH / 2 + this._px(18);
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

  drawAILabel(difficulty = 'normal') {
    const ctx = this.ctx;
    const colors = { easy: '#448844', normal: '#557755', hard: '#aa4433' };
    const label  = `AI: ${difficulty.toUpperCase()}`;
    ctx.font      = this._font(11, 'normal');
    ctx.textAlign = 'right';
    ctx.fillStyle = colors[difficulty] || '#557755';
    ctx.fillText(label, this.canvas.width - this._px(10), this.canvas.height - this._px(22));
  }

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
