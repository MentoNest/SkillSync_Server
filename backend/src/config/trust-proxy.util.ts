/**
 * Parse the `TRUST_PROXY` environment variable into an Express-compatible
 * `trust proxy` setting.
 *
 * Express accepts `true`/`'*'`, which trust *every* proxy in front of the
 * service — attacker-controllable once one hop is untrusted. We therefore
 * only accept the explicit hop count (`1`, `2`, ...) or CIDR/address lists,
 * and reject trust-everything values outright.
 */
export function parseTrustProxy(value?: string): false | number | string {
  const setting = value?.trim();
  if (!setting || setting.toLowerCase() === 'false') return false;
  if (['true', '*', '0.0.0.0/0', '::/0'].includes(setting.toLowerCase())) {
    throw new Error(
      'TRUST_PROXY must name trusted hops or networks; trusting all proxies is unsafe',
    );
  }
  if (/^\d+$/.test(setting)) return Number(setting);
  return setting;
}
