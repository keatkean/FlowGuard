from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ultralytics import YOLO
import base64
import cv2
import numpy as np

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model = YOLO("yolov8n.pt")


class FrameRequest(BaseModel):
    image: str
    cam_id: str | None = None


ALLOWED_CLASSES = {
    "person",
    "orange",
    "apple",
    "banana",
    "bottle",
    "backpack",
    "handbag",
    "suitcase",
    "truck",
}

BLOCKED_CLASSES = {
    "donut",
    "tv",
    "refrigerator",
    "chair",
    "keyboard",
    "mouse",
    "remote",
    "cell phone",
    "laptop",
}

MIN_CONF = {
    "person": 0.45,
    "orange": 0.12,
    "apple": 0.15,
    "banana": 0.15,
    "bottle": 0.30,
    "backpack": 0.30,
    "handbag": 0.30,
    "suitcase": 0.25,
    "truck": 0.35,
}


@app.get("/")
def health_check():
    return {"status": "YOLO service running"}


@app.post("/api/yolo/analyze-frame")
def analyze_frame(payload: FrameRequest):
    image_data = payload.image

    if "," in image_data:
        image_data = image_data.split(",")[1]

    image_bytes = base64.b64decode(image_data)
    np_arr = np.frombuffer(image_bytes, np.uint8)
    frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    if frame is None:
        return {
            "frame_width": 0,
            "frame_height": 0,
            "count": 0,
            "risk_level": "low",
            "detections": []
        }

    height, width = frame.shape[:2]

    # Lower conf + larger imgsz helps small oranges
    results = model(frame, imgsz=832, conf=0.10, iou=0.45, verbose=False)

    detections = []
    people_count = 0
    suspicious_count = 0

    for result in results:
        for box in result.boxes:
            cls_id = int(box.cls[0])
            label_name = model.names[cls_id]
            confidence = float(box.conf[0])

            # Debug: check what YOLO really sees
            print("RAW YOLO:", label_name, confidence)

            if label_name in BLOCKED_CLASSES:
                continue

            if label_name not in ALLOWED_CLASSES:
                continue

            if confidence < MIN_CONF.get(label_name, 0.45):
                continue

            x1, y1, x2, y2 = box.xyxy[0].tolist()

            det_type = "object"
            status = "normal"
            display_label = label_name

            if label_name == "person":
                people_count += 1
                det_type = "person"

                if payload.cam_id == "CAM-03":
                    status = "suspicious"
                    suspicious_count += 1

            elif label_name in {"orange", "apple", "banana"}:
                det_type = "food_item"
                status = "normal"

            elif label_name in {"backpack", "handbag", "suitcase", "bottle"}:
                det_type = "package"
                status = "watch"
                suspicious_count += 1

                if label_name == "suitcase":
                    display_label = "package-like object"

            elif label_name == "truck":
                det_type = "vehicle"
                status = "normal"

            detections.append({
                "label": f"{display_label} {confidence:.2f}",
                "type": det_type,
                "status": status,
                "confidence": round(confidence, 2),
                "box": [x1, y1, x2, y2]
            })

    risk_level = "medium" if suspicious_count > 0 else "low"

    return {
        "frame_width": width,
        "frame_height": height,
        "count": people_count,
        "risk_level": risk_level,
        "detections": detections
    }