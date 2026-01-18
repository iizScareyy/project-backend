import ApiError from "../utils/ApiError.js";
import  asyncHandler from "../utils/asyncHandler.js"
import jwt from "jsonwebtoken"
import { User } from "../models/user.model.js"



export const verifyJWT = asyncHandler(async (req, res, next) => {
  try {
    // 1️⃣ Prefer Authorization header, fallback to cookie token
    const token =
      req.get("Authorization")?.replace("Bearer ", "") ||
      req.cookies?.accessToken;

    if (!token) {
      throw new ApiError(401, "Unauthorized request");
    }

    // 2️⃣ Verify token
    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    // 3️⃣ Fetch user
    const user = await User.findById(decodedToken?._id).select(
      "-password -refreshToken"
    );

    if (!user) {
      throw new ApiError(401, "Invalid Access Token");
    }

    // 4️⃣ Attach user to req
    req.user = user;
    next();
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid Access Token");
  }
});
