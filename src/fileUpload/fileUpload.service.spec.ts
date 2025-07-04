import { BadRequestException } from '@nestjs/common';
import { FileUploadService } from './fileUpload.service';
import { Test, TestingModule } from '@nestjs/testing';

const mockCloudinary = {
  uploader: {
    upload: jest.fn(),
  },
};

describe('FileUploadService', () => {
  let service: FileUploadService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileUploadService,
        { provide: 'CLOUDINARY', useValue: mockCloudinary },
      ],
    }).compile();

    service = module.get<FileUploadService>(FileUploadService);
  });

  it('should throw error if no file uploaded', async () => {
    await expect(service.uploadImage(null)).rejects.toThrow(
      BadRequestException,
    );
  });
});
