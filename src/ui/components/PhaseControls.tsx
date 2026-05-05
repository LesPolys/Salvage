import { useState } from "react";
import { useGameStore } from "../store";
import type { ActionType } from "../../engine/types";

export function PhaseControls() {
  const game = useGameStore((s) => s.game);
  if (!game) return null;

  switch (game.meta.phase) {
    case "deploy": return <DeployPhase />;
    case "roll": return <RollPhase />;
    case "assign": return <AssignPhase />;
    case "reveal": return <RevealPhase />;
    case "resolve": return <ResolvePhase />;
    case "drift": return <DriftPhase />;
    case "scoring": return <ScoringPhase />;
    case "gameover": return <GameOverPhase />;
    default: return null;
  }
}

function DeployPhase() {
  const game = useGameStore((s) => s.game)!;
  const targeting = useGameStore((s) => s.targeting);
  const startTargeting = useGameStore((s) => s.startTargeting);

  const activePlayer = game.players[game.meta.activePlayerId];
  if (!activePlayer) return null;

  const placedCount = Object.values(game.players).filter((p) => p.ship.placed).length;
  const totalPlayers = Object.keys(game.players).length;

  // If not already targeting, enter placement targeting mode
  const handleBeginPlace = () => {
    startTargeting({
      actionType: "burn-small" as ActionType, // placeholder — we'll intercept this in the confirm handler
      unitId: activePlayer.ship.id,
      dieId: "",
      playerId: activePlayer.id,
      unitPosition: { x: 0, z: 0 },
      currentVelocity: { direction: 0, magnitude: 0 },
      targetKind: "point",
    });
  };

  if (targeting) {
    return (
      <div style={controlsStyle}>
        <div style={phaseTitle}>Deploy — Place Ship</div>
        <div style={{ color: "#88cc88", fontSize: "12px" }}>
          <span style={{ color: activePlayer.color, fontWeight: "bold" }}>{activePlayer.name}</span>
          : Click on the table edge to place your ship. Right-click to cancel.
        </div>
        <div style={{ color: "#556677", fontSize: "11px", marginTop: "4px" }}>
          Must be within 2&quot; of a table edge, at least 6&quot; from other ships.
        </div>
      </div>
    );
  }

  return (
    <div style={controlsStyle}>
      <div style={phaseTitle}>Deploy Phase ({placedCount}/{totalPlayers} placed)</div>
      <div style={{ color: "#88aa88", marginBottom: "8px" }}>
        <span style={{ color: activePlayer.color, fontWeight: "bold" }}>{activePlayer.name}</span>
        {" "}— place your ship near a table edge.
      </div>
      <button onClick={handleBeginPlace} style={advanceBtn}>
        Place Ship on Table
      </button>
    </div>
  );
}

function RollPhase() {
  const game = useGameStore((s) => s.game)!;
  const dispatch = useGameStore((s) => s.dispatch);

  const allRolled = Object.values(game.players).every((p) => p.dice.length > 0);

  return (
    <div style={controlsStyle}>
      <div style={phaseTitle}>Roll Phase</div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {Object.values(game.players).map((p) => (
          <button
            key={p.id}
            onClick={() => dispatch({ type: "ROLL_DICE", playerId: p.id })}
            disabled={p.dice.length > 0}
            style={actionBtn(p.dice.length === 0)}
          >
            Roll {p.name}
          </button>
        ))}
      </div>
      {allRolled && (
        <button
          onClick={() => dispatch({ type: "ADVANCE_PHASE" })}
          style={advanceBtn}
        >
          Proceed to Assign →
        </button>
      )}
    </div>
  );
}

function AssignPhase() {
  const game = useGameStore((s) => s.game)!;
  const dispatch = useGameStore((s) => s.dispatch);
  const [selectedDie, setSelectedDie] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string>(
    Object.keys(game.players)[0]
  );

  const player = game.players[selectedPlayer];
  if (!player) return null;

  const unassignedDice = player.dice.filter((d) => d.state === "rolled");

  const allUnits: Array<{ unitId: string; label: string }> = [];

  // Ship
  allUnits.push({
    unitId: player.ship.id,
    label: `Ship`,
  });

  // Crews
  for (const crew of Object.values(player.crews)) {
    if (crew.state === "lost") continue;
    allUnits.push({
      unitId: crew.id,
      label: `${crew.role}`,
    });
  }

  const handleAssign = (unitId: string) => {
    if (!selectedDie) return;
    dispatch({
      type: "ASSIGN_DIE",
      playerId: selectedPlayer,
      dieId: selectedDie,
      unitId,
    });
    setSelectedDie(null);
  };

  return (
    <div style={controlsStyle}>
      <div style={phaseTitle}>Assign Phase</div>

      {/* Player selector */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
        {Object.values(game.players).map((p) => (
          <button
            key={p.id}
            onClick={() => { setSelectedPlayer(p.id); setSelectedDie(null); }}
            style={{
              ...actionBtn(selectedPlayer === p.id),
              borderColor: p.color,
              color: selectedPlayer === p.id ? p.color : "#556677",
            }}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Dice to assign */}
      <div style={{ marginBottom: "8px" }}>
        <span style={{ color: "#667788", fontSize: "11px" }}>Select die: </span>
        <div style={{ display: "flex", gap: "4px", marginTop: "4px" }}>
          {unassignedDice.map((die) => (
            <button
              key={die.id}
              onClick={() => setSelectedDie(die.id === selectedDie ? null : die.id)}
              style={{
                width: "32px", height: "32px",
                background: die.id === selectedDie ? "#334466" : "#222233",
                border: die.id === selectedDie ? "2px solid #6688aa" : "1px solid #333344",
                color: "#eee", fontWeight: "bold", fontSize: "14px",
                borderRadius: "4px", cursor: "pointer",
                fontFamily: "monospace",
              }}
            >
              {die.value}
            </button>
          ))}
        </div>
      </div>

      {/* Available slots */}
      {selectedDie && (
        <div>
          <span style={{ color: "#667788", fontSize: "11px" }}>Assign to unit: </span>
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "4px" }}>
            {allUnits.map((unit) => (
              <button
                key={unit.unitId}
                onClick={() => handleAssign(unit.unitId)}
                style={{
                  ...actionBtn(true),
                  fontSize: "10px",
                  padding: "4px 8px",
                }}
              >
                {unit.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => dispatch({ type: "REVEAL_ASSIGNMENTS" })}
        style={{ ...advanceBtn, marginTop: "12px" }}
      >
        Reveal Assignments →
      </button>
    </div>
  );
}

function RevealPhase() {
  const dispatch = useGameStore((s) => s.dispatch);

  return (
    <div style={controlsStyle}>
      <div style={phaseTitle}>Reveal Phase</div>
      <div style={{ color: "#88aa88", marginBottom: "8px" }}>
        All assignments are now public.
      </div>
      <button onClick={() => dispatch({ type: "ADVANCE_PHASE" })} style={advanceBtn}>
        Begin Resolve →
      </button>
    </div>
  );
}

const DIRECTION_ACTIONS = new Set([
  "burn-small", "burn-big", "burn-max", "push-off", "thruster-burn", "shove",
]);

function ResolvePhase() {
  const game = useGameStore((s) => s.game)!;
  const dispatch = useGameStore((s) => s.dispatch);
  const startTargeting = useGameStore((s) => s.startTargeting);
  const targeting = useGameStore((s) => s.targeting);
  const [selectedDieId, setSelectedDieId] = useState<string | null>(null);
  const [subStep, setSubStep] = useState<{ action: string; dieId: string } | null>(null);

  const activePlayer = game.players[game.meta.activePlayerId];
  if (!activePlayer) return null;

  const assignedDice = activePlayer.dice.filter((d) => d.state === "assigned");

  const getUnitForDie = (dieId: string) => {
    const die = activePlayer.dice.find((d) => d.id === dieId);
    return die?.assignedTo ?? activePlayer.ship.id;
  };

  const getUnitState = (unitId: string) => {
    if (activePlayer.ship.id === unitId) {
      return { position: activePlayer.ship.position, velocity: activePlayer.ship.velocity };
    }
    for (const crew of Object.values(activePlayer.crews)) {
      if (crew.id === unitId && crew.position !== "embarked") {
        return { position: crew.position as { x: number; z: number }, velocity: crew.velocity };
      }
    }
    return { position: activePlayer.ship.position, velocity: { direction: 0, magnitude: 0 as const } };
  };

  // Find embarked crew for launch
  const embarkedCrew = Object.values(activePlayer.crews).filter(
    (c) => c.position === "embarked" && c.state === "active"
  );

  // Find stowable salvage (near ship)
  const stowableSalvage = game.table.looseSalvage.filter((s) => {
    if (typeof s.position !== "object" || s.isAttached) return false;
    const dx = (s.position as {x:number;z:number}).x - activePlayer.ship.position.x;
    const dz = (s.position as {x:number;z:number}).z - activePlayer.ship.position.z;
    return Math.sqrt(dx * dx + dz * dz) < 3;
  });

  // Find scannable targets (face-down within 4" of ship)
  const scannableTargets: Array<{ id: string; label: string }> = [];
  for (const s of game.table.looseSalvage) {
    if (!s.isFaceDown || typeof s.position !== "object") continue;
    const dx = (s.position as {x:number;z:number}).x - activePlayer.ship.position.x;
    const dz = (s.position as {x:number;z:number}).z - activePlayer.ship.position.z;
    if (Math.sqrt(dx * dx + dz * dz) <= 4) {
      scannableTargets.push({ id: s.id, label: `Salvage ${s.id}` });
    }
  }
  for (const w of game.table.wrecks) {
    const dx = w.position.x - activePlayer.ship.position.x;
    const dz = w.position.z - activePlayer.ship.position.z;
    if (Math.sqrt(dx * dx + dz * dz) > 4) continue;
    for (const c of w.compartments) {
      if (c.isSealed) scannableTargets.push({ id: c.id, label: `Hatch ${c.id}` });
    }
  }

  const resolveSimple = (dieId: string, actionType: string, params: Record<string, unknown>) => {
    dispatch({
      type: "RESOLVE_DIE",
      playerId: activePlayer.id,
      unitId: getUnitForDie(dieId),
      dieId,
      actionType: actionType as ActionType,
      parameters: params,
    });
    setSelectedDieId(null);
    setSubStep(null);
  };

  const handleAction = (dieId: string, actionType: string) => {
    const unitId = getUnitForDie(dieId);
    const { position, velocity } = getUnitState(unitId);

    if (DIRECTION_ACTIONS.has(actionType)) {
      startTargeting({
        actionType: actionType as ActionType,
        unitId, dieId,
        playerId: activePlayer.id,
        unitPosition: position,
        currentVelocity: velocity,
        targetKind: "direction",
      });
      return;
    }

    // Actions that need a sub-step picker
    if (actionType === "launch") {
      setSubStep({ action: "launch", dieId });
      return;
    }
    if (actionType === "stow") {
      if (stowableSalvage.length === 1) {
        resolveSimple(dieId, "stow", { salvageId: stowableSalvage[0].id, ejectIds: [] });
      } else {
        setSubStep({ action: "stow", dieId });
      }
      return;
    }
    if (actionType === "scan") {
      if (scannableTargets.length === 1) {
        resolveSimple(dieId, "scan", { targetId: scannableTargets[0].id });
      } else {
        setSubStep({ action: "scan", dieId });
      }
      return;
    }

    // Everything else: immediate
    resolveSimple(dieId, actionType, {});
    setSelectedDieId(null);
  };

  if (targeting) {
    return (
      <div style={controlsStyle}>
        <div style={phaseTitle}>Targeting...</div>
        <div style={{ color: "#88cc88", fontSize: "12px" }}>
          Click on the playfield to set direction for <b>{targeting.actionType}</b>.
          Right-click or Esc to cancel.
        </div>
      </div>
    );
  }

  // Sub-step: pick crew for launch
  if (subStep?.action === "launch") {
    return (
      <div style={controlsStyle}>
        <div style={phaseTitle}>Launch — Pick Crew</div>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {embarkedCrew.map((c) => (
            <button key={c.id} style={actionBtn(true)} onClick={() => {
              const { position, velocity } = getUnitState(activePlayer.ship.id);
              startTargeting({
                actionType: "launch" as ActionType,
                unitId: activePlayer.ship.id,
                dieId: subStep.dieId,
                playerId: activePlayer.id,
                unitPosition: position,
                currentVelocity: velocity,
                targetKind: "direction",
              });
              // Store crewId so confirmTargeting can include it
              useGameStore.setState({ _launchCrewId: c.id } as any);
              setSubStep(null);
            }}>
              {c.role}
            </button>
          ))}
          <button style={actionBtn(true)} onClick={() => setSubStep(null)}>Cancel</button>
        </div>
      </div>
    );
  }

  // Sub-step: pick salvage for stow
  if (subStep?.action === "stow") {
    return (
      <div style={controlsStyle}>
        <div style={phaseTitle}>Stow — Pick Salvage</div>
        {stowableSalvage.length === 0 ? (
          <div style={{ color: "#aa6644" }}>No salvage near ship to stow.
            <button style={actionBtn(true)} onClick={() => setSubStep(null)}>Back</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {stowableSalvage.map((s) => (
              <button key={s.id} style={actionBtn(true)} onClick={() => {
                resolveSimple(subStep.dieId, "stow", { salvageId: s.id, ejectIds: [] });
              }}>
                {s.type} ({s.vp}VP, mass {s.mass})
              </button>
            ))}
            <button style={actionBtn(true)} onClick={() => setSubStep(null)}>Cancel</button>
          </div>
        )}
      </div>
    );
  }

  // Sub-step: pick target for scan
  if (subStep?.action === "scan") {
    return (
      <div style={controlsStyle}>
        <div style={phaseTitle}>Scan — Pick Target</div>
        {scannableTargets.length === 0 ? (
          <div style={{ color: "#aa6644" }}>No scannable targets in range.
            <button style={actionBtn(true)} onClick={() => setSubStep(null)}>Back</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {scannableTargets.map((t) => (
              <button key={t.id} style={actionBtn(true)} onClick={() => {
                resolveSimple(subStep.dieId, "scan", { targetId: t.id });
              }}>
                {t.label}
              </button>
            ))}
            <button style={actionBtn(true)} onClick={() => setSubStep(null)}>Cancel</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={controlsStyle}>
      <div style={phaseTitle}>Resolve Phase</div>
      <div style={{ color: "#88aa88", marginBottom: "8px" }}>
        Active: <span style={{ color: activePlayer.color }}>{activePlayer.name}</span>
        {" "}— {assignedDice.length} dice remaining
      </div>

      {assignedDice.length > 0 && (
        <>
          {/* Step 1: Pick a die */}
          <div style={{ marginBottom: "8px" }}>
            <span style={{ color: "#667788", fontSize: "11px" }}>1. Select die: </span>
            <div style={{ display: "flex", gap: "4px", marginTop: "4px" }}>
              {assignedDice.map((die) => (
                <button
                  key={die.id}
                  onClick={() => setSelectedDieId(die.id === selectedDieId ? null : die.id)}
                  style={{
                    width: "36px", height: "36px",
                    background: die.id === selectedDieId ? "#334466" : "#222233",
                    border: die.id === selectedDieId ? "2px solid #6688aa" : "1px solid #333344",
                    color: "#eee", fontWeight: "bold", fontSize: "16px",
                    borderRadius: "4px", cursor: "pointer", fontFamily: "monospace",
                  }}
                  title={`Die ${die.value} on ${die.assignedTo}`}
                >
                  {die.value}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Pick action */}
          {selectedDieId && (
            <div>
              <span style={{ color: "#667788", fontSize: "11px" }}>
                2. Choose action (die value: {activePlayer.dice.find((d) => d.id === selectedDieId)?.value}):
              </span>
              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "4px" }}>
                {getAvailableActions(game, activePlayer.id, getUnitForDie(selectedDieId),
                  activePlayer.dice.find((d) => d.id === selectedDieId)?.value ?? 1
                ).map((act) => (
                  <button
                    key={act.type}
                    onClick={() => handleAction(selectedDieId, act.type)}
                    style={{
                      ...actionBtn(true),
                      fontSize: "11px",
                      padding: "4px 8px",
                      borderColor: DIRECTION_ACTIONS.has(act.type) ? "#336644" : "#334455",
                    }}
                    title={act.description}
                  >
                    {act.label}
                    {DIRECTION_ACTIONS.has(act.type) && " ⟶"}
                  </button>
                ))}
              </div>
              {/* Extra params for non-direction actions */}
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: "10px", display: "flex", gap: "8px" }}>
        {assignedDice.length === 0 && (
          <button onClick={() => dispatch({ type: "ADVANCE_PHASE" })} style={advanceBtn}>
            Proceed to Drift →
          </button>
        )}
        {assignedDice.length > 0 && (
          <button onClick={() => dispatch({ type: "ADVANCE_PHASE" })} style={{
            ...advanceBtn, background: "#332222", borderColor: "#554433", color: "#cc8866",
          }}>
            End Resolve (forfeit remaining dice) →
          </button>
        )}
      </div>
    </div>
  );
}

interface AvailableAction {
  type: string;
  label: string;
  description: string;
}

function getAvailableActions(
  game: import("../../engine/types").GameState,
  playerId: string,
  unitId: string,
  dieValue: number
): AvailableAction[] {
  const player = game.players[playerId];
  const actions: AvailableAction[] = [];

  const check = (req: string) => {
    switch (req) {
      case "any": return true;
      case "1+": return dieValue >= 1;
      case "2+": return dieValue >= 2;
      case "3+": return dieValue >= 3;
      case "4+": return dieValue >= 4;
      case "5+": return dieValue >= 5;
      case "6": return dieValue === 6;
      default: return true;
    }
  };

  if (player.ship.id === unitId) {
    // Ship actions
    if (check("3+")) actions.push({ type: "burn-small", label: "Burn (S)", description: "Add Short thrust" });
    if (check("5+")) actions.push({ type: "burn-big", label: "Burn (M)", description: "Add Medium thrust" });
    if (dieValue === 6) actions.push({ type: "burn-max", label: "Burn (L)", description: "Add Long thrust" });
    actions.push({ type: "launch", label: "Launch", description: "Deploy crew from ship" });
    actions.push({ type: "recall", label: "Recall", description: "Reel in tethered crew" });
    actions.push({ type: "stow", label: "Stow", description: "Load adjacent salvage" });
    if (check("1+")) actions.push({ type: "scan", label: "Scan", description: "Reveal face-down element" });
  } else {
    // Crew actions
    const crew = Object.values(player.crews).find((c) => c.id === unitId);
    if (!crew) return actions;

    // Generic
    actions.push({ type: "crawl", label: "Crawl", description: "Move along terrain" });
    if (check("2+")) actions.push({ type: "push-off", label: "Push Off", description: "Leave terrain with Short velocity" });
    if (check("4+")) actions.push({ type: "thruster-burn", label: "Thruster", description: "Add thrust in space" });
    actions.push({ type: "haul", label: "Haul", description: "Move along tether" });
    actions.push({ type: "rig-tether", label: "Rig Tether", description: "Connect two points" });
    actions.push({ type: "scavenge", label: "Scavenge", description: "Grab adjacent debris" });
    actions.push({ type: "brace", label: "Brace", description: "Block one external force" });
    actions.push({ type: "shove", label: "Shove", description: "Push adjacent entity" });
    if (check("3+")) actions.push({ type: "tackle", label: "Tackle", description: "Grab rival crew" });
    actions.push({ type: "embark", label: "Embark", description: "Return to own ship" });

    // Role-locked
    if (crew.role === "Cutter" && check("3+")) actions.push({ type: "cut", label: "Cut", description: "Sever salvage or tether" });
    if (crew.role === "Grappler" && check("3+")) actions.push({ type: "grapple", label: "Grapple", description: "Hook target within 6\"" });
    if (crew.role === "Breacher" && check("5+")) actions.push({ type: "breach", label: "Breach", description: "Open compartment or rival hold" });
    if (crew.role === "Hauler") actions.push({ type: "heavy-haul", label: "Heavy Haul", description: "Haul Mass-3 salvage" });
  }

  return actions;
}

function DriftPhase() {
  const game = useGameStore((s) => s.game)!;
  const dispatch = useGameStore((s) => s.dispatch);

  return (
    <div style={controlsStyle}>
      <div style={phaseTitle}>Drift Phase — Round {game.meta.round}</div>
      <div style={{ color: "#667788", fontSize: "11px", marginBottom: "8px" }}>
        All units move along their velocity vectors.
      </div>
      <button onClick={() => {
        dispatch({ type: "RUN_DRIFT" });
      }} style={advanceBtn}>
        Run Drift
      </button>
      <button onClick={() => {
        dispatch({ type: "ADVANCE_PHASE" });
      }} style={{ ...advanceBtn, marginLeft: "8px" }}>
        {game.meta.round >= 6 ? "Go to Scoring →" : `Next Round (${game.meta.round + 1}) →`}
      </button>
    </div>
  );
}

function ScoringPhase() {
  const game = useGameStore((s) => s.game)!;
  const dispatch = useGameStore((s) => s.dispatch);

  return (
    <div style={controlsStyle}>
      <div style={phaseTitle}>Scoring</div>
      <div style={{ display: "flex", gap: "16px", marginBottom: "12px" }}>
        {Object.values(game.players).map((p) => (
          <div key={p.id} style={{ textAlign: "center" }}>
            <div style={{ color: p.color, fontWeight: "bold" }}>{p.name}</div>
            <div style={{ fontSize: "24px", color: "#eee" }}>{p.score}</div>
            <div style={{ fontSize: "10px", color: "#667788" }}>VP</div>
          </div>
        ))}
      </div>
      <button onClick={() => dispatch({ type: "END_GAME" })} style={advanceBtn}>
        End Game
      </button>
    </div>
  );
}

function GameOverPhase() {
  const game = useGameStore((s) => s.game)!;

  const sorted = Object.values(game.players).sort((a, b) => b.score - a.score);

  return (
    <div style={controlsStyle}>
      <div style={{ ...phaseTitle, color: "#ffcc00" }}>Game Over</div>
      <div>
        {sorted.map((p, i) => (
          <div key={p.id} style={{
            padding: "6px 0",
            color: i === 0 ? "#ffcc00" : "#aabbcc",
            fontWeight: i === 0 ? "bold" : "normal",
          }}>
            {i + 1}. {p.name} — {p.score} VP ({p.ship.hold.length} pieces)
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────

const controlsStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "#0a0a16",
  borderTop: "1px solid #1a1a2e",
  fontFamily: "monospace",
  fontSize: "12px",
  color: "#bbb",
};

const phaseTitle: React.CSSProperties = {
  color: "#88aacc",
  fontWeight: "bold",
  fontSize: "13px",
  marginBottom: "8px",
};

function actionBtn(active: boolean): React.CSSProperties {
  return {
    background: active ? "#223344" : "#151520",
    border: "1px solid #334455",
    color: active ? "#aabbcc" : "#445566",
    padding: "4px 10px",
    borderRadius: "3px",
    cursor: active ? "pointer" : "default",
    fontFamily: "monospace",
    fontSize: "11px",
  };
}

const advanceBtn: React.CSSProperties = {
  background: "#224433",
  border: "1px solid #336644",
  color: "#88cc88",
  padding: "6px 14px",
  borderRadius: "4px",
  cursor: "pointer",
  fontFamily: "monospace",
  fontSize: "12px",
  fontWeight: "bold",
};


