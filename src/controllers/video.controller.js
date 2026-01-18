import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import { Video } from "../models/video.model.js";
import { User } from "../models/user.model.js";
import { Comment } from "../models/comment.model.js";
import {
    uploadOnCloudinary,
    deleteOnCloudinary
} from "../utils/cloudinary.js";
import ApiResponse from "../utils/ApiResponse.js";
import mongoose, { isValidObjectId } from "mongoose";
import { Like } from "../models/like.model.js";
import fs from "fs";

const getMyVideos = asyncHandler(async (req, res) => {
  // show ALL videos owned by this user: published + drafts
  const videos = await Video.find({ owner: req.user._id })
    .sort({ createdAt: -1 })
    .populate("owner", "username avatar");

  return res
    .status(200)
    .json(
      new ApiResponse(200, videos, "My videos fetched successfully")
    );
});
// get all videos based on query, sort, pagination
const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query;
    const pipeline = [];

    if (query){
        pipeline.push({
            $match: {
                $or: [
                    {title: {$regex: query, $options: "i"}},
                    {description: {$regex: query, $options: "i"}},
                ]
            }
        })
    }

    if (userId) {
        if (!isValidObjectId(userId)) {
            throw new ApiError(400, "Invalid userId");
        }

        pipeline.push({
            $match: {
                owner: new mongoose.Types.ObjectId(userId)
            }
        });
    }

    // fetch videos only that are set isPublished as true
    pipeline.push({ $match: { isPublished: true } });
    
    //sortBy can be views, createdAt, duration
    if (sortBy && sortType) {
        pipeline.push({
            $sort: {
                [sortBy]: sortType === "asc" ? 1 : -1
            }
        });
    } else {
        pipeline.push({ $sort: { createdAt: -1 } });
    }

    pipeline.push(
        {
            $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "_id",
                as: "ownerDetails",
                pipeline: [
                    {
                        $project: {
                            username: 1,
                            "avatar.url": 1
                        }
                    }
                ]
            }
        },
        {
            $unwind: "$ownerDetails"
        }
    );

    if (!page && !limit) {
        pipeline.push({ $sample: { size: 10 } });
    }

    const videoAggregate = Video.aggregate(pipeline);

    const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
    };

    const video = await Video.aggregatePaginate(videoAggregate, options);

    return res
        .status(200)
        .json(new ApiResponse(200, video, "Videos fetched successfully"));
});

const safeUnlink = (path) => {
  try { if (path && fs.existsSync(path)) fs.unlinkSync(path); } catch (e) { /* ignore */ }
};

const publishAVideo = asyncHandler(async (req, res) => {
  const { title, description } = req.body;

  if ([title, description].some((field) => field?.trim() === "")) {
    throw new ApiError(400, "All fields are required");
  }

  const videoFileLocalPath = req.files?.videoFile?.[0]?.path;
  const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path;

  if (!videoFileLocalPath) throw new ApiError(400, "videoFileLocalPath is required");
  if (!thumbnailLocalPath) throw new ApiError(400, "thumbnailLocalPath is required");

  // OPTIONAL: compute hash to prevent duplicate uploads
  // const fileBuffer = fs.readFileSync(videoFileLocalPath);
  // const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  // const existing = await Video.findOne({ fileHash });
  // if (existing) {
  //   // cleanup local files and return error
  //   safeUnlink(videoFileLocalPath);
  //   safeUnlink(thumbnailLocalPath);
  //   throw new ApiError(409, "This video file was already uploaded");
  // }

  // Uploads (assumes uploadOnCloudinary returns an object with secure_url, public_id, duration)
  let videoFile, thumbnail;
  try {
    videoFile = await uploadOnCloudinary(videoFileLocalPath, { resource_type: "video" });
    thumbnail = await uploadOnCloudinary(thumbnailLocalPath, { resource_type: "image" });
  } catch (err) {
    // ensure temp files removed
    safeUnlink(videoFileLocalPath);
    safeUnlink(thumbnailLocalPath);
    throw new ApiError(500, "Cloudinary upload failed: " + (err.message || err));
  }

  if (!videoFile || !videoFile.public_id) {
    safeUnlink(videoFileLocalPath);
    safeUnlink(thumbnailLocalPath);
    throw new ApiError(400, "Video file upload failed");
  }

  if (!thumbnail || !thumbnail.public_id) {
    safeUnlink(videoFileLocalPath);
    safeUnlink(thumbnailLocalPath);
    throw new ApiError(400, "Thumbnail upload failed");
  }

  // Create DB doc
  const video = await Video.create({
    title,
    description,
    duration: videoFile.duration ?? undefined,
    // store secure_url if present, else fallback to url
    videoFile: {
      url: videoFile.secure_url ?? videoFile.url,
      public_id: videoFile.public_id,
      format: videoFile.format
    },
    thumbnail: {
      url: thumbnail.secure_url ?? thumbnail.url,
      public_id: thumbnail.public_id
    },
    owner: req.user?._id,
    isPublished: false,
    // OPTIONAL: fileHash
    // fileHash
  });

  // cleanup local files (best-effort)
  safeUnlink(videoFileLocalPath);
  safeUnlink(thumbnailLocalPath);

  // Return clear response with mongo id
  return res
    .status(201) // CREATED
    .json(new ApiResponse(201, {
      _id: video._id,
      title: video.title,
      description: video.description,
      videoUrl: video.videoFile.url,
      thumbnailUrl: video.thumbnail.url,
      public_id: video.videoFile.public_id // optional debugging-only
    }, "Video uploaded successfully"));
});

const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid videoId (expected MongoDB ObjectId)");
  }

  if (!isValidObjectId(req.user?._id)) {
    throw new ApiError(400, "Invalid userId");
  }

  // convert user id to ObjectId to avoid type mismatch inside aggregation
  const userObjectId = new mongoose.Types.ObjectId(req.user._id);

  const results = await Video.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(videoId) } },
    {
      $lookup: {
        from: "likes",
        localField: "_id",
        foreignField: "video",
        as: "likes",
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
        pipeline: [
          {
            $lookup: {
              from: "subscriptions",
              localField: "_id",
              foreignField: "channel",
              as: "subscribers",
            }
          },
          {
            $addFields: {
              subscribersCount: { $size: { $ifNull: ["$subscribers", []] } },
              // Use $in where first arg is the user id constant and second is the array field
              isSubscribed: {
                $in: [userObjectId, { $ifNull: ["$subscribers.subscriber", []] }]
              }
            }
          },
          {
            $project: {
              username: 1,
              "avatar.url": 1,
              subscribersCount: 1,
              isSubscribed: 1
            }
          },
        ],
      }
    },
    {
      $addFields: {
        likesCount: { $size: { $ifNull: ["$likes", []] } },
        owner: { $first: "$owner" },
        isLiked: {
          $in: [userObjectId, { $ifNull: ["$likes.likedBy", []] }]
        }
      }
    },
    {
      $project: {
        "videoFile.url": 1,
        title: 1,
        description: 1,
        views: 1,
        createdAt: 1,
        duration: 1,
        comments: 1,
        owner: 1,
        likesCount: 1,
        isLiked: 1,
      }
    }
  ]).allowDiskUse(true); // optional: for heavy aggregation

  if (!results || results.length === 0) {
    throw new ApiError(404, "Video not found");
  }

  const video = results[0];

  // Increment views (use ObjectId to be safe)
  await Video.findByIdAndUpdate(videoId, { $inc: { views: 1 } });

  // Add to user's watch history (use $addToSet with ObjectId)
  await User.findByIdAndUpdate(userObjectId, {
    $addToSet: { watchHistory: new mongoose.Types.ObjectId(videoId) }
  });

  return res
    .status(200)
    .json(new ApiResponse(200, video, "Video details fetched successfully"));
});

// update video details like title, description, thumbnail
const updateVideo = asyncHandler(async(req, res) => {
    const {title, description} = req.body;
    const {videoId} = req.params;

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId");
    }

    if (!(title && description)) {
        throw new ApiError(400, "title and description are required");
    }

    const video = await Video.findById(videoId)

    if(!video){
        throw new ApiError(404, "No video found");
    }

    if(video?.owner.toString() !== req.user?._id.toString()){
        throw new ApiError(
            400,
            "You can't edit this video as you are not the owner"
        );
    }

    //deleting old thumbnail and updating with new one
    const thumbnailToDelete = video.thumbnail.public_id;

    const thumbnailLocalPath = req.file?.path;

    if (!thumbnailLocalPath) {
        throw new ApiError(400, "thumbnail is required");
    }

    const thumbnail = await uploadOnCloudinary(thumbnailLocalPath)
    
    if (!thumbnail) {
        throw new ApiError(400, "thumbnail not found");
    }

    const updatedVideo = await Video.findByIdAndUpdate(
        videoId,
        {
            $set: {
                title,
                description,
                thumbnail: {
                    public_id: thumbnail.public_id,
                    url: thumbnail.url
                }
            },
        },
        {new: true},
    );

    if(!updatedVideo){
        throw new ApiError(500, "Failed to update video please try again");
    }

    if(updatedVideo){
        await deleteOnCloudinary(thumbnailToDelete)
    }

    return res
        .status(200)
        .json(new ApiResponse(200, updatedVideo, "Video updated successfully"));
})

//delete video
const deleteVideo = asyncHandler(async(req, res) => {
    const {videoId} = req.params;

    if(!isValidObjectId(videoId)){
        throw new ApiError(400, "Invalid videoId");
    }

    const video = await Video.findById(videoId)

    if(!video){
        throw new ApiError(404, "No video found");
    }

    if(video?.owner.toString() !== req.user?._id.toString()){
        throw new ApiError(
            400,
            "You can't delete this video as you are not the owner"
        );
    }

    const videoDeleted = await Video.findByIdAndDelete(video?._id);

    if (!videoDeleted) {
        throw new ApiError(400, "Failed to delete the video please try again");
    }

    await deleteOnCloudinary(video.thumbnail.public_id); // video model has thumbnail public_id stored in it->check videoModel
    await deleteOnCloudinary(video.videoFile.public_id, "video"); // specify video while deleting video

    await Like.deleteMany({
        video: videoId,
    })

    await Comment.deleteMany({
        video: videoId,
    });

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Video deleted successfully"));
})

// toggle publish status of a video
const togglePublishStatus = asyncHandler(async(req, res) => {
    const { videoId } = req.params;

    if (!isValidObjectId(videoId)) {
        throw new ApiError(400, "Invalid videoId");
    }

    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    if (video?.owner.toString() !== req.user?._id.toString()) {
        throw new ApiError(
            400,
            "You can't toogle publish status as you are not the owner"
        );
    }

    const toggleVideoPublish = await Video.findByIdAndUpdate(
        videoId,
        {
            $set: {
                isPublished: !video?.isPublished,
            }
        },
        {new: true}
    );

    if (!toggleVideoPublish) {
        throw new ApiError(500, "Failed to toogle video publish status");
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                { isPublished: toggleVideoPublish.isPublished },
                "Video publish toggled successfully"
            )
        );
})

export {
    publishAVideo,
    updateVideo,
    deleteVideo,
    getAllVideos,
    getVideoById,
    togglePublishStatus,
    getMyVideos
}