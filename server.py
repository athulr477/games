from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os

app = Flask(__name__)
CORS(app) # Allow the browser game to talk to this script

# The file where scores are saved
DATA_FILE = "midnight_run_data.json"

def get_data():
    if not os.path.exists(DATA_FILE):
        return {"high_score": 0, "total_games": 0}
    try:
        with open(DATA_FILE, "r") as f:
            return json.load(f)
    except:
        return {"high_score": 0, "total_games": 0}

def save_data(data):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f)

@app.route('/submit_run', methods=['POST'])
def submit_run():
    incoming = request.json
    score = incoming.get('score', 0)
    
    data = get_data()
    data['total_games'] += 1
    
    message = "Run Recorded."
    if score > data['high_score']:
        data['high_score'] = score
        message = "NEW SERVER RECORD!"
        print(f"🔥 NEW RECORD: {score}m")
    else:
        print(f"Run submitted: {score}m")
    
    save_data(data)
    
    return jsonify({
        "status": "success", 
        "message": message, 
        "high_score": data['high_score']
    })

@app.route('/get_best', methods=['GET'])
def get_best():
    data = get_data()
    return jsonify({"high_score": data['high_score']})

if __name__ == '__main__':
    print("---------------------------------------")
    print("🚀 MIDNIGHT RUN SERVER ONLINE (Port 5000)")
    print("---------------------------------------")
    app.run(port=5000, debug=True)