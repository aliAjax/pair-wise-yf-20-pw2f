export function modelColor(model: string): string {
  if (model.includes("礼花弹")) return "#dc2626";
  if (model.includes("罗马烛光")) return "#f59e0b";
  if (model.includes("扇形架")) return "#1d4ed8";
  if (model.includes("冷焰")) return "#0891b2";
  return "#64748b";
}
