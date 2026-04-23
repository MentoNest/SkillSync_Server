/**
 * IP Geolocation Response structure
 */
export interface GeoLocation {
  country: string;
  city?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  isp?: string;
}

/**
 * Calculates the great-circle distance between two points on Earth using the Haversine formula
 * Returns distance in kilometers
 * 
 * @param lat1 Latitude of first point
 * @param lon1 Longitude of first point
 * @param lat2 Latitude of second point
 * @param lon2 Longitude of second point
 * @returns Distance in kilometers
 */
export function calculateGeographicDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in kilometers

  return distance;
}

/**
 * Calculates time required to travel between two geographic points
 * Assumes maximum travel speed of 900 km/h (commercial flight speed)
 * 
 * @param distance Distance in kilometers
 * @returns Time required in minutes
 */
export function calculateTravelTime(distance: number): number {
  const maxTravelSpeed = 900; // km/h (commercial flight)
  const travelTimeHours = distance / maxTravelSpeed;
  return travelTimeHours * 60; // Convert to minutes
}

/**
 * Detects if geographic distance between two login points is suspicious
 * (indicates impossibly fast travel)
 * 
 * @param lat1 Latitude of first location
 * @param lon1 Longitude of first location
 * @param lat2 Latitude of second location
 * @param lon2 Longitude of second location
 * @param timeDiffMinutes Time difference between logins in minutes
 * @param maxTravelSpeed Maximum reasonable travel speed (km/h), default 900
 * @returns true if travel is impossibly fast
 */
export function isImpossibleTravel(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  timeDiffMinutes: number,
  maxTravelSpeed: number = 900,
): boolean {
  if (timeDiffMinutes <= 0 || timeDiffMinutes < 1) return false;

  const distance = calculateGeographicDistance(lat1, lon1, lat2, lon2);
  const requiredTravelSpeed = (distance / timeDiffMinutes) * 60; // km/h

  return requiredTravelSpeed > maxTravelSpeed;
}

/**
 * Mock IP geolocation function
 * In production, use a real geolocation service like MaxMind GeoIP2, IP2Location, or ipstack
 * 
 * @param ipAddress IP address to geolocate
 * @returns Geolocation data
 */
export async function geolocateIP(ipAddress: string): Promise<GeoLocation> {
  // Mock implementation - replace with actual geolocation service
  // Example with ipstack API:
  // const response = await fetch(`http://api.ipstack.com/${ipAddress}?access_key=${ACCESS_KEY}`);
  // return response.json();

  // Mock data for demonstration
  const mockData: Record<string, GeoLocation> = {
    '192.168.1.1': {
      country: 'United States',
      city: 'New York',
      latitude: 40.7128,
      longitude: -74.006,
      timezone: 'America/New_York',
    },
    '203.0.113.1': {
      country: 'Nigeria',
      city: 'Lagos',
      latitude: 6.5244,
      longitude: 3.3792,
      timezone: 'Africa/Lagos',
    },
    '198.51.100.1': {
      country: 'United Kingdom',
      city: 'London',
      latitude: 51.5074,
      longitude: -0.1278,
      timezone: 'Europe/London',
    },
  };

  // Return mock data or default location
  return (
    mockData[ipAddress] || {
      country: 'Unknown',
      latitude: 0,
      longitude: 0,
    }
  );
}

/**
 * Compares two geolocation points and returns similarity score
 * Used to detect if a login is from a known location
 * 
 * @param lat1 Latitude of known location
 * @param lon1 Longitude of known location
 * @param lat2 Latitude of new location
 * @param lon2 Longitude of new location
 * @param radiusKm Radius in km to consider as "same location"
 * @returns true if locations are within radius
 */
export function isSameLocation(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  radiusKm: number = 50,
): boolean {
  const distance = calculateGeographicDistance(lat1, lon1, lat2, lon2);
  return distance <= radiusKm;
}
