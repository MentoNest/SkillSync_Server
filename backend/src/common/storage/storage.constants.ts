import { BadRequestException } from '@nestjs/common';
import { basename } from 'path';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const ATTACHMENT_MIME_TYPES: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
};

export interface AttachmentFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface ValidatedAttachment {
  name: string;
  mimeType: string;
  size: number;
  extension: string;
}

export function validateAttachment(
  file: AttachmentFile | undefined,
): ValidatedAttachment {
  if (!file) throw new BadRequestException('No file uploaded');
  const extension = ATTACHMENT_MIME_TYPES[file.mimetype];
  if (!extension) {
    throw new BadRequestException(
      'Unsupported file type: images, PDF, text and Word documents only',
    );
  }
  if (!file.buffer || file.buffer.length === 0)
    throw new BadRequestException('Uploaded file is empty');
  if (file.size > MAX_ATTACHMENT_BYTES)
    throw new BadRequestException('Attachments are limited to 10MB');

  const originalName = basename(
    file.originalname || `attachment.${extension}`,
  ).slice(0, 255);
  return {
    name: originalName || `attachment.${extension}`,
    mimeType: file.mimetype,
    size: file.size,
    extension,
  };
}
