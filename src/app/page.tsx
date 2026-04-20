'use client';
import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { getCarIcon } from '@/lib/car-icons';
import Link from 'next/link';

const FleetMap = lazy(() => import('@/components/FleetMap'));

interface Car {
  carId: string; name: string; plate: string; imei: string;
  online: boolean; moving: boolean; speed: number;
  lat: number; lon: number; acc: string;
  locked: boolean; engineCut: boolean; voltage: string;
  source?: string;
}

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/', icon: '📊' },
  { label: 'Map', href: '/', icon: '🗺️', view: 'map' as const },
  { label: 'Trips', href: '/trips', icon: '📅' },
  { label: 'Service', href: '/service', icon: '🔧' },
];

function Sidebar({ currentPath, activeView, onViewChange }: { currentPath: string; activeView: string; onViewChange: (view: 'dashboard' | 'map') => void }) {
  return (
    <aside className="hidden lg:flex w-[220px] bg-slate-900 text-white flex-col shrink-0">
      <div className="h-16 flex items-center px-5 border-b border-slate-800">
        <span className="text-xl font-bold tracking-tight">⚡ <span className="text-cyan-400">Fleet</span>Pro</span>
      </div>
      <nav className="flex-1 py-4">
        {NAV_ITEMS.map(item => {
          const isView = !!item.view;
          const active = isView ? activeView === (item.view || 'dashboard') : item.href === currentPath;
          if (isView) {
            return (
              <button
                key={item.label}
                onClick={() => onViewChange(item.view as 'map')}
                className={`w-full flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-cyan-500/10 text-cyan-400 border-r-2 border-cyan-400'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </button>
            );
          }
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${
                active
                  ? 'bg-cyan-500/10 text-cyan-400 border-r-2 border-cyan-400'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-slate-800 text-xs text-slate-500 text-center">
        Turo Fleet Manager
      </div>
    </aside>
  );
}

function LockClosed() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
      <circle cx="12" cy="16" r="1" fill="currentColor" />
    </svg>
  );
}

function LockOpen() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 019.9-1" />
      <circle cx="12" cy="16" r="1" fill="currentColor" />
    </svg>
  );
}

function EngineOn() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}

function EngineOff() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${borderColor} ${color} bg-transparent hover:bg-opacity-10`}
    >
      {loading ? <span className="animate-spin text-sm">⏳</span> : icon}
    </button>
  );
}

function StatusBadge({ acc, online }: { acc: string; online: boolean }) {
  if (!online) return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Offline</span>;
  const on = acc === 'on';
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${on ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {on ? '● Ignition ON' : '● Ignition OFF'}
    </span>
  );
}

export default function Home() {
  const [cars, setCars] = useState<Car[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'dashboard' | 'map'>('dashboard');
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [lockAllLoading, setLockAllLoading] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/fleet');
      const data = await res.json();
      if (data.cars) setCars(data.cars);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); const i = setInterval(fetchData, 30000); return () => clearInterval(i); }, [fetchData]);

  const filteredCars = useMemo(() => {
    if (!search.trim()) return cars;
    const q = search.toLowerCase();
    return cars.filter(c => c.name.toLowerCase().includes(q) || c.plate.toLowerCase().includes(q));
  }, [cars, search]);

  const rentedPlates = useMemo(() => {
    const map: Record<string, boolean> = {};
    return map;
  }, []);

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
      if (res.ok && data.success) {
        showToast(`✅ ${action} sent successfully`);
      } else {
        showToast(`❌ ${data.error || 'Failed'}`, 'error');
      }
      setTimeout(fetchData, 3000);
    } catch (e: any) {
      showToast(`❌ ${e.message}`, 'error');
    }
    setActionLoading(p => ({ ...p, [key]: false }));
  };

  const lockAllIdle = async () => {
    const whatsGPSCars = cars.filter(c => c.source !== 'bouncie');
    if (!whatsGPSCars.length) return;
    if (!confirm(`Lock + kill engine on ${whatsGPSCars.length} WhatsGPS vehicles?`)) return;
    setLockAllLoading(true);
    let ok = 0, fail = 0;
    for (const car of whatsGPSCars) {
      try {
        const res = await fetch('/api/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'lock', carId: car.carId }),
        });
        const data = await res.json();
        if (res.ok && data.success) ok++; else fail++;
      } catch { fail++; }
    }
    showToast(`🔒 Lock All: ${ok} succeeded, ${fail} failed`);
    setLockAllLoading(false);
    setTimeout(fetchData, 3000);
  };

  if (loading) return (
    <div className="h-full flex items-center justify-center bg-gray-50">
      <div className="text-lg text-gray-400 animate-pulse">Loading fleet...</div>
    </div>
  );

  return (
    <div className="h-full flex">
      <Sidebar currentPath="/" activeView={view} onViewChange={setView} />

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 h-14 flex items-center justify-around z-50 safe-bottom">
        {NAV_ITEMS.map(item => {
          const isView = !!item.view;
          const active = isView ? view === item.view : (!item.view && view === 'dashboard' && item.href === '/');
          if (isView) {
            return (
              <button key={item.label} onClick={() => setView(item.view as 'map')} className={`flex flex-col items-center gap-0.5 px-3 py-1 ${active ? 'text-cyan-600' : 'text-gray-400'}`}>
                <span className="text-lg">{item.icon}</span>
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          }
          return (
            <Link key={item.label} href={item.href} onClick={() => item.href === '/' && setView('dashboard')} className={`flex flex-col items-center gap-0.5 px-3 py-1 ${active ? 'text-cyan-600' : 'text-gray-400'}`}>
              <span className="text-lg">{item.icon}</span>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {view === 'map' ? (
        /* Full-screen Map view */
        <div className="flex-1 relative">
          <Suspense fallback={<div className="flex items-center justify-center h-full w-full text-gray-400 animate-pulse">Loading map...</div>}>
            <FleetMap
              cars={filteredCars}
              rentedPlates={rentedPlates}
              onCommand={sendCommand}
              selectedCarId={null}
              onSelectCar={() => {}}
            />
          </Suspense>
        </div>
      ) : (
        <>
          {/* Center: Vehicle List */}
          <div className="w-full lg:w-[420px] xl:w-[460px] flex flex-col border-r border-gray-200 bg-white shrink-0">
            {/* Header */}
            <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100">
              <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">{cars.length} vehicles · {cars.filter(c => c.online).length} online</span>
                <button
                  onClick={lockAllIdle}
                  disabled={lockAllLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {lockAllLoading ? <span className="animate-spin">⏳</span> : '🔒'}
                  Lock All
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search vehicles..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition"
                />
              </div>
            </div>

            {/* Vehicle Cards */}
            <div className="flex-1 overflow-y-auto pb-16 lg:pb-0">
              {filteredCars.map(car => {
                const icon = getCarIcon(car.name);
                const isWhatsGPS = car.source !== 'bouncie';
                return (
                  <div key={car.carId} className="px-4 py-4 border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0"
                          style={{ backgroundColor: icon.color + '18' }}
                        >
                          {icon.emoji}
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900 text-sm leading-tight">{car.name}</h3>
                          <p className="text-xs text-gray-400 mt-0.5">Plate #{car.plate}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <StatusBadge acc={car.acc} online={car.online} />
                        <span className={`text-[10px] font-medium ${car.online ? 'text-green-600' : 'text-gray-400'}`}>
                          {car.online ? '● GPS Online' : '○ GPS Offline'}
                        </span>
                      </div>
                    </div>

                    {/* Command buttons — only for WhatsGPS cars */}
                    {isWhatsGPS && (
                      <div className="flex gap-2 mt-3">
                        <CommandButton
                          icon={<LockOpen />}
                          color="text-green-600"
                          borderColor="border-green-300 hover:border-green-500"
                          onClick={() => sendCommand('unlock', car.carId)}
                          loading={!!actionLoading[`${car.carId}-unlock`]}
                          title="Unlock"
                        />
                        <CommandButton
                          icon={<EngineOn />}
                          color="text-green-600"
                          borderColor="border-green-300 hover:border-green-500"
                          onClick={() => sendCommand('unkill', car.carId)}
                          loading={!!actionLoading[`${car.carId}-unkill`]}
                          title="Enable Engine"
                        />
                        <CommandButton
                          icon={<LockClosed />}
                          color="text-amber-600"
                          borderColor="border-amber-300 hover:border-amber-500"
                          onClick={() => sendCommand('lock', car.carId)}
                          loading={!!actionLoading[`${car.carId}-lock`]}
                          title="Lock"
                        />
                        <CommandButton
                          icon={<EngineOff />}
                          color="text-red-500"
                          borderColor="border-red-300 hover:border-red-500"
                          onClick={() => sendCommand('kill', car.carId)}
                          loading={!!actionLoading[`${car.carId}-kill`]}
                          title="Kill Engine"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Map (desktop only in dashboard view) */}
          <div className="hidden lg:flex flex-1 relative">
            <Suspense fallback={<div className="flex items-center justify-center h-full w-full text-gray-400 animate-pulse">Loading map...</div>}>
              <FleetMap
                cars={filteredCars}
                rentedPlates={rentedPlates}
                onCommand={sendCommand}
                selectedCarId={null}
                onSelectCar={() => {}}
              />
            </Suspense>
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-20 lg:bottom-6 right-4 lg:right-6 z-[9999] px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all ${
          toast.type === 'success' ? 'bg-slate-800' : 'bg-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      <style jsx global>{`
        .safe-bottom { padding-bottom: env(safe-area-inset-bottom, 0px); }
      `}</style>
    </div>
  );
}
