import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: "AIzaSyCiIOVKoThwjMnc1coLu4qVWy4XIw5zRg8",
  authDomain: "anics-20677.firebaseapp.com",
  projectId: "anics-20677",
  storageBucket: "anics-20677.firebasestorage.app",
  messagingSenderId: "306937777600",
  appId: "1:306937777600:web:9905024518d1e3ba1f4c25",
  measurementId: "G-180T1QEKFZ",
};

// Evita reinicializaciones múltiples en hot reload
export const firebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const firebaseAuth = getAuth(firebaseApp);
export const firestoreDb = getFirestore(firebaseApp);
