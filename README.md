# ColorsV3

A mobile, turn‑based, multiplayer team‑battler — a ground‑up rebuild of ColorsV2.

- **Backend:** Node + Express (REST) + **Socket.io** (real‑time battle) + **SQLite** (`better-sqlite3`, zero‑config).
- **Frontend:** **Expo / React Native** (runs on iOS, Android, and web).
- **Combat is server‑authoritative** — the server resolves every attack so clients can't desync or cheat.

The combat math, stat caps, weapon data, and team rules are ported faithfully from ColorsV2
(see "Game rules" below for the exact formulas).

---

## Project layout

```
ColorsV3/
├── backend/
│   ├── server.js        Express REST + Socket.io battle server
│   ├── db.js            SQLite schema + queries (users, teams, characters)
│   ├── weaponsData.js   16 weapons, 72 weapon abilities, 50 mage specials (CommonJS)
│   ├── combat.js        Stat model + the A1/D1/A2/D2 exchange (authoritative)
│   └── test/            combat.test.js (unit) + integration.js (two-client e2e)
└── frontend/
    ├── App.js           Navigation + auth gate
    └── src/
        ├── config.js    ← set your backend URL here
        ├── api.js       REST helpers + shared socket
        ├── data/weaponsData.js   ESM copy of the weapon data (for creation UI)
        ├── logic/combat.js       ESM mirror of the stat math (for previews only)
        └── screens/     Login, Register, Home, TeamList, TeamView,
                         CharCreation, BattleLobby, Battle
```

---

## Running it

### 1. Backend

```bash
cd backend
npm install
npm start            # listens on http://localhost:4000
```

Useful checks:

```bash
npm test             # combat engine unit tests (no server needed)
npm run test:e2e     # full 2-player battle over sockets (start the server first)
```

The SQLite database (`backend/colorsv3.db`) is created automatically on first run.

### 2. Frontend

```bash
cd frontend
npm install
npm start            # Expo dev server — press i (iOS), a (Android), or w (web)
```

**Point the app at your backend** by editing `frontend/src/config.js`:

| Where you run the app          | `BACKEND_URL`                       |
| ------------------------------ | ----------------------------------- |
| iOS simulator / web on the Mac | `http://localhost:4000`             |
| Android emulator               | `http://10.0.2.2:4000`              |
| Physical phone (Expo Go)       | `http://<your-Mac-LAN-IP>:4000`     |

For a physical phone, find your IP with `ipconfig getifaddr en0`; the phone and
computer must share the same Wi‑Fi. To play head‑to‑head, run the app on two
devices/simulators (both pointed at the same backend), register two accounts,
host on one, and join with the code on the other.

---

## How to play

1. **Register / Log in.** Usernames are unique (case‑insensitive); passwords are bcrypt‑hashed.
2. **Build a team** of 6 characters. The roster must contain **one size 4, two size 3,
   two size 2, one size 1**, and at most **2 mages**.
3. **Create each character:** pick type (melee/mage), size, weapon, allocate stats
   (70‑point cap), choose **2 weapon abilities**; mages also choose **3 special abilities**.
4. **Battle → pick a completed team → Host or Join.** The host gets a 4‑character code;
   the joiner enters it. When both are in, the server randomly picks who goes first.
5. **On the board** (6×8): your team sits on the bottom, the opponent mirrored on top.
   Tap one of your units to select it, tap a highlighted cell to **move**, or tap a
   red enemy in range to **attack**. End your turn when done. Eliminate the whole
   enemy team to win.

---

## Game rules & combat math (ported from ColorsV2)

**Stats** (9): Health, Strength, Defense, Magick, Resistance, Speed, Skill, Knowledge, Luck.
Each starts at 4, caps at 12 (Health uncapped), **70 points total per character**.

**Size modifiers** — applied on top of allocated stats:

| Size | Effects                                   |
| ---- | ----------------------------------------- |
| 1    | +1 agility, +1 evasion, −2 accuracy       |
| 2    | +2 evasion, −1 power                       |
| 3    | +1 power, −2 evasion                       |
| 4    | +2 accuracy, +1 power, −1 agility          |

**Weapon‑type multipliers** — axe/fire ×1.5 power · sword/water ×1.5 evasion ·
dagger/lightning ×1.5 agility · lance/earth ×1.5 protection · bow/aether ×1.5 accuracy ·
wind ×1.25 acc & eva · light ×1.25 prot & acc · dark ×1.25 power & prot · gauntlets/gray ×1.5 luck.

**Derived stats** (`spd/skl/knl/lck` already include weapon + ability mods; `adjLck = lck × luckMult`):

```
power      = (base_power + sizePower) × powerMult           // mage uses magick, melee uses strength
protection = (defense|resistance) × protMult                // melee→defense, magic→resistance
accuracy   = ceil(0.5·spd + 0.5·skl + 1·knl + 0.5·adjLck) × accMult + sizeAcc
evasion    = ceil(0.5·spd + 1·skl + 0.5·knl + 0.5·adjLck) × evaMult + sizeEva
critical   = ceil(0.5·spd + 0.5·skl + 0.5·knl + 1·adjLck)
block      = defense + resistance + adjLck
```

**A strike** (attacker → defender):

```
damage   = max(0, round(power − protection))                // protection = magic if attacker is a mage, else melee
hit%     = clamp(0..100, round(weapon_or_ability_hit% + (accuracy − evasion)))
block%   = max(0, floor(defender.block − attacker.accuracy))
crit%    = max(0, round(attacker.critical − defender.luck))  // crit → ×1.5 damage
```

Roll order per strike: miss check → block check → crit check → normal hit.

**The exchange:** `A1 → D1 → A2 → D2` — attacker, defender, attacker, defender — stopping the
instant anyone reaches 0 HP. The **defender only counters if it can reach the attacker**
with its own weapon range.

**Range & movement** — board distance is **Manhattan (no diagonals)**. Attack range is the
weapon's range, or the ability's range when an ability is used (bow 2, some abilities reach 3–4).
Default movement is **5 (melee) / 4 (mage)**, +1 for the Wind weapon.

---

## Notes / deviations from V2

- **Movement is real in V3.** V2 stored a `move_value` but pieces never actually moved on the
  board; here you move units within their move range each turn.
- **Crit applies damage.** V2 computed a crit chance but only displayed it; V3 applies a ×1.5
  multiplier on a crit roll.
- **Bow base range is 2** (V2 had 1) so "ranged weapons" are meaningful, per the design intent.
- **Ability *effects* are phase 2.** Weapons and abilities currently act as stat / hit% / range
  modifiers (the core engine). Status effects — burn, freeze, walls, reflect, pierce‑armor,
  multi‑turn buffs, mage‑special effects — are carried in the data (`weaponsData.js`) and ready
  to wire up next, but are not yet applied during combat. Mage specials are stored on characters
  but are not yet selectable as attacks.

---

## Tech reference

REST: `/register`, `/login`, `/teams`, `/teams/:id/characters`, `/characters/:id`, `/gamedata`, `/ping`.
Socket events: `host`, `join` → `battleStart`; then `move`, `attack` (→ `attackResult`), `endTurn`,
`leaveRoom`; server pushes `state` after every change.
