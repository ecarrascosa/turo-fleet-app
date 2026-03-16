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
  const [view, setView] = useState<'fleet' | 'map' | 'analytics'>('fleet');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = useCallback(async () => {
    try {
      const [fleetRes, rentalRes] = await Promise.all([
        fetch('/api/fleet'), fetch('/api/rentals')
      ]);
      const fleetData = await fleetRes.json();
      const rentalData = await rentalRes.json();
      if (fleetData.cars) setCars(fleetData.cars);
      if (rentalData.active) setActiveRentals(rentalData.active);
      if (rentalData.all) setAllRentals(rentalData.all);
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

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-xl text-gray-400 animate-pulse">Loading fleet...</div>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Top Header */}
      <header className="bg-slate-800 text-white h-12 flex items-center justify-between px-4 shrink-0 z-50">
        <div className="flex items-center gap-3">
          <span className="font-bold text-lg">⚡ Fleet Manager</span>
          <span className="text-slate-400 text-sm hidden sm:block">
            {cars.length} vehicles · {cars.filter(c => c.online).length} online
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setView('fleet'); setSelectedCar(null); }}
            className={`px-3 py-1 text-sm rounded ${view === 'fleet' ? 'bg-slate-600' : 'hover:bg-slate-700'}`}
          >📋 Fleet</button>
          <button
            onClick={() => { setView('map'); setSelectedCar(null); }}
            className={`px-3 py-1 text-sm rounded ${view === 'map' ? 'bg-slate-600' : 'hover:bg-slate-700'}`}
          >🗺️ Map</button>
          <button
            onClick={() => { setView('analytics'); if (!analytics) fetch('/api/analytics').then(r => r.json()).then(setAnalytics); }}
            className={`px-3 py-1 text-sm rounded ${view === 'analytics' ? 'bg-slate-600' : 'hover:bg-slate-700'}`}
          >📊 Analytics</button>
          <button
            onClick={() => sendCommand('lock-all')}
            disabled={bulkLoading}
            className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded transition-colors"
          >
            {bulkLoading ? 'Locking...' : '🔒 Lock All'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 bg-slate-900 text-white flex flex-col shrink-0 z-40">
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
                  onClick={() => { setSelectedCar(isSelected ? null : car.carId); setDetailTab('info'); setView('map'); }}
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
            <div className="absolute inset-0 overflow-y-auto p-6 bg-gray-50">
              <div className="max-w-7xl mx-auto">
                <div className="flex items-center justify-between mb-4">
                  <h1 className="text-2xl font-bold text-gray-900">📋 Fleet Overview</h1>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> {cars.filter(c => c.online).length} Online</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> {cars.filter(c => !c.online).length} Offline</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> {activeRentals.length} Rented</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredCars.map(car => {
                    const icon = getCarIcon(car.name);
                    const photo = getCarPhoto(car.plate);
                    const rented = isRented(car.plate);
                    const rental = activeRentals.find(r => r.plate === car.plate);
                    return (
                      <div
                        key={car.carId}
                        className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden cursor-pointer"
                        onClick={() => { setSelectedCar(car.carId); setDetailTab('info'); setView('map'); }}
                      >
                        {/* Car photo or colored header */}
                        {photo ? (
                          <div className="h-32 bg-gray-100 relative overflow-hidden">
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
                              className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-medium py-1.5 rounded-lg transition-colors disabled:opacity-50"
                            >🔒 Lock + Kill</button>
                            <button
                              onClick={(e) => { e.stopPropagation(); sendCommand('unlock-restore', car.carId); }}
                              disabled={actionLoading[car.carId]}
                              className="flex-1 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium py-1.5 rounded-lg transition-colors disabled:opacity-50"
                            >🔓 Unlock + Start</button>
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
                    onSelectCar={(carId) => { setSelectedCar(carId); setDetailTab('info'); }}
                  />
                </Suspense>
              </div>

              {/* Detail Panel - slides over map */}
              {selected && (
                <div className="absolute top-0 left-0 bottom-0 w-80 bg-white shadow-2xl z-30 flex flex-col overflow-hidden">
                  {/* Close */}
                  <button
                    onClick={() => setSelectedCar(null)}
                    className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 z-10"
                  >✕</button>

                  {/* Car Header */}
                  <div className="p-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
                        style={{ backgroundColor: getCarIcon(selected.name).color + '20', border: `2px solid ${selected.online ? '#22c55e' : '#ef4444'}` }}
                      >
                        {getCarIcon(selected.name).emoji}
                      </div>
                      <div>
                        <h2 className="font-bold text-lg text-gray-900">{selected.name}</h2>
                        <p className="text-sm text-gray-500">{selected.plate}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${selected.online ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {selected.online ? (selected.moving ? `Moving ${selected.speed}mph` : 'Parked') : 'Offline'}
                      </span>
                      {isRented(selected.plate) && (
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
                      <div className="space-y-4">
                        <div className="space-y-3">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">ACC</span>
                            <span className="text-gray-900 font-medium">{selected.acc}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Door</span>
                            <span className="text-gray-900 font-medium">{selected.locked ? '🔒 Locked' : '🔓 Open'}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Engine</span>
                            <span className="text-gray-900 font-medium">{selected.engineCut ? '⛔ Cut' : '✅ Active'}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Voltage</span>
                            <span className="text-gray-900 font-medium">{selected.voltage}</span>
                          </div>
                          {selected.lat !== 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-500">Location</span>
                              <span className="text-gray-900 font-medium">{selected.lat.toFixed(4)}, {selected.lon.toFixed(4)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {detailTab === 'controls' && (
                      <div className="space-y-3">
                        <button
                          onClick={() => sendCommand('lock-kill', selected.carId)}
                          disabled={actionLoading[selected.carId]}
                          className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
                        >
                          {actionLoading[selected.carId] ? 'Sending...' : '🔒 Lock + Kill Engine'}
                        </button>
                        <button
                          onClick={() => sendCommand('unlock-restore', selected.carId)}
                          disabled={actionLoading[selected.carId]}
                          className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
                        >
                          {actionLoading[selected.carId] ? 'Sending...' : '🔓 Unlock + Start Engine'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Bottom Status Bar */}
                  <div className="border-t border-gray-100 p-3 flex justify-around">
                    <div className="text-center">
                      <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center text-lg ${selected.online ? 'bg-green-100' : 'bg-red-100'}`}>
                        {selected.online ? '📡' : '📴'}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1">Device</div>
                    </div>
                    <div className="text-center">
                      <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center text-lg ${selected.locked ? 'bg-red-100' : 'bg-green-100'}`}>
                        {selected.locked ? '🔒' : '🔓'}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1">Door</div>
                    </div>
                    <div className="text-center">
                      <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center text-lg ${selected.engineCut ? 'bg-red-100' : 'bg-green-100'}`}>
                        {selected.engineCut ? '⛔' : '✅'}
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1">Engine</div>
                    </div>
                    <div className="text-center">
                      <div className="w-10 h-10 mx-auto rounded-full flex items-center justify-center text-lg bg-gray-100">
                        🔋
                      </div>
                      <div className="text-[10px] text-gray-500 mt-1">{selected.voltage || 'N/A'}</div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Analytics View */}
          {view === 'analytics' && (
            <div className="absolute inset-0 overflow-y-auto p-6 bg-gray-50">
              {!analytics ? (
                <div className="text-gray-400 animate-pulse">Loading analytics...</div>
              ) : (
                <div className="max-w-6xl mx-auto space-y-6">
                  <h1 className="text-2xl font-bold text-gray-900">📊 Analytics</h1>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                      <div key={s.label} className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
                        <p className="text-gray-500 text-sm">{s.label}</p>
                        <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
                    <h2 className="font-bold text-lg text-gray-900 mb-4">📈 Monthly Revenue</h2>
                    <div className="space-y-2">
                      {analytics.monthlyStats.map((m: any) => {
                        const maxRev = Math.max(...analytics.monthlyStats.map((s: any) => s.revenue));
                        const pct = maxRev ? (m.revenue / maxRev) * 100 : 0;
                        return (
                          <div key={m.month} className="flex items-center gap-3">
                            <span className="text-sm text-gray-500 w-20 shrink-0">{m.month}</span>
                            <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-sm font-medium text-gray-900 w-24 text-right">${Math.round(m.revenue).toLocaleString()}</span>
                            <span className="text-xs text-gray-400 w-16 text-right">{m.trips} trips</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
                    <h2 className="font-bold text-lg text-gray-900 mb-4">🏆 Vehicle Rankings</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-gray-500 border-b border-gray-200">
                            <th className="text-left py-2 pr-4">#</th>
                            <th className="text-left py-2 pr-4">Vehicle</th>
                            <th className="text-left py-2 pr-4">Plate</th>
                            <th className="text-right py-2 pr-4">Trips</th>
                            <th className="text-right py-2 pr-4">Days</th>
                            <th className="text-right py-2 pr-4">Revenue</th>
                            <th className="text-right py-2 pr-4">$/Trip</th>
                            <th className="text-right py-2">$/Day</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.vehicleStats.map((v: any, i: number) => (
                            <tr key={v.plate + v.name} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-2 pr-4 text-gray-400">{i + 1}</td>
                              <td className="py-2 pr-4 font-medium text-gray-900">{v.name}</td>
                              <td className="py-2 pr-4 text-gray-500">{v.plate}</td>
                              <td className="py-2 pr-4 text-right text-gray-700">{v.trips}</td>
                              <td className="py-2 pr-4 text-right text-gray-700">{v.days}</td>
                              <td className="py-2 pr-4 text-right text-green-600 font-medium">${Math.round(v.revenue).toLocaleString()}</td>
                              <td className="py-2 pr-4 text-right text-gray-700">${Math.round(v.avgPerTrip)}</td>
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

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[9999] px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all animate-[slideUp_0.3s_ease-out] ${
          toast.type === 'success' ? 'bg-slate-800' : 'bg-red-600'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
