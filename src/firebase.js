import { initializeApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBh2sS_pEonxJ4E1e8Z2I2253xAjfntU_Y",
  authDomain: "iron-light-planner.firebaseapp.com",
  projectId: "iron-light-planner",
  storageBucket: "iron-light-planner.firebasestorage.app",
  messagingSenderId: "970543120163",
  appId: "1:970543120163:web:a36b0676d3849c6b1b5696"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

enableIndexedDbPersistence(db).catch(() => {});
