export const REVIEW_TIME_ZONES = ['local', 'UTC', 'Asia/Kolkata', 'America/New_York'] as const;
export type ReviewTimeZone = typeof REVIEW_TIME_ZONES[number];
export function loadReviewTimeZone(): ReviewTimeZone {
  try {
    const saved = localStorage.getItem('aiw-review-timezone');
    return REVIEW_TIME_ZONES.includes(saved as ReviewTimeZone) ? saved as ReviewTimeZone : 'local';
  } catch { return 'local'; }
}
export function saveReviewTimeZone(zone: ReviewTimeZone) {
  try { localStorage.setItem('aiw-review-timezone', zone); } catch { /* Storage is optional. */ }
}
