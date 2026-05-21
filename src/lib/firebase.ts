import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager, 
  memoryLocalCache, 
  getFirestore 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

const isDefaultDb = !firebaseConfig.firestoreDatabaseId || firebaseConfig.firestoreDatabaseId === '(default)';
const databaseId = isDefaultDb ? undefined : firebaseConfig.firestoreDatabaseId;

let firestoreInstance;

try {
  // Try to initialize Firestore with persistent local cache (IndexedDB)
  firestoreInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  }, databaseId);
} catch (error) {
  console.warn('Failed to initialize Firestore with persistent local cache (usually due to iframe sandbox or restricted storage access):', error);
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
