console.log("Cloudinary FILE RUNNING ✅");
import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

const configureCloudinary = () => {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
};



const uploadOnCloudinary = async (localFilePath) => {
  configureCloudinary()
  if (!localFilePath) return null;

  try {
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });

    console.log("File uploaded to Cloudinary:", response.url);

    // safely remove local file after upload
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }

    return response;
  } catch (error) {
    // cleanup only if file actually exists
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }
    console.error("Cloudinary upload failed:", error.message);
    throw error;
  }
}
const deleteOnCloudinary = async(public_id, resource_type= "image") => {
    try {
        if(!public_id) return null;

        const result = await cloudinary.uploader.destroy(public_id, {
            resource_type: `${resource_type}`
        });

    } catch (error) {
        return error;
        console.log("delete on cloudinary failed", error);
    }
}

export { uploadOnCloudinary,deleteOnCloudinary };
