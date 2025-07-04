
import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { UploadApiResponse } from 'cloudinary';
import { v2 as Cloudinary } from 'cloudinary';

@Injectable()
export class FileUploadService {
  constructor(@Inject('CLOUDINARY') private cloudinary: typeof Cloudinary) {}

  async uploadImage(file: Express.Multer.File): Promise<UploadApiResponse> {
    if (!file) throw new BadRequestException('No file uploaded');

    return new Promise((resolve, reject) => {
      this.cloudinary.uploader
        .upload_stream(
          {
            folder: 'profile_images',
            resource_type: 'image',
          },
          (error, result) => {
            if (error)
              return reject(new BadRequestException('Image upload failed'));
            resolve(result);
          },
        )
        .end(file.buffer);
    });
  }
}
