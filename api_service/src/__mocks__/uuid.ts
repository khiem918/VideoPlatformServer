// Seeded from wall-clock time (rather than always restarting at 0) so that
// IDs don't collide with rows left behind by a prior test run that was
// killed before its own cleanup ran (e.g. Ctrl-C on a long e2e suite).
let counter = BigInt(Date.now() % 900_000_000_000);

export function v4(): string {
  counter += 1n;
  return `00000000-0000-4000-8000-${counter.toString().padStart(12, '0')}`;
}
