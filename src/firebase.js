// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";  
// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAxBY7mkH14pnq6DNdr7Yi7bgbuevj_0zw",
  authDomain: "aviator-game-joshua.firebaseapp.com",
  projectId: "aviator-game-joshua",
  storageBucket: "aviator-game-joshua.firebasestorage.app",
  messagingSenderId: "85257667418",
  appId: "1:85257667418:web:935709f9ca2241d13fa963"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);