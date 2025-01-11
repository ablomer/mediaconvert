// Import the functions you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

// Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBbyCyn0cqTYqG9BBCy7c0O6mwnlTNME0U",
  authDomain: "media-convert-df710.firebaseapp.com",
  projectId: "media-convert-df710",
  storageBucket: "media-convert-df710.firebasestorage.app",
  messagingSenderId: "668354085456",
  appId: "1:668354085456:web:8ec60dc920fc424d1bc755",
  measurementId: "G-B7BQ8GRHM4"
};

// Initialize
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export { app, analytics }; 