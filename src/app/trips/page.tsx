'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';

interface Reservation {
  reservationId: string;
  guestName: string;
  vehicleModel: string;
  vehicleYear: string;
  tripStart: string;
  tripEnd: string;
  status: 'booked' | 'active' | 'completed' | 'cancelled';
  carId?: string;
  renterToken?: string;
}

type Tab = 'active' | 'past';
type EventType = 'pickup' | 'dropoff';

interface DisplayEntry {
  reservation: Reservation;
  eventType: EventType;
  eventTime: Date; // the time this entry sorts by
}

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/', icon: '📊' },
  { label: 'Fleet', href: '/', icon: '🚗' },
  { label: 'Trips', href: '/trips', icon: '📅' },
  { label: 'Service', href: '/service', icon: '🔧' },
];

function LockClosed() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
      <circle cx="12" cy="16" r="1" fill="currentColor" />
    </svg>
  );
}

function LockOpen() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 019.9-1" />
      <circle cx="12" cy="16" r="1" fill="currentColor" />
    </svg>
  );
}

function EngineOn() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}

function EngineOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

function CommandButton({ icon, color, borderColor, onClick, loading, title }: {
  icon: React.ReactNode; color: string; borderColor: string; onClick: () => void; loading: boolean; title: string;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={loading}
      title={title}
      className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-40 ${borderColor} ${color} bg-transparent`}
    >
      {loading ? <span className="animate-spin text-xs">⏳</span> : icon}
    </button>
  );
}

function DateTag({ date, color }: { date: string; color: 'green' | 'red' | 'gray' }) {
  const colorClasses = {
    green: 'bg-green-100 text-green-700 border-green-200',
    red: 'bg-red-100 text-red-700 border-red-200',
    gray: 'bg-gray-100 text-gray-600 border-gray-200',
  };
  const formatted = (() => {
    try {
      return new Date(date).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      });
    } catch { return date; }
  })();
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-lg border ${colorClasses[color]}`}>
      {formatted}
    </span>
  );
}

export default function TripsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('active');
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/reservations');
      const data = await res.json();
      if (data.reservations) setReservations(data.reservations);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sendCommand = async (action: string, carId: string) => {
    const key = `${carId}-${action}`;
    setActionLoading(p => ({ ...p, [key]: true }));
    try {
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, carId }),
      });
      const data = await res.json();
      if (res.ok && data.success) showToast(`✅ ${action} sent`);
      else showToast(`❌ ${data.error || 'Failed'}`, 'error');
    } catch (e: any) {
      showToast(`❌ ${e.message}`, 'error');
    }
    setActionLoading(p => ({ ...p, [key]: false }));
  };

  const copyGuestLink = (renterToken: string, resId: string) => {
    const url = `https://turo-fleet-app-theta.vercel.app/trip/${renterToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(resId);
      setTimeout(() => setCopiedId(null), 2000);
      showToast('📋 Guest link copied!');
    }).catch(() => {
      prompt('Copy this link:', url);
    });
  };

  // Get the group date for an active trip (which day header it belongs under)
  const getGroupDate = useCallback((r: Reservation) => {
    const now = new Date();
    const start = new Date(r.tripStart);
    const end = new Date(r.tripEnd);
    const todayStr = now.toDateString();
    // Only group under today if the trip STARTS or ENDS today
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);
    const startedToday = start >= todayStart && start < todayEnd;
    const endedToday = end >= todayStart && end < todayEnd;
    if (startedToday || endedToday) return now; // group under today
    if (now >= start) return end; // ongoing past today → group by end
    return start; // upcoming
  }, []);

  // Get the sort time — use whichever event falls on the trip's group date
  const getEventTime = useCallback((r: Reservation, groupDate: Date) => {
    const now = new Date();
    const start = new Date(r.tripStart);
    const end = new Date(r.tripEnd);
    const groupStr = groupDate.toDateString();
    const startOnGroup = start.toDateString() === groupStr;
    const endOnGroup = end.toDateString() === groupStr;

    // If already started: prefer end time if it's on the group date, otherwise use start
    if (now >= start || now > end) {
      if (endOnGroup) return end;
      if (startOnGroup) return start;
      return end;
    }
    // Upcoming: use start time
    return start;
  }, []);

  const { activeEntries, past } = useMemo(() => {
    const now = new Date();
    const entries: DisplayEntry[] = [];
    const p: Reservation[] = [];

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    for (const r of reservations) {
      if (r.status === 'cancelled') {
        p.push(r);
        continue;
      }
      const start = new Date(r.tripStart);
      const end = new Date(r.tripEnd);
      const startedToday = start >= todayStart && start < todayEnd;
      const endedToday = end >= todayStart && end < todayEnd;

      if (now <= end || startedToday || endedToday) {
        // Always create a pickup entry (for start date)
        entries.push({ reservation: r, eventType: 'pickup', eventTime: start });
        // Always create a dropoff entry too
        entries.push({ reservation: r, eventType: 'dropoff', eventTime: end });
      } else {
        p.push(r);
      }
    }

    // Sort entries by date (day), then by event time within each day
    entries.sort((a, b) => {
      const aDay = new Date(a.eventTime.toDateString()).getTime();
      const bDay = new Date(b.eventTime.toDateString()).getTime();
      if (aDay !== bDay) return aDay - bDay;
      return a.eventTime.getTime() - b.eventTime.getTime();
    });

    // Past: most recent first
    p.sort((a, b) => new Date(b.tripEnd).getTime() - new Date(a.tripEnd).getTime());

    return { activeEntries: entries, past: p };
  }, [reservations, getGroupDate]);

  const counts = { active: activeEntries.length, past: past.length };

  return (
    <div className="h-full flex">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-[220px] bg-slate-900 text-white flex-col shrink-0">
        <div className="h-16 flex items-center px-5 border-b border-slate-800">
          <span className="text-xl font-bold tracking-tight">⚡ <span className="text-cyan-400">Fleet</span>Pro</span>
        </div>
        <nav className="flex-1 py-4">
          {NAV_ITEMS.map(item => {
            const active = item.href === '/trips';
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${
                  active ? 'bg-cyan-500/10 text-cyan-400 border-r-2 border-cyan-400' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 h-14 flex items-center justify-around z-50">
        {NAV_ITEMS.map(item => (
          <Link key={item.label} href={item.href} className={`flex flex-col items-center gap-0.5 px-3 py-1 ${item.href === '/trips' ? 'text-cyan-600' : 'text-gray-400'}`}>
            <span className="text-lg">{item.icon}</span>
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto bg-gray-50 pb-16 lg:pb-0">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Trips</h1>
          </div>

          {/* Tabs */}
          <div className="flex bg-gray-200 rounded-lg p-0.5 mb-6">
            {(['active', 'past'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition flex items-center justify-center gap-2 ${
                  tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                  tab === t ? 'bg-gray-100 text-gray-700' : 'bg-gray-300/50 text-gray-500'
                }`}>
                  {counts[t]}
                </span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-gray-400 animate-pulse py-16 text-center">Loading trips...</div>
          ) : (tab === 'active' ? activeEntries.length : past.length) === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">
                {tab === 'active' ? '🗓️' : '📭'}
              </div>
              <p className="text-gray-500">
                {tab === 'active' ? 'No active trips' : 'No past trips'}
              </p>
            </div>
          ) : tab === 'active' ? (
            <div className="space-y-4">
              {(() => {
                let lastDateLabel = '';
                return activeEntries.map((entry, idx) => {
                  const res = entry.reservation;
                  const d = entry.eventTime;
                  const today = new Date();
                  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
                  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);

                  let dateLabel: string;
                  if (d.toDateString() === today.toDateString()) dateLabel = 'Today';
                  else if (d.toDateString() === tomorrow.toDateString()) dateLabel = 'Tomorrow';
                  else if (d.toDateString() === yesterday.toDateString()) dateLabel = 'Yesterday';
                  else dateLabel = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

                  const showHeader = dateLabel !== lastDateLabel;
                  lastDateLabel = dateLabel;

                  // Tag based on event type
                  const now = new Date();
                  const start = new Date(res.tripStart);
                  const end = new Date(res.tripEnd);
                  const timeStr = entry.eventTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

                  let tag: React.ReactNode;
                  if (entry.eventType === 'pickup') {
                    if (now >= start) {
                      // Already started
                      tag = <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">In Progress</span>;
                    } else {
                      tag = <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-lg border bg-green-100 text-green-700 border-green-200">Starting at {timeStr}</span>;
                    }
                  } else {
                    // dropoff
                    if (now > end) {
                      tag = <span className="text-xs text-gray-500">Ended at {timeStr}</span>;
                    } else {
                      tag = <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-lg border bg-red-100 text-red-700 border-red-200">Ending at {timeStr}</span>;
                    }
                  }

                  return (
                    <div key={`${res.reservationId}-${entry.eventType}`}>
                      {showHeader && (
                        <div className="flex items-center gap-3 pt-2 pb-1">
                          <h2 className="text-sm font-bold text-gray-700 whitespace-nowrap">{dateLabel}</h2>
                          <div className="flex-1 h-px bg-gray-200" />
                        </div>
                      )}
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition-shadow">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-2">{tag}</div>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-lg">👤</span>
                              <h3 className="font-bold text-gray-900">{res.guestName}</h3>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">🚗 {res.vehicleYear} {res.vehicleModel}</p>
                            {res.renterToken && (
                              <div className="mt-3 flex items-center gap-2">
                                <div className="flex-1 min-w-0 bg-gray-50 rounded-lg border border-gray-200 px-3 py-2 flex items-center gap-2">
                                  <span className="text-cyan-500 text-sm">🔗</span>
                                  <span className="text-xs text-gray-500 truncate flex-1">turo-fleet-app-theta.vercel.app/trip/{res.renterToken}</span>
                                  <button
                                    onClick={() => copyGuestLink(res.renterToken!, res.reservationId)}
                                    className={`shrink-0 px-3 py-1 rounded-md text-xs font-medium transition-all ${copiedId === res.reservationId ? 'bg-green-100 text-green-700' : 'bg-cyan-50 text-cyan-700 hover:bg-cyan-100'}`}
                                  >{copiedId === res.reservationId ? '✓ Copied' : 'Copy'}</button>
                                </div>
                              </div>
                            )}
                          </div>
                          {res.carId && (
                            <div className="flex gap-2 sm:flex-col sm:gap-2">
                              <CommandButton icon={<LockOpen />} color="text-green-600" borderColor="border-green-300 hover:border-green-500" onClick={() => sendCommand('unlock-restore', res.carId!)} loading={!!actionLoading[`${res.carId}-unlock-restore`]} title="Unlock + Enable Engine" />
                              <CommandButton icon={<LockClosed />} color="text-amber-600" borderColor="border-amber-300 hover:border-amber-500" onClick={() => sendCommand('lock-kill', res.carId!)} loading={!!actionLoading[`${res.carId}-lock-kill`]} title="Lock + Kill Engine" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          ) : (
            <div className="space-y-4">
              {(() => {
                let lastDateLabel = '';
                return past.map(res => {
                  const d = new Date(res.tripStart);
                  const today = new Date();
                  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
                  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);

                  let dateLabel: string;
                  if (d.toDateString() === today.toDateString()) dateLabel = 'Today';
                  else if (d.toDateString() === tomorrow.toDateString()) dateLabel = 'Tomorrow';
                  else if (d.toDateString() === yesterday.toDateString()) dateLabel = 'Yesterday';
                  else dateLabel = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

                  const showHeader = dateLabel !== lastDateLabel;
                  lastDateLabel = dateLabel;

                  return (
                    <div key={res.reservationId}>
                      {showHeader && (
                        <div className="flex items-center gap-3 pt-2 pb-1">
                          <h2 className="text-sm font-bold text-gray-700 whitespace-nowrap">{dateLabel}</h2>
                          <div className="flex-1 h-px bg-gray-200" />
                        </div>
                      )}
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition-shadow">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <DateTag date={res.tripStart} color="gray" />
                              <span className="text-xs text-gray-400">→</span>
                              <DateTag date={res.tripEnd} color="gray" />
                              {res.status === 'cancelled' && (
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">cancelled</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-lg">👤</span>
                              <h3 className="font-bold text-gray-900">{res.guestName}</h3>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">🚗 {res.vehicleYear} {res.vehicleModel}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-20 lg:bottom-6 right-4 lg:right-6 z-[9999] px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${
          toast.type === 'success' ? 'bg-slate-800' : 'bg-red-600'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
