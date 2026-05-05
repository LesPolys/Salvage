import { useGameStore } from "./ui/store";
import { PlayfieldScene } from "./ui/scene/PlayfieldScene";
import { HeaderBar } from "./ui/components/HeaderBar";
import { PlayerPanel } from "./ui/components/PlayerPanel";
import { ContextPanel } from "./ui/components/ContextPanel";
import { PhaseControls } from "./ui/components/PhaseControls";
import { StartScreen } from "./ui/components/StartScreen";
import { DebugOverlay } from "./ui/components/DebugOverlay";

function App() {
  const isStarted = useGameStore((s) => s.isStarted);

  if (!isStarted) {
    return <StartScreen />;
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      overflow: "hidden",
      background: "#0a0a1a",
    }}>
      <HeaderBar />
      <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>
        <DebugOverlay />
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1 }}>
            <PlayfieldScene />
          </div>
          <PhaseControls />
          <PlayerPanel />
        </div>
        <ContextPanel />
      </div>
    </div>
  );
}

export default App;
