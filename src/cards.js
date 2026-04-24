// cards.js — card definitions and effect application

export const RARITY = { COMMON: 'common', UNCOMMON: 'uncommon', RARE: 'rare' };

export const CARDS = [
  {
    id: 'big_bullet',
    name: 'Big Bullet',
    rarity: RARITY.COMMON,
    desc: 'Bullet size +80%. Reload +0.25s.',
    apply(p) { p.bulletRadius *= 1.8; p.reloadTime += 0.25; },
  },
  {
    id: 'burst',
    name: 'Burst',
    rarity: RARITY.COMMON,
    desc: '+2 bullets per shot. +3 ammo. Damage -70%. Reload +0.25s.',
    apply(p) { p.bulletsPerShot += 2; p.maxAmmo += 3; p.bulletDamage *= 0.3; p.reloadTime += 0.25; },
  },
  {
    id: 'bouncy',
    name: 'Bouncy',
    rarity: RARITY.COMMON,
    desc: 'Bullets bounce twice. Damage +25%. Reload +0.25s.',
    apply(p) { p.bulletBounces += 2; p.bulletDamage *= 1.25; p.reloadTime += 0.25; },
  },
  {
    id: 'chaser',
    name: 'Chaser',
    rarity: RARITY.UNCOMMON,
    desc: 'Bullets home toward opponent. Speed -15%.',
    apply(p) { p.bulletHoming = true; p.bulletSpeed *= 0.85; },
  },
  {
    id: 'extra_ammo',
    name: 'Extra Ammo',
    rarity: RARITY.COMMON,
    desc: '+2 ammo capacity.',
    apply(p) { p.maxAmmo += 2; },
  },
  {
    id: 'quick_reload',
    name: 'Quick Reload',
    rarity: RARITY.UNCOMMON,
    desc: 'Reload time -70%.',
    apply(p) { p.reloadTime *= 0.3; },
  },
  {
    id: 'tank',
    name: 'Tank',
    rarity: RARITY.COMMON,
    desc: 'HP +100%. Attack speed -25%. Reload +0.5s.',
    apply(p) { p.maxHp *= 2; p.hp = Math.min(p.hp * 2, p.maxHp); p.shootCooldown *= 1.25; p.reloadTime += 0.5; },
  },
  {
    id: 'glass_cannon',
    name: 'Glass Cannon',
    rarity: RARITY.UNCOMMON,
    desc: 'Damage +100%. HP -100%. Reload +0.25s.',
    apply(p) {
      p.bulletDamage *= 2;
      const hpFrac = p.hp / p.maxHp;
      p.maxHp = Math.max(1, p.maxHp * 0.01);
      p.hp = hpFrac * p.maxHp;
      p.reloadTime += 0.25;
    },
  },
  {
    id: 'shields_up',
    name: 'Shields Up',
    rarity: RARITY.COMMON,
    desc: 'Auto-block when last bullet fired. Reload +0.5s. Block CD +0.5s.',
    apply(p) { p.autoBlockOnLastShot = true; p.reloadTime += 0.5; p.blockCooldown += 0.5; },
  },
  {
    id: 'decay',
    name: 'Decay',
    rarity: RARITY.UNCOMMON,
    desc: 'Damage spreads over 4s. HP +50%.',
    apply(p) { p.damageDecay = true; p.maxHp *= 1.5; p.hp = Math.min(p.hp * 1.5, p.maxHp); },
  },
  {
    id: 'huge',
    name: 'Huge',
    rarity: RARITY.COMMON,
    desc: 'HP +80%.',
    apply(p) { p.maxHp *= 1.8; p.hp = Math.min(p.hp * 1.8, p.maxHp); p.radius *= 1.15; },
  },
  {
    id: 'leech',
    name: 'Leech',
    rarity: RARITY.COMMON,
    desc: '75% of damage dealt heals you. HP +30%.',
    apply(p) { p.leech = 0.75; p.maxHp *= 1.3; p.hp = Math.min(p.hp * 1.3, p.maxHp); },
  },
  {
    id: 'taste_of_blood',
    name: 'Taste of Blood',
    rarity: RARITY.UNCOMMON,
    desc: 'Move speed +50% for 3s after dealing damage.',
    apply(p) { p.tasteOfBlood = true; },
  },
  {
    id: 'defender',
    name: 'Defender',
    rarity: RARITY.UNCOMMON,
    desc: 'Block cooldown -30%. HP +30%.',
    apply(p) { p.blockCooldown *= 0.7; p.maxHp *= 1.3; p.hp = Math.min(p.hp * 1.3, p.maxHp); },
  },
  {
    id: 'pristine_perseverance',
    name: 'Pristine Perseverance',
    rarity: RARITY.RARE,
    desc: '+400 HP when above 90% HP. Triggers once per fight.',
    apply(p) { p.pristineBonus = true; },
  },
];

export function drawCardOffer(count = 5) {
  const pool = [...CARDS];
  const result = [];
  while (result.length < count && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(i, 1)[0]);
  }
  return result;
}
