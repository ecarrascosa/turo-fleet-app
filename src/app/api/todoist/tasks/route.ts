import { NextResponse } from 'next/server';
import { getFleet, Car } from '@/lib/whatsgps';

export const dynamic = 'force-dynamic';

const TODOIST_TOKEN = process.env.TODOIST_API_TOKEN!;
const PROJECT_ID = '6hfWmHvCwCHwQvH2';
const API_BASE = 'https://api.todoist.com/api/v1';

interface TodoistTask {
  id: string;
  content: string;
  is_completed: boolean;
  due?: { date: string; datetime?: string };
}

// Known action keywords — first match wins
const ACTION_KEYWORDS = [
  'Re-park', 'Repark', 'Oil change', 'Oil Change',
  'Clean', 'Wash', 'Re-charge', 'Recharge', 'Charge',
  'Inspect', 'Tire', 'Pickup', 'Pick up', 'Drop off', 'Dropoff',
  'Detail', 'Gas', 'Fuel', 'Fix', 'Repair', 'Return', 'Move',
  'Check', 'Service', 'Maintenance',
];

function extractAction(content: string): string {
  const lower = content.toLowerCase();
  for (const kw of ACTION_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return kw.replace(/^(Re)p/, '$1-p').replace(/^(Re)c/, '$1-c');
  }
  return 'Other';
}

// Normalise action labels
function normalizeAction(a: string): string {
  const l = a.toLowerCase();
  if (l === 'repark') return 'Re-park';
  if (l === 'recharge') return 'Re-charge';
  if (l === 'oil change') return 'Oil change';
  if (l === 'pick up') return 'Pickup';
  if (l === 'drop off' || l === 'dropoff') return 'Drop off';
  // Capitalise first letter
  return a.charAt(0).toUpperCase() + a.slice(1);
}

function matchVehicle(content: string, fleet: Car[]): Car | null {
  const words = content.toLowerCase().split(/[\s,.\-—/]+/).filter(Boolean);
  let bestCar: Car | null = null;
  let bestScore = 0;

  for (const car of fleet) {
    const nameWords = car.name.toLowerCase().split(/[\s,.\-—/]+/).filter(Boolean);
    let score = 0;
    for (const w of words) {
      if (w.length < 3) continue;
      for (const nw of nameWords) {
        if (nw.includes(w) || w.includes(nw)) { score++; break; }
      }
    }
    if (score > bestScore) { bestScore = score; bestCar = car; }
  }
  return bestScore >= 1 ? bestCar : null;
}

export async function GET() {
  try {
    // Fetch tasks from Todoist
    const res = await fetch(`${API_BASE}/tasks?project_id=${PROJECT_ID}`, {
      headers: { Authorization: `Bearer ${TODOIST_TOKEN}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      const txt = await res.text();
      return NextResponse.json({ error: `Todoist API error: ${res.status} ${txt}` }, { status: 500 });
    }
    const todoistTasks: TodoistTask[] = await res.json();

    // Fetch fleet for GPS matching
    let fleet: Car[] = [];
    try { fleet = await getFleet(); } catch (e) { console.error('Fleet fetch failed, continuing without GPS:', e); }

    // Group by action
    const groupMap: Record<string, any[]> = {};

    for (const t of todoistTasks) {
      const action = normalizeAction(extractAction(t.content));
      const car = matchVehicle(t.content, fleet);

      const task: any = {
        id: t.id,
        content: t.content,
        due: t.due?.date || t.due?.datetime || null,
        vehicle: car?.name || null,
        done: t.is_completed,
      };
      if (car && car.lat && car.lon) {
        task.lat = car.lat;
        task.lon = car.lon;
      }

      if (!groupMap[action]) groupMap[action] = [];
      groupMap[action].push(task);
    }

    const groups = Object.entries(groupMap)
      .map(([action, tasks]) => ({ action, tasks }))
      .sort((a, b) => b.tasks.length - a.tasks.length);

    return NextResponse.json({ groups });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
