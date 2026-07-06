import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Summary stats
    const summaryResult = await sql`
      SELECT
        COALESCE(SUM(CASE WHEN status != 'cancelled' THEN earnings ELSE 0 END), 0) as total_revenue,
        COUNT(CASE WHEN status != 'cancelled' THEN 1 END) as total_trips,
        ROUND(AVG(CASE WHEN status != 'cancelled' THEN earnings END)::numeric, 2) as avg_earnings_per_trip,
        ROUND(AVG(CASE WHEN status != 'cancelled' THEN EXTRACT(EPOCH FROM (trip_end - trip_start)) / 86400 END)::numeric, 1) as avg_trip_days,
        COUNT(DISTINCT CASE WHEN status != 'cancelled' THEN guest_name END) as unique_guests,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_trips,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_trips,
        COUNT(CASE WHEN status = 'booked' THEN 1 END) as booked_trips,
        MIN(CASE WHEN status != 'cancelled' THEN trip_start END) as earliest_trip,
        MAX(CASE WHEN status != 'cancelled' THEN trip_end END) as latest_trip
      FROM reservations
    `;
    const s = summaryResult.rows[0];

    // Vehicle stats
    const vehicleResult = await sql`
      SELECT
        vehicle_year || ' ' || vehicle_model as vehicle,
        COUNT(*) as trips,
        ROUND(SUM(earnings)::numeric, 2) as total_revenue,
        ROUND(SUM(EXTRACT(EPOCH FROM (trip_end - trip_start)) / 86400)::numeric, 1) as total_days,
        ROUND(AVG(earnings)::numeric, 2) as avg_per_trip,
        CASE
          WHEN SUM(EXTRACT(EPOCH FROM (trip_end - trip_start)) / 86400) > 0
          THEN ROUND((SUM(earnings) / SUM(EXTRACT(EPOCH FROM (trip_end - trip_start)) / 86400))::numeric, 2)
          ELSE 0
        END as avg_per_day
      FROM reservations
      WHERE status != 'cancelled'
      GROUP BY vehicle_year, vehicle_model
      ORDER BY total_revenue DESC
    `;

    const totalDaysInRange = s.earliest_trip && s.latest_trip
      ? Math.max(1, (new Date(s.latest_trip).getTime() - new Date(s.earliest_trip).getTime()) / 86400000)
      : 1;

    const vehicleStats = vehicleResult.rows.map(v => ({
      vehicle: v.vehicle,
      trips: Number(v.trips),
      totalRevenue: Number(v.total_revenue),
      totalDays: Number(v.total_days),
      avgPerTrip: Number(v.avg_per_trip),
      avgPerDay: Number(v.avg_per_day),
      utilizationRate: Math.round((Number(v.total_days) / totalDaysInRange) * 1000) / 10,
    }));

    // Monthly stats
    const monthlyResult = await sql`
      SELECT
        TO_CHAR(trip_start, 'YYYY-MM') as month,
        ROUND(SUM(earnings)::numeric, 2) as revenue,
        COUNT(*) as trips,
        ROUND(AVG(earnings)::numeric, 2) as avg_per_trip
      FROM reservations
      WHERE status != 'cancelled'
      GROUP BY TO_CHAR(trip_start, 'YYYY-MM')
      ORDER BY month
    `;

    // Fill in missing months
    const monthlyMap = new Map(monthlyResult.rows.map(r => [r.month, r]));
    const monthlyStats: { month: string; revenue: number; trips: number; avgPerTrip: number }[] = [];
    if (s.earliest_trip) {
      const start = new Date(s.earliest_trip);
      const now = new Date();
      const cur = new Date(start.getFullYear(), start.getMonth(), 1);
      while (cur <= now) {
        const key = cur.toISOString().slice(0, 7);
        const row = monthlyMap.get(key);
        monthlyStats.push({
          month: key,
          revenue: row ? Number(row.revenue) : 0,
          trips: row ? Number(row.trips) : 0,
          avgPerTrip: row ? Number(row.avg_per_trip) : 0,
        });
        cur.setMonth(cur.getMonth() + 1);
      }
    }

    // Weekday stats
    const weekdayResult = await sql`
      SELECT
        EXTRACT(DOW FROM trip_start)::int as dow,
        ROUND(AVG(earnings)::numeric, 2) as avg_revenue,
        COUNT(*) as trips
      FROM reservations
      WHERE status != 'cancelled'
      GROUP BY EXTRACT(DOW FROM trip_start)
      ORDER BY dow
    `;
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weekdayStats = weekdayResult.rows.map(r => ({
      day: dayNames[r.dow],
      avgRevenue: Number(r.avg_revenue),
      trips: Number(r.trips),
    }));

    // Top guests
    const guestsResult = await sql`
      SELECT
        guest_name,
        COUNT(*) as trips,
        ROUND(SUM(earnings)::numeric, 2) as total_spent,
        ROUND(AVG(earnings)::numeric, 2) as avg_per_trip
      FROM reservations
      WHERE status != 'cancelled'
      GROUP BY guest_name
      ORDER BY total_spent DESC
      LIMIT 10
    `;

    const avgUtilization = vehicleStats.length > 0
      ? Math.round(vehicleStats.reduce((sum, v) => sum + v.utilizationRate, 0) / vehicleStats.length * 10) / 10
      : 0;

    return NextResponse.json({
      summary: {
        totalRevenue: Number(s.total_revenue),
        totalTrips: Number(s.total_trips),
        avgEarningsPerTrip: Number(s.avg_earnings_per_trip),
        avgTripDays: Number(s.avg_trip_days),
        uniqueGuests: Number(s.unique_guests),
        cancelledTrips: Number(s.cancelled_trips),
        activeTrips: Number(s.active_trips),
        bookedTrips: Number(s.booked_trips),
        avgUtilization,
      },
      vehicleStats,
      monthlyStats,
      weekdayStats,
      topGuests: guestsResult.rows.map(r => ({
        name: r.guest_name,
        trips: Number(r.trips),
        totalSpent: Number(r.total_spent),
        avgPerTrip: Number(r.avg_per_trip),
      })),
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}
