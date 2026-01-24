import { Test, TestingModule } from '@nestjs/testing';
import { MentorsProfileController } from './mentors-profile.controller';
import { MentorsProfileService } from './mentors-profile.service';

describe('MentorsProfileController', () => {
  let controller: MentorsProfileController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MentorsProfileController],
      providers: [MentorsProfileService],
    }).compile();

    controller = module.get<MentorsProfileController>(MentorsProfileController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
