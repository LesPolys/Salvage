# SALVAGE — Digital Implementation Spec

*Target: Claude Code agent. Goal: a playable digital testbed that faithfully implements the tabletop design and supports rapid iteration on rules.*

This document is a granular technical brief. It assumes the reader has access to the parallel tabletop design doc (`salvage-design-doc.md`) for full rules. This document focuses on how to translate those rules into code.

---

## 0. Goals & Non-Goals

### Goals
- Faithfully implement the tabletop ruleset so we can validate the design
- Enable rapid iteration on rules — config-driven where possible
- Support hot-seat (multiple humans on one machine) and human-vs-AI play
- Provide debug tooling for designers (rewind, force outcomes, view hidden state)
- Log structured telemetry for post-game analysis and AI tuning
- Look polished — stylized low-poly anime aesthetic with smooth animations

### Non-Goals (this version)
- Network multiplayer
- Mobile/touch UI (desktop-first, mouse + keyboard)
- VR / 3D-headset support
- Automatic balancing / ML-driven AI training
- Full character/lore content (use placeholder names)

---

## 1. Tech Stack

### Required
- **Language**: TypeScript (strict mode)
- **Framework**: React for UI panels, Three.js for the 3D playfield
- **Bundler**: Vite
- **State management**: Zustand (lightweight, plays well with React + non-React code)
- **3D models**: glTF 2.0 (low-poly, hand-authored or generated)
- **Persistence**: JSON files saved to filesystem (Electron) OR LocalStorage + downloadable JSON (browser)
- **Testing**: Vitest for unit tests (rules engine especially)

### Recommended
- **Animation**: Three.js built-in tweens, or `@tweenjs/tween.js` for chained animations
- **Math**: `gl-matrix` for vector ops or use Three.js's `Vector3`
- **UI components**: Radix UI primitives (accessible, headless)
- **Styling**: Tailwind CSS

### Project structure
```
src/
  engine/           # pure rules engine, no rendering, fully testable
    state.ts        # GameState type and reducers
    actions.ts      # action definitions and validators
    drift.ts        # drift phase resolution
    physics.ts      # vector ops, tether physics, line-of-sight
    rng.ts          # seedable PRNG for reproducibility
    setup.ts        # game setup procedures
    scoring.ts      # end-of-game scoring
  ai/
    base.ts         # interface for AI players
    aggressive.ts   # personality 1
    cautious.ts     # personality 2
    opportunistic.ts # personality 3
    heuristics.ts   # shared evaluation functions
  ui/
    components/     # React components
    scene/          # Three.js scene management
    input/          # mouse handlers, drag interactions
    audio/          # sound effects (optional, low priority)
  config/
    rules.ts        # tunable constants (tether loads, velocities, etc.)
    salvage.ts      # salvage definitions
    crews.ts        # role definitions
  telemetry/
    logger.ts       # action log
    export.ts       # JSON export
  persistence/
    save.ts
    replay.ts
  main.tsx
```

The `engine/` directory must be **rendering-free** — no DOM, no Three.js. This makes it easy to:
- Run unit tests
- Run AI vs. AI matches headless for telemetry
- Swap in alternative renderers later

---

## 2. Core Data Model

### Coordinate system
- The playfield is a flat plane: **3 ft × 3 ft** mapped to **36 × 36 world units** (1 unit = 1 inch)
- Origin at the center of the field; x and z are horizontal, y is vertical (height-of-camera only, no gameplay y)
- All gameplay happens in the **xz plane**. Y is purely for visual depth/parallax effects on UI

### Game state (top-level)

```typescript
interface GameState {
  meta: {
    seed: string;             // for reproducibility
    round: number;            // 1-6
    phase: Phase;             // "roll" | "assign" | "reveal" | "resolve" | "drift" | "scoring" | "gameover"
    activePlayerId: string;   // whose activation
    turnOrder: string[];      // ordered by score ascending
  };
  players: Record<string, Player>;
  table: {
    wrecks: Wreck[];
    asteroids: Asteroid[];
    looseSalvage: Salvage[];      // anything not stowed and not attached
    debris: DebrisToken[];        // distinct from looseSalvage; has its own drift
    debrisDriftDirection?: Direction; // rolled at start of each drift phase
  };
  tethers: Tether[];
  pendingActions: PendingAction[];   // assigned but not yet resolved
  velocityMap: Record<EntityId, Velocity>;  // every entity with a velocity
  history: HistoryEntry[];           // for replay/telemetry
}

type Phase = "roll" | "assign" | "reveal" | "resolve" | "drift" | "scoring" | "gameover";
type Direction = "N" | "NE" | "SE" | "S" | "SW" | "NW";
type EntityId = string; // UUID
```

### Player

```typescript
interface Player {
  id: string;
  name: string;
  isAI: boolean;
  aiPersonality?: "aggressive" | "cautious" | "opportunistic";
  color: string;                    // hex
  ship: Ship;
  crews: Record<string, Crew>;      // 4 crew, keyed by role
  dice: Die[];                      // 5d6 with state
  rerollsRemaining: number;         // = round number at start
  score: number;                    // cached, recomputed on stow/loss
}

interface Die {
  id: string;
  value: 1 | 2 | 3 | 4 | 5 | 6;
  state: "rolled" | "assigned" | "spent" | "forfeit";
  assignedTo?: { unitId: EntityId; slotId: string };
}
```

### Ship

```typescript
interface Ship {
  id: EntityId;
  ownerId: string;
  position: Vec2;            // {x, z}
  velocity: Velocity;
  hold: Salvage[];            // stowed cargo
  holdMass: number;           // computed; max 6
  hullAnchors: Anchor[];      // 3 anchors
  slots: ShipSlot[];          // 7 slots
  isBreached: boolean;        // currently false; breach is per-event, not a state
}

interface Anchor {
  id: string;
  positionOffset: Vec2;       // relative to ship center
  inUse: boolean;
}

interface ShipSlot {
  id: "burn-small" | "burn-big" | "burn-max" | "launch" | "recall" | "stow" | "scan";
  dieRequirement: DieRequirement;
  assignedDieId?: string;
}

type DieRequirement = "any" | "1+" | "2+" | "3+" | "4+" | "5+" | "6";
```

### Crew

```typescript
interface Crew {
  id: EntityId;
  ownerId: string;
  role: "Cutter" | "Grappler" | "Breacher" | "Hauler";
  position: Vec2 | "embarked"; // "embarked" = inside ship, off-table
  velocity: Velocity;
  carrying: Salvage[];          // 0-2 pieces
  state: "active" | "lost" | "grappled";
  grappledWithId?: EntityId;    // if grappled, the other crew's ID
  tetherIds: string[];          // tethers attached to this crew (max 1)
  slots: CrewSlot[];            // role-locked + generic
  onTerrainId?: EntityId;        // wreck/asteroid/ship hull ID, if on terrain
}

interface CrewSlot {
  id: SlotId;
  isRoleLocked: boolean;
  dieRequirement: DieRequirement;
  assignedDieId?: string;
}
```

### Salvage

```typescript
interface Salvage {
  id: EntityId;
  type: "scatter" | "wreck" | "premium";
  vp: number;                   // 1, 2, or 3
  mass: 1 | 2 | 3;
  position: Vec2 | "in-hold" | "in-compartment" | "on-wreck";
  containerId?: EntityId;        // wreck or ship that contains it
  isAttached: boolean;          // true if still attached to a wreck (uncut)
  isFaceDown: boolean;          // true if not yet revealed
  velocity: Velocity;            // typically zero unless yanked/pushed
}
```

### Wreck

```typescript
interface Wreck {
  id: EntityId;
  position: Vec2;
  shape: WreckShape;            // for collision and rendering
  role: "jackpot" | "mid" | "bait";  // hidden until revealed
  isRoleRevealed: boolean;
  exteriorSalvageIds: EntityId[];     // 3 face-down wreck salvage tokens
  compartments: Compartment[];        // 2 sealed compartments
}

interface Compartment {
  id: string;
  position: Vec2;                // relative to wreck center
  isSealed: boolean;
  contentSalvageId?: EntityId;   // could be Premium, Scatter, or null (empty)
}

interface WreckShape {
  type: "freighter" | "station" | "carrier" | "broken";
  bounds: Vec2[];                 // polygon vertices for collision/LoS
  walkableSurface: Vec2[];        // points where crew can land/crawl
}
```

### Tether

```typescript
interface Tether {
  id: string;
  endpointA: TetherEndpoint;
  endpointB: TetherEndpoint;
  length: "short" | "medium" | "long";  // 3 / 6 / 10 inches
  loadRating: number;                    // 3 (default), 4 (hauler harness), 5 (tow line)
  isShipGrade: boolean;
  state: "slack" | "taut" | "snapped";
}

interface TetherEndpoint {
  entityId: EntityId;             // crew, ship, salvage, or anchor
  anchorId?: string;               // for ship hull anchors
}
```

### Velocity

```typescript
interface Velocity {
  direction: number;              // radians, 0 = +x
  magnitude: 0 | 1 | 2 | 3;       // 0=stopped, 1=Short, 2=Medium, 3=Long
}

// Helper: convert magnitude to inches
const VELOCITY_INCHES = { 0: 0, 1: 3, 2: 6, 3: 10 };
```

### Pending action (assigned but not resolved)

```typescript
interface PendingAction {
  id: string;
  playerId: string;
  unitId: EntityId;
  slotId: string;
  dieId: string;
  actionType: ActionType;
  parameters?: any;               // target IDs, directions, etc. — set at resolve time
}

type ActionType =
  | "burn-small" | "burn-big" | "burn-max" | "launch" | "recall" | "stow" | "scan"
  | "cut" | "grapple" | "breach" | "heavy-haul"
  | "crawl" | "push-off" | "thruster-burn" | "haul" | "rig-tether"
  | "scavenge" | "brace" | "shove" | "tackle" | "embark";
```

---

## 3. The Rules Engine

This is the heart of the application. It must be a **pure, deterministic state machine** — given a state and an action, it produces a new state with no side effects.

### Architecture

```typescript
// All state mutations go through reducers
type Action =
  | { type: "ROLL_DICE"; playerId: string }
  | { type: "REROLL"; playerId: string; dieIds: string[] }
  | { type: "ASSIGN_DIE"; playerId: string; dieId: string; slotId: string; unitId: EntityId }
  | { type: "REVEAL_ASSIGNMENTS" }
  | { type: "ACTIVATE_UNIT"; playerId: string; unitId: EntityId }
  | { type: "RESOLVE_DIE"; dieId: string; parameters: any }
  | { type: "RESIST"; targetCrewId: EntityId; resistDieId: string; sourceActionId: string }
  | { type: "ADVANCE_PHASE" }
  | { type: "RUN_DRIFT" }
  | { type: "END_GAME" };

function reduce(state: GameState, action: Action): GameState {
  // Pure function. Returns new state. Throws on invalid action.
}
```

### Phase machine

The phase progression:
```
roll → assign → reveal → resolve → drift → (next round | scoring) → gameover
```

Phase transitions are gated:
- `roll` → `assign`: when all players have committed their reroll choices (or 0 rerolls if round 1)
- `assign` → `reveal`: when all players have committed assignments (placed all dice or marked some forfeit)
- `reveal` → `resolve`: automatic after reveal (single tick to flip the visible state)
- `resolve` → `drift`: when no player has unactivated units with dice
- `drift` → `roll` (next round) OR `scoring` if round = 6
- `scoring` → `gameover`

### Action validation

Every action must validate against the current state. Validators live alongside resolvers:

```typescript
function validateAssignDie(state: GameState, action: AssignDieAction): ValidationResult {
  // Check: die is rolled (not assigned/spent), slot is empty, die meets requirement, slot belongs to unit, unit belongs to player
}

function validateActivateUnit(state: GameState, action: ActivateAction): ValidationResult {
  // Check: it's player's turn, unit hasn't been activated, unit has dice assigned
}
```

### Resolving actions — the per-action logic

Each action has its own resolver. Detailed algorithms below.

#### Burn (small/big/max)
1. Validate ship has dice on the burn slot
2. Compute burn arrow length: small=Short, big=Medium, max=Long
3. Apply mass penalty: if hold mass ≥ 3, drop one step; if = 6, drop two steps
4. Vector-add burn arrow to ship's current velocity
5. Cap at Long magnitude

#### Launch
1. Validate: a crew is embarked; specified direction is open (no terrain in the way at exit point)
2. Move crew from "embarked" state to ship's hull position with Short velocity in chosen direction
3. Crew now drifts during next drift phase

#### Recall
1. Validate: the targeted crew is tethered directly to a ship hull anchor of this ship
2. Check tether load: tether must hold (load not exceeded)
3. Set crew position to ship hull (any open hull point)
4. Set crew velocity to 0
5. Don't sever the tether — it stays attached, ready for next deployment

#### Stow
1. Validate: at least one piece of loose salvage within 1" of any hull point
2. Player selects which piece to Stow
3. If hold has capacity for the piece's mass: load it, sever any external tethers
4. If hold lacks capacity: player may declare ejection (one or more held pieces) — committed before resolve. Ejected pieces become loose salvage adjacent to ship at velocity 0. Then load incoming.
5. If still no room after declared ejection: action fizzles, die spent

#### Scan
1. Validate: at least one face-down element within 4" of ship
2. Player selects target: an exterior salvage, a sealed compartment's contents
3. Reveal the contents to the scanning player only (UI: show face-up to that player, others see "scanned" indicator)
4. Update `scannedBy` field on the element so future renders show appropriate visibility

#### Cut
1. Validate: Cutter is adjacent to target (within 1")
2. Target is either: salvage attached to wreck, OR a tether
3. If salvage: detach from wreck, place at adjacent position with velocity 0
4. If tether (slack): remove tether, both endpoints maintain current velocity
5. If tether (taut): remove tether, both endpoints take their tangent velocity at moment of cut

#### Grapple — Reel In
1. Validate: target within 6", line-of-sight clear (see LoS algorithm)
2. Compute direction from Grappler to target
3. Add Medium velocity in that direction to Grappler's current velocity (vector add, cap at Long)
4. Movement happens in drift phase — auto-land applies if path crosses terrain

#### Grapple — Yank
1. Validate: target within 6", LoS clear, target is not tethered, target is not a ship, target mass ≤ 2
2. If target is rival's crew: prompt resist opportunity (interrupt)
3. If resisted: action fizzles, both dice spent
4. If unresisted: target gains Short velocity toward Grappler
5. If target mass = 2 AND Grappler is not on terrain: Grappler also gains Short velocity toward target

#### Grapple — Anchor Swing
1. Validate: target is terrain, within 6", LoS clear
2. Create temporary tether between Grappler and target. Length = distance to target. Mark as "anchor-swing-temp" for cleanup at end of drift
3. Drift phase will use this tether for swing physics
4. At end of drift phase: remove the temp tether

#### Breach
1. Validate: target is sealed compartment on adjacent wreck, OR rival ship's hold (within 1")
2. If wreck compartment: reveal contents (Premium, Scatter, or empty). Mark compartment as "open" (visible state). If contents is Premium/Scatter, salvage is now exposed but still attached to wreck (needs Cut).
3. If rival ship hold: rival's stowed pieces are shuffled, draw one randomly. If empty, action fizzles (die spent). Place drawn piece adjacent to rival ship at the breach point as loose salvage (velocity 0). Hold reseals after spill.

#### Crawl
1. Validate: crew is on terrain
2. Move crew along terrain surface up to: 1-2=Short (3"), 3-4=Medium (6"), 5-6=Long (10")
3. Crawl path must stay on terrain; UI may project a path along the surface
4. Velocity remains 0 (crawling doesn't gain velocity)

#### Push Off (2+)
1. Validate: crew is on terrain
2. Crew leaves terrain; gains Short velocity in chosen direction
3. If crew was on a moving ship's hull: also inherit ship's velocity (vector add)
4. Crew is now in space (`onTerrainId` cleared)

#### Thruster Burn (4+)
1. Validate: any state
2. Vector-add: 4=Short, 5=Medium, 6=Long thrust in chosen direction
3. Cap at Long magnitude

#### Haul / Heavy Haul
1. Validate: crew is tethered to a salvage piece; mass cap respected (Heavy Haul required for Mass-3)
2. Crew moves along the tether toward the anchored end (typically toward the other endpoint)
3. Movement is "hand over hand" — translate crew along tether direction up to tether length

#### Rig Tether
1. Validate: two specified non-self points within 1" of crew, both within tether length of each other
2. Validate: each endpoint has a free anchor available
3. Create new tether between the two endpoints
4. Tether starts in slack state

#### Scavenge
1. Validate: a debris token is adjacent OR was crossed by this crew's drift path this round
2. Crew picks up the debris into their carry
3. Subject to carry caps

#### Brace
1. Validate: any state
2. Set a flag on this crew for the rest of the round: ignores one external force application (Yank, Shove, Tackle, recoil from collision)
3. The flag is consumed by the next external force this round

#### Shove
1. Validate: target adjacent (within 1"); target is crew or salvage; not stowed cargo
2. If target is rival's crew: prompt resist
3. Apply velocity to target based on mass: Mass-1 = Long, Mass-2 = Medium, Mass-3 = Short

#### Tackle (3+)
1. Validate: target is rival crew, adjacent
2. Prompt resist
3. If resisted (resist die > tackler die): tackler stays adjacent, keeps velocity, no other effect, both dice spent
4. If unresisted/failed-resist:
   - Rival drops carried salvage (placed adjacent, velocity 0)
   - Both crew become "grappled together"
   - If tackler was on terrain: tackler chooses (a) stay anchored — rival held adjacent on terrain, neither drifts; (b) pull off — both drift with vector sum velocity
   - If tackler was in space: both drift with vector sum velocity
5. Grappled state restricts both crew to Push Off / Thruster Burn until separated

#### Embark
1. Validate: crew is on own ship's hull
2. Move crew to "embarked" state (off-table)
3. Any subsequent dice on this crew this activation are forfeit (resolveable mid-activation)

### Resist mechanic (interrupt)

When a Shove, Tackle, or Yank targets a rival's crew, the engine pauses to offer resist:

```typescript
function offerResist(state: GameState, sourceAction: PendingAction, targetCrewId: EntityId): GameState {
  const targetCrew = findCrew(state, targetCrewId);
  const owner = findPlayerByCrew(state, targetCrewId);

  // Eligible: unspent dice on this crew specifically
  const eligibleDice = targetCrew.slots
    .filter(s => s.assignedDieId)
    .map(s => findDie(state, s.assignedDieId))
    .filter(d => d.state === "assigned");

  if (eligibleDice.length === 0) return state; // can't resist, action proceeds

  // For human: pause and prompt UI. For AI: AI decides.
  // Returns either { resisted: true, dieId } or { resisted: false }
}
```

The UI must present the resist opportunity *only to the targeted player*. AI players use their personality logic to decide.

### Drift phase resolution

```typescript
function runDriftPhase(state: GameState): GameState {
  // 1. Roll debris drift direction
  const direction = rollDebrisDirection(state);
  state = setDebrisDirection(state, direction);

  // 2. Resolve by mass, biggest first
  const movables = collectMovables(state).sort((a, b) => b.mass - a.mass);
  // mass: ship=5, crew=1, salvage by mass, debris=1

  for (const entity of movables) {
    state = resolveDriftFor(state, entity);
  }

  // 3. Cleanup: temp tethers (anchor swings) released
  state = releaseAnchorSwingTethers(state);

  // 4. Check Lost crew (drifted off table)
  state = checkLostCrew(state);

  return state;
}

function resolveDriftFor(state: GameState, entity: Movable): GameState {
  if (entity.velocity.magnitude === 0) return state;

  const path = computeDriftPath(state, entity);
  // path includes: tether catch points (with arc bending), terrain landings, collision endpoints

  return applyDriftPath(state, entity, path);
}
```

**The path computation is the trickiest part.** It must:
1. Project entity along velocity arrow
2. Check for tether constraints — if exceeds tether length, bend remainder along arc
3. Check for terrain collisions — entity stops at first contact
4. Check for off-table — if entity exits table bounds, mark as Lost (for crew)
5. Cap tether swing arc at 180°

A reasonable algorithm:

```typescript
function computeDriftPath(state: GameState, entity: Movable): DriftPath {
  let remaining = velocityToInches(entity.velocity);
  let position = entity.position;
  let direction = entity.velocity.direction;
  const segments: PathSegment[] = [];
  const tether = findTetherFor(entity);

  while (remaining > 0) {
    // Cast a ray from position in direction, up to remaining length
    const nextEvent = castRay(state, position, direction, remaining, entity, tether);
    // nextEvent: { type: "terrain-hit" | "tether-taut" | "boundary" | "complete"; distance; details }

    segments.push({ from: position, to: nextEvent.point, ... });

    if (nextEvent.type === "terrain-hit") {
      // Land on terrain; velocity zeros
      return { segments, finalPosition: nextEvent.point, finalVelocity: zero(), landedOn: nextEvent.terrainId };
    }
    if (nextEvent.type === "tether-taut") {
      // Bend remainder along arc; recompute direction to be tangent at contact point
      remaining -= nextEvent.distance;
      position = nextEvent.point;
      direction = computeTangentDirection(position, tether.anchor, nextEvent.bendDirection);
      // Apply 180° swing cap
      // Continue loop
    }
    if (nextEvent.type === "boundary") {
      // Off-table; crew becomes Lost
      return { segments, finalPosition: nextEvent.point, finalVelocity: entity.velocity, lost: true };
    }
    if (nextEvent.type === "complete") {
      remaining = 0;
    }
  }

  return { segments, finalPosition: position, finalVelocity: entity.velocity };
}
```

### Tether physics

A tether is "taut" when distance between its two endpoints equals its length. When an entity is moving and would exceed tether length, the path bends along the arc.

**Bend computation:**
- Anchor at point A, moving entity at point E, target endpoint at distance d from A where d = tether length
- Find perpendicular direction at E relative to A→E vector
- The "bend direction" depends on which side of the radial line the entity's velocity vector points

**Arc cap:** 180° per drift. Track total swing angle accumulated; if it reaches 180°, stop (entity ends drift at half-circle position with current velocity tangent).

### Line of sight

For Grapple targeting:

```typescript
function hasLineOfSight(state: GameState, fromPos: Vec2, toPos: Vec2): boolean {
  const ray = makeRay(fromPos, toPos);
  for (const entity of allMassiveEntities(state)) {
    if (entity.position === fromPos || entity.position === toPos) continue; // origin/target
    if (rayIntersectsBounds(ray, entity.bounds)) return false;
  }
  return true;
}
```

"Massive entities" = wrecks, asteroids, ships, crew, salvage, debris. Tethers don't block.

### Scoring

```typescript
function computeFinalScores(state: GameState): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const player of Object.values(state.players)) {
    let vp = 0;
    for (const piece of player.ship.hold) {
      vp += piece.vp;
    }
    const lostCount = countLostCrew(state, player.id);
    vp -= lostCount;
    scores[player.id] = vp;
  }
  return scores;
}
```

---

## 4. UI / UX Spec

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  HEADER BAR                                                  │
│  Round 3/6 | Phase: Resolve | Active: Player 2 (Aggressive) │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│                                                              │
│              [3D ISOMETRIC PLAYFIELD]                        │
│                                                              │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  PLAYER PANEL (current player)         │  CONTEXT PANEL     │
│  Dice pool, ship hold, crew status     │  Selected unit,    │
│                                         │  available actions │
└─────────────────────────────────────────────────────────────┘
```

### Header bar
- Round counter
- Current phase indicator with subtle pulse on transition
- Active player name and color swatch
- Score readout for all players (always visible)
- Settings menu (debug toggles, save/load)

### 3D playfield
- Isometric perspective, ~30° down angle, orbitable
- Camera controls:
  - **Right-click + drag**: orbit around the playfield center
  - **Middle-click + drag** or **WASD**: pan
  - **Scroll wheel**: zoom (3 FOV presets: close, medium, overview)
  - **Spacebar**: snap to overview
- Ground plane: subtle starfield texture, distant nebula skybox
- All gameplay entities cast soft shadows on the ground
- A **grid overlay** (toggleable, debug-mode default) showing inch markers
- A **3D compass widget** in a corner showing N/E/S/W (debris drift uses these)

### Entity rendering

Every entity is a small, low-poly mesh with anime-stylized shading (cel-shading or flat-shaded depending on art direction):

- **Ships**: 2"×3" footprint. Stylized salvager hauler look, beat-up edges, exposed plating, single thruster cluster aft. Different colored running lights per player.
- **Crew**: ~25mm base. Suited figures with bulky helmets, tool harnesses. Different silhouettes per role:
  - Cutter: torch-shaped tool
  - Grappler: hook launcher on arm
  - Breacher: heavy boots, thicker armor
  - Hauler: bulkier, magnetic boots
- **Wrecks**: 4 distinct shapes (freighter, station, carrier, broken). Each has visible hatches and exterior salvage attachment points
- **Asteroids**: irregular rocky meshes
- **Salvage**: glowing color-coded crates floating slightly above the ground (Scatter = small, Wreck = medium, Premium = large with brighter glow)
- **Debris**: small tumbling chunks
- **Tethers**: actual rendered cables (Three.js `Line2` for thickness control). Color varies by length (Short = pale, Medium = standard, Long = bright). When taut, a slight tension shimmer.
- **Velocity arrows**: floating 3D arrows above each moving entity, scaled to magnitude (Short/Medium/Long). Player color tinted.

### Phase-specific UI

#### Roll phase
- Each player sees their dice in a tray, freshly rolled
- A "reroll selection" overlay: click dice to mark for reroll, "Commit Rerolls" button
- Rerolls remaining counter
- After commit, hidden from other players (use a "pass device" prompt for hot-seat)

#### Assign phase
- Hidden from other players (hot-seat: explicit pass-device screen)
- Player's ship board and crew cards displayed as panels
- **Drag-and-drop dice** from tray onto slots
- Only legal slots highlight green when dragging
- A "Commit Assignments" button when all dice are placed (or marked forfeit)
- Right-click a die to mark forfeit (if no legal slot exists)

#### Reveal phase
- Brief animation: dice flip up across all player panels, screens drop
- ~2 second pause to absorb the board state

#### Resolve phase
- Active player highlighted; their unactivated units glow
- Player clicks a unit to activate it
- Camera smoothly tracks the activated unit
- Action panel shows the dice on this unit and their available actions
- Player resolves dice in any order they choose

**Targeting UI per action type:**
- **Movement (Crawl, Push Off, Thruster Burn)**: ghost preview of velocity arrow follows mouse; click to commit
- **Cut, Breach, Stow**: click target (highlighted when valid)
- **Grapple**: range circle (6") shown around Grappler; valid LoS targets glow; click to select; choose mode (Reel/Yank/Anchor) from popup
- **Rig Tether**: click first endpoint, then second; preview line shown
- **Shove**: arrow drag from target; commits direction
- **Tackle**: click adjacent rival crew

**Resist prompt (interrupt):**
- When relevant, a dialog appears for the targeted player:
  - "Player 2 is Tackling your Hauler with a 4. Resist?"
  - Shows targeted crew's available dice with values
  - Player picks one or declines
  - If picked but value too low: action proceeds, die spent (warning shown)

#### Drift phase
- All inputs disabled
- Animations play simultaneously: ships drift, crew swing on tethers, debris floats
- Animation timeline ~3-5 seconds total
- Camera can follow a "feature unit" if there's interesting drama (longest swing, off-table risk)
- After drift, brief pause for players to assess new state

#### Scoring
- Big readout per player: cargo VP - lost crew = total
- Highlight winner

### Player panel (always visible)

Shows current player's:
- Dice pool: which dice rolled which value, status (assigned/spent/forfeit)
- Ship hold: visual layout of stowed pieces with mass indicators
- Crew status: 4 cards, each showing role, position state (in space/on terrain/embarked/grappled/lost), what dice are assigned
- Tether inventory: how many of each length still in stock

### Context panel (right side)

When a unit is selected:
- Unit details: stats, role, current state
- Action buttons / interaction hints
- For ships: ship slots with assigned dice highlighted
- For crew: crew slots, role-locked highlighted

### Debug overlay (sandbox/debug mode)

A toggleable overlay showing:
- All hidden info: face-down salvage values, wreck roles, all players' assigned dice
- Force-roll dice
- Manually advance phases
- Set seed
- Save state at any point, load any saved state
- Replay scrubber (timeline of all actions)
- AI decision tracing: show what each AI considered

---

## 5. AI Implementation

The AI plays one or more players. It must:
1. Roll dice (pure random, but logged)
2. Decide rerolls
3. Assign dice to slots
4. Activate units in order, choose actions, target selection
5. Decide whether to resist incoming actions

### AI architecture

```typescript
interface AIPlayer {
  personality: "aggressive" | "cautious" | "opportunistic";

  decideRerolls(state: GameState, playerId: string): string[]; // dice IDs to reroll
  decideAssignments(state: GameState, playerId: string): Assignment[];
  decideActivation(state: GameState, playerId: string): EntityId; // which unit to activate
  decideAction(state: GameState, unit: Unit, die: Die): { actionType: ActionType; parameters: any };
  decideResist(state: GameState, threat: PendingAction, targetCrew: Crew): { resist: boolean; dieId?: string };
}
```

### Common heuristics (used by all personalities)

```typescript
// Score the value of holding a salvage piece given its risk and reward
function evalSalvagePieceFor(state: GameState, piece: Salvage, playerId: string): number {
  return piece.vp * 1.0 - estimatedRiskOfLoss(piece, playerId) * 0.5;
}

// Estimate distance from a unit to its destination
function distanceTo(from: Vec2, to: Vec2): number;

// Estimate how many rounds until a piece is in our hold
function timeToStow(state: GameState, piece: Salvage, playerId: string): number;

// Risk of a crew getting stranded if we send them into space
function strandingRisk(state: GameState, crew: Crew, plannedDestination: Vec2): number;
```

### Personality: Aggressive

Priority weights:
- High: theft (Breach rivals' holds), Tackle disruption, Yank rivals' carries
- Medium: claiming any wreck salvage
- Low: defensive plays, Brace, Embark

Behavior characteristics:
- Sends crew into rival territory early
- Spends 5+ dice on Tackles even when defense is better value
- Targets the highest-VP rival, not the safest target
- Burns hard to chase, accepts overshoot risk
- Will leave its own hold vulnerable to grab one more piece

Reroll strategy: aggressive rerolls low dice (1s, 2s) hoping for big disruption dice (5s, 6s)

### Personality: Cautious

Priority weights:
- High: stowing what's already cut, defensive Brace, ship integrity
- Medium: Scatter/Wreck salvage close to home
- Low: Premium (too contested), theft (too risky)

Behavior characteristics:
- Stays near own ship, operates in a tight bubble
- Will stow Scatter for 1 VP rather than chase Premium for 3
- Resists almost every Shove/Tackle/Yank if dice allow
- Embarks crew at the first sign of trouble
- Burns conservatively; never risks overshoot

Reroll strategy: rerolls only obvious mismatches (e.g., a 1 when she needs at least a 3)

### Personality: Opportunistic

Priority weights:
- Dynamic — recomputed each round based on board state
- High: whatever pays off this round
- Medium: positioning for future rounds
- Low: nothing fixed

Behavior characteristics:
- Watches what other players are committing to and counter-plays
- Will switch from Premium-hunting to theft if a rival gets ahead
- Picks fights only when winning, runs when losing
- Best uses of resist dice (high efficiency)
- Adapts to whatever the meta of the game becomes

Reroll strategy: based on round number and current standing — aggressive in rerolls when behind, conservative when ahead

### Decision frequency and depth

For MVP performance:
- **No deep search.** No minimax, no MCTS. Every decision is a single-step heuristic evaluation.
- Each "decideX" function should run in **< 100ms** to keep the game flowing
- Cache state evaluations during a single decision pass

If we want to upgrade later:
- Add a 1-ply lookahead for assignment decisions (try a few candidate assignments, score them)
- Add Monte Carlo simulation for resist decisions (simulate without resist, with resist; compare expected outcomes)

### AI decision logging

For telemetry: every AI decision should be logged with:
- The decision type
- The candidate options considered
- Scores assigned to each
- Final choice
- The resulting state hash

This allows us to replay AI thinking and tune the weights.

---

## 6. Telemetry & Logging

### What to log

Every state transition gets a log entry:

```typescript
interface TelemetryEvent {
  timestamp: number;
  gameSeed: string;
  round: number;
  phase: Phase;
  eventType:
    | "dice-rolled"
    | "rerolled"
    | "assigned"
    | "revealed"
    | "activated"
    | "action-resolved"
    | "resisted"
    | "drift-resolved"
    | "salvage-stowed"
    | "crew-lost"
    | "scored"
    | "game-ended";
  playerId?: string;
  data: any;            // event-specific payload
  stateHashBefore: string;
  stateHashAfter: string;
}
```

### Aggregation

Per-game summary:
- Final scores per player
- Personality of each player
- Total rounds played
- Salvage stowed per player (count + VP)
- Crew lost per player
- Most-used actions per player
- Resist rate (resists attempted / resists successful)
- Average dice value used per action type

Per-multi-game summary:
- Win rates per personality
- Average score per personality
- Personality matchup matrix (Aggressive vs. Cautious win rate, etc.)
- Frequency of strategies (theft attempts, Premium captures, etc.)

### Export

JSON export of full game log + summary. Filename format: `salvage-{seed}-{timestamp}.json`.

### Headless simulation

For balance testing: the engine should support running games **headless** (no UI, no animations, just pure rule resolution). This enables running thousands of AI vs. AI games for telemetry.

```typescript
// CLI usage example
// npm run sim -- --players=4 --personalities=aggressive,cautious,opportunistic,aggressive --games=1000 --output=data/sim-001.json
```

---

## 7. Persistence & Replay

### Save game state

At any phase boundary (or via debug menu mid-phase), serialize full GameState to JSON. The engine guarantees that loading a saved state from any prior point reproduces the game exactly forward — provided the same RNG seed and same actions are used.

```typescript
function saveGame(state: GameState): string {
  return JSON.stringify(state, null, 2);
}

function loadGame(json: string): GameState {
  return JSON.parse(json) as GameState;
}
```

### Replay system

A replay is the **sequence of actions** plus the seed. To replay:
1. Initialize state from seed
2. Apply actions one at a time
3. Render each state for some duration

Replay UI:
- Timeline scrubber at bottom of screen
- Play/pause/step buttons
- Speed control (0.5x, 1x, 2x, 4x)
- Jump to any phase boundary
- Branch from any point: "fork timeline here, play forward differently"

The fork capability is huge for design iteration — you see a key decision, fork it, try the alternative, see how the game evolves.

---

## 8. Tunable Configuration

All numeric constants live in `config/rules.ts`. Examples:

```typescript
export const RULES = {
  table: {
    sizeInches: 36,
    edgeBuffer: 4,
    minWreckSpacing: 8,
  },
  rounds: {
    total: 6,
    diceCount: 5,
  },
  dice: {
    rerollFormula: (round: number) => round - 1, // round 1 = 0 rerolls, etc.
    sides: 6,
  },
  velocity: {
    short: 3,
    medium: 6,
    long: 10,
    maxMagnitude: 3,
  },
  ship: {
    holdCapacity: 6,
    hullAnchors: 3,
    massPenaltyThresholds: [3, 6], // step drops at these masses
    baseSize: { x: 2, z: 3 },
  },
  crew: {
    mass: 1,
    countPerPlayer: 4,
    haulerCarryCap: 2,
    standardCarryCap: 1,
  },
  tethers: {
    defaultLoad: 3,
    haulerHarnessLoad: 4,
    shipGradeLoad: 5,
    shortLength: 3,
    mediumLength: 6,
    longLength: 10,
    swingArcCap: 180, // degrees
  },
  salvage: {
    scatter: { vp: 1, mass: 1 },
    wreck: { vp: 2, mass: 2 },
    premium: { vp: 3, mass: 3 },
  },
  wreckRoles: {
    jackpot: { wreckSalvage: 3, premium: 2 },
    mid: { wreckSalvage: 3, premium: 1, scatter: 1 }, // shuffled into hatches
    bait: { wreckSalvage: 3 },
  },
  setup: {
    debrisCount: 12,
    asteroidsRange: [1, 2],
  },
  scoring: {
    lostCrewPenalty: -1,
  },
  grapple: {
    range: 6,
    reelInVelocity: 2, // Medium
  },
  scan: {
    range: 4,
  },
};
```

This single file is the place to iterate on balance. Changing values here ripples through all rules.

---

## 9. Build Plan / Implementation Order

A sensible sequence for Claude Code:

### Phase A: Engine foundation (1-2 days)
1. Set up project (Vite + React + TS + Three.js)
2. Define types and config
3. Implement GameState and reducers (state management only, no rendering)
4. Implement RNG with seed support
5. Unit tests for state transitions

### Phase B: Core rules (2-3 days)
1. Setup procedure (place wrecks, populate, place ships)
2. Phase machine (roll → assign → reveal → resolve → drift)
3. Implement all action resolvers (Burn, Cut, Grapple, etc.)
4. Implement drift phase with mass-priority and tether physics
5. Implement scoring
6. Unit tests for each action and full game playthroughs

### Phase C: Basic UI (2-3 days)
1. Three.js scene setup, camera, lighting
2. Render entities (placeholder geometry initially)
3. Wire phase changes to UI state
4. Player panels (dice, hold, crew status)
5. Click-to-select interactions
6. Drag-and-drop assignment

### Phase D: Action targeting UI (2-3 days)
1. Movement preview (velocity arrows)
2. Range circles for Grapple, Scan
3. Targeting highlight (valid targets glow)
4. Tether drag-rig
5. Resist prompt dialog
6. Drift animation

### Phase E: AI (2-3 days)
1. AI base interface
2. Heuristic library (eval functions)
3. Aggressive personality
4. Cautious personality
5. Opportunistic personality
6. AI vs AI test runs

### Phase F: Polish (2-3 days)
1. Replace placeholder geometry with stylized models
2. Animations (smooth drift, swing, hooks firing, breach effects)
3. Audio (optional)
4. Visual polish on UI panels
5. Sandbox/debug mode tools

### Phase G: Telemetry and replay (1-2 days)
1. Action logging
2. Save/load full state
3. Replay scrubber
4. Headless simulation runner
5. JSON export

### Phase H: Iteration (ongoing)
- Use telemetry from real playtests to tune AI and rules
- Fork-timeline experiments
- Balance changes via config

**Total**: roughly 15-20 days of focused work for a complete polished prototype. Cut polish and audio to compress to 8-10 days for a functional testbed.

---

## 10. What This Doc Does NOT Specify

Things deferred to implementer discretion:

- Specific 3D model files (use placeholder primitives initially)
- Sound effect library
- Color palette beyond "anime retro-futuristic"
- Specific UI fonts and exact spacing
- Animation curves (use sensible defaults — ease-in-out for drift, snap for instant actions)
- Exact tween durations
- Network protocol (no networking required)

---

## 11. References

- Tabletop design doc: `salvage-design-doc.md` (the canonical rule source)
- Action reference card: `salvage-action-card.md` (player-facing summary)

When in doubt, the tabletop design doc takes precedence. This document is the *implementation* spec — it's expected to evolve as we discover what works in code.
