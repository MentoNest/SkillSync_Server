import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  ManyToMany,
  JoinTable,
  Index,
} from 'typeorm';
import { MentorProfile } from '../../mentor-profiles/entities/mentor-profile.entity';
import { Skill } from '../../skills/entities/skill.entity';

@Entity('listings')
@Index(['mentorProfileId'])
@Index(['active'])
@Index(['hourlyRateMinorUnits'])
export class Listing {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => MentorProfile, (profile) => profile.listings, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'mentor_profile_id' })
  mentorProfile!: MentorProfile;

  @Column({ name: 'mentor_profile_id' })
  mentorProfileId!: string;

  @Column({ type: 'varchar', length: 120 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ name: 'hourly_rate_minor_units', type: 'int' })
  hourlyRateMinorUnits!: number;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @ManyToMany(() => Skill, { cascade: true })
  @JoinTable({
    name: 'listing_skills',
    joinColumn: { name: 'listing_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'skill_id', referencedColumnName: 'id' },
  })
  skills!: Skill[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
