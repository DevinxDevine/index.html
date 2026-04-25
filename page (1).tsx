// src/app/(admin)/reports/page.tsx
import { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/pricing";
import { RevenueChart } from "@/components/admin/RevenueChart";

export const metadata: Metadata = { title: "Reports — Sparkle Admin" };
export const dynamic = "force-dynamic";

async function getReportData() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(now.getDate() - 90);

  const [
    revenueByDay,
    revenueByTier,
    topCustomers,
    cleanerUtilization,
    bookingsByStatus,
    recurringVsOneTime,
  ] = await Promise.all([
    // Daily revenue for chart
    prisma.$queryRaw<{ day: string; revenue: number; bookings: number }[]>`
      SELECT
        TO_CHAR(scheduled_date, 'YYYY-MM-DD') as day,
        COALESCE(SUM(total_amount), 0)::float AS revenue,
        COUNT(*)::int AS bookings
      FROM bookings
      WHERE status = 'PAID'
        AND scheduled_date >= ${thirtyDaysAgo}
      GROUP BY day ORDER BY day ASC
    `,
    // Revenue by service tier
    prisma.booking.groupBy({
      by: ["serviceTierId"],
      where: { status: "PAID", scheduledDate: { gte: thirtyDaysAgo } },
      _sum: { totalAmount: true },
      _count: true,
    }),
    // Top customers by LTV
    prisma.user.findMany({
      where: { role: "CUSTOMER" },
      orderBy: { bookingsAsCustomer: { _count: "desc" } },
      take: 5,
      include: {
        _count: { select: { bookingsAsCustomer: true } },
        bookingsAsCustomer: {
          where: { status: "PAID" },
          select: { totalAmount: true },
        },
      },
    }),
    // Cleaner utilization (jobs per cleaner last 30 days)
    prisma.booking.groupBy({
      by: ["assignedCleanerId"],
      where: {
        status: { in: ["COMPLETED", "PAID"] },
        scheduledDate: { gte: thirtyDaysAgo },
        assignedCleanerId: { not: null },
      },
      _count: true,
      _sum: { totalAmount: true },
      _avg: { rating: true },
    }),
    // Pipeline health
    prisma.booking.groupBy({
      by: ["status"],
      _count: true,
    }),
    // Recurring vs one-time
    prisma.booking.groupBy({
      by: ["frequency"],
      where: { scheduledDate: { gte: thirtyDaysAgo } },
      _count: true,
      _sum: { totalAmount: true },
    }),
  ]);

  // Enrich tier revenue with names
  const tierIds = revenueByTier.map((r) => r.serviceTierId);
  const tiers = await prisma.serviceTier.findMany({
    where: { id: { in: tierIds } },
    select: { id: true, name: true },
  });
  const tierMap = Object.fromEntries(tiers.map((t) => [t.id, t.name]));

  // Enrich cleaner utilization with names
  const cleanerIds = cleanerUtilization
    .map((c) => c.assignedCleanerId)
    .filter(Boolean) as string[];
  const cleaners = await prisma.user.findMany({
    where: { id: { in: cleanerIds } },
    select: { id: true, firstName: true, lastName: true },
  });
  const cleanerMap = Object.fromEntries(
    cleaners.map((c) => [c.id, `${c.firstName} ${c.lastName}`])
  );

  return {
    revenueByDay,
    revenueByTier: revenueByTier.map((r) => ({
      tierName: tierMap[r.serviceTierId] ?? "Unknown",
      revenue: Number(r._sum.totalAmount ?? 0),
      count: r._count,
    })),
    topCustomers: topCustomers.map((c) => ({
      name: `${c.firstName} ${c.lastName}`,
      bookings: c._count.bookingsAsCustomer,
      ltv: c.bookingsAsCustomer.reduce((s, b) => s + Number(b.totalAmount), 0),
    })),
    cleanerUtilization: cleanerUtilization.map((c) => ({
      cleanerName: cleanerMap[c.assignedCleanerId!] ?? "Unknown",
      jobs: c._count,
      revenue: Number(c._sum.totalAmount ?? 0),
      avgRating: c._avg.rating ? Number(c._avg.rating.toFixed(1)) : null,
    })),
    bookingsByStatus,
    recurringVsOneTime: recurringVsOneTime.map((r) => ({
      frequency: r.frequency,
      count: r._count,
      revenue: Number(r._sum.totalAmount ?? 0),
    })),
  };
}

export default async function ReportsPage() {
  const data = await getReportData();

  const totalRevenue30d = data.revenueByDay.reduce((s, d) => s + d.revenue, 0);
  const totalBookings30d = data.revenueByDay.reduce((s, d) => s + d.bookings, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Revenue (30d)", value: formatCurrency(totalRevenue30d) },
          { label: "Paid bookings (30d)", value: totalBookings30d.toString() },
          {
            label: "Avg booking value",
            value: totalBookings30d > 0
              ? formatCurrency(totalRevenue30d / totalBookings30d)
              : "—",
          },
          {
            label: "Active pipeline",
            value: data.bookingsByStatus
              .filter((b) => !["PAID", "CANCELLED", "DISPUTED"].includes(b.status))
              .reduce((s, b) => s + b._count, 0)
              .toString(),
          },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="text-xs text-gray-400">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {/* Revenue chart */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Revenue — last 30 days</h2>
        <RevenueChart data={data.revenueByDay} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Revenue by tier */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Revenue by service tier (30d)</h2>
          <div className="space-y-3">
            {data.revenueByTier
              .sort((a, b) => b.revenue - a.revenue)
              .map((tier) => (
                <div key={tier.tierName} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{tier.tierName}</span>
                  <div className="text-right">
                    <p className="font-semibold text-gray-800 tabular-nums">
                      {formatCurrency(tier.revenue)}
                    </p>
                    <p className="text-xs text-gray-400">{tier.count} bookings</p>
                  </div>
                </div>
              ))}
            {data.revenueByTier.length === 0 && (
              <p className="text-xs text-gray-400">No paid bookings in this period</p>
            )}
          </div>
        </div>

        {/* Cleaner utilization */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Cleaner performance (30d)</h2>
          <div className="space-y-3">
            {data.cleanerUtilization
              .sort((a, b) => b.jobs - a.jobs)
              .map((c) => (
                <div key={c.cleanerName} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{c.cleanerName}</span>
                  <div className="flex items-center gap-4">
                    {c.avgRating && (
                      <span className="flex items-center gap-0.5 text-xs text-amber-500">
                        {c.avgRating} ★
                      </span>
                    )}
                    <div className="text-right">
                      <p className="font-semibold text-gray-800 tabular-nums">
                        {formatCurrency(c.revenue)}
                      </p>
                      <p className="text-xs text-gray-400">{c.jobs} jobs</p>
                    </div>
                  </div>
                </div>
              ))}
            {data.cleanerUtilization.length === 0 && (
              <p className="text-xs text-gray-400">No completed jobs in this period</p>
            )}
          </div>
        </div>

        {/* Top customers */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Top customers by LTV</h2>
          <div className="space-y-3">
            {data.topCustomers.map((c, i) => (
              <div key={c.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-300 tabular-nums w-4">
                    {i + 1}.
                  </span>
                  <span className="text-gray-700">{c.name}</span>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-teal-600 tabular-nums">
                    {formatCurrency(c.ltv)}
                  </p>
                  <p className="text-xs text-gray-400">{c.bookings} bookings</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Frequency breakdown */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Recurring vs one-time (30d)</h2>
          <div className="space-y-3">
            {data.recurringVsOneTime
              .sort((a, b) => b.revenue - a.revenue)
              .map((r) => (
                <div key={r.frequency} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 capitalize">
                    {r.frequency.toLowerCase().replace("_", "-")}
                  </span>
                  <div className="text-right">
                    <p className="font-semibold text-gray-800 tabular-nums">
                      {formatCurrency(r.revenue)}
                    </p>
                    <p className="text-xs text-gray-400">{r.count} bookings</p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
