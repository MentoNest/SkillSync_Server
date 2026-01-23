import { Module } from "@nestjs/common";
import { BookingsService } from "./bookings.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule], // Import to use notification services
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
