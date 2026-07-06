import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager, 
  memoryLocalCache, 
  getFirestore 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const isBrowser = typeof window !== 'undefined';
const isGithubPages = isBrowser && window.location.hostname.endsWith('github.io');
const customAuthDomain = (isBrowser && !isGithubPages) ? window.location.host : firebaseConfig.authDomain;

const config = {
  ...firebaseConfig,
  authDomain: customAuthDomain,
};

const app = initializeApp(config);

const isDefaultDb = !firebaseConfig.firestoreDatabaseId || firebaseConfig.firestoreDatabaseId === '(default)';
const databaseId = isDefaultDb ? undefined : firebaseConfig.firestoreDatabaseId;

let firestoreInstance;

// Detect if we are running in an iframe (e.g., AI Studio preview iframe, embedded widgets).
// In sandboxed/restricted iframe environments, third-party IndexedDB reads/writes are blocked or broken,
// which causes Firebase Firestore's internal target caching to crash asynchronously in the background.
// Defaulting to memoryCache in these contexts avoids the uncatchable "Cannot read properties of null (reading 'Te')" crash.
const isIframe = typeof window !== 'undefined' && window.self !== window.top;

try {
  if (isIframe) {
    console.log('Running in iframe sandbox. Initializing Firestore with memoryLocalCache for stability.');
    firestoreInstance = initializeFirestore(app, {
      localCache: memoryLocalCache()
    }, databaseId);
  } else {
    // Try to initialize Firestore with persistent local cache (IndexedDB)
    firestoreInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    }, databaseId);
  }
} catch (error) {
  console.warn('Failed to initialize Firestore with persistent local cache (usually due to restricted storage access):', error);
  try {
    // Fallback to memory-only cache if persistent cache setup throws an error
    firestoreInstance = initializeFirestore(app, {
      localCache: memoryLocalCache()
    }, databaseId);
  } catch (fallbackError) {
    console.warn('Failed to initialize Firestore with memoryLocalCache, falling back to basic getFirestore:', fallbackError);
    firestoreInstance = getFirestore(app, databaseId);
  }
}

export const db = firestoreInstance;
export const auth = getAuth(app);

if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.warn('Failed to configure Firebase Auth persistence:', error);
  });
}
