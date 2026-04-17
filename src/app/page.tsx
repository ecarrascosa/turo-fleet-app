'use client';
import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { getCarIcon, getCarPhoto } from '@/lib/car-icons';

const FleetMap = lazy(() => import('@/components/FleetMap'));

interface Car {
  carId: string; name: string; plate: string; imei: string;
  online: boolean; moving: boolean; speed: number;
  lat: number; lon: number; acc: string;
  locked: boolean; engineCut: boolean; voltage: string;
}

interface Rental {
  resId: string; guest: string; vehicle: string;
  plate: string; status: string;
}

interface Reservation {
  reservationId: string;
  guestName: string;
  guestPhone?: string;
  vehicleYear: string;
  vehicleModel: string;
  tripStart: string;
  tripEnd: string;
  earnings?: number;
  distanceIncluded?: number;
  location?: string;
  status: 'booked' | 'active' | 'completed' | 'cancelled';
  carId?: string;
  renterToken?: string;
  messages: Array<{ text: string; timestamp: string }>;
}

export default function Home() {
  const [cars, setCars] = useState<Car[]>([]);
  const [activeRentals, setActiveRentals] = useState<Rental[]>([]);
  const [allRentals, setAllRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [bulkLoading, setBulkLoading] = useState(false);
  const [selectedCar, setSelectedCar] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'info' | 'controls'>('info');
  const [search, setSearch] = useState('');
  const [analytics, setAnalytics] = useState<any>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [view, setView] = useState<'fleet' | 'map' | 'reservations' | 'analytics'>('map');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tripsTab, setTripsTab] = useState<'booked' | 'history'>('booked');
  const [syncing, setSyncing] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = useCallback(async () => {
    try {
      const [fleetRes, rentalRes, resRes] = await Promise.all([
        fetch('/api/fleet'), fetch('/api/rentals'), fetch('/api/reservations')
      ]);
      const fleetData = await fleetRes.json();
      const rentalData = await rentalRes.json();
      const resData = await resRes.json();
      if (fleetData.cars) setCars(fleetData.cars);
      if (rentalData.active) setActiveRentals(rentalData.active);
      if (rentalData.all) setAllRentals(rentalData.all);
      if (resData.reservations) setReservations(resData.reservations);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 30000); return () => clearInterval(i); }, [fetchData]);

  const rentedPlates = useMemo(() => {
    const map: Record<string, boolean> = {};
    activeRentals.forEach(r => { map[r.plate] = true; });
    return map;
  }, [activeRentals]);

  const isRented = (plate: string) => !!rentedPlates[plate];

  const filteredCars = useMemo(() => {
    if (!search.trim()) return cars;
    const q = search.toLowerCase();
    return cars.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.plate.toLowerCase().includes(q)
    );
  }, [cars, search]);

  const sendCommand = async (action: string, carId?: string) => {
    if (carId) setActionLoading(p => ({ ...p, [carId]: true }));
    else setBulkLoading(true);
    try {
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, carId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const actionLabel = action === 'lock-kill' ? 'Lock + Kill' : action === 'unlock-restore' ? 'Unlock + Start' : action === 'lock-all' ? 'Lock All' : action;
        const carName = carId ? cars.find(c => c.carId === carId)?.name : undefined;
        showToast(`✅ ${actionLabel}${carName ? ` — ${carName}` : ''} sent successfully${data.count !== undefined ? ` (${data.count} cars)` : ''}`);
      } else {
        showToast(`❌ Failed: ${data.error || 'Unknown error'}`, 'error');
      }
      setTimeout(fetchData, 3000);
    } catch (e: any) {
      showToast(`❌ Error: ${e.message || 'Network error'}`, 'error');
    }
    if (carId) setActionLoading(p => ({ ...p, [carId]: false }));
    else setBulkLoading(false);
  };

  const selected = cars.find(c => c.carId === selectedCar);

  // Close sidebar when selecting a car on mobile
  const selectCar = (carId: string | null) => {
    setSelectedCar(carId);
    setDetailTab('info');
    setSidebarOpen(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-xl text-gray-400 animate-pulse">Loading fleet...</div>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Top Header */}
      <header className="bg-slate-800 text-white h-12 flex items-center justify-between px-3 sm:px-4 shrink-0 z-50">
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Hamburger - mobile only */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden w-8 h-8 flex items-center justify-center rounded hover:bg-slate-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sidebarOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </button>
          <a href="/" className="font-bold text-base sm:text-lg hover:text-slate-300 transition-colors">⚡ Fleet</a>
          <span className="text-slate-400 text-xs sm:text-sm hidden sm:block">
            {cars.length} vehicles · {cars.filter(c => c.online).length} online
          </span>
        </div>
        <div className="flex items-center gap-1 sm:gap-3">
          {/* Desktop nav tabs - hidden on mobile (bottom nav used instead) */}
          <button
            onClick={() => { setView('fleet'); setSelectedCar(null); }}
            className={`hidden lg:block px-3 py-1 text-sm rounded ${view === 'fleet' ? 'bg-slate-600' : 'hover:bg-slate-700'}`}
          >📋 Fleet</button>
          <button
            onClick={() => { setView('map'); setSelectedCar(null); }}
            className={`hidden lg:block px-3 py-1 text-sm rounded ${view === 'map' ? 'bg-slate-600' : 'hover:bg-slate-700'}`}
          >🗺️ Map</button>
          <button
            onClick={() => { setView('reservations'); setSelectedCar(null); }}
            className={`hidden lg:block px-3 py-1 text-sm rounded ${view === 'reservations' ? 'bg-slate-600' : 'hover:bg-slate-700'}`}
          >📅 Trips</button>
          <button
            onClick={() => { setView('analytics'); if (!analytics) fetch('/api/analytics').then(r => r.json()).then(setAnalytics); }}
            className={`hidden lg:block px-3 py-1 text-sm rounded ${view === 'analytics' ? 'bg-slate-600' : 'hover:bg-slate-700'}`}
          >📊 Analytics</button>
          <a
            href="/service"
            className="hidden lg:block px-3 py-1 text-sm rounded hover:bg-slate-700"
          >🔧 Service</a>
          {/* Lock All - always visible */}
          <button
            onClick={() => sendCommand('lock-all')}
            disabled={bulkLoading}
            className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold px-3 sm:px-4 py-1.5 rounded transition-colors"
          >
            {bulkLoading ? '...' : '🔒 Lock All'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar Overlay - mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={`
          fixed lg:relative top-12 bottom-14 lg:bottom-0 left-0 w-64 sm:w-56
          bg-slate-900 text-white flex flex-col shrink-0 z-40
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          {/* Search */}
          <div className="p-3">
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:border-slate-500"
            />
          </div>

          {/* Vehicle List */}
          <div className="flex-1 overflow-y-auto">
            {filteredCars.map(car => {
              const icon = getCarIcon(car.name);
              const isSelected = selectedCar === car.carId;
              return (
                <button
                  key={car.carId}
                  onClick={() => { selectCar(isSelected ? null : car.carId); setView('map'); }}
                  className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors ${
                    isSelected ? 'bg-slate-700' : 'hover:bg-slate-800'
                  }`}
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0"
                    style={{ backgroundColor: icon.color + '40', border: `2px solid ${car.online ? '#22c55e' : '#6b7280'}` }}
                  >
                    {icon.emoji}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{car.name}</div>
                    <div className="text-xs text-slate-400 truncate">{car.plate}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-slate-800 text-xs text-slate-500 text-center">
            {cars.filter(c => c.online).length}/{cars.length} online
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 relative">
          {/* Fleet Overview */}
          {view === 'fleet' && (
            <div className="absolute inset-0 overflow-y-auto p-4 sm:p-6 bg-gray-50 pb-20 lg:pb-6">
              <div className="max-w-7xl mx-auto">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900">📋 Fleet Overview</h1>
                  <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm text-gray-500">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> {cars.filter(c => c.online).length} Online</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> {cars.filter(c => !c.online).length} Offline</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> {activeRentals.length} Rented</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                  {filteredCars.map(car => {
                    const icon = getCarIcon(car.name);
                    const photo = getCarPhoto(car.plate);
                    const rented = isRented(car.plate);
                    const rental = activeRentals.find(r => r.plate === car.plate);
                    return (
                      <div
                        key={car.carId}
                        className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden cursor-pointer active:scale-[0.98]"
                        onClick={() => { selectCar(car.carId); setView('map'); }}
                      >
                        {/* Car photo or colored header */}
                        {photo ? (
                          <div className="h-28 sm:h-32 bg-gray-100 relative overflow-hidden">
                            <img src={photo} alt={car.name} className="w-full h-full object-cover" />
                            <div className="absolute top-2 right-2 flex gap-1">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${car.online ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                                {car.online ? 'ONLINE' : 'OFFLINE'}
                              </span>
                              {rented && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500 text-white">RENTED</span>}
                            </div>
                          </div>
                        ) : (
                          <div className="h-16 flex items-center justify-center relative" style={{ backgroundColor: icon.color + '15' }}>
                            <span className="text-3xl">{icon.emoji}</span>
                            <div className="absolute top-2 right-2 flex gap-1">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${car.online ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                                {car.online ? 'ONLINE' : 'OFFLINE'}
                              </span>
                              {rented && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500 text-white">RENTED</span>}
                            </div>
                          </div>
                        )}
                        <div className="p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <h3 className="font-semibold text-gray-900 text-sm">{car.name}</h3>
                              <p className="text-xs text-gray-400">{car.plate}</p>
                            </div>
                          </div>
                          {rental && (
                            <div className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-1 mb-2 truncate">
                              👤 {rental.guest}
                            </div>
                          )}
                          <div className="grid grid-cols-4 gap-1 text-center">
                            <div>
                              <div className="text-base">{car.online ? '📡' : '📴'}</div>
                              <div className="text-[9px] text-gray-400">Signal</div>
                            </div>
                            <div>
                              <div className="text-base">{car.locked ? '🔒' : '🔓'}</div>
                              <div className="text-[9px] text-gray-400">Door</div>
                            </div>
                            <div>
                              <div className="text-base">{car.engineCut ? '⛔' : '✅'}</div>
                              <div className="text-[9px] text-gray-400">Engine</div>
                            </div>
                            <div>
                              <div className="text-base">🔋</div>
                              <div className="text-[9px] text-gray-400">{car.voltage || 'N/A'}</div>
                            </div>
                          </div>
                          {/* Quick actions */}
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={(e) => { e.stopPropagation(); sendCommand('lock-kill', car.carId); }}
                              disabled={actionLoading[car.carId]}
                              className="flex-1 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-700 text-xs font-medium py-2 rounded-lg transition-colors disabled:opacity-50"
                            >🔒 Lock</button>
                            <button
                              onClick={(e) => { e.stopPropagation(); sendCommand('unlock-restore', car.carId); }}
                              disabled={actionLoading[car.carId]}
                              className="flex-1 bg-green-50 hover:bg-green-100 active:bg-green-200 text-green-700 text-xs font-medium py-2 rounded-lg transition-colors disabled:opacity-50"
                            >🔓 Unlock</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {view === 'map' && (
            <>
              {/* Map fills everything */}
              <div className="absolute inset-0">
                <Suspense fallback={<div className="flex items-center justify-center h-full text-gray-400 animate-pulse">Loading map...</div>}>
                  <FleetMap
                    cars={filteredCars}
                    rentedPlates={rentedPlates}
                    onCommand={sendCommand}
                    selectedCarId={selectedCar}
                    onSelectCar={(carId) => selectCar(carId)}
                  />
                </Suspense>
              </div>

              {/* Detail Panel - side on desktop, bottom sheet on mobile */}
              {selected && (
                <>
                  {/* Desktop: side panel */}
                  <div className="hidden lg:flex absolute top-0 left-0 bottom-0 w-80 bg-white shadow-2xl z-30 flex-col overflow-hidden">
                    <DetailPanel
                      car={selected}
                      detailTab={detailTab}
                      setDetailTab={setDetailTab}
                      isRented={isRented(selected.plate)}
                      actionLoading={actionLoading}
                      sendCommand={sendCommand}
                      onClose={() => setSelectedCar(null)}
                    />
                  </div>

                  {/* Mobile: bottom sheet */}
                  <div className="lg:hidden absolute bottom-14 left-0 right-0 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.15)] z-30 rounded-t-2xl max-h-[70vh] flex flex-col overflow-hidden animate-[slideUp_0.2s_ease-out]">
                    {/* Drag handle */}
                    <div className="flex justify-center pt-2 pb-1">
                      <div className="w-10 h-1 bg-gray-300 rounded-full" />
                    </div>
                    <DetailPanel
                      car={selected}
                      detailTab={detailTab}
                      setDetailTab={setDetailTab}
                      isRented={isRented(selected.plate)}
                      actionLoading={actionLoading}
                      sendCommand={sendCommand}
                      onClose={() => setSelectedCar(null)}
                    />
                  </div>
                </>
              )}
            </>
          )}

          {/* Reservations / Trips View */}
          {view === 'reservations' && (() => {
            const now = new Date();
            const todayStr = now.toDateString();
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toDateString();

            const formatTimeAmPm = (d: Date) => {
              const h = d.getHours();
              const m = d.getMinutes();
              const ampm = h >= 12 ? 'p.m.' : 'a.m.';
              const hour = h % 12 || 12;
              return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
            };

            const getDayLabel = (d: Date) => {
              const ds = d.toDateString();
              if (ds === todayStr) return 'Today';
              if (ds === tomorrowStr) return 'Tomorrow';
              return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
            };

            const getDayKey = (d: Date) => {
              return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            };

            // Build events: each reservation produces start + end events
            type TripEvent = {
              type: 'start' | 'end';
              time: Date;
              reservation: Reservation;
              car: Car | undefined;
            };

            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const tomorrowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            const filteredRes = tripsTab === 'booked'
              ? reservations.filter(r => {
                  if (r.status === 'booked' || r.status === 'active') return true;
                  // Also include completed trips that ended today
                  if (r.status === 'completed' && r.tripEnd) {
                    const end = new Date(r.tripEnd);
                    return end >= todayStart && end < tomorrowEnd;
                  }
                  return false;
                })
              : reservations.filter(r => r.status === 'completed');

            const events: TripEvent[] = [];
            filteredRes.forEach(res => {
              const car = cars.find(c => c.carId === res.carId);
              const start = res.tripStart ? new Date(res.tripStart) : null;
              const end = res.tripEnd ? new Date(res.tripEnd) : null;

              if (tripsTab === 'booked') {
                // For booked: show start events for trips starting today or later
                // Skip "in progress" placeholders for multi-day trips that started before today
                if (start && start >= todayStart) {
                  events.push({ type: 'start', time: start, reservation: res, car });
                }
                if (end) {
                  events.push({ type: 'end', time: end, reservation: res, car });
                }
              } else {
                // History: just use end date for each reservation
                if (end) {
                  events.push({ type: 'end', time: end, reservation: res, car });
                } else if (start) {
                  events.push({ type: 'start', time: start, reservation: res, car });
                }
              }
            });

            // Booked: chronological (ascending), History: most recent first (descending)
            if (tripsTab === 'booked') {
              events.sort((a, b) => a.time.getTime() - b.time.getTime());
            } else {
              events.sort((a, b) => b.time.getTime() - a.time.getTime());
            }

            // Group events
            const grouped: { label: string; key: string; events: TripEvent[] }[] = [];
            if (tripsTab === 'history') {
              // History: group by month, show each reservation once (use end date), reverse chronological
              const seen = new Set<string>();
              const monthMap = new Map<string, TripEvent[]>();
              const monthOrder: string[] = [];
              events.forEach(ev => {
                if (seen.has(ev.reservation.reservationId)) return;
                seen.add(ev.reservation.reservationId);
                const d = ev.time;
                const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
                const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                if (!monthMap.has(key)) { monthMap.set(key, []); monthOrder.push(key); }
                monthMap.get(key)!.push(ev);
              });
              monthOrder.forEach(key => {
                const evs = monthMap.get(key)!;
                const label = evs[0].time.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                grouped.push({ label, key, events: evs });
              });
            } else {
              // Booked: group by day with start+end events
              const dayMap = new Map<string, TripEvent[]>();
              const dayOrder: string[] = [];
              events.forEach(ev => {
                const key = getDayKey(ev.time);
                if (!dayMap.has(key)) { dayMap.set(key, []); dayOrder.push(key); }
                dayMap.get(key)!.push(ev);
              });
              dayOrder.forEach(key => {
                const evs = dayMap.get(key)!;
                grouped.push({ label: getDayLabel(evs[0].time), key, events: evs });
              });
            }

            // Determine status badge for an event
            const getStatusBadge = (ev: TripEvent) => {
              const evDay = ev.time.toDateString();
              const isToday = evDay === todayStr;
              const isPast = ev.time.getTime() < now.getTime();
              const timeStr = formatTimeAmPm(ev.time);

              if (ev.reservation.status === 'active' && ev.type === 'start' && isPast) {
                // Currently in progress - check if it started today
                if (isToday) {
                  const endTime = ev.reservation.tripEnd ? new Date(ev.reservation.tripEnd) : null;
                  if (endTime && endTime.getTime() > now.getTime()) {
                    return { text: 'In progress', style: 'plain' as const };
                  }
                  return { text: `Started at ${timeStr}`, style: 'plain' as const };
                }
                return { text: 'In progress', style: 'plain' as const };
              }

              if (ev.type === 'start') {
                if (isPast && isToday) return { text: `Started at ${timeStr}`, style: 'plain' as const };
                if (isPast) return { text: `Started at ${timeStr}`, style: 'plain' as const };
                return { text: `Starting at ${timeStr}`, style: 'green' as const };
              } else {
                if (isPast) return { text: `Ended at ${timeStr}`, style: 'plain' as const };
                return { text: `Ending at ${timeStr}`, style: 'red' as const };
              }
            };

            return (
              <div className="absolute inset-0 overflow-y-auto bg-white pb-20 lg:pb-6">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10">
                  {/* Tab headers */}
                  <div className="flex gap-8 mb-6 items-center">
                    <button
                      onClick={() => setTripsTab('booked')}
                      className={`text-2xl sm:text-3xl font-bold pb-1 ${tripsTab === 'booked' ? 'text-gray-900' : 'text-gray-300 hover:text-gray-400'}`}
                    >Booked</button>
                    <button
                      onClick={() => setTripsTab('history')}
                      className={`text-2xl sm:text-3xl font-bold pb-1 ${tripsTab === 'history' ? 'text-gray-900' : 'text-gray-300 hover:text-gray-400'}`}
                    >History</button>
                    <button
                      onClick={async () => {
                        setSyncing(true);
                        try {
                          await fetch('/api/reservations/sync');
                          await fetchData();
                          showToast('Reservations synced');
                        } catch { showToast('Sync failed', 'error'); }
                        setSyncing(false);
                      }}
                      disabled={syncing}
                      className="ml-auto p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                      title="Sync reservations"
                    >
                      <svg className={`w-5 h-5 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </button>
                  </div>

                  {/* Vehicle filter dropdown */}
                  <div className="mb-8">
                    <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-full text-sm text-gray-700 hover:bg-gray-50">
                      All vehicles
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                  </div>

                  {events.length === 0 ? (
                    <div className="text-center py-16">
                      <div className="text-4xl mb-3">📭</div>
                      <h2 className="text-lg font-semibold text-gray-700 mb-1">
                        {tripsTab === 'booked' ? 'No upcoming trips' : 'No trip history'}
                      </h2>
                      <p className="text-sm text-gray-500">
                        {tripsTab === 'booked'
                          ? 'Your booked and active trips will appear here.'
                          : 'Completed trips will appear here.'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {grouped.map(group => (
                        <div key={group.key}>
                          {/* Day header */}
                          <div className="mb-4">
                            <h2 className="text-base sm:text-lg font-medium text-gray-900 mb-2">{group.label}</h2>
                            <div className="border-b border-gray-200" />
                          </div>

                          {/* Event cards */}
                          <div className="space-y-4">
                            {group.events.map((ev, idx) => {
                              const badge = getStatusBadge(ev);
                              const res = ev.reservation;
                              const car = ev.car;
                              const plate = car?.plate || '';
                              const photo = plate ? getCarPhoto(plate) : null;
                              const icon = car ? getCarIcon(car.name) : getCarIcon(`${res.vehicleModel || ''} ${res.vehicleYear || ''}`);
                              const vehicleName = car?.name || `${res.vehicleModel || ''} ${res.vehicleYear || ''}`.trim() || 'Unknown Vehicle';
                              const address = res.location || '';

                              return (
                                <div
                                  key={`${res.reservationId}-${ev.type}-${idx}`}
                                  className="border border-gray-200 rounded-xl p-5 sm:p-6 flex justify-between items-start gap-4"
                                >
                                  {/* Left side */}
                                  <div className="flex-1 min-w-0">
                                    {/* Status badge */}
                                    <div className="mb-2">
                                      {badge.style === 'plain' && (
                                        <span className="text-sm text-gray-700">{badge.text}</span>
                                      )}
                                      {badge.style === 'green' && (
                                        <span className="inline-block text-sm text-green-800 bg-green-50 border border-green-300 rounded px-2.5 py-0.5">{badge.text}</span>
                                      )}
                                      {badge.style === 'red' && (
                                        <span className="inline-block text-sm text-red-700 bg-red-50 border border-red-300 rounded px-2.5 py-0.5">{badge.text}</span>
                                      )}
                                    </div>

                                    {/* Vehicle name */}
                                    <h3 className="text-lg font-bold text-gray-900 mb-1">{vehicleName}</h3>

                                    {/* Address */}
                                    {address && (
                                      <p className="text-sm text-gray-500 mb-3">{address}</p>
                                    )}

                                    {/* Guest info */}
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm shrink-0">
                                        👤
                                      </div>
                                      <span className="text-sm text-gray-600">
                                        {res.guestName} <span className="text-gray-400">#{res.reservationId}</span>
                                      </span>
                                      {res.renterToken && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const url = `${window.location.origin}/trip/${res.renterToken}`;
                                            navigator.clipboard.writeText(url).then(() => {
                                              showToast('📋 Guest link copied!');
                                            }).catch(() => {
                                              // Fallback for older browsers
                                              prompt('Copy this link:', url);
                                            });
                                          }}
                                          className="ml-1 text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-0.5 rounded hover:bg-blue-50 transition-colors"
                                        >
                                          🔗 Copy Link
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Right side - car photo + plate */}
                                  <div className="flex flex-col items-center shrink-0">
                                    {photo ? (
                                      <img
                                        src={photo}
                                        alt={vehicleName}
                                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover"
                                      />
                                    ) : icon ? (
                                      <div
                                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg flex items-center justify-center text-3xl"
                                        style={{ backgroundColor: icon.color + '15' }}
                                      >
                                        {icon.emoji}
                                      </div>
                                    ) : (
                                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg bg-gray-100 flex items-center justify-center text-3xl">
                                        🚗
                                      </div>
                                    )}
                                    {plate && (
                                      <span className="text-xs text-gray-500 mt-1">{plate}</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Analytics View */}
          {view === 'analytics' && (
            <div className="absolute inset-0 overflow-y-auto p-4 sm:p-6 bg-gray-50 pb-20 lg:pb-6">
              {!analytics ? (
                <div className="text-gray-400 animate-pulse">Loading analytics...</div>
              ) : (
                <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900">📊 Analytics</h1>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                    {[
                      { label: 'Total Revenue', value: `$${analytics.summary.totalRevenue.toLocaleString()}`, color: 'text-green-600' },
                      { label: 'Total Trips', value: analytics.summary.totalTrips, color: 'text-gray-900' },
                      { label: 'Avg per Trip', value: `$${analytics.summary.avgEarningsPerTrip.toFixed(0)}`, color: 'text-green-600' },
                      { label: 'Avg Trip Length', value: `${analytics.summary.avgTripDays} days`, color: 'text-gray-900' },
                      { label: 'Total Rental Days', value: analytics.summary.totalDays.toLocaleString(), color: 'text-gray-900' },
                      { label: 'Unique Guests', value: analytics.summary.uniqueGuests, color: 'text-gray-900' },
                      { label: 'Cancellations', value: analytics.summary.cancelledTrips, color: 'text-red-600' },
                      { label: 'Revenue / Day', value: `$${analytics.summary.totalDays ? (analytics.summary.totalRevenue / analytics.summary.totalDays).toFixed(0) : 0}`, color: 'text-green-600' },
                    ].map(s => (
                      <div key={s.label} className="rounded-xl border border-gray-200 bg-white shadow-sm p-3 sm:p-4">
                        <p className="text-gray-500 text-xs sm:text-sm">{s.label}</p>
                        <p className={`text-lg sm:text-2xl font-bold ${s.color}`}>{s.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-3 sm:p-4">
                    <h2 className="font-bold text-base sm:text-lg text-gray-900 mb-3 sm:mb-4">📈 Monthly Revenue</h2>
                    <div className="space-y-2">
                      {analytics.monthlyStats.map((m: any) => {
                        const maxRev = Math.max(...analytics.monthlyStats.map((s: any) => s.revenue));
                        const pct = maxRev ? (m.revenue / maxRev) * 100 : 0;
                        return (
                          <div key={m.month} className="flex items-center gap-2 sm:gap-3">
                            <span className="text-xs sm:text-sm text-gray-500 w-16 sm:w-20 shrink-0">{m.month}</span>
                            <div className="flex-1 h-5 sm:h-6 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs sm:text-sm font-medium text-gray-900 w-16 sm:w-24 text-right">${Math.round(m.revenue).toLocaleString()}</span>
                            <span className="text-xs text-gray-400 w-12 sm:w-16 text-right hidden sm:block">{m.trips} trips</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-3 sm:p-4">
                    <h2 className="font-bold text-base sm:text-lg text-gray-900 mb-3 sm:mb-4">🏆 Vehicle Rankings</h2>
                    <div className="overflow-x-auto -mx-3 sm:mx-0">
                      <table className="w-full text-xs sm:text-sm min-w-[600px]">
                        <thead>
                          <tr className="text-gray-500 border-b border-gray-200">
                            <th className="text-left py-2 pr-3">#</th>
                            <th className="text-left py-2 pr-3">Vehicle</th>
                            <th className="text-left py-2 pr-3">Plate</th>
                            <th className="text-right py-2 pr-3">Trips</th>
                            <th className="text-right py-2 pr-3">Days</th>
                            <th className="text-right py-2 pr-3">Revenue</th>
                            <th className="text-right py-2 pr-3">$/Trip</th>
                            <th className="text-right py-2">$/Day</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.vehicleStats.map((v: any, i: number) => (
                            <tr key={v.plate + v.name} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-2 pr-3 text-gray-400">{i + 1}</td>
                              <td className="py-2 pr-3 font-medium text-gray-900">{v.name}</td>
                              <td className="py-2 pr-3 text-gray-500">{v.plate}</td>
                              <td className="py-2 pr-3 text-right text-gray-700">{v.trips}</td>
                              <td className="py-2 pr-3 text-right text-gray-700">{v.days}</td>
                              <td className="py-2 pr-3 text-right text-green-600 font-medium">${Math.round(v.revenue).toLocaleString()}</td>
                              <td className="py-2 pr-3 text-right text-gray-700">${Math.round(v.avgPerTrip)}</td>
                              <td className="py-2 text-right text-gray-700">${Math.round(v.avgPerDay)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Navigation - mobile only */}
      <nav className="lg:hidden bg-white border-t border-gray-200 h-14 flex items-center justify-around shrink-0 z-50 safe-bottom">
        <button
          onClick={() => { setView('fleet'); setSelectedCar(null); setSidebarOpen(false); }}
          className={`flex flex-col items-center gap-0.5 px-4 py-1 ${view === 'fleet' ? 'text-blue-600' : 'text-gray-400'}`}
        >
          <span className="text-lg">📋</span>
          <span className="text-[10px] font-medium">Fleet</span>
        </button>
        <button
          onClick={() => { setView('map'); setSelectedCar(null); setSidebarOpen(false); }}
          className={`flex flex-col items-center gap-0.5 px-4 py-1 ${view === 'map' ? 'text-blue-600' : 'text-gray-400'}`}
        >
          <span className="text-lg">🗺️</span>
          <span className="text-[10px] font-medium">Map</span>
        </button>
        <button
          onClick={() => { setView('reservations'); setSelectedCar(null); setSidebarOpen(false); }}
          className={`flex flex-col items-center gap-0.5 px-4 py-1 ${view === 'reservations' ? 'text-blue-600' : 'text-gray-400'}`}
        >
          <span className="text-lg">📅</span>
          <span className="text-[10px] font-medium">Trips</span>
        </button>
        <button
          onClick={() => { setView('analytics'); setSidebarOpen(false); if (!analytics) fetch('/api/analytics').then(r => r.json()).then(setAnalytics); }}
          className={`flex flex-col items-center gap-0.5 px-4 py-1 ${view === 'analytics' ? 'text-blue-600' : 'text-gray-400'}`}
        >
          <span className="text-lg">📊</span>
          <span className="text-[10px] font-medium">Analytics</span>
        </button>
        <a
          href="/service"
          className="flex flex-col items-center gap-0.5 px-4 py-1 text-gray-400"
        >
          <span className="text-lg">🔧</span>
          <span className="text-[10px] font-medium">Service</span>
        </a>
      </nav>

      {/* Desktop nav buttons in header - hidden on mobile (using bottom nav instead) */}
      <style jsx global>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .safe-bottom {
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
      `}</style>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-20 lg:bottom-6 right-4 lg:right-6 z-[9999] px-4 sm:px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all animate-[slideUp_0.3s_ease-out] ${
          toast.type === 'success' ? 'bg-slate-800' : 'bg-red-600'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

/* Detail Panel Component */
function DetailPanel({ car, detailTab, setDetailTab, isRented, actionLoading, sendCommand, onClose }: {
  car: Car;
  detailTab: 'info' | 'controls';
  setDetailTab: (t: 'info' | 'controls') => void;
  isRented: boolean;
  actionLoading: Record<string, boolean>;
  sendCommand: (action: string, carId?: string) => void;
  onClose: () => void;
}) {
  const icon = getCarIcon(car.name);
  return (
    <>
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 z-10"
      >✕</button>

      {/* Car Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0"
            style={{ backgroundColor: icon.color + '20', border: `2px solid ${car.online ? '#22c55e' : '#ef4444'}` }}
          >
            {icon.emoji}
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-lg text-gray-900 truncate">{car.name}</h2>
            <p className="text-sm text-gray-500">{car.plate}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${car.online ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {car.online ? (car.moving ? `Moving ${car.speed}mph` : 'Parked') : 'Offline'}
          </span>
          {isRented && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Rented</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100">
        <button
          onClick={() => setDetailTab('info')}
          className={`flex-1 py-2.5 text-sm font-medium ${detailTab === 'info' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400'}`}
        >INFO</button>
        <button
          onClick={() => setDetailTab('controls')}
          className={`flex-1 py-2.5 text-sm font-medium ${detailTab === 'controls' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400'}`}
        >CONTROLS</button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {detailTab === 'info' && (
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">ACC</span>
              <span className="text-gray-900 font-medium">{car.acc}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Door</span>
              <span className="text-gray-900 font-medium">{car.locked ? '🔒 Locked' : '🔓 Open'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Engine</span>
              <span className="text-gray-900 font-medium">{car.engineCut ? '⛔ Cut' : '✅ Active'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Voltage</span>
              <span className="text-gray-900 font-medium">{car.voltage}</span>
            </div>
            {car.lat !== 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Location</span>
                <span className="text-gray-900 font-medium">{car.lat.toFixed(4)}, {car.lon.toFixed(4)}</span>
              </div>
            )}
          </div>
        )}

        {detailTab === 'controls' && (
          <div className="space-y-3">
            <button
              onClick={() => sendCommand('lock-kill', car.carId)}
              disabled={actionLoading[car.carId]}
              className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {actionLoading[car.carId] ? 'Sending...' : '🔒 Lock + Kill Engine'}
            </button>
            <button
              onClick={() => sendCommand('unlock-restore', car.carId)}
              disabled={actionLoading[car.carId]}
              className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {actionLoading[car.carId] ? 'Sending...' : '🔓 Unlock + Start Engine'}
            </button>
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <div className="border-t border-gray-100 p-3 flex justify-around">
        <div className="text-center">
          <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center text-lg ${car.online ? 'bg-green-100' : 'bg-red-100'}`}>
            {car.online ? '📡' : '📴'}
          </div>
          <div className="text-[10px] text-gray-500 mt-1">Device</div>
        </div>
        <div className="text-center">
          <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center text-lg ${car.locked ? 'bg-red-100' : 'bg-green-100'}`}>
            {car.locked ? '🔒' : '🔓'}
          </div>
          <div className="text-[10px] text-gray-500 mt-1">Door</div>
        </div>
        <div className="text-center">
          <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center text-lg ${car.engineCut ? 'bg-red-100' : 'bg-green-100'}`}>
            {car.engineCut ? '⛔' : '✅'}
          </div>
          <div className="text-[10px] text-gray-500 mt-1">Engine</div>
        </div>
        <div className="text-center">
          <div className="w-10 h-10 mx-auto rounded-full flex items-center justify-center text-lg bg-gray-100">
            🔋
          </div>
          <div className="text-[10px] text-gray-500 mt-1">{car.voltage || 'N/A'}</div>
        </div>
      </div>
    </>
  );
}
