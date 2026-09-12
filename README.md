# Banana AI Judge 

# Basic Details

# Team Name: Nexora

# Team Members

Member 1: KARTHIK SANKAR - CALICUT UNIVERSITY OF INSTITUTE AND ENGINEERING TECHNOLOGY
Member 2: ABHINAV TP - CALICUT UNIVERSITY OF INSTITUTE AND ENGINEERING TECHNOLOGY

# Project Description
Banana AI Judge is a fun Flask web app that lets users upload banana photos, checks whether the image contains a banana using YOLO-based detection, and then analyzes the banana's bend, curvature, and personality-like stats. The project combines computer vision, a silly judge system, compatibility testing, fortune telling, and a useless but entertaining survival mini-game.

# The Problem (that doesn't exist)
The world does not actually need another banana analysis tool, but if it is going to exist, it should at least be accurate about one very important thing: only bananas should be accepted. The original project had a shape-based detector that could mistakenly accept non-banana objects, so we upgraded it to a strict banana-only detection gate.

# The Solution (that nobody asked for)
We built a Banana AI Judge that uses a real pretrained YOLO object detection model to confirm the presence of a banana before any analysis begins. Once a banana is detected, the app keeps the existing Banana AI Judge workflow, compatibility animation, statistics, funny verdicts, and the Banana Survival Test game intact.

## Technical Details

### Technologies/Components Used
For Software:

- Python
- Flask
- OpenCV
- NumPy
- Ultralytics YOLO
- HTML, CSS, JavaScript
- Jinja2 templates

For Hardware:

- No special hardware required
- Works on a standard laptop/desktop computer
- Internet connection only needed for first-time YOLO model download

### Implementation
For Software:

# Installation

```bash
pip install -r requirements.txt
```

# Run

```bash
python app.py
```

Then open:

```text
http://127.0.0.1:5000
```

### Project Documentation
For Software:

- `app.py` handles the Flask backend, YOLO banana detection, banana analysis, compatibility endpoint, statistics, and routes.
- `templates/index.html` contains the web UI structure.
- `static/style.css` contains the styling, animations, and mini-game visuals.
- `static/script.js` handles frontend interactions, compatibility animation, and the Banana Survival Test game.

# Screenshots (Add at least 3)

![Screenshot1](<img width="1916" height="897" alt="er" src="https://github.com/user-attachments/assets/974f4b6a-15c7-4934-a54f-85c37709cfa2" />
) 

![Screenshot2](<img width="1907" height="928" alt="sxd" src="https://github.com/user-attachments/assets/462344aa-2ad8-4fed-ace9-2927e86bbd2b" />
) 

![Screenshot3](<img width="1225" height="767" alt="w" src="https://github.com/user-attachments/assets/164122c9-e18d-4755-858a-5207eb68c820" />
) 

# Diagrams

![Workflow](
                Upload Image
                     │
                     ▼
              Banana Detection
                     │
             ┌───────┴───────┐
             │               │
       Banana Found      No Banana
             │               │
             ▼               ▼
      OpenCV Analysis    Reject Image
             │
             ▼
      Curvature Analysis
             │
             ▼
       Banana AI Judge
             │
             ▼
       Funny Results
) *

For Hardware:

# Schematic & Circuit

![Circuit](circuit.png) *No hardware circuit required for this software-only project.*

![Schematic](schematic.png) *No hardware schematic required for this software-only project.*

# Build Photos

![Components](components.png) *No external physical components required for this project.*

![Build](build.png) *Software build process only: install dependencies, run Flask app, and open the local webpage.*

![Final](final.png) *Final working Banana AI Judge application with banana-only detection and all existing frontend features.*
