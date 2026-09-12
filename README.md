# Banana AI Judge

The world's most unnecessary banana analysis system. Real computer vision
(OpenCV + NumPy) detects a banana in a photo — regardless of its color —
and measures its curvature. Everything after that (mood, drama,
fortunes) is deliberately, deterministically silly.

## Setup

```
pip install -r requirements.txt
python app.py
```

Then open **http://127.0.0.1:5000** in your browser.

Works on Windows, Linux, and Android (e.g. via Termux) anywhere Python 3
and the packages in `requirements.txt` can be installed.

## How detection works (no color assumptions)

`app.py` never thresholds on hue. It combines:

- **GrabCut** foreground/background segmentation
- **Canny edges** + morphological closing as a reinforcing signal
- **Contour geometry**: aspect ratio, solidity, extent, and area

to decide whether the dominant foreground blob is "banana-shaped"
(elongated, imperfectly convex). This means green, yellow, brown,
spotted, and overripe bananas are all treated the same way. The
detection step (`locate_banana_contour`) is isolated specifically so a
trained detector (e.g. YOLO) could be dropped in ahead of it later,
handing back a bounding box/mask in the same shape.

## Curvature

The banana's convex hull gives approximate endpoints (the two hull
points farthest apart). The straight-line distance between them is the
reference. Every contour point's perpendicular distance from that line
is checked; the largest one is the "bend," and:

```
bend_percentage = max_bend_distance / straight_line_distance * 100
```

- 0–8%: STRAIGHT
- 8–18%: SLIGHTLY CURVED
- 18–30%: CURVED
- 30%+: EXTREMELY CURVED

## Endpoints

- `GET /` — the web app
- `POST /analyze` — upload one image (`image` field), get a full judgement
- `POST /compatibility` — upload two images (`image1`, `image2`), get a
  compatibility score
- `GET /fortune` — a fresh random fortune
- `GET /stats` — running session statistics
- `GET /uploads/<file>` — annotated result images

## Notes

- No database — statistics are kept in memory for the life of the
  server process.
- No paid or external APIs.
- Terminal `print()` output avoids emojis on purpose (Windows consoles
  can raise `UnicodeEncodeError` on some code pages). Emojis are used
  freely in the HTML/CSS/JS front end.
