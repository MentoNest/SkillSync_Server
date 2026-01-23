import {
  Controller,
  Get,
  Patch,
  Query,
  Param,
  UseGuards,
  Req,
} from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { NotificationsGateway } from "./notifications.gateway";
import { ListNotificationsDto } from "./dto/list-notifications.dto";

// Mock guard - replace with your actual auth guard
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller("notifications")
// @UseGuards(JwtAuthGuard) // Uncomment when you have auth setup
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  /**
   * GET /notifications
   * List all notifications for authenticated user (paginated)
   */
  @Get()
  async findAll(@Req() req: any, @Query() query: ListNotificationsDto) {
    // Extract userId from authenticated user
    // const userId = req.user.id;
    const userId = req.headers["x-user-id"] || "test-user-id"; // Mock for demo

    return this.notificationsService.findAll(userId, query);
  }

  /**
   * GET /notifications/unread-count
   * Get count of unread notifications
   */
  @Get("unread-count")
  async getUnreadCount(@Req() req: any) {
    const userId = req.headers["x-user-id"] || "test-user-id";
    const count = await this.notificationsService.getUnreadCount(userId);
    return { count };
  }

  /**
   * PATCH /notifications/:id/read
   * Mark single notification as read
   */
  @Patch(":id/read")
  async markAsRead(@Req() req: any, @Param("id") id: string) {
    const userId = req.headers["x-user-id"] || "test-user-id";
    const notification = await this.notificationsService.markAsRead(userId, id);

    // Push updated unread count via WebSocket
    const unreadCount = await this.notificationsService.getUnreadCount(userId);
    this.notificationsGateway.pushUnreadCount(userId, unreadCount);

    return notification;
  }

  /**
   * PATCH /notifications/read-all
   * Mark all notifications as read
   */
  @Patch("read-all")
  async markAllAsRead(@Req() req: any) {
    const userId = req.headers["x-user-id"] || "test-user-id";
    const result = await this.notificationsService.markAllAsRead(userId);

    // Push updated unread count via WebSocket
    this.notificationsGateway.pushUnreadCount(userId, 0);

    return result;
  }
}
