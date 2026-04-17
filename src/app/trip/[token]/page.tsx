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

export default function GuestTripPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<TripData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cmdLoading, setCmdLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

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

  useEffect(() => { fetchTrip(); const i = setInterval(fetchTrip, 30000); return () => clearInterval(i); }, [fetchTrip]);

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

  const { reservation, car, tripStatus, timeLeft } = data;
  const photo = car.plate ? getCarPhoto(car.plate) : null;
  const hasLocation = car.lat !== 0 && car.lon !== 0;
  const mapsUrl = hasLocation ? `https://www.google.com/maps/dir/?api=1&destination=${car.lat},${car.lon}` : null;

  const statusConfig = {
    upcoming: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200', label: '⏳ Upcoming Trip' },
    active: { bg: 'bg-green-50', text: 'text-green-800', border: 'border-green-200', label: '✅ Trip Active' },
    grace: { bg: 'bg-yellow-50', text: 'text-yellow-800', border: 'border-yellow-200', label: '⚠️ Grace Period' },
    ended: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', label: '🏁 Trip Ended' },
  }[tripStatus];

  const showUnlock = tripStatus === 'active';
  const showLock = tripStatus === 'active' || tripStatus === 'grace';

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-slate-800 text-white px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-lg">⚡ Your Trip</span>
        <span className="text-slate-400 text-sm">Guest Access</span>
      </div>

      {/* Status Banner */}
      <div className={`mx-4 mt-4 rounded-xl border ${statusConfig.bg} ${statusConfig.border} p-4`}>
        <div className={`font-semibold text-lg ${statusConfig.text}`}>{statusConfig.label}</div>
        <div className={`text-sm mt-1 ${statusConfig.text} opacity-80`}>{timeLeft}</div>
      </div>

      {/* Car Info */}
      <div className="mx-4 mt-4">
        {photo && (
          <div className="rounded-xl overflow-hidden mb-3">
            <img src={photo} alt={car.name} className="w-full h-48 object-cover" />
          </div>
        )}
        <h2 className="text-2xl font-bold text-gray-900">{car.name}</h2>
        {car.plate && <p className="text-gray-500 text-sm mt-0.5">Plate: {car.plate}</p>}
        <div className="flex items-center gap-2 mt-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${car.locked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {car.locked ? '🔒 Locked' : '🔓 Unlocked'}
          </span>
        </div>
      </div>

      {/* Navigate Button */}
      {hasLocation && (
        <div className="mx-4 mt-4">
          <a
            href={mapsUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3.5 rounded-xl transition-colors text-base"
          >
            📍 Navigate to Car
          </a>
        </div>
      )}

      {/* Lock/Unlock Buttons */}
      <div className="mx-4 mt-4 space-y-3">
        {(showUnlock || showLock) ? (
          <>
            {showUnlock && (
              <button
                onClick={() => sendCmd('unlock')}
                disabled={!!cmdLoading}
                className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:opacity-50 text-white font-semibold py-4 rounded-xl transition-colors text-lg"
              >
                {cmdLoading === 'unlock' ? 'Unlocking...' : '🔓 Unlock Car'}
              </button>
            )}
            {showLock && (
              <button
                onClick={() => sendCmd('lock')}
                disabled={!!cmdLoading}
                className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 disabled:opacity-50 text-white font-semibold py-4 rounded-xl transition-colors text-lg"
              >
                {cmdLoading === 'lock' ? 'Locking...' : '🔒 Lock Car'}
              </button>
            )}
          </>
        ) : (
          <div className="text-center text-gray-400 text-sm py-4 border border-gray-200 rounded-xl">
            {tripStatus === 'upcoming' ? 'Controls will be available when your trip starts' : 'Trip has ended — controls are no longer available'}
          </div>
        )}
      </div>

      {/* Trip Details */}
      <div className="mx-4 mt-6 border border-gray-200 rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-gray-900">Trip Details</h3>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Guest</span>
          <span className="text-gray-900">{reservation.guestName}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Start</span>
          <span className="text-gray-900">{new Date(reservation.tripStart).toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">End</span>
          <span className="text-gray-900">{new Date(reservation.tripEnd).toLocaleString()}</span>
        </div>
        {reservation.location && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Pickup</span>
            <span className="text-gray-900 text-right max-w-[60%]">{reservation.location}</span>
          </div>
        )}
      </div>

      {/* Contact Host */}
      <div className="mx-4 mt-4 mb-8">
        <a
          href="tel:+13234632867"
          className="block w-full text-center border border-gray-300 hover:bg-gray-50 active:bg-gray-100 text-gray-700 font-medium py-3.5 rounded-xl transition-colors"
        >
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
