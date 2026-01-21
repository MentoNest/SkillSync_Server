export class DateUtil {
  static getCurrentTimestamp(): number {
    return Date.now();
  }

  static formatDate(date: Date): string {
    return date.toISOString();
  }
}