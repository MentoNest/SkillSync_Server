import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as request from 'supertest';
import { SessionsController } from '../sessions.controller';
import { SessionsService } from '../sessions.service';
import { Session, SessionStatus } from '../entities/session.entity';
import { Booking, BookingStatus } from '../../bookings/entities/booking.entity';

describe('Sessions E2E', () => {
  let app: INestApplication;
  let sessionsService: SessionsService;
  let sessionRepository: Repository<Session>;
  let bookingRepository: Repository<Booking>;

  const mockMentorProfileId = '550e8400-e29b-41d4-a716-446655440002';
  const mockMenteeUserId = '550e8400-e29b-41d4-a716-446655440003';
  const mockSessionId = '550e8400-e29b-41d4-a716-446655440000';

  const mockSession = {
    id: mockSessionId,
    bookingId: '550e8400-e29b-41d4-a716-446655440001',
    mentorProfileId: mockMentorProfileId,
    menteeUserId: mockMenteeUserId,
    startTime: new Date('2026-01-22T10:00:00Z'),
    endTime: new Date('2026-01-22T11:00:00Z'),
    status: SessionStatus.SCHEDULED,
    notes: null,
    metadata: null,
    createdAt: new Date('2026-01-22T08:00:00Z'),
    updatedAt: new Date('2026-01-22T08:00:00Z'),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SessionsController],
      providers: [
        SessionsService,
        {
          provide: getRepositoryToken(Session),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Booking),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    sessionsService = moduleFixture.get<SessionsService>(SessionsService);
    sessionRepository = moduleFixture.get<Repository<Session>>(
      getRepositoryToken(Session),
    );
    bookingRepository = moduleFixture.get<Repository<Booking>>(
      getRepositoryToken(Booking),
    );
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /sessions/:id/start (Mentee)', () => {
    it('should allow mentee to start a session', async () => {
      const startedSession = {
        ...mockSession,
        status: SessionStatus.IN_PROGRESS,
      };

      jest
        .spyOn(sessionsService, 'startSession')
        .mockResolvedValue(startedSession);

      const response = await request(app.getHttpServer())
        .patch(`/sessions/${mockSessionId}/start`)
        .set('x-user-id', mockMenteeUserId)
        .expect(200);

      expect(response.body.status).toBe(SessionStatus.IN_PROGRESS);
    });

    it('should prevent unauthorized mentee from starting session', async () => {
      jest
        .spyOn(sessionsService, 'startSession')
        .mockRejectedValue(new Error('Forbidden'));

      await request(app.getHttpServer())
        .patch(`/sessions/${mockSessionId}/start`)
        .set('x-user-id', '550e8400-e29b-41d4-a716-446655440099')
        .expect(500); // Error is thrown by service
    });
  });

  describe('PATCH /sessions/:id/complete (Mentor Only)', () => {
    it('should allow mentor to complete a session', async () => {
      const completedSession = {
        ...mockSession,
        status: SessionStatus.IN_PROGRESS,
      };

      jest.spyOn(sessionsService, 'completeSession').mockResolvedValue({
        ...completedSession,
        status: SessionStatus.COMPLETED,
      });

      const response = await request(app.getHttpServer())
        .patch(`/sessions/${mockSessionId}/complete`)
        .set('x-mentor-profile-id', mockMentorProfileId)
        .expect(200);

      expect(response.body.status).toBe(SessionStatus.COMPLETED);
    });

    it('should prevent non-mentor from completing session', async () => {
      await request(app.getHttpServer())
        .patch(`/sessions/${mockSessionId}/complete`)
        .expect(401); // No mentor header provided
    });
  });

  describe('GET /sessions/mentee/:id', () => {
    it('should allow mentee to retrieve their session', async () => {
      jest
        .spyOn(sessionsService, 'findMenteeSession')
        .mockResolvedValue([mockSession]);

      const response = await request(app.getHttpServer())
        .get(`/sessions/mentee/${mockSessionId}`)
        .set('x-user-id', mockMenteeUserId)
        .expect(200);

      expect(response.body.id).toBe(mockSessionId);
    });

    it('should prevent mentee from accessing other mentee sessions', async () => {
      jest.spyOn(sessionsService, 'findMenteeSession').mockResolvedValue([]);

      await request(app.getHttpServer())
        .get(`/sessions/mentee/${mockSessionId}`)
        .set('x-user-id', '550e8400-e29b-41d4-a716-446655440099')
        .expect(400);
    });
  });

  describe('GET /sessions/mentor/:id', () => {
    it('should allow mentor to retrieve their session', async () => {
      jest
        .spyOn(sessionsService, 'findMentorSession')
        .mockResolvedValue([mockSession]);

      const response = await request(app.getHttpServer())
        .get(`/sessions/mentor/${mockSessionId}`)
        .set('x-mentor-profile-id', mockMentorProfileId)
        .expect(200);

      expect(response.body.id).toBe(mockSessionId);
    });

    it('should prevent mentor from accessing other mentor sessions', async () => {
      jest.spyOn(sessionsService, 'findMentorSession').mockResolvedValue([]);

      await request(app.getHttpServer())
        .get(`/sessions/mentor/${mockSessionId}`)
        .set('x-mentor-profile-id', '550e8400-e29b-41d4-a716-446655440099')
        .expect(400);
    });
  });

  describe('GET /sessions/mentee/my-sessions', () => {
    it('should return all sessions for mentee', async () => {
      jest
        .spyOn(sessionsService, 'findMenteeSession')
        .mockResolvedValue([mockSession]);

      const response = await request(app.getHttpServer())
        .get('/sessions/mentee/my-sessions')
        .set('x-user-id', mockMenteeUserId)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body[0].id).toBe(mockSessionId);
    });
  });

  describe('GET /sessions/mentor/my-sessions', () => {
    it('should return all sessions for mentor', async () => {
      jest
        .spyOn(sessionsService, 'findMentorSession')
        .mockResolvedValue([mockSession]);

      const response = await request(app.getHttpServer())
        .get('/sessions/mentor/my-sessions')
        .set('x-mentor-profile-id', mockMentorProfileId)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body[0].id).toBe(mockSessionId);
    });
  });
});
