import { SessionStatus } from "src/common/enums/SessionStatus.enum";
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm"

@Entity()
export class Session {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({type: 'varchar', nullable: false})
    mentorId: string;

    @Column({type: 'varchar', nullable: false})
    menteeId: string;

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

}
