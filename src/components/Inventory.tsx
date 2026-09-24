import type { Schedule } from "../schedule";
import { modelColor } from "../modelColor";

interface Props {
  schedule: Schedule;
}

interface Row {
  model: string;
  caliber: string;
  count: number;
  safetyMax: number;
}

export default function Inventory({ schedule }: Props) {
  const map = new Map<string, Row>();
  for (const t of schedule.timed) {
    const e = t.entry;
    const key = `${e.model}|${e.caliber}`;
    const row = map.get(key) ?? { model: e.model, caliber: e.caliber, count: 0, safetyMax: 0 };
    row.count += 1;
    row.safetyMax = Math.max(row.safetyMax, e.safetyM);
    map.set(key, row);
  }
  const rows = [...map.values()].sort((a, b) => b.count - a.count);

  return (
    <div className="inventory">
      <table>
        <thead>
          <tr>
            <th>烟花型号</th>
            <th>口径</th>
            <th>数量</th>
            <th>最大安全距离</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.model}-${r.caliber}`}>
              <td>
                <i className="inv-dot" style={{ background: modelColor(r.model) }} />
                {r.model}
              </td>
              <td>{r.caliber}</td>
              <td>{r.count}</td>
              <td>{r.safetyMax}m</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
