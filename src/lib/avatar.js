// Patients are represented by name initials, never by a stock photograph.
//
// Accounts created before that change still carry the old photo URL on their
// profile document and inside the patient snapshot stored on old messages.
// Rewriting every stored copy would need a migration and would still miss any
// document written before it ran, so the retired URL is instead filtered out
// wherever a photo is read back. Anything else is passed through untouched.
const RETIRED_STOCK_PHOTOS = [
  'photo-1544005313-94ddf0286df2', // patient photos
  'photo-1534528741775-53994a69daeb', // admin photo
];

export function usableAvatar(url) {
  const value = String(url ?? '').trim();
  if (!value) return '';
  return RETIRED_STOCK_PHOTOS.some((id) => value.includes(id)) ? '' : value;
}