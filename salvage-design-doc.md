# SALVAGE

*A miniatures game of competing zero-g salvage crews.*
*MVP design document. Working draft.*

---

## Overview

Salvage is a 2–4 player miniatures game in which competing crews of space salvagers race to extract value from drifting wrecks. Played on a 3×3 ft table over 6 rounds in 60–90 minutes, the game emphasizes Newtonian movement, EVA crew operations, and the spatial drama of tethers stretched between ships, crew, and cargo.

**Tone**: anime retro-futurism. Working-class crews, beat-up ships with character, dramatic silhouettes against orbital debris. Think Cowboy Bebop, Planetes, Outlaw Star.

**Core tensions**:
- Value vs. mass — the best loot is the hardest to move
- Speed vs. control — fast burns risk overshoot; slow approaches lose contested salvage
- Greed vs. survival — every crew lost to the void costs you VP
- Commitment vs. flexibility — tethers are powerful but tie up your anchors

---

## Components

### Per Player
- 1 ship miniature (~2"×3" base) and ship board
- 4 crew miniatures (~25mm base): 1 Cutter, 1 Grappler, 1 Breacher, 1 Hauler
- 4 crew character cards
- 5d6 (player color)
- 1 dice screen
- 4 tethers (string/ribbon, mix of Short and Medium)
- 1 ship-grade tow line (Long, load 5)
- Velocity arrow tokens (~10 sets of Short / Medium / Long; loose salvage can also need velocity arrows when Yanked or pushed)

### Shared
- 3–4 wreck pieces (irregular shapes, walkable terrain)
- 1–2 asteroid pieces (terrain, no salvage)
- Wreck role cards: 1 Jackpot, 1 Bait, 2 Mid
- Salvage tokens: ~12 Wreck Salvage, ~8 Premium Salvage, ~12 Scatter Debris
- Sealed compartment "hatch" markers
- Velocity arrow templates (master copies for measuring)
- Tether arc / swing measuring strings

---

## Setup

**Time**: 5–8 minutes for an experienced group.

### 1. Place Wrecks
For 4 players, use 4 wrecks. For 2–3 players, use 3 wrecks. Players alternate placing in turn order:
- First wreck near center
- Each subsequent wreck ≥8" from any other wreck and ≥4" from any table edge

### 2. Assign Wreck Roles (hidden)
Shuffle wreck role cards. Place one face-down beside each wreck. Players don't know which is which.

| Role | Wreck Salvage | Premium | Total VP |
|---|---|---|---|
| Jackpot | 3 | 2 | 12 |
| Mid | 3 | 1 | 9 |
| Bait | 3 | 0 | 6 |

**By player count:**
- 4 players: 1 Jackpot + 2 Mid + 1 Bait
- 3 players: 1 Jackpot + 1 Mid + 1 Bait
- 2 players: 1 Jackpot + 1 Mid + 1 Bait (3 wrecks; preserves the info game)

### 3. Populate Wrecks
Every wreck looks identical from outside:
- 3 face-down Wreck Salvage tokens at exterior slots
- 2 sealed compartments (hatch markers)
- Underneath each hatch, depending on the wreck's secret role:

| Role | Hatch 1 | Hatch 2 |
|---|---|---|
| Jackpot | Premium | Premium |
| Mid | shuffle 1 Premium + 1 Scatter face-down, place one under each hatch | (same shuffle) |
| Bait | empty | empty |

So Jackpot always gives Premium on Breach. Bait always gives nothing. Mid is a coin flip — half the time you Breach and find Premium (3 VP), half you find Scatter (1 VP).

### 4. Scatter Debris
Place ~12 face-down Debris tokens in open space between wrecks.
**Debris drift**: at the start of each Drift phase, roll 1d6 for direction (1=N, 2=NE, 3=SE, 4=S, 5=SW, 6=NW). All loose debris drifts Short distance that direction.

### 5. Place Asteroids (optional)
1–2 asteroids placed by group consensus to break sightlines or create cover.

### 6. Place Ships
In **reverse turn order** (last player picks first):
- Ship within 2" of a table edge
- ≥6" from any other ship
- Initial velocity: 0

### 7. Crew Loadout
Each player places their 4 crew inside their ship (Embarked). All start with full equipment kits (4 tethers, 1 ship-grade tow line — see Components).

---

## Round Structure

Each round has five phases.

### 1. Roll
Each player rolls 5d6 behind their dice screen.

**Rerolls**: After rolling, you may select up to N dice to reroll, where N = current round number. Round 1 = 0 rerolls. Round 6 = up to 6 dice (effectively all).

Rerolls are **commit-style**: select all dice to reroll *before* rolling them. Roll them simultaneously. Results are final. Each die can only be rerolled once per round.

### 2. Assign (hidden, simultaneous)
Each player places dice on slots:
- Their ship board (7 slots)
- Their crew character cards (1 role-locked slot per crew + generic slots)

A slot accepts at most one die. Dice with no legal placement are forfeit.

### 3. Reveal
All players drop screens at once. All assignments now public.

### 4. Resolve (I-go-you-go, by activation)
Turn order: **lowest score first**. Ties resolve in seating order. Round 1: seating order (everyone tied at 0).

On your turn, **activate one of your units** — a crew or your ship — that has dice assigned to it. Resolve all dice on that unit, in any order you choose. Then the next player activates one of their units. Continue around the table until no player has unactivated units with dice remaining.

**Implications:**
- A player who spread dice across 4 units gets 4 activations, but each is small
- A player who stacked dice on 1 unit gets 1 activation, but it's powerful
- The trailing player (lowest score) gets to act first each cycle — natural catch-up
- A unit cannot be re-activated once activated; all its dice resolve in that single window
- Units that become invalid before activation (Lost crew, etc.) lose their dice — those dice are forfeit, no replacement

### 5. Drift
All velocities resolve simultaneously. Tethered things swing (see Tether Swing). Debris drifts in the rolled direction. Auto-landings happen at point of contact.

---

## Movement System

### Velocity
Every ship and untethered crew has a velocity arrow indicating direction and speed.
- **Short / Medium / Long** are the three speed tiers
- **Max velocity = Long**; further thrust has no effect

### Velocity vs. Movement
**Actions modify velocity arrows. Movement happens during the Drift phase.** A Burn, Push Off, Thruster Burn, Yank, or Reel In updates a unit's velocity arrow but doesn't move it immediately. The unit moves during the next Drift phase along its updated arrow.

Exception: **Crawl** moves a crew along terrain immediately during their activation (no velocity gained).

This means velocities can stack across a round: if two players both apply velocity to the same loose salvage, both vectors add, and the piece drifts according to the sum.

### Burns (Vector Add)
Place a new thrust arrow tip-to-tail on the existing velocity. New velocity = origin of old arrow → tip of new arrow.
Burns produce arrows of varying length depending on the action and die.

### Drift Resolution
1. Lay the velocity arrow from current position
2. If the arrow's path crosses **terrain** → auto-land at contact, velocity = 0
3. If tethered and arrow exceeds tether reach → bend remainder along tether arc, place model at the end of the bent path, new velocity = tangent to arc at landing point
4. Otherwise → place model at arrow tip

**Drift phase order of operations:**
1. **Resolve by mass — biggest first.** Ships drift, then crew, then loose salvage. This means anchored/tethered things resolve relative to whatever's already moved.
2. For each unit in turn: apply velocity (lay arrow)
3. Check tether constraints (catches and swings — relative to anchor's *new* position if anchor already moved)
4. Check terrain landings
5. Check collisions (crew vs. crew, ship vs. ship, etc.)
6. Check off-table (Lost crew triggers here)

**Crew on a ship's hull move with the ship.** The hull is moving terrain. When the ship drifts, any crew standing on its hull (or anchor-swinging from it) goes along for the ride. Tether physics resolve relative to the ship's *new* position.

**Crew leaving a moving ship** inherit the ship's velocity plus their push-off impulse (vector add). A crew on a ship drifting east at Medium who pushes off west cancels out to roughly stationary.

**Terrain** = wrecks, asteroids, ship hulls. Loose salvage is *not* terrain — crew cannot auto-land on it. Loose salvage is collected only via Carry, Scavenge, or tethering.

**Tether swing cap**: cannot swing more than 180° around an anchor in one drift.

---

## Tethers

The core tactile mechanic. Physical strings on the table.

### Anchors
- Each crew: 1 harness anchor (one tether at a time)
- Each ship: 3 hull anchors
- Wrecks: anchored via self-tether or generic Rig Tether (see below). Wreck attachments are temporary — when the tether is removed, no permanent fixture remains.

### Load Ratings
- Default tether: load 3 (combined mass of all attached things)
- Hauler harness: load 4
- Ship-grade tow line: load 5
- Exceeding load → tether snaps at end of phase

This means any crew can haul Mass-1 (Scatter) or Mass-2 (Wreck) salvage on a personal tether (crew mass 1 + cargo mass 2 = 3, at capacity). Mass-3 Premium requires the Hauler's stronger harness, or a ship-grade tow line.

### Lengths
- Short (~3")
- Medium (~6")
- Long (~10")

### Self-Tether (free)
When a crew becomes adjacent to terrain, salvage, a ship anchor, or another crew, they may clip a tether between their harness and that thing. Free, folded into the move.

### Rig Tether (any crew, any die)
Generic action available to all crew. Create a tether between two adjacent non-self points within 1" of the rigging crew. Salvage-to-ship, crew-to-crew, ship-to-wreck — the network plays. Costs a die but no specialist required.

The rigging crew is not an endpoint — that's what self-tether is for. Rig Tether is specifically for connecting *other* things.

### Cutting Tethers
Cutter, 3+ die, adjacent only.
- **Slack tether cut**: tether removed; both ends maintain their current course
- **Taut tether cut**: both ends fly with their tangent velocity at moment of cut

### Tether Length Enforcement
A tether can only be rigged between endpoints currently within the tether's length of each other. A Short tether (~3") cannot span a 5" gap. Once rigged, normal physics apply (drift, taut, swing).

### Multiple Tethers, One Object
A tether anchored to a ship beats any number of crew or salvage on the other end — the salvage drifts toward the ship. If two ships are pulling opposite directions, the salvage stays still (deadlock). Crew-vs-crew tethers without a ship endpoint: salvage stays still (no one wins a crew-on-crew tug-of-war for MVP).

### Tethering Uncut Salvage
Legal. Tether activates the moment the salvage is cut from the wreck.

---

## Crew

### Roles (Role-Locked Actions)

| Role | Locked Action | Die | Effect |
|---|---|---|---|
| **Cutter** | Cut | 3+ | Sever salvage from wreck, OR sever a tether |
| **Grappler** | Grapple | 3+ | Fire grappling hook at target within 6"; choose Reel In, Yank, or Anchor Swing (see below) |
| **Breacher** | Breach | 5+ | Open sealed compartment on adjacent wreck (revealing contents — Premium, Scatter, or empty) OR Breach adjacent rival ship's hold. Opened wreck compartments stay visibly open — public info. |
| **Hauler** | Heavy Haul | any | Haul Mass-3 salvage along a tether (mechanically identical to Haul; the role unlocks the Mass-3 cap) |

Lose a specialist → that action is unavailable for the rest of the game.

### Grapple — Three Modes
The Grappler's hook fires up to 6" with line-of-sight. **Anything with mass blocks line of sight** — wrecks, asteroids, ships, crew, salvage, debris. Only empty space is shootable through. Choose one mode per Grapple action:

**Reel In**: The Grappler gains **Medium velocity** (~6") toward the hooked target (vector adds to her existing velocity). At max range, she'll usually arrive at or near the target during drift; from closer she may overshoot unless she has counter-velocity. Only the Grappler moves — the target stays put (whether it's terrain, ship, salvage, or crew).

**Yank**: The hooked target gains velocity toward the Grappler.
- **Mass-1 target**: target gets Short velocity toward Grappler. No recoil.
- **Mass-2 target**: target gets Short velocity toward Grappler. **Grappler also gains Short velocity toward the target's position** (Newton's third law) — *unless the Grappler is on terrain*, in which case the terrain absorbs the recoil and the Grappler doesn't move.
- **Mass-3 target**: cannot be Yanked (too heavy — Reel In instead).
- **Tethered targets cannot be Yanked** — the tether holds them. Reel In still works.
- **Ships cannot be Yanked**.
- **Yank is resistable** if the target is a rival's crew (see Resist).

**Anchor Swing**: Hook connects to terrain (wreck, asteroid, ship hull). Acts as a temporary tether for the rest of the round, with full swing physics. **The hook releases at the end of the Drift phase** — it holds through the swing, then lets go. The Grappler keeps her final post-swing velocity.

When anchored to a **ship hull**, the anchor point moves with the ship during drift (ships resolve before crew). The Grappler swings relative to the ship's new position — she effectively rides along while swinging.

### Stats
- Mass: 1 (all crew)
- Health: not tracked in MVP (no combat)
- Tether anchor: 1

### Generic Crew Actions
Any crew with a die assigned can perform:

| Action | Die | Effect |
|---|---|---|
| Crawl | any | Along terrain: 1–2 Short, 3–4 Medium, 5–6 Long |
| Push Off | 2+ | Leave terrain with Short velocity |
| Thruster Burn | 4+ | Add thrust: 4 Short, 5 Medium, 6 Long |
| Haul | any | Move yourself along a tether |
| Rig Tether | any | Create a tether between two adjacent non-self points (within 1" of you) |
| Scavenge | 1+ | Grab one debris in path or adjacent |
| Brace | any | Ignore one external force this round |
| Shove | any | Apply velocity to adjacent crew or salvage. Mass-1 = Long, Mass-2 = Medium, Mass-3 = Short. Ships, terrain, and stowed cargo unaffected. Resistable when target is a rival's crew. |
| Tackle | 3+ | Adjacent rival crew. Attempt to grab and dislodge. On success: rival drops carry (velocity 0), pulled off terrain if applicable, and both crew become **grappled together** sharing combined velocity (vector sum). Tackler-on-terrain may choose to stay anchored (rival held adjacent) or pull off (both drift). On resisted fail: tackler keeps current velocity, stays adjacent to rival, no other effect. Resistable. |
| Embark | any | Move from your own ship's hull to inside your own ship (safe, off-table). Cannot be performed on a rival ship. **If used mid-activation, any subsequent dice on this crew fizzle** — they're now off-table and unavailable. |

### Free Actions
- **Self-tether** (see Tethers)
- **Auto-land** when drift hits terrain

Free actions only trigger as part of a paid action — a crew with no dice gets no actions, free or otherwise.

### Grappled Crew (Tackle outcome)
When a Tackle succeeds, both crew become **grappled together** and remain so until separated. Grappled crew:

- Share the same position (placed adjacent, treated as paired)
- Drift along their combined velocity (vector sum of both crews' velocities at the moment of grab)
- Cannot perform any action **except Push Off or Thruster Burn**
- Either crew using Push Off or Thruster Burn breaks the grapple — they separate, the action's velocity applies to that crew normally

If the tackler stayed anchored (chose not to pull off terrain): the rival is held adjacent to the tackler on the terrain, neither drifting. The rival can still attempt Push Off / Thruster Burn to break free.

### Resist (interrupt)
When a rival targets one of your crew with a Shove, Tackle, or Yank, you may interrupt their activation and spend a die to resist.

**Resist eligibility:**
- Resist only triggers when the *target* is one of your crew. Loose salvage, debris, or your own crew being friendly-Shoved cannot be resisted.
- The resist die must come from the **targeted crew's own assigned dice** — they defend themselves with their own pool. Other crew cannot lend dice. This means a crew with no assigned dice cannot resist.
- The resist die must be **unspent** (not yet used for an action this round).

**Mechanics:**
- **Resist die value must be > attacker's die value.** Ties go to the attacker.
- If successful: the targeting action fizzles, no effect.
- If failed (your die value isn't high enough): your die is *still spent*, and the action proceeds normally.
- No limit per round per crew — a crew can resist multiple times if they have dice available.

A resisting crew is *not* activating; they're just reacting. Dice spent on resist do not perform their assigned action.

This means hidden assignment matters in two ways: opponents don't know what dice your crew has to resist with *and* you must commit to assigning dice to crew you want to be defensible. A crew you sent out with no dice is a sitting duck.

### Lost Crew
A crew is Lost if at any point they:
- Drift off the table edge (Lost immediately when their base fully clears the edge — removed from play, **−1 VP locked in**), OR
- End the game (after round 6 drift) untethered, off terrain, and not on a ship hull

Each Lost crew = **−1 VP**. Once Lost, a crew cannot be recovered.

---

## Ships

### MVP Ship (symmetric)
Every player's ship is identical for first prototype.

- Base size: ~2"×3"
- 3 hull anchors
- Hold capacity: 6 mass total
- Burn templates: standard Short / Medium / Long

### Ship Slots (7 total)
Slots live on your ship board. One die each per round.

| Slot | Die | Effect |
|---|---|---|
| Burn (small) | 3+ | Add Short thrust arrow to ship velocity |
| Burn (big) | 5+ | Add Medium thrust arrow |
| Burn (max) | 6 | Add Long thrust arrow |
| Launch | any | Deploy a crew from inside the ship to adjacent space with a Short velocity in a chosen direction |
| Recall | any | A crew tethered directly to one of your ship's hull anchors is reeled fully to the ship hull. Tether must hold (load OK). Does not work on crew tethered to wrecks, salvage, or other crew. |
| Stow | any | Move a salvage piece adjacent to your ship into the cargo hold. May declare cargo to eject before resolving (committed). Fizzles if no piece in range or hold still lacks capacity after declared ejection. |
| Scan | 1+ | Reveal one face-down element within 4" of the ship: an exterior salvage token, OR the contents of a sealed compartment (without Breaching) |

### Hold & Mass Penalty
- Hold accepts any combination of salvage up to 6 mass
- 0–2 mass aboard: full burns
- 3–5 mass: burns drop one step (Long → Medium, etc.)
- 6 mass: burns drop two steps
- "Burns drop a step" applies to all of small/big/max

### Ship Boarding & Theft
Crew can land on any ship's hull (own or rival's). The hull is terrain. From there:
- Crawl along the hull
- Cut tethers attached to that ship
- Self-tether to the ship's anchors (own ship only — rival ships don't grant anchor access)
- Push off the hull
- **Breach the hold** (Breacher only, 5+ die) — see below

**Theft via Breach + Stow:**
A Breacher adjacent to a rival ship can Breach the hold (5+ die). The rival shuffles their stowed salvage face-down; one random piece is drawn and placed adjacent to the rival ship at the breach point. The hold reseals after the spill. If the rival's hold is empty, the action fizzles (die spent).

The spilled piece is now loose salvage. To bring it home, your crew must tether to it, move it adjacent to your own ship, and Stow it (any die). The original owner can re-tether and re-Stow it themselves if they're closer.

This means theft is a multi-round operation: Breach → reposition → Stow. No new actions needed; existing verbs handle the whole chain.

### Future: Asymmetric Ship Classes (Phase 2)
Three planned classes drop into the symmetric framework:
- **Komet** (Cutter Class): +1 anchor, occasional Boost Burn, smaller hold
- **Hoshimaru** (Hauler Class): +1 heavy hold, built-in tow line, shorter burns
- **Yurei** (Scout Class): better Scan, Predict slot, fewer anchors

---

## Salvage

### Categories

| Type | VP | Mass | Where | How to Get |
|---|---|---|---|---|
| Scatter Debris | 1 | 1 | Open space, drifts | Scavenge or fly through |
| Wreck Salvage | 2 | 2 | Wreck exteriors | Cut → tether/haul |
| Premium Salvage | 3 | 3 | Sealed compartments | Breach → Cut → tether/haul |

### Salvage Field at Setup (4-player game)
- 1 Jackpot Wreck: 3 Wreck (6 VP) + 2 Premium (6 VP) = 12 VP
- 2 Mid Wrecks: 3 Wreck + 1 Premium = 9 VP each
- 1 Bait Wreck: 3 Wreck = 6 VP
- ~12 Debris pieces: 12 VP

**Total ~48 VP on table.** A typical winner claims 6–10 VP.

### Hauling Salvage
There are three ways to move salvage:

- **Tethered to crew**: clip salvage to harness, Haul along tether or wait for ship to drag. Crew remains free to take other actions. Vulnerable to Cut.
- **Tethered to ship**: anchor on hull, ship drags or crew Hauls along. Higher load capacity via tow line. Uses a hull anchor.
- **Carried**: crew physically holds the piece. See Carrying.

Once a salvage piece is within 1" of your ship's hull, spend a **Stow** action (any die, ship slot) to load it into the cargo hold. Resolves immediately when the die plays — if the piece isn't within 1" at that moment, the action fizzles. Crew presence not required — Stow represents the ship's loading systems.

**Hold capacity & swapping:** If the hold lacks capacity for the new piece, you may **declare ejected pieces before Stow resolves** to make room. You can eject one or more pieces from the hold (your choice). Ejected pieces are placed adjacent to the ship at velocity 0, becoming loose salvage. Then the new piece is Stowed. The decision to eject is committed *before* the Stow resolves — if the incoming piece moves out of range or is otherwise lost mid-resolve, your ejected pieces are still ejected. Real risk.

If you don't declare ejection and the hold lacks capacity, the Stow fizzles.

**Stow severs any external tethers attached to the piece.** It doesn't matter whose tether or where it's anchored — once Stowed, the piece is in your hold and any lines snap or detach. (Implication: tethering your salvage to a rival's ship is a bad idea — they can Stow it.)

**Cut salvage starts at velocity 0.** When salvage is first severed from a wreck, it has no velocity. It only gains velocity through tether-pull, Yank, push from collision, or being carried.

### Carrying
A crew can pick up an adjacent salvage piece without using a tether (free, folded into a movement action). While carrying:

- The carried piece is placed adjacent to the crew's base for table clarity (it represents being held, not occupying its own space)
- The salvage moves with the crew, sharing their velocity, landings, and collisions — when the crew auto-lands on terrain, the piece lands with them, still adjacent
- The crew can perform **Crawl, Push Off, and Thruster Burn only** — no other actions
- **Mass cap and count**:
  - Regular crew: 1 Mass-1 piece (only)
  - Hauler: 1 Mass-2 piece, OR up to 2 Mass-1 pieces (total carry-mass cap of 2)
  - **Mass-3 cannot be carried by anyone** — it requires a tether
- **Drop** a carried piece as a free action: it's now loose at the crew's position with the crew's current velocity

---

## Collisions

| Moving | Hits | Result |
|---|---|---|
| Crew | Wreck/asteroid | Lands, velocity = 0 |
| Crew | Loose salvage | Pass through (grab if Carry/Scavenge taken this round) |
| Crew | Debris (Scatter) | Pass through (grab if Scavenge spent) |
| Crew | Own crew | Both stop, adjacent |
| Crew | Rival crew | Both stop at half velocity, adjacent |
| Crew | Own ship | Lands on hull, velocity = 0 |
| Crew | Rival ship | Lands on hull (boarding) |
| Loose salvage | Anything | Stops on contact, adjacent to whatever it hit |
| Ship | Wreck/asteroid | Stops at contact, velocity = 0 |
| Ship | Loose salvage | Salvage stops at hull (Stowable next round) |
| Ship | Debris | Debris destroyed, ship continues |
| Ship | Other ship | Both stop at contact, velocity = 0 |

Collision resolves only at the endpoint of a drift. Fly-bys are legal — momentum carries through.

---

## Scoring (End of Round 6)

The game ends after round 6's drift phase. No extension, no final-dash mechanic — round 6 plays out normally and then scoring happens.

Count VP:
- **+VP** for each salvage piece in your hold (Scatter 1, Wreck 2, Premium 3)
- **−1 VP** per Lost crew

**Highest score wins.** Ties broken by most salvage pieces stowed.

**Stowed cargo is mostly permanent.** Once a salvage piece is in your hold, it can only be removed by:
- A rival's Breach + theft chain
- Voluntary ejection during a Stow action (to make room for new cargo — committed before that Stow resolves)

Players cannot otherwise unstow cargo for any reason.

---

## Quick Reference (Rules Edge Cases)

- Dice values fixed once rolled (subject to round-N reroll allowance at start of round; commit-style, each die rerolls at most once per round).
- **Adjacency = base-to-base, within 1"**.
- **Terrain = wrecks, asteroids, ship hulls only**. Loose salvage is not terrain.
- **Actions modify velocity; drift moves things.** Crawl is the only action that moves a model immediately.
- **Drift order: by mass, biggest first** — ships, then crew, then loose salvage.
- **Crew on a ship's hull move with the ship.** Crew leaving a moving ship inherit its velocity plus push-off impulse.
- Dice with no legal placement at assign time are forfeit.
- A die placed on an action that becomes invalid at resolve time (target gone, crew Lost) fizzles. Die is spent.
- **Lost units lose all assigned dice** when activated — those dice are forfeit, not redistributed.
- **Free actions (self-tether, auto-land, carry/drop) require a triggering paid action.** A crew with no dice gets no actions, free or otherwise.
- **A player passes their turn** if they have no unactivated units with dice. The round ends when no player has any.
- **Resist** uses the targeted crew's own unspent assigned dice. Triggers only when a rival's action targets your crew.
- Wrecks and asteroids do not drift in MVP. Debris and loose salvage drift if they have velocity.
- Two crew can both be tethered to the same uncut salvage. When cut, ship-anchored tethers always win the pull; otherwise see Multiple Tethers rule.
- Multiple players can target the same object with their own dice (e.g., two Cutters cutting the same wreck) — slots are personal, not shared.
- Tethers can only be rigged between endpoints currently within the tether's length.
- **Line of sight** (for Grapple): anything with mass blocks LoS — wrecks, asteroids, ships, crew, salvage, debris. Only empty space and tethers are see-through.
- **Stow severs any external tethers on the Stowed piece.**
- **Cut salvage starts at velocity 0.**
- **Stow fizzles if the hold lacks capacity for the piece's mass** — but you may declare cargo to eject before Stow resolves to make room (committed choice).
- **Shove cannot target stowed cargo or anything inside a hold.**

---

## Cut from MVP (Phase 2 ideas)

Filed for after the core game proves out:

- EVA combat and crew health
- Ship damage and Repair action
- Special salvage with effects (working thrusters, encrypted data cores, fugitives in cryo)
- Asymmetric ship classes (Komet, Hoshimaru, Yurei)
- Environmental hazards (gravity wells, debris storms, patrols)
- Variable scenario cards
- Upgrade economy
- End-of-game trigger (e.g., final-round dash bonus)
- Tumbling wrecks (one wreck per game with drift, more VP)
- Hazardous asteroids (sightline blocking for Scan, slowing fields)
- Crew skill cards / individual personality
- Objective cards (e.g., type-based scoring bonuses)

---

## Design Philosophy

A few principles to refer back to when adding or cutting features:

1. **The table is the rulebook.** If a tether is taut, you see it. If a ship is parked, it's parked. Mechanics that require hidden state or memory should be rare.

2. **Every die should hurt to spend.** 5 dice across 7+ slots means you always leave capability unused. The puzzle is in what you give up, not what you do.

3. **Movement before scoring.** If positioning isn't interesting, the salvage doesn't matter. Newtonian drift, tethers, and slingshots are the engine.

4. **Drama over balance.** A cut tether at the wrong moment ruining someone's run is a feature. Stories beat fairness.

5. **MVP is a question, not a product.** Each cut is a hypothesis: "we don't need this." If playtest proves we do, it goes back in.
