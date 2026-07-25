import { MenteeProfile, SkillLevel } from './mentee-profile.entity.js';

describe('MenteeProfile Entity', () => {
  describe('profileCompletion', () => {
    it('should return 20% for profile with only skill level set', () => {
      const profile = new MenteeProfile();
      profile.learningGoals = [];
      profile.areasOfInterest = [];
      profile.currentSkillLevel = SkillLevel.BEGINNER;
      profile.preferredMentoringStyle = [];
      profile.timeCommitmentHoursPerWeek = 0;
      expect(profile.profileCompletion).toBe(20);
    });

    it('should return 100% for fully filled profile', () => {
      const profile = new MenteeProfile();
      profile.learningGoals = ['Learn TypeScript'];
      profile.areasOfInterest = ['Backend'];
      profile.currentSkillLevel = SkillLevel.INTERMEDIATE;
      profile.preferredMentoringStyle = ['technical skills'];
      profile.timeCommitmentHoursPerWeek = 10;
      expect(profile.profileCompletion).toBe(100);
    });

    it('should return partial completion for partially filled profile', () => {
      const profile = new MenteeProfile();
      profile.learningGoals = ['Learn TypeScript'];
      profile.areasOfInterest = [];
      profile.currentSkillLevel = SkillLevel.BEGINNER;
      profile.preferredMentoringStyle = [];
      profile.timeCommitmentHoursPerWeek = 0;
      expect(profile.profileCompletion).toBe(40);
    });
  });

  describe('SkillLevel enum', () => {
    it('should have correct enum values', () => {
      expect(SkillLevel.BEGINNER).toBe('beginner');
      expect(SkillLevel.INTERMEDIATE).toBe('intermediate');
      expect(SkillLevel.ADVANCED).toBe('advanced');
    });
  });
});
