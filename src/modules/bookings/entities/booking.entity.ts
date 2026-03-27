import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from '../../user/entities/user.entity';
import { ServiceListing } from '../../service-listing/entities/service-listing.entity';
import { CurrencyCode } from '../../../common/enums/currency-code.enum';
import { decimalTransformer } from '../../../common/utils/decimal.transformer';

export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  REJECTED = 'rejected',
}

@Entity('bookings')
export class Booking {
  @ApiProperty({ description: 'Booking unique identifier' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Mentor (service provider) user ID' })
  @Column()
  mentorId: string;

  @ApiProperty({ description: 'Mentee (customer) user ID' })
  @Column()
  menteeId: string;

  @ApiProperty({ description: 'Service listing for this booking' })
  @ManyToOne(() => ServiceListing)
  @JoinColumn({ name: 'serviceListingId' })
  serviceListing: ServiceListing;

  @ApiProperty({ description: 'Service listing ID reference' })
  @Column()
  serviceListingId: string;

  @ApiProperty({ description: 'Booking status', enum: BookingStatus })
  @Column({
    type: 'enum',
    enum: BookingStatus,
    default: BookingStatus.PENDING,
  })
  status: BookingStatus;

  @ApiProperty({ 
    description: 'Session duration in minutes',
    example: 60,
  })
  @Column({ type: 'int' })
  duration: number;

  @ApiProperty({ description: 'Scheduled session date and time' })
  @Column({ type: 'timestamp' })
  scheduledAt: Date;

  @ApiProperty({ description: 'Currency for booking price', enum: CurrencyCode })
  @IsEnum(CurrencyCode)
  @Column({
    type: 'enum',
    enum: CurrencyCode,
    default: CurrencyCode.USD,
  })
  currency: CurrencyCode;

  @ApiProperty({ description: 'Total price for the booking' })
  @Column('decimal', { precision: 10, scale: 2, transformer: decimalTransformer })
  totalPrice: number;

  @ApiPropertyOptional({ description: 'Additional notes or requirements' })
  @Column('text', { nullable: true })
  notes?: string;

  @ApiPropertyOptional({ description: 'Meeting link or location' })
  @Column({ nullable: true })
  meetingLink?: string;

  @ApiProperty({ description: 'Booking creation date' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'Last update date' })
  @UpdateDateColumn()
  updatedAt: Date;
}
