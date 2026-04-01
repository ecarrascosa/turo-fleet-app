'use client';
import { useState, useEffect, useMemo } from 'react';

interface CarStatus {
  car: string;
  plate: string;
  lastService: number | null;
  currentOdo: number | null;
  nextService: number | null;
  remaining: number | null;
  status: 'overdue' | 'due-soon' | 'ok' | 'no-data';
  lastReading: string | null;
}

interface ServiceData {
  serviceInterval: number;
  summary: { total: number; overdue: number; dueSoon: number };
  cars: CarStatus[];
  storage: string;
}

const statusConfig = {
  overdue: { bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-500', label: '🔴 OVERDUE', text: 'text-red-700' },
  'due-soon': { bg: 'bg-yellow-50', border: 'border-yellow-200', badge: 'bg-yellow-500', label: '🟡 DUE SOON', text: 'text-yellow-700' },
  ok: { bg: 'bg-white', border: 'border-gray-200', badge: 'bg-green-500', label: '🟢 OK', text: 'text-green-700' },
  'no-data': { bg: 'bg-gray-50', border: 'border-gray-200', badge: 'bg-gray-400', label: '⚪ NO DATA', text: 'text-gray-500' },
};

export default function ServicePage() {
  const [data, setData] = useState<ServiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlate, setSelectedPlate] = useState('');
  const [mileage, setMileage] = useState('');
  const [readingType, setReadingType] = useState<'checkin' | 'checkout'>('checkin');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [filter, setFilter] = useState<'all' | 'overdue' | 'due-soon' | 'ok' | 'no-data'>('all');
  const [search, setSearch] = useState('');

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchData = async () => {
    try {
      const res = await fetch('/api/service');
      const d = await res.json();
      setData(d);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filteredCars = useMemo(() => {
    if (!data) return [];
    let cars = data.cars;
    if (filter !== 'all') cars = cars.filter(c => c.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      cars = cars.filter(c => c.car.toLowerCase().includes(q) || c.plate.toLowerCase().includes(q));
    }
    return cars;
  }, [data, filter, search]);

  const logOdometer = async () => {
    if (!selectedPlate || !mileage) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'log-odometer', plate: selectedPlate, mileage: Number(mileage), type: readingType }),
      });
      if (res.ok) {
        showToast('✅ Odometer logged');
        setMileage('');
        fetchData();
      } else {
        showToast('❌ Failed to log', 'error');
      }
    } catch {
      showToast('❌ Network error', 'error');
    }
    setSubmitting(false);
  };

  const markServiced = async (plate: string, currentOdo: number | null) => {
    const mi = currentOdo || Number(prompt('Enter current mileage:'));
    if (!mi) return;
    try {
      const res = await fetch('/api/service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-service', plate, mileage: mi }),
      });
      if (res.ok) {
        showToast('✅ Marked as serviced');
        fetchData();
      }
    } catch {
      showToast('❌ Failed', 'error');
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400 animate-pulse text-lg">Loading service data...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-slate-800 text-white h-12 flex items-center justify-between px-4 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <a href="/" className="text-slate-400 hover:text-white text-sm">← Fleet</a>
          <span className="font-bold">🔧 Service Tracker</span>
        </div>
        {data && (
          <div className="flex items-center gap-2 text-xs">
            {data.summary.overdue > 0 && (
              <span className="bg-red-500 text-white px-2 py-0.5 rounded-full font-bold">{data.summary.overdue} overdue</span>
            )}
            {data.summary.dueSoon > 0 && (
              <span className="bg-yellow-500 text-white px-2 py-0.5 rounded-full font-bold">{data.summary.dueSoon} soon</span>
            )}
          </div>
        )}
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-4 pb-24">
        {/* Storage banner */}
        {data?.storage === 'memory' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
            ⚠️ Using in-memory storage — data resets on deploy. Connect Vercel KV for persistence.
          </div>
        )}

        {/* Log Odometer Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h2 className="font-bold text-gray-900 mb-3">📝 Log Odometer Reading</h2>
          <div className="space-y-3">
            <select
              value={selectedPlate}
              onChange={e => setSelectedPlate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-blue-500"
            >
              <option value="">Select car...</option>
              {data?.cars.map(c => (
                <option key={c.plate} value={c.plate}>{c.car} ({c.plate})</option>
              ))}
            </select>

            <input
              type="number"
              placeholder="Mileage (e.g. 95000)"
              value={mileage}
              onChange={e => setMileage(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              inputMode="numeric"
            />

            <div className="flex gap-2">
              <button
                onClick={() => setReadingType('checkin')}
                className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  readingType === 'checkin' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-300 text-gray-500'
                }`}
              >📥 Check-in</button>
              <button
                onClick={() => setReadingType('checkout')}
                className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  readingType === 'checkout' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-300 text-gray-500'
                }`}
              >📤 Check-out</button>
            </div>

            <button
              onClick={logOdometer}
              disabled={!selectedPlate || !mileage || submitting}
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {submitting ? 'Saving...' : 'Log Reading'}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(['all', 'overdue', 'due-soon', 'ok', 'no-data'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                filter === f ? 'bg-slate-800 text-white' : 'bg-white border border-gray-300 text-gray-600'
              }`}
            >
              {f === 'all' ? `All (${data?.cars.length})` :
               f === 'overdue' ? `🔴 Overdue (${data?.cars.filter(c => c.status === 'overdue').length})` :
               f === 'due-soon' ? `🟡 Soon (${data?.cars.filter(c => c.status === 'due-soon').length})` :
               f === 'ok' ? `🟢 OK (${data?.cars.filter(c => c.status === 'ok').length})` :
               `⚪ No Data (${data?.cars.filter(c => c.status === 'no-data').length})`}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search cars..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500"
        />

        {/* Car Cards */}
        <div className="space-y-3">
          {filteredCars.map(car => {
            const sc = statusConfig[car.status];
            return (
              <div key={car.plate} className={`${sc.bg} rounded-xl border ${sc.border} shadow-sm p-4`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">{car.car}</h3>
                    <p className="text-xs text-gray-400">{car.plate}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${sc.badge}`}>
                    {car.status === 'overdue' ? 'OVERDUE' : car.status === 'due-soon' ? 'DUE SOON' : car.status === 'ok' ? 'OK' : 'NO DATA'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                  <div>
                    <div className="text-gray-400">Current</div>
                    <div className="font-medium text-gray-900">
                      {car.currentOdo != null ? `${car.currentOdo.toLocaleString()} mi` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400">Next Service</div>
                    <div className="font-medium text-gray-900">
                      {car.nextService != null ? `${car.nextService.toLocaleString()} mi` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400">Remaining</div>
                    <div className={`font-bold ${sc.text}`}>
                      {car.remaining != null ? (
                        car.remaining <= 0 ? `${Math.abs(car.remaining).toLocaleString()} over` : `${car.remaining.toLocaleString()} mi`
                      ) : '—'}
                    </div>
                  </div>
                </div>

                {car.lastReading && (
                  <div className="text-[10px] text-gray-400 mb-2">
                    Last reading: {new Date(car.lastReading).toLocaleDateString()}
                  </div>
                )}

                {(car.status === 'overdue' || car.status === 'due-soon') && (
                  <button
                    onClick={() => markServiced(car.plate, car.currentOdo)}
                    className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
                  >
                    ✅ Mark as Serviced
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-4 left-4 sm:left-auto sm:w-80 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${
          toast.type === 'success' ? 'bg-slate-800' : 'bg-red-600'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
