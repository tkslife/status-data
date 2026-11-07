import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { formatHistoryDate } from "./status-document";

const dayMs = 86_400_000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const monthOf = (date: string) => date.slice(0, 7);
const monthLabel = (month: string) => new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01`));

/** A bounded UTC calendar; dates match the history bars in every time zone. */
export default function HistoryCalendar({ value, min, max, onChange }: {
  value: string; min: string; max: string; onChange: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(monthOf(value));
  const [focused, setFocused] = useState(value);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState({ above: false, maxHeight: 420 });
  const id = useId();
  const first = new Date(`${month}-01`);
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  const cells = Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => {
    const number = index - offset + 1;
    return number > 0 && number <= count ? `${month}-${String(number).padStart(2, "0")}` : null;
  });
  const firstAvailable = cells.find(date => date && date >= min && date <= max);
  const tabDate = monthOf(focused) === month && focused >= min && focused <= max ? focused : firstAvailable;
  const focusDay = (date: string) => window.requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>(`[data-calendar-day="${date}"]`)?.focus());
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const choose = (date: string) => { onChange(date); close(); };
  const changeMonth = (delta: number) => setMonth(monthOf(iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + delta, 1)))));

  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const rect = root.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const useAbove = below < Math.min(panel.current?.scrollHeight ?? 420, 320) && above > below;
      const maxHeight = Math.max(120, useAbove ? above : below);
      setPlacement(previous => previous.above === useAbove && previous.maxHeight === maxHeight ? previous : { above: useAbove, maxHeight });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => { window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); };
  }, [open, month]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  const nav = "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border hover:bg-muted disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
  return <div ref={root} className="relative min-w-0 flex-1 sm:flex-none"
    onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}
    onKeyDown={event => { if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      aria-label={`Choose history date, ${formatHistoryDate(value)} UTC`}
      onClick={() => {
        if (open) { close(); return; }
        setMonth(monthOf(value)); setFocused(value); setOpen(true); focusDay(value);
      }}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
      <CalendarDays size={16} aria-hidden="true" /><span>{formatHistoryDate(value)}</span><ChevronDown size={14} aria-hidden="true" />
    </button>
    {open && <div ref={panel} id={id} role="dialog" aria-label="Choose history date" style={{ maxHeight: placement.maxHeight }} className={`absolute left-1/2 z-20 w-64 -translate-x-1/2 overflow-y-auto rounded-lg border bg-background p-3 shadow-md sm:left-0 sm:translate-x-0 ${placement.above ? "bottom-full mb-2" : "top-full mt-2"}`}>
      <div className="mb-2 flex items-center justify-between gap-1">
        <button type="button" className={nav} aria-label="Previous month" disabled={month <= monthOf(min)} onClick={() => changeMonth(-1)}><ChevronLeft size={16} aria-hidden="true" /></button>
        <p className="text-sm font-medium" aria-live="polite">{monthLabel(month)}</p>
        <button type="button" className={nav} aria-label="Next month" disabled={month >= monthOf(max)} onClick={() => changeMonth(1)}><ChevronRight size={16} aria-hidden="true" /></button>
      </div>
      <table role="grid" aria-label={monthLabel(month)} className="w-full table-fixed border-collapse text-center text-sm">
        <thead><tr>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(day => <th key={day} scope="col" className="h-8 text-xs font-normal text-gray-600"><abbr title={day} className="no-underline">{day.slice(0, 2)}</abbr></th>)}</tr></thead>
        <tbody>{Array.from({ length: cells.length / 7 }, (_, week) => <tr key={week}>{cells.slice(week * 7, week * 7 + 7).map((date, column) => <td key={date ?? column} className="p-0" aria-selected={date === value}>
          {date && <button type="button" data-calendar-day={date} disabled={date < min || date > max} tabIndex={date === tabDate ? 0 : -1}
            aria-label={formatHistoryDate(date)} aria-current={date === max ? "date" : undefined}
            onFocus={() => setFocused(date)} onClick={() => choose(date)}
            onKeyDown={event => {
              const weekday = (new Date(date).getUTCDay() + 6) % 7;
              const delta = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday, End: 6 - weekday } as Record<string, number>)[event.key];
              if (delta === undefined) return;
              event.preventDefault();
              const target = iso(new Date(Date.parse(date) + delta * dayMs));
              const bounded = target < min ? min : target > max ? max : target;
              setFocused(bounded); setMonth(monthOf(bounded)); focusDay(bounded);
            }}
            className={`h-9 w-full rounded-md disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 ${date === value ? "bg-foreground text-background" : "hover:bg-muted"}`}>
            {Number(date.slice(-2))}
          </button>}
        </td>)}</tr>)}</tbody>
      </table>
      <button type="button" className="mt-2 min-h-11 w-full rounded-md border text-sm hover:bg-muted focus-visible:outline focus-visible:outline-2" onClick={() => choose(max)}>Today</button>
      <p className="mt-2 text-center text-xs text-gray-600">Last 90 days · UTC</p>
    </div>}
  </div>;
}
