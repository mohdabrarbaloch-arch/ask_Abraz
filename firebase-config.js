// Firebase Configuration for Ask ABraz
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyDnILWYOgobal0Xji_cYpe5qlYGW2b3wgw",
    authDomain: "ask-abraz.firebaseapp.com",
    projectId: "ask-abraz",
    storageBucket: "ask-abraz.appspot.com",
    messagingSenderId: "",
    appId: ""
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Add some scopes for Google Sign-In
googleProvider.addScope('profile');
googleProvider.addScope('email');
