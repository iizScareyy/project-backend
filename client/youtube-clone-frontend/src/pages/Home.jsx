// src/pages/Home.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";
import { VIDEO_ROUTES } from "../api/routes";

const Home = () => {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        setErrorMsg("");

        const res = await api.get(VIDEO_ROUTES.LIST);
        console.log("VIDEOS LIST RESPONSE:", res.data);

        // your backend: { statusCode, data: { docs: [...] , ... }, ... }
        const data = res.data?.data;
        const arr = Array.isArray(data?.docs) ? data.docs : [];

        setVideos(arr);
      } catch (err) {
        console.error("Error fetching videos", err);
        setErrorMsg(
          err?.response?.data?.message ||
            err?.message ||
            "Failed to fetch videos"
        );
        setVideos([]);
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, []);

  if (loading) return <div>Loading videos...</div>;

  return (
    <div>
      <div className="home-header">
        <div>
          <h2 className="home-title">Explore</h2>
          <div className="home-subtitle">
            Watch your uploaded content and test the flow like YouTube.
          </div>
        </div>
      </div>

      <div className="chip-row">
        <button className="chip active">All</button>
        <button className="chip">Latest</button>
        <button className="chip">Short videos</button>
        <button className="chip">Most viewed</button>
      </div>

      {errorMsg && <div style={{ color: "#ff6b6b" }}>{errorMsg}</div>}

      {(!videos || videos.length === 0) && !errorMsg ? (
        <p>No videos found.</p>
      ) : (
        <div className="video-grid">
          {videos.map((video) => {
            if (!video || !video._id) return null;

            const thumbnailUrl = video.thumbnail?.url || "";
            const title = video.title || "Untitled video";
            const channel = video.owner?.username || "Unknown channel";
            const ownerUsername = video.owner?.username;
            const avatar = video.owner?.avatar;

            const durationSeconds = video.duration
              ? Math.round(video.duration)
              : null;
            const views = video.views ?? 0;

            return (
              <Link key={video._id} to={`/watch/${video._id}`}>
                <article className="video-card">
                  <div className="video-thumb-wrapper">
                    {thumbnailUrl ? (
                      <img
                        src={thumbnailUrl}
                        alt={title}
                        className="video-thumb"
                      />
                    ) : (
                      <div className="video-thumb" />
                    )}
                    {durationSeconds !== null && (
                      <span className="video-duration">
                        {durationSeconds}s
                      </span>
                    )}
                  </div>

                  <div className="video-info">
                    {avatar ? (
                      <img
                        src={avatar}
                        alt={channel}
                        className="video-avatar"
                      />
                    ) : (
                      <div className="video-avatar" />
                    )}

                    <div className="video-text">
                      <h3 className="video-title">{title}</h3>

                      {ownerUsername ? (
                        <Link
                          to={`/profile/${ownerUsername}`}
                          className="video-meta"
                          onClick={(e) => e.stopPropagation()} // don't trigger video click
                        >
                          {channel}
                        </Link>
                      ) : (
                        <div className="video-meta">{channel}</div>
                      )}

                      <div className="video-meta">
                        {views} views ·{" "}
                        {video.createdAt
                          ? new Date(video.createdAt).toLocaleDateString()
                          : "Just now"}
                      </div>
                    </div>
                  </div>
                </article>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Home;
 