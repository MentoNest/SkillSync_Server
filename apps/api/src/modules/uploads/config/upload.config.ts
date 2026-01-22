import { registerAs } from '@nestjs/config';

export default registerAs('upload', () => ({
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880', 10), // 5MB default
  uploadDir: process.env.UPLOAD_DIR || './uploads',
}));
