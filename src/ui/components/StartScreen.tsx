import { useState } from "react";
import { useGameStore } from "../store";

type PlayerConfig = {
  name: string;
  isAI: boolean;
  personality: "aggressive" | "cautious" | "opportunistic";
};

export function StartScreen() {
  const startGame = useGameStore((s) => s.startGame);
  const [playerCount, setPlayerCount] = useState(2);
  const [seed, setSeed] = useState(() => `game-${Date.now()}`);
  const [players, setPlayers] = useState<PlayerConfig[]>([
    { name: "You", isAI: false, personality: "aggressive" },
    { name: "AI Opponent", isAI: true, personality: "aggressive" },
    { name: "AI Player 3", isAI: true, personality: "cautious" },
    { name: "AI Player 4", isAI: true, personality: "opportunistic" },
  ]);

  const updatePlayer = (idx: number, patch: Partial<PlayerConfig>) => {
    setPlayers((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const handleStart = () => {
    const active = players.slice(0, playerCount);
    startGame(
      seed,
      playerCount,
      active.map((p) => p.name),
      active.map((p) => ({
        isAI: p.isAI,
        personality: p.isAI ? p.personality : undefined,
      }))
    );
  };

  const handleSandbox = () => {
    startGame(seed, 2, ["Sandbox Player", "Dummy"], [
      { isAI: false },
      { isAI: true, personality: "cautious" },
    ]);
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

      <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "360px" }}>
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
            style={{ ...inputStyle, width: "180px" }}
          />
        </label>

        <div style={{ borderTop: "1px solid #222244", paddingTop: "12px" }}>
          <div style={{ color: "#667788", fontSize: "11px", marginBottom: "8px" }}>Player Setup:</div>
          {players.slice(0, playerCount).map((p, i) => (
            <div key={i} style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
              marginBottom: "6px",
              padding: "6px",
              background: "#111122",
              borderRadius: "4px",
              border: `1px solid ${["#e74c3c", "#3498db", "#2ecc71", "#f39c12"][i]}33`,
            }}>
              <div style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: ["#e74c3c", "#3498db", "#2ecc71", "#f39c12"][i],
              }} />
              <input
                type="text"
                value={p.name}
                onChange={(e) => updatePlayer(i, { name: e.target.value })}
                style={{ ...inputStyle, width: "100px", padding: "3px 6px" }}
              />
              <select
                value={p.isAI ? "ai" : "human"}
                onChange={(e) => updatePlayer(i, { isAI: e.target.value === "ai" })}
                style={{ ...inputStyle, padding: "3px 4px", fontSize: "11px" }}
              >
                <option value="human">Human</option>
                <option value="ai">AI</option>
              </select>
              {p.isAI && (
                <select
                  value={p.personality}
                  onChange={(e) => updatePlayer(i, { personality: e.target.value as PlayerConfig["personality"] })}
                  style={{ ...inputStyle, padding: "3px 4px", fontSize: "11px" }}
                >
                  <option value="aggressive">Aggressive</option>
                  <option value="cautious">Cautious</option>
                  <option value="opportunistic">Opportunistic</option>
                </select>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
          <button onClick={handleStart} style={startBtn}>
            START GAME
          </button>
          <button onClick={handleSandbox} style={{ ...startBtn, background: "#332244", borderColor: "#554466", color: "#aa88cc" }}>
            SANDBOX
          </button>
        </div>
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

const startBtn: React.CSSProperties = {
  flex: 1,
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
};
