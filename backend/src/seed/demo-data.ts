import { faker } from '@faker-js/faker';
import { Role } from '../auth/auth.types';
import { ExperienceLevel } from '../profile/dto/create-profile.dto';

export const DEMO_SEED = 1706;

export interface DemoAccountIdentity {
  index: number;
  email: string;
  username: string;
  displayName: string;
  role: Role;
  education?: string[];
  certifications?: string[];
}

export interface DemoAvailabilitySlot {
  dayOfWeek: number;
  startTimeUtc: string;
  endTimeUtc: string;
  timezone: string;
}

export interface DemoMentor extends DemoAccountIdentity {
  role: Role.MENTOR;
  bio: string;
  skills: string[];
  expertiseAreas: string[];
  hourlyRateUsdCents: number;
  maxMentees: number;
  languages: string[];
  availability: DemoAvailabilitySlot[];
}

export interface DemoMentee extends DemoAccountIdentity {
  role: Role.MENTEE;
  learningGoals: string;
  interests: string[];
  experienceLevel: ExperienceLevel;
  budgetUsdCentsPerMonth: number | null;
  languages: string[];
}

const MENTOR_DETAILS = [
  {
    skills: ['TypeScript', 'NestJS', 'PostgreSQL'],
    expertiseAreas: ['Backend APIs', 'System design'],
    hourlyRateUsdCents: 8000,
    bio: 'Staff engineer who helps developers design reliable NestJS services and APIs.',
    education: ['BSc Computer Science, University of Cape Town'],
    certifications: ['AWS Certified Solutions Architect'],
  },
  {
    skills: ['React', 'Accessibility', 'Design Systems'],
    expertiseAreas: ['Frontend architecture', 'Inclusive UI'],
    hourlyRateUsdCents: 6500,
    bio: 'Frontend lead mentoring developers on accessible interfaces and design systems.',
    education: ['BA Interaction Design, Rhode Island School of Design'],
    certifications: ['WAI Web Accessibility Specialist'],
  },
  {
    skills: ['Stellar', 'Soroban', 'Web3 Security'],
    expertiseAreas: ['Smart contracts', 'Blockchain security'],
    hourlyRateUsdCents: 12000,
    bio: 'Smart contract auditor coaching builders on safe Stellar and Soroban development.',
    education: ['MSc Cryptography, ETH Zurich'],
    certifications: ['Certified Ethereum Developer'],
  },
  {
    skills: ['Product Strategy', 'User Research', 'Roadmapping'],
    expertiseAreas: ['Product discovery', 'Go-to-market'],
    hourlyRateUsdCents: 7000,
    bio: 'Product manager helping mentees turn research into focused, shippable roadmaps.',
    education: ['MBA, INSEAD'],
    certifications: ['Certified Scrum Product Owner'],
  },
  {
    skills: ['DevOps', 'Kubernetes', 'Observability'],
    expertiseAreas: ['Platform engineering', 'Incident response'],
    hourlyRateUsdCents: 9000,
    bio: 'Site reliability engineer teaching practical observability and delivery practices.',
    education: ['BSc Information Systems, University of Nairobi'],
    certifications: ['Certified Kubernetes Administrator'],
  },
] as const;

const MENTEE_DETAILS = [
  {
    goal: 'Land a junior backend role and build confidence with APIs',
    interests: ['APIs', 'PostgreSQL', 'Testing'],
    experienceLevel: 'beginner' as ExperienceLevel,
    budgetUsdCentsPerMonth: 10000,
    education: ['Bootcamp certificate in full-stack development'],
    certifications: [],
  },
  {
    goal: 'Improve system design skills for senior engineering interviews',
    interests: ['Distributed systems', 'Architecture'],
    experienceLevel: 'intermediate' as ExperienceLevel,
    budgetUsdCentsPerMonth: 20000,
    education: ['BSc Software Engineering'],
    certifications: [],
  },
  {
    goal: 'Ship an accessible React portfolio that stands out to recruiters',
    interests: ['React', 'Accessibility', 'UI design'],
    experienceLevel: 'beginner' as ExperienceLevel,
    budgetUsdCentsPerMonth: 8000,
    education: ['Self-taught frontend developer'],
    certifications: ['freeCodeCamp Responsive Web Design'],
  },
  {
    goal: 'Contribute to open-source Web3 projects on Stellar',
    interests: ['Stellar', 'Rust', 'Smart contracts'],
    experienceLevel: 'intermediate' as ExperienceLevel,
    budgetUsdCentsPerMonth: 15000,
    education: ['BSc Computer Engineering'],
    certifications: [],
  },
  {
    goal: 'Transition from engineering into a product management role',
    interests: ['Product strategy', 'User research'],
    experienceLevel: 'advanced' as ExperienceLevel,
    budgetUsdCentsPerMonth: 25000,
    education: ['MSc Human-Computer Interaction'],
    certifications: ['Professional Scrum Master'],
  },
] as const;

export function buildDemoAccounts(): {
  mentors: DemoMentor[];
  mentees: DemoMentee[];
} {
  faker.seed(DEMO_SEED);

  const mentors = MENTOR_DETAILS.map((details, position): DemoMentor => {
    const index = position + 1;
    return {
      index,
      email: `demo_mentor_${index}@example.com`,
      username: `demo_mentor_${index}`,
      displayName: faker.person.fullName(),
      role: Role.MENTOR,
      bio: `${details.bio} ${faker.lorem.sentence()}`,
      skills: [...details.skills],
      expertiseAreas: [...details.expertiseAreas],
      hourlyRateUsdCents: details.hourlyRateUsdCents,
      maxMentees: 2 + (index % 3),
      languages: index % 2 === 0 ? ['English', 'Spanish'] : ['English'],
      education: [...details.education],
      certifications: [...details.certifications],
      availability: [
        {
          dayOfWeek: 1 + (position % 5),
          startTimeUtc: '09:00',
          endTimeUtc: '11:00',
          timezone: 'UTC',
        },
        {
          dayOfWeek: 2 + (position % 5),
          startTimeUtc: '15:00',
          endTimeUtc: '17:00',
          timezone: 'UTC',
        },
      ],
    };
  });

  const mentees = MENTEE_DETAILS.map((details, position): DemoMentee => {
    const index = position + 1;
    return {
      index,
      email: `demo_mentee_${index}@example.com`,
      username: `demo_mentee_${index}`,
      displayName: faker.person.fullName(),
      role: Role.MENTEE,
      learningGoals: `${details.goal}. ${faker.lorem.sentence()}`,
      interests: [...details.interests],
      experienceLevel: details.experienceLevel,
      budgetUsdCentsPerMonth: details.budgetUsdCentsPerMonth,
      languages: index % 2 === 0 ? ['English', 'French'] : ['English'],
      education: [...details.education],
      certifications: [...details.certifications],
    };
  });

  return { mentors, mentees };
}

const accounts = buildDemoAccounts();

export const DEMO_MENTORS: DemoMentor[] = accounts.mentors;
export const DEMO_MENTEES: DemoMentee[] = accounts.mentees;
