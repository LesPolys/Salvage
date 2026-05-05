import { useState } from "react";
import { useGameStore } from "../store";

export function StartScreen() {
  const startGame = useGameStore((s) => s.startGame);
  const [playerCount, setPlayerCount] = useState(2);
  const [seed, setSeed] = useState(() => `game-${Date.now()}`);

  const handleStart = () => {
    startGame(seed, playerCount);
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      background: "#0a0a1a",
      color: "#ccc",
      fontFamily: "monospace",
    }}>
      <h1 style={{ color: "#88aacc", fontSize: "36px", marginBottom: "4px", letterSpacing: "4px" }}>
        SALVAGE
      </h1>
      <p style={{ color: "#556677", marginBottom: "32px", fontSize: "13px" }}>
        Competing zero-g salvage crews — digital testbed
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "280px" }}>
        <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#667788" }}>Players:</span>
          <select
            value={playerCount}
            onChange={(e) => setPlayerCount(Number(e.target.value))}
            style={inputStyle}
          >
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </label>

        <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#667788" }}>Seed:</span>
          <input
            type="text"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            style={{ ...inputStyle, width: "160px" }}
          />
        </label>

        <button
          onClick={handleStart}
          style={{
            marginTop: "16px",
            padding: "12px 24px",
            background: "#224433",
            border: "1px solid #336644",
            color: "#88cc88",
            fontSize: "14px",
            fontWeight: "bold",
            borderRadius: "4px",
            cursor: "pointer",
            fontFamily: "monospace",
            letterSpacing: "2px",
          }}
        >
          START GAME
        </button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "#111122",
  border: "1px solid #334455",
  color: "#aabbcc",
  padding: "6px 10px",
  fontFamily: "monospace",
  fontSize: "13px",
  borderRadius: "3px",
};
