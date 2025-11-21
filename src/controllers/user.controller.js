import  asyncHandler  from "../utils/asyncHandler.js"
import ApiError from "../utils/ApiError.js";
import { User } from  "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import ApiResponse from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken"
import mongoose from "mongoose"

const generateAccessAndRefreshTokens = async(userId)=>{
    try{
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({validateBeforeSave: false})

        return {accessToken, refreshToken}

    }catch(error){
        console.error("Token gen err:",error)
        throw new ApiError(500,"Something went wrong while generating tokens")
    }
}

const registerUser = asyncHandler(async(req,res) =>{
    //get user details from frontend
    //validation of username,email,pw
    // check if user already exixts
    //check for images
    //upload them to cloudinary
    //create user object in db
    //check response if user is created
    //return res after removing pw and refresh token field

    const {fullName,email, username, password} = req.body
    console.log("email:",email)

    // if(fullName ===""){
    //     throw new ApiError(400, "All fields are required")
    // }
    if([ fullName, email, username, password].some((field)=>
       field?.trim()==="")

    ){
        throw new ApiError(400,"All fields are required")
    }
    const existedUser = await User.findOne ({
        $or: [ {username,email}]
    })
    if(existedUser){
        throw new ApiError(409,"User with username or email already exists")
    }

    const avatarLocalPath = req.files?.avatar[0]?.path;
    //const coverImageLocalPath = req.files?.coverImage[0]?.path;

    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage)&& req.files.coverImage.length>0){   
        coverImageLocalPath = req.files.coverImage[0].path
    }

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is needed")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage= await uploadOnCloudinary(coverImageLocalPath)

    if(!avatar){
        throw new ApiError(400,"Avatar file is required")
    }

    const user =await  User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url ||"",
        email,
        password,
        username:username.toLowerCase()

       
    })

   const createdUser= await User.findById (user._id).select(
        "-password -refreshToken"
   )

   if(!createdUser){
    throw new ApiError(500,"Something went wrong while registering")
   }

   return res.status(201).json(
        new ApiResponse(200, createdUser, "User reqgistered Successfully")

   )
})

const loginUser = asyncHandler(async (req, res) => {
  const { email, username, password } = req.body;

  if (!username && !email) {
    throw new ApiError(400, "username or email is required");
  }

  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (!user) {
    throw new ApiError(404, "User does not exist, Register first");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  // generate tokens (you already had this)
  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);

  // get safe user object (remove password and refreshToken)
  const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

  // Cookie options: secure only in production
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    // optionally set an expires or maxAge if you want:
    // maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };

  // Set cookies (keeps your existing cookie behavior)
  res.cookie("accessToken", accessToken, cookieOptions);
  res.cookie("refreshToken", refreshToken, cookieOptions);

  // ALSO return accessToken in response body so frontend can read/store it
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        user: loggedInUser,
        accessToken, // frontend will read wrapper.data.accessToken
        // refreshToken // optional: include only if needed; usually keep refresh token in httpOnly cookie only
      },
      "User logged in Successfully"
    )
  );
});


const logoutUser = asyncHandler(async(req,res)=>{
    await User.findByIdAndUpdate(req.user._id,{
        $unset:{
            refreshToken: 1
        },
     },{
        new: true
     }
    )
    const options = {
        httpOnly : true,
        secure: true
    }
    return res.status(200).clearCookie("accessToken", options)
    .clearCookie("refreshToken",options)
    .json(new ApiResponse(200,{},"Logged Out!!"))
})

const refreshAccessToken = asyncHandler(async ( req,res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken
    if(!incomingRefreshToken){
        throw new ApiError (401,"Unauthorized Request")
    }
    try {
        const decodedToken = jwt.verify(incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET)
    
         const user = awaitUser.findById(decodedToken?._id)   
    
         if(!user){
            throw new ApiError(401,"Invalid Refresh Token")
         }
    
         if(incomingRefreshToken!==user?.refreshToken){
            throw new ApiError(401,"Refresh Token is expired or used")
         }
    
         const options = {
            httpOnly: true,
            secure: true
         }
    
         const {accessToken,newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
    
         return res
         .status(200)
         .cookie("accessToken",accessToken,options)
         .cookie("refreshToken",newRefreshToken,options)
         .json(
            new ApiResponse(200,{
                accessToken,refreshToken:newRefreshToken
            },"Access Token refreshed")
         )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh Token" )
    }

})

const changeCurrentPassword = asyncHandler(async(req,res) =>{
    const{oldPassword, newPassword}=req.body
    const user = await User.findById(req.user?._idid)

    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if(!isPasswordCorrect){
        throw new ApiError(400, "Invalid Password")
    }

    user.password = newPassword
    await user.save({validateBeforeSave:false})

    return res
    .status(200)
    .json(new ApiResponse(200,{},"Password Changed"))

})

const getCurrentUser = asyncHandler(async(req,res) =>{
    return res
    .status(200)
    .json(200,req.user, "current user fetched successfully")
})

const updateAccountDetails = asyncHandler(async(req,res) =>{
    const{fullName, email} = req.body
    if(!fullName ||!email){
        throw new ApiError(400, "All fields are required")
    }

const user = User.findByIdAndUpdate(req.user?._id,{
    $set:{
        fullName,
        email: email
    }
    
    },{
        new:true
    }
    ).select("-password") 
    return res
    .status(200)
    .json(new ApiResponse(200, user,"Acount details updated successfully"))
})

const updateUserAvatar = asyncHandler(async(req,res)=>{
    const avatarLocalPath = req.file?.path
    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar File is missing")
    }

    const avatar = await uploadOnCloudinary (avatarLocalPath)

    if(!avatar.url){
        throw new ApiError(400, "Error while uploading avatar")


    }

   const user= await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                avatar:avatar.url
            }
        },{
            new:true
        }
    ).select("-password")

    return res.status(200)
    .json(
        new ApiResponse(200, user, "Avatar updated")
    )
})

const updateUserCoverImage = asyncHandler(async(req,res)=>{
    const coverImageLocalPath = req.file?.path
    if(!coverImageLocalPath){
        throw new ApiError(400,"coverImage File is missing")
    }

    const coverImage = await uploadOnCloudinary (coverImageLocalPath)

    if(!coverImage.url){
        throw new ApiError(400, "Error while uploading avatar")


    }

   const user =  await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                coverImage:coverImage.url
            }
        },{
            new:true
        }
    ).select("-password")

    return res.status(200)
    .json(
        new ApiResponse(200, user, "Cover Image updated")
    )
})

const getUserChannelProfile = asyncHandler(async(req,res)=>{

    const {username}= req.params

    if(!username?.trim()){
        throw new ApiError(400,"username is missing")
    }
    const channel = await User.aggregate([
        {
            $match:{
                username: username?.toLowerCase()
            }
        },{
            $lookup: {
                from:"subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },{
            $lookup:{
                
                from:"subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },{
            $addFields:{
                subscribersCount: {
                    $size: "$subscribers"
                },
                channelsSubscribedToCount:{
                    $size:"$subscribedTo"
                },
                isSubscribed:{
                    $cond:{
                        if:{$in:[req.user?._id,"$subscribers.subscriber"]},
                        then: true,
                        else: false
                    }
                }
            }
        },{
            $project: {
                fullName: 1,
                username: 1,
                subscribersCount: 1,
                channelsSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email: 1
            }
        }
    ])

    if(!channel?.length){
        throw new ApiError(404, "Channel does not exist")
    }
    return res
    .status(200)
    .json(
        new ApiResponse(200, channel[0],"User channel fetched successfully")
    )
})

const getWatchHistory = asyncHandler(async(req,res) =>{
    const user = await User.aggregate([
        {
            $match:{
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },{
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project:{
                                        fullName: 1,
                                        username:1,
                                        avatar:1
                                    }
                                },{
                                    $addFields:{
                                        owner:{
                                            $first: "$owner"
                                        }
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        }
    ])
    return res
    .status(200)
    .json(
        new ApiResponse(
            200,
            user[0].watchHistory,
            "Watch History fetched sucessfully"
        )
    )
})

 



export {
    registerUser, 
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
}