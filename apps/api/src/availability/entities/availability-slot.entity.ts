@Entity('availability_slots')
@Index(['mentorProfile', 'weekday'])
@Index(['active'])
export class AvailabilitySlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => MentorProfile, { onDelete: 'CASCADE' })
  mentorProfile: MentorProfile;

  // ISO weekday: 1 (Mon) → 7 (Sun)
  @Column({ type: 'int' })
  weekday: number;

  // Minutes from midnight (e.g. 10:00 = 600)
  @Column({ type: 'int' })
  startMinutes: number;

  @Column({ type: 'int' })
  endMinutes: number;

  @Column()
  timezone: string;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
