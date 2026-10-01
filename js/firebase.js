import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyADvua1E38EI59IM_sT7-xbftnuN7TFopA',
  authDomain: 'phuket-donghood.firebaseapp.com',
  projectId: 'phuket-donghood',
  storageBucket: 'phuket-donghood.firebasestorage.app',
  messagingSenderId: '866873070397',
  appId: '1:866873070397:web:7a7a605198c6e56137eb54',
  measurementId: 'G-1J6Q69E9RW',
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);

let _auth = null;
export function getFirebaseAuth() {
  if (!_auth) _auth = getAuth(app);
  return _auth;
}
