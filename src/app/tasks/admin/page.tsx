'use client';
import { useState } from 'react';
import Link from 'next/link';

export default function AdminTaskPage() {
  const [form, setForm] = useState({ title: '', description: '', vehicle: '', priority: 'normal', start_date: '', end_date: '' });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.start_date || !form.end_date) return;
    setSaving(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setToast('✅ Task created!');
        setForm({ title: '', description: '', vehicle: '', priority: 'normal', start_date: '', end_date: '' });
        setTimeout(() => setToast(null), 3000);
      } else {
        const data = await res.json();
        setToast(`❌ ${data.error}`);
        setTimeout(() => setToast(null), 3000);
      }
    } catch {
      setToast('❌ Failed');
      setTimeout(() => setToast(null), 3000);
    }
    setSaving(false);
  };

  const inputClass = 'w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-slate-900 text-white px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <Link href="/tasks/employee" className="text-lg font-bold">⚡ <span className="text-cyan-400">Fleet</span>Pro</Link>
          <Link href="/tasks/employee" className="text-xs text-gray-400 hover:text-white transition">← Back to Tasks</Link>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        <h1 className="text-xl font-bold text-gray-900 mb-6">Add Task</h1>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Title *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Oil change" className={inputClass} required />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Optional details..." rows={3} className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Vehicle</label>
            <input value={form.vehicle} onChange={e => set('vehicle', e.target.value)} placeholder="e.g. 2022 Camry" className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Priority</label>
            <select value={form.priority} onChange={e => set('priority', e.target.value)} className={inputClass}>
              <option value="urgent">🔴 Urgent</option>
              <option value="normal">🔵 Normal</option>
              <option value="low">⚪ Low</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Start Date *</label>
              <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} className={inputClass} required />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">End Date *</label>
              <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} className={inputClass} required />
            </div>
          </div>

          <button type="submit" disabled={saving} className="w-full py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-xl transition-colors disabled:opacity-50">
            {saving ? '⏳ Creating...' : 'Create Task'}
          </button>
        </form>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white bg-slate-800">
          {toast}
        </div>
      )}
    </div>
  );
}
