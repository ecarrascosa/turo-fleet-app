'use client';
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getCarIcon, getCarPhoto } from '@/lib/car-icons';

interface Car {
  carId: string; name: string; plate: string;
  online: boolean; moving: boolean; speed: number;
  lat: number; lon: number;
  locked: boolean; engineCut: boolean;
}

interface RentedPlates {
  [plate: string]: boolean;
}

export default function FleetMap({ cars, rentedPlates, onCommand, selectedCarId, onSelectCar }: {
  cars: Car[];
  rentedPlates: RentedPlates;
  onCommand?: (action: string, carId: string) => void;
  selectedCarId?: string | null;
  onSelectCar?: (carId: string) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const onCommandRef = useRef(onCommand);
  const onSelectRef = useRef(onSelectCar);
  onCommandRef.current = onCommand;
  onSelectRef.current = onSelectCar;

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    mapInstance.current = L.map(mapRef.current, {
      center: [37.77, -122.42],
      zoom: 12,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapInstance.current);

    markersRef.current = L.layerGroup().addTo(mapInstance.current);

    return () => {
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapInstance.current || !markersRef.current) return;
    markersRef.current.clearLayers();

    const validCars = cars.filter(c => c.lat !== 0 && c.lon !== 0);

    for (const car of validCars) {
      const rented = rentedPlates[car.plate];
      const isSelected = selectedCarId === car.carId;
      const statusColor = !car.online ? '#ef4444' : car.moving ? '#f97316' : rented ? '#3b82f6' : '#22c55e';
      const statusText = !car.online ? 'Offline' : car.moving ? `Moving ${car.speed}mph` : 'Parked';
      const lockText = car.locked ? '🔒 Locked' : '🔓 Unlocked';
      const engineText = car.engineCut ? '⛔ Cut' : '✅ Active';
      const carIcon = getCarIcon(car.name);
      const photo = getCarPhoto(car.plate);

      const size = isSelected ? 48 : 36;
      const markerHtml = photo
        ? `<div style="
            width: ${size}px; height: ${size}px; border-radius: 50%;
            border: 3px solid ${isSelected ? '#3b82f6' : statusColor};
            box-shadow: 0 2px 8px rgba(0,0,0,${isSelected ? '0.4' : '0.2'});
            overflow: hidden; transition: all 0.2s;
          "><img src="${photo}" style="width:100%;height:100%;object-fit:cover;" /></div>`
        : `<div style="
            width: ${size}px; height: ${size}px; border-radius: 50%;
            background: ${carIcon.color}30; border: 3px solid ${isSelected ? '#3b82f6' : statusColor};
            box-shadow: 0 2px 8px rgba(0,0,0,${isSelected ? '0.4' : '0.2'});
            display: flex; align-items: center; justify-content: center;
            font-size: ${isSelected ? 20 : 16}px; line-height: 1; transition: all 0.2s;
          ">${carIcon.emoji}</div>`;

      const icon = L.divIcon({
        className: '',
        html: markerHtml,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker([car.lat, car.lon], { icon }).addTo(markersRef.current!);

      const popupContent = document.createElement('div');
      popupContent.innerHTML = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; min-width: 190px;">
          <div style="font-weight: 700; font-size: 15px; margin-bottom: 2px; color: #111;">${car.name}</div>
          <div style="color: #888; margin-bottom: 8px;">${car.plate}</div>
          <div style="display: grid; gap: 3px; margin-bottom: 10px; color: #555;">
            <span>${statusText}</span>
            <span>${lockText} · ${engineText}</span>
            ${rented ? '<span style="color: #3b82f6; font-weight: 600;">🚗 Rented</span>' : ''}
          </div>
          <div style="display: flex; gap: 6px;">
            <button data-action="lock-kill" style="
              flex: 1; padding: 7px 8px; border: none; border-radius: 8px;
              background: #dc2626; color: white; font-size: 12px; font-weight: 600;
              cursor: pointer;
            ">🔒 Lock + Kill</button>
            <button data-action="unlock-restore" style="
              flex: 1; padding: 7px 8px; border: none; border-radius: 8px;
              background: #16a34a; color: white; font-size: 12px; font-weight: 600;
              cursor: pointer;
            ">🔓 Unlock + Start</button>
          </div>
        </div>
      `;

      popupContent.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const action = (e.currentTarget as HTMLElement).dataset.action!;
          onCommandRef.current?.(action, car.carId);
        });
      });

      marker.bindPopup(popupContent, { closeButton: false, minWidth: 210 });

      marker.on('click', () => {
        onSelectRef.current?.(car.carId);
      });
    }

    if (validCars.length > 0 && !selectedCarId) {
      const bounds = L.latLngBounds(validCars.map(c => [c.lat, c.lon]));
      mapInstance.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 16, minZoom: 12 });
    }
  }, [cars, rentedPlates, selectedCarId]);

  // Pan to selected car
  useEffect(() => {
    if (!mapInstance.current || !selectedCarId) return;
    const car = cars.find(c => c.carId === selectedCarId);
    if (car && car.lat !== 0) {
      mapInstance.current.setView([car.lat, car.lon], 15, { animate: true });
    }
  }, [selectedCarId, cars]);

  return <div ref={mapRef} className="w-full h-full" />;
}
