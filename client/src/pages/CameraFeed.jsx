import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import '../css/CameraFeed.css';

const HARDWARE_STREAM_PATTERN = /video_feed|mjpeg|mjpg/i;

export function isHardwareStream(video) {
  if (typeof video !== 'string' || !/^https?:\/\//i.test(video)) return false;
  return HARDWARE_STREAM_PATTERN.test(video);
}

const RELEVANT_CAMERA_CLASSES = new Set([
  'person',
  'backpack',
  'handbag',
  'suitcase',
  'bottle',
  'cup',
  'laptop',
  'cell',
  'phone',
  'truck',
  'book',
  'orange',
  'apple',
  'banana',
]);

export default function CameraFeed({ cam }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const isHardware = isHardwareStream(cam.video);
  const [hardwareStatus, setHardwareStatus] = useState('loading');

  useEffect(() => {
    if (isHardware) return undefined;

    const interval = setInterval(() => {
      analyzeFrame();
    }, 2000);

    return () => clearInterval(interval);
  }, [isHardware]);

  useEffect(() => {
    if (isHardware) setHardwareStatus('loading');
  }, [isHardware, cam.video]);

  const analyzeFrame = async () => {
    try {
      const video = videoRef.current;

      if (!video || video.readyState < 2 || video.videoWidth === 0) {
        return;
      }

      const captureCanvas = document.createElement('canvas');
      captureCanvas.width = video.videoWidth;
      captureCanvas.height = video.videoHeight;

      const captureCtx = captureCanvas.getContext('2d');
      captureCtx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);

      const image = captureCanvas.toDataURL('image/jpeg', 0.75);
      const response = await axios.post('/ai/api/yolo/analyze-frame', {
        image,
        cam_id: cam.id,
      });

      drawDetections(response.data);
    } catch (err) {
      console.error(`${cam.id} detection error`, err);
    }
  };

  const drawDetections = (data) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;

    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const frameWidth = data.frame_width || video.videoWidth;
    const frameHeight = data.frame_height || video.videoHeight;
    const videoRatio = frameWidth / frameHeight;
    const canvasRatio = canvas.width / canvas.height;

    let renderWidth;
    let renderHeight;
    let offsetX = 0;
    let offsetY = 0;

    if (canvasRatio > videoRatio) {
      renderHeight = canvas.height;
      renderWidth = canvas.height * videoRatio;
      offsetX = (canvas.width - renderWidth) / 2;
    } else {
      renderWidth = canvas.width;
      renderHeight = canvas.width / videoRatio;
      offsetY = (canvas.height - renderHeight) / 2;
    }

    const scaleX = renderWidth / frameWidth;
    const scaleY = renderHeight / frameHeight;

    data.detections
      .filter((det) => {
        if (det.type === 'person') return (det.confidence ?? 1) >= 0.45;
        const className = String(det.label || '').toLowerCase().split(' ')[0];
        if (det.type === 'food_item') return (det.confidence ?? 0) >= 0.3 && RELEVANT_CAMERA_CLASSES.has(className);
        return (det.confidence ?? 0) >= 0.5 && RELEVANT_CAMERA_CLASSES.has(className);
      })
      .forEach((det) => {
      const [x1, y1, x2, y2] = det.box;
      let color = '#22c55e';

      if (det.status === 'suspicious') {
        color = '#f43f5e';
      } else if (det.type === 'food_item') {
        color = '#facc15';
      } else if (det.type === 'object') {
        color = '#f59e0b';
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        offsetX + x1 * scaleX,
        offsetY + y1 * scaleY,
        (x2 - x1) * scaleX,
        (y2 - y1) * scaleY
      );

      ctx.fillStyle = color;
      ctx.font = 'bold 12px Arial';
      ctx.fillText(det.label, offsetX + x1 * scaleX, Math.max(16, offsetY + y1 * scaleY - 6));
    });
  };

  if (isHardware) {
    return (
      <div className="camera-feed-placeholder">
        <img
          src={cam.video}
          alt={`${cam.id} live stream`}
          className="camera-video"
          onLoad={() => setHardwareStatus('live')}
          onError={() => setHardwareStatus('error')}
        />

        <div className="camera-feed-hud">
          <span>{cam.id}</span>
        </div>

        {hardwareStatus === 'error' && (
          <div className="camera-feed-error">SecurePi feed unavailable</div>
        )}
      </div>
    );
  }

  return (
    <div className="camera-feed-placeholder">
      <video
        ref={videoRef}
        src={cam.video}
        autoPlay
        muted
        loop
        playsInline
        className="camera-video"
      />

      <div className="camera-feed-hud">
        <span>{new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC</span>
        <span>{cam.id}</span>
      </div>

      <canvas ref={canvasRef} className="camera-overlay" />
    </div>
  );
}
