/**
 * Detects if the current user agent is an In-App Browser (LINE, Facebook, Instagram, WeChat, etc.)
 * These webviews block popups and restrict third-party storage cookies, disrupting Firebase Auth.
 */
export function isInAppBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
  return /FBAN|FBIOS|Messenger|LINE|Instagram|MicroMessenger|WeChat/i.test(ua);
}

/**
 * Detects if the current user is on a mobile device (iOS, Android, etc.)
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
  const isAndroid = /Android/i.test(ua);
  return isIOS || isAndroid;
}
