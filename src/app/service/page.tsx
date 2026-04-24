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
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [filter, setFilter] = useState<'all' | 'overdue' | 'due-soon' | 'ok' | 'no-data'>('all');
  const [search, setSearch] = useState('');
  const [csvPreview, setCsvPreview] = useState<Record<string, number> | null>(null);

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

  const handleCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      const lines = text.split('\n');
      const header = lines[0]?.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      if (!header) return;
      const vehicleIdx = header.findIndex(h => h.toLowerCase().includes('vehicle'));
      const checkinIdx = header.findIndex(h => h.toLowerCase().includes('check-in odometer'));
      if (vehicleIdx === -1 || checkinIdx === -1) {
        showToast('❌ CSV must have "Vehicle" and "Check-in odometer" columns', 'error');
        return;
      }
      const plateMap: Record<string, number> = {};
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        // Handle CSV with quoted fields
        const cols: string[] = [];
        let current = '';
        let inQuotes = false;
        for (const ch of line) {
          if (ch === '"') { inQuotes = !inQuotes; continue; }
          if (ch === ',' && !inQuotes) { cols.push(current.trim()); current = ''; continue; }
          current += ch;
        }
        cols.push(current.trim());
        const vehicle = cols[vehicleIdx] || '';
        const plateMatch = vehicle.match(/#([A-Z0-9]+)\)/);
        if (!plateMatch) continue;
        const plate = plateMatch[1];
        const odo = parseFloat(cols[checkinIdx]);
        if (!odo || odo <= 0 || isNaN(odo)) continue;
        if (!plateMap[plate] || odo > plateMap[plate]) {
          plateMap[plate] = Math.round(odo);
        }
      }
      if (Object.keys(plateMap).length === 0) {
        showToast('❌ No valid odometer data found in CSV', 'error');
        return;
      }
      setCsvPreview(plateMap);
    };
    reader.readAsText(file);
  };

  const submitCsvData = async () => {
    if (!csvPreview) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk-odometer', data: csvPreview }),
      });
      if (res.ok) {
        const result = await res.json();
        showToast(`✅ Updated ${result.count} odometer readings`);
        setCsvPreview(null);
        fetchData();
      } else {
        showToast('❌ Failed to upload', 'error');
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

        {/* Upload Turo CSV Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h2 className="font-bold text-gray-900 mb-3">📤 Upload Turo CSV</h2>
          {!csvPreview ? (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">Upload a Turo trip CSV to bulk-update odometer readings. The highest check-in odometer per vehicle will be used.</p>
              <input
                type="file"
                accept=".csv"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); }}
                className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 font-medium">Preview — {Object.keys(csvPreview).length} vehicles found:</p>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-100">
                {Object.entries(csvPreview).sort(([a],[b]) => a.localeCompare(b)).map(([plate, mi]) => {
                  const car = data?.cars.find(c => c.plate === plate);
                  return (
                    <div key={plate} className="flex justify-between px-3 py-1.5 text-xs border-b border-gray-50 last:border-0">
                      <span className={car ? 'text-gray-900' : 'text-orange-600'}>
                        {car ? `${car.car}` : plate} <span className="text-gray-400">({plate})</span>
                        {!car && <span className="ml-1 text-[10px]">⚠️ not in fleet</span>}
                      </span>
                      <span className="font-mono font-medium text-gray-700">{mi.toLocaleString()} mi</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCsvPreview(null)}
                  className="flex-1 py-2.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                >Cancel</button>
                <button
                  onClick={submitCsvData}
                  disabled={submitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
                >{submitting ? 'Uploading...' : `Upload ${Object.keys(csvPreview).length} Readings`}</button>
              </div>
            </div>
          )}
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
