import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Mentee {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  preferences: string[];

  @Column({ nullable: true })
  goal?: string;
}
