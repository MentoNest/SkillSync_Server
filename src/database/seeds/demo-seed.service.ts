import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Faker, en } from '@faker-js/faker';
import { Role } from '../../modules/auth/entities/role.entity';
import { User, UserRole, UserStatus } from '../../modules/auth/entities/user.entity';
import { MentorProfile } from '../../modules/user/entities/mentor-profile.entity';
import { MenteeProfile, SkillLevel } from '../../modules/user/entities/mentee-profile.entity';
import { AvailabilitySlot } from '../../modules/availability/entities/availability.entity';
import { normalizeWalletAddress } from '../../common/utils/wallet.utils';

export interface DemoSeedResult {
  mentorsCreated: number;
  menteesCreated: number;
  availabilitySlotsCreated: number;
  message: string;
}

@Injectable()
export class DemoSeedService {
  private readonly logger = new Logger(DemoSeedService.name);
  private readonly faker: Faker;

  constructor(
    private dataSource: DataSource,
    private configService: ConfigService,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(MentorProfile)
    private mentorProfileRepository: Repository<MentorProfile>,
    @InjectRepository(MenteeProfile)
    private menteeProfileRepository: Repository<MenteeProfile>,
    @InjectRepository(AvailabilitySlot)
    private availabilitySlotRepository: Repository<AvailabilitySlot>,
  ) {
    // Initialize faker with fixed seed for consistent demo data
    this.faker = new Faker({
      locale: en,
    });
    this.faker.seed(12345);
  }

  /**
   * Run the demo seed logic with full transaction support
   */
  async seed(): Promise<DemoSeedResult> {
    // Check if demo seeding is enabled
    const seedDemoData = this.configService.get<string>('SEED_DEMO_DATA');
    if (seedDemoData !== 'true') {
      this.logger.log('Demo seeding is disabled. Set SEED_DEMO_DATA=true to enable.');
      return {
        mentorsCreated: 0,
        menteesCreated: 0,
        availabilitySlotsCreated: 0,
        message: 'Demo seeding disabled',
      };
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      this.logger.log('Starting demo data seeding...');

      // Step 1: Ensure roles exist
      const roles = await this.ensureRoles(queryRunner);

      // Step 2: Seed demo mentors
      const mentorsResult = await this.seedDemoMentors(queryRunner, roles);

      // Step 3: Seed demo mentees
      const menteesResult = await this.seedDemoMentees(queryRunner, roles);

      // Step 4: Seed availability slots for mentors
      const availabilityResult = await this.seedAvailabilitySlots(
        queryRunner,
        mentorsResult.users,
      );

      // Commit transaction
      await queryRunner.commitTransaction();

      const message = `Demo seeding completed: ${mentorsResult.count} mentors, ${menteesResult.count} mentees, ${availabilityResult.count} availability slots created`;
      this.logger.log(message);

      return {
        mentorsCreated: mentorsResult.count,
        menteesCreated: menteesResult.count,
        availabilitySlotsCreated: availabilityResult.count,
        message,
      };
    } catch (error) {
      // Rollback transaction on error
      await queryRunner.rollbackTransaction();
      this.logger.error(`Demo seeding failed: ${error.message}`, error.stack);
      throw error;
    } finally {
      // Release the query runner
      await queryRunner.release();
    }
  }

  /**
   * Ensure mentor and mentee roles exist
   */
  private async ensureRoles(queryRunner: any): Promise<{
    mentor: Role;
    mentee: Role;
  }> {
    const roles: { mentor: Role; mentee: Role } = {} as any;

    // Check/create mentor role
    let mentorRole = await queryRunner.query(
      `SELECT * FROM roles WHERE name = $1`,
      ['mentor'],
    );

    if (!mentorRole || mentorRole.length === 0) {
      const role = this.roleRepository.create({
        name: 'mentor',
        description: 'Mentor role with mentoring permissions',
      });
      const savedRole = await queryRunner.manager.save(role);
      roles.mentor = savedRole;
      this.logger.log('Created mentor role');
    } else {
      roles.mentor = mentorRole[0];
      this.logger.log('Mentor role already exists');
    }

    // Check/create mentee role
    let menteeRole = await queryRunner.query(
      `SELECT * FROM roles WHERE name = $1`,
      ['mentee'],
    );

    if (!menteeRole || menteeRole.length === 0) {
      const role = this.roleRepository.create({
        name: 'mentee',
        description: 'Mentee role for learning and development',
      });
      const savedRole = await queryRunner.manager.save(role);
      roles.mentee = savedRole;
      this.logger.log('Created mentee role');
    } else {
      roles.mentee = menteeRole[0];
      this.logger.log('Mentee role already exists');
    }

    return roles;
  }

  /**
   * Seed demo mentor accounts with complete profiles
   */
  private async seedDemoMentors(
    queryRunner: any,
    roles: { mentor: Role; mentee: Role },
  ): Promise<{ count: number; users: User[] }> {
    const mentorData = [
      {
        email: 'demo_mentor_1@example.com',
        displayName: 'Dr. Sarah Chen',
        expertise: ['Machine Learning', 'Python', 'Data Science', 'AI Ethics'],
        bio: 'AI researcher with 10+ years of experience in machine learning and deep learning. Passionate about making AI accessible and ethical. Previously led ML teams at major tech companies.',
        yearsOfExperience: 12,
        availabilityHoursPerWeek: 10,
        mentoringStyles: ['One-on-One', 'Code Review', 'Career Guidance'],
      },
      {
        email: 'demo_mentor_2@example.com',
        displayName: 'Marcus Johnson',
        expertise: ['React', 'TypeScript', 'System Design', 'Frontend Architecture'],
        bio: 'Senior frontend engineer specializing in scalable React applications. Open source contributor and technical writer. Love helping developers master modern web development.',
        yearsOfExperience: 8,
        availabilityHoursPerWeek: 8,
        mentoringStyles: ['Pair Programming', 'Project Review', 'Technical Deep Dives'],
      },
      {
        email: 'demo_mentor_3@example.com',
        displayName: 'Priya Patel',
        expertise: ['DevOps', 'AWS', 'Kubernetes', 'CI/CD', 'Infrastructure as Code'],
        bio: 'Cloud infrastructure expert with extensive experience in building and scaling production systems. Certified AWS Solutions Architect. Passionate about DevOps best practices.',
        yearsOfExperience: 9,
        availabilityHoursPerWeek: 12,
        mentoringStyles: ['Hands-on Labs', 'Architecture Review', 'Best Practices'],
      },
      {
        email: 'demo_mentor_4@example.com',
        displayName: 'Alex Rivera',
        expertise: ['Mobile Development', 'React Native', 'Flutter', 'iOS', 'Android'],
        bio: 'Mobile app developer with 50+ published apps. Expert in cross-platform development and app store optimization. Helping developers build beautiful, performant mobile experiences.',
        yearsOfExperience: 7,
        availabilityHoursPerWeek: 15,
        mentoringStyles: ['App Review', 'UI/UX Feedback', 'Performance Optimization'],
      },
      {
        email: 'demo_mentor_5@example.com',
        displayName: 'Emily Watson',
        expertise: ['Backend Development', 'Node.js', 'PostgreSQL', 'API Design', 'Microservices'],
        bio: 'Backend engineer specializing in scalable API design and microservices architecture. Experience with high-traffic systems serving millions of users. Love teaching clean code practices.',
        yearsOfExperience: 10,
        availabilityHoursPerWeek: 10,
        mentoringStyles: ['Code Review', 'System Design', 'Debugging Sessions'],
      },
    ];

    const createdUsers: User[] = [];

    for (const data of mentorData) {
      // Check if mentor already exists
      const existingUser = await queryRunner.query(
        `SELECT * FROM users WHERE email = $1`,
        [data.email],
      );

      if (existingUser && existingUser.length > 0) {
        this.logger.log(`Mentor already exists: ${data.email}`);
        createdUsers.push(existingUser[0]);
        continue;
      }

      // Generate fake wallet address for demo
      const walletAddress = this.faker.finance.ethereumAddress();
      const normalizedWallet = normalizeWalletAddress(walletAddress);

      // Create user
      const user = this.userRepository.create({
        walletAddress: normalizedWallet,
        email: data.email,
        displayName: data.displayName,
        status: UserStatus.ACTIVE,
        timezone: 'UTC',
        locale: 'en',
        tokenVersion: 1,
        roles: [roles.mentor],
      });

      const savedUser = await queryRunner.manager.save(user);

      // Create mentor profile
      const mentorProfile = this.mentorProfileRepository.create({
        bio: data.bio,
        yearsOfExperience: data.yearsOfExperience,
        expertise: data.expertise,
        preferredMentoringStyle: data.mentoringStyles,
        availabilityHoursPerWeek: data.availabilityHoursPerWeek,
        availabilityDetails: `Available for ${data.availabilityHoursPerWeek} hours per week`,
        isFeatured: true,
        featuredAt: new Date(),
        featuredOrder: createdUsers.length + 1,
        user: savedUser,
      });

      await queryRunner.manager.save(mentorProfile);

      // Assign role
      await queryRunner.query(
        `INSERT INTO user_roles ("userId", "roleId") VALUES ($1, $2)`,
        [savedUser.id, roles.mentor.id],
      );

      createdUsers.push(savedUser);
      this.logger.log(`Created mentor: ${data.email}`);
    }

    return { count: createdUsers.length, users: createdUsers };
  }

  /**
   * Seed demo mentee accounts with complete profiles
   */
  private async seedDemoMentees(
    queryRunner: any,
    roles: { mentor: Role; mentee: Role },
  ): Promise<{ count: number; users: User[] }> {
    const menteeData = [
      {
        email: 'demo_mentee_1@example.com',
        displayName: 'Jordan Smith',
        learningGoals: ['Learn Machine Learning', 'Build AI Projects', 'Understand Neural Networks'],
        areasOfInterest: ['Artificial Intelligence', 'Data Science', 'Python'],
        currentSkillLevel: SkillLevel.INTERMEDIATE,
        preferredMentoringStyle: ['One-on-One', 'Project-Based Learning'],
        timeCommitmentHoursPerWeek: 10,
        professionalBackground: 'Software developer transitioning to AI/ML',
        jobTitle: 'Junior Developer',
        industry: 'Technology',
      },
      {
        email: 'demo_mentee_2@example.com',
        displayName: 'Maya Rodriguez',
        learningGoals: ['Master React', 'Learn TypeScript', 'Build Full-Stack Apps'],
        areasOfInterest: ['Web Development', 'Frontend', 'React'],
        currentSkillLevel: SkillLevel.BEGINNER,
        preferredMentoringStyle: ['Pair Programming', 'Code Review'],
        timeCommitmentHoursPerWeek: 15,
        professionalBackground: 'Computer science student looking to break into web development',
        jobTitle: 'Student',
        industry: 'Education',
      },
      {
        email: 'demo_mentee_3@example.com',
        displayName: 'Ryan Kim',
        learningGoals: ['Master Cloud Architecture', 'Learn Kubernetes', 'Get AWS Certified'],
        areasOfInterest: ['Cloud Computing', 'DevOps', 'Infrastructure'],
        currentSkillLevel: SkillLevel.INTERMEDIATE,
        preferredMentoringStyle: ['Hands-on Labs', 'Architecture Review'],
        timeCommitmentHoursPerWeek: 12,
        professionalBackground: 'Sysadmin transitioning to cloud engineering',
        jobTitle: 'System Administrator',
        industry: 'IT Services',
      },
      {
        email: 'demo_mentee_4@example.com',
        displayName: 'Aisha Mohammed',
        learningGoals: ['Build Mobile Apps', 'Learn React Native', 'Publish to App Stores'],
        areasOfInterest: ['Mobile Development', 'React Native', 'UI/UX'],
        currentSkillLevel: SkillLevel.BEGINNER,
        preferredMentoringStyle: ['Project-Based Learning', 'App Review'],
        timeCommitmentHoursPerWeek: 8,
        professionalBackground: 'Designer learning to code mobile applications',
        jobTitle: 'UI/UX Designer',
        industry: 'Design',
      },
      {
        email: 'demo_mentee_5@example.com',
        displayName: 'Chris Taylor',
        learningGoals: ['Master Backend Development', 'Learn Microservices', 'Build Scalable APIs'],
        areasOfInterest: ['Backend Development', 'Node.js', 'Database Design'],
        currentSkillLevel: SkillLevel.ADVANCED,
        preferredMentoringStyle: ['System Design', 'Code Review', 'Technical Deep Dives'],
        timeCommitmentHoursPerWeek: 10,
        professionalBackground: 'Experienced developer aiming for senior backend roles',
        jobTitle: 'Backend Developer',
        industry: 'Technology',
      },
    ];

    const createdUsers: User[] = [];

    for (const data of menteeData) {
      // Check if mentee already exists
      const existingUser = await queryRunner.query(
        `SELECT * FROM users WHERE email = $1`,
        [data.email],
      );

      if (existingUser && existingUser.length > 0) {
        this.logger.log(`Mentee already exists: ${data.email}`);
        createdUsers.push(existingUser[0]);
        continue;
      }

      // Generate fake wallet address for demo
      const walletAddress = this.faker.finance.ethereumAddress();
      const normalizedWallet = normalizeWalletAddress(walletAddress);

      // Create user
      const user = this.userRepository.create({
        walletAddress: normalizedWallet,
        email: data.email,
        displayName: data.displayName,
        status: UserStatus.ACTIVE,
        timezone: 'UTC',
        locale: 'en',
        tokenVersion: 1,
        roles: [roles.mentee],
      });

      const savedUser = await queryRunner.manager.save(user);

      // Create mentee profile
      const menteeProfile = this.menteeProfileRepository.create({
        learningGoals: data.learningGoals,
        areasOfInterest: data.areasOfInterest,
        currentSkillLevel: data.currentSkillLevel,
        preferredMentoringStyle: data.preferredMentoringStyle,
        timeCommitmentHoursPerWeek: data.timeCommitmentHoursPerWeek,
        professionalBackground: data.professionalBackground,
        jobTitle: data.jobTitle,
        industry: data.industry,
        portfolioLinks: [
          this.faker.internet.url(),
          this.faker.internet.url(),
        ],
        user: savedUser,
      });

      await queryRunner.manager.save(menteeProfile);

      // Assign role
      await queryRunner.query(
        `INSERT INTO user_roles ("userId", "roleId") VALUES ($1, $2)`,
        [savedUser.id, roles.mentee.id],
      );

      createdUsers.push(savedUser);
      this.logger.log(`Created mentee: ${data.email}`);
    }

    return { count: createdUsers.length, users: createdUsers };
  }

  /**
   * Seed availability slots for demo mentors
   */
  private async seedAvailabilitySlots(
    queryRunner: any,
    mentors: User[],
  ): Promise<{ count: number }> {
    let count = 0;

    for (const mentor of mentors) {
      // Check if availability slots already exist for this mentor
      const existingSlots = await queryRunner.query(
        `SELECT * FROM availability_slots WHERE "mentorId" = $1`,
        [mentor.id],
      );

      if (existingSlots && existingSlots.length > 0) {
        this.logger.log(`Availability slots already exist for mentor: ${mentor.email}`);
        count += existingSlots.length;
        continue;
      }

      // Create availability slots for weekdays
      const weekdays = [1, 2, 3, 4, 5]; // Monday to Friday
      const timeSlots = [
        { start: '09:00', end: '12:00' },
        { start: '13:00', end: '17:00' },
        { start: '18:00', end: '20:00' },
      ];

      for (const day of weekdays) {
        // Randomly select 1-2 time slots per day
        const numSlots = this.faker.number.int({ min: 1, max: 2 });
        const selectedSlots = this.faker.helpers.arrayElements(timeSlots, numSlots);

        for (const slot of selectedSlots) {
          const availabilitySlot = this.availabilitySlotRepository.create({
            mentorId: mentor.id,
            dayOfWeek: day,
            startTime: slot.start,
            endTime: slot.end,
            timezone: 'UTC',
            isActive: true,
          });

          await queryRunner.manager.save(availabilitySlot);
          count++;
        }
      }

      this.logger.log(`Created ${count} availability slots for mentor: ${mentor.email}`);
    }

    return { count };
  }
}
