'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getCarPhoto } from '@/lib/car-icons';

interface TripData {
  reservation: {
    guestName: string;
    vehicleModel: string;
    vehicleYear: string;
    tripStart: string;
    tripEnd: string;
    location?: string;
  };
  car: { lat: number; lon: number; name: string; plate: string; locked: boolean };
  tripStatus: 'upcoming' | 'active' | 'grace' | 'ended';
  timeLeft: string;
}

type ViewState = 'upcoming' | 'ongoing' | 'history';

function computeView(tripStart: string, tripEnd: string): ViewState {
  const now = Date.now();
  const start = new Date(tripStart).getTime();
  const graceEnd = new Date(tripEnd).getTime() + 30 * 60 * 1000;
  if (now < start) return 'upcoming';
  if (now <= graceEnd) return 'ongoing';
  return 'history';
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0m';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(' ');
}

export default function GuestTripPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<TripData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cmdLoading, setCmdLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [now, setNow] = useState(Date.now());

  const fetchTrip = useCallback(async () => {
    try {
      const res = await fetch(`/api/guest/${token}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Trip not found'); return; }
      setData(json);
      setError('');
    } catch { setError('Failed to load trip'); }
    setLoading(false);
  }, [token]);

  // Fetch data every 30s
  useEffect(() => { fetchTrip(); const i = setInterval(fetchTrip, 30000); return () => clearInterval(i); }, [fetchTrip]);

  // Tick every 30s for countdown + state transitions
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(i); }, []);

  const sendCmd = async (action: 'lock' | 'unlock') => {
    setCmdLoading(action);
    try {
      const res = await fetch(`/api/guest/${token}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setToast({ msg: action === 'unlock' ? '🔓 Car unlocked!' : '🔒 Car locked!', ok: true });
        setTimeout(fetchTrip, 3000);
      } else {
        setToast({ msg: `❌ ${json.error || 'Command failed'}`, ok: false });
      }
    } catch {
      setToast({ msg: '❌ Network error', ok: false });
    }
    setCmdLoading(null);
    setTimeout(() => setToast(null), 4000);
  };

  if (loading) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-gray-400 animate-pulse text-lg">Loading your trip...</div>
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="text-center">
        <div className="text-5xl mb-4">🚗</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Trip Not Found</h1>
        <p className="text-gray-500">{error || 'This link may be invalid or expired.'}</p>
      </div>
    </div>
  );

  const { reservation, car } = data;
  const view = computeView(reservation.tripStart, reservation.tripEnd);
  const photo = car.plate ? getCarPhoto(car.plate) : null;
  const hasLocation = car.lat !== 0 && car.lon !== 0;
  const mapsUrl = hasLocation ? `https://www.google.com/maps/dir/?api=1&destination=${car.lat},${car.lon}` : null;

  const startMs = new Date(reservation.tripStart).getTime();
  const endMs = new Date(reservation.tripEnd).getTime();
  const graceEndMs = endMs + 30 * 60 * 1000;
  const isGrace = now > endMs && now <= graceEndMs;

  // ─── HISTORY ───
  if (view === 'history') return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="bg-slate-800 text-white px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-lg">⚡ Your Trip</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-6xl mb-5">🎉</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Thanks for your trip!</h1>
        <p className="text-gray-500 mb-8">We hope you had a great experience.</p>
        <div className="w-full max-w-sm border border-gray-200 rounded-xl p-5 text-left space-y-3">
          <h3 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">Trip Summary</h3>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Vehicle</span>
            <span className="text-gray-900 font-medium">{car.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Start</span>
            <span className="text-gray-900">{new Date(reservation.tripStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">End</span>
            <span className="text-gray-900">{new Date(reservation.tripEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
          </div>
        </div>
      </div>
    </div>
  );

  // ─── UPCOMING ───
  if (view === 'upcoming') {
    const countdown = formatCountdown(startMs - now);
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <div className="bg-slate-800 text-white px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-lg">⚡ Your Trip</span>
          <span className="text-slate-400 text-sm">Guest Access</span>
        </div>

        {/* Countdown */}
        <div className="mx-4 mt-5 rounded-2xl bg-blue-50 border border-blue-200 p-6 text-center">
          <div className="text-blue-400 text-sm font-medium uppercase tracking-wide mb-1">Your trip starts in</div>
          <div className="text-4xl font-bold text-blue-800">{countdown}</div>
          <div className="text-blue-500 text-sm mt-2">{new Date(reservation.tripStart).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
        </div>

        {/* Car info */}
        <div className="mx-4 mt-5">
          {photo && <div className="rounded-xl overflow-hidden mb-3"><img src={photo} alt={car.name} className="w-full h-48 object-cover" /></div>}
          <h2 className="text-2xl font-bold text-gray-900">{car.name}</h2>
          {car.plate && <p className="text-gray-500 text-sm mt-0.5">Plate: {car.plate}</p>}
        </div>

        {/* Navigate */}
        {hasLocation && (
          <div className="mx-4 mt-4">
            <a href={mapsUrl!} target="_blank" rel="noopener noreferrer"
              className="block w-full text-center bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3.5 rounded-xl transition-colors text-base">
              📍 Navigate to Car
            </a>
          </div>
        )}

        {/* No controls message */}
        <div className="mx-4 mt-4 text-center text-gray-400 text-sm py-4 border border-gray-200 rounded-xl">
          Lock &amp; unlock controls will be available when your trip starts
        </div>

        {/* Contact */}
        <div className="mx-4 mt-4 mb-8">
          <a href="tel:+13234632867" className="block w-full text-center border border-gray-300 hover:bg-gray-50 active:bg-gray-100 text-gray-700 font-medium py-3.5 rounded-xl transition-colors">
            📞 Contact Host
          </a>
        </div>
      </div>
    );
  }

  // ─── ONGOING (active + grace) ───
  const timeRemaining = isGrace
    ? formatCountdown(graceEndMs - now) + ' grace remaining'
    : formatCountdown(endMs - now) + ' remaining';

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="bg-slate-800 text-white px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-lg">⚡ Your Trip</span>
        <span className="text-slate-400 text-sm">Guest Access</span>
      </div>

      {/* Status */}
      <div className={`mx-4 mt-4 rounded-xl border p-4 ${isGrace ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
        <div className={`font-semibold text-lg ${isGrace ? 'text-yellow-800' : 'text-green-800'}`}>
          {isGrace ? '⚠️ Grace Period' : '✅ Trip Active'}
        </div>
        <div className={`text-sm mt-1 opacity-80 ${isGrace ? 'text-yellow-700' : 'text-green-700'}`}>{timeRemaining}</div>
        <div className="text-xs text-gray-500 mt-1">
          Ends {new Date(reservation.tripEnd).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </div>
      </div>

      {/* Car info */}
      <div className="mx-4 mt-4">
        {photo && <div className="rounded-xl overflow-hidden mb-3"><img src={photo} alt={car.name} className="w-full h-48 object-cover" /></div>}
        <h2 className="text-2xl font-bold text-gray-900">{car.name}</h2>
        {car.plate && <p className="text-gray-500 text-sm mt-0.5">Plate: {car.plate}</p>}
        <div className="mt-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${car.locked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {car.locked ? '🔒 Locked' : '🔓 Unlocked'}
          </span>
        </div>
      </div>

      {/* Lock / Unlock */}
      <div className="mx-4 mt-5 space-y-3">
        {!isGrace && (
          <button onClick={() => sendCmd('unlock')} disabled={!!cmdLoading}
            className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-50 text-white font-semibold py-4 rounded-xl transition-colors text-lg">
            {cmdLoading === 'unlock' ? 'Unlocking...' : '🔓 Unlock Car'}
          </button>
        )}
        <button onClick={() => sendCmd('lock')} disabled={!!cmdLoading}
          className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-50 text-white font-semibold py-4 rounded-xl transition-colors text-lg">
          {cmdLoading === 'lock' ? 'Locking...' : '🔒 Lock Car'}
        </button>
      </div>

      {/* Navigate */}
      {hasLocation && (
        <div className="mx-4 mt-4">
          <a href={mapsUrl!} target="_blank" rel="noopener noreferrer"
            className="block w-full text-center bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3.5 rounded-xl transition-colors text-base">
            📍 Navigate to Car
          </a>
        </div>
      )}

      {/* Contact */}
      <div className="mx-4 mt-4 mb-8">
        <a href="tel:+13234632867" className="block w-full text-center border border-gray-300 hover:bg-gray-50 active:bg-gray-100 text-gray-700 font-medium py-3.5 rounded-xl transition-colors">
          📞 Contact Host
        </a>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white text-center ${toast.ok ? 'bg-slate-800' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
