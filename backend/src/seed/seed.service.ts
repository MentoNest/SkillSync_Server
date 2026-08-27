import { DataSource } from 'typeorm';
import { faker } from '@faker-js/faker';
import { User, ProfileType } from '../user/entities/user.entity';
import { Role } from '../entities/role.entity';
import { MentorProfile } from '../entities/mentor-profile.entity';
import { MenteeProfile, SkillLevel } from '../entities/mentee-profile.entity';

faker.seed(42);

const MENTOR_DATA = [
  {
    displayName: 'Alice Johnson',
    email: 'demo_mentor_1@example.com',
    bio: 'Senior software engineer with 10+ years in full-stack development',
    skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL'],
    hourlyRate: 75,
    expertiseAreas: ['Web Development', 'System Design', 'Code Review'],
    yearsOfExperience: 12,
    currentRole: 'Staff Engineer',
    company: 'TechCorp',
    languagesSpoken: ['English', 'Spanish'],
    mentoringStyle: 'Hands-on with real-world projects',
  },
  {
    displayName: 'Bob Chen',
    email: 'demo_mentor_2@example.com',
    bio: 'Blockchain architect specializing in DeFi protocols',
    skills: ['Solidity', 'Rust', 'Web3', 'Smart Contracts'],
    hourlyRate: 120,
    expertiseAreas: ['Blockchain', 'DeFi', 'Smart Contract Security'],
    yearsOfExperience: 6,
    currentRole: 'Lead Blockchain Engineer',
    company: 'DeFi Labs',
    languagesSpoken: ['English', 'Mandarin'],
    mentoringStyle: 'Project-based learning with code audits',
  },
  {
    displayName: 'Carol Williams',
    email: 'demo_mentor_3@example.com',
    bio: 'Product manager with experience at top tech companies',
    skills: ['Product Strategy', 'User Research', 'Agile', 'Data Analysis'],
    hourlyRate: 90,
    expertiseAreas: ['Product Management', 'UX Research', 'Go-to-Market'],
    yearsOfExperience: 8,
    currentRole: 'Senior Product Manager',
    company: 'InnovateTech',
    languagesSpoken: ['English', 'French'],
    mentoringStyle: 'Strategic thinking and career guidance',
  },
  {
    displayName: 'David Kim',
    email: 'demo_mentor_4@example.com',
    bio: 'DevOps expert with cloud infrastructure specialization',
    skills: ['AWS', 'Kubernetes', 'Terraform', 'CI/CD'],
    hourlyRate: 100,
    expertiseAreas: ['Cloud Architecture', 'DevOps', 'Infrastructure'],
    yearsOfExperience: 9,
    currentRole: 'Principal DevOps Engineer',
    company: 'CloudScale',
    languagesSpoken: ['English', 'Korean'],
    mentoringStyle: 'Practical ops scenarios and best practices',
  },
  {
    displayName: 'Eva Martinez',
    email: 'demo_mentor_5@example.com',
    bio: 'AI/ML researcher and practitioner',
    skills: ['Python', 'TensorFlow', 'PyTorch', 'NLP'],
    hourlyRate: 110,
    expertiseAreas: ['Machine Learning', 'Deep Learning', 'NLP'],
    yearsOfExperience: 7,
    currentRole: 'ML Engineering Lead',
    company: 'AI Solutions',
    languagesSpoken: ['English', 'Portuguese'],
    mentoringStyle: 'Research-driven with practical implementations',
  },
];

const MENTEE_DATA = [
  {
    displayName: 'Frank Lee',
    email: 'demo_mentee_1@example.com',
    learningGoals: ['Learn full-stack development', 'Build portfolio projects'],
    areasOfInterest: ['Web Development', 'TypeScript'],
    currentSkillLevel: SkillLevel.BEGINNER,
    preferredMentoringStyle: ['Project-based', 'Code review'],
    timeCommitment: 10,
    jobTitle: 'Junior Developer',
    industry: 'Technology',
  },
  {
    displayName: 'Grace Park',
    email: 'demo_mentee_2@example.com',
    learningGoals: ['Transition into product management', 'Develop leadership skills'],
    areasOfInterest: ['Product Management', 'UX Design'],
    currentSkillLevel: SkillLevel.INTERMEDIATE,
    preferredMentoringStyle: ['Strategic discussions', 'Case studies'],
    timeCommitment: 5,
    jobTitle: 'Business Analyst',
    industry: 'Finance',
  },
  {
    displayName: 'Henry Zhao',
    email: 'demo_mentee_3@example.com',
    learningGoals: ['Understand blockchain development', 'Build DeFi skills'],
    areasOfInterest: ['Blockchain', 'Smart Contracts', 'Web3'],
    currentSkillLevel: SkillLevel.BEGINNER,
    preferredMentoringStyle: ['Hands-on coding', 'Pair programming'],
    timeCommitment: 15,
    jobTitle: 'Software Developer',
    industry: 'Technology',
  },
  {
    displayName: 'Iris Patel',
    email: 'demo_mentee_4@example.com',
    learningGoals: ['Master cloud architecture', 'Get AWS certification'],
    areasOfInterest: ['Cloud Computing', 'DevOps'],
    currentSkillLevel: SkillLevel.INTERMEDIATE,
    preferredMentoringStyle: ['Tutorial-based', 'Exam prep'],
    timeCommitment: 8,
    jobTitle: 'System Administrator',
    industry: 'Technology',
  },
  {
    displayName: 'James Brown',
    email: 'demo_mentee_5@example.com',
    learningGoals: ['Break into AI/ML field', 'Learn deep learning fundamentals'],
    areasOfInterest: ['Machine Learning', 'Data Science', 'Python'],
    currentSkillLevel: SkillLevel.BEGINNER,
    preferredMentoringStyle: ['Academic approach', 'Paper discussions'],
    timeCommitment: 12,
    jobTitle: 'Data Analyst',
    industry: 'Research',
  },
];

async function seedDemoData(dataSource: DataSource) {
  const userRepo = dataSource.getRepository(User);
  const roleRepo = dataSource.getRepository(Role);
  const mentorProfileRepo = dataSource.getRepository(MentorProfile);
  const menteeProfileRepo = dataSource.getRepository(MenteeProfile);

  // Ensure roles exist
  let mentorRole = await roleRepo.findOne({ where: { name: 'mentor' } });
  if (!mentorRole) {
    mentorRole = roleRepo.create({ name: 'mentor', description: 'Mentor role' });
    mentorRole = await roleRepo.save(mentorRole);
  }

  let menteeRole = await roleRepo.findOne({ where: { name: 'mentee' } });
  if (!menteeRole) {
    menteeRole = roleRepo.create({ name: 'mentee', description: 'Mentee role' });
    menteeRole = await roleRepo.save(menteeRole);
  }

  // Seed mentors
  for (const data of MENTOR_DATA) {
    const existing = await userRepo.findOne({ where: { email: data.email } });
    if (existing) {
      console.log(`  Skipping ${data.email} (already exists)`);
      continue;
    }

    const user = userRepo.create({
      email: data.email,
      displayName: data.displayName,
      profileType: ProfileType.MENTOR,
      bio: data.bio,
      roles: [mentorRole],
    });
    const savedUser = await userRepo.save(user);

    const profile = mentorProfileRepo.create({
      userId: savedUser.id,
      bio: data.bio,
      skills: data.skills,
      hourlyRate: data.hourlyRate,
      expertiseAreas: data.expertiseAreas,
      yearsOfExperience: data.yearsOfExperience,
      currentRole: data.currentRole,
      company: data.company,
      languagesSpoken: data.languagesSpoken,
      mentoringStyle: data.mentoringStyle,
      education: [],
      certifications: [],
    });
    profile.calculateProfileCompletion();
    await mentorProfileRepo.save(profile);
    console.log(`  Created mentor: ${data.displayName} (${data.email})`);
  }

  // Seed mentees
  for (const data of MENTEE_DATA) {
    const existing = await userRepo.findOne({ where: { email: data.email } });
    if (existing) {
      console.log(`  Skipping ${data.email} (already exists)`);
      continue;
    }

    const user = userRepo.create({
      email: data.email,
      displayName: data.displayName,
      profileType: ProfileType.MENTEE,
      roles: [menteeRole],
    });
    const savedUser = await userRepo.save(user);

    const profile = menteeProfileRepo.create({
      userId: savedUser.id,
      learningGoals: data.learningGoals,
      areasOfInterest: data.areasOfInterest,
      currentSkillLevel: data.currentSkillLevel,
      preferredMentoringStyle: data.preferredMentoringStyle,
      timeCommitment: data.timeCommitment,
      jobTitle: data.jobTitle,
      industry: data.industry,
      portfolioLinks: [],
    });
    profile.calculateProfileCompletion();
    await menteeProfileRepo.save(profile);
    console.log(`  Created mentee: ${data.displayName} (${data.email})`);
  }

  console.log('Seed completed successfully!');
}

export { seedDemoData };
