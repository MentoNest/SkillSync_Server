import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Mentee {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  goal?: string;
}
