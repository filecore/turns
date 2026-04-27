// cards.js — card definitions and effect application

export const RARITY = { COMMON: 'common', UNCOMMON: 'uncommon', RARE: 'rare' };

export const CARDS = [
  {
    id: 'big_bullet',
    name: 'Big Bullet',
    rarity: RARITY.COMMON,
    desc: 'Much bigger bullet\n+0.25s reload',
    apply(p) { p.bulletRadius *= 1.8; p.reloadTime += 0.25; },
  },
  {
    id: 'burst',
    name: 'Burst',
    rarity: RARITY.COMMON,
    desc: '+2 bullets per shot\n+3 ammo\nA lot less damage\n+0.25s reload',
    apply(p) { p.bulletsPerShot += 2; p.maxAmmo += 3; p.bulletDamage *= 0.3; p.reloadTime += 0.25; },
  },
  {
    id: 'bouncy',
    name: 'Bouncy',
    rarity: RARITY.COMMON,
    desc: 'Bullets bounce twice\nSlightly more damage\n+0.25s reload',
    apply(p) { p.bulletBounces += 2; p.bulletDamage *= 1.25; p.reloadTime += 0.25; },
  },
  {
    id: 'chaser',
    name: 'Chaser',
    rarity: RARITY.UNCOMMON,
    desc: 'Bullets home toward opponent\nSlower bullets',
    apply(p) { p.bulletHoming = true; p.bulletSpeed *= 0.85; },
  },
  {
    id: 'extra_ammo',
    name: 'Extra Ammo',
    rarity: RARITY.COMMON,
    desc: '+2 ammo',
    apply(p) { p.maxAmmo += 2; },
  },
  {
    id: 'quick_reload',
    name: 'Quick Reload',
    rarity: RARITY.UNCOMMON,
    desc: 'Much faster reload',
    apply(p) { p.reloadTime *= 0.3; },
  },
  {
    id: 'tank',
    name: 'Tank',
    rarity: RARITY.COMMON,
    desc: 'A huge amount of HP\nSlower attack speed\n+0.5s reload',
    apply(p) { p.maxHp *= 2; p.hp = Math.min(p.hp * 2, p.maxHp); p.shootCooldown *= 1.25; p.reloadTime += 0.5; },
  },
  {
    id: 'glass_cannon',
    name: 'Glass Cannon',
    rarity: RARITY.UNCOMMON,
    desc: 'Loads more damage\nAlmost no HP\n+0.25s reload',
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
    desc: 'Auto-block on last shot\n+0.5s reload\n+0.5s block cooldown',
    apply(p) { p.autoBlockOnLastShot = true; p.reloadTime += 0.5; p.blockCooldown += 0.5; },
  },
  {
    id: 'decay',
    name: 'Decay',
    rarity: RARITY.UNCOMMON,
    desc: 'Damage dealt spreads over time\nMore HP',
    apply(p) { p.damageDecay = true; p.maxHp *= 1.5; p.hp = Math.min(p.hp * 1.5, p.maxHp); },
  },
  {
    id: 'huge',
    name: 'Huge',
    rarity: RARITY.COMMON,
    desc: 'More HP',
    apply(p) { p.maxHp *= 1.8; p.hp = Math.min(p.hp * 1.8, p.maxHp); p.radius *= 1.15; },
  },
  {
    id: 'leech',
    name: 'Leech',
    rarity: RARITY.COMMON,
    desc: 'Heals from damage dealt\nMore HP',
    apply(p) { p.leech = 0.75; p.maxHp *= 1.3; p.hp = Math.min(p.hp * 1.3, p.maxHp); },
  },
  {
    id: 'taste_of_blood',
    name: 'Taste of Blood',
    rarity: RARITY.UNCOMMON,
    desc: 'Speed boost after dealing damage',
    apply(p) { p.tasteOfBlood = true; },
  },
  {
    id: 'defender',
    name: 'Defender',
    rarity: RARITY.UNCOMMON,
    desc: 'Less block cooldown\nMore HP',
    apply(p) { p.blockCooldown *= 0.7; p.maxHp *= 1.3; p.hp = Math.min(p.hp * 1.3, p.maxHp); },
  },
  {
    id: 'pristine_perseverance',
    name: 'Pristine Perseverance',
    rarity: RARITY.RARE,
    desc: 'Large HP bonus when near full health\nTriggers once per fight',
    apply(p) { p.pristineBonus = true; },
  },
  {
    id: 'haste',
    name: 'Haste',
    rarity: RARITY.COMMON,
    desc: 'Much faster movement',
    apply(p) { p.speedMult = (p.speedMult || 1.0) * 1.4; },
  },
  {
    id: 'quick_hands',
    name: 'Quick Hands',
    rarity: RARITY.UNCOMMON,
    desc: 'Much faster attack speed',
    apply(p) { p.shootCooldown *= 0.6; },
  },
  {
    id: 'regeneration',
    name: 'Regeneration',
    rarity: RARITY.RARE,
    desc: 'Slowly regenerate HP',
    apply(p) { p.regen = (p.regen || 0) + 15; },
  },
  {
    id: 'explosive_rounds',
    name: 'Explosive Rounds',
    rarity: RARITY.RARE,
    desc: 'Bullets explode on impact',
    apply(p) { p.bulletExplosive = true; },
  },
  {
    id: 'dead_mans_hand',
    name: "Dead Man's Hand",
    rarity: RARITY.RARE,
    desc: 'More damage when low on HP',
    apply(p) { p.deadManHand = true; },
  },
  {
    id: 'bigger_magazine',
    name: 'Bigger Magazine',
    rarity: RARITY.COMMON,
    desc: '+4 ammo\n+1 bullet per shot',
    apply(p) { p.maxAmmo += 4; p.bulletsPerShot += 1; },
  },
  {
    id: 'speed_loader',
    name: 'Speed Loader',
    rarity: RARITY.UNCOMMON,
    desc: 'First shot after reload is instant',
    apply(p) { p.speedLoader = true; },
  },
  {
    id: 'berserk',
    name: 'Berserk',
    rarity: RARITY.RARE,
    desc: 'Move speed grows as HP drops',
    apply(p) { p.berserk = true; },
  },
  {
    id: 'armor',
    name: 'Armor',
    rarity: RARITY.UNCOMMON,
    desc: 'Take less damage\nStacks up to 3 times',
    apply(p) { p.armor = Math.min(0.75, (p.armor || 0) + 0.25); },
  },
  {
    id: 'volatile',
    name: 'Volatile',
    rarity: RARITY.RARE,
    desc: 'Reflected bullets deal double damage',
    apply(p) { p.volatile = true; },
  },
  {
    id: 'sniper',
    name: 'Sniper',
    rarity: RARITY.UNCOMMON,
    desc: 'Much faster bullet\nSmaller bullet\nNo bullet arc\nSlightly more damage',
    apply(p) { p.bulletSpeed *= 2.2; p.bulletRadius *= 0.6; p.bulletDamage *= 1.15; p.bulletNoGravity = true; },
  },
  {
    id: 'drill',
    name: 'Drill',
    rarity: RARITY.RARE,
    desc: 'Bullets pierce through players',
    apply(p) { p.bulletPiercing = true; },
  },
  {
    id: 'slippery',
    name: 'Slippery',
    rarity: RARITY.COMMON,
    desc: 'Much less ground friction\nSlightly faster movement',
    apply(p) { p.slippery = true; p.speedMult = (p.speedMult || 1.0) * 1.15; },
  },
  {
    id: 'extra_jump',
    name: 'Extra Jump',
    rarity: RARITY.COMMON,
    desc: '+1 air jump',
    apply(p) { p.maxExtraJumps = (p.maxExtraJumps || 0) + 1; },
  },
];

const RARITY_WEIGHT = { common: 10, uncommon: 6, rare: 3 };

export function drawCardOffer(count = 5) {
  // Weighted random draw without replacement
  const pool = CARDS.map(c => ({ card: c, weight: RARITY_WEIGHT[c.rarity] || 5 }));
  const result = [];
  while (result.length < count && pool.length > 0) {
    const total = pool.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].weight;
      if (r <= 0) { idx = i; break; }
    }
    result.push(pool.splice(idx, 1)[0].card);
  }
  return result;
}
