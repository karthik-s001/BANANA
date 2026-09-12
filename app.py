"""
Banana AI Judge - Flask backend.

Real computer vision (OpenCV + NumPy) does color-independent banana
detection and curvature analysis. Everything downstream of that
(mood, drama, fortunes...) is deliberately, gloriously
useless -- but deterministic, so the same photo always gets the
same judgement.

NOTE: no emojis in print()/terminal output. Windows consoles can
choke on them (UnicodeEncodeError). Emojis are fine in the HTML/JS.
"""

import os
import io
import uuid
import time
import hashlib
import random
import threading
import traceback

import numpy as np
import cv2
from ultralytics import YOLO
from flask import Flask, request, jsonify, render_template, send_from_directory
from werkzeug.utils import secure_filename

# --------------------------------------------------------------------------
# App setup
# --------------------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXT = {"jpg", "jpeg", "png"}
MAX_CONTENT_LENGTH = 12 * 1024 * 1024  # 12 MB per request
BANANA_CONFIDENCE_THRESHOLD = 0.50
YOLO_MODEL_NAME = "yolov8n.pt"

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH

STATS_LOCK = threading.Lock()
STATS = {
    "total": 0,
    "bend_sum": 0.0,
    "beauty_sum": 0,
    "uselessness_sum": 0.0,
    "most_curved": {"value": 0.0, "id": None},
    "most_dramatic": {"value": -1, "id": None},
    "most_dangerous": {"value": -1.0, "id": None},
    "champion": {"value": -1, "id": None},
    "mood_counts": {},
    "personality_counts": {},
}
BANANA_COUNTER = {"n": 0}
COUNTER_LOCK = threading.Lock()


# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXT


def next_banana_id():
    with COUNTER_LOCK:
        BANANA_COUNTER["n"] += 1
        return BANANA_COUNTER["n"]


def clip(value, low, high):
    return max(low, min(high, value))


def seeded_rng(image_bytes, salt=""):
    """Deterministic RNG derived from the raw image bytes (+ optional salt)
    so the same photo always produces the same silly result."""
    digest = hashlib.md5(image_bytes + salt.encode("utf-8")).hexdigest()
    seed = int(digest[:12], 16)
    return random.Random(seed)


def decode_image(file_storage):
    """Read a werkzeug FileStorage into an OpenCV BGR image. Returns
    (image, raw_bytes) or (None, raw_bytes) if decoding failed."""
    raw = file_storage.read()
    if not raw:
        return None, raw
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return img, raw


def resize_for_processing(img, max_dim=900):
    h, w = img.shape[:2]
    scale = max_dim / float(max(h, w))
    if scale < 1.0:
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return img


# --------------------------------------------------------------------------
# YOLO banana-only detection gate
# --------------------------------------------------------------------------

YOLO_MODEL = None


def get_yolo_model():
    global YOLO_MODEL
    if YOLO_MODEL is None:
        YOLO_MODEL = YOLO(YOLO_MODEL_NAME)
    return YOLO_MODEL


def get_model_class_name(model, class_index):
    class_names = getattr(model, "names", {}) or {}
    if isinstance(class_names, dict):
        return class_names.get(class_index, str(class_index))
    return class_names[class_index] if class_index < len(class_names) else str(class_index)


def detect_banana_with_yolo(img):
    model = get_yolo_model()
    results = model(img, verbose=False, conf=0.25)

    best_confidence = 0.0

    for result in results:
        if result.boxes is None:
            continue

        for cls_obj, conf_obj in zip(result.boxes.cls, result.boxes.conf):
            class_index = int(cls_obj.item())
            class_name = get_model_class_name(model, class_index)
            confidence = float(conf_obj.item())

            if class_name.lower() != "banana":
                continue

            if confidence > best_confidence:
                best_confidence = confidence

    if best_confidence < BANANA_CONFIDENCE_THRESHOLD:
        return False, best_confidence

    return True, best_confidence


# --------------------------------------------------------------------------
# Computer vision: contour analysis used only after YOLO confirms a banana
# --------------------------------------------------------------------------
#
# The OpenCV contour pipeline is no longer used to decide whether an image
# contains a banana. It is used only after YOLO has already confirmed a
# banana class, so the contour analysis can calculate curvature and bend.

def grabcut_mask(img):
    h, w = img.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)

    mx, my = max(2, int(w * 0.04)), max(2, int(h * 0.04))
    rect = (mx, my, max(1, w - 2 * mx), max(1, h - 2 * my))

    try:
        cv2.grabCut(img, mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)
    except cv2.error:
        return None

    fg_mask = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype("uint8")
    return fg_mask


def edge_mask(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.bilateralFilter(gray, 7, 50, 50)
    edges = cv2.Canny(gray, 40, 120)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)
    filled = closed.copy()
    h, w = filled.shape[:2]
    flood_mask = np.zeros((h + 2, w + 2), np.uint8)
    flood_fill_img = filled.copy()
    cv2.floodFill(flood_fill_img, flood_mask, (0, 0), 255)
    inv = cv2.bitwise_not(flood_fill_img)
    filled = closed | inv
    return filled


def clean_mask(mask):
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    return mask


def contour_features(contour):
    area = cv2.contourArea(contour)
    hull = cv2.convexHull(contour)
    hull_area = cv2.contourArea(hull)
    solidity = float(area) / hull_area if hull_area > 0 else 0.0

    rect = cv2.minAreaRect(contour)
    (rw, rh) = rect[1]
    long_side = max(rw, rh)
    short_side = min(rw, rh) if min(rw, rh) > 1e-6 else 1e-6
    aspect_ratio = long_side / short_side
    rect_area = rw * rh
    extent = float(area) / rect_area if rect_area > 0 else 0.0

    return {
        "area": area,
        "hull": hull,
        "solidity": solidity,
        "aspect_ratio": aspect_ratio,
        "extent": extent,
        "rect": rect,
    }


def banana_likeness_score(feat, image_area):
    """Heuristic score, higher = more banana-shaped. Rewards elongated,
    imperfectly-convex (curved), reasonably large blobs."""
    area_ratio = feat["area"] / float(image_area)
    if area_ratio < 0.004:
        return -1.0

    ar_score = clip((feat["aspect_ratio"] - 1.0) / 4.0, 0, 1.0)
    solidity_score = 1.0 - abs(feat["solidity"] - 0.90) * 2.5
    solidity_score = clip(solidity_score, 0, 1.0)
    size_score = clip(area_ratio / 0.35, 0, 1.0)

    return ar_score * 0.5 + solidity_score * 0.3 + size_score * 0.2


def locate_banana_contour(img):
    """Returns (contour, features, detected: bool, confidence: float)."""
    h, w = img.shape[:2]
    image_area = h * w

    masks = []
    gc = grabcut_mask(img)
    if gc is not None:
        masks.append(gc)
    masks.append(edge_mask(img))

    if len(masks) == 2:
        combined = cv2.bitwise_or(masks[0], masks[1])
    else:
        combined = masks[0]

    combined = clean_mask(combined)

    contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not contours:
        return None, None, False, 0.0

    best_contour = None
    best_feat = None
    best_score = -1.0

    for c in contours:
        if len(c) < 5:
            continue
        feat = contour_features(c)
        score = banana_likeness_score(feat, image_area)
        if score > best_score:
            best_score = score
            best_contour = c
            best_feat = feat

    if best_contour is None:
        # fall back to the largest contour, whatever its shape
        best_contour = max(contours, key=cv2.contourArea)
        best_feat = contour_features(best_contour)
        best_score = 0.05

    detected = best_score >= 0.18 and best_feat["aspect_ratio"] >= 1.35
    confidence = clip(best_score, 0.0, 1.0)
    return best_contour, best_feat, detected, confidence


# --------------------------------------------------------------------------
# Curvature analysis
# --------------------------------------------------------------------------

def analyze_curvature(contour):
    """Finds approximate endpoints of the banana, the straight reference
    line between them, and the maximum perpendicular deviation of the
    contour from that line (the 'bend')."""
    hull = cv2.convexHull(contour)
    pts = hull.reshape(-1, 2).astype(np.float64)

    # Endpoints: the pair of hull points that are farthest apart
    # (hull point count is small, brute force is fine).
    max_dist = -1.0
    p1 = p2 = pts[0]
    n = len(pts)
    for i in range(n):
        for j in range(i + 1, n):
            d = np.linalg.norm(pts[i] - pts[j])
            if d > max_dist:
                max_dist = d
                p1, p2 = pts[i], pts[j]

    straight_line_distance = max(max_dist, 1e-6)

    line_vec = p2 - p1
    line_len = np.linalg.norm(line_vec)
    line_unit = line_vec / line_len if line_len > 1e-6 else np.array([1.0, 0.0])

    contour_pts = contour.reshape(-1, 2).astype(np.float64)
    # perpendicular distance of every contour point from the line p1-p2
    rel = contour_pts - p1
    cross = rel[:, 0] * line_unit[1] - rel[:, 1] * line_unit[0]
    abs_cross = np.abs(cross)
    max_idx = int(np.argmax(abs_cross))
    max_bend_distance = float(abs_cross[max_idx])
    bend_point = contour_pts[max_idx]

    bend_percentage = (max_bend_distance / straight_line_distance) * 100.0
    bend_percentage = float(clip(bend_percentage, 0.0, 300.0))

    if bend_percentage <= 8:
        curvature = "STRAIGHT"
    elif bend_percentage <= 18:
        curvature = "SLIGHTLY CURVED"
    elif bend_percentage <= 30:
        curvature = "CURVED"
    else:
        curvature = "EXTREMELY CURVED"

    return {
        "p1": p1,
        "p2": p2,
        "bend_point": bend_point,
        "straight_line_distance": straight_line_distance,
        "max_bend_distance": max_bend_distance,
        "bend_percentage": round(bend_percentage, 1),
        "curvature": curvature,
    }


def draw_annotations(img, contour, curve):
    out = img.copy()
    cv2.drawContours(out, [contour], -1, (0, 200, 0), 3)  # GREEN outline

    p1 = tuple(np.round(curve["p1"]).astype(int))
    p2 = tuple(np.round(curve["p2"]).astype(int))
    cv2.line(out, p1, p2, (255, 90, 0), 2, lineType=cv2.LINE_AA)  # BLUE reference line

    bp = tuple(np.round(curve["bend_point"]).astype(int))
    cv2.circle(out, bp, 8, (0, 0, 255), -1, lineType=cv2.LINE_AA)  # RED max bend point
    cv2.circle(out, bp, 11, (255, 255, 255), 2, lineType=cv2.LINE_AA)

    label = "{}%  {}".format(curve["bend_percentage"], curve["curvature"])
    (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
    ox, oy = 12, 12
    cv2.rectangle(out, (ox - 6, oy - 6), (ox + tw + 6, oy + th + 12), (20, 20, 20), -1)
    cv2.putText(out, label, (ox, oy + th), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 230, 255), 2, cv2.LINE_AA)
    return out


# --------------------------------------------------------------------------
# Deliberately useless AI judgement
# --------------------------------------------------------------------------

MOOD_BASE = ["HAPPY", "CONFUSED", "SLEEPY", "SUSPICIOUS"]
MOOD_DRAMATIC = ["DRAMATIC", "ANGRY", "EXISTENTIALLY CONFUSED"]

PERSONALITY_BASE = ["LAZY", "ROMANTIC", "INTROVERTED", "VERY SERIOUS"]
PERSONALITY_DRAMATIC = ["OVERCONFIDENT", "CHAOTIC", "DRAMATIC"]

RELATIONSHIPS = ["SINGLE", "IT'S COMPLICATED", "LOOKING FOR AN APPLE", "MARRIED TO A MANGO", "FRUIT ZONE"]
HOROSCOPES = ["BANANA", "LEO", "FRUIT GEMINI", "POTATO MOON", "MANGO RISING", "BANANA ASCENDANT"]

ADDITIONAL_CHARGE_POOL = [
    ("high_drama", "Unnecessary Drama"),
    ("low_solidity", "Suspicious Shape"),
    ("chaotic_personality", "Excessive Banana Attitude"),
    ("high_danger", "Reckless Endangerment of the Fruit Bowl"),
    ("high_beauty", "Aggravated Attractiveness"),
    ("low_seriousness", "Contempt of Fruit Court"),
    ("generic_1", "Loitering Near the Apples"),
    ("generic_2", "Impersonating a Plantain"),
    ("generic_3", "Failure to Ripen on Schedule"),
]

SENTENCES = [
    "3 days in the fruit basket.",
    "Banned from smoothies for a week.",
    "Mandatory time-out on the counter.",
    "Community service peeling for others.",
    "House arrest in the fruit bowl.",
    "Public shaming at the farmers market.",
]

FORTUNE_TODAY = [
    "You will encounter an apple. Proceed with caution.",
    "A stranger will compliment your peel.",
    "Today holds mild, unearned confidence.",
    "You will be photographed without consent.",
    "Someone nearby is thinking about smoothies.",
]
FORTUNE_CAREER = [
    "Professional fruit bowl member.",
    "Rising star of the lunchbox.",
    "Executive Vice President of Potassium.",
    "Understudy to the pineapple.",
]
FORTUNE_LOVE = [
    "Someone will peel your heart.",
    "Love is ripening slowly.",
    "A mango is watching you from across the bowl.",
    "Your soulmate may already be in the fridge.",
]
LUCKY_FRUITS = ["Mango", "Kiwi", "Papaya", "Dragonfruit", "Plantain", "Lychee"]

USELESSNESS_LINES = [
    "Mission accomplished.",
    "This system has solved absolutely nothing.",
    "Congratulations. You spent computing power judging a banana.",
    "Humanity definitely needed this.",
    "The banana has been judged. Society may now continue.",
]


def biased_choice(rng, base_pool, dramatic_pool, drama_weight):
    """drama_weight in [0,1]; higher pushes toward the 'dramatic' pool."""
    if rng.random() < clip(drama_weight, 0.05, 0.95):
        return rng.choice(dramatic_pool)
    return rng.choice(base_pool)


def judge_banana(rng, feat, curve):
    bend = curve["bend_percentage"]
    curvature = curve["curvature"]
    solidity = feat["solidity"]

    drama_weight = clip(bend / 45.0, 0.0, 1.0)

    beauty = int(round(clip(50 + solidity * 45 + rng.uniform(-6, 6), 50, 99)))
    danger = round(clip((bend / 30.0) * 5.0 + rng.uniform(-0.4, 0.4), 0.0, 5.0), 1)
    intelligence = int(clip(rng.randint(50, 99) - int(drama_weight * 8), 50, 99))
    seriousness = int(clip(30 - bend * 0.5 + rng.uniform(-4, 4), 0, 30))
    drama = int(clip(50 + bend * 1.1 + rng.uniform(-5, 5), 50, 100))

    mood = biased_choice(rng, MOOD_BASE, MOOD_DRAMATIC, drama_weight)
    personality = biased_choice(rng, PERSONALITY_BASE, PERSONALITY_DRAMATIC, drama_weight)
    relationship = rng.choice(RELATIONSHIPS)
    horoscope = rng.choice(HOROSCOPES)

    overall_score = int(round(clip(
        0.30 * beauty + 0.25 * drama + 0.20 * intelligence
        + 0.15 * (100 - seriousness) + 0.10 * (100 - danger * 10),
        0, 100
    )))

    return {
        "beauty": beauty,
        "danger": danger,
        "intelligence": intelligence,
        "seriousness": seriousness,
        "drama": drama,
        "mood": mood,
        "personality": personality,
        "relationship": relationship,
        "horoscope": horoscope,
        "overall_score": overall_score,
    }


def build_court_case(rng, banana_id, curve, judgement):
    bend = curve["bend_percentage"]
    curvature = curve["curvature"]

    if curvature in ("EXTREMELY CURVED", "CURVED"):
        charge = "Excessive Curvature"
    elif curvature == "STRAIGHT":
        charge = "Suspicious Lack of Character"
    else:
        charge = "Mild Structural Deviation"

    eligible = []
    if judgement["drama"] > 80:
        eligible.append("Unnecessary Drama")
    if judgement.get("solidity_low"):
        eligible.append("Suspicious Shape")
    if judgement["personality"] == "CHAOTIC":
        eligible.append("Excessive Banana Attitude")
    if judgement["danger"] > 3:
        eligible.append("Reckless Endangerment of the Fruit Bowl")
    if judgement["beauty"] > 90:
        eligible.append("Aggravated Attractiveness")
    if judgement["seriousness"] < 6:
        eligible.append("Contempt of Fruit Court")

    generic = [c for _, c in ADDITIONAL_CHARGE_POOL if c.startswith(("Loitering", "Impersonating", "Failure"))]
    pool = eligible if eligible else []
    while len(pool) < 2:
        pick = rng.choice(generic)
        if pick not in pool:
            pool.append(pick)
    rng.shuffle(pool)
    additional_charges = pool[:3]

    case_number = "BAN-{:04d}".format((banana_id * 37 + rng.randint(0, 999)) % 10000)

    return {
        "case_number": case_number,
        "defendant": "Banana #{:03d}".format(banana_id),
        "charge": charge,
        "evidence_bend": bend,
        "additional_charges": additional_charges,
        "sentence": rng.choice(SENTENCES),
    }


def build_fortune(rng):
    return {
        "today": rng.choice(FORTUNE_TODAY),
        "tomorrow": rng.choice(FORTUNE_TODAY),
        "career": rng.choice(FORTUNE_CAREER),
        "love": rng.choice(FORTUNE_LOVE),
        "lucky_fruit": rng.choice(LUCKY_FRUITS),
        "lucky_number": rng.randint(1, 99),
        "destiny": rng.choice([
            "Become a legendary banana.",
            "Achieve peak ripeness and retire peacefully.",
            "Star in a smoothie no one will remember.",
            "Be the last banana in the bunch. Always.",
        ]),
    }


# --------------------------------------------------------------------------
# Statistics
# --------------------------------------------------------------------------

def record_stats(banana_id, curve, judgement):
    with STATS_LOCK:
        STATS["total"] += 1
        STATS["bend_sum"] += curve["bend_percentage"]
        STATS["beauty_sum"] += judgement["beauty"]
        STATS["uselessness_sum"] += 99.7

        if curve["bend_percentage"] > STATS["most_curved"]["value"]:
            STATS["most_curved"] = {"value": curve["bend_percentage"], "id": banana_id}

        if judgement["drama"] > STATS["most_dramatic"]["value"]:
            STATS["most_dramatic"] = {"value": judgement["drama"], "id": banana_id}

        if judgement["danger"] > STATS["most_dangerous"]["value"]:
            STATS["most_dangerous"] = {"value": judgement["danger"], "id": banana_id}

        if judgement["overall_score"] > STATS["champion"]["value"]:
            STATS["champion"] = {"value": judgement["overall_score"], "id": banana_id}

        STATS["mood_counts"][judgement["mood"]] = STATS["mood_counts"].get(judgement["mood"], 0) + 1
        STATS["personality_counts"][judgement["personality"]] = STATS["personality_counts"].get(judgement["personality"], 0) + 1


def most_common(counter_dict, default="N/A"):
    if not counter_dict:
        return default
    return max(counter_dict.items(), key=lambda kv: kv[1])[0]


def stats_snapshot():
    with STATS_LOCK:
        total = STATS["total"]
        if total == 0:
            return {
                "total": 0,
                "average_bend": 0.0,
                "most_curved": 0.0,
                "average_beauty": 0,
                "most_common_mood": "N/A",
                "most_common_personality": "N/A",
                "average_uselessness": 99.7,
                "most_dramatic_id": None,
                "most_dangerous_id": None,
                "champion_id": None,
            }
        return {
            "total": total,
            "average_bend": round(STATS["bend_sum"] / total, 1),
            "most_curved": round(STATS["most_curved"]["value"], 1),
            "average_beauty": round(STATS["beauty_sum"] / total),
            "most_common_mood": most_common(STATS["mood_counts"]),
            "most_common_personality": most_common(STATS["personality_counts"]),
            "average_uselessness": round(STATS["uselessness_sum"] / total, 1),
            "most_dramatic_id": STATS["most_dramatic"]["id"],
            "most_dangerous_id": STATS["most_dangerous"]["id"],
            "champion_id": STATS["champion"]["id"],
        }


# --------------------------------------------------------------------------
# Core single-image pipeline (shared by /analyze and /compatibility)
# --------------------------------------------------------------------------

class BananaNotFound(Exception):
    pass


def process_single_image(file_storage, salt=""):
    if file_storage is None or file_storage.filename == "":
        raise ValueError("No image was provided.")

    filename = secure_filename(file_storage.filename)
    if not allowed_file(filename):
        raise ValueError("Unsupported file type. Please upload a JPG or PNG.")

    img, raw = decode_image(file_storage)
    if img is None or img.size == 0:
        raise ValueError("That file could not be read as an image.")

    img = resize_for_processing(img)

    banana_detected, banana_confidence = detect_banana_with_yolo(img)
    if not banana_detected:
        raise BananaNotFound("🍌 BANANA NOT DETECTED\nOnly bananas are allowed here.")

    contour, feat, _, _ = locate_banana_contour(img)
    if contour is None:
        raise ValueError("YOLO detected a banana, but contour analysis could not process it.")

    curve = analyze_curvature(contour)

    rng = seeded_rng(raw, salt=salt)
    judgement = judge_banana(rng, feat, curve)
    judgement["solidity_low"] = feat["solidity"] < 0.90

    annotated = draw_annotations(img, contour, curve)

    out_name = "{}.jpg".format(uuid.uuid4().hex)
    out_path = os.path.join(UPLOAD_DIR, out_name)
    cv2.imwrite(out_path, annotated, [cv2.IMWRITE_JPEG_QUALITY, 88])

    return {
        "detected": True,
        "confidence": round(banana_confidence, 2),
        "feat": feat,
        "curve": curve,
        "judgement": judgement,
        "rng": rng,
        "image_url": "/uploads/{}".format(out_name),
    }


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/uploads/<path:filename>")
def serve_upload(filename):
    return send_from_directory(UPLOAD_DIR, filename)


@app.route("/analyze", methods=["POST"])
def analyze():
    try:
        file_storage = request.files.get("image")
        result = process_single_image(file_storage)

        if not result["detected"]:
            return jsonify({
                "success": True,
                "banana_detected": False,
                "message": "🍌 BANANA NOT DETECTED\nOnly bananas are allowed here.",
            })

        banana_id = next_banana_id()
        curve = result["curve"]
        judgement = result["judgement"]
        record_stats(banana_id, curve, judgement)

        court = build_court_case(result["rng"], banana_id, curve, judgement)

        response = {
            "success": True,
            "banana_detected": True,
            "banana_id": "Banana #{:03d}".format(banana_id),
            "bend": curve["bend_percentage"],
            "curvature": curve["curvature"],
            "beauty": judgement["beauty"],
            "mood": judgement["mood"],
            "personality": judgement["personality"],
            "relationship": judgement["relationship"],
            "horoscope": judgement["horoscope"],
            "danger": judgement["danger"],
            "intelligence": judgement["intelligence"],
            "seriousness": judgement["seriousness"],
            "drama": judgement["drama"],
            "overall_score": judgement["overall_score"],
            "confidence": result["confidence"],
            "image": result["image_url"],
            "court": court,
        }
        return jsonify(response)

    except BananaNotFound as e:
        return jsonify({"success": True, "banana_detected": False, "message": str(e)})
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400
    except cv2.error:
        traceback.print_exc()
        return jsonify({"success": False, "error": "The image processor hit a snag. Please try a different photo."}), 500
    except Exception:
        traceback.print_exc()
        return jsonify({"success": False, "error": "Something went wrong on our end. Please try again."}), 500


@app.route("/compatibility", methods=["POST"])
def compatibility():
    try:
        file_a = request.files.get("image1")
        file_b = request.files.get("image2")
        if file_a is None or file_b is None:
            return jsonify({"success": False, "error": "Please provide two banana images."}), 400

        result_a = process_single_image(file_a, salt="A")
        result_b = process_single_image(file_b, salt="B")

        if not result_a["detected"] or not result_b["detected"]:
            return jsonify({
                "success": True,
                "banana_detected": False,
                "message": "🍌 BANANA NOT DETECTED\nOnly bananas are allowed here.",
            })

        curve_a, curve_b = result_a["curve"], result_b["curve"]
        j_a, j_b = result_a["judgement"], result_b["judgement"]
        area_a, area_b = result_a["feat"]["area"], result_b["feat"]["area"]

        diff_bend = abs(curve_a["bend_percentage"] - curve_b["bend_percentage"])
        diff_beauty = abs(j_a["beauty"] - j_b["beauty"])
        diff_size = abs(area_a - area_b) / max(area_a, area_b, 1.0)

        combined_seed_bytes = (
            str(curve_a["bend_percentage"]).encode() + str(curve_b["bend_percentage"]).encode()
            + j_a["mood"].encode() + j_b["mood"].encode()
        )
        rng = seeded_rng(combined_seed_bytes, salt="compat")

        score = 100.0
        score -= diff_bend * 0.55
        score -= diff_beauty * 0.45
        score -= diff_size * 100 * 0.5
        score += rng.uniform(-5, 5)
        compatibility_score = int(round(clip(score, 0, 100)))

        if compatibility_score >= 90:
            status = "Perfect Banana Match"
        elif compatibility_score >= 75:
            status = "Fruit Soulmates"
        elif compatibility_score >= 60:
            status = "Best Friends"
        elif compatibility_score >= 45:
            status = "It's Complicated"
        elif compatibility_score >= 30:
            status = "Opposites Attract"
        elif compatibility_score >= 15:
            status = "Toxic Fruit Relationship"
        else:
            status = "They Should Stay Apart"

        return jsonify({
            "success": True,
            "banana_detected": True,
            "banana_a": {
                "bend": curve_a["bend_percentage"],
                "curvature": curve_a["curvature"],
                "beauty": j_a["beauty"],
                "personality": j_a["personality"],
                "image": result_a["image_url"],
            },
            "banana_b": {
                "bend": curve_b["bend_percentage"],
                "curvature": curve_b["curvature"],
                "beauty": j_b["beauty"],
                "personality": j_b["personality"],
                "image": result_b["image_url"],
            },
            "compatibility": compatibility_score,
            "relationship_status": status,
        })

    except BananaNotFound:
        return jsonify({"success": True, "banana_detected": False,
                         "message": "🍌 BANANA NOT DETECTED\nOnly bananas are allowed here."})
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400
    except cv2.error:
        traceback.print_exc()
        return jsonify({"success": False, "error": "The image processor hit a snag. Please try different photos."}), 500
    except Exception:
        traceback.print_exc()
        return jsonify({"success": False, "error": "Something went wrong on our end. Please try again."}), 500


@app.route("/fortune", methods=["GET"])
def fortune():
    rng = random.Random(int(time.time() * 1000) ^ os.getpid())
    return jsonify({"success": True, "fortune": build_fortune(rng)})


@app.route("/stats", methods=["GET"])
def stats():
    return jsonify({"success": True, "stats": stats_snapshot()})


@app.errorhandler(413)
def too_large(e):
    return jsonify({"success": False, "error": "That image is too large. Please upload a file under 12MB."}), 413


@app.errorhandler(404)
def not_found(e):
    return jsonify({"success": False, "error": "Not found."}), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({"success": False, "error": "Internal server error."}), 500


if __name__ == "__main__":
    print("Starting Banana AI Judge on http://127.0.0.1:5000")
    app.run(host="127.0.0.1", port=5000, debug=False)
