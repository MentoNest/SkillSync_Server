import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ProfilesController } from './profiles.controller.js';
import { ProfilesService } from './profiles.service.js';

describe('ProfilesController', () => {
  let controller: ProfilesController;

  const mockProfilesService = {
    getPublicProfile: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfilesController],
      providers: [{ provide: ProfilesService, useValue: mockProfilesService }],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProfilesController>(ProfilesController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return the public profile for the given userId', async () => {
    const expected = { userId: 'user-1', profileType: 'mentor' };
    mockProfilesService.getPublicProfile.mockResolvedValue(expected);

    const result = await controller.getPublicProfile('user-1');

    expect(result).toEqual(expected);
    expect(mockProfilesService.getPublicProfile).toHaveBeenCalledWith('user-1');
  });
});
