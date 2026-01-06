from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os
import uuid
from datetime import datetime

app = Flask(__name__)
CORS(app)

RUNS_FILE = "runs.json"


# ---------- STORAGE ----------

def load_runs():
    if not os.path.exists(RUNS_FILE):
        return []
    with open(RUNS_FILE, "r") as f:
        return json.load(f)


def save_runs(runs):
    with open(RUNS_FILE, "w") as f:
        json.dump(runs, f, indent=4)


# ---------- ROUTES ----------

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "alive",
        "system": "identity-registry",
        "time": datetime.utcnow().isoformat()
    })


@app.route("/submit_run", methods=["POST"])
def submit_run():
    try:
        data = request.json

        # REQUIRED FIELDS
        required = [
            "distance",
            "duration",
            "stamina_collected",
            "max_speed",
            "identity_dropped"
        ]

        for field in required:
            if field not in data:
                return jsonify({
                    "status": "error",
                    "message": f"Missing field: {field}"
                }), 400

        # STORY RULE: IDENTITY MUST BE DROPPED
        if not data["identity_dropped"]:
            return jsonify({
                "status": "rejected",
                "message": "Identity not discarded"
            }), 400

        distance = float(data["distance"])
        duration = float(data["duration"])
        stamina = int(data["stamina_collected"])
        max_speed = float(data["max_speed"])

        # BASIC VALIDATION (ANTI-NONSENSE)
        if distance < 0 or distance > 200000:
            return jsonify({"status": "error", "message": "Invalid distance"}), 400

        if duration <= 0 or duration > 3600:
            return jsonify({"status": "error", "message": "Invalid duration"}), 400

        if stamina < 0 or stamina > 1000:
            return jsonify({"status": "error", "message": "Invalid stamina count"}), 400

        if max_speed < 0 or max_speed > 100:
            return jsonify({"status": "error", "message": "Invalid speed"}), 400

        run = {
            "run_id": str(uuid.uuid4()),
            "timestamp": datetime.utcnow().isoformat(),
            "distance": distance,
            "duration": duration,
            "stamina_collected": stamina,
            "max_speed": max_speed
        }

        runs = load_runs()
        runs.append(run)
        save_runs(runs)

        print(
            f"🟢 RUN ACCEPTED | Dist: {distance}m | Time: {duration}s | "
            f"Stamina: {stamina} | MaxSpeed: {max_speed}"
        )

        return jsonify({
            "status": "accepted",
            "message": "Run recorded",
            "run_id": run["run_id"]
        }), 201

    except Exception as e:
        print("❌ SERVER ERROR:", e)
        return jsonify({
            "status": "error",
            "message": "Internal server error"
        }), 500


@app.route("/leaderboard", methods=["GET"])
def leaderboard():
    runs = load_runs()
    top = sorted(runs, key=lambda r: r["distance"], reverse=True)[:10]
    return jsonify(top)


# ---------- START ----------

if __name__ == "__main__":
    print("🔥 MIDNIGHT RUN // VECTOR — SYSTEM ONLINE (PORT 5000)")
    app.run(debug=True, port=5000)

#hello