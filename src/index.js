import mongoose from "mongoose";
import connectDB from "./db/index.js";
import { app } from "./app.js";

console.log("INDEX FILE RUNNING ✅");
console.log("cors:", process.env.CORS_ORIGIN);

const PORT = process.env.PORT || 8000;

connectDB()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server is running at port : ${PORT}`);
    });
  })
  .catch((err) => {
    console.log("MongoDB conn failed !!", err);
  });
