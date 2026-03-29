/** A single bookable time window returned by getAvailableSlots() */
export interface AvailableSlot {
  /** UTC start of the slot */
  startAt: Date;
  /** UTC end of the slot */
  endAt: Date;
  /** Duration in minutes */
  durationMinutes: number;
  /** The availability rule that generated this slot */
  availabilityRuleId: string;
  /** Local time representation for display */
  localStart: string; // "09:00"
  localEnd: string;   // "10:00"
  timezone: string;
}

/** Payload shape returned when listing a mentor's schedule for a date range */
export interface MentorSchedule {
  mentorId: string;
  date: string; // "YYYY-MM-DD"
  slots: AvailableSlot[];
}
