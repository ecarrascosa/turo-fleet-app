'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Task {
  id: number;
  title: string;
  description: string | null;
  vehicle: string | null;
  priority: 'urgent' | 'normal' | 'low';
  start_date: string;
  end_date: string;
  status: 'pending' | 'done';
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const PRIORITY_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  urgent: { bg: 'bg-red-100', text: 'text-red-700', label: 'Urgent' },
  normal: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Normal' },
  low: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Low' },
};

function getMonday(d: Date): Date {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return dt;
}

function fmtDate(d: Date) {
  return d.toISOString().split('T')[0];
}

function dayLabel(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1];
}

export default function EmployeeTaskBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [monday, setMonday] = useState(() => getMonday(new Date()));
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<number | null>(null);

  const mondayStr = fmtDate(monday);
  const sundayStr = fmtDate(new Date(monday.getTime() + 6 * 86400000));

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks?week=${mondayStr}`);
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch { }
    setLoading(false);
  }, [mondayStr]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const toggleStatus = async (task: Task) => {
    setToggling(task.id);
    const newStatus = task.status === 'done' ? 'pending' : 'done';
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    } catch { }
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

  const doneCount = tasks.filter(t => t.status === 'done').length;
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  const formatWeekLabel = () => {
    const sun = new Date(monday.getTime() + 6 * 86400000);
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${monday.toLocaleDateString('en-US', opts)} – ${sun.toLocaleDateString('en-US', opts)}`;
  };

  const dateWindow = (t: Task) => {
    const s = dayLabel(t.start_date);
    const e = dayLabel(t.end_date);
    return s === e ? s : `${s} – ${e}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-slate-900 text-white px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-lg font-bold">⚡ <span className="text-cyan-400">Fleet</span>Pro</Link>
          <Link href="/tasks/admin" className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg transition">+ Add Task</Link>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4">
        {/* Week nav */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => shiftWeek(-1)} className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 active:scale-95 transition">←</button>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-900">{formatWeekLabel()}</p>
            <button onClick={goThisWeek} className="text-xs text-cyan-600 hover:underline">This Week</button>
          </div>
          <button onClick={() => shiftWeek(1)} className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 active:scale-95 transition">→</button>
        </div>

        {/* Progress */}
        {tasks.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Progress</span>
              <span className="text-sm font-bold text-gray-900">{doneCount}/{tasks.length} done</span>
            </div>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {/* Tasks */}
        {loading ? (
          <div className="text-center text-gray-400 py-12 animate-pulse">Loading tasks...</div>
        ) : tasks.length === 0 ? (
          <div className="text-center text-gray-400 py-12">No tasks this week 🎉</div>
        ) : (
          <div className="space-y-3">
            {tasks.map(task => {
              const pri = PRIORITY_STYLE[task.priority];
              const done = task.status === 'done';
              return (
                <button
                  key={task.id}
                  onClick={() => toggleStatus(task)}
                  disabled={toggling === task.id}
                  className={`w-full text-left bg-white rounded-xl border p-4 transition-all active:scale-[0.98] ${
                    done ? 'border-green-200 bg-green-50/50 opacity-70' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-6 h-6 mt-0.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                      done ? 'border-green-500 bg-green-500' : 'border-gray-300'
                    }`}>
                      {done && <span className="text-white text-xs">✓</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${pri.bg} ${pri.text}`}>{pri.label}</span>
                        <span className="text-[11px] text-gray-400">{dateWindow(task)}</span>
                      </div>
                      <h3 className={`font-semibold text-sm mt-1 ${done ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</h3>
                      {task.vehicle && <p className="text-xs text-gray-500 mt-0.5">🚗 {task.vehicle}</p>}
                      {task.description && <p className="text-xs text-gray-400 mt-1">{task.description}</p>}
                    </div>
                    {toggling === task.id && <span className="animate-spin text-sm">⏳</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
