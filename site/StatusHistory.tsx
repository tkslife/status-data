import React, { useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ComponentState, StatusDocument, formatHistoryDate, historyLabels, statusHistory } from "./status-document";
import HistoryCalendar from "./HistoryCalendar";

const colours: Record<ComponentState, { background: string; fill: string }> = {
  operational: { background: "bg-green-600", fill: "fill-green-600" },
  degraded: { background: "bg-amber-500", fill: "fill-amber-500" },
  outage: { background: "bg-red-600", fill: "fill-red-600" },
  maintenance: { background: "bg-blue-600", fill: "fill-blue-600" },
  unknown: { background: "bg-gray-200", fill: "fill-gray-200" },
};

export default function StatusHistory({ doc, now, onIncident }: {
  doc: StatusDocument;
  now: Date;
  onIncident: (id: string) => void;
}) {
  const days = statusHistory(doc, now);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [barPixels, setBarPixels] = useState<{ width: number; positions: number[] } | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  useLayoutEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    const measure = () => {
      const scale = window.devicePixelRatio || 1;
      const left = timeline.getBoundingClientRect().left;
      const cells = Array.from(timeline.querySelectorAll<HTMLButtonElement>("button[data-day]"), cell => cell.getBoundingClientRect());
      if (!cells.length) return;
      // Fractional grid tracks paint unevenly. Give every bar the same device-pixel width and align its edges.
      const width = Math.max(1, Math.floor(Math.min(...cells.map(cell => cell.width)) * scale)) / scale;
      const positions = cells.map(cell => Math.round(cell.left * scale) / scale - left);
      setBarPixels(previous => previous?.width === width && previous.positions.every((position, index) => position === positions[index])
        ? previous : { width, positions });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(timeline);
    observer.observe(document.documentElement);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const index = Math.max(0, days.findIndex(day => day.date === selectedDate));
  const selected = selectedDate && days.some(day => day.date === selectedDate) ? days[index] : days[days.length - 1];
  const selectedIndex = days.indexOf(selected);
  const move = (offset: number) => setSelectedDate(days[Math.max(0, Math.min(days.length - 1, selectedIndex + offset))].date);
  const control = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-2 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40";

  return <div className="mt-4 min-w-0 rounded-lg border p-4 sm:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-gray-600">Last 90 days · UTC</p>
      <div className="flex w-full items-center gap-2 sm:w-auto sm:self-start">
        <button type="button" className={control} aria-label="Previous day" disabled={selectedIndex === 0} onClick={() => move(-1)}><ChevronLeft size={18} aria-hidden="true" /></button>
        <HistoryCalendar min={days[0].date} max={days[days.length - 1].date} value={selected.date} onChange={setSelectedDate} />
        <button type="button" className={control} aria-label="Next day" disabled={selectedIndex === days.length - 1} onClick={() => move(1)}><ChevronRight size={18} aria-hidden="true" /></button>
      </div>
    </div>
    <div className="relative mt-5">
      {/* One SVG keeps fractional display scaling consistent across every bar. Buttons retain date selection and focus. */}
      {barPixels && <svg aria-hidden="true" width="100%" height="32" shapeRendering="geometricPrecision" className="pointer-events-none absolute left-0 top-0 overflow-visible">
        {days.map((day, position) => <rect key={day.date} x={barPixels.positions[position]} width={barPixels.width} height="32" rx="2"
          className={colours[day.state].fill} opacity={hoveredDate === day.date ? 0.7 : 1} />)}
      </svg>}
      <div ref={timelineRef} className="grid gap-px" style={{ gridTemplateColumns: "repeat(90, minmax(0, 1fr))" }} role="group" aria-label="Daily reported status. Use arrow keys or the calendar to choose a day.">
        {days.map((day, position) => <button type="button" key={day.date} data-day={day.date}
          aria-label={`${formatHistoryDate(day.date)} UTC: ${historyLabels[day.state]}`}
          aria-pressed={day === selected} tabIndex={day === selected ? 0 : -1}
          title={`${formatHistoryDate(day.date)}: ${historyLabels[day.state]}`}
          onClick={() => setSelectedDate(day.date)}
          onMouseEnter={() => setHoveredDate(day.date)} onMouseLeave={() => setHoveredDate(null)}
          onKeyDown={event => {
            const next = event.key === "ArrowLeft" ? Math.max(0, position - 1) : event.key === "ArrowRight" ? Math.min(days.length - 1, position + 1) : event.key === "Home" ? 0 : event.key === "End" ? days.length - 1 : null;
            if (next === null) return;
            event.preventDefault();
            setSelectedDate(days[next].date);
            (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
          }}
          className="flex min-w-0 flex-col items-stretch pb-1 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-1">
          <span aria-hidden="true" className="h-8" />
          <span aria-hidden="true" className={`mt-1 h-1 rounded-sm ${day === selected ? "bg-foreground" : "bg-transparent"}`} />
        </button>)}
      </div>
    </div>
    <div className="mt-2 flex justify-between text-xs text-gray-600"><span>{formatHistoryDate(days[0].date)}</span><span>Today</span></div>
    <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-gray-600 sm:flex sm:flex-wrap" aria-label="History legend">
      {(Object.keys(colours) as ComponentState[]).map(state => <li key={state} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${colours[state].background}`} />{historyLabels[state]}</li>)}
    </ul>
    <div className="mt-5 border-t pt-4" aria-live="polite" aria-atomic="true">
      <h3 className="font-medium">{formatHistoryDate(selected.date)} <span className="text-sm text-gray-600">UTC</span></h3>
      <p className="mt-1 text-sm text-gray-600">{historyLabels[selected.state]}.</p>
      {selected.coverage === "partial" && <p className="mt-1 text-sm text-gray-600">Tracking began partway through this date; earlier activity may be incomplete.</p>}
      {selected.coverage === "none" && (selected.incidents.length > 0 || selected.maintenance.length > 0) && <p className="mt-1 text-sm text-gray-600">These events are recorded; other activity on this date is not.</p>}
      {selected.incidents.length > 0 && <ul className="mt-3 space-y-2">{selected.incidents.map(incident => <li key={incident.id}>
        <button type="button" className="min-h-11 text-left text-sm underline underline-offset-2 focus-visible:outline focus-visible:outline-2" onClick={() => onIncident(incident.id)}>{incident.title}</button>
        {!incident.severity && <p className="text-xs text-gray-600">Severity was not recorded.</p>}
      </li>)}</ul>}
      {selected.maintenance.map(window => <p key={window.id} className="mt-2 text-sm">{window.title}: {window.impact}</p>)}
    </div>
    {doc.historyStartedAt && <p className="mt-4 text-xs text-gray-600">Tracking since {formatHistoryDate(doc.historyStartedAt)}. Grey days have no records.</p>}
  </div>;
}
