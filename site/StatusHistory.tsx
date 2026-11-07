import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ComponentState, StatusDocument, formatHistoryDate, historyLabels, statusHistory } from "./status-document";

const colours: Record<ComponentState, string> = {
  operational: "bg-green-600",
  degraded: "bg-amber-500",
  outage: "bg-red-600",
  maintenance: "bg-blue-600",
  unknown: "bg-gray-200",
};

export default function StatusHistory({ doc, now, onIncident }: {
  doc: StatusDocument;
  now: Date;
  onIncident: (id: string) => void;
}) {
  const days = statusHistory(doc, now);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const index = Math.max(0, days.findIndex(day => day.date === selectedDate));
  const selected = selectedDate && days.some(day => day.date === selectedDate) ? days[index] : days[days.length - 1];
  const selectedIndex = days.indexOf(selected);
  const move = (offset: number) => setSelectedDate(days[Math.max(0, Math.min(days.length - 1, selectedIndex + offset))].date);
  const control = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-2 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40";

  return <div className="mt-4 rounded-lg border p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-gray-600">Reported incidents · Last 90 days · UTC</p>
      <div className="flex items-center gap-2">
        <button type="button" className={control} aria-label="Previous day" disabled={selectedIndex === 0} onClick={() => move(-1)}><ChevronLeft size={18} aria-hidden="true" /></button>
        <label className="sr-only" htmlFor="history-date">View status for a date</label>
        <input id="history-date" type="date" min={days[0].date} max={days[days.length - 1].date} value={selected.date}
          onChange={event => { if (days.some(day => day.date === event.target.value)) setSelectedDate(event.target.value); }}
          className="min-h-11 min-w-0 rounded-md border bg-background px-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" />
        <button type="button" className={control} aria-label="Next day" disabled={selectedIndex === days.length - 1} onClick={() => move(1)}><ChevronRight size={18} aria-hidden="true" /></button>
      </div>
    </div>
    <div className="mt-4 grid gap-px" style={{ gridTemplateColumns: "repeat(90, minmax(0, 1fr))" }} role="group" aria-label="Daily reported status. Use arrow keys or the date field to choose a day.">
      {days.map((day, position) => <button type="button" key={day.date} data-day={day.date}
        aria-label={`${formatHistoryDate(day.date)} UTC: ${historyLabels[day.state]}`}
        aria-pressed={day === selected} tabIndex={day === selected ? 0 : -1}
        title={`${formatHistoryDate(day.date)}: ${historyLabels[day.state]}`}
        onClick={() => setSelectedDate(day.date)}
        onKeyDown={event => {
          const next = event.key === "ArrowLeft" ? Math.max(0, position - 1) : event.key === "ArrowRight" ? Math.min(days.length - 1, position + 1) : event.key === "Home" ? 0 : event.key === "End" ? days.length - 1 : null;
          if (next === null) return;
          event.preventDefault();
          setSelectedDate(days[next].date);
          (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
        }}
        className={`h-8 min-w-0 rounded-sm ${colours[day.state]} ${day === selected ? "ring-2 ring-foreground ring-offset-2" : ""} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`} />)}
    </div>
    <div className="mt-2 flex justify-between text-xs text-gray-600"><span>{formatHistoryDate(days[0].date)}</span><span>Today</span></div>
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-600" aria-label="History legend">
      {(Object.keys(colours) as ComponentState[]).map(state => <li key={state} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${colours[state]}`} />{historyLabels[state]}</li>)}
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
    {doc.historyStartedAt && <p className="mt-4 text-xs text-gray-600">Incident tracking began {formatHistoryDate(doc.historyStartedAt)}. Earlier days without incident records are shown in grey.</p>}
  </div>;
}
