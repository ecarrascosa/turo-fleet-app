// Maps car name to an emoji/icon based on brand, model, and color
// Also provides photo URLs by license plate

interface CarIcon {
  emoji: string;
  color: string;
  label: string;
}

// Plates that have custom photo icons (filename without extension)
const ICON_PLATES: Record<string, string> = {
  '6WEK555': '6WEK555.webp',
  '7BXV391': '7BXV391.webp',
  '7EHU865': '7EHU865.webp',
  '7JAF140': '7JAF140.webp',
  '7NRH469': '7NRH469.webp',
  '7RBK253': '7RBK253.webp',
  '7RXF934': '7RXF934.webp',
  '7STE017': '7STE017.png',
  '8EVL825': '8EVL825.webp',
  '8FMU623': '8FMU623.webp',
  '8GOF095': '8GOF095.webp',
  '8HJR881': '8HJR881.webp',
  '8JVX476': '8JVX476.webp',
  '8NNH938': '8NNH938.webp',
  '8UXU000': '8UXU000.webp',
  '8VLS461': '8VLS461.webp',
  '9BBD813': '9BBD813.webp',
  '9BPX540': '9BPX540.webp',
  '9DCW334': '9DCW334.webp',
  '9EKF941': '9EKF941.webp',
  '9FVF046': '9FVF046.webp',
  '9LJD332': '9LJD332.webp',
  '9RPA138': '9RPA138.webp',
  '9UOC437': '9UOC437.webp',
  '9WUA725': '9WUA725.webp',
  '9XBP640': '9XBP640.webp',
};

/** Returns the photo URL for a plate, or null if no icon exists */
export function getCarPhoto(plate: string): string | null {
  const file = ICON_PLATES[plate.toUpperCase()];
  return file ? `/car-icons/${file}` : null;
}

const COLOR_MAP: Record<string, string> = {
  rojo: '#dc2626', roja: '#dc2626',
  azul: '#2563eb',
  blanco: '#e5e7eb', blanca: '#e5e7eb',
  negro: '#374151', negra: '#374151',
  gris: '#6b7280',
  plateado: '#94a3b8',
  brown: '#92400e',
  red: '#dc2626',
  blue: '#2563eb',
  white: '#e5e7eb',
  black: '#374151',
  gray: '#6b7280', grey: '#6b7280',
  silver: '#94a3b8',
};

const BRAND_EMOJI: Record<string, string> = {
  toyota: '🚗', corolla: '🚗', camry: '🚗', yaris: '🚗', rav4: '🚙',
  jeep: '🚙', cherokee: '🚙',
  bmw: '🏎️', audi: '🏎️', a4: '🏎️', x3: '🏎️', x5: '🏎️',
  volkswagen: '🚗', vw: '🚗', jetta: '🚗', tiguan: '🚙',
  hyundai: '🚗', elantra: '🚗', veloster: '🚗', volester: '🚗',
  kia: '🚗', forte: '🚗', sportage: '🚙',
  mazda: '🚗', chevrolet: '🚗', chevy: '🚗', cruze: '🚗',
};

const BRAND_LABEL: Record<string, string> = {
  corolla: 'Toyota', camry: 'Toyota', yaris: 'Toyota', rav4: 'Toyota',
  cherokee: 'Jeep', jeep: 'Jeep',
  jetta: 'VW', tiguan: 'VW',
  elantra: 'Hyundai', veloster: 'Hyundai', volester: 'Hyundai',
  forte: 'Kia', sportage: 'Kia',
  a4: 'Audi', x3: 'BMW', x5: 'BMW', bmw: 'BMW',
  mazda: 'Mazda', cruze: 'Chevy',
};

export function getCarIcon(name: string): CarIcon {
  const lower = name.toLowerCase();
  const words = lower.split(/\s+/);

  let color = '#6b7280';
  for (const word of words) {
    if (COLOR_MAP[word]) { color = COLOR_MAP[word]; break; }
  }

  let emoji = '🚗';
  let label = '';
  for (const word of words) {
    if (BRAND_EMOJI[word]) emoji = BRAND_EMOJI[word];
    if (BRAND_LABEL[word] && !label) label = BRAND_LABEL[word];
  }

  if (lower.includes('cross')) emoji = '🚙';
  if (lower.includes('rav4')) emoji = '🚙';

  return { emoji, color, label };
}
