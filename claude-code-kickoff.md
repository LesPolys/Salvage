# Claude Code Kickoff — Salvage Digital Testbed

Copy this entire document as your first message to a fresh Claude Code instance, after pointing it at `C:\Users\stewa\Documents\Salvage\`.

---

## Project context

You're building a digital prototype of **Salvage**, a 2-4 player miniatures game about competing space salvagers. This is a **testbed**, not a shipping product — the goal is to validate the tabletop ruleset and iterate on it quickly.

There are three documents in this directory you must read **before writing any code**:

1. **`salvage-design-doc.md`** — the canonical tabletop ruleset. Every rule decision lives here. When implementation questions arise, this doc is the source of truth.
2. **`salvage-action-card.md`** — player-facing quick reference. Useful as a summary but defers to the design doc on details.
3. **`salvage-digital-spec.md`** — the implementation brief. Architecture, tech stack, data model, build plan. Follow this for *how* to build.

Read all three end-to-end before starting. The design doc is the longest (~500 lines) but you need it.

## Your role

You are the implementer. The user is the designer. Expect:

- The design will evolve. Rules may change mid-build. Architect for change — config-driven, easy-to-modify.
- The user will give feedback in playtest terms ("the Grappler feels too strong"), and you'll need to translate that into code changes.
- This is **not** a shipping product. Polish where it helps validate the design (clear UI, responsive feedback). Don't over-invest in production-grade infrastructure.
- Treat the engine and the UI as separable. Engine must be testable in isolation.

## First milestone: Phase A from the spec

Don't try to build the whole thing in one shot. Your first concrete deliverable is **Phase A: Engine foundation** from section 9 of the digital spec:

1. Set up the project (Vite + React + TypeScript + Three.js, strict mode)
2. Create the directory structure described in the spec (`src/engine/`, `src/ai/`, `src/ui/`, `src/config/`, etc.)
3. Define all the TypeScript types from section 2 of the spec (GameState, Player, Ship, Crew, Salvage, Wreck, Tether, Velocity, etc.)
4. Implement `config/rules.ts` with all the tunable constants
5. Implement a seedable RNG (`engine/rng.ts`)
6. Stub out the reducer signature — `function reduce(state: GameState, action: Action): GameState` — but only implement the simplest cases (e.g., `ROLL_DICE`)
7. Set up Vitest and write tests for what you've built so far

**Do not start the UI yet.** Engine first. The UI is Phase C and depends on a working engine.

## Working agreements

- **Ask before architectural decisions.** If the spec is ambiguous, ask the user. Don't guess on things like state structure or which library to use for animations.
- **Verify with the user at the end of each phase.** Don't roll into Phase B without confirming Phase A is complete and acceptable.
- **Show me what you've built.** After each phase, give the user a clear summary: what works, what's tested, what's deferred. Show test output.
- **Keep the engine pure.** Section 1 of the spec specifies that `engine/` has no DOM, no Three.js, no rendering. Honor this — it makes everything testable and portable.
- **Write tests as you go.** The rules engine is exactly the kind of code where bugs hide. Use Vitest. Aim for high coverage on `engine/`.
- **Use TypeScript strict mode.** No `any` unless absolutely necessary.

## Things to flag immediately if unclear

These are areas where the design might benefit from clarification before code is written:

- The exact data shape for tether endpoints (the spec uses `EntityId` but the engine may need richer references)
- How "embarked" crew positions work (string sentinel vs. nullable position)
- Whether the reducer should be a single big function with a switch or split into smaller per-action functions
- How to handle async operations (resist prompts, AI decisions) in an otherwise synchronous reducer

If anything in the spec is genuinely ambiguous after reading the design doc, raise it before implementing.

## Out of scope (do not build yet)

- 3D models, animations, sound — placeholder geometry only until Phase F
- Network multiplayer
- Mobile UI
- Account systems / auth
- Build pipelines beyond local dev (no Docker, no CI for now)

## Success criteria for Phase A

You're done with Phase A when:

- [ ] Project builds and runs without errors
- [ ] All types from spec section 2 are defined
- [ ] `config/rules.ts` exists with all constants
- [ ] RNG is seedable and produces reproducible sequences
- [ ] Reducer compiles, handles `ROLL_DICE`, returns new state immutably
- [ ] At least 5 unit tests pass (covering RNG, basic state operations)
- [ ] User has reviewed and approved before you move to Phase B

## When you're stuck

If you hit a real ambiguity that the docs don't resolve, **stop and ask**. The user would much rather answer a question than have you guess wrong and refactor later. Phrase ambiguity questions clearly:

> The design doc says X but doesn't specify Y. I see two reasonable interpretations: (a) this, (b) that. Which do you prefer? My instinct is (a) because Z.

## Now begin

Read the three docs. Confirm you understand the scope and the goal. Then start Phase A.
