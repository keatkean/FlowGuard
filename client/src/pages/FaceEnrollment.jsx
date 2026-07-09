import React, { useRef, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import '../css/Enrollment.css';
import { API_BASE_URL } from '../constants/api';

const FaceEnrollment = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [enrollmentMode, setEnrollmentMode] = useState('camera'); // 'camera' | 'upload'
  const [stage, setStage] = useState('front'); // 'front', 'left', 'right', 'ready'
  const [photos, setPhotos] = useState({ front: null, left: null, right: null });
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const token = localStorage.getItem("accessToken");
  const userName = localStorage.getItem("userName");
  const targetUserId = searchParams.get("userId");
  const targetUserName = searchParams.get("name");
  const returnTo = searchParams.get("returnTo") || "/dashboard";
  const isReEnrollment = Boolean(targetUserId);
  const displayName = targetUserName || userName || "FlowGuard user";

  const allUploaded = photos.front && photos.left && photos.right;

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    // No camera API (insecure context / no webcam): steer the user to manual upload.
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("No webcam detected on this device. Use the “Upload Photos” option instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 15, max: 20 },
          facingMode: "user"
        }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera access denied", err);
      setErrorMessage("Camera access denied. Enable camera permissions, or use the “Upload Photos” option instead.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (video && canvas) {
      const context = canvas.getContext('2d');
      const maxWidth = 640;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imageDataUrl = canvas.toDataURL('image/jpeg', 0.75);
      
      setPhotos(prev => ({ ...prev, [stage]: imageDataUrl }));
      
      if (stage === 'front') setStage('left');
      else if (stage === 'left') setStage('right');
      else {
        setStage('ready');
        stopCamera();
      }
    }
  };

  const switchMode = (mode) => {
    if (mode === enrollmentMode) return;
    setEnrollmentMode(mode);
    setPhotos({ front: null, left: null, right: null });
    setErrorMessage(null);
    setStage('front');
    if (mode === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
  };

  const handleFileUpload = (angle, file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMessage("Please upload an image file for facial enrollment.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setPhotos(prev => ({ ...prev, [angle]: e.target.result }));
      setErrorMessage(null);
    };
    reader.readAsDataURL(file);
  };

  const resetCapture = () => {
    setPhotos({ front: null, left: null, right: null });
    setErrorMessage(null);
    setStage('front');
    if (enrollmentMode === 'camera') startCamera();
  };

  const submitEnrollment = async () => {
    setLoading(true);
    setErrorMessage(null); // Clear any previous errors

    try {
      // Relative path uses the Vite proxy locally; VITE_API_BASE_URL targets the
      // deployed Node backend in production. Photos exist only in memory here —
      // the backend converts them to a protected biometric template and discards them.
      await axios.post(`${API_BASE_URL}/user/enroll-face`, {
        images: photos,
        targetUserId: targetUserId ? Number(targetUserId) : undefined
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Navigate to dashboard on success
      navigate(returnTo, {
        state: {
          notice: isReEnrollment
            ? `Face ID re-enrolled for ${displayName}.`
            : "Biometric enrollment successful."
        }
      }); 
    } catch (error) {
      console.error("Enrollment failed:", error);
      
      // Extract specific error from backend if available
      const backendError = error.response?.data?.error || "Facial vectoring failed. Ensure face is clearly visible.";
      setErrorMessage(backendError);
    } finally {
      setLoading(false);
    }
  };

  const getInstructions = () => {
    if (enrollmentMode === 'upload') {
      return allUploaded ? "All angles uploaded. Ready to submit." : "Upload a clear photo for each angle below.";
    }
    switch(stage) {
      case 'front': return "Look directly at the camera.";
      case 'left': return "Turn your head slightly to the left.";
      case 'right': return "Turn your head slightly to the right.";
      case 'ready': return "All angles captured successfully.";
      default: return "";
    }
  };

  return (
    <div className="enrollment-layout">
      <div className="enrollment-card">
        <div className="enrollment-header">
          <span className="security-icon">🛡️</span>
          <h2>{isReEnrollment ? 'Re-enroll Face ID' : 'Mandatory Biometric Setup'}</h2>
          <p>
            {isReEnrollment
              ? `Updating biometric access for ${displayName}. Capture or upload 3 fresh angles.`
              : `Welcome, ${displayName}. We need 3 angles to build a robust factory access profile.`}
          </p>
        </div>

        {/* --- MODE TOGGLE --- */}
        <div className="mode-toggle">
          <button className={`mode-btn ${enrollmentMode === 'camera' ? 'active' : ''}`} onClick={() => switchMode('camera')}>
            📷 Use Camera
          </button>
          <button className={`mode-btn ${enrollmentMode === 'upload' ? 'active' : ''}`} onClick={() => switchMode('upload')}>
            ⬆ Upload Photos
          </button>
        </div>

        <div className="progress-tracker">
            <span className={`tracker-badge ${photos.front ? 'done' : enrollmentMode === 'camera' && stage === 'front' ? 'active' : ''}`}>Front</span>
            <span className="tracker-line"></span>
            <span className={`tracker-badge ${photos.left ? 'done' : enrollmentMode === 'camera' && stage === 'left' ? 'active' : ''}`}>Left</span>
            <span className="tracker-line"></span>
            <span className={`tracker-badge ${photos.right ? 'done' : enrollmentMode === 'camera' && stage === 'right' ? 'active' : ''}`}>Right</span>
        </div>

        <div className="camera-container">
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {enrollmentMode === 'camera' ? (
            stage === 'ready' ? (
              <div className="preview-grid">
                <img src={photos.front} alt="Front" className="preview-thumb" />
                <img src={photos.left} alt="Left" className="preview-thumb" />
                <img src={photos.right} alt="Right" className="preview-thumb" />
              </div>
            ) : (
              <div className="video-wrapper">
                <video ref={videoRef} autoPlay playsInline muted className="live-video" />
                <div className={`face-guide-overlay ${stage}`}></div>
              </div>
            )
          ) : (
            <div className="upload-grid">
              {['front', 'left', 'right'].map((angle) => (
                <label key={angle} className={`upload-zone ${photos[angle] ? 'uploaded' : ''}`}>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => handleFileUpload(angle, e.target.files[0])}
                  />
                  {photos[angle] ? (
                    <>
                      <img src={photos[angle]} alt={angle} className="upload-preview" />
                      <span className="upload-label done-label">✓ {angle.charAt(0).toUpperCase() + angle.slice(1)}</span>
                    </>
                  ) : (
                    <>
                      <span className="upload-icon">+</span>
                      <span className="upload-label">{angle.charAt(0).toUpperCase() + angle.slice(1)}</span>
                    </>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        {errorMessage && (
            <div className="error-banner">
                <span className="error-icon">⚠️</span>
                {errorMessage}
            </div>
        )}

        <h3 className="instruction-text">{getInstructions()}</h3>

        <div className="enrollment-actions">
          {enrollmentMode === 'camera' ? (
            stage !== 'ready' ? (
              <button className="capture-btn" onClick={capturePhoto}>
                Capture {stage.charAt(0).toUpperCase() + stage.slice(1)}
              </button>
            ) : (
              <>
                <button className="retake-btn" onClick={resetCapture} disabled={loading}>Start Over</button>
                <button className="submit-btn" onClick={submitEnrollment} disabled={loading}>
                  {loading ? "Vectoring..." : isReEnrollment ? "Save New Face ID" : "Confirm & Unlock System"}
                </button>
              </>
            )
          ) : (
            <>
              <button className="retake-btn" onClick={resetCapture} disabled={loading}>Clear All</button>
              <button className="submit-btn" onClick={submitEnrollment} disabled={!allUploaded || loading}>
                {loading ? "Vectoring..." : isReEnrollment ? "Save New Face ID" : "Confirm & Unlock System"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FaceEnrollment;
