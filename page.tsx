// src/app/(admin)/schedule/page.tsx
import { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { ScheduleCalendar } from "@/components/admin/ScheduleCalendar";

export const metadata: Metadata = { title: "Schedule — Sparkle Admin" };
export const dynamic = "force-dynamic";

export type ScheduleJob = {
  id: string;
  bookingNumber: string;
  status: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  bufferEnd: Date;
  customerName: string;
  cleanerName: string | null;
  cleanerId: string | null;
  serviceName: string;
  addressCity: string;
};

async function getWeekJobs(weekStart: Date): Promise<ScheduleJob[]> {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const bookings = await prisma.booking.findMany({
    where: {
      scheduledDate: { gte: weekStart, lt: weekEnd },
      status: { notIn: ["CANCELLED", "DISPUTED"] },
    },
    orderBy: { scheduledStart: "asc" },
    include: {
      customer: { select: { firstName: true, lastName: true } },
      assignedCleaner: { select: { id: true, firstName: true, lastName: true } },
      serviceTier: { select: { name: true } },
      address: { select: { city: true } },
    },
  });

  return bookings.map((b) => ({
    id: b.id,
    bookingNumber: b.bookingNumber,
    status: b.status,
    scheduledStart: b.scheduledStart,
    scheduledEnd: b.scheduledEnd,
    bufferEnd: b.bufferEnd,
    customerName: `${b.customer.firstName} ${b.customer.lastName}`,
    cleanerName: b.assignedCleaner
      ? `${b.assignedCleaner.firstName} ${b.assignedCleaner.lastName}`
      : null,
    cleanerId: b.assignedCleaner?.id ?? null,
    serviceName: b.serviceTier.name,
    addressCity: b.address.city,
  }));
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { week?: string };
}) {
  // Default to current week starting Monday
  const weekStart = searchParams.week
    ? new Date(searchParams.week)
    : (() => {
        const d = new Date();
        const day = d.getDay();
        d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
        d.setHours(0, 0, 0, 0);
        return d;
      })();

  const jobs = await getWeekJobs(weekStart);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Schedule</h1>
        <p className="mt-1 text-sm text-gray-500">
          {jobs.length} job{jobs.length !== 1 ? "s" : ""} this week ·
          Buffer time shown in gray
        </p>
      </div>
      <ScheduleCalendar jobs={jobs} weekStart={weekStart} />
    </div>
  );
}
