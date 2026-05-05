import type { GameSummary } from "./logger";

export function formatSummaryText(summary: GameSummary): string {
  const lines: string[] = [];
  lines.push(`=== SALVAGE Game Summary ===`);
  lines.push(`Seed: ${summary.seed}`);
  lines.push(`Players: ${summary.playerCount}`);
  lines.push(`Rounds: ${summary.totalRounds}`);
  lines.push(`Total events: ${summary.totalEvents}`);
  lines.push(``);

  lines.push(`--- Final Scores ---`);
  for (const [pid, score] of Object.entries(summary.finalScores)) {
    const personality = summary.personalities[pid];
    const stowed = summary.salvageStowed[pid];
    const lost = summary.crewLost[pid];
    lines.push(
      `  ${pid} (${personality}): ${score} VP | ${stowed.count} pieces (${stowed.vp} VP) | ${lost} crew lost`
    );
  }
  lines.push(``);

  lines.push(`--- Resist Stats ---`);
  lines.push(
    `  Attempted: ${summary.resistStats.attempted} | Successful: ${summary.resistStats.successful}`
  );
  lines.push(``);

  lines.push(`--- Action Counts ---`);
  for (const [pid, actions] of Object.entries(summary.actionCounts)) {
    lines.push(`  ${pid}:`);
    for (const [action, count] of Object.entries(actions)) {
      lines.push(`    ${action}: ${count}`);
    }
  }

  return lines.join("\n");
}

export function downloadJSON(data: string, filename: string): void {
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
