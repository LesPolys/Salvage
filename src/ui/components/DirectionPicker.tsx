import { useState, useRef } from "react";

interface DirectionPickerProps {
  onSelect: (radians: number) => void;
  onCancel: () => void;
  label?: string;
}

export function DirectionPicker({ onSelect, onCancel, label }: DirectionPickerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [angle, setAngle] = useState<number | null>(null);
  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 55;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left - cx;
    const my = e.clientY - rect.top - cy;
    setAngle(Math.atan2(my, mx));
  };

  const handleClick = () => {
    if (angle !== null) {
      // Convert screen angle (y-down) to game angle (z = screen-y)
      onSelect(angle);
    }
  };

  const arrowX = angle !== null ? cx + Math.cos(angle) * radius : cx;
  const arrowY = angle !== null ? cy + Math.sin(angle) * radius : cy;

  return (
    <div style={{
      background: "#111122",
      border: "1px solid #334455",
      borderRadius: "6px",
      padding: "8px",
      display: "inline-flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "6px",
    }}>
      {label && (
        <div style={{ color: "#88aacc", fontSize: "11px", fontFamily: "monospace" }}>
          {label}
        </div>
      )}
      <svg
        ref={svgRef}
        width={size}
        height={size}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        style={{ cursor: "crosshair" }}
      >
        {/* Background circle */}
        <circle cx={cx} cy={cy} r={radius + 5} fill="#0a0a1a" stroke="#222244" strokeWidth={1} />
        {/* Compass lines */}
        {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((a, i) => (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={cx + Math.cos(a) * radius}
            y2={cy + Math.sin(a) * radius}
            stroke="#1a1a2e"
            strokeWidth={1}
          />
        ))}
        {/* Center dot */}
        <circle cx={cx} cy={cy} r={3} fill="#445566" />
        {/* Direction arrow */}
        {angle !== null && (
          <>
            <line
              x1={cx}
              y1={cy}
              x2={arrowX}
              y2={arrowY}
              stroke="#88cc88"
              strokeWidth={2}
            />
            <circle cx={arrowX} cy={arrowY} r={4} fill="#88cc88" />
          </>
        )}
        {/* Cardinal labels */}
        <text x={cx + radius + 10} y={cy + 4} fill="#556677" fontSize="10" fontFamily="monospace">E</text>
        <text x={cx - radius - 14} y={cy + 4} fill="#556677" fontSize="10" fontFamily="monospace">W</text>
        <text x={cx - 3} y={cy - radius - 6} fill="#556677" fontSize="10" fontFamily="monospace">N</text>
        <text x={cx - 3} y={cy + radius + 14} fill="#556677" fontSize="10" fontFamily="monospace">S</text>
      </svg>
      <div style={{ display: "flex", gap: "6px" }}>
        <button onClick={handleClick} disabled={angle === null} style={pickerBtn(angle !== null)}>
          Confirm
        </button>
        <button onClick={onCancel} style={pickerBtn(true)}>
          Cancel
        </button>
      </div>
      {angle !== null && (
        <div style={{ color: "#667788", fontSize: "10px", fontFamily: "monospace" }}>
          {(angle * 180 / Math.PI).toFixed(0)}°
        </div>
      )}
    </div>
  );
}

function pickerBtn(active: boolean): React.CSSProperties {
  return {
    background: active ? "#223344" : "#151520",
    border: "1px solid #334455",
    color: active ? "#aabbcc" : "#445566",
    padding: "3px 10px",
    borderRadius: "3px",
    cursor: active ? "pointer" : "default",
    fontFamily: "monospace",
    fontSize: "11px",
  };
}
