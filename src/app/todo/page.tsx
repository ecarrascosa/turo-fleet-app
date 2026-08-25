'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Task {
  id: string;
  type: 'trip_start' | 'trip_end' | 'cleaning';
  time: string;
  vehicle: string;
  guest?: string;
  location?: string;
  reservationId: string;
}

interface OpsData {
  date: string;
  summary: { tripsStarting: number; tripsEnding: number; cleanings: number };
  tasks: Task[];
}

const TYPE_CONFIG = {
  trip_start: { icon: '🚗', label: 'Trip Start', bg: 'bg-blue-50', border: 'border-l-blue-400', text: 'text-blue-700', pill: 'bg-blue-100 text-blue-700' },
  trip_end: { icon: '🏁', label: 'Trip End', bg: 'bg-orange-50', border: 'border-l-orange-400', text: 'text-orange-700', pill: 'bg-orange-100 text-orange-700' },
  cleaning: { icon: '🧹', label: 'Cleaning', bg: 'bg-green-50', border: 'border-l-green-400', text: 'text-green-700', pill: 'bg-green-100 text-green-700' },
};

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatShortDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });
}

function shiftDate(dateStr: string, days: number) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return dt.toLocaleDateString('en-CA');
}

function todayLA() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getTaskHour(task: Task) {
  const d = new Date(task.time);
  const laTime = new Date(d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  return laTime.getHours() + laTime.getMinutes() / 60;
}

const HOUR_HEIGHT = 72;
const CAL_START = 6;
const CAL_END = 22;
const HOURS = Array.from({ length: CAL_END - CAL_START }, (_, i) => CAL_START + i);

function formatHourLabel(hour: number) {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

function CalendarView({ tasks, done, onToggle }: { tasks: Task[]; done: Record<string, boolean>; onToggle: (id: string) => void }) {
  // Group tasks by hour for stacking
  const tasksByHour: Record<number, Task[]> = {};
  tasks.forEach(t => {
    const h = Math.floor(getTaskHour(t));
    if (!tasksByHour[h]) tasksByHour[h] = [];
    tasksByHour[h].push(t);
  });

  // Find min/max hours with tasks to auto-range
  const taskHours = tasks.map(t => Math.floor(getTaskHour(t)));
  const minHour = Math.max(CAL_START, Math.min(...taskHours) - 1);
  const maxHour = Math.min(CAL_END, Math.max(...taskHours) + 2);
  const visibleHours = Array.from({ length: maxHour - minHour }, (_, i) => minHour + i);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">Schedule</h2>
      </div>
      <div className="relative overflow-x-auto">
        <div className="relative" style={{ height: visibleHours.length * HOUR_HEIGHT + 20 }}>
          {/* Hour grid */}
          {visibleHours.map((hour, i) => (
            <div key={hour} className="absolute left-0 right-0 flex items-start" style={{ top: i * HOUR_HEIGHT }}>
              <div className="w-16 shrink-0 text-right pr-3 text-xs text-gray-400 font-medium -mt-2">
                {formatHourLabel(hour)}
              </div>
              <div className="flex-1 border-t border-gray-100" />
            </div>
          ))}

          {/* Task blocks */}
          {tasks.map((task, idx) => {
            const hour = getTaskHour(task);
            const clampedHour = Math.max(minHour, Math.min(hour, maxHour - 0.5));
            const top = (clampedHour - minHour) * HOUR_HEIGHT;
            const cfg = TYPE_CONFIG[task.type];
            const isDone = done[task.id];

            const hourKey = Math.floor(hour);
            const siblings = tasksByHour[hourKey] || [];
            const sibIdx = siblings.indexOf(task);
            const stackOffset = sibIdx * 44;

            return (
              <button
                key={task.id}
                onClick={() => onToggle(task.id)}
                className={`absolute left-[72px] right-3 rounded-xl border-l-4 px-4 py-2.5 text-left transition-all hover:shadow-md cursor-pointer ${cfg.bg} ${cfg.border} ${isDone ? 'opacity-40' : ''}`}
                style={{
                  top: top + stackOffset + 4,
                  minHeight: 40,
                  zIndex: 10 + idx,
                }}
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition ${isDone ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                    {isDone && <span className="text-[10px] text-white font-bold">✓</span>}
                  </div>
                  <span className="text-sm">{cfg.icon}</span>
                  <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
                  <span className="text-xs text-gray-500">{formatTime(task.time)}</span>
                </div>
                <div className="ml-[26px] mt-0.5">
                  <span className={`text-sm font-medium text-gray-900 ${isDone ? 'line-through' : ''}`}>{task.vehicle}</span>
                  {task.guest && <span className="text-sm text-gray-500 ml-2">· {task.guest}</span>}
                </div>
                {task.location && <div className="ml-[26px] text-xs text-gray-400 mt-0.5">📍 {task.location}</div>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function OpsPage() {
  const [date, setDate] = useState(todayLA);
  const [data, setData] = useState<OpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`ops-done-${date}`);
      if (saved) setDone(JSON.parse(saved));
      else setDone({});
    } catch { setDone({}); }
  }, [date]);

  useEffect(() => {
    try { localStorage.setItem(`ops-done-${date}`, JSON.stringify(done)); } catch {}
  }, [done, date]);

  const fetchOps = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ops?date=${date}`);
      const json = await res.json();
      setData(json);
    } catch { setData(null); }
    setLoading(false);
  }, [date]);

  useEffect(() => { fetchOps(); }, [fetchOps]);

  const toggleDone = (id: string) => setDone(prev => ({ ...prev, [id]: !prev[id] }));
  const isToday = date === todayLA();
  const s = data?.summary;
  const doneCount = data ? data.tasks.filter(t => done[t.id]).length : 0;
  const totalCount = data?.tasks.length || 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <Link href="/" className="text-gray-500 hover:text-gray-800 text-sm font-medium transition">← Fleet</Link>
          <div className="flex items-center gap-2">
            <button onClick={() => setDate(d => shiftDate(d, -1))} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <button onClick={() => setDate(todayLA())} className={`px-3 py-1 rounded-lg text-xs font-medium transition ${isToday ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100 text-gray-600'}`}>
              Today
            </button>
            <button onClick={() => setDate(d => shiftDate(d, 1))} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 pb-24 space-y-6">
        {/* Greeting */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {getGreeting()}, Eduardo 👋
          </h1>
          <p className="text-gray-500 text-sm mt-1">{formatDate(date)}</p>
        </div>

        {/* Summary section */}
        {!loading && s && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Today&apos;s Overview</h2>

            {totalCount === 0 ? (
              <p className="text-gray-400">No tasks scheduled</p>
            ) : (
              <>
                {/* Progress */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all"
                      style={{ width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 font-medium">{doneCount}/{totalCount} done</span>
                </div>

                {/* Bullet summary */}
                <ul className="space-y-1.5 list-disc list-inside text-sm text-gray-700">
                  {s.tripsStarting > 0 && (
                    <li>{s.tripsStarting} trip{s.tripsStarting !== 1 ? 's' : ''} starting</li>
                  )}
                  {s.tripsEnding > 0 && (
                    <li>{s.tripsEnding} trip{s.tripsEnding !== 1 ? 's' : ''} ending</li>
                  )}
                  {s.cleanings > 0 && (
                    <li>{s.cleanings} cleaning{s.cleanings !== 1 ? 's' : ''} needed</li>
                  )}
                </ul>
              </>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-16 text-gray-400">
            <div className="animate-spin text-3xl mb-3">⏳</div>
            Loading...
          </div>
        )}

        {/* Empty state */}
        {!loading && data && data.tasks.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🎉</div>
            <div className="text-gray-600 font-semibold text-lg">No tasks for this date</div>
            <div className="text-gray-400 text-sm mt-1">Enjoy the day off!</div>
          </div>
        )}

        {/* Calendar View */}
        {!loading && data && data.tasks.length > 0 && (
          <CalendarView tasks={data.tasks} done={done} onToggle={toggleDone} />
        )}
      </main>
    </div>
  );
}
