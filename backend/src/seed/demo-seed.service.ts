import { Injectable, Logger } from '@nestjs/common';
import { faker } from '@faker-js/faker';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { User, ProfileType, UserStatus } from '../user/entities/user.entity.js';
import { MentorProfile } from '../entities/mentor-profile.entity.js';
import {
  MenteeProfile,
  SkillLevel,
} from '../entities/mentee-profile.entity.js';
import { Role } from '../entities/role.entity.js';
import { RoleName } from '../rbac/role-permissions.js';

const DEMO_COUNT = 5;

@Injectable()
export class DemoSeedService {
  private readonly logger = new Logger(DemoSeedService.name);

  constructor(private readonly dataSource: DataSource) {}

  async seed(force = false): Promise<number> {
    if (!force && process.env.SEED_DEMO_DATA?.toLowerCase() !== 'true') {
      this.logger.log(
        'Demo seed skipped: set SEED_DEMO_DATA=true to enable it',
      );
      return 0;
    }

    faker.seed(1357);
    const created = await this.dataSource.transaction((manager) =>
      this.seedUsers(manager),
    );
    this.logger.log(`Demo seed complete: ${created} users created`);
    return created;
  }

  private async seedUsers(manager: EntityManager): Promise<number> {
    const users = manager.getRepository(User);
    const mentorRole = await manager
      .getRepository(Role)
      .findOne({ where: { name: RoleName.MENTOR } });
    const menteeRole = await manager
      .getRepository(Role)
      .findOne({ where: { name: RoleName.MENTEE } });
    if (!mentorRole || !menteeRole)
      throw new Error('Demo seed requires mentor and mentee roles');

    let created = 0;
    for (let index = 1; index <= DEMO_COUNT; index += 1) {
      created += await this.createMentor(manager, users, mentorRole.id, index);
      created += await this.createMentee(manager, users, menteeRole.id, index);
    }
    return created;
  }

  private async createMentor(
    manager: EntityManager,
    users: Repository<User>,
    roleId: string,
    index: number,
  ): Promise<number> {
    const email = `demo_mentor_${index}@example.com`;
    if (await users.findOne({ where: { email } })) return 0;
    const user = await users.save(
      users.create({
        email,
        displayName: faker.person.fullName(),
        bio: faker.person.bio(),
        profileType: ProfileType.MENTOR,
        status: UserStatus.ACTIVE,
        settings: { demo: true, notifications: true },
      }),
    );
    await manager.getRepository(MentorProfile).save({
      userId: user.id,
      bio: user.bio,
      skills: faker.helpers.arrayElements(
        ['TypeScript', 'Product design', 'Solidity', 'Career coaching'],
        2,
      ),
      hourlyRate: faker.number.int({ min: 40, max: 150 }),
      expertiseAreas: [
        faker.commerce.department(),
        faker.commerce.department(),
      ],
      yearsOfExperience: faker.number.int({ min: 3, max: 15 }),
      currentRole: faker.person.jobTitle(),
      company: faker.company.name(),
      education: [
        {
          school: faker.company.name(),
          degree: 'BSc',
          fieldOfStudy: 'Computer Science',
        },
      ],
      certifications: [{ title: 'Professional Mentor', issuer: 'SkillSync' }],
      languagesSpoken: ['English'],
      mentoringStyle: 'Practical and goal-oriented',
      portfolioLinks: [faker.internet.url()],
      isVerified: true,
      profileCompletionPercentage: 100,
    });
    await this.assignRole(manager, user.id, roleId);
    return 1;
  }

  private async createMentee(
    manager: EntityManager,
    users: Repository<User>,
    roleId: string,
    index: number,
  ): Promise<number> {
    const email = `demo_mentee_${index}@example.com`;
    if (await users.findOne({ where: { email } })) return 0;
    const user = await users.save(
      users.create({
        email,
        displayName: faker.person.fullName(),
        bio: faker.person.bio(),
        profileType: ProfileType.MENTEE,
        status: UserStatus.ACTIVE,
        settings: { demo: true, notifications: true },
      }),
    );
    await manager.getRepository(MenteeProfile).save({
      userId: user.id,
      learningGoals: [
        'Build a production portfolio',
        'Prepare for technical interviews',
      ],
      areasOfInterest: [faker.commerce.department(), 'Open-source software'],
      currentSkillLevel: SkillLevel.INTERMEDIATE,
      preferredMentoringStyle: ['Pair programming', 'Structured feedback'],
      timeCommitment: faker.number.int({ min: 3, max: 10 }),
      professionalBackground: faker.person.jobDescriptor(),
      jobTitle: faker.person.jobTitle(),
      industry: faker.commerce.department(),
      portfolioLinks: [faker.internet.url()],
      profileCompletionPercentage: 100,
    });
    await this.assignRole(manager, user.id, roleId);
    return 1;
  }

  private async assignRole(
    manager: EntityManager,
    userId: string,
    roleId: string,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .insert()
      .into('user_roles')
      .values({ userId, roleId })
      .orIgnore()
      .execute();
  }
}
