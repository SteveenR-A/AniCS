import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "",
};

// Fallback seguro en caso de que las variables no estén presentes en builds de prueba o CI
const optionsToInit = firebaseConfig.apiKey
  ? firebaseConfig
  : {
      ...firebaseConfig,
      apiKey: "dummy-key-for-test-build",
      projectId: "anics-20677",
      appId: "1:306937777600:web:dummy",
    };

// Evita reinicializaciones múltiples en hot reload
export const firebaseApp = !getApps().length ? initializeApp(optionsToInit) : getApp();
export const firebaseAuth = getAuth(firebaseApp);
export const firestoreDb = getFirestore(firebaseApp);
