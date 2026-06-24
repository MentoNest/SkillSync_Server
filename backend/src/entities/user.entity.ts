import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, Unique } from 'typeorm';

@Entity({ name: 'users' })
@Unique(['wallet'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 56 })
  wallet: string;

  @Column('simple-array')
  roles: string[];

  @Column('simple-array')
  permissions: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
