import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDJzeY9-2fNut_c5GKUQTuPZY5zVoWPlLI",
  authDomain: "anistreamlivechate-d6739.firebaseapp.com",
  databaseURL: "https://anistreamlivechate-d6739-default-rtdb.firebaseio.com",
  projectId: "anistreamlivechate-d6739",
  storageBucket: "anistreamlivechate-d6739.firebasestorage.app",
  messagingSenderId: "1037965971893",
  appId: "1:1037965971893:web:5e83104d14c17b9cff89fc"
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
