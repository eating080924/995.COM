export const DEFAULT_ADMIN_EMAILS = [
  'eating080924@gmail.com'
];

export function isSystemAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();
  return DEFAULT_ADMIN_EMAILS.some(adminEmail => adminEmail.toLowerCase().trim() === cleanEmail);
}
