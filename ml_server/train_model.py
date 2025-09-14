# train_model.py
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
import joblib

# Load your dataset
df = pd.read_csv("synthetic_weight_dataset.csv")

# Assuming dataset has columns: measure_reading, sensor_reading, tampered
X = df[["Sensor_reading", "Measured_weight"]]
y = df["True class"]

# Train/test split
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# Train a model
model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

# Test accuracy
print("Accuracy:", model.score(X_test, y_test))

# Save model properly
joblib.dump(model, "tampering_model.pkl")
print("✅ Model saved to tampering_model.pkl")
