import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider, 
  FacebookAuthProvider,
  signOut, 
  User 
} from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { isInAppBrowser, isMobileDevice } from './detector';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (providerType?: 'google' | 'facebook') => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for redirect result when the page loads (handles redirect sign-in login on mobile)
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          console.log('Successfully signed in via redirect:', result.user);
        }
      })
      .catch((error) => {
        console.error('Redirect sign-in error:', error);
      });

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Sync user profile to Firestore
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userRef);
          
          if (!userDoc.exists()) {
            await setDoc(userRef, {
              displayName: firebaseUser.displayName || '匿名用戶',
              photoURL: firebaseUser.photoURL,
              createdAt: serverTimestamp(),
            });
          }
        } catch (error) {
          console.warn('Firestore profile sync skipped/failed (offline mode or permission issue):', error);
        }
        setUser(firebaseUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (providerType: 'google' | 'facebook' = 'google') => {
    const provider = providerType === 'facebook' 
      ? new FacebookAuthProvider() 
      : new GoogleAuthProvider();
    
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                  (navigator.userAgent.includes("Mac") && "ontouchend" in document);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const isiOSOrSafari = isIOS || isSafari;
    const isWebview = isInAppBrowser();
    const isMobile = isMobileDevice();
    const isStandalone = typeof window !== 'undefined' && (
      window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as any).standalone === true
    );

    // 1. If inside an App's In-App Browser (LINE, Webview, Facebook App, WeChat, etc.)
    // signInWithPopup is guaranteed to hang, freeze, or fail because popups are blocked/unsupported.
    // Also, redirects inside Webviews will lose state on redirect due to third-party cookie/storage blocking.
    if (isWebview) {
      console.warn('Detect In-App Browser (FB/LINE/IG etc.). Disallowing popup, alerting user for best practices.');
      alert(
        '【重要登入提示】\n' +
        '您目前正在使用 LINE、Facebook 或 Instagram 等 App 內建瀏覽器。\n\n' +
        '因 App 安全限制與 Cookie 限制，社群登入（Google / FB）會被機制阻擋而無法正常完成（導致網頁重置或卡死）。\n\n' +
        '【解決方法】\n' +
        '請點擊畫面右上方（iOS 點右上角「...」、Android 點右上角「...」或外部瀏覽器圖示）的選單，選擇「用預設瀏覽器開啟」或「在 Safari / Chrome 中開啟」，開啟後即可順利登入且不遺失狀態！'
      );
      
      // Still trigger redirect in background just in case, but warn them
      try {
        await signInWithRedirect(auth, provider);
      } catch (redirectError) {
        console.error('In-App Redirect error:', redirectError);
      }
      return;
    }

    // 2. Mobile devices or PWA Standalone Mode
    // signInWithRedirect is the industry standard and most robust method.
    // Popups are highly unstable, frequently blocked, and do not persist session properly on mobile browsers or installed PWAs.
    if (isMobile || isStandalone) {
      console.log(`[PWA/Mobile] Directly triggering signInWithRedirect for ${providerType}...`);
      try {
        await signInWithRedirect(auth, provider);
      } catch (redirectError) {
        console.error(`${providerType} Mobile Redirect Sign-in error:`, redirectError);
        // Resilient fallback: try popup if redirect was somehow blocked or failed to load
        try {
          await signInWithPopup(auth, provider);
        } catch (popupError: any) {
          console.error(`${providerType} Mobile Fallback Popup Sign-in error:`, popupError);
          alert(`登入失敗，請確認是否允許彈出視窗後重試，或嘗試使用其他瀏覽器開啟網站。\n(錯誤: ${popupError.message || popupError})`);
        }
      }
      return;
    }

    // 3. Desktop browsers
    // Prefer signInWithPopup first for optimal, non-reloading UX.
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.warn(`${providerType} popup sign-in error:`, error);
      
      const errorCode = error?.code;
      // If the user closed the popup, cancelled, or it's a cancellation error, DO NOT redirect.
      if (
        errorCode === 'auth/popup-closed-by-user' || 
        errorCode === 'auth/cancelled-popup-request' ||
        errorCode === 'auth/user-cancelled'
      ) {
        console.log('Sign-in cancelled by user. Skipping redirect.');
        return;
      }

      // If popup fails or is blocked on desktop, fallback to redirect
      console.log('Falling back to signInWithRedirect on desktop...');
      try {
        await signInWithRedirect(auth, provider);
      } catch (redirectError: any) {
        console.error(`${providerType} Desktop Redirect Sign-in fallback error:`, redirectError);
        if (errorCode === 'auth/popup-blocked' || errorCode === 'auth/web-storage-unsupported') {
          alert(
            providerType === 'facebook'
              ? '由於您使用的瀏覽器限制（例如彈出視窗與第三方 Cookie 阻擋），Facebook 登入彈出視窗被封鎖了。請嘗試「允許此來源的彈出視窗」，或點選重新載入重導向。'
              : '由於瀏覽器限制，登入彈出視窗被攔截了。請嘗試「允許此來源的彈出視窗」以完成登入。'
          );
        } else {
          alert(`登入失敗，請確認是否允許彈出視窗與第三方 Cookie：${redirectError.message || redirectError}`);
        }
      }
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
