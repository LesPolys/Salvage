import { useGameStore } from "../store";

export function HeaderBar() {
  const game = useGameStore((s) => s.game);
  const toggleDebug = useGameStore((s) => s.toggleDebug);
  const toggleGrid = useGameStore((s) => s.toggleGrid);
  const showDebug = useGameStore((s) => s.showDebug);
  const showGrid = useGameStore((s) => s.showGrid);

  if (!game) return null;

  const phaseLabel = game.meta.phase.charAt(0).toUpperCase() + game.meta.phase.slice(1);
  const activePlayer = game.players[game.meta.activePlayerId];

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 16px",
      background: "#111122",
      borderBottom: "1px solid #222244",
      color: "#ccc",
      fontFamily: "monospace",
      fontSize: "13px",
    }}>
      <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
        <span style={{ color: "#667788", fontWeight: "bold" }}>SALVAGE</span>
        <span>Round {game.meta.round}/6</span>
        <span style={{
          padding: "2px 8px",
          background: "#222244",
          borderRadius: "3px",
          color: "#aabbcc",
        }}>
          {phaseLabel}
        </span>
        {activePlayer && (
          <span>
            Active:{" "}
            <span style={{ color: activePlayer.color, fontWeight: "bold" }}>
              {activePlayer.name}
            </span>
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        {/* Scores */}
        {Object.values(game.players).map((p) => (
          <span key={p.id} style={{ color: p.color }}>
            {p.name}: {p.score} VP
          </span>
        ))}

        <span style={{ color: "#333", margin: "0 4px" }}>|</span>

        <button
          onClick={toggleGrid}
          style={btnStyle(showGrid)}
        >
          Grid
        </button>
        <button
          onClick={toggleDebug}
          style={btnStyle(showDebug)}
        >
          Debug
        </button>
      </div>
    </div>
  );
}

function btnStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? "#334455" : "transparent",
    border: "1px solid #334455",
    color: active ? "#aabbcc" : "#556677",
    padding: "2px 8px",
    borderRadius: "3px",
    cursor: "pointer",
    fontFamily: "monospace",
    fontSize: "11px",
  };
}
