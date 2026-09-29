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

type DayFilter = 'today' | 'upcoming' | 'all';

function isToday(dateStr: string | null): boolean {
  if (!dateStr) return true; // no due date = show always
  const today = new Date().toISOString().split('T')[0];
  return dateStr.slice(0, 10) === today;
}

function isTodayOrFuture(dateStr: string | null): boolean {
  if (!dateStr) return true;
  const today = new Date().toISOString().split('T')[0];
  return dateStr.slice(0, 10) >= today;
}

function filterTasks(tasks: Task[], filter: DayFilter): Task[] {
  if (filter === 'all') return tasks;
  if (filter === 'today') return tasks.filter(t => isToday(t.due));
  return tasks.filter(t => isTodayOrFuture(t.due));
}

export default function EmployeeTaskBoard() {
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<DayFilter>('today');

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/todoist/tasks');
      const data = await res.json();
      setGroups(data.groups || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const toggleTask = async (task: Task) => {
    setToggling(task.id);
    try {
      await fetch(`/api/todoist/tasks/${task.id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: task.done }),
      });
      setGroups(prev =>
        prev.map(g => ({
          ...g,
          tasks: g.tasks.map(t => t.id === task.id ? { ...t, done: !t.done } : t),
        }))
      );
    } catch {}
    setToggling(null);
  };

  const toggleCollapse = (action: string) => {
    setCollapsed(prev => ({ ...prev, [action]: !prev[action] }));
  };

  const filteredGroups = groups
    .map(g => ({ ...g, tasks: filterTasks(g.tasks, filter) }))
    .filter(g => g.tasks.length > 0);

  const totalTasks = filteredGroups.reduce((s, g) => s + g.tasks.length, 0);
  const totalDone = filteredGroups.reduce((s, g) => s + g.tasks.filter(t => t.done).length, 0);
  const totalPct = totalTasks ? Math.round((totalDone / totalTasks) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-slate-900 text-white px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-lg font-bold">⚡ <span className="text-cyan-400">Fleet</span>Pro</Link>
          <span className="text-xs text-slate-400">Employee Tasks</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4">
        {/* Day filter */}
        <div className="flex gap-2 mb-4">
          {(['today', 'upcoming', 'all'] as DayFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                filter === f
                  ? 'bg-cyan-500 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {f === 'today' ? '📅 Today' : f === 'upcoming' ? '📆 Upcoming' : '📋 All'}
            </button>
          ))}
        </div>

        {/* Overall progress */}
        {totalTasks > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Overall Progress</span>
              <span className="text-sm font-bold text-gray-900">{totalDone}/{totalTasks} done</span>
            </div>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-500 rounded-full transition-all duration-500" style={{ width: `${totalPct}%` }} />
            </div>
          </div>
        )}

        {/* Groups */}
        {loading ? (
          <div className="text-center text-gray-400 py-12 animate-pulse">Loading tasks...</div>
        ) : filteredGroups.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            {filter === 'today' ? 'No tasks for today 🎉' : 'No tasks found 🎉'}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredGroups.map(group => {
              const done = group.tasks.filter(t => t.done).length;
              const pct = Math.round((done / group.tasks.length) * 100);
              const isCollapsed = collapsed[group.action];

              return (
                <div key={group.action} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Group header */}
                  <button
                    onClick={() => toggleCollapse(group.action)}
                    className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm transform transition-transform" style={{ display: 'inline-block', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
                      <span className="font-semibold text-sm text-gray-900">{group.action}</span>
                      <span className="text-xs text-gray-400">({group.tasks.length} {group.tasks.length === 1 ? 'car' : 'cars'})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{done}/{group.tasks.length}</span>
                      <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? 'bg-green-500' : 'bg-cyan-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </button>

                  {/* Tasks */}
                  {!isCollapsed && (
                    <div className="divide-y divide-gray-100">
                      {group.tasks.map(task => (
                        <div key={task.id} className="flex items-center gap-3 px-4 py-3">
                          {/* Toggle checkbox */}
                          <button
                            onClick={() => toggleTask(task)}
                            disabled={toggling === task.id}
                            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-all active:scale-90 ${
                              task.done
                                ? 'border-green-500 bg-green-500'
                                : 'border-gray-300 hover:border-cyan-400'
                            }`}
                          >
                            {toggling === task.id ? (
                              <span className="animate-spin text-xs">⏳</span>
                            ) : task.done ? (
                              <span className="text-white text-xs font-bold">✓</span>
                            ) : null}
                          </button>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${task.done ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                              {task.content}
                            </p>
                            {task.vehicle && (
                              <p className="text-xs text-gray-500 mt-0.5">🚗 {task.vehicle}</p>
                            )}
                            {task.due && (
                              <p className="text-[11px] text-gray-400 mt-0.5">{task.due.slice(0, 10)}</p>
                            )}
                          </div>

                          {/* GPS pin */}
                          {task.lat && task.lon && (
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${task.lat},${task.lon}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="w-10 h-10 rounded-xl bg-cyan-50 hover:bg-cyan-100 flex items-center justify-center shrink-0 transition active:scale-90"
                            >
                              <span className="text-lg">📍</span>
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
