import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToMany, Unique } from 'typeorm';
import { Skill } from '../../skill/entities/skill.entity';
import { ServiceListing } from '../../service-listing/entities/service-listing.entity';

@Entity('tags')
@Unique(['name'])
@Unique(['slug'])
export class Tag {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ unique: true })
  slug: string;

  @ManyToMany(() => Skill, skill => skill.tags)
  skills: Skill[];

  @ManyToMany(() => ServiceListing, serviceListing => serviceListing.tags)
  serviceListings: ServiceListing[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
