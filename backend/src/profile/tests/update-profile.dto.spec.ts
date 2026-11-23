import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  UpdateProfileDto,
  ProfileTypeParamDto,
} from '../dto/update-profile.dto';
import { ProfileType } from '../dto/create-profile.dto';

async function validateDto(plain: object): Promise<string[]> {
  const dto = plainToInstance(UpdateProfileDto, plain);
  const errors = await validate(dto, { whitelist: true });
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('UpdateProfileDto', () => {
  it('trims strings and array values before validation', async () => {
    const dto = plainToInstance(UpdateProfileDto, {
      bio: '  A trimmed biography with enough characters.  ',
      skills: ['  TypeScript  ', ' NestJS '],
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.bio).toBe('A trimmed biography with enough characters.');
    expect(dto.skills).toEqual(['TypeScript', 'NestJS']);
  });

  it('allows a null value to clear nullable fields', async () => {
    expect(await validateDto({ hourlyRateUsdCents: null })).toHaveLength(0);
    expect(await validateDto({ budgetUsdCentsPerMonth: null })).toHaveLength(0);
  });

  it('rejects invalid values while allowing fields to be omitted', async () => {
    expect(await validateDto({})).toHaveLength(0);
    expect(await validateDto({ maxMentees: 0 })).not.toHaveLength(0);
    expect(await validateDto({ bio: 'short' })).not.toHaveLength(0);
    expect(await validateDto({ skills: ['   '] })).not.toHaveLength(0);
  });

  it('validates route profile types', async () => {
    expect(
      await validate(
        plainToInstance(ProfileTypeParamDto, { type: ProfileType.MENTOR }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(plainToInstance(ProfileTypeParamDto, { type: 'admin' })),
    ).not.toHaveLength(0);
  });
});
