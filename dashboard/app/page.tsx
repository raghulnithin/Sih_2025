"use client";
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle,
  Clock,
  Database,
  Eye,
  Lock,
  Settings,
  Shield,
  Unlock,
  Wifi,
  WifiOff,
  XCircle
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Scatter } from 'react-chartjs-2';
import Papa from 'papaparse';
import { initializeApp } from "firebase/app";
import {  getDatabase, ref, query, limitToLast, onValue  } from "firebase/database";

import { Chart, PointElement, LinearScale, Title, Tooltip, Legend } from 'chart.js';
Chart.register(PointElement, LinearScale, Title, Tooltip, Legend);

interface Device {
  id: string;
  name: string;
  location: string;
  status: 'secure' | 'alert' | 'tampered';
  lastUpdate: string;
  coordinates: string;
  tamperAttempts: number;
  firmwareVersion: string;
  connectivity: 'online' | 'offline';
  batteryLevel: number;
  calibrationStatus: 'valid' | 'drift_detected' | 'invalid';
  sensorStatus?: SensorStatus;
}
interface SensorStatus {
  photoStatus: string | null;
  sealStatus: string | null;
  hallStatus: string | null;
  firmwareStatus: string | null;
}
interface TamperLog {
  timestamp: string;
  prediction: number;
  features: Record<string, number>;
  probability?: number[];
}

interface Alert {
  id: number;
  deviceId: string;
  type: string;
  severity: 'critical' | 'high' | 'warning';
  message: string;
  timestamp: string;
  acknowledged: boolean;
}
interface WeightRow {
  Measured_weight: number;
  True_class: number;
}


const firebaseConfig = {
  apiKey: "AIzaSyDqbj-3g88QOItV_wFaDMKAvDWxRM8F4Jo",
  authDomain: "namma-project-b6b64.firebaseapp.com",
  databaseURL: "https://namma-project-b6b64-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "namma-project-b6b64",
  storageBucket: "namma-project-b6b64.firebasestorage.app",
  messagingSenderId: "714971623609",
  appId: "1:714971623609:web:xxxxxxxxxxxxxx"
};

const TamperDetectionDashboard = () => {
  const [devices, setDevices] = useState<Device[]>([
    {
      id: 'WS001',
      name: 'Digital Scale - Market A',
      location: 'Chennai Central Market',
      status: 'secure', 
      lastUpdate: '2 mins ago',
      coordinates: '13.0827, 80.2707',
      tamperAttempts: 0,
      firmwareVersion: 'v2.1.3',
      connectivity: 'online',
      batteryLevel: 87,
      calibrationStatus: 'valid',
      sensorStatus: { photoStatus: null, sealStatus: null, hallStatus: null, firmwareStatus: null }
    },
    {
      id: 'WS002',
      name: 'Electronic Balance - Shop B',
      location: 'T. Nagar Commercial',
      status: 'alert',
      lastUpdate: '5 mins ago',
      coordinates: '13.0418, 80.2341',
      tamperAttempts: 1,
      firmwareVersion: 'v2.1.3',
      connectivity: 'online',
      batteryLevel: 92,
      calibrationStatus: 'drift_detected',
      sensorStatus: { 
      photoStatus: 'secure', 
      sealStatus: 'tampered', 
      hallStatus: 'secure', 
      firmwareStatus: 'secure' 
    }
    },
    {
      id: 'WS003',
      name: 'Industrial Scale - Warehouse C',
      location: 'Guindy Industrial Area',
      status: 'tampered',
      lastUpdate: '12 mins ago',
      coordinates: '13.0067, 80.2206',
      tamperAttempts: 3,
      firmwareVersion: 'v2.1.2',
      connectivity: 'offline',
      batteryLevel: 45,
      calibrationStatus: 'invalid',
      sensorStatus: { photoStatus: 'tampered', sealStatus: 'secure', hallStatus: 'tampered_magnetic', firmwareStatus: 'tampered' }
    },
    {
      id: 'WS004',
      name: 'Precision Scale - Lab D',
      location: 'Anna University Lab',
      status: 'secure',
      lastUpdate: '1 min ago',
      coordinates: '13.0117, 80.2359',
      tamperAttempts: 0,
      firmwareVersion: 'v2.1.3',
      connectivity: 'online',
      batteryLevel: 78,
      calibrationStatus: 'valid',
      sensorStatus: { photoStatus: 'secure', sealStatus: 'tampered', hallStatus: 'secure', firmwareStatus: 'secure' }
    }
  ]);
  const [alerts, setAlerts] = useState<Alert[]>([
    {
      id: 1,
      deviceId: 'WS003',
      type: 'physical_tamper',
      severity: 'critical',
      message: 'Physical seal broken - Device casing opened',
      timestamp: '2024-09-08 14:23:15',
      acknowledged: false
    },
    {
      id: 2,
      deviceId: 'WS002',
      type: 'calibration_drift',
      severity: 'warning',
      message: 'Calibration drift detected - 0.02% deviation',
      timestamp: '2024-09-08 14:18:42',
      acknowledged: false
    },
    {
      id: 3,
      deviceId: 'WS003',
      type: 'firmware_change',
      severity: 'critical',
      message: 'Unauthorized firmware modification attempt',
      timestamp: '2024-09-08 14:15:33',
      acknowledged: false
    },
    {
      id: 4,
      deviceId: 'WS003',
      type: 'connectivity',
      severity: 'high',
      message: 'Device connectivity lost - Possible tampering',
      timestamp: '2024-09-08 14:11:28',
      acknowledged: true
    }
  ]);

  const [sensorLogs, setSensorLogs] = useState<{ timestamp: string; status: string }[]>([]);
  const secureDevices = devices.filter(d => d.status === 'secure').length;
  const alertDevices = devices.filter(d => d.status === 'alert').length;
  const tamperedDevices = devices.filter(d => d.status === 'tampered').length;
  const [sealStatus, setSealStatus] = useState<string | null>(null);
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);
  const [hallStatus, setHallStatus] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<Device>(devices[0]);
  const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'blockchain'>('overview');
  const [weightData, setWeightData] = useState<{Measured_weight: number, True_class: number}[]>([]);
  const [firmwareStatus, setFirmwareStatus] = useState<string | null>(null);
  const [mlPrediction, setMlPrediction] = useState<{prediction?: number, probability?: number[]} | null>(null);
  const [log, setLog] = useState<any | null>(null);


  // const [chartView, setChartView] = useState<'scatter' | 'accuracy' | 'distribution'>('scatter');
  
 

  useEffect(() => {
    const logsRef = query(ref(db, "tamper_logs"), limitToLast(1));

    const unsubscribe = onValue(logsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const lastLog = Object.values(data)[0];
        setLog(lastLog);
      }
    });

    return () => unsubscribe();
  }, []);
  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setDevices(prev => prev.map(device => ({
        ...device,
        lastUpdate: Math.random() > 0.7 ? `${Math.floor(Math.random() * 10) + 1} mins ago` : device.lastUpdate,
        batteryLevel: device.connectivity === 'online' ? 
          Math.max(20, Math.min(100, device.batteryLevel + (Math.random() > 0.5 ? 1 : -1))) : 
          device.batteryLevel
      })));
    }, 5000);

    return () => clearInterval(interval);
  }, []);
  // Firebase Realtime Database for tamper sensor logs
  useEffect(() => {
  // ---- Photodiode ----
  const photoRef = ref(db, "photodiode");
  onValue(photoRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const logs = Object.entries(data).map(([ts, v]: any) => ({
        timestamp: ts,
        status: v.status,
      }));
      logs.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
      if (logs[0]) {
        const status = logs[0].status ?? null;
        setPhotoStatus(status);

        setDevices(prev =>
          prev.map(d =>
            d.id === "WS001"
              ? {
                  ...d,
                  sensorStatus: {
                    photoStatus: status,
                    sealStatus: d.sensorStatus?.sealStatus ?? null,
                    hallStatus: d.sensorStatus?.hallStatus ?? null,
                    firmwareStatus: d.sensorStatus?.firmwareStatus ?? null,
                  },
                }
              : d
          )
        );
      }
    }
  });

  // ---- Wire Seal ----
  const sealRef = ref(db, "wireseal");
  onValue(sealRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const logs = Object.entries(data).map(([ts, v]: any) => ({
        timestamp: ts,
        status: v.status,
      }));
      logs.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
      if (logs[0]) {
        const status = logs[0].status ?? null;
        setSealStatus(status);

        setDevices(prev =>
          prev.map(d =>
            d.id === "WS001"
              ? {
                  ...d,
                  sensorStatus: {
                    photoStatus: d.sensorStatus?.photoStatus ?? null,
                    sealStatus: status,
                    hallStatus: d.sensorStatus?.hallStatus ?? null,
                    firmwareStatus: d.sensorStatus?.firmwareStatus ?? null,
                  },
                }
              : d
          )
        );
      }
    }
  });

  // ---- Hall Sensor ----
  const hallRef = ref(db, "hallsensor");
  onValue(hallRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const logs = Object.entries(data).map(([ts, v]: any) => ({
        timestamp: ts,
        status: v.status,
      }));
      logs.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
      if (logs[0]) {
        const status = logs[0].status ?? null;
        setHallStatus(status);

        setDevices(prev =>
          prev.map(d =>
            d.id === "WS001"
              ? {
                  ...d,
                  sensorStatus: {
                    photoStatus: d.sensorStatus?.photoStatus ?? null,
                    sealStatus: d.sensorStatus?.sealStatus ?? null,
                    hallStatus: status,
                    firmwareStatus: d.sensorStatus?.firmwareStatus ?? null,
                  },
                }
              : d
          )
        );
      }
    }
  });

  // ---- Firmware ----
  const firmwareRef = ref(db, "firmware");
  onValue(firmwareRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const logs = Object.entries(data).map(([ts, v]: any) => ({
        timestamp: ts,
        status: v.status,
      }));
      logs.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
      if (logs[0]) {
        const status = logs[0].status ?? null;
        setFirmwareStatus(status);

        setDevices(prev =>
          prev.map(d =>
            d.id === "WS001"
              ? {
                  ...d,
                  sensorStatus: {
                    photoStatus: d.sensorStatus?.photoStatus ?? null,
                    sealStatus: d.sensorStatus?.sealStatus ?? null,
                    hallStatus: d.sensorStatus?.hallStatus ?? null,
                    firmwareStatus: status,
                  },
                }
              : d
          )
        );
      }
    }
  });
}, []);

async function fetchPrediction() {
  try {
    const res = await fetch("http://192.168.32.193:5000/predict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.NEXT_PUBLIC_API_KEY || ""
      },
      // Example: send tamperAttempts + batteryLevel as features
      body: JSON.stringify({ features: [selectedDevice.tamperAttempts, selectedDevice.batteryLevel] }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    setMlPrediction(data);
  } catch (err) {
    console.error("Prediction fetch failed:", err);
    setMlPrediction({ prediction: -1 });
  }
}

  // Load CSV data
  useEffect(() => {
  fetch("/synthetic_weight_dataset.csv")
    .then((res) => res.text())
    .then((csv) => {
      Papa.parse<WeightRow>(csv, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          setWeightData(
            results.data
              .filter(
                (row) =>
                  typeof row.Measured_weight === "number" &&
                  !isNaN(row.Measured_weight) &&
                  typeof row.True_class === "number" &&
                  !isNaN(row.True_class)
              )
              .map((row) => ({
                Measured_weight: row.Measured_weight,
                True_class: row.True_class,
              }))
          );
        },
      });
    })
    .catch((err) => {
      console.error("Error loading CSV:", err);
      setWeightData([]);
    });
}, []);

  // Chart data for scatter plot - change as needed for other chart types
  const scatterData = {
    datasets: [
      {
        label: 'Measured vs True Class',
        data: weightData.map(d => ({
          x: d.True_class,
          y: d.Measured_weight
        })),
        backgroundColor: 'rgba(37, 99, 235, 0.7)',
      }
    ]
  };

  const scatterOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: 'Measured Weight vs True Class'
      }
    },
    scales: {
      x: {
        title: { display: true, text: 'True Class (g)' }
      },
      y: {
        title: { display: true, text: 'Measured Weight (g)' }
      }
    }
  };

  const getStatusColor = (status: Device['status']): string => {
    switch (status) {
      case 'secure': return 'text-green-600 bg-green-100';
      case 'alert': return 'text-yellow-600 bg-yellow-100';
      case 'tampered': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getSeverityColor = (severity: Alert['severity']): string => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-100 border-red-300';
      case 'high': return 'text-orange-600 bg-orange-100 border-orange-300';
      case 'warning': return 'text-yellow-600 bg-yellow-100 border-yellow-300';
      default: return 'text-gray-600 bg-gray-100 border-gray-300';
    }
  };

  const acknowledgeAlert = (alertId: number): void => {
    setAlerts(prev => prev.map(alert => 
      alert.id === alertId ? { ...alert, acknowledged: true } : alert
    ));
  };

  const totalDevices = devices.length;
  const unacknowledgedAlerts = alerts.filter(a => !a.acknowledged).length;

  // Add null checks for selectedDevice
  if (!selectedDevice) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <Shield className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Legal Metrology Dashboard</h1>
                <p className="text-sm text-gray-500">Tamper Detection & Monitoring System</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Bell className="h-6 w-6 text-gray-400 hover:text-gray-600 cursor-pointer" />
                {unacknowledgedAlerts > 0 && (
                  <span className="absolute -top-2 -right-2 h-5 w-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">
                    {unacknowledgedAlerts}
                  </span>
                )}
              </div>
              <Settings className="h-6 w-6 text-gray-400 hover:text-gray-600 cursor-pointer" />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Database className="h-8 w-8 text-blue-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Devices</dt>
                  <dd className="text-lg font-medium text-gray-900">{totalDevices}</dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Secure</dt>
                  <dd className="text-lg font-medium text-gray-900">{secureDevices}</dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-8 w-8 text-yellow-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Alerts</dt>
                  <dd className="text-lg font-medium text-gray-900">{alertDevices}</dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <XCircle className="h-8 w-8 text-red-600" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Tampered</dt>
                  <dd className="text-lg font-medium text-gray-900">{tamperedDevices}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Device List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Devices</h3>
                <div className="space-y-3">
                  {devices.map((device) => (
                    <div
                    key={device.id}
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        selectedDevice.id === device.id 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedDevice(device)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <h4 className="text-sm font-medium text-gray-900">{device.name}</h4>
                            {device.connectivity === 'online' ? (
                              <Wifi className="h-4 w-4 text-green-500" />
                            ) : (
                              <WifiOff className="h-4 w-4 text-red-500" />
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{device.id}</p>
                          <p className="text-xs text-gray-500">{device.location}</p>
                        </div>
                        <div className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(device.status)}`}>
                          {device.status.toUpperCase()}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                        <span>Updated: {device.lastUpdate}</span>
                        <span>Battery: {device.batteryLevel}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Device Details */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    Device Details: {selectedDevice.name}
                  </h3>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setActiveTab('overview')}
                      className={`px-3 py-2 text-sm font-medium rounded-md ${
                        activeTab === 'overview'
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Overview
                    </button>
                    <button
                      onClick={() => setActiveTab('logs')}
                      className={`px-3 py-2 text-sm font-medium rounded-md ${
                        activeTab === 'logs'
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Logs
                    </button>
                  
                  </div>
                </div>

                {activeTab === 'overview' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">

                      <div className="border rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-3">Device Status</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-500">Status:</span>
                            <span className={`text-sm font-medium px-2 py-1 rounded-full ${getStatusColor(selectedDevice.status)}`}>
                              {selectedDevice.status.toUpperCase()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-500">Connectivity:</span>
                            <div className="flex items-center space-x-1">
                              {selectedDevice.connectivity === 'online' ? (
                                <Wifi className="h-4 w-4 text-green-500" />
                              ) : (
                                <WifiOff className="h-4 w-4 text-red-500" />
                              )}
                              <span className="text-sm text-gray-900">{selectedDevice.connectivity}</span>
                            </div>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-500">Battery:</span>
                            <span className="text-sm text-gray-900">{selectedDevice.batteryLevel}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-500">Last Update:</span>
                            <span className="text-sm text-gray-900">{selectedDevice.lastUpdate}</span>
                          </div>
                        </div>
                      </div>
                          

                      <div className="border rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-3">Location & Security</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-500">Location:</span>
                            <span className="text-sm text-gray-900">{selectedDevice.location}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-500">Coordinates:</span>
                            <span className="text-sm text-gray-900">{selectedDevice.coordinates}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-500">Tamper Attempts:</span>
                            <span className={`text-sm font-medium ${selectedDevice.tamperAttempts > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {selectedDevice.tamperAttempts}
                            </span>
                          </div>
                        </div>
                      </div>
                        <div className="bg-white rounded-lg shadow mb-8 p-6">
                         <Scatter data={scatterData} options={scatterOptions} width={200} height={200} />
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                        <div className="border rounded-lg p-4">
                          <h4 className="font-medium text-gray-900 mb-3">Tamper Status</h4>

                          <div className="space-y-2">
                            {/* Photodiode */}
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-500">Photodiode:</span>
                              {selectedDevice?.sensorStatus?.photoStatus ? (
                                <span
                                  className={`text-sm font-medium px-2 py-1 rounded-full ${
                                    selectedDevice?.sensorStatus?.photoStatus === "tampered"
                                      ? "text-red-600 bg-red-100"
                                      : "text-green-600 bg-green-100"
                                  }`}
                                >
                                  {selectedDevice?.sensorStatus?.photoStatus.toUpperCase()}
                                </span>
                              ) : (
                                <span className="text-sm text-gray-400">No data</span>
                              )}
                            </div>

                            {/* Wire Seal */}
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-500">Wire Seal:</span>
                              {selectedDevice?.sensorStatus?.sealStatus ? (
                                <span
                                  className={`text-sm font-medium px-2 py-1 rounded-full ${
                                    selectedDevice?.sensorStatus?.sealStatus === "tampered"
                                      ? "text-red-600 bg-red-100"
                                      : "text-green-600 bg-green-100"
                                  }`}
                                >
                                  {selectedDevice?.sensorStatus?.sealStatus.toUpperCase()}
                                </span>
                              ) : (
                                <span className="text-sm text-gray-400">No data</span>
                              )}
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-500">Hall Sensor:</span>
                              {selectedDevice?.sensorStatus?.hallStatus ? (
                                <span
                                  className={`text-sm font-medium px-2 py-1 rounded-full ${
                                    selectedDevice?.sensorStatus?.hallStatus === "tampered_magnetic"
                                      ? "text-red-600 bg-red-100"
                                      : "text-green-600 bg-green-100"
                                  }`}
                                >
                                  {selectedDevice?.sensorStatus?.hallStatus.toUpperCase()}
                                </span>
                              ) : (
                                <span className="text-sm text-gray-400">No data</span>
                              )}
                            </div>
                             {/* Firmware Integrity */}
                                <div className="flex justify-between items-center">
                                  <span className="text-sm text-gray-500">Firmware:</span>
                                  {selectedDevice?.sensorStatus?.firmwareStatus ? (
                                    <span
                                      className={`text-sm font-medium px-2 py-1 rounded-full ${
                                        selectedDevice?.sensorStatus?.firmwareStatus === "tampered"
                                          ? "text-red-600 bg-red-100"
                                          : "text-green-600 bg-green-100"
                                      }`}
                                    >
                                      {selectedDevice?.sensorStatus?.firmwareStatus.toUpperCase()}
                                    </span>
                                  ) : (
                                    <span className="text-sm text-gray-400">No data</span>
                                  )}
                                </div>
 

                          </div>
                        </div>
                      
                      {log ? (
                        
                  <div className="border rounded-lg p-4">
                    <h2 className="font-medium text-gray-900 mb-3">
                      📊 Latest Tamper Log
                    </h2>

                    {/* Timestamp */}
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500">Timestamp:</span>
                      <span className="font-medium text-gray-800">{log.timestamp}</span>
                    </div>

                    {/* Prediction */}
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-500">Prediction:</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          log.prediction === 1
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {log.prediction === 1 ? "Tampered 🚨" : "Secure ✅"}
                      </span>
                    </div>

                    {/* Features */}
                    <div className="mt-2">
                      <p className="text-gray-500 text-sm mb-1">Features:</p>
                      <ul className="list-disc list-inside text-xs text-gray-700 bg-gray-50 rounded-md p-2">
                        {log.features &&
                          Object.entries(log.features).map(([key, value]) => (
                            <li key={key}>
                              <b>{key}:</b> {String(value)}
                            </li>
                          ))}
                      </ul>
                    </div>

                          {/* Probabilities */}
                          {log.probability && log.probability.length > 0 && (
                            <div className="mt-2">
                              <p className="text-gray-500 text-sm mb-1">Probabilities:</p>
                              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-700 bg-gray-50 rounded-md p-2 max-h-32 overflow-y-auto">
                                {log.probability.map((p: number, i: number) => (
                                  <li key={i}>
                                    Class {i}: <span className="font-medium">{(p * 100).toFixed(2)}%</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-4 rounded-xl shadow-md bg-white text-gray-500">
                          📊 No tamper log available yet
                        </div>
                      )}



                      

                    <div className="space-y-4">
                      <div className="border rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-3">Firmware & Calibration</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-500">Firmware:</span>
                            <span className="text-sm text-gray-900">{selectedDevice.firmwareVersion}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-500">Calibration:</span>
                            <span className={`text-sm font-medium ${
                              selectedDevice.calibrationStatus === 'valid' 
                                ? 'text-green-600' 
                                : selectedDevice.calibrationStatus === 'drift_detected'
                                ? 'text-yellow-600'
                                : 'text-red-600'
                            }`}>
                              {selectedDevice.calibrationStatus.replace('_', ' ').toUpperCase()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                              <span className="text-sm text-gray-500">Hash Verification:</span>
                              <div className="flex items-center space-x-1">
                                {selectedDevice?.sensorStatus?.firmwareStatus === "tampered" ? (
                                  <>
                                    <Unlock className="h-4 w-4 text-red-500" />
                                    <span className="text-sm font-medium text-red-600">Invalid</span>
                                  </>
                                ) : selectedDevice?.sensorStatus?.firmwareStatus === "secure" ? (
                                  <>
                                    <Lock className="h-4 w-4 text-green-500" />
                                    <span className="text-sm font-medium text-green-600">Valid</span>
                                  </>
                                ) : (
                                  <span className="text-sm text-gray-400">No data</span>
                                )}
                              </div>
                            </div>
                        </div>
                      </div>
                    </div>


                      <div className="border rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-3">Quick Actions</h4>
                        <div className="space-y-2">
                          <button className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors">
                            Remote Calibration Check
                          </button>
                          <button className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 transition-colors">
                            Verify Firmware Integrity
                          </button>
                          <button className="w-full bg-yellow-600 text-white py-2 px-4 rounded-md hover:bg-yellow-700 transition-colors">
                            Download Audit Report
                          </button>
                        </div>
                    </div>
            
                  </div>
                </div>
                )}

                {activeTab === 'logs' && (
                  <div className="space-y-4">
                    <div className="border rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 mb-3">Recent Activity Logs</h4>
                      <div className="space-y-3">
                        <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                          <Activity className="h-5 w-5 text-blue-500 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm text-gray-900">Measurement recorded: 25.7 kg</p>
                            <p className="text-xs text-gray-500">2024-09-08 14:25:33 | Hash: 0x7f3a2b1c...</p>
                          </div>
                        </div>
                        <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                          <Eye className="h-5 w-5 text-green-500 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm text-gray-900">Calibration verification completed</p>
                            <p className="text-xs text-gray-500">2024-09-08 14:20:15 | Hash: 0x9e4d5f2a...</p>
                          </div>
                        </div>
                        <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                          <Clock className="h-5 w-5 text-yellow-500 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm text-gray-900">System boot completed</p>
                            <p className="text-xs text-gray-500">2024-09-08 09:00:05 | Hash: 0x2c6b8e9f...</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>


        {/* Alerts Section */}
        <div className="mt-8">
          <div className="bg-white rounded-lg shadow">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Recent Alerts</h3>
              <div className="space-y-3">
                {alerts.slice(0, 5).map((alert) => (
                  <div
                    key={alert.id}
                    className={`border rounded-lg p-4 ${getSeverityColor(alert.severity)} ${
                      alert.acknowledged ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <AlertTriangle className="h-5 w-5" />
                          <span className="text-sm font-medium">
                            {alert.deviceId} - {alert.type.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                        <p className="text-sm mt-1">{alert.message}</p>
                        <p className="text-xs mt-2 opacity-75">{alert.timestamp}</p>
                      </div>
                      {!alert.acknowledged && (
                        <button
                          onClick={() => acknowledgeAlert(alert.id)}
                          className="ml-4 bg-white bg-opacity-50 hover:bg-opacity-75 px-3 py-1 rounded text-xs font-medium transition-all"
                        >
                          Acknowledge
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TamperDetectionDashboard;
const app = initializeApp(firebaseConfig);
export const db = getDatabase(app)