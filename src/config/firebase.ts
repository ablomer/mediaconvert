// Import the functions you need
import { initializeApp } from "firebase/app";
import { getAnalytics, logEvent } from "firebase/analytics";

// Configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Analytics helper functions
export const logAppOpen = () => {
  logEvent(analytics, 'page_view');
};

export const logConversionEvent = (eventName: string, params: {
  from_format: string;
  to_format: string;
  file_size?: number;
  error_message?: string;
  duration_ms?: number;
}) => {
  logEvent(analytics, eventName, params);
};

export { app, analytics }; 