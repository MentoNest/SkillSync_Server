import {
  calculateGeographicDistance,
  calculateTravelTime,
  isImpossibleTravel,
  isSameLocation,
} from './geolocation.utils';

describe('Geolocation Utils', () => {
  describe('calculateGeographicDistance', () => {
    it('should calculate distance between New York and London', () => {
      // New York: 40.7128, -74.0060
      // London: 51.5074, -0.1278
      const distance = calculateGeographicDistance(
        40.7128,
        -74.006,
        51.5074,
        -0.1278,
      );

      // Distance should be approximately 5570 km
      expect(distance).toBeGreaterThan(5500);
      expect(distance).toBeLessThan(5700);
    });

    it('should calculate distance between same points as 0', () => {
      const distance = calculateGeographicDistance(40.7128, -74.006, 40.7128, -74.006);

      expect(distance).toBeLessThan(0.1); // Allow for floating point error
    });

    it('should calculate distance between Lagos and London', () => {
      // Lagos: 6.5244, 3.3792
      // London: 51.5074, -0.1278
      const distance = calculateGeographicDistance(
        6.5244,
        3.3792,
        51.5074,
        -0.1278,
      );

      // Distance should be approximately 4700 km
      expect(distance).toBeGreaterThan(4600);
      expect(distance).toBeLessThan(4800);
    });

    it('should be symmetric', () => {
      const distance1 = calculateGeographicDistance(
        40.7128,
        -74.006,
        51.5074,
        -0.1278,
      );
      const distance2 = calculateGeographicDistance(
        51.5074,
        -0.1278,
        40.7128,
        -74.006,
      );

      expect(Math.abs(distance1 - distance2)).toBeLessThan(0.1);
    });
  });

  describe('calculateTravelTime', () => {
    it('should calculate travel time for NY to London distance', () => {
      const distance = 5571; // km
      const travelTime = calculateTravelTime(distance);

      // At 900 km/h: 5571/900 = 6.19 hours = 371 minutes
      expect(travelTime).toBeGreaterThan(360);
      expect(travelTime).toBeLessThan(380);
    });

    it('should calculate 0 minutes for 0 distance', () => {
      const travelTime = calculateTravelTime(0);
      expect(travelTime).toBe(0);
    });

    it('should be proportional to distance', () => {
      const time1 = calculateTravelTime(900); // 1 hour
      const time2 = calculateTravelTime(1800); // 2 hours

      expect(time2).toBeCloseTo(time1 * 2, 1);
    });
  });

  describe('isImpossibleTravel', () => {
    it('should detect impossible travel from NY to London in 1 hour', () => {
      const isImpossible = isImpossibleTravel(
        40.7128,
        -74.006, // New York
        51.5074,
        -0.1278, // London
        60, // 1 hour
      );

      expect(isImpossible).toBe(true);
    });

    it('should allow travel from NY to London in 8 hours', () => {
      const isImpossible = isImpossibleTravel(
        40.7128,
        -74.006, // New York
        51.5074,
        -0.1278, // London
        480, // 8 hours
      );

      expect(isImpossible).toBe(false);
    });

    it('should allow travel from Lagos to London in 6 hours', () => {
      const isImpossible = isImpossibleTravel(
        6.5244,
        3.3792, // Lagos
        51.5074,
        -0.1278, // London
        360, // 6 hours
      );

      expect(isImpossible).toBe(false);
    });

    it('should detect impossible travel from Lagos to London in 30 minutes', () => {
      const isImpossible = isImpossibleTravel(
        6.5244,
        3.3792, // Lagos
        51.5074,
        -0.1278, // London
        30, // 30 minutes
      );

      expect(isImpossible).toBe(true);
    });

    it('should not flag travel less than 1 minute', () => {
      const isImpossible = isImpossibleTravel(
        40.7128,
        -74.006,
        51.5074,
        -0.1278,
        0.5, // Less than 1 minute
      );

      expect(isImpossible).toBe(false);
    });

    it('should respect custom travel speed', () => {
      const isImpossible = isImpossibleTravel(
        40.7128,
        -74.006,
        51.5074,
        -0.1278,
        120, // 2 hours
        2000, // 2000 km/h (faster than commercial flight)
      );

      expect(isImpossible).toBe(false);
    });
  });

  describe('isSameLocation', () => {
    it('should return true for same location', () => {
      const isSame = isSameLocation(
        40.7128,
        -74.006,
        40.7128,
        -74.006,
        50, // 50 km radius
      );

      expect(isSame).toBe(true);
    });

    it('should return true for nearby locations within radius', () => {
      // Two points about 1 km apart in NYC
      const isSame = isSameLocation(
        40.7128,
        -74.006, // Empire State Building
        40.7141,
        -74.0054, // Times Square (approx 1 km away)
        50, // 50 km radius
      );

      expect(isSame).toBe(true);
    });

    it('should return false for distant locations', () => {
      const isSame = isSameLocation(
        40.7128,
        -74.006, // New York
        51.5074,
        -0.1278, // London
        50, // 50 km radius
      );

      expect(isSame).toBe(false);
    });

    it('should respect custom radius', () => {
      const distance = calculateGeographicDistance(
        40.7128,
        -74.006,
        51.5074,
        -0.1278,
      );

      // With radius smaller than distance
      const isSame1 = isSameLocation(
        40.7128,
        -74.006,
        51.5074,
        -0.1278,
        1000, // 1000 km
      );
      expect(isSame1).toBe(false);

      // With radius larger than distance
      const isSame2 = isSameLocation(
        40.7128,
        -74.006,
        51.5074,
        -0.1278,
        10000, // 10000 km
      );
      expect(isSame2).toBe(true);
    });

    it('should default to 50 km radius', () => {
      // Lagos and Ibadan are about 100 km apart
      const isSame = isSameLocation(
        6.5244,
        3.3792, // Lagos
        6.5755,
        5.5592, // Ibadan (approx 100 km away)
      );

      expect(isSame).toBe(false); // Outside default 50 km radius
    });
  });

  describe('Performance', () => {
    it('should calculate distance < 1ms', () => {
      const startTime = performance.now();
      for (let i = 0; i < 100; i++) {
        calculateGeographicDistance(40.7128, -74.006, 51.5074, -0.1278);
      }
      const endTime = performance.now();

      const avgTime = (endTime - startTime) / 100;
      expect(avgTime).toBeLessThan(1);
    });

    it('should check impossible travel < 1ms', () => {
      const startTime = performance.now();
      for (let i = 0; i < 100; i++) {
        isImpossibleTravel(40.7128, -74.006, 51.5074, -0.1278, 60);
      }
      const endTime = performance.now();

      const avgTime = (endTime - startTime) / 100;
      expect(avgTime).toBeLessThan(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle coordinates at North Pole', () => {
      const distance = calculateGeographicDistance(
        90, // North Pole
        0,
        45, // Mid-latitude
        0,
      );

      expect(distance).toBeGreaterThan(4999); // ~5000 km
      expect(distance).toBeLessThan(5002);
    });

    it('should handle coordinates at South Pole', () => {
      const distance = calculateGeographicDistance(
        -90, // South Pole
        0,
        -45, // Mid-latitude
        0,
      );

      expect(distance).toBeGreaterThan(4999);
      expect(distance).toBeLessThan(5002);
    });

    it('should handle dateline crossing', () => {
      const distance = calculateGeographicDistance(
        0, // Equator
        179.9, // Just before dateline
        0, // Equator
        -179.9, // Just after dateline
      );

      // Should be very small distance (about 22 km)
      expect(distance).toBeLessThan(100);
    });

    it('should handle same latitude different longitudes', () => {
      const distance = calculateGeographicDistance(
        0, // Equator
        0, // Prime Meridian
        0, // Equator
        1, // 1 degree east
      );

      // At equator, 1 degree ≈ 111 km
      expect(distance).toBeGreaterThan(110);
      expect(distance).toBeLessThan(112);
    });
  });
});
