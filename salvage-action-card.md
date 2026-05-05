# SALVAGE — Action Reference Card

*MVP draft. 2–4 players. 6 rounds.*

---

## Round Sequence

1. **Roll** — each player rolls 5d6 behind their screen. Then commit up to N dice to reroll (N = round number; round 1 = 0, round 6 = 6). All rerolls happen at once. Final.
2. **Assign** — hidden, simultaneously, place dice on slots on your ship board and crew cards
3. **Reveal** — all players drop screens at once
4. **Resolve** — I-go-you-go by **unit activation**, lowest score first (ties → seating order). On your turn, activate one of your units (crew or ship) and resolve all of its assigned dice in any order. Next player activates a unit. Continue until no player has unactivated units with dice. Lost units lose their assigned dice.
5. **Drift** — all velocities resolve simultaneously. Tethered things swing.

---

## Ship Slots

Slots live on your ship board. One die each per round.

| Slot | Die | Effect |
|---|---|---|
| Burn (small) | 3+ | Add Short thrust arrow to ship velocity |
| Burn (big) | 5+ | Add Medium thrust arrow |
| Burn (max) | 6 | Add Long thrust arrow |
| Launch | any | Deploy a crew from inside the ship to adjacent space with a Short velocity in a chosen direction |
| Recall | any | Crew tethered directly to your ship's hull anchor is reeled to the ship. Tether must hold. Ship-anchored tethers only — wreck/crew/salvage tethers don't qualify. |
| Stow | any | Move salvage within 1" of any hull point into the cargo hold. May declare cargo to eject (committed before resolve) to make room — ejected pieces placed adjacent at velocity 0. Fizzles if not in range or hold still lacks capacity. |
| Scan | 1+ | Reveal one face-down element within 4": exterior salvage, OR contents of a sealed compartment (without Breaching) |

---

## Crew Slots

Each crew has one role-locked slot. All crew share the generic action slots below.

### Role-Locked

| Role | Slot | Die | Effect |
|---|---|---|---|
| Cutter | Cut | 3+ | Sever a salvage piece from a wreck (now loose), OR sever a tether (adjacent only) |
| Grappler | Grapple | 3+ | Fire hook within 6" line-of-sight (anything with mass blocks). Reel In (Grappler gains Medium velocity toward target), Yank (target moves toward Grappler; Mass-2 = recoil; no Mass-3, no ships, no tethered; resistable on rival crew), or Anchor Swing (temporary tether to terrain, releases at end of drift) |
| Breacher | Breach | 5+ | Open sealed compartment on adjacent wreck (reveals Premium, Scatter, or empty — opened compartments stay publicly visible), OR Breach adjacent rival ship's hold (spill 1 random stowed piece adjacent to ship; hold reseals) |
| Hauler | Heavy Haul | any | Haul Mass-3 salvage along a tether (other crew can't haul Mass-3) |

If a role-specialist is Lost, those actions are unavailable for the rest of the game.

### Generic Crew Actions

Available to any crew with a die assigned.

| Slot | Die | Effect |
|---|---|---|
| Crawl | any | Move along terrain. 1–2 = Short, 3–4 = Medium, 5–6 = Long |
| Push Off | 2+ | Leave terrain with Short velocity in chosen direction |
| Thruster Burn | 4+ | Add thrust to existing velocity. 4=Short, 5=Medium, 6=Long |
| Haul | any | Move yourself along a tether (Mass-1 or Mass-2 salvage; Hauler needed for Mass-3) |
| Rig Tether | any | Create a tether between two adjacent non-self points within 1" of you |
| Scavenge | 1+ | Grab one debris token your crew passes through this drift, OR an adjacent debris token |
| Brace | any | Ignore one external force this round |
| Shove | any | Apply velocity to adjacent crew or salvage. Mass-1=Long, Mass-2=Med, Mass-3=Short. Stowed cargo unaffected. Resistable when target is rival crew. |
| Tackle | 3+ | Adjacent rival crew. Grab attempt. On success: rival drops carry (vel 0), pulled off terrain if applicable, both crew **grappled together** with combined velocity. Tackler-on-terrain: choose stay anchored or pull off. On resisted fail: tackler stays adjacent, keeps velocity, no effect. Resistable. |
| Embark | any | Move from your own ship's hull to inside your own ship (off-table). Own ship only. Mid-activation: subsequent dice on this crew fizzle. |

### Free Actions (no die)

- **Self-tether** — when a crew becomes adjacent to terrain, salvage, a ship anchor, or another crew, they may clip a tether between their harness and that thing as part of the move.
- **Auto-land** — drifting crew whose vector intersects terrain land at point of contact, velocity = 0.
- **Carry / Drop** — crew can pick up an adjacent salvage piece (no die, folded into a movement action). While carrying, only Crawl / Push Off / Thruster Burn are legal. Cap: regular crew 1× Mass-1; Hauler 1× Mass-2 OR 2× Mass-1. Mass-3 cannot be carried. Drop is free.

### Resist (interrupt)

When a rival targets your crew with **Shove, Tackle, or Yank**, the targeted crew may spend an unspent die from their own pool to resist.

- **Resist die must be > attacker's die value.** Ties go to attacker.
- Success: action fizzles. Failure: die spent anyway, action proceeds.
- Crew with no assigned dice cannot resist.
- Only rival-targeted-at-your-crew triggers resist. Friendly Shoves, salvage targets, etc. — no resist.
- Dice spent on resist do not perform their assigned action.

### Grappled Crew (Tackle outcome)

Two crew grappled together share position and velocity. They can only Push Off or Thruster Burn — using either action breaks the grapple, applying velocity normally to the acting crew.

---

## Movement & Drift

**Velocity arrows**: Short / Medium / Long printed templates. Max velocity = Long.

**Vector add**: place new thrust arrow tip-to-tail on existing velocity. Resulting velocity = old origin to new tip.

**Drift phase**:
- Lay velocity arrow from current position; place model at tip
- If arrow hits terrain → auto-land at contact, velocity = 0
- If tethered and arrow exceeds tether reach → bend remainder along tether arc, place model at end, new velocity = tangent at landing
- Tether swing capped at 180° per round

---

## Tethers

- 1 harness anchor per crew (one tether at a time)
- 3 hull anchors per ship
- Default tether load = 2 (mass total of attached things)
- Hauler harness load = 3
- Ship-grade tow line load = 4
- Tether lengths: Short (~3"), Medium (~6"), Long (~10")

**Cut tether (taut)**: both ends fly with their tangent velocity at moment of cut.
**Multiple tethers on one cut salvage**: tug-of-war; salvage drifts toward heavier net pull.
**Tethering uncut salvage**: legal; tether activates when salvage is cut.

---

## Salvage

| Type | VP | Mass | Where |
|---|---|---|---|
| Scatter Debris | 1 | 1 | Open space, drifts |
| Wreck Salvage | 2 | 2 | Wreck exteriors, must be Cut |
| Premium Salvage | 3 | 3 | Sealed compartments, must be Breached then Cut |

**Hold capacity**: 6 mass total per ship. Mix freely.
**Mass penalty on burns**: 3+ mass aboard → burns drop one step. 6 mass → drop two steps.

---

## Collisions

| Moving | Hits | Result |
|---|---|---|
| Crew | Wreck/asteroid | Lands, velocity = 0 |
| Crew | Debris | Pass through (grab if Scavenge spent) |
| Crew | Own crew | Both stop, adjacent |
| Crew | Rival crew | Both stop at half velocity, adjacent |
| Crew | Own ship | Lands on hull, velocity = 0 |
| Crew | Rival ship | Lands on hull (boarding) |
| Ship | Wreck/asteroid | Stops at contact, velocity = 0 |
| Ship | Debris | Debris destroyed, ship continues |
| Ship | Other ship | Both stop at contact, velocity = 0 |

Fly-bys are fine — collision only resolves at endpoint of drift.

---

## Scoring (end of round 6)

Game ends after round 6 drift. Then:

- Sum VP of salvage in your hold
- **−1 VP per Lost crew** (untethered, off terrain, off ship, or off table)

Highest score wins. Ties: most salvage pieces stowed.

Stowed cargo is mostly permanent — only removable via rival theft or voluntary ejection during a Stow action.

---

## Quick Rules

- Dice values fixed once rolled (commit-style reroll at start of round; each die rerolls at most once).
- **Adjacency = base-to-base, within 1"**.
- **Terrain = wrecks, asteroids, ship hulls only**. Loose salvage is not terrain.
- **Actions modify velocity; drift moves things.** Crawl is the exception — it moves immediately.
- **Drift resolves by mass, biggest first**: ships, then crew, then loose salvage.
- **Crew on a moving ship's hull move with the ship.** Leaving a moving ship: inherit its velocity + push-off.
- Dice with no legal placement are forfeit. Lost units lose any dice assigned to them.
- A failed action (target gone, crew dead) fizzles; die is spent.
- A player passes when they have no unactivated units with dice.
- **Resist** uses the targeted crew's own unspent dice; only triggers when rival targets your crew.
- Wrecks don't drift. Debris drifts (one direction per round, rolled at drift phase, Short distance).
- Tethers must fit between endpoints when rigged.
- **Line of sight (for Grapple)**: anything with mass blocks. Only empty space is see-through.
- Ship-anchored tethers win all tugs of war.
- **Stow severs any external tethers; may eject cargo to make room (committed before resolve).**
- **Shove can't target stowed cargo.**
- **Cut salvage starts at velocity 0.**
