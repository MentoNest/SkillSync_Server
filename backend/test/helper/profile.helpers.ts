import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';

// ─── Auth helpers ────────────────────────────────────────────────────────────

export async function registerAndLogin(
  app: INestApplication,
  overrides: Partial<RegisterPayload> = {},
): Promise<{ token: string; userId: string; user: any }> {
  const payload: RegisterPayload = {
    email: `user_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`,
    password: 'Test@1234!',
    firstName: 'Test',
    lastName: 'User',
    role: 'mentee',
    ...overrides,
  };

  const registerRes = await request(app.getHttpServer())
    .post('/auth/register')
    .send(payload)
    .expect(201);

  const loginRes = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: payload.email, password: payload.password })
    .expect(200);

  return {
    token: loginRes.body.access_token ?? loginRes.body.token,
    userId: registerRes.body.id ?? loginRes.body.user?.id,
    user: loginRes.body.user ?? registerRes.body,
  };
}

export async function registerMentor(
  app: INestApplication,
  overrides: Partial<RegisterPayload> = {},
) {
  return registerAndLogin(app, { role: 'mentor', ...overrides });
}

export async function registerMentee(
  app: INestApplication,
  overrides: Partial<RegisterPayload> = {},
) {
  return registerAndLogin(app, { role: 'mentee', ...overrides });
}

export async function registerAdmin(app: INestApplication) {
  return registerAndLogin(app, {
    email: `admin_${Date.now()}@test.com`,
    role: 'admin',
  });
}

// ─── Profile helpers ─────────────────────────────────────────────────────────

export async function createProfile(
  app: INestApplication,
  token: string,
  data: Partial<CreateProfileDto> = {},
): Promise<any> {
  const payload: CreateProfileDto = {
    bio: 'Experienced software engineer with 10+ years.',
    skills: ['TypeScript', 'Node.js', 'PostgreSQL'],
    hourlyRate: 80,
    timezone: 'UTC',
    languages: ['English'],
    ...data,
  };

  const res = await request(app.getHttpServer())
    .post('/users/profile')
    .set('Authorization', `Bearer ${token}`)
    .send(payload)
    .expect(201);

  return res.body;
}

export async function getProfile(
  app: INestApplication,
  userId: string,
  token?: string,
): Promise<request.Response> {
  const req = request(app.getHttpServer()).get(`/users/${userId}/profile`);
  if (token) req.set('Authorization', `Bearer ${token}`);
  return req;
}

export async function updateProfile(
  app: INestApplication,
  token: string,
  data: Partial<CreateProfileDto>,
): Promise<request.Response> {
  return request(app.getHttpServer())
    .patch('/users/profile')
    .set('Authorization', `Bearer ${token}`)
    .send(data);
}

// ─── File helpers ─────────────────────────────────────────────────────────────

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

export function getMockImagePath(name = 'avatar.jpg'): string {
  return path.join(FIXTURES_DIR, name);
}

export function ensureFixtures(): void {
  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }

  // Create a minimal valid JPEG (3x3 white pixel)
  const minimalJpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
      'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN' +
      'DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
      'MjIyMjL/wAARCAADAAMDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUE/8QAHhAA' +
      'AgIDAQEBAAAAAAAAAAAAAQIDBAUREiH/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAA' +
      'AAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ALt6zq2VXj0qtavHHHGioiKFVQOwAHYD2FFFAH' +
      '/Z',
    'base64',
  );

  const jpegPath = path.join(FIXTURES_DIR, 'avatar.jpg');
  if (!fs.existsSync(jpegPath)) {
    fs.writeFileSync(jpegPath, minimalJpeg);
  }

  // 1-byte oversized "image" for validation tests — real size test uses a bigger buffer
  const oversizedPath = path.join(FIXTURES_DIR, 'oversized.jpg');
  if (!fs.existsSync(oversizedPath)) {
    // 6 MB of zeros — exceeds typical 5 MB limit
    fs.writeFileSync(oversizedPath, Buffer.alloc(6 * 1024 * 1024));
  }

  // Invalid file type
  const pdfPath = path.join(FIXTURES_DIR, 'document.pdf');
  if (!fs.existsSync(pdfPath)) {
    fs.writeFileSync(pdfPath, Buffer.from('%PDF-1.4 fake'));
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RegisterPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'mentor' | 'mentee' | 'admin';
}

export interface CreateProfileDto {
  bio: string;
  skills: string[];
  hourlyRate?: number;
  timezone: string;
  languages: string[];
  linkedinUrl?: string;
  githubUrl?: string;
  websiteUrl?: string;
  yearsOfExperience?: number;
  title?: string;
  company?: string;
}