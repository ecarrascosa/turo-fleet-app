'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Line, ComposedChart, Cell,
} from 'recharts';

interface Summary {
  totalRevenue: number; totalTrips: number; avgEarningsPerTrip: number;
  avgTripDays: number; uniqueGuests: number; cancelledTrips: number;
  activeTrips: number; bookedTrips: number; avgUtilization: number;
}
interface VehicleStat {
  vehicle: string; trips: number; totalRevenue: number; totalDays: number;
  avgPerTrip: number; avgPerDay: number; utilizationRate: number;
}
interface MonthlyStat { month: string; revenue: number; trips: number; avgPerTrip: number; }
interface WeekdayStat { day: string; avgRevenue: number; trips: number; }
interface TopGuest { name: string; trips: number; totalSpent: number; avgPerTrip: number; }

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtD = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function KPICard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
      <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

type SortKey = 'vehicle' | 'trips' | 'totalRevenue' | 'avgPerTrip' | 'avgPerDay' | 'utilizationRate';

export default function AnalyticsPage() {
  const [data, setData] = useState<{
    summary: Summary; vehicleStats: VehicleStat[];
    monthlyStats: MonthlyStat[]; weekdayStats: WeekdayStat[]; topGuests: TopGuest[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('totalRevenue');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    fetch('/api/analytics').then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const sortedVehicles = useMemo(() => {
    if (!data) return [];
    return [...data.vehicleStats].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'string') return sortAsc ? (av as string).localeCompare(bv as string) : (bv as string).localeCompare(av as string);
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [data, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-cyan-400 text-lg animate-pulse">Loading analytics...</div>
    </div>
  );

  if (!data) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-red-400">Failed to load analytics data</div>
    </div>
  );

  const { summary: s, monthlyStats, weekdayStats, topGuests } = data;
  const top15 = data.vehicleStats.slice(0, 15);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-sm">
        <p className="text-slate-300 font-medium">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }}>
            {p.name}: {p.name.includes('Revenue') || p.name.includes('Avg') ? fmt(p.value) : p.value}
          </p>
        ))}
      </div>
    );
  };

  const SortHeader = ({ k, label }: { k: SortKey; label: string }) => (
    <th
      className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-cyan-400 transition-colors"
      onClick={() => handleSort(k)}
    >
      {label} {sortKey === k ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-slate-400 hover:text-white transition-colors">
              ← Dashboard
            </Link>
            <span className="text-slate-600">|</span>
            <h1 className="text-xl font-bold">📈 Revenue Analytics</h1>
          </div>
          <div className="text-sm text-slate-500">
            {s.activeTrips} active · {s.bookedTrips} booked · {s.cancelledTrips} cancelled
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KPICard label="Total Revenue" value={fmt(s.totalRevenue)} />
          <KPICard label="Total Trips" value={s.totalTrips.toLocaleString()} />
          <KPICard label="Avg Per Trip" value={fmtD(s.avgEarningsPerTrip)} />
          <KPICard label="Avg Trip Length" value={`${s.avgTripDays} days`} />
          <KPICard label="Unique Guests" value={s.uniqueGuests.toLocaleString()} />
          <KPICard label="Avg Utilization" value={`${s.avgUtilization}%`} />
        </div>

        {/* Monthly Revenue */}
        <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
          <h2 className="text-lg font-semibold mb-4">Monthly Revenue & Trips</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
                <YAxis yAxisId="revenue" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="trips" orientation="right" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar yAxisId="revenue" dataKey="revenue" name="Revenue" fill="#06b6d4" radius={[4, 4, 0, 0]} opacity={0.8} />
                <Line yAxisId="trips" dataKey="trips" name="Trips" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Revenue by Vehicle */}
          <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
            <h2 className="text-lg font-semibold mb-4">Revenue by Vehicle (Top 15)</h2>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top15} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="vehicle" tick={{ fill: '#94a3b8', fontSize: 10 }} width={140} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="totalRevenue" name="Revenue" radius={[0, 4, 4, 0]}>
                    {top15.map((_, i) => (
                      <Cell key={i} fill={i < 3 ? '#10b981' : i < 7 ? '#06b6d4' : '#64748b'} opacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Revenue by Day of Week */}
          <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
            <h2 className="text-lg font-semibold mb-4">Avg Revenue by Day of Week</h2>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekdayStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => v.slice(0, 3)} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="avgRevenue" name="Avg Revenue" fill="#f59e0b" radius={[4, 4, 0, 0]} opacity={0.8} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Top Guests */}
        <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
          <h2 className="text-lg font-semibold mb-4">Top 10 Guests by Spend</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase">#</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase">Guest</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-slate-400 uppercase">Trips</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-slate-400 uppercase">Total Spent</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-slate-400 uppercase">Avg/Trip</th>
                </tr>
              </thead>
              <tbody>
                {topGuests.map((g, i) => (
                  <tr key={g.name} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                    <td className="px-3 py-2.5 text-slate-500">{i + 1}</td>
                    <td className="px-3 py-2.5 font-medium">{g.name}</td>
                    <td className="px-3 py-2.5 text-right text-slate-300">{g.trips}</td>
                    <td className="px-3 py-2.5 text-right text-emerald-400 font-medium">{fmtD(g.totalSpent)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-300">{fmtD(g.avgPerTrip)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Vehicle Performance Table */}
        <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
          <h2 className="text-lg font-semibold mb-4">Vehicle Performance</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <SortHeader k="vehicle" label="Vehicle" />
                  <SortHeader k="trips" label="Trips" />
                  <SortHeader k="totalRevenue" label="Revenue" />
                  <SortHeader k="avgPerTrip" label="Avg/Trip" />
                  <SortHeader k="avgPerDay" label="Avg/Day" />
                  <SortHeader k="utilizationRate" label="Utilization" />
                </tr>
              </thead>
              <tbody>
                {sortedVehicles.map(v => (
                  <tr key={v.vehicle} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                    <td className="px-3 py-2.5 font-medium">{v.vehicle}</td>
                    <td className="px-3 py-2.5 text-slate-300">{v.trips}</td>
                    <td className="px-3 py-2.5 text-emerald-400 font-medium">{fmt(v.totalRevenue)}</td>
                    <td className="px-3 py-2.5 text-slate-300">{fmtD(v.avgPerTrip)}</td>
                    <td className="px-3 py-2.5 text-slate-300">{fmtD(v.avgPerDay)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-slate-700 rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full"
                            style={{
                              width: `${Math.min(v.utilizationRate, 100)}%`,
                              backgroundColor: v.utilizationRate > 60 ? '#10b981' : v.utilizationRate > 30 ? '#f59e0b' : '#ef4444',
                            }}
                          />
                        </div>
                        <span className="text-xs text-slate-400">{v.utilizationRate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
