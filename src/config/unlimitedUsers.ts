/**
 * Unlimited Users Configuration File
 * 
 * Users configured here will NOT be subject to:
 * 1. Task posting limit (currently capped at 1 active task per user)
 * 2. Broadcast cooldown limit (currently 30 seconds)
 * 3. Broadcast hourly limit (currently 10 broadcasts per hour)
 * 
 * You can specify these exempt users by their unique Firebase Auth UID or by their Email Address.
 */

// Add Firebase Auth User UIDs that should be exempt from any limits
export const UNLIMITED_UIDS: string[] = [
  // Example format: "some-user-uid-abc-123",
];

// Add Email Addresses that should be exempt from any limits (case-insensitive)
export const UNLIMITED_EMAILS: string[] = [
  "eating080924@gmail.com",
  "very790804@gmail.com",
  "ooi12361@gmail.com",
  "a0939633109@gmail.com" // Main administrator or tester
];

/**
 * Helper function to check if a user is exempt from all limits
 * @param uid - User UID from Firebase Auth
 * @param email - User Email address from Firebase Auth
 * @returns boolean - true if the user has unlimited permissions, false otherwise
 */
export function isUserUnlimited(uid?: string | null, email?: string | null): boolean {
  if (!uid && !email) return false;

  // Check UID whitelist
  if (uid && UNLIMITED_UIDS.includes(uid)) {
    return true;
  }

  // Check Email whitelist (case-insensitive and trimmed)
  if (email) {
    const formattedEmail = email.toLowerCase().trim();
    if (UNLIMITED_EMAILS.map(e => e.toLowerCase().trim()).includes(formattedEmail)) {
      return true;
    }
  }

  return false;
}
