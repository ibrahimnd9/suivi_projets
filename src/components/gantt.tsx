import { formatDate } from "@/components/ui";

export type GanttRow = {
  id: string;
  name: string;
  depth: number;
  start: Date | null;
  end: Date | null;
  progress: number;
  late: boolean;
  isContainer: boolean;
};

export type GanttMarker = { id: string; name: string; date: Date; reached: boolean };

const DAY = 86_400_000;

/** Diagramme de Gantt simple : barres positionnées sur l'amplitude du projet. */
export function Gantt({ rows, markers = [], now }: { rows: GanttRow[]; markers?: GanttMarker[]; now: Date }) {
  const dated = rows.filter((r) => r.start && r.end);
  if (dated.length === 0) {
    return (
      <p className="px-5 py-8 text-center text-sm text-zinc-500">
        Renseignez des dates de début et de fin pour afficher le diagramme.
      </p>
    );
  }

  const min = Math.min(...dated.map((r) => r.start!.getTime()), ...markers.map((m) => m.date.getTime()));
  const max = Math.max(...dated.map((r) => r.end!.getTime()), ...markers.map((m) => m.date.getTime()));
  const span = Math.max(DAY, max - min);
  const percent = (time: number) => ((time - min) / span) * 100;

  const today = now.getTime();
  const todayVisible = today >= min && today <= max;

  // Repères : début de chaque mois couvert
  const ticks: { label: string; left: number }[] = [];
  const cursor = new Date(min);
  cursor.setUTCDate(1);
  while (cursor.getTime() <= max) {
    if (cursor.getTime() >= min) {
      ticks.push({
        label: new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(cursor),
        left: percent(cursor.getTime()),
      });
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[46rem]">
        <div className="flex border-b border-zinc-200 pb-1 text-[11px] text-zinc-400">
          <div className="w-64 shrink-0">Élément</div>
          <div className="relative h-4 flex-1">
            {ticks.map((tick) => (
              <span key={tick.label} className="absolute -translate-x-1/2" style={{ left: `${tick.left}%` }}>
                {tick.label}
              </span>
            ))}
          </div>
        </div>

        <div className="relative">
          {todayVisible && (
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-10 border-l-2 border-dashed border-red-400"
              style={{ left: `calc(16rem + ${percent(today)}% * (100% - 16rem) / 100%)` }}
              title="Aujourd’hui"
            />
          )}

          {rows.map((row) => {
            const hasDates = row.start && row.end;
            const left = hasDates ? percent(row.start!.getTime()) : 0;
            const width = hasDates ? Math.max(0.8, percent(row.end!.getTime() + DAY) - left) : 0;
            return (
              <div key={row.id} className="flex items-center border-b border-zinc-50 py-1.5">
                <div
                  className={`w-64 shrink-0 truncate pr-3 text-xs ${row.isContainer ? "font-semibold text-brand-800" : "text-zinc-700"}`}
                  style={{ paddingLeft: `${row.depth * 12}px` }}
                  title={row.name}
                >
                  {row.name}
                </div>
                <div className="relative h-5 flex-1">
                  {hasDates && (
                    <div
                      className={`absolute top-0.5 h-4 overflow-hidden rounded ${
                        row.isContainer ? "bg-brand-200" : row.late ? "bg-red-200" : "bg-brand-100"
                      }`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${formatDate(row.start)} → ${formatDate(row.end)} · ${Math.round(row.progress)} %`}
                    >
                      <div
                        className={`h-full ${row.isContainer ? "bg-brand-600" : row.late ? "bg-red-500" : "bg-brand-500"}`}
                        style={{ width: `${Math.max(0, Math.min(100, row.progress))}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {markers.length > 0 && (
            <div className="flex items-center pt-2">
              <div className="w-64 shrink-0 pr-3 text-xs font-semibold text-brand-800">Jalons</div>
              <div className="relative h-6 flex-1">
                {markers.map((marker) => (
                  <span
                    key={marker.id}
                    className={`absolute top-1 size-3 -translate-x-1/2 rotate-45 ${
                      marker.reached ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                    style={{ left: `${percent(marker.date.getTime())}%` }}
                    title={`${marker.name} — ${formatDate(marker.date)}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
