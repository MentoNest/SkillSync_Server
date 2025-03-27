import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Mentor {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  bio: string;

  @Column()
  skills: string[];

  @Column({ nullable: true })
  availability?: string;
}
