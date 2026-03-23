import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, DataSource } from 'typeorm';
import {
  SkillPopularityDaily,
  PopularityEventType,
} from '../entities/skill-popularity-daily.entity';

export interface PopularityScore {
  skillId: number;
  totalEvents: number;
  weightedScore: number;
  eventBreakdown: Record<PopularityEventType, number>;
}

export interface TrendingSkill {
  skillId: number;
  skillName: string;
  score: number;
  rank: number;
}

@Injectable()
export class SkillPopularityService {
  private readonly logger = new Logger(SkillPopularityService.name);

  constructor(
    @InjectRepository(SkillPopularityDaily)
    private popularityRepo: Repository<SkillPopularityDaily>,
    private dataSource: DataSource,
  ) {}

  /**
   * Get today's date at midnight (for daily aggregation)
   */
  private getToday(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  /**
   * Increment counter for a skill event (idempotent using upsert)
   * @param skillId - The skill ID
   * @param eventType - Type of event
   * @param idempotencyKey - Optional key for idempotent increments
   */
  async incrementCounter(
    skillId: number,
    eventType: PopularityEventType,
    idempotencyKey?: string,
  ): Promise<SkillPopularityDaily> {
    const today = this.getToday();

    // Use upsert for atomic increment (idempotent)
    // If record exists, increment count; otherwise create with count=1
    const result = await this.popularityRepo
      .createQueryBuilder()
      .insert()
      .into(SkillPopularityDaily)
      .values({
        skillId,
        date: today,
        eventType,
        count: 1,
      })
      .orUpdate(['count = count + 1'], ['skillId', 'date', 'eventType'])
      .execute();

    // Fetch and return the updated record
    const record = await this.popularityRepo.findOne({
      where: { skillId, date: today, eventType },
    });

    this.logger.debug(
      `Incremented ${eventType} for skill ${skillId}: count=${record?.count}`,
    );

    return record!;
  }

  /**
   * Batch increment multiple skill counters (efficient for bulk operations)
   */
  async batchIncrement(
    increments: Array<{ skillId: number; eventType: PopularityEventType }>,
  ): Promise<void> {
    const today = this.getToday();

    // Group by skillId+eventType to batch updates
    const grouped = new Map<string, { skillId: number; eventType: PopularityEventType; count: number }>();

    for (const inc of increments) {
      const key = `${inc.skillId}:${inc.eventType}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.count++;
      } else {
        grouped.set(key, { ...inc, count: 1 });
      }
    }

    // Execute batch upsert
    for (const item of grouped.values()) {
      await this.dataSource
        .createQueryBuilder()
        .insert()
        .into('skill_popularity_daily')
        .values({
          skillId: item.skillId,
          date: today,
          eventType: item.eventType,
          count: item.count,
        })
        .orUpdate(['count'], ['skillId', 'date', 'eventType'])
        .setParameters({ count: item.count })
        .execute();
    }

    this.logger.debug(`Batch incremented ${increments.length} events`);
  }

  /**
   * Get popularity data for a skill within a date window
   */
  async getSkillPopularity(
    skillId: number,
    days: number = 30,
  ): Promise<SkillPopularityDaily[]> {
    const endDate = this.getToday();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);

    return this.popularityRepo.find({
      where: {
        skillId,
        date: Between(startDate, endDate),
      },
      order: { date: 'DESC' },
    });
  }

  /**
   * Calculate popularity score with exponential decay for recent activity
   * @param skillId - The skill ID
   * @param days - Number of days to consider
   * @param decayFactor - Decay factor (0-1), higher = more weight on recent events
   */
  async calculatePopularityScore(
    skillId: number,
    days: number = 30,
    decayFactor: number = 0.9,
  ): Promise<PopularityScore> {
    const data = await this.getSkillPopularity(skillId, days);
    const today = this.getToday();

    let weightedScore = 0;
    let totalEvents = 0;
    const eventBreakdown: Record<PopularityEventType, number> = {
      [PopularityEventType.SKILL_PAGE_VIEW]: 0,
      [PopularityEventType.MENTOR_SKILL_ATTACH]: 0,
      [PopularityEventType.SEARCH_CLICK]: 0,
      [PopularityEventType.PROFILE_VIEW]: 0,
    };

    for (const record of data) {
      const daysAgo = Math.floor(
        (today.getTime() - record.date.getTime()) / (1000 * 60 * 60 * 24),
      );
      const weight = Math.pow(decayFactor, daysAgo);

      weightedScore += record.count * weight;
      totalEvents += record.count;
      eventBreakdown[record.eventType] += record.count;
    }

    return {
      skillId,
      totalEvents,
      weightedScore: Math.round(weightedScore * 100) / 100,
      eventBreakdown,
    };
  }

  /**
   * Get trending skills for a time window
   * Returns skills ranked by weighted popularity score
   */
  async getTrendingSkills(
    days: number = 7,
    limit: number = 10,
    decayFactor: number = 0.9,
  ): Promise<TrendingSkill[]> {
    const endDate = this.getToday();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);

    // Query to get aggregated scores with skill names
    const query = `
      SELECT 
        sp.skill_id as "skillId",
        s.name as "skillName",
        SUM(sp.count * POWER(${decayFactor}, EXTRACT(DAY FROM (DATE '${endDate.toISOString().split('T')[0]}' - sp.date)))) as score
      FROM skill_popularity_daily sp
      JOIN skills s ON s.id = sp.skill_id
      WHERE sp.date BETWEEN $1 AND $2
      GROUP BY sp.skill_id, s.name
      ORDER BY score DESC
      LIMIT $3
    `;

    const results = await this.dataSource.query(query, [startDate, endDate, limit]);

    return results.map((row: any, index: number) => ({
      skillId: row.skillId,
      skillName: row.skillName,
      score: parseFloat(row.score) || 0,
      rank: index + 1,
    }));
  }

  /**
   * Get popularity summary for all skills (paginated)
   */
  async getAllPopularitySummary(
    days: number = 30,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: PopularityScore[]; total: number }> {
    const endDate = this.getToday();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);

    // Get unique skill IDs in the date range
    const countQuery = `
      SELECT COUNT(DISTINCT skill_id) as total
      FROM skill_popularity_daily
      WHERE date BETWEEN $1 AND $2
    `;
    const countResult = await this.dataSource.query(countQuery, [startDate, endDate]);
    const total = parseInt(countResult[0]?.total || '0');

    // Get aggregated data per skill
    const dataQuery = `
      SELECT 
        skill_id as "skillId",
        SUM(count) as "totalEvents",
        JSON_OBJECT_AGG(event_type, event_sum) as "eventBreakdown"
      FROM (
        SELECT 
          skill_id,
          event_type,
          SUM(count) as event_sum
        FROM skill_popularity_daily
        WHERE date BETWEEN $1 AND $2
        GROUP BY skill_id, event_type
      ) sub
      GROUP BY skill_id
      ORDER BY "totalEvents" DESC
      LIMIT $3 OFFSET $4
    `;

    const offset = (page - 1) * limit;
    const results = await this.dataSource.query(dataQuery, [startDate, endDate, limit, offset]);

    const data: PopularityScore[] = results.map((row: any) => ({
      skillId: row.skillId,
      totalEvents: parseInt(row.totalEvents) || 0,
      weightedScore: parseInt(row.totalEvents) || 0, // Simplified for summary
      eventBreakdown: row.eventBreakdown || {},
    }));

    return { data, total };
  }

  /**
   * Record a skill page view event
   */
  async recordPageView(skillId: number): Promise<void> {
    await this.incrementCounter(skillId, PopularityEventType.SKILL_PAGE_VIEW);
  }

  /**
   * Record a mentor-skill attachment event
   */
  async recordMentorSkillAttach(skillId: number): Promise<void> {
    await this.incrementCounter(skillId, PopularityEventType.MENTOR_SKILL_ATTACH);
  }

  /**
   * Record a search click event
   */
  async recordSearchClick(skillId: number): Promise<void> {
    await this.incrementCounter(skillId, PopularityEventType.SEARCH_CLICK);
  }

  /**
   * Record a profile view event (when viewing mentor with this skill)
   */
  async recordProfileView(skillId: number): Promise<void> {
    await this.incrementCounter(skillId, PopularityEventType.PROFILE_VIEW);
  }
}
