// src/__tests__/unit/scheduling.test.ts
import { describe, it, expect } from "vitest";
import {
  calculateAvailableSlots,
  getAvailableDates,
  formatSlotTime,
} from "@/lib/scheduling";
import { PRICING_CONFIG } from "@/lib/pricing";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nextWeekday(dayOfWeek: number): Date {
  // Returns the next occurrence of the given day (0=Sun…6=Sat), starting tomorrow
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== dayOfWeek) d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

const STANDARD_TIER = PRICING_CONFIG.serviceTiers.find((t) => t.slug === "standard")!;
const NO_UPSELLS = [] as any[];

const MOCK_STAFF_RECORD = {
  staffId: "staff-001",
  staffName: "Sarah M.",
  dayOfWeek: 1, // Monday
  startTime: "08:00",
  endTime: "18:00",
  maxJobsPerDay: 3,
  existingBookings: [] as any[],
  timeOffDates: [] as any[],
};

// ─── Slot generation ───────────────────────────────────────────────────────────

describe("calculateAvailableSlots", () => {
  it("returns slots within staff availability window", () => {
    const monday = nextWeekday(1);
    const slots = calculateAvailableSlots(
      monday,
      STANDARD_TIER,
      NO_UPSELLS,
      [MOCK_STAFF_RECORD]
    );

    expect(slots.length).toBeGreaterThan(0);

    for (const slot of slots) {
      const startHour = slot.start.getHours();
      const bufferEndHour = slot.bufferEnd.getHours();
      // All slots must start at or after 8am
      expect(startHour).toBeGreaterThanOrEqual(8);
      // bufferEnd must be before or at 6pm (18:00)
      const bufferEndMins = slot.bufferEnd.getHours() * 60 + slot.bufferEnd.getMinutes();
      expect(bufferEndMins).toBeLessThanOrEqual(18 * 60);
    }
  });

  it("returns no slots on days staff is not available", () => {
    const sunday = nextWeekday(0); // dayOfWeek=0, staff only works Monday (1)
    const slots = calculateAvailableSlots(
      sunday,
      STANDARD_TIER,
      NO_UPSELLS,
      [MOCK_STAFF_RECORD]
    );
    expect(slots).toHaveLength(0);
  });

  it("excludes slots that overlap with existing bookings including buffer", () => {
    const monday = nextWeekday(1);

    // Staff has a job 9am–11am with 30min buffer (blocks until 11:30)
    const existingJobStart = new Date(monday);
    existingJobStart.setHours(9, 0, 0, 0);
    const existingJobBuffer = new Date(monday);
    existingJobBuffer.setHours(11, 30, 0, 0);

    const staffWithBooking = {
      ...MOCK_STAFF_RECORD,
      existingBookings: [
        { scheduledStart: existingJobStart, bufferEnd: existingJobBuffer },
      ],
    };

    const slots = calculateAvailableSlots(
      monday,
      STANDARD_TIER,
      NO_UPSELLS,
      [staffWithBooking]
    );

    // No slot should start before the buffer clears at 11:30
    for (const slot of slots) {
      if (slot.start.getHours() < 11) {
        // Slots before 9am are fine
        expect(slot.start.getHours()).toBeLessThan(9);
      }
    }
  });

  it("respects max jobs per day", () => {
    const monday = nextWeekday(1);

    // Staff already has 3 jobs on this day (at their maximum)
    const makeBlock = (hour: number) => {
      const start = new Date(monday);
      start.setHours(hour, 0, 0, 0);
      const bufferEnd = new Date(monday);
      bufferEnd.setHours(hour + 3, 0, 0, 0);
      return { scheduledStart: start, bufferEnd };
    };

    const staffAtCapacity = {
      ...MOCK_STAFF_RECORD,
      maxJobsPerDay: 3,
      existingBookings: [makeBlock(8), makeBlock(11), makeBlock(14)],
    };

    const slots = calculateAvailableSlots(
      monday,
      STANDARD_TIER,
      NO_UPSELLS,
      [staffAtCapacity]
    );

    expect(slots).toHaveLength(0);
  });

  it("returns no past slots", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Use today with a staff record for today's day of week
    const staffForToday = {
      ...MOCK_STAFF_RECORD,
      dayOfWeek: today.getDay(),
    };

    const slots = calculateAvailableSlots(
      today,
      STANDARD_TIER,
      NO_UPSELLS,
      [staffForToday]
    );

    const now = new Date();
    for (const slot of slots) {
      expect(slot.start.getTime()).toBeGreaterThan(now.getTime());
    }
  });

  it("bufferEnd is always exactly bufferMinutes after slot end", () => {
    const monday = nextWeekday(1);
    const slots = calculateAvailableSlots(
      monday,
      STANDARD_TIER,
      NO_UPSELLS,
      [MOCK_STAFF_RECORD]
    );

    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      const diff = slot.bufferEnd.getTime() - slot.end.getTime();
      expect(diff).toBe(STANDARD_TIER.bufferMinutes * 60_000);
    }
  });

  it("sorts slots by start time ascending", () => {
    const monday = nextWeekday(1);
    const slots = calculateAvailableSlots(
      monday,
      STANDARD_TIER,
      NO_UPSELLS,
      [MOCK_STAFF_RECORD]
    );

    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].start.getTime()).toBeGreaterThanOrEqual(
        slots[i - 1].start.getTime()
      );
    }
  });
});

// ─── Available dates ───────────────────────────────────────────────────────────

describe("getAvailableDates", () => {
  it("returns only dates that have at least one slot", () => {
    const start = nextWeekday(1); // Monday
    const dates = getAvailableDates(
      start,
      7,
      STANDARD_TIER,
      NO_UPSELLS,
      [MOCK_STAFF_RECORD]
    );

    // Should have Monday (the staff's only available day) in the result
    expect(dates.size).toBeGreaterThan(0);

    // All returned dates should be YYYY-MM-DD strings
    for (const dateStr of dates) {
      expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

// ─── Formatting ────────────────────────────────────────────────────────────────

describe("formatSlotTime", () => {
  it("formats slot as readable time range", () => {
    const start = new Date("2024-08-15T09:00:00");
    const end = new Date("2024-08-15T11:00:00");
    const bufferEnd = new Date("2024-08-15T11:30:00");

    const formatted = formatSlotTime({
      start,
      end,
      bufferEnd,
      staffId: "test",
      staffName: "Test",
      durationMinutes: 120,
    });

    expect(formatted).toContain("9");
    expect(formatted).toContain("11");
    expect(formatted).toContain("AM");
  });
});
