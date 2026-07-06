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
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('db995_user');
      if (cached) {
        try {
          return JSON.parse(cached) as User;
        } catch (e) {
          return null;
        }
      }
    }
    return null;
  });

  const [loading, setLoading] = useState(() => {
    if (typeof window !== 'undefined') {
      // If we have a cached user, we can immediately render the logged-in state without blocking loading spinners
      return !localStorage.getItem('db995_user');
    }
    return true;
  });

  useEffect(() => {
    // Check for redirect result when the page loads (handles redirect sign-in login on mobile)
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          console.log('Successfully signed in via redirect:', result.user);
          const lightUser = {
            uid: result.user.uid,
            displayName: result.user.displayName || '匿名用戶',
            photoURL: result.user.photoURL,
            email: result.user.email,
          };
          localStorage.setItem('db995_user', JSON.stringify(lightUser));
          setUser(result.user);
        }
      })
      .catch((error) => {
        console.error('Redirect sign-in error:', error);
      })
      .finally(() => {
        // Handle pending redirect status check (e.g. if we returned from Facebook but still aren't logged in due to ITP)
        if (typeof window !== 'undefined') {
          const pendingProvider = localStorage.getItem('db995_pending_redirect');
          if (pendingProvider) {
            localStorage.removeItem('db995_pending_redirect');
            // Give it a short delay to let onAuthStateChanged settle
            setTimeout(() => {
              if (!auth.currentUser) {
                alert(
                  `【${pendingProvider === 'facebook' ? 'Facebook' : 'Google'} 登入同步提示】\n\n` +
                  `您剛才使用了 ${pendingProvider === 'facebook' ? 'Facebook' : 'Google'} 登入，但因您使用的手機瀏覽器（如 iOS Safari 或部分 Chrome）啟用了「防止跨網站追蹤」或阻擋了第三方儲存空間，導致您的登入認證無法順利寫入本站。\n\n` +
                  `【強烈建議解決方法】\n` +
                  `1. 推薦使用【Google 登入】，在多數裝置與瀏覽器上最穩定且不易遺失狀態。\n` +
                  `2. 允許瀏覽器的「彈出視窗」（在點擊登入時不要封鎖彈出視窗），這樣就能免重導向、直接在安全視窗中完成登入並寫入本站！\n` +
                  `3. 您也可以至手機的「設定」->「Safari」-> 將「防止跨網站追蹤」暫時關閉，然後重新整理本網頁再次嘗試。`
                );
              }
            }, 1200);
          }
        }
      });

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const lightUser = {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName || '匿名用戶',
          photoURL: firebaseUser.photoURL,
          email: firebaseUser.email,
        };
        localStorage.setItem('db995_user', JSON.stringify(lightUser));

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
        localStorage.removeItem('db995_user');
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = (providerType: 'google' | 'facebook' = 'google'): Promise<void> => {
    const provider = providerType === 'facebook' 
      ? new FacebookAuthProvider() 
      : new GoogleAuthProvider();
    
    if (providerType === 'facebook') {
      // Set touch display mode to optimize Facebook login UI inside mobile popups!
      provider.setCustomParameters({
        display: 'touch'
      });
    }
    
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
      localStorage.setItem('db995_pending_redirect', providerType);
      return signInWithRedirect(auth, provider).catch((err) => {
        console.error('In-App Redirect error:', err);
      });
    }

    // 2. Standalone PWA Mode
    // For installed/standalone apps, popups don't behave nicely or establish cross-window state,
    // so signInWithRedirect is the most suitable approach.
    if (isStandalone) {
      console.log('[PWA Standalone] Triggering signInWithRedirect...');
      localStorage.setItem('db995_pending_redirect', providerType);
      return signInWithRedirect(auth, provider)
        .catch((redirectError: any) => {
          console.error(`${providerType} PWA Redirect Sign-in error:`, redirectError);
          // Fallback to popup if redirect fails
          return signInWithPopup(auth, provider)
            .then((result) => {
              if (result.user) {
                const lightUser = {
                  uid: result.user.uid,
                  displayName: result.user.displayName || '匿名用戶',
                  photoURL: result.user.photoURL,
                  email: result.user.email,
                };
                localStorage.setItem('db995_user', JSON.stringify(lightUser));
                setUser(result.user);
              }
            })
            .catch((popupError: any) => {
              console.error(`${providerType} PWA Fallback Popup Sign-in error:`, popupError);
              alert(`登入失敗，請確認是否允許彈出視窗後重試：${popupError.message}`);
              throw popupError;
            });
        });
    }

    // 3. Normal Mobile & Desktop browsers
    // Prefer signInWithPopup first! When triggered directly by clicking a button, mobile Safari/Chrome will open it as a popup.
    // This allows credentials to be transferred directly via window.postMessage, and written directly into
    // our first-party domain's IndexedDB. Thus, Safari's third-party ITP cookie restrictions are completely bypassed,
    // and refreshing the page will keep the user logged in perfectly!
    console.log(`[Browser] Triggering synchronous signInWithPopup for ${providerType}...`);
    return signInWithPopup(auth, provider)
      .then((result) => {
        if (result.user) {
          const lightUser = {
            uid: result.user.uid,
            displayName: result.user.displayName || '匿名用戶',
            photoURL: result.user.photoURL,
            email: result.user.email,
          };
          localStorage.setItem('db995_user', JSON.stringify(lightUser));
          setUser(result.user);
        }
      })
      .catch((error: any) => {
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

        // If popup is blocked or fails, fallback to redirect
        console.log('Falling back to signInWithRedirect...');
        localStorage.setItem('db995_pending_redirect', providerType);
        return signInWithRedirect(auth, provider)
          .catch((redirectError: any) => {
            console.error(`${providerType} Redirect fallback error:`, redirectError);
            alert(`登入失敗，請確認是否允許彈出視窗與第三方 Cookie：${redirectError.message || redirectError}`);
            throw redirectError;
          });
      });
  };

  const logout = async () => {
    try {
      localStorage.removeItem('db995_user');
      setUser(null);
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
