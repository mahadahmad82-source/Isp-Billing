// ─────────────────────────────────────────────────────────────────────────
// i18n.ts — Central translation dictionary for the English/Urdu UI toggle.
//
// Usage:
//   import { t } from '../utils/i18n';
//   t('login.title', language)   // language: 'en' | 'ur'
//
// This starts with chrome-level strings (Login page, Header/profile menu,
// sidebar nav). More keys can be added over time — any key missing from
// the 'ur' dictionary automatically falls back to English, so nothing ever
// renders blank.
// ─────────────────────────────────────────────────────────────────────────

export type Language = 'en' | 'ur';

export const LANGUAGE_STORAGE_KEY = 'appLanguage';

type Dict = Record<string, string>;

const en: Dict = {
  'lang.english': 'English',
  'lang.urdu': 'Urdu',
  'lang.switchTo': 'Switch language',

  // Login page
  'login.welcomeBack': 'Welcome Back',
  'login.signInToContinue': 'Sign in to continue',
  'login.username': 'Username',
  'login.password': 'Password',
  'login.signIn': 'Sign In',
  'login.signingIn': 'Signing In...',
  'login.forgotPassword': 'Forgot Password?',
  'login.dontHaveAccount': "Don't have an account?",
  'login.signUp': 'Sign Up',
  'login.useDifferentAccount': 'Use a different account',
  'login.agentLogin': 'Agent Login',
  'login.managerLogin': 'Manager Login',

  // Header / profile dropdown
  'header.profile': 'Profile',
  'header.changePassword': 'Change Password',
  'header.settings': 'Settings',
  'header.logout': 'Logout',
  'header.language': 'Language',
  'header.notifications': 'Notifications',
  'header.toggleTheme': 'Toggle Theme',
};

const ur: Dict = {
  'lang.english': 'انگریزی',
  'lang.urdu': 'اردو',
  'lang.switchTo': 'زبان تبدیل کریں',

  // Login page
  'login.welcomeBack': 'خوش آمدید',
  'login.signInToContinue': 'جاری رکھنے کے لیے سائن ان کریں',
  'login.username': 'یوزرنیم',
  'login.password': 'پاسورڈ',
  'login.signIn': 'سائن ان',
  'login.signingIn': 'سائن ان ہو رہا ہے...',
  'login.forgotPassword': 'پاسورڈ بھول گئے؟',
  'login.dontHaveAccount': 'اکاؤنٹ نہیں ہے؟',
  'login.signUp': 'سائن اپ',
  'login.useDifferentAccount': 'دوسرا اکاؤنٹ استعمال کریں',
  'login.agentLogin': 'ایجنٹ لاگ ان',
  'login.managerLogin': 'مینیجر لاگ ان',

  // Header / profile dropdown
  'header.profile': 'پروفائل',
  'header.changePassword': 'پاسورڈ تبدیل کریں',
  'header.settings': 'سیٹنگز',
  'header.logout': 'لاگ آؤٹ',
  'header.language': 'زبان',
  'header.notifications': 'اطلاعات',
  'header.toggleTheme': 'تھیم تبدیل کریں',
};

const dictionaries: Record<Language, Dict> = { en, ur };

export function t(key: string, language: Language = 'en'): string {
  return dictionaries[language]?.[key] ?? dictionaries.en[key] ?? key;
}

// Read the last-chosen language before any account is loaded (used on the
// Login page, which renders before AppState exists).
export function getStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return stored === 'ur' ? 'ur' : 'en';
  } catch {
    return 'en';
  }
}

export function setStoredLanguage(language: Language): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // localStorage unavailable — ignore, in-memory state still works
  }
}
