import { useGameStore } from "../store";
import type { Player, Die } from "../../engine/types";

export function PlayerPanel() {
  const game = useGameStore((s) => s.game);
  if (!game) return null;

  const activePlayer = game.players[game.meta.activePlayerId];
  if (!activePlayer) return null;

  return (
    <div style={{
      padding: "12px",
      background: "#0d0d1a",
      borderTop: "1px solid #222244",
      color: "#bbb",
      fontFamily: "monospace",
      fontSize: "12px",
      display: "flex",
      gap: "20px",
      overflow: "auto",
    }}>
      <DicePool player={activePlayer} />
      <HoldDisplay player={activePlayer} />
      <CrewCards player={activePlayer} />
    </div>
  );
}

function DicePool({ player }: { player: Player }) {
  const game = useGameStore((s) => s.game);
  const phase = game?.meta.phase;

  return (
    <div style={{ minWidth: "120px" }}>
      <div style={{ color: "#667788", marginBottom: "6px", fontWeight: "bold" }}>
        Dice
      </div>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {player.dice.length === 0 && (
          <span style={{ color: "#445566" }}>
            {phase === "roll" ? "Not rolled" : "No dice"}
          </span>
        )}
        {player.dice.map((die) => (
          <DieChip key={die.id} die={die} />
        ))}
      </div>
      {player.rerollsRemaining > 0 && phase === "roll" && (
        <div style={{ marginTop: "6px", color: "#88aa66" }}>
          {player.rerollsRemaining} reroll{player.rerollsRemaining > 1 ? "s" : ""} available
        </div>
      )}
    </div>
  );
}

function DieChip({ die }: { die: Die }) {
  const stateColors: Record<string, string> = {
    rolled: "#334455",
    assigned: "#445566",
    spent: "#222233",
    forfeit: "#1a1a22",
  };
  const textColors: Record<string, string> = {
    rolled: "#eee",
    assigned: "#aabbcc",
    spent: "#556677",
    forfeit: "#333344",
  };

  return (
    <div style={{
      width: "28px",
      height: "28px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: stateColors[die.state] ?? "#222",
      color: textColors[die.state] ?? "#888",
      borderRadius: "4px",
      fontWeight: "bold",
      fontSize: "14px",
      border: die.state === "rolled" ? "1px solid #556677" : "1px solid transparent",
      cursor: die.state === "rolled" ? "grab" : "default",
      opacity: die.state === "forfeit" ? 0.4 : 1,
    }}
    title={`${die.value} (${die.state})${die.assignedTo ? ` → ${die.assignedTo}` : ""}`}
    >
      {die.value}
    </div>
  );
}

function HoldDisplay({ player }: { player: Player }) {
  const hold = player.ship.hold;
  const holdMass = player.ship.holdMass;

  return (
    <div style={{ minWidth: "100px" }}>
      <div style={{ color: "#667788", marginBottom: "6px", fontWeight: "bold" }}>
        Hold ({holdMass}/6)
      </div>
      {hold.length === 0 ? (
        <span style={{ color: "#445566" }}>Empty</span>
      ) : (
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {hold.map((s) => (
            <div key={s.id} style={{
              padding: "2px 6px",
              borderRadius: "3px",
              fontSize: "11px",
              background: s.type === "premium" ? "#442211" : s.type === "wreck" ? "#332211" : "#223311",
              color: s.type === "premium" ? "#ff8844" : s.type === "wreck" ? "#ccaa33" : "#66cc44",
            }}>
              {s.type.charAt(0).toUpperCase()}{s.mass}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CrewCards({ player }: { player: Player }) {
  const selectedId = useGameStore((s) => s.selectedEntityId);
  const selectEntity = useGameStore((s) => s.selectEntity);

  return (
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
      {Object.values(player.crews).map((crew) => (
        <div
          key={crew.id}
          onClick={() => selectEntity(crew.id)}
          style={{
            padding: "6px 10px",
            background: selectedId === crew.id ? "#1a2233" : "#111122",
            border: selectedId === crew.id ? `1px solid ${player.color}` : "1px solid #222233",
            borderRadius: "4px",
            cursor: "pointer",
            minWidth: "80px",
            opacity: crew.state === "lost" ? 0.3 : 1,
          }}
        >
          <div style={{ fontWeight: "bold", fontSize: "11px", color: player.color }}>
            {crew.role}
          </div>
          <div style={{ fontSize: "10px", color: "#778899", marginTop: "2px" }}>
            {crew.state === "lost" ? "LOST" :
             crew.position === "embarked" ? "Embarked" :
             crew.state === "grappled" ? "Grappled" :
             crew.onTerrainId ? "On terrain" : "In space"}
          </div>
          {crew.dicePool.length > 0 && (
            <div style={{ fontSize: "10px", color: "#88aa88", marginTop: "2px" }}>
              {crew.dicePool.length} dice
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
