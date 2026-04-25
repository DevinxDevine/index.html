// src/components/admin/ScheduleCalendar.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ScheduleJob } from "@/app/(admin)/schedule/page";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 7); // 7am–6pm
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_COLORS: Record<string, string> = {
  NEW:         "bg-gray-100 border-gray-300 text-gray-700",
  SCHEDULED:   "bg-blue-50 border-blue-300 text-blue-800",
  APPROVED:    "bg-indigo-50 border-indigo-300 text-indigo-800",
  IN_PROGRESS: "bg-amber-50 border-amber-400 text-amber-900",
  COMPLETED:   "bg-teal-50 border-teal-300 text-teal-800",
  PAID:        "bg-green-50 border-green-300 text-green-800",
};

interface ScheduleCalendarProps {
  jobs: ScheduleJob[];
  weekStart: Date;
}

export function ScheduleCalendar({ jobs, weekStart }: ScheduleCalendarProps) {
  const router = useRouter();

  // Navigate weeks
  function navWeek(delta: number) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + delta * 7);
    router.push(`/admin/schedule?week=${d.toISOString().split("T")[0]}`);
  }

  // Build 6-day grid (Mon–Sat)
  const days = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  // Position a job block as a percentage of the day height
  function jobToStyle(job: ScheduleJob, isBuffer = false) {
    const dayStart = 7 * 60; // 7am in minutes
    const dayDuration = 11 * 60; // 7am–6pm = 660 minutes

    const start = isBuffer
      ? job.scheduledEnd
      : job.scheduledStart;
    const end = isBuffer
      ? job.bufferEnd
      : job.scheduledEnd;

    const startMins = start.getHours() * 60 + start.getMinutes();
    const endMins = end.getHours() * 60 + end.getMinutes();

    const top = ((startMins - dayStart) / dayDuration) * 100;
    const height = ((endMins - startMins) / dayDuration) * 100;

    return {
      top: `${Math.max(0, top).toFixed(2)}%`,
      height: `${Math.max(0.5, height).toFixed(2)}%`,
    };
  }

  function isSameDay(a: Date, b: Date) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  const weekLabel = `${days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${days[5].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div>
      {/* Week navigation */}
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navWeek(-1)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          ← Prev
        </button>
        <span className="text-sm font-medium text-gray-700">{weekLabel}</span>
        <button
          type="button"
          onClick={() => navWeek(1)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          Next →
        </button>
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <div className="flex min-w-[700px]">
          {/* Hour labels */}
          <div className="w-14 flex-none border-r border-gray-100">
            <div className="h-10 border-b border-gray-100" />
            {HOURS.map((h) => (
              <div
                key={h}
                className="flex items-start justify-end border-b border-gray-100 pr-2 text-[10px] text-gray-400"
                style={{ height: "60px" }}
              >
                <span className="-mt-2">{h % 12 || 12}{h < 12 ? "am" : "pm"}</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, colIdx) => {
            const dayJobs = jobs.filter((j) => isSameDay(j.scheduledStart, day));
            const isToday = isSameDay(day, new Date());
            const totalDayHeight = HOURS.length * 60; // px

            return (
              <div
                key={colIdx}
                className={cn("flex-1 border-r border-gray-100 last:border-r-0")}
              >
                {/* Day header */}
                <div
                  className={cn(
                    "flex h-10 items-center justify-center gap-1 border-b border-gray-100 text-xs font-medium",
                    isToday ? "bg-teal-50 text-teal-700" : "text-gray-500"
                  )}
                >
                  <span>{DAY_LABELS[colIdx]}</span>
                  <span className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-xs",
                    isToday ? "bg-teal-600 text-white font-semibold" : ""
                  )}>
                    {day.getDate()}
                  </span>
                </div>

                {/* Job slots */}
                <div
                  className="relative"
                  style={{ height: `${totalDayHeight}px` }}
                >
                  {/* Hour grid lines */}
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="absolute left-0 right-0 border-b border-gray-50"
                      style={{ top: `${(h - 7) * 60}px`, height: "60px" }}
                    />
                  ))}

                  {/* Job blocks */}
                  {dayJobs.map((job) => {
                    const jobStyle = jobToStyle(job);
                    const bufferStyle = jobToStyle(job, true);

                    return (
                      <div key={job.id}>
                        {/* Buffer block (gray, behind job block) */}
                        <div
                          className="absolute left-0.5 right-0.5 rounded bg-gray-100 border border-gray-200"
                          style={{
                            top: bufferStyle.top,
                            height: bufferStyle.height,
                          }}
                          title={`Buffer: ${job.bookingNumber}`}
                        />

                        {/* Job block */}
                        <Link
                          href={`/admin/jobs/${job.id}`}
                          className={cn(
                            "absolute left-0.5 right-0.5 rounded border px-1 py-0.5 text-[10px] leading-tight overflow-hidden hover:z-10 hover:shadow-md transition-shadow",
                            STATUS_COLORS[job.status] ?? "bg-gray-50 border-gray-200"
                          )}
                          style={{
                            top: jobStyle.top,
                            height: jobStyle.height,
                          }}
                        >
                          <p className="font-semibold truncate">{job.customerName}</p>
                          <p className="truncate opacity-75">{job.serviceName}</p>
                          {job.cleanerName && (
                            <p className="truncate opacity-60">{job.cleanerName}</p>
                          )}
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-500">
        {Object.entries(STATUS_COLORS).map(([status, classes]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={cn("h-3 w-3 rounded border", classes)} />
            <span className="capitalize">{status.replace("_", " ").toLowerCase()}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded border border-gray-200 bg-gray-100" />
          <span>Buffer time</span>
        </div>
      </div>
    </div>
  );
}
