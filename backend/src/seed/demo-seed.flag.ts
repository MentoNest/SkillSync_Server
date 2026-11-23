export function isDemoSeedEnabled(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized !== 'false' && normalized !== '0';
}
