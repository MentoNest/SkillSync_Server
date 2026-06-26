import { Injectable } from '@nestjs/common';

interface ProfileFields {
  bio?: string; skills?: string[]; hourlyRate?: number;
  expertiseAreas?: string[]; avatarUrl?: string; availabilitySlots?: any[];
  learningGoals?: string[]; skillLevel?: string; areasOfInterest?: string[];
  portfolio?: string; education?: any[]; certifications?: any[];
}

@Injectable()
export class ProfileCompletenessService {
  private isPresent(value: any): boolean {
    if (value === undefined || value === null) return false;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }

  computeScore(profileType: 'mentor' | 'mentee', fields: ProfileFields): number {
    const mentorRequired = ['bio', 'skills', 'hourlyRate', 'expertiseAreas', 'avatarUrl', 'availabilitySlots'];
    const menteeRequired = ['learningGoals', 'skillLevel', 'areasOfInterest'];
    const optional = ['portfolio', 'education', 'certifications'];

    const required = profileType === 'mentor' ? mentorRequired : menteeRequired;
    const filledRequired = required.filter(f => this.isPresent(fields[f as keyof ProfileFields]));
    let score = (filledRequired.length / required.length) * 100;

    const filledOptional = optional.filter(f => this.isPresent(fields[f as keyof ProfileFields]));
    score += filledOptional.length * (10 / optional.length);

    return Math.min(Math.round(score), 110);
  }
}
