'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Task {
  id: string;
  content: string;
  due: string | null;
  vehicle: string | null;
  lat?: number;
  lon?: number;
  done: boolean;
}

interface TaskGroup {
  action: string;
  tasks: Task[];
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const DAY_NAMES_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function getMonday(d: Date): Date {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().split('T')[0];
}

/** Group tasks by action within a single day */
function groupByAction(tasks: Task[]): { action: string; tasks: Task[] }[] {
  const map: Record<string, Task[]> = {};
  for (const t of tasks) {
    const action = extractAction(t.content);
    if (!map[action]) map[action] = [];
    map[action].push(t);
  }
  return Object.entries(map)
    .map(([action, tasks]) => ({ action, tasks }))
    .sort((a, b) => b.tasks.length - a.tasks.length);
}

function extractAction(content: string): string {
  const lower = content.toLowerCase();
  const keywords = [
    'Re-park', 'Repark', 'Oil change', 'Clean', 'Wash', 'Re-charge', 'Recharge', 'Charge',
    'Inspect', 'Tire', 'Pickup', 'Pick up', 'Drop off', 'Detail', 'Gas', 'Fuel',
    'Fix', 'Repair', 'Return', 'Move', 'Check', 'Service', 'Maintenance',
  ];
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) {
      if (kw.toLowerCase() === 'repark') return 'Re-park';
      if (kw.toLowerCase() === 'recharge') return 'Re-charge';
      return kw;
    }
  }
  return 'Other';
}

export default function EmployeeTaskBoard() {
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [monday, setMonday] = useState(() => getMonday(new Date()));
  // Mobile: selected day index (null = show all on desktop)
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/todoist/tasks');
      const data = await res.json();
      // Flatten all groups into a single task list
      const tasks: Task[] = (data.groups || []).flatMap((g: TaskGroup) => g.tasks);
      setAllTasks(tasks);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Auto-select today on mobile
  useEffect(() => {
    const todayIdx = getDayDates().findIndex(d => isToday(d));
    if (todayIdx >= 0) setSelectedDay(todayIdx);
    else setSelectedDay(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monday]);

  const toggleTask = async (task: Task) => {
    setToggling(task.id);
    try {
      await fetch(`/api/todoist/tasks/${task.id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: task.done }),
      });
      setAllTasks(prev => prev.map(t => t.id === task.id ? { ...t, done: !t.done } : t));
    } catch {}
    setToggling(null);
  };

  const shiftWeek = (dir: number) => {
    setMonday(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + dir * 7);
      return d;
    });
  };

  const goThisWeek = () => setMonday(getMonday(new Date()));

  // Generate Mon–Fri dates
  const getDayDates = useCallback((): string[] => {
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return fmtDate(d);
    });
  }, [monday]);

  const dayDates = getDayDates();

  // Tasks for a given day (tasks with no due date go to Monday)
  const tasksForDay = (dateStr: string, idx: number): Task[] => {
    return allTasks.filter(t => {
      if (!t.due) return idx === 0; // no due → Monday
      return t.due.slice(0, 10) === dateStr;
    });
  };

  // Unscheduled tasks (due dates outside this week)
  const weekDatesSet = new Set(dayDates);
  const unscheduledTasks = allTasks.filter(t => {
    if (!t.due) return false;
    return !weekDatesSet.has(t.due.slice(0, 10));
  });

  // Week progress
  const weekTasks = dayDates.flatMap((d, i) => tasksForDay(d, i));
  const weekDone = weekTasks.filter(t => t.done).length;
  const weekPct = weekTasks.length ? Math.round((weekDone / weekTasks.length) * 100) : 0;

  const formatWeekLabel = () => {
    const fri = new Date(monday);
    fri.setDate(monday.getDate() + 4);
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${monday.toLocaleDateString('en-US', opts)} – ${fri.toLocaleDateString('en-US', opts)}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-slate-900 text-white px-4 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-lg font-bold">⚡ <span className="text-cyan-400">Fleet</span>Pro</Link>
          <span className="text-xs text-slate-400">Weekly Tasks</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4">
        {/* Week nav */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => shiftWeek(-1)} className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 active:scale-95 transition">←</button>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-900">{formatWeekLabel()}</p>
            <button onClick={goThisWeek} className="text-xs text-cyan-600 hover:underline">This Week</button>
          </div>
          <button onClick={() => shiftWeek(1)} className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 active:scale-95 transition">→</button>
        </div>

        {/* Week progress */}
        {weekTasks.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-gray-600">Week Progress</span>
              <span className="text-xs font-bold text-gray-900">{weekDone}/{weekTasks.length}</span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${weekPct === 100 ? 'bg-green-500' : 'bg-cyan-500'}`} style={{ width: `${weekPct}%` }} />
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center text-gray-400 py-12 animate-pulse">Loading tasks...</div>
        ) : (
          <>
            {/* Mobile: Day selector tabs */}
            <div className="flex gap-1 mb-4 md:hidden">
              {dayDates.map((dateStr, i) => {
                const dayTasks = tasksForDay(dateStr, i);
                const done = dayTasks.filter(t => t.done).length;
                const today = isToday(dateStr);
                const active = selectedDay === i;
                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDay(i)}
                    className={`flex-1 py-2 rounded-xl text-center transition-all ${
                      active
                        ? 'bg-cyan-500 text-white shadow-sm'
                        : today
                          ? 'bg-cyan-50 text-cyan-700 border border-cyan-200'
                          : 'bg-white text-gray-600 border border-gray-200'
                    }`}
                  >
                    <div className="text-xs font-bold">{DAY_NAMES[i]}</div>
                    <div className="text-[10px] mt-0.5 opacity-70">{fmtShort(new Date(dateStr + 'T12:00:00'))}</div>
                    {dayTasks.length > 0 && (
                      <div className={`text-[10px] mt-0.5 ${active ? 'text-cyan-100' : 'text-gray-400'}`}>{done}/{dayTasks.length}</div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Mobile: Selected day tasks */}
            <div className="md:hidden">
              {selectedDay !== null && (
                <DayColumn
                  dateStr={dayDates[selectedDay]}
                  dayName={DAY_NAMES_FULL[selectedDay]}
                  tasks={tasksForDay(dayDates[selectedDay], selectedDay)}
                  toggling={toggling}
                  onToggle={toggleTask}
                  isToday={isToday(dayDates[selectedDay])}
                  isMobile
                />
              )}
            </div>

            {/* Desktop: 5-column grid */}
            <div className="hidden md:grid md:grid-cols-5 gap-3">
              {dayDates.map((dateStr, i) => (
                <DayColumn
                  key={dateStr}
                  dateStr={dateStr}
                  dayName={DAY_NAMES[i]}
                  tasks={tasksForDay(dateStr, i)}
                  toggling={toggling}
                  onToggle={toggleTask}
                  isToday={isToday(dateStr)}
                />
              ))}
            </div>

            {/* Unscheduled / other dates */}
            {unscheduledTasks.length > 0 && (
              <div className="mt-4">
                <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 px-1">Other Dates</div>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {unscheduledTasks.map(task => (
                    <TaskRow key={task.id} task={task} toggling={toggling} onToggle={toggleTask} showDate />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DayColumn({ dateStr, dayName, tasks, toggling, onToggle, isToday: today, isMobile }: {
  dateStr: string;
  dayName: string;
  tasks: Task[];
  toggling: string | null;
  onToggle: (t: Task) => void;
  isToday: boolean;
  isMobile?: boolean;
}) {
  const groups = groupByAction(tasks);
  const done = tasks.filter(t => t.done).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const d = new Date(dateStr + 'T12:00:00');

  return (
    <div className={`rounded-xl border overflow-hidden ${today ? 'border-cyan-300 bg-cyan-50/30' : 'border-gray-200 bg-white'}`}>
      {/* Day header */}
      <div className={`px-3 py-2 border-b ${today ? 'bg-cyan-500 text-white border-cyan-400' : 'bg-slate-50 text-gray-700 border-gray-200'}`}>
        <div className="flex items-center justify-between">
          <div>
            <span className="font-bold text-sm">{dayName}</span>
            {!isMobile && <span className={`text-xs ml-1.5 ${today ? 'text-cyan-100' : 'text-gray-400'}`}>{fmtShort(d)}</span>}
          </div>
          {tasks.length > 0 && (
            <span className={`text-xs font-medium ${today ? 'text-cyan-100' : 'text-gray-400'}`}>{done}/{tasks.length}</span>
          )}
        </div>
        {tasks.length > 0 && (
          <div className={`w-full h-1.5 rounded-full mt-1.5 overflow-hidden ${today ? 'bg-cyan-400' : 'bg-gray-200'}`}>
            <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-400' : today ? 'bg-white' : 'bg-cyan-500'}`} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      {/* Task groups */}
      <div className="p-2 space-y-2">
        {tasks.length === 0 ? (
          <div className="text-center text-gray-300 text-xs py-4">No tasks</div>
        ) : (
          groups.map(group => (
            <div key={group.action}>
              {/* Action label */}
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide px-1 mb-1">
                {group.action} ({group.tasks.length})
              </div>
              <div className="space-y-1">
                {group.tasks.map(task => (
                  <TaskRow key={task.id} task={task} toggling={toggling} onToggle={onToggle} compact />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TaskRow({ task, toggling, onToggle, compact, showDate }: {
  task: Task;
  toggling: string | null;
  onToggle: (t: Task) => void;
  compact?: boolean;
  showDate?: boolean;
}) {
  // Extract just the vehicle/car part from content (remove action prefix)
  const label = task.content;

  return (
    <div className={`flex items-center gap-2 ${compact ? 'px-2 py-1.5 rounded-lg hover:bg-gray-50' : 'px-4 py-3 border-b border-gray-100 last:border-0'}`}>
      {/* Checkbox */}
      <button
        onClick={() => onToggle(task)}
        disabled={toggling === task.id}
        className={`${compact ? 'w-5 h-5' : 'w-6 h-6'} rounded-full border-2 flex items-center justify-center shrink-0 transition-all active:scale-90 ${
          task.done ? 'border-green-500 bg-green-500' : 'border-gray-300 hover:border-cyan-400'
        }`}
      >
        {toggling === task.id ? (
          <span className="animate-spin text-[10px]">⏳</span>
        ) : task.done ? (
          <span className="text-white text-[10px] font-bold">✓</span>
        ) : null}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`${compact ? 'text-xs' : 'text-sm'} font-medium truncate ${task.done ? 'line-through text-gray-400' : 'text-gray-900'}`}>
          {label}
        </p>
        {task.vehicle && (
          <p className={`${compact ? 'text-[10px]' : 'text-xs'} text-gray-400 truncate`}>🚗 {task.vehicle}</p>
        )}
        {showDate && task.due && (
          <p className="text-[10px] text-gray-400">{task.due.slice(0, 10)}</p>
        )}
      </div>

      {/* GPS pin */}
      {task.lat && task.lon && (
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${task.lat},${task.lon}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className={`${compact ? 'w-7 h-7' : 'w-9 h-9'} rounded-lg bg-cyan-50 hover:bg-cyan-100 flex items-center justify-center shrink-0 transition active:scale-90`}
        >
          <span className={compact ? 'text-sm' : 'text-base'}>📍</span>
        </a>
      )}
    </div>
  );
}
