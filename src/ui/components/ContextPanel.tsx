import { useGameStore } from "../store";
import type { GameState, EntityId } from "../../engine/types";

export function ContextPanel() {
  const game = useGameStore((s) => s.game);
  const selectedId = useGameStore((s) => s.selectedEntityId);

  if (!game || !selectedId) {
    return (
      <div style={panelStyle}>
        <div style={{ color: "#445566", fontStyle: "italic" }}>
          Click an entity to inspect
        </div>
      </div>
    );
  }

  const info = getEntityInfo(game, selectedId);
  if (!info) {
    return (
      <div style={panelStyle}>
        <div style={{ color: "#445566" }}>Entity not found</div>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      <div style={{ fontWeight: "bold", color: info.color, marginBottom: "8px" }}>
        {info.label}
      </div>
      {info.details.map((d, i) => (
        <div key={i} style={{ marginBottom: "4px" }}>
          <span style={{ color: "#667788" }}>{d.key}: </span>
          <span style={{ color: "#aabbcc" }}>{d.value}</span>
        </div>
      ))}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  padding: "12px",
  background: "#0d0d1a",
  borderTop: "1px solid #222244",
  borderLeft: "1px solid #222244",
  color: "#bbb",
  fontFamily: "monospace",
  fontSize: "12px",
  minWidth: "180px",
  maxWidth: "220px",
  overflow: "auto",
};

interface EntityInfo {
  label: string;
  color: string;
  details: Array<{ key: string; value: string }>;
}

function getEntityInfo(game: GameState, id: EntityId): EntityInfo | null {
  // Ship
  for (const player of Object.values(game.players)) {
    if (player.ship.id === id) {
      const ship = player.ship;
      return {
        label: `${player.name}'s Ship`,
        color: player.color,
        details: [
          { key: "Position", value: `(${ship.position.x.toFixed(1)}, ${ship.position.z.toFixed(1)})` },
          { key: "Velocity", value: velLabel(ship.velocity.magnitude) },
          { key: "Hold", value: `${ship.holdMass}/6 mass` },
          { key: "Anchors", value: `${ship.hullAnchors.filter((a) => a.inUse).length}/${ship.hullAnchors.length} used` },
          { key: "Dice", value: `${ship.dicePool.length} assigned` },
        ],
      };
    }
  }

  // Crew
  for (const player of Object.values(game.players)) {
    for (const crew of Object.values(player.crews)) {
      if (crew.id === id) {
        const posLabel =
          crew.position === "embarked" ? "Embarked" :
          `(${(crew.position as { x: number; z: number }).x.toFixed(1)}, ${(crew.position as { x: number; z: number }).z.toFixed(1)})`;
        return {
          label: `${player.name}'s ${crew.role}`,
          color: player.color,
          details: [
            { key: "State", value: crew.state },
            { key: "Position", value: posLabel },
            { key: "Velocity", value: velLabel(crew.velocity.magnitude) },
            { key: "Carrying", value: `${crew.carrying.length} piece${crew.carrying.length !== 1 ? "s" : ""}` },
            { key: "Tethers", value: `${crew.tetherIds.length}` },
            { key: "On terrain", value: crew.onTerrainId ?? "No" },
          ],
        };
      }
    }
  }

  // Wreck
  for (const wreck of game.table.wrecks) {
    if (wreck.id === id) {
      return {
        label: `Wreck (${wreck.shape.type})`,
        color: "#887766",
        details: [
          { key: "Role", value: wreck.isRoleRevealed ? wreck.role : "Hidden" },
          { key: "Position", value: `(${wreck.position.x.toFixed(1)}, ${wreck.position.z.toFixed(1)})` },
          { key: "Ext. salvage", value: `${wreck.exteriorSalvageIds.length}` },
          { key: "Compartments", value: `${wreck.compartments.filter((c) => c.isSealed).length} sealed` },
        ],
      };
    }
  }

  // Salvage
  for (const salvage of game.table.looseSalvage) {
    if (salvage.id === id) {
      return {
        label: `${salvage.type.charAt(0).toUpperCase() + salvage.type.slice(1)} Salvage`,
        color: salvage.type === "premium" ? "#ff6644" : salvage.type === "wreck" ? "#ccaa22" : "#44cc44",
        details: [
          { key: "VP", value: `${salvage.vp}` },
          { key: "Mass", value: `${salvage.mass}` },
          { key: "Attached", value: salvage.isAttached ? "Yes" : "No" },
          { key: "Face down", value: salvage.isFaceDown ? "Yes" : "No" },
        ],
      };
    }
  }

  return null;
}

function velLabel(mag: number): string {
  switch (mag) {
    case 0: return "Stopped";
    case 1: return "Short";
    case 2: return "Medium";
    case 3: return "Long";
    default: return `${mag}`;
  }
}
