import { generateSlug } from './entities/service-listing.entity';

describe('Slug Generation', () => {
  describe('generateSlug function', () => {
    it('should convert to lowercase and replace spaces with hyphens', () => {
      expect(generateSlug('Advanced TypeScript Course')).toBe('advanced-typescript-course');
    });

    it('should remove special characters', () => {
      expect(generateSlug('Advanced TypeScript & JavaScript!')).toBe('advanced-typescript-javascript');
    });

    it('should collapse multiple hyphens', () => {
      expect(generateSlug('Advanced   Typescript    Course')).toBe('advanced-typescript-course');
    });

    it('should trim whitespace', () => {
      expect(generateSlug('  Advanced TypeScript   ')).toBe('advanced-typescript');
    });

    it('should handle numbers correctly', () => {
      expect(generateSlug('Top 10 Programming Tips')).toBe('top-10-programming-tips');
    });

    it('should handle mixed case', () => {
      expect(generateSlug('FULL Stack Development BOOTCAMP')).toBe('full-stack-development-bootcamp');
    });

    it('should handle apostrophes and quotes', () => {
      expect(generateSlug("John's Python Class")).toBe('johns-python-class');
    });

    it('should handle dots and slashes', () => {
      expect(generateSlug('Node.js/Express Basics')).toBe('nodejsexpress-basics');
    });

    it('should return empty string for empty input', () => {
      expect(generateSlug('')).toBe('');
    });

    it('should handle already slugged text', () => {
      expect(generateSlug('already-slugged-text')).toBe('already-slugged-text');
    });
  });
});
