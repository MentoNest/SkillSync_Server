import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

export enum NotificationType {
  BOOKING_CONFIRMED = "BOOKING_CONFIRMED",
  BOOKING_CANCELLED = "BOOKING_CANCELLED",
  PAYMENT_RECEIVED = "PAYMENT_RECEIVED",
  SYSTEM_ALERT = "SYSTEM_ALERT",
  GENERAL = "GENERAL",
}

@Entity("notifications")
@Index(["userId", "read"])
@Index(["userId", "createdAt"])
export class Notification {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  @Index()
  userId: string;

  @Column({
    type: "enum",
    enum: NotificationType,
    default: NotificationType.GENERAL,
  })
  type: NotificationType;

  @Column()
  title: string;

  @Column("text")
  message: string;

  @Column("json", { nullable: true })
  metadata?: Record<string, any>;

  @Column({ default: false })
  read: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
