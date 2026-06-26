// ColorsV3 — weapon, weapon-ability, and mage-special data.
// Ported verbatim (values) from ColorsV2/frontend/WeaponsData.js so combat math matches.
// CommonJS so the Node backend can require it. The frontend keeps an ESM copy in src/data/.

export const weaponsData = {
  weapons: {
    // --- Melee ---
    sword: { label: "Sword", value: "sword", type: "melee", stats: { "hit%": 85, str: 2, def: 0, mgk: 0, res: 0, spd: 0, skl: 1, knl: 0, lck: 0, range: 1 } },
    axe: { label: "Axe", value: "axe", type: "melee", stats: { "hit%": 75, str: 3, def: 2, mgk: 0, res: 0, spd: 0, skl: 0, knl: 0, lck: 0, range: 1 } },
    dagger: { label: "Dagger", value: "dagger", type: "melee", stats: { "hit%": 90, str: 1, def: 0, mgk: 0, res: 0, spd: 1, skl: 0, knl: 0, lck: 0, range: 1 } },
    lance: { label: "Lance", value: "lance", type: "melee", stats: { "hit%": 80, str: 2, def: 1, mgk: 0, res: 1, spd: 0, skl: 0, knl: 0, lck: 0, range: 1 } },
    bow: { label: "Bow", value: "bow", type: "melee", stats: { "hit%": 85, str: 2, def: 0, mgk: 0, res: 0, spd: 0, skl: 0, knl: 1, lck: 0, range: 2 } },
    gauntlets: { label: "Gauntlets", value: "gauntlets", type: "melee", stats: { "hit%": 80, str: 2, def: 0, mgk: 0, res: 0, spd: 0, skl: 0, knl: 0, lck: 2, range: 1 } },

    // --- Magick (mage) ---
    fire: { label: "Fire", value: "fire", type: "magick", stats: { "hit%": 80, str: 0, def: 0, mgk: 4, res: 0, spd: 0, skl: 0, knl: 0, lck: 2, range: 1 } },
    water: { label: "Water", value: "water", type: "magick", stats: { "hit%": 85, str: 0, def: 0, mgk: 2, res: 0, spd: 0, skl: 1, knl: 0, lck: 2, range: 1 } },
    earth: { label: "Earth", value: "earth", type: "magick", stats: { "hit%": 75, str: 0, def: 2, mgk: 2, res: 1, spd: 0, skl: 0, knl: 0, lck: 0, range: 1 } },
    lightning: { label: "Lightning", value: "lightning", type: "magick", stats: { "hit%": 85, str: 0, def: 0, mgk: 2, res: 0, spd: 1, skl: 0, knl: 0, lck: 0, range: 1 } },
    grass: { label: "Grass", value: "grass", type: "magick", stats: { "hit%": 85, str: 0, def: 1, mgk: 0, res: 2, spd: 0, skl: 0, knl: 0, lck: 0, range: 1 } },
    aether: { label: "Aether", value: "aether", type: "magick", stats: { "hit%": 90, str: 0, def: 0, mgk: 1, res: 0, spd: 0, skl: 0, knl: 1, lck: 0, range: 1 } },
    wind: { label: "Wind", value: "wind", type: "magick", stats: { "hit%": 80, str: 0, def: 0, mgk: 2, res: 0, spd: 0, skl: 0, knl: 0, lck: 0, range: 1 } },
    light: { label: "Light", value: "light", type: "magick", stats: { "hit%": 90, str: 0, def: 0, mgk: 0, res: 2, spd: 0, skl: 0, knl: 0, lck: 0, range: 1 } },
    dark: { label: "Dark", value: "dark", type: "magick", stats: { "hit%": 75, str: 0, def: 1, mgk: 3, res: 1, spd: 0, skl: 0, knl: 0, lck: 0, range: 1 } },
    gray: { label: "Gray", value: "gray", type: "magick", stats: { "hit%": 80, str: 0, def: 0, mgk: 1, res: 0, spd: 0, skl: 0, knl: 3, lck: 0, range: 1 } },
  },

  // Each weapon offers a list of abilities. A character picks exactly 2.
  // Ability stat fields (str/mgk/def/... and hit%/range) modify the attack they are used on.
  weaponAbilities: {
    sword: [
      { name: "Evasion", "hit%": 80, str: 1, lck: -2, range: 1, uses: 1, type: "Efficiency", effect: "1.3x Eva against certain units" },
      { name: "Sword Dance", "hit%": 75, str: 2, skl: 2, range: 1, uses: 1, type: "Damage", effect: "Lowers accuracy to raise chance of evasion" },
      { name: "Tipper", "hit%": 80, str: -1, skl: 5, range: 1, uses: 1, type: "Damage", effect: "Outranges the opponent" },
      { name: "Crescent Slash", "hit%": 80, str: -1, range: 1, uses: 1, type: "Radial", effect: "Swings the sword in a circle hitting all adjacent foes." },
      { name: "Foul Play", "hit%": 80, str: 1, range: 1, uses: 1, type: "Obscuring", effect: "Kicks up a cloud of dirt. Enemy acc cut for counter attack" },
      { name: "Gouge", "hit%": 75, range: 1, uses: 1, type: "Blinding", effect: "Gouges the eyes, leaving the opponent blind for one turn." },
      { name: "Shadow Blade", "hit%": 75, str: -1, range: 1, uses: 1, type: "Maiming", effect: "If landed unit disappears, preventing counter attack, and moves back 1 space" },
    ],
    axe: [
      { name: "Breaker", "hit%": 70, str: 3, spd: -1, lck: -2, range: 1, uses: 1, type: "Efficiency", effect: "1.3x Pwr against certain units" },
      { name: "Tomahawk", "hit%": 70, range: 2, uses: 1, type: "Damage", effect: "Hurls a tomahawk axe from 2 spaces away" },
      { name: "Armor Cleaver", "hit%": 70, range: 1, uses: 1, type: "Piercing", effect: "Cleaves through opponents armor, negating enemy protection" },
      { name: "Rend", "hit%": 70, str: -1, range: 1, uses: 1, type: "Radial", effect: "Splits the earth in two, damaging three spaces in front vertically" },
      { name: "Dismember", "hit%": 75, str: 1, range: 1, uses: 1, type: "Maiming", effect: "Slices through limbs, preventing a counter attack" },
      { name: "Bludgeon", "hit%": 70, range: 1, uses: 1, type: "Injuring", effect: "Hobbles the limb of the opponent leaving the injured status effect (1 turn)" },
      { name: "Ragnarok", "hit%": 65, str: 6, def: -1, spd: -1, range: 1, uses: 1, type: "Damage", effect: "Leaps into the air sacrificing control for a devastating blow" },
    ],
    dagger: [
      { name: "Acceleration", "hit%": 85, def: -1, lck: -2, range: 1, uses: 1, type: "Efficiency", effect: "1.3x Aglty against certain units" },
      { name: "Throwing Knives", "hit%": 80, str: -1, range: 2, uses: 1, type: "Damage", effect: "Throws a knife hitting an enemy from 2 spaces away" },
      { name: "Puncture", "hit%": 80, range: 1, uses: 1, type: "Piercing", effect: "Slips the dagger between armor plates, negating enemy protection" },
      { name: "Flurry", "hit%": 75, str: -1, range: 1, uses: 1, type: "Radial", effect: "Spins violently throwing knives in each direction (x pattern)" },
      { name: "Pin", "hit%": 85, range: 1, uses: 1, type: "Immobilizing", effect: "Pins enemy feet to the floor, immobilized for one turn" },
      { name: "Stagnate", "hit%": 85, range: 1, uses: 1, type: "Slowing", effect: "Stabs the enemy with a toxin, slowing their movement for a turn." },
      { name: "Blitz", "hit%": 75, def: -1, range: 1, uses: 1, type: "Brave", effect: "Attacks the enemy twice before the other can attack." },
    ],
    lance: [
      { name: "Guard", "hit%": 75, str: 1, lck: -2, range: 1, uses: 1, type: "Efficiency", effect: "1.3x Prt against certain units" },
      { name: "Javelin", "hit%": 75, range: 2, uses: 1, type: "Damage", effect: "Throws a javelin hitting an opponent from two spaces away." },
      { name: "Spear Sweep", "hit%": 70, str: -1, range: 1, uses: 1, type: "Radial", effect: "Wide arc hitting 3 enemies in front, pushing them back 1 space." },
      { name: "Run Through", "hit%": 80, str: 1, range: 1, uses: 1, type: "Damage", effect: "Impales opponent moving them and attacker back one space together." },
      { name: "Shaft Check", "hit%": 80, str: -2, def: 6, range: 1, uses: 1, type: "Damage", effect: "Attacks with the shaft, increasing defensive readiness" },
      { name: "Spell Spear", "hit%": 80, str: -2, res: 6, range: 1, uses: 1, type: "Damage", effect: "Douses the lance in oil, warding off mgk power." },
      { name: "Gore", "hit%": 75, str: 1, range: 1, uses: 1, type: "Damage", effect: "Pulls unit (2 spaces away) to adjacent space, then attacks." },
    ],
    bow: [
      { name: "Precision", "hit%": 85, str: 1, lck: -2, range: 2, uses: 1, type: "Efficiency", effect: "1.3x Acc against certain units." },
      { name: "Snipe", "hit%": 80, str: 1, range: 3, uses: 1, type: "Damage", effect: "Snipes an enemy from 3 spaces away." },
      { name: "Deadeye", "hit%": 100, str: -1, range: 2, uses: 1, type: "Damage", effect: "Shoots an arrow with incredible accuracy." },
      { name: "Explosive Volley", "hit%": 75, range: 3, uses: 1, type: "Meteor", effect: "Explosive arrow. Does 1/3 damage to adjacent enemies." },
      { name: "Hit and Run", "hit%": 80, str: -1, range: 2, uses: 1, type: "Damage", effect: "Attacks then moves back a space following the attack." },
      { name: "Tome Breaker", "hit%": 80, str: -1, res: -1, range: 2, uses: 1, type: "Silencing", effect: "Shoots the tome out of a mages hand, silencing them." },
      { name: "Poison Arrow", "hit%": 75, str: 2, range: 2, uses: 1, type: "Poisoning", effect: "Poisons the enemy for 2 turns." },
    ],
    gauntlets: [
      { name: "Exploitation", "hit%": 80, str: 2, range: 1, uses: 1, type: "Efficiency", effect: "1.3x Lck against certain units." },
      { name: "Dual Finger Jab", "hit%": 75, str: 1, lck: 1, range: 1, uses: 1, type: "Obscuring", effect: "Pokes the enemy in the eyes, obscuring their vision" },
      { name: "Vault", "hit%": 75, lck: 2, range: 1, uses: 1, type: "Radial", effect: "Launches off two opponents to reach a third (L-pattern)" },
      { name: "Disarm", "hit%": 75, def: 4, lck: 1, range: 1, uses: 1, type: "Damage", effect: "Attacks the enemies weapon, disarming them." },
      { name: "Tome Kick", "hit%": 75, res: 4, lck: 1, range: 1, uses: 1, type: "Damage", effect: "Kicks the tome out of a mages hands." },
      { name: "Skull Swing", "hit%": 80, str: 1, lck: 1, range: 1, uses: 1, type: "Damage", effect: "Attacks the head then lands behind them." },
      { name: "Crit Fist", "hit%": 60, lck: 10, range: 1, uses: 1, type: "Damage", effect: "An incredibly lucky strike, if it lands." },
    ],
    fire: [
      { name: "Incinerate", "hit%": 70, def: -1, mgk: 7, res: -1, spd: -1, range: 1, uses: 1, type: "Damage", effect: "Fire explodes toward the enemy, incinerating them" },
      { name: "Eruption", "hit%": 75, mgk: 2, range: 1, uses: 1, type: "Radial", effect: "Flames erupt in all directions damaging 4 enemies (t pattern)" },
      { name: "Scorch", "hit%": 80, mgk: 1, range: 2, uses: 1, type: "Burning", effect: "A blast of flame that leaves a burn for 2 turns" },
    ],
    water: [
      { name: "Dive", "hit%": 75, mgk: -1, range: 1, uses: 1, type: "Obscuring", effect: "Dives into water after attacking, reducing counter accuracy" },
      { name: "Torrent", "hit%": 80, mgk: -1, range: 1, uses: 1, type: "Radial", effect: "Blasts 3 units, pushing them back (horizontal pattern)" },
      { name: "Ice Spear", "hit%": 80, mgk: 1, range: 2, uses: 1, type: "Freezing", effect: "Pierces the flesh, leaving the enemy frozen for 2 turns" },
    ],
    earth: [
      { name: "Aegis", "hit%": 70, def: 4, mgk: -1, res: 4, range: 1, uses: 1, type: "Damage", effect: "Earth's crust covers the body, leaving them impregnable" },
      { name: "Quake", "hit%": 75, def: 1, mgk: -1, res: 1, range: 1, uses: 1, type: "Radial", effect: "A quake rends the earth, damaging three units (vertical pattern)" },
      { name: "Crush", "hit%": 75, mgk: -1, range: 2, uses: 1, type: "Crushing", effect: "A boulder crushes a limb, causing damage for 2 turns" },
    ],
    lightning: [
      { name: "Static spd", "hit%": 70, range: 1, uses: 1, type: "Brave", effect: "Body infused with electricity, attacks twice before the enemy" },
      { name: "Discharge", "hit%": 80, mgk: -1, range: 2, uses: 1, type: "Radial", effect: "Bolts explode outward, damaging 4 units (x pattern)" },
      { name: "Thunder", "hit%": 80, spd: 1, range: 2, uses: 1, type: "Shocking", effect: "Thunder shocks an enemy for 2 turns" },
    ],
    grass: [
      { name: "Leech Life", "hit%": 80, range: 1, uses: 1, type: "Absorption", effect: "The enemy's life force is tapped into and absorbed" },
      { name: "Natures Grasp", "hit%": 80, mgk: -1, range: 2, uses: 1, type: "Radial", effect: "Vines grab three units and pull them in 1 space" },
      { name: "Pin Needle", "hit%": 85, range: 2, uses: 1, type: "Poisoning", effect: "Poison needles damage the enemy for 2 turns" },
    ],
    aether: [
      { name: "Clarity", "hit%": 100, mgk: -2, range: 1, uses: 1, type: "Damage", effect: "All weather dissipates, the enemy is seen perfectly" },
      { name: "Asteroid", "hit%": 80, range: 4, uses: 1, type: "Meteor", effect: "An asteroid crashes down, 1/3 damage to adjacent enemies" },
      { name: "Gravity", "hit%": 85, range: 2, uses: 1, type: "Crushing", effect: "Crushing gravity damages the enemy for 2 turns" },
    ],
    wind: [
      { name: "Tornado", "hit%": 75, range: 1, uses: 1, type: "Damage", effect: "A vortex throws an enemy down within 1-3 spaces" },
      { name: "Gust", "hit%": 75, mgk: -1, range: 1, uses: 1, type: "Radial", effect: "A gust pushes 3 units back (horizontal pattern)" },
      { name: "Static", "hit%": 80, range: 2, uses: 1, type: "Shocking", effect: "Winds combine to shock the enemy for 2 turns" },
    ],
    light: [
      { name: "Aura", "hit%": 85, mgk: -1, res: 6, range: 1, uses: 1, type: "Damage", effect: "A powerful aura covers the mage as they strike" },
      { name: "Ostracism", "hit%": 85, mgk: -2, range: 2, uses: 1, type: "Radial", effect: "2 nonbelievers are banished (y pattern), pushed back 2 spaces" },
      { name: "Pillar Of Light", "hit%": 80, mgk: 1, range: 2, uses: 1, type: "Burning", effect: "A light so bright it burns the enemy for 2 turns" },
    ],
    dark: [
      { name: "Fluux", "hit%": 70, mgk: 7, spd: -1, range: 1, uses: 1, type: "Damage", effect: "Woe itself strangles the enemy" },
      { name: "Tentatio", "hit%": 70, range: 1, uses: 1, type: "Radial", effect: "Three enemies are drawn in, almost willingly" },
      { name: "Lingua", "hit%": 75, range: 2, uses: 1, type: "Poisoning", effect: "The enemy is poisoned by words alone, for 2 turns" },
    ],
    gray: [
      { name: "Gamble of the Gods", "hit%": 60, lck: 11, range: 1, uses: 1, type: "Damage", effect: "The gods of luck roll the dice" },
      { name: "Fortuna's Choice", "hit%": 75, mgk: -2, range: 4, uses: 1, type: "Radial", effect: "Any 3 units up to 4 spaces away are eligible for misfortune" },
      { name: "Plight of the Pagan", "hit%": 80, mgk: -1, range: 2, uses: 1, type: "Poisoning", effect: "A curse, damaging the enemy for 2 turns" },
    ],
    default: [],
  },

  // Mages additionally pick 3 of these 5 per weapon. (Effects deferred to phase 2; carried as data.)
  mageSpecialAbilities: {
    fire: [
      { name: "Bolster", turns: 2, range: 2, uses: 1, effect: "Pwr+", description: "Infuses ally weapon with flame, increasing power" },
      { name: "Ignite", turns: 2, range: 3, uses: 1, effect: "Brn", description: "Ignites an enemy leaving them burnt" },
      { name: "Wall Of Flame", turns: 1, range: 1, uses: 1, effect: "Wall", description: "Enemies who cross are burnt for 2 turns" },
      { name: "Spark", turns: 1, range: 1, uses: 1, effect: "Rflct", description: "Ally radiates sparks, damaging an attacking enemy" },
      { name: "Melt Armor", turns: 1, range: 1, uses: 1, effect: "Prc", description: "Melts enemy armor leaving them vulnerable" },
    ],
    water: [
      { name: "High Tide", turns: 1, range: 1, uses: 1, effect: "Wall", description: "Roaring water pushes three enemies back one space" },
      { name: "Liquify", turns: 2, range: 2, uses: 1, effect: "Eva+", description: "Liquifies the limbs of an ally, increasing evasiveness" },
      { name: "Hail", turns: 2, range: 3, uses: 1, effect: "Frz", description: "Hail buffets an enemy for 2 turns" },
      { name: "Propel", turns: 1, range: 1, uses: 1, effect: "Cnto", description: "Propels an ally, allowing them to move after acting" },
      { name: "Dessicate", turns: 1, range: 3, uses: 1, effect: "Blnd", description: "Blinds an enemy for a turn" },
    ],
    earth: [
      { name: "Stalagmite", turns: 1, range: 2, uses: 1, effect: "Wall", description: "Surrounds an ally in three directions" },
      { name: "Stone Skin", turns: 2, range: 2, uses: 1, effect: "Prt+", description: "Impregnates the skin with stone, increasing protection" },
      { name: "Weigh Down", turns: 1, range: 2, uses: 1, effect: "Pwr-", description: "Weakens an opponent's blows" },
      { name: "Burrow", turns: 1, range: 3, uses: 1, effect: "Swap", description: "Swap positions with an ally unit" },
      { name: "Bulwark", turns: 1, range: 1, uses: 1, effect: "Inv", description: "Leaves an ally invincible for a turn" },
    ],
    lightning: [
      { name: "Kinesia", turns: 1, range: 1, uses: 1, effect: "Brv", description: "Ally attacks twice in a row" },
      { name: "Haste", turns: 1, range: 1, uses: 1, effect: "Hst", description: "Ally attacks twice against any unit" },
      { name: "Charge", turns: 1, range: 1, uses: 1, effect: "Swft", description: "Ally attacks first in all interactions" },
      { name: "Attenuate", turns: 1, range: 1, uses: 1, effect: "Slw", description: "Slows an enemy unit" },
      { name: "Shock Wave", turns: 2, range: 3, uses: 1, effect: "Shck", description: "Damages an opponent over time" },
    ],
    grass: [
      { name: "Blossom", turns: 2, range: 2, uses: 1, effect: "Rgn", description: "An ally's health is restored over time" },
      { name: "Absorb", turns: 1, range: 1, uses: 1, effect: "Absrb", description: "Absorb a fraction of the damage dealt" },
      { name: "Thistle", turns: 2, range: 3, uses: 1, effect: "Psn", description: "Poisons an enemy over time" },
      { name: "Briar", turns: 1, range: 1, uses: 1, effect: "Wall", description: "A wall of thick vines blocks the path" },
      { name: "Rebirth", turns: 1, range: 1, uses: 1, effect: "Mrcy", description: "A death blow leaves an ally at 1 HP" },
    ],
    aether: [
      { name: "Continuum", turns: 1, range: 3, uses: 1, effect: "Prtl", description: "Opens a traversable portal" },
      { name: "Silence", turns: 1, range: 2, uses: 1, effect: "Slnc", description: "Silences an enemy for a turn" },
      { name: "Inertia", turns: 2, range: 3, uses: 1, effect: "Crsh", description: "Crushes an enemy for two turns" },
      { name: "Teleportation", turns: 1, range: 1, uses: 1, effect: "Cntr", description: "Counter attack from any range" },
      { name: "Dimension", turns: 1, range: 1, uses: 1, effect: "Time", description: "An ally acts again" },
    ],
    wind: [
      { name: "Wind Tunnel", turns: 1, range: 3, uses: 1, effect: "Prtl", description: "Creates a wind tunnel to traverse" },
      { name: "Head Wind", turns: 1, range: 2, uses: 1, effect: "Immob", description: "Disallows enemy movement" },
      { name: "Nimbus", turns: 1, range: 1, uses: 1, effect: "Cnto", description: "Move again after acting" },
      { name: "Tail Wind", turns: 2, range: 2, uses: 1, effect: "Mve+", description: "Increases movement by 1 for 2 turns" },
      { name: "Iron Gust", turns: 1, range: 1, uses: 1, effect: "Cntr", description: "Counter attack from any range" },
    ],
    light: [
      { name: "Sanctify", turns: 2, range: 2, uses: 1, effect: "Prt+", description: "Douses an ally in divine protection" },
      { name: "Holy Veil", turns: 1, range: 2, uses: 1, effect: "Invis", description: "Shrouds an ally from sight" },
      { name: "Regen", turns: 2, range: 2, uses: 1, effect: "Rgn", description: "Heals an ally over time" },
      { name: "Savior", turns: 1, range: 3, uses: 1, effect: "Swap", description: "Trades places with an ally" },
      { name: "Mercy", turns: 1, range: 1, uses: 1, effect: "Mrcy", description: "A killing blow leaves the ally with 1 HP" },
    ],
    dark: [
      { name: "Infundere", turns: 2, range: 2, uses: 1, effect: "Pwr+", description: "An ally's power increases" },
      { name: "Possessio", turns: 1, range: 1, uses: 1, effect: "Poss", description: "Causes an enemy to attack their allies" },
      { name: "Silentium", turns: 1, range: 2, uses: 1, effect: "Slnc", description: "Saps magical power from enemy mages" },
      { name: "Terebrare", turns: 1, range: 1, uses: 1, effect: "Prc", description: "Leaves an enemy defenseless" },
      { name: "Maledictio", turns: 1, range: 1, uses: 1, effect: "Curse", description: "All actions are blocked" },
    ],
    gray: [
      { name: "Boon of Fortuna", turns: 2, range: 2, uses: 1, effect: "Lck+", description: "Grants an ally a boon" },
      { name: "Fortuna's Shield", turns: 1, range: 1, uses: 1, effect: "Rflct", description: "Damage is reflected to the opponent" },
      { name: "Path of the One", turns: 1, range: 3, uses: 1, effect: "Prtl", description: "A path for allies to traverse" },
      { name: "Destiny's Exchange", turns: 1, range: 3, uses: 1, effect: "Swap", description: "Allies switch places" },
      { name: "Fortuna's Blessing", turns: 1, range: 1, uses: 1, effect: "Time", description: "Act again" },
    ],
    default: [],
  },
};

