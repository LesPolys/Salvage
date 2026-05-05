import { useState } from "react";
import { useGameStore } from "../store";
import type { GameState } from "../../engine/types";
import { RULES } from "../../config/rules";

export function DebugOverlay() {
  const game = useGameStore((s) => s.game);
  const showDebug = useGameStore((s) => s.showDebug);
  const dispatch = useGameStore((s) => s.dispatch);
  const [stateJson, setStateJson] = useState("");

  if (!showDebug || !game) return null;

  return (
    <div style={overlayStyle}>
      <div style={{ fontWeight: "bold", color: "#88aacc", marginBottom: "8px" }}>
        Debug Panel
      </div>

      {/* Game state summary */}
      <Section title="State">
        <Row label="Seed" value={game.meta.seed} />
        <Row label="Round" value={`${game.meta.round}/${RULES.rounds.total}`} />
        <Row label="Phase" value={game.meta.phase} />
        <Row label="Active" value={game.meta.activePlayerId} />
        <Row label="Tethers" value={`${game.tethers.length}`} />
        <Row label="Loose salvage" value={`${game.table.looseSalvage.length}`} />
        <Row label="Debris" value={`${game.table.debris.length}`} />
      </Section>

      {/* Hidden info */}
      <Section title="Hidden Info">
        {game.table.wrecks.map((w) => (
          <Row key={w.id} label={w.id} value={`Role: ${w.role} (${w.isRoleRevealed ? "revealed" : "hidden"})`} />
        ))}
        {game.table.looseSalvage
          .filter((s) => s.isFaceDown)
          .slice(0, 8)
          .map((s) => (
            <Row key={s.id} label={s.id} value={`${s.type} (${s.vp}VP, face-down)`} />
          ))}
      </Section>

      {/* Player details */}
      <Section title="Players">
        {Object.values(game.players).map((p) => (
          <div key={p.id} style={{ marginBottom: "6px" }}>
            <div style={{ color: p.color, fontWeight: "bold" }}>{p.name}</div>
            <Row label="Score" value={`${p.score}`} />
            <Row label="Hold" value={`${p.ship.holdMass}/6 (${p.ship.hold.length} pieces)`} />
            <Row label="Dice" value={p.dice.map((d) => `${d.value}(${d.state[0]})`).join(" ")} />
            <Row label="Lost crew" value={`${Object.values(p.crews).filter((c) => c.state === "lost").length}`} />
          </div>
        ))}
      </Section>

      {/* Manual phase controls */}
      <Section title="Controls">
        <button onClick={() => dispatch({ type: "ADVANCE_PHASE" })} style={debugBtn}>
          Force Advance Phase
        </button>
        {game.meta.phase === "drift" && (
          <button onClick={() => dispatch({ type: "RUN_DRIFT" })} style={debugBtn}>
            Force Run Drift
          </button>
        )}
        <button onClick={() => dispatch({ type: "END_GAME" })} style={debugBtn}>
          Force End Game
        </button>
      </Section>

      {/* State export */}
      <Section title="Export">
        <button
          onClick={() => {
            const json = JSON.stringify(game, null, 2);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `salvage-${game.meta.seed}-r${game.meta.round}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          style={debugBtn}
        >
          Download State JSON
        </button>
        <button
          onClick={() => {
            navigator.clipboard.writeText(JSON.stringify(game, null, 2));
          }}
          style={debugBtn}
        >
          Copy State to Clipboard
        </button>
      </Section>

      {/* State import */}
      <Section title="Import State">
        <textarea
          value={stateJson}
          onChange={(e) => setStateJson(e.target.value)}
          placeholder="Paste GameState JSON..."
          style={{
            ...inputStyle,
            width: "100%",
            height: "60px",
            resize: "vertical",
          }}
        />
        <button
          onClick={() => {
            try {
              const loaded = JSON.parse(stateJson) as GameState;
              // We need to set the game directly via the store
              useGameStore.setState({ game: loaded });
            } catch (e) {
              console.error("Failed to parse state:", e);
            }
          }}
          style={debugBtn}
        >
          Load State
        </button>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginBottom: "8px" }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ color: "#667788", cursor: "pointer", fontSize: "11px", fontWeight: "bold" }}
      >
        {open ? "▼" : "▶"} {title}
      </div>
      {open && <div style={{ paddingLeft: "8px", marginTop: "4px" }}>{children}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ fontSize: "10px", marginBottom: "2px" }}>
      <span style={{ color: "#556677" }}>{label}: </span>
      <span style={{ color: "#99aabb" }}>{value}</span>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "absolute",
  top: "40px",
  right: "230px",
  width: "260px",
  maxHeight: "calc(100vh - 60px)",
  overflow: "auto",
  background: "rgba(10, 10, 26, 0.95)",
  border: "1px solid #222244",
  borderRadius: "4px",
  padding: "10px",
  fontFamily: "monospace",
  fontSize: "11px",
  color: "#bbb",
  zIndex: 100,
};

const debugBtn: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: "4px",
  padding: "4px 8px",
  background: "#1a1a2e",
  border: "1px solid #334455",
  color: "#88aacc",
  borderRadius: "3px",
  cursor: "pointer",
  fontFamily: "monospace",
  fontSize: "10px",
  textAlign: "left",
};

const inputStyle: React.CSSProperties = {
  background: "#111122",
  border: "1px solid #334455",
  color: "#aabbcc",
  padding: "4px 6px",
  fontFamily: "monospace",
  fontSize: "10px",
  borderRadius: "3px",
};
