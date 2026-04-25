// src/components/customer/RescheduleForm.tsx
"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rescheduleBooking } from "@/actions/bookings";
import { cn } from "@/lib/utils";
import { PRICING_CONFIG } from "@/lib/pricing";
import { calculateDurationMinutes, calculateJobWindow } from "@/lib/scheduling";

interface Slot {
  start: string;
  end: string;
  bufferEnd: string;
  staffId: string;
  staffName: string;
  displayTime: string;
}

interface RescheduleFormProps {
  bookingId: string;
  tierSlug: string;
  upsellSlugs: string[];
  squareFootage: number;
  bufferMinutes: number;
}

function getAvailableDates(days = 14): { date: Date; label: string; shortLabel: string }[] {
  const dates = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() + 1);
  while (dates.length < days) {
    if (cursor.getDay() !== 0) {
      dates.push({
        date: new Date(cursor),
        label: cursor.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
        shortLabel: cursor.toLocaleDateString("en-US", { weekday: "short", day: "numeric" }),
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function RescheduleForm({
  bookingId,
  tierSlug,
  upsellSlugs,
  squareFootage,
  bufferMinutes,
}: RescheduleFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedDateIdx, setSelectedDateIdx] = useState(0);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  const dates = getAvailableDates();

  useEffect(() => {
    const date = dates[selectedDateIdx]?.date;
    if (!date) return;

    setIsLoadingSlots(true);
    setSelectedSlot(null);

    fetch(
      `/api/staff/availability?date=${date.toISOString().split("T")[0]}&tier=${tierSlug}&sqft=${squareFootage}&upsells=${upsellSlugs.join(",")}`
    )
      .then((r) => r.json())
      .then((data) => setSlots(Array.isArray(data) ? data : []))
      .catch(() => setSlots([]))
      .finally(() => setIsLoadingSlots(false));
  }, [selectedDateIdx, tierSlug, squareFootage]);

  function handleConfirm() {
    if (!selectedSlot) return;
    setError(null);

    startTransition(async () => {
      try {
        await rescheduleBooking(
          bookingId,
          new Date(selectedSlot.start),
          new Date(selectedSlot.end),
          new Date(selectedSlot.bufferEnd),
          "Customer-initiated reschedule"
        );
        router.push(`/customer/bookings/${bookingId}?rescheduled=1`);
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Date strip */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Choose a new date</h2>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {dates.map((d, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setSelectedDateIdx(idx)}
              className={cn(
                "flex-shrink-0 rounded-lg border px-3 py-2 text-center text-xs transition-colors",
                selectedDateIdx === idx
                  ? "border-teal-500 bg-teal-50 text-teal-700 font-medium"
                  : "border-gray-200 text-gray-600 hover:border-teal-200"
              )}
            >
              <div>{d.shortLabel.split(" ")[0]}</div>
              <div className="text-base font-semibold">{d.shortLabel.split(" ")[1]}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Time slots */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">
          {dates[selectedDateIdx]?.label} — available times
        </h2>

        {isLoadingSlots ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : slots.length === 0 ? (
          <p className="text-sm text-gray-400">No availability on this date. Try another day.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {slots.map((slot, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedSlot(slot)}
                className={cn(
                  "rounded-lg border px-3 py-3 text-left transition-colors",
                  selectedSlot?.start === slot.start
                    ? "border-teal-500 bg-teal-50"
                    : "border-gray-200 hover:border-teal-200 hover:bg-gray-50"
                )}
              >
                <p className={cn(
                  "text-sm font-medium",
                  selectedSlot?.start === slot.start ? "text-teal-700" : "text-gray-800"
                )}>
                  {slot.displayTime}
                </p>
                <p className={cn(
                  "mt-0.5 text-xs",
                  selectedSlot?.start === slot.start ? "text-teal-500" : "text-gray-400"
                )}>
                  with {slot.staffName}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!selectedSlot || isPending}
          className="flex-1 rounded-lg bg-teal-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
        >
          {isPending ? "Rescheduling…" : "Confirm reschedule"}
        </button>
      </div>
    </div>
  );
}
