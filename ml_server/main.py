
# Flask server for tamper detection ML model + Firebase logging

import joblib
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
import datetime

# Firebase Admin
import firebase_admin
from firebase_admin import credentials, db

# ========================
# CONFIG
# ========================

MODEL_FILENAME = "tampering_model.pkl"   # trained ML model
SERVICE_KEY = "serviceAccountKey.json"   # firebase service account
DATABASE_URL = "https://namma-project-b6b64-default-rtdb.asia-southeast1.firebasedatabase.app/"
API_KEY = "xxxxxxxxxxxx" #  API key protection

# ========================
# LOAD MODEL
# ========================
model = joblib.load(MODEL_FILENAME)

# expected feature names
n_features = getattr(model, "n_features_in_", None)
feature_names = list(getattr(model, "feature_names_in_", []))
if not feature_names:
    feature_names = ["measure_reading", "sensor_reading"]

# ========================
# FIREBASE INIT
# ========================
cred = credentials.Certificate(SERVICE_KEY)
firebase_admin.initialize_app(cred, {
    "databaseURL": DATABASE_URL
})

# ========================
# FLASK APP
# ========================
app = Flask(__name__)
CORS(app)
app.logger.setLevel(logging.INFO)


def check_api_key(req):
    """Check API key in request header or query"""
    if API_KEY is None:
        return True
    key = req.headers.get("x-api-key") or req.args.get("api_key")
    return key == API_KEY


@app.route("/")
def home():
    return jsonify({
        "status": "OK",
        "model": str(type(model)),
        "n_features": n_features,
        "feature_names": feature_names
    })


@app.route("/predict", methods=["POST"])
def predict():
    try:
        if not check_api_key(request):
            return jsonify({"error": "invalid_api_key"}), 401

        body = request.get_json(force=True)

        # input format: either {"features":[..]} or {"measure_reading":v1,"sensor_reading":v2}
        if isinstance(body, dict) and "features" in body:
            features = body["features"]
        elif isinstance(body, dict) and all(k in body for k in feature_names):
            features = [body[k] for k in feature_names]
        else:
            return jsonify({"error": "invalid_input_format",
                            "expected": f'{{"features":[..]}} or keys {feature_names}'}), 400

        if n_features is not None and len(features) != n_features:
            return jsonify({"error": f"expected {n_features} features, got {len(features)}"}), 400

        # dataframe for prediction
        X = pd.DataFrame([features], columns=feature_names)
        pred = model.predict(X)[0]
        result = {"prediction": int(pred)}

        if hasattr(model, "predict_proba"):
            probs = model.predict_proba(X)[0].tolist()
            result["probability"] = probs

        # log to firebase
        log_ref = db.reference("tamper_logs")
        log_data = {
            "timestamp": datetime.datetime.utcnow().isoformat(),
            "features": dict(zip(feature_names, features)),
            "prediction": int(pred),
            "probability": result.get("probability", [])
        }
        log_ref.push(log_data)

        return jsonify(result)

    except Exception as e:
        app.logger.exception("Error in /predict")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
