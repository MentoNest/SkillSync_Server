import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity.js';
import { Role } from '../users/entities/role.entity.js';
import { MentorProfile } from '../users/entities/mentor-profile.entity.js';
import { MenteeProfile } from '../users/entities/mentee-profile.entity.js';
import { AuthRole } from '../common/enums/auth-role.enum.js';
import { UserStatus } from '../users/enums/user-status.enum.js';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
    @InjectRepository(MentorProfile)
    private readonly mentorRepo: Repository<MentorProfile>,
    @InjectRepository(MenteeProfile)
    private readonly menteeRepo: Repository<MenteeProfile>,
  ) {}

  async createDemoData(): Promise<{
    success: boolean;
    message: string;
    count: number;
  }> {
    const existingCount = await this.userRepo.count({
      where: { email: 'demo_mentor_1@example.com' },
    });
    if (existingCount > 0) {
      return {
        success: true,
        message: 'Demo data already exists',
        count: 0,
      };
    }

    let count = 0;

    // Create 5 demo mentors
    const mentorSkills = [
      ['JavaScript', 'React', 'Node.js'],
      ['Python', 'Machine Learning', 'Data Science'],
      ['Solidity', 'Smart Contracts', 'DeFi'],
      ['TypeScript', 'NestJS', 'PostgreSQL'],
      ['Rust', 'Soroban', 'Blockchain'],
    ];

    for (let i = 1; i <= 5; i++) {
      const user = this.userRepo.create({
        walletAddress: `G${'A'.repeat(55)}`,
        username: `demo_mentor_${i}`,
        email: `demo_mentor_${i}@example.com`,
        displayName: `Demo Mentor ${i}`,
        status: UserStatus.ACTIVE,
      });
      const savedUser = await this.userRepo.save(user);

      const role = this.roleRepo.create({
        name: AuthRole.MENTOR,
        user: savedUser,
      });
      await this.roleRepo.save(role);

      const mentorProfile = this.mentorRepo.create({
        user: savedUser,
        bio: `Experienced mentor specializing in ${mentorSkills[i - 1].join(', ')}. Passionate about teaching and helping others grow.`,
        skills: mentorSkills[i - 1],
        hourlyRate: 50 + i * 10,
        expertiseAreas: mentorSkills[i - 1],
        yearsOfExperience: 3 + i,
        languages: ['English'],
        isVerified: i <= 3,
        averageRating: 4.5 + i * 0.1,
        numberOfReviews: 10 + i * 5,
      });
      await this.mentorRepo.save(mentorProfile);
      count++;
    }

    // Create 5 demo mentees
    const menteeGoals = [
      ['Learn React', 'Build a portfolio project'],
      ['Understand ML basics', 'Build a prediction model'],
      ['Learn Solidity', 'Deploy first smart contract'],
      ['Master NestJS', 'Build REST APIs'],
      ['Learn Rust programming', 'Understand blockchain development'],
    ];

    for (let i = 1; i <= 5; i++) {
      const user = this.userRepo.create({
        walletAddress: `G${'B'.repeat(55)}`,
        username: `demo_mentee_${i}`,
        email: `demo_mentee_${i}@example.com`,
        displayName: `Demo Mentee ${i}`,
        status: UserStatus.ACTIVE,
      });
      const savedUser = await this.userRepo.save(user);

      const role = this.roleRepo.create({
        name: AuthRole.MENTEE,
        user: savedUser,
      });
      await this.roleRepo.save(role);

      const menteeProfile = this.menteeRepo.create({
        user: savedUser,
        learningGoals: menteeGoals[i - 1],
        areasOfInterest: ['Technology', 'Web Development'],
        currentSkillLevel: i <= 2 ? 'beginner' : 'intermediate',
        timeCommitmentHoursPerWeek: 5 + i,
      });
      await this.menteeRepo.save(menteeProfile);
      count++;
    }

    this.logger.log(`Seeded ${count} demo accounts`);
    return { success: true, message: `Seeded ${count} demo accounts`, count };
  }

  async clearDemoData(): Promise<{
    success: boolean;
    message: string;
    count: number;
  }> {
    const demoUsers = await this.userRepo.find({
      where: [
        { email: 'demo_mentor_1@example.com' },
        { email: 'demo_mentor_2@example.com' },
        { email: 'demo_mentor_3@example.com' },
        { email: 'demo_mentor_4@example.com' },
        { email: 'demo_mentor_5@example.com' },
        { email: 'demo_mentee_1@example.com' },
        { email: 'demo_mentee_2@example.com' },
        { email: 'demo_mentee_3@example.com' },
        { email: 'demo_mentee_4@example.com' },
        { email: 'demo_mentee_5@example.com' },
      ],
    });

    const count = demoUsers.length;
    if (count > 0) {
      await this.userRepo.remove(demoUsers);
    }

    this.logger.log(`Cleared ${count} demo accounts`);
    return {
      success: true,
      message: `Cleared ${count} demo accounts`,
      count,
    };
  }
}
