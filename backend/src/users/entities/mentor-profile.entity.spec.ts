import { MentorProfile } from './mentor-profile.entity.js';

describe('MentorProfile Entity', () => {
  describe('profileCompletion', () => {
    it('should return 0% for empty profile', () => {
      const profile = new MentorProfile();
      profile.skills = [];
      profile.expertiseAreas = [];
      profile.yearsOfExperience = 0;
      profile.hourlyRate = 0;
      expect(profile.profileCompletion).toBe(0);
    });

    it('should return 100% for fully filled profile', () => {
      const profile = new MentorProfile();
      profile.bio = 'Expert developer with 10 years of experience';
      profile.skills = ['TypeScript', 'NestJS'];
      profile.expertiseAreas = ['Backend Development'];
      profile.yearsOfExperience = 10;
      profile.currentRole = 'Senior Developer';
      profile.hourlyRate = 75;
      expect(profile.profileCompletion).toBe(100);
    });

    it('should return partial completion for partially filled profile', () => {
      const profile = new MentorProfile();
      profile.bio = 'Developer';
      profile.skills = ['TypeScript'];
      profile.expertiseAreas = [];
      profile.yearsOfExperience = 0;
      profile.hourlyRate = 0;
      expect(profile.profileCompletion).toBe(33);
    });
  });

  describe('default values', () => {
    it('should have correct default values', () => {
      const profile = new MentorProfile();
      expect(profile.isVerified).toBeUndefined();
      expect(profile.totalMentoringHours).toBeUndefined();
      expect(profile.averageRating).toBeUndefined();
      expect(profile.numberOfReviews).toBeUndefined();
    });
  });
});
