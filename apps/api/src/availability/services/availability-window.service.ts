import { Injectable } from "@nestjs/common";
import { Repository } from "typeorm";
import { AvailabilityException } from "../availability-exception.entity";
import { AvailabilitySlot } from "../entities/availability-slot.entity";

@Injectable()
export class AvailabilityWindowService {
  constructor(
    private readonly slotRepo: Repository<AvailabilitySlot>,
    private readonly exceptionRepo: Repository<AvailabilityException>,
  ) {}

  public async generateWindows({
    mentorId,
    now,
    horizonDays = 30,
    slotLength = 30,
  }: {
    mentorId: string;
    now: Date;
    horizonDays?: number;
    slotLength?: number;
  }) {
    const slots = await this.slotRepo.find({
      where: { mentorProfile: { id: mentorId }, active: true },
    });

    const exceptions = await this.exceptionRepo.find({
      where: { mentorProfile: { id: mentorId } },
    });

    return this.generate(slots, exceptions, now, horizonDays, slotLength);
  }

  private generate(
    slots: AvailabilitySlot[],
    exceptions: AvailabilityException[],
    nowUtc: Date,
    horizonDays: number,
    slotLength: number,
  ) {
    const results = [];

    for (const slot of slots) {
      const tz = slot.timezone;
      const startDay = DateTime.fromJSDate(nowUtc).setZone(tz).startOf('day');

      for (let i = 0; i < horizonDays; i++) {
        const day = startDay.plus({ days: i });

        if (day.weekday !== slot.weekday) continue;

        const dayStart = day.plus({ minutes: slot.startMinutes });
        const dayEnd = day.plus({ minutes: slot.endMinutes });

        let cursor = dayStart;

        while (cursor.plus({ minutes: slotLength }) <= dayEnd) {
          if (cursor <= DateTime.fromJSDate(nowUtc).setZone(tz)) {
            cursor = cursor.plus({ minutes: slotLength });
            continue;
          }

          if (!this.isBlackout(cursor, exceptions, tz)) {
            results.push({
              start: cursor.toISO(),
              end: cursor.plus({ minutes: slotLength }).toISO(),
            });
          }

          cursor = cursor.plus({ minutes: slotLength });
        }
      }
    }

    return results;
  }

  private isBlackout(
    dt: DateTime,
    exceptions: AvailabilityException[],
    tz: string,
  ) {
    return exceptions.some((ex) => {
      const day = dt.toISODate();
      if (day < ex.startDate || day > ex.endDate) return false;

      if (ex.payload.type === 'FULL_DAY') return true;

      const mins = dt.hour * 60 + dt.minute;
      return (
        mins >= ex.payload.startMinutes &&
        mins < ex.payload.endMinutes
      );
    });
  }
}
