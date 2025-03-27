import { SessionStatus } from "src/common/enums/SessionStatus.enum";
import { User } from "src/users/user.entity";
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm"

@Entity()
export class Session {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'timestamp', nullable: false })
  sessionDate: Date;

  @Column({ type: 'int', nullable: false })
  duration: number;

  @Column({
    type: 'enum',
    nullable: false,
    enum: SessionStatus,
    default: SessionStatus.PENDING,
  })
  status: SessionStatus;

  @CreateDateColumn(
    {
      type: 'timestamptz',
      default: () => 'CURRENT_TIMESTAMP',
    },
  )
  createdAt: Date;

  @UpdateDateColumn(
    {
      type: 'timestamptz',
      default: () => 'CURRENT_TIMESTAMP',
    },
  )
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'mentor_id' })
  mentor: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'mentee_id' })
  mentee: User; 

}
