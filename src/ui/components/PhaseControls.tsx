import { useState } from "react";
import { useGameStore } from "../store";
import type { ActionType } from "../../engine/types";

export function PhaseControls() {
  const game = useGameStore((s) => s.game);
  if (!game) return null;

  switch (game.meta.phase) {
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

function ResolvePhase() {
  const game = useGameStore((s) => s.game)!;
  const dispatch = useGameStore((s) => s.dispatch);
  const [actionType, setActionType] = useState<string>("");
  const [actionParams, setActionParams] = useState<string>("{}");

  const activePlayer = game.players[game.meta.activePlayerId];
  if (!activePlayer) return null;

  // Find all assigned dice for the active player
  const assignedDice = activePlayer.dice.filter((d) => d.state === "assigned");

  const handleResolve = (dieId: string) => {
    let params: Record<string, unknown> = {};
    try {
      params = JSON.parse(actionParams);
    } catch { /* ignore */ }
    const die = activePlayer.dice.find((d) => d.id === dieId);
    dispatch({
      type: "RESOLVE_DIE",
      playerId: activePlayer.id,
      unitId: die?.assignedTo ?? activePlayer.ship.id,
      dieId,
      actionType: actionType as ActionType,
      parameters: params,
    });
  };

  return (
    <div style={controlsStyle}>
      <div style={phaseTitle}>Resolve Phase</div>
      <div style={{ color: "#88aa88", marginBottom: "8px" }}>
        Active: <span style={{ color: activePlayer.color }}>{activePlayer.name}</span>
        {" "}— {assignedDice.length} dice remaining
      </div>

      {assignedDice.length > 0 && (
        <>
          <div style={{ marginBottom: "6px" }}>
            <label style={{ color: "#667788", fontSize: "11px" }}>
              Action type:{" "}
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value)}
                style={selectStyle}
              >
                <option value="">--select--</option>
                <optgroup label="Ship">
                  <option value="burn-small">Burn (Small)</option>
                  <option value="burn-big">Burn (Big)</option>
                  <option value="burn-max">Burn (Max)</option>
                  <option value="launch">Launch</option>
                  <option value="recall">Recall</option>
                  <option value="stow">Stow</option>
                  <option value="scan">Scan</option>
                </optgroup>
                <optgroup label="Crew Generic">
                  <option value="crawl">Crawl</option>
                  <option value="push-off">Push Off</option>
                  <option value="thruster-burn">Thruster Burn</option>
                  <option value="haul">Haul</option>
                  <option value="rig-tether">Rig Tether</option>
                  <option value="scavenge">Scavenge</option>
                  <option value="brace">Brace</option>
                  <option value="shove">Shove</option>
                  <option value="tackle">Tackle</option>
                  <option value="embark">Embark</option>
                </optgroup>
                <optgroup label="Role-Locked">
                  <option value="cut">Cut</option>
                  <option value="grapple">Grapple</option>
                  <option value="breach">Breach</option>
                  <option value="heavy-haul">Heavy Haul</option>
                </optgroup>
              </select>
            </label>
          </div>
          <div style={{ marginBottom: "6px" }}>
            <label style={{ color: "#667788", fontSize: "11px" }}>
              Params (JSON):{" "}
              <input
                type="text"
                value={actionParams}
                onChange={(e) => setActionParams(e.target.value)}
                style={inputStyle}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {assignedDice.map((die) => (
              <button
                key={die.id}
                onClick={() => handleResolve(die.id)}
                disabled={!actionType}
                style={actionBtn(!!actionType)}
                title={`Die ${die.value} on ${die.assignedTo}`}
              >
                Resolve [{die.value}] on {die.assignedTo}
              </button>
            ))}
          </div>
        </>
      )}

      {assignedDice.length === 0 && (
        <button onClick={() => dispatch({ type: "ADVANCE_PHASE" })} style={advanceBtn}>
          Proceed to Drift →
        </button>
      )}
    </div>
  );
}

function DriftPhase() {
  const dispatch = useGameStore((s) => s.dispatch);

  return (
    <div style={controlsStyle}>
      <div style={phaseTitle}>Drift Phase</div>
      <button onClick={() => {
        dispatch({ type: "RUN_DRIFT" });
        setTimeout(() => dispatch({ type: "ADVANCE_PHASE" }), 100);
      }} style={advanceBtn}>
        Run Drift →
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

const selectStyle: React.CSSProperties = {
  background: "#111122",
  border: "1px solid #334455",
  color: "#aabbcc",
  padding: "3px 6px",
  fontFamily: "monospace",
  fontSize: "11px",
  borderRadius: "3px",
};

const inputStyle: React.CSSProperties = {
  background: "#111122",
  border: "1px solid #334455",
  color: "#aabbcc",
  padding: "3px 6px",
  fontFamily: "monospace",
  fontSize: "11px",
  borderRadius: "3px",
  width: "200px",
};
