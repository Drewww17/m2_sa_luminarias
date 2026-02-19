"use client";

import React, { useState, useEffect, useRef } from 'react';
import { 
  UploadCloud, Activity, FileText, User, Search, AlertCircle, 
  CheckCircle, ChevronRight, LogIn, PlusCircle, BookOpen, 
  Settings, LayoutDashboard, FileBarChart, Filter, ArrowRight 
} from 'lucide-react';
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import Webcam from "react-webcam";
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, Legend as RechartsLegend, ResponsiveContainer, Cell,
  PieChart, Pie
} from 'recharts';

import { auth, db } from "@/lib/firebase";

import {
  signInAnonymously,
  onAuthStateChanged,
  signInWithCustomToken
} from "firebase/auth";

import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  orderBy,
  serverTimestamp,
  setDoc,
  doc,
  getDoc,
  updateDoc
} from "firebase/firestore";

const appId = "dfu-detect-app";

// --- MAIN APP COMPONENT ---
export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [route, setRoute] = useState('landing');
  
  // App Data State
  const [scanHistory, setScanHistory] = useState([]);
  const [allPatients, setAllPatients] = useState([]);
  const [allScans, setAllScans] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState(null);

 
  const [scanImage, setScanImage] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);

  // 1. AUTHENTICATION
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userRef = doc(db, 'artifacts', appId, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setUserData(userSnap.data());
          if (['landing', 'login', 'signup'].includes(route)) {
          }
        }
      } else {
        setUserData(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // --- 2. DATA FETCHING (Real-time) ---
  useEffect(() => {
    if (!user || !userData) return;

// PATIENT: Fetch own history
    if (userData.role === 'patient') {
      const q = query(
        collection(db, 'artifacts', appId, 'scans'),
        where('userId', '==', user.uid)
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const scans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        scans.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setScanHistory(scans);
      }, (error) => console.error("Error fetching history:", error));
      
      return () => unsubscribe();
    }

    // DOCTOR: Fetch all patients and scans
    if (userData.role === 'doctor') {
      const scansQuery = collection(db, 'artifacts', appId, 'scans');
      const unsubScans = onSnapshot(scansQuery, (snapshot) => {
        const scans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        scans.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setAllScans(scans);
      });

      return () => {
        unsubScans();
      };
    }

  }, [user, userData]);

  // --- NAVIGATION ---
  const navigate = (newRoute) => {
    window.scrollTo(0, 0);
    setRoute(newRoute);
  };

  const handleLogout = () => {
    setUserData(null);
    setScanImage(null);
    setAnalysisResult(null);
    navigate('landing');
  };

  // --- DB WRITERS ---
  const handleCreateAccount = async (profile) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid), {
        ...profile,
        createdAt: serverTimestamp()
      });
      setUserData(profile);
      navigate(profile.role === 'doctor' ? 'doctor-dashboard' : 'patient-dashboard');
    } catch (e) {
      console.error("Error creating account:", e);
      alert("Failed to create account. See console.");
    }
  };

  const handleSaveScan = async (resultData, overrides = {}) => {
    if (!user || !userData) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'scans'), {
        userId: user.uid,
        patientName: `${userData.firstName} ${userData.lastName}`,
        result: resultData.is_ulcer ? 'Ulcer' : 'Healthy',
        finalLabel: overrides.finalLabel || (resultData.is_ulcer ? 'Ulcer' : 'Healthy'),
        diagnosis: resultData.diagnosis,
        confidence: resultData.confidence,
        riskScore: resultData.riskScore,
        severity: resultData.severity,
        status: resultData.is_ulcer ? 'red' : 'green',
        createdAt: serverTimestamp(),
        dateString: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        reviewStatus: overrides.reviewStatus || 'pending',
        doctorNotes: overrides.doctorNotes || '',
        verifiedBy: overrides.verifiedBy || null,
        verifiedAt: overrides.verifiedAt || null
      });
      navigate(userData.role === 'doctor' ? 'doctor-dashboard' : 'my-history');
    } catch (e) {
      console.error("Error saving scan:", e);
      alert("Failed to save record.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col">
      <Navbar route={route} userData={userData} navigate={navigate} onLogout={handleLogout} />
      
      <main className="flex-grow flex flex-col items-center p-4 sm:p-8">
        <div className="w-full max-w-6xl">
          {/* PUBLIC ROUTES */}
          {route === 'landing' && <LandingPage navigate={navigate} />}
          {route === 'login' && <LoginPage onLogin={handleCreateAccount} navigate={navigate} />} 
          {route === 'signup' && <SignUpPage onRegister={handleCreateAccount} navigate={navigate} />}
          
          {/* PATIENT PORTAL */}
          {route === 'patient-dashboard' && <PatientDashboard navigate={navigate} history={scanHistory} userData={userData} />}
          
          {route === 'new-scan' && (
            <NewScanPage 
              navigate={navigate} 
              setAnalysisResult={setAnalysisResult} 
              setScanImage={setScanImage}
              userData={userData}
            />
          )}
          
          {route === 'scan-results-patient' && (
            <ScanResultsPatient 
              navigate={navigate} 
              result={analysisResult} 
              image={scanImage}
              history={scanHistory}
              onSave={() => handleSaveScan(analysisResult)} 
            />
          )}
          
          {route === 'my-history' && <MyHistoryPage navigate={navigate} history={scanHistory} />}
          {route === 'education' && <EducationHub navigate={navigate} />}
          
          {/* DOCTOR PORTAL */}
          {route === 'doctor-dashboard' && <DoctorDashboard navigate={navigate} allScans={allScans} />}
          {route === 'patient-records' && <PatientRecords navigate={navigate} allScans={allScans} userData={userData} onSelectPatient={(id) => { setSelectedPatientId(id); navigate('patient-detail'); }} />}
          {route === 'patient-detail' && <PatientDetail navigate={navigate} allScans={allScans} patientId={selectedPatientId} />}
          {route === 'patient-cumulative' && <PatientCumulative navigate={navigate} allScans={allScans} />}
          {route === 'test-model' && <TestModel navigate={navigate} />}
          {route === 'scan-results-doctor' && <ScanResultsDoctor navigate={navigate} image={scanImage} result={analysisResult} onSave={handleSaveScan} userData={userData} />}
        </div>
      </main>

      <Footer />
    </div>
  );
}

// --- COMPONENTS ---

const Navbar = ({ route, userData, navigate, onLogout }) => {
  const role = userData?.role || 'guest';
  const navLinks = {
    guest: [
      { id: 'landing', label: 'Home' },
      { id: 'login', label: 'New Scan' },
      { id: 'education', label: 'More Info' },
    ],
    patient: [
      { id: 'patient-dashboard', label: 'Home' },
      { id: 'new-scan', label: 'New Scan' },
      { id: 'my-history', label: 'My History' },
      { id: 'education', label: 'More Info' },
    ],
    doctor: [
      { id: 'doctor-dashboard', label: 'Dashboard' },
      { id: 'new-scan', label: 'Live Scan' },
      { id: 'patient-records', label: 'Patients' },
      { id: 'patient-cumulative', label: 'Analytics' },
      { id: 'test-model', label: 'Test Model' },
    ]
  };

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20">
          <div className="flex items-center cursor-pointer gap-3" onClick={() => navigate(role === 'guest' ? 'landing' : `${role}-dashboard`)}>
            <img src="/logo.png" alt="DFU-Detect Logo" className="h-10 w-auto" />
            <span className="font-extrabold text-xl text-slate-900 tracking-tight hidden sm:block">DFU-Detect</span>
          </div>
          
          <div className="hidden md:flex items-center space-x-8">
            {navLinks[role].map(link => (
              <button 
                key={link.label}
                onClick={() => navigate(link.id)}
                className={`text-sm font-bold transition-colors ${route === link.id ? 'text-blue-600' : 'text-slate-500 hover:text-blue-600'}`}
              >
                {link.label}
              </button>
            ))}
          </div>

          <div className="flex items-center">
            {role === 'guest' ? (
              <div className="flex items-center gap-4">
                <button onClick={() => navigate('login')} className="text-sm font-bold text-slate-600 hover:text-blue-600">Login</button>
                <button onClick={() => navigate('signup')} className="text-sm font-bold bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all">Sign Up</button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-bold text-slate-800">{userData.firstName} {userData.lastName}</p>
                  <p className="text-xs text-slate-500 capitalize">{role === 'doctor' ? 'Medical Pro' : 'Patient'}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 cursor-pointer hover:bg-blue-100 transition-colors" onClick={onLogout}>
                  <User className="h-5 w-5" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

const LandingPage = ({ navigate }) => (
  <div className="flex flex-col items-center text-center space-y-20 py-16">
    <div className="max-w-4xl space-y-8 flex flex-col items-center">
      <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-bold border border-blue-100 shadow-sm">
        <AlertCircle className="h-4 w-4" /> 
        <span>AI-Powered Medical Assistance</span>
      </div>
      <h1 className="text-5xl md:text-7xl font-extrabold text-slate-900 tracking-tight leading-tight">
        Early Detection of <br className="hidden md:block" />
        <span className="text-blue-600 relative inline-block mt-2">Diabetic Foot Ulcers</span>
      </h1>
      <p className="text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
        Upload a photo of the affected area to receive an instant analysis powered by advanced computer vision. Early detection saves lives.
      </p>
      <div className="flex flex-col sm:flex-row justify-center gap-4 pt-6 w-full sm:w-auto">
        <button onClick={() => navigate('signup')} className="bg-blue-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-600/30 text-lg w-full sm:w-auto">
          <UploadCloud className="h-5 w-5" /> Start Scan
        </button>
        <button onClick={() => navigate('education')} className="bg-white text-slate-700 border-2 border-slate-200 px-8 py-4 rounded-xl font-bold hover:bg-slate-50 hover:border-slate-300 transition-all text-lg w-full sm:w-auto">
          Learn More
        </button>
      </div>
    </div>
  </div>
);

const SignUpPage = ({ onRegister, navigate }) => {
  const [role, setRole] = useState('patient');
  const [formData, setFormData] = useState({ firstName: '', lastName: '', email: '' });

  const handleSubmit = () => {
    if(!formData.firstName || !formData.lastName) return alert("Please fill in your name");
    onRegister({ ...formData, role });
  };

  return (
    <div className="max-w-lg w-full mx-auto mt-10 bg-white p-10 rounded-3xl shadow-xl shadow-slate-200 border border-white">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-extrabold text-slate-900">Create Account</h2>
        <p className="text-slate-500 mt-2">Join DFU-Detect for smart monitoring.</p>
      </div>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">First Name</label>
            <input type="text" placeholder="Jane" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500"
              onChange={(e) => setFormData({...formData, firstName: e.target.value})} />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Last Name</label>
            <input type="text" placeholder="Doe" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500"
              onChange={(e) => setFormData({...formData, lastName: e.target.value})} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Email</label>
          <input type="email" placeholder="email@example.com" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-blue-500"
            onChange={(e) => setFormData({...formData, email: e.target.value})} />
        </div>
        {/* Role Selection */}
        <div className="pt-2">
          <label className="block text-sm font-bold text-slate-800 mb-3">I am a...</label>
          <div className="grid grid-cols-2 gap-4">
            <div onClick={() => setRole('doctor')} className={`border-2 rounded-xl p-4 flex flex-col items-center cursor-pointer ${role === 'doctor' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-100 text-slate-500'}`}>
              <Activity className="h-6 w-6 mb-2" />
              <span className="text-sm font-bold">Medical Pro</span>
            </div>
            <div onClick={() => setRole('patient')} className={`border-2 rounded-xl p-4 flex flex-col items-center cursor-pointer ${role === 'patient' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-100 text-slate-500'}`}>
              <User className="h-6 w-6 mb-2" />
              <span className="text-sm font-bold">Patient</span>
            </div>
          </div>
        </div>
        <button onClick={handleSubmit} className="w-full bg-blue-600 text-white rounded-xl py-3.5 font-bold hover:bg-blue-700 mt-4 shadow-lg">Create Account</button>
      </div>
    </div>
  );
};

//Login Page
const LoginPage = ({ onLogin, navigate }) => {
  const handleSimulatedLogin = (role) => {
    onLogin({ 
      firstName: role === 'doctor' ? 'Sarah' : 'Jane', 
      lastName: role === 'doctor' ? 'Smith' : 'Doe', 
      role: role 
    });
  };

  return (
    <div className="max-w-md w-full mx-auto mt-16 bg-white p-10 rounded-3xl shadow-xl border border-white">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-extrabold text-slate-900">Welcome Back</h2>
      </div>
      <div className="space-y-5">
        <p className="text-sm text-slate-500 mb-4">Simulate Login as:</p>
        <button onClick={() => handleSimulatedLogin('patient')} className="w-full bg-blue-600 text-white rounded-xl py-3.5 font-bold">Sign In as Patient</button>
        <button onClick={() => handleSimulatedLogin('doctor')} className="w-full bg-slate-800 text-white rounded-xl py-3.5 font-bold">Sign In as Doctor</button>
      </div>
      <p className="text-center text-sm text-slate-500 mt-8 font-medium">
        Don't have an account? <span className="text-blue-600 font-bold cursor-pointer hover:underline" onClick={() => navigate('signup')}>Register now</span>
      </p>
    </div>
  );
};

// PATIENT VIEWS

const PatientDashboard = ({ navigate, history, userData }) => (
  <div className="space-y-10 w-full max-w-5xl mx-auto py-8">
    <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-slate-200 pb-6">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900">Hello, {userData?.firstName || 'User'}</h1>
        <p className="text-slate-500 font-medium mt-1">Welcome to your health monitoring dashboard.</p>
      </div>
    </div>

    <div className="bg-white border border-slate-100 rounded-3xl p-10 shadow-sm text-center flex flex-col items-center justify-center space-y-6 hover:shadow-md transition-shadow">
      <div className="h-20 w-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-2 border border-blue-100">
        <PlusCircle className="h-10 w-10" />
      </div>
      <h2 className="text-2xl font-bold text-slate-900">New Foot Scan</h2>
      <button onClick={() => navigate('new-scan')} className="bg-blue-600 text-white px-8 py-3.5 rounded-xl font-bold hover:bg-blue-700 shadow-lg flex items-center gap-2">
        Start Analysis <ArrowRight className="h-5 w-5" />
      </button>
    </div>

    <div>
      <h3 className="font-bold text-xl text-slate-900 mb-6">Recent History</h3>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        {history.length > 0 ? (
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100 text-xs uppercase tracking-wider">
              <tr><th className="px-8 py-4">Date</th><th className="px-8 py-4">Result</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.slice(0, 3).map((item) => (
                <tr key={item.id} className="hover:bg-blue-50/30">
                  <td className="px-8 py-5 text-slate-700 font-bold">{item.dateString}</td>
                  <td className="px-8 py-5"><Badge type={item.status}>{item.result}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-slate-500">No scans recorded yet.</div>
        )}
      </div>
    </div>
  </div>
);

const NewScanPage = ({ navigate, setAnalysisResult, setScanImage, userData }) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);
  const [useWebcam, setUseWebcam] = useState(false);
  const webcamRef = useRef(null);
  const [selectedModels, setSelectedModels] = useState([
    "foot-ulcers-szvdf/3",
    "foot-ulcers-szvdf/2", 
    "foot-ulcers-szvdf/1"
  ]);

  const toggleModel = (modelId) => {
    setSelectedModels(prev =>
      prev.includes(modelId)
        ? prev.filter(id => id !== modelId)
        : [...prev, modelId]
    );
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;
    
    const previewUrl = URL.createObjectURL(selectedFile);
    setScanImage(previewUrl);
    setAnalyzing(true);
    
    const formData = new FormData();
    formData.append('image', selectedFile);
    formData.append('models', JSON.stringify(selectedModels));

    try {
      const response = await fetch('/api/analyze', { method: 'POST', body: formData });
      const data = await response.json();
      
      if (data.status === 'success') {
        setAnalysisResult(data);
        navigate(userData?.role === 'doctor' ? 'scan-results-doctor' : 'scan-results-patient');
      } else {
        alert('Analysis failed: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error(error);
      alert('Error connecting to analysis server.');
    } finally {
      setAnalyzing(false);
    }
  };

  const analyzeWebcam = async (base64Image) => {
    setAnalyzing(true);
    setScanImage(base64Image);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          image: base64Image,
          models: selectedModels
        })
      });

      const data = await response.json();
      if (data.status === 'success') {
        setAnalysisResult(data);
        navigate(userData?.role === 'doctor' ? 'scan-results-doctor' : 'scan-results-patient');
      } else {
        alert('Analysis failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert("Webcam analysis failed");
    }

    setAnalyzing(false);
  };

  const availableModels = [
    { id: "foot-ulcers-szvdf/1", name: "Model v1 (mAP: 92.7%)", weight: 0.927 },
    { id: "foot-ulcers-szvdf/2", name: "Model v2 (mAP: 91.4%)", weight: 0.914 },
    { id: "foot-ulcers-szvdf/3", name: "Model v3 (mAP: 90.6%)", weight: 0.906 }
  ];

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-8">
      <h1 className="text-2xl font-bold text-slate-900">New Foot Scan</h1>
      
      {/* Model Selection */}
      <div className="bg-white p-6 rounded-2xl border shadow-sm">
        <h3 className="font-bold mb-4">Model Selection (Ensemble)</h3>
        <div className="grid grid-cols-1 gap-3">
          {availableModels.map(model => (
            <label key={model.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-slate-50">
              <input
                type="checkbox"
                checked={selectedModels.includes(model.id)}
                onChange={() => toggleModel(model.id)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <div className="flex-1">
                <span className="text-slate-700 font-medium">{model.name}</span>
                <p className="text-xs text-slate-500">Weight: {model.weight}</p>
              </div>
            </label>
          ))}
        </div>
        {selectedModels.length === 0 && (
          <p className="text-red-600 text-sm mt-2">Please select at least one model.</p>
        )}
      </div>

      <button
        onClick={() => setUseWebcam(!useWebcam)}
        className="mb-4 bg-slate-800 text-white px-4 py-2 rounded-lg"
      >
        {useWebcam ? "Switch to Upload" : "Use Webcam"}
      </button>

      {useWebcam ? (
        <div className="bg-white border-2 border-slate-300 rounded-3xl p-8 space-y-4">
          <Webcam
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            className="rounded-xl w-full"
          />
          <button
            onClick={() => {
              const imageSrc = webcamRef.current.getScreenshot();
              if (imageSrc) {
                analyzeWebcam(imageSrc);
              }
            }}
            disabled={analyzing || selectedModels.length === 0}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50"
          >
            {analyzing ? 'Processing...' : 'Capture & Analyze'}
          </button>
        </div>
      ) : (
        <>
          <div 
            className="bg-white border-2 border-dashed border-slate-300 rounded-3xl p-16 flex flex-col items-center justify-center text-center hover:bg-slate-50 cursor-pointer"
            onClick={() => fileInputRef.current.click()}
          >
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => setSelectedFile(e.target.files[0])} />
            
            {selectedFile ? (
              <div>
                <img src={URL.createObjectURL(selectedFile)} alt="Preview" className="h-48 object-contain rounded-lg mb-4" />
                <p className="font-bold text-slate-800">{selectedFile.name}</p>
              </div>
            ) : (
              <>
                <UploadCloud className="h-8 w-8 text-slate-400 mb-4" />
                <h3 className="font-bold text-xl text-slate-700">Click to upload image</h3>
              </>
            )}
          </div>

          <div className="flex justify-end">
            <button 
              onClick={handleAnalyze} 
              disabled={!selectedFile || analyzing || selectedModels.length === 0}
              className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg disabled:opacity-50"
            >
              {analyzing ? 'Processing...' : 'Analyze Image'}
            </button>
          </div>
        </>
      )}

      <div className="text-xs text-slate-500 mt-4 text-center bg-slate-50 p-3 rounded-lg border border-slate-100">
        <AlertCircle className="inline w-3 h-3 mr-1 mb-0.5" /> AI cannot give a definitive diagnosis. Always consult a verified medical practitioner.
      </div>
    </div>
  );
};

const ConfidenceGauge = ({ value }) => {
  const radius = 70;
  const stroke = 10;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset =
    circumference - (value / 100) * circumference;

  return (
    <svg height={radius * 2} width={radius * 2}>
      <circle
        stroke="#e2e8f0"
        fill="transparent"
        strokeWidth={stroke}
        r={normalizedRadius}
        cx={radius}
        cy={radius}
      />
      <circle
        stroke="#ef4444"
        fill="transparent"
        strokeWidth={stroke}
        strokeDasharray={`${circumference} ${circumference}`}
        style={{ strokeDashoffset, transition: "stroke-dashoffset 0.5s" }}
        r={normalizedRadius}
        cx={radius}
        cy={radius}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dy=".3em"
        className="text-xl font-bold fill-slate-800"
      >
        {value}%
      </text>
    </svg>
  );
};

const RiskBar = ({ score }) => {
  let color = "bg-green-500";
  if (score > 70) color = "bg-red-500";
  else if (score > 40) color = "bg-yellow-500";

  return (
    <div className="w-full bg-slate-200 rounded-full h-4">
      <div
        className={`${color} h-4 rounded-full transition-all`}
        style={{ width: `${score}%` }}
      />
    </div>
  );
};

const ScanResultsPatient = ({ navigate, result, image, history, onSave }) => {
  const lastScan = history[0];
  let trend = null;

  if (lastScan) {
    if (result.riskScore > lastScan.riskScore) {
      trend = "Condition worsening ↑";
    } else {
      trend = "Condition stable or improving";
    }
  }

  const downloadPDF = async () => {
    const input = document.getElementById("clinical-report");
    const canvas = await html2canvas(input);
    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF("p", "mm", "a4");
    const width = pdf.internal.pageSize.getWidth();
    const height = (canvas.height * width) / canvas.width;

    pdf.addImage(imgData, "PNG", 0, 0, width, height);
    pdf.save("DFU-Clinical-Report.pdf");
  };

  return (
    <div className="max-w-6xl mx-auto py-8">
      <div className="grid lg:grid-cols-2 gap-10 items-start">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
           {image ? <img src={image} alt="Scan" className="w-full h-full object-cover rounded-xl" /> : <div className="text-center p-10">Image Expired</div>}
        </div>

        <div id="clinical-report" className="bg-white p-10 rounded-3xl border shadow-sm space-y-8">

          <h2 className="text-3xl font-extrabold text-slate-900">
            AI Clinical Analysis Report
          </h2>

          {/* Severity Card */}
          <div className={`p-6 rounded-xl border-l-8 ${
            result.severity === "High"
              ? "bg-red-50 border-red-600"
              : result.severity === "Moderate"
              ? "bg-yellow-50 border-yellow-500"
              : "bg-green-50 border-green-500"
          }`}>
            <p className="text-lg font-bold">
              Severity Level: {result.severity}
            </p>
          </div>

          {/* Confidence Gauge */}
          <div className="flex flex-col items-center">
            <p className="text-sm text-slate-500 mb-4">
              Model Confidence
            </p>
            <ConfidenceGauge value={result.confidence} />
          </div>

          {/* Risk Indicator */}
          <div>
            <p className="text-sm text-slate-500 mb-2">
              Risk Score
            </p>
            <RiskBar score={result.riskScore} />
          </div>

          {/* Recommendation */}
          <div>
            <p className="text-sm text-slate-500">
              Recommended Action
            </p>
            <p className="font-medium text-slate-800 mt-1">
              {result.recommendation}
            </p>
          </div>

          {/* Trend */}
          {trend && (
            <div>
              <p className="text-sm text-slate-500">Trend</p>
              <p className={`text-xl font-bold ${
                trend.includes("worsening") ? "text-red-600" : "text-green-600"
              }`}>
                {trend}
              </p>
            </div>
          )}

          {/* Ensemble Reliability Metrics */}
          {result.models && (
            <div className="bg-slate-50 p-6 rounded-xl border mt-4">
              <h3 className="font-bold text-lg mb-4">Ensemble Reliability Metrics</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <p><span className="text-slate-500">Agreement:</span> <strong>{result.agreementPercentage}%</strong></p>
                <p><span className="text-slate-500">Avg Confidence:</span> <strong>{result.averageConfidence}%</strong></p>
                <p><span className="text-slate-500">Std Deviation:</span> <strong>{result.confidenceStdDev}</strong></p>
                <p><span className="text-slate-500">Reliability Score:</span> <strong>{result.reliabilityScore}%</strong></p>
              </div>
              <div className="mt-4">
                <p className="text-sm text-slate-500 mb-2">Model Predictions:</p>
                {result.models.map((m, i) => (
                  <div key={i} className="flex justify-between text-xs py-1 border-b border-slate-200">
                    <span>{m.model}</span>
                    <span className={m.prediction === "Ulcer" ? "text-red-600" : "text-green-600"}>
                      {m.prediction} ({m.confidence}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-xs text-slate-500 mt-4 text-center">
            <AlertCircle className="inline w-3 h-3 mr-1 mb-0.5" /> AI cannot give a definitive diagnosis. Always consult a verified medical practitioner.
          </div>

          <button onClick={onSave} className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 shadow-lg">
            Save Result to History
          </button>

          <button
            onClick={downloadPDF}
            className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold mt-6"
          >
            Download Clinical Report (PDF)
          </button>
        </div>
      </div>
    </div>
  );
};

const MyHistoryPage = ({ navigate, history }) => (
  <div className="w-full max-w-6xl mx-auto py-8 space-y-8">
    <h1 className="text-2xl font-bold text-slate-900">My Scan History</h1>
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {history.length > 0 ? (
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100 text-xs uppercase">
            <tr><th className="px-8 py-5">Date</th><th className="px-8 py-5">Result</th><th className="px-8 py-5">Note</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {history.map((item) => (
              <tr key={item.id} className="hover:bg-blue-50/30">
                <td className="px-8 py-5 font-bold text-slate-700">{item.dateString}</td>
                <td className="px-8 py-5"><Badge type={item.status}>{item.result}</Badge></td>
                <td className="px-8 py-5 text-slate-400 italic">Image not retained (Privacy)</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="p-8 text-center text-slate-500">No history found.</div>}
    </div>
  </div>
);

// DOCTOR VIEWS
const MetricCard = ({ title, value }) => (
  <div className="bg-white p-6 rounded-xl shadow border">
    <p className="text-sm text-slate-500">{title}</p>
    <p className="text-3xl font-bold">{value}</p>
  </div>
);

const KPICard = ({ title, value, type }) => {
  const styles = {
    neutral: "bg-white border border-slate-200 text-slate-800",
    success: "bg-green-50 border border-green-200 text-green-700",
    danger: "bg-red-50 border border-red-200 text-red-600",
    warning: "bg-yellow-50 border border-yellow-200 text-yellow-700",
    info: "bg-blue-50 border border-blue-200 text-blue-700",
  };

  return (
    <div className={`rounded-2xl p-6 shadow-sm transition hover:shadow-md ${styles[type]}`}>
      <p className="text-xs uppercase font-semibold tracking-wide opacity-70">
        {title}
      </p>
      <h2 className="text-3xl font-bold mt-2">
        {value}
      </h2>
    </div>
  );
};

const DoctorDashboard = ({ navigate, allScans }) => {
  // 1. Calculate KPIs
  const totalScans = allScans.length;
  const ulcerScans = allScans.filter(s => (s.finalLabel || s.result) === 'Ulcer');
  const ulcerCount = ulcerScans.length;
  const healthyCount = totalScans - ulcerCount;
  const ulcerRate = totalScans ? ((ulcerCount / totalScans) * 100).toFixed(1) : 0;
  
  const avgConfidence = totalScans 
    ? (allScans.reduce((acc, s) => acc + (Number(s.confidence) || 0), 0) / totalScans).toFixed(1) 
    : 0;
    
  const falsePositives = allScans.filter(s => s.reviewStatus === 'false_positive').length;
  const highRiskCount = allScans.filter(s => (Number(s.confidence) || 0) > 85).length;
  
  // Mock reliability if not present, or calculate from available data
  const reliabilityScore = totalScans ? (avgConfidence * 0.9).toFixed(1) : 0; 

  // 2. Prepare Chart Data
  // Patient Stats for Bar Chart
  const patientStatsMap = {};
  allScans.forEach(scan => {
    const name = scan.patientName.split(' ')[0]; // First name only for brevity
    if (!patientStatsMap[name]) patientStatsMap[name] = { name, ulcer: 0, healthy: 0 };
    if ((scan.finalLabel || scan.result) === 'Ulcer') patientStatsMap[name].ulcer++;
    else patientStatsMap[name].healthy++;
  });
  const patientStats = Object.values(patientStatsMap).slice(0, 7); // Show top 7

  // Time Series for Line Chart
  const timeSeriesMap = {};
  allScans.forEach(scan => {
    const date = scan.dateString; 
    if (!timeSeriesMap[date]) timeSeriesMap[date] = { date, ulcerCount: 0 };
    if ((scan.finalLabel || scan.result) === 'Ulcer') timeSeriesMap[date].ulcerCount++;
  });
  const timeSeries = Object.values(timeSeriesMap).sort((a, b) => new Date(a.date) - new Date(b.date));

  // Pie Data
  const pieData = [
    { name: "Ulcer", value: ulcerCount },
    { name: "Healthy", value: healthyCount },
  ];
  const PIE_COLORS = ['#ef4444', '#22c55e'];

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

      {/* HEADER */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold text-slate-800">
            AI Clinical Dashboard
          </h1>
          <span className="bg-blue-100 text-blue-700 text-xs px-3 py-1 rounded-full font-semibold">
            AI Ensemble Powered
          </span>
        </div>
        <p className="text-slate-500 mt-1">
          Real-time diabetic foot ulcer monitoring system
        </p>
      </div>

      {/* RISK ALERT BANNER */}
      {Number(ulcerRate) > 50 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-xl">
          <p className="text-red-700 font-semibold">
            High Ulcer Detection Rate — Immediate monitoring recommended.
          </p>
        </div>
      )}

      {/* KPI GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KPICard title="Total Scans" value={totalScans} type="neutral" />
        <KPICard title="Ulcer Rate" value={`${ulcerRate}%`} type="danger" />
        <KPICard title="Avg Confidence" value={`${avgConfidence}%`} type="info" />
        <KPICard title="False Positives" value={falsePositives} type="warning" />
        <KPICard title="High Risk Cases" value={highRiskCount} type="danger" />
        <KPICard title="Reliability Score" value={`${reliabilityScore}%`} type="success" />
      </div>

      {/* ANALYTICS SECTION */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Patient Breakdown */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-lg text-slate-800 mb-6">Patient Breakdown</h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={patientStats}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <RechartsTooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'}} />
                <RechartsLegend />
                <Bar dataKey="ulcer" name="Ulcer" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="healthy" name="Healthy" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Scan Distribution */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-lg text-slate-800 mb-6">Scan Distribution</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={90}
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'}} />
              <RechartsLegend verticalAlign="bottom" height={36}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* TREND */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="font-bold text-lg text-slate-800 mb-6">Ulcer Detection Trend</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={timeSeries}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
            <RechartsTooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'}} />
            <Line type="monotone" dataKey="ulcerCount" stroke="#ef4444" strokeWidth={3} dot={{r: 4, fill: '#ef4444', strokeWidth: 2, stroke: '#fff'}} activeDot={{r: 6}} />
          </LineChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
};

const Footer = () => <footer className="bg-slate-900 text-slate-400 py-12 text-center mt-auto">© 2026 DFU-Detect</footer>;
const Badge = ({ children, type }) => <span className={`px-2 py-1 rounded text-xs font-bold ${type === 'red' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{children}</span>;

const EducationHub = () => (
  <div className="p-10 text-center">
    <h2 className="text-2xl font-bold mb-4">Education Hub</h2>
    <p className="mb-8">Learn more about diabetic foot ulcers and prevention.</p>
    <div className="text-xs text-slate-500 mt-4 text-center">
      <AlertCircle className="inline w-3 h-3 mr-1 mb-0.5" /> AI cannot give a definitive diagnosis. Always consult a verified medical practitioner.
    </div>
  </div>
);

const PatientRecords = ({ allScans, userData, onSelectPatient }) => {
  const [filter, setFilter] = useState("all");

  const handleVerify = async (scanId) => {
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'scans', scanId), {
        reviewStatus: 'verified',
        verifiedBy: userData?.firstName || 'Doctor',
        verifiedAt: serverTimestamp()
      });
    } catch (e) {
      console.error("Error verifying scan:", e);
      alert("Failed to verify scan.");
    }
  };

  const getSeverity = (confidence) => {
    const conf = Number(confidence);
    if (conf > 85) return "High";
    if (conf > 60) return "Moderate";
    return "Low";
  };

  const filteredScans = allScans.filter(scan => {
    if (filter === "ulcer") return (scan.finalLabel || scan.result) === "Ulcer";
    if (filter === "healthy") return (scan.finalLabel || scan.result) === "Healthy";
    return true;
  });

  return (
    <div className="w-full max-w-6xl mx-auto py-8 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-900">Patient Records</h1>
        <select 
          onChange={(e) => setFilter(e.target.value)}
          className="bg-white border border-slate-200 text-slate-700 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-2.5 shadow-sm"
        >
          <option value="all">All Scans</option>
          <option value="ulcer">Ulcer Only</option>
          <option value="healthy">Healthy Only</option>
        </select>
      </div>

      <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-xl">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100 text-xs uppercase">
            <tr>
              <th className="px-6 py-4">Patient</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Result</th>
              <th className="px-6 py-4">Severity</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredScans.map((scan) => (
              <tr key={scan.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => onSelectPatient(scan.userId)}>
                <td className="px-6 py-4 font-bold text-slate-800">{scan.patientName}</td>
                <td className="px-6 py-4 text-slate-500">{scan.dateString}</td>
                <td className="px-6 py-4"><Badge type={scan.status}>{scan.result}</Badge></td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                    getSeverity(scan.confidence) === "High"
                      ? "bg-red-100 text-red-700"
                      : getSeverity(scan.confidence) === "Moderate"
                      ? "bg-yellow-100 text-yellow-700"
                      : "bg-green-100 text-green-700"
                  }`}>
                    {getSeverity(scan.confidence)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {scan.reviewStatus === 'verified' ? (
                    <span className="text-xs text-green-600 font-bold">Verified by {scan.verifiedBy}</span>
                  ) : (
                    <span className="text-xs text-yellow-600 font-bold uppercase tracking-wider">Pending</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={(e) => { e.stopPropagation(); onSelectPatient(scan.userId); }}
                    className="text-blue-600 font-bold hover:text-blue-800"
                  >
                    Review
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const PatientDetail = ({ navigate, allScans, patientId }) => {
  const patientScans = allScans.filter(s => s.userId === patientId);
  const patientName = patientScans[0]?.patientName || "Unknown Patient";
  const lastScan = patientScans[0]; // Assuming sorted desc
  const ulcerCount = patientScans.filter(s => s.finalLabel === 'Ulcer').length;
  const ulcerRate = patientScans.length ? ((ulcerCount / patientScans.length) * 100).toFixed(0) : 0;
  
  // Risk Classification
  let riskClass = "Low";
  if (ulcerRate > 50 || (lastScan && lastScan.riskScore > 70)) riskClass = "High";
  else if (ulcerRate > 20 || (lastScan && lastScan.riskScore > 40)) riskClass = "Moderate";

  // Chart Data
  const chartData = patientScans.slice().reverse().map(s => ({
    date: s.dateString,
    risk: s.riskScore || 0
  }));

  return (
    <div className="w-full max-w-6xl mx-auto py-8 space-y-8">
      <div className="flex items-center gap-4 mb-4">
        <button onClick={() => navigate('patient-records')} className="p-2 rounded-full hover:bg-slate-100"><ArrowRight className="h-6 w-6 rotate-180" /></button>
        <h1 className="text-3xl font-extrabold text-slate-900">{patientName} <span className="text-slate-400 font-normal text-lg">#{patientId.slice(0,6)}</span></h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xl">
          <p className="text-slate-500 text-xs font-bold uppercase">Risk Classification</p>
          <p className={`text-3xl font-extrabold ${riskClass === 'High' ? 'text-red-600' : riskClass === 'Moderate' ? 'text-yellow-600' : 'text-green-600'}`}>{riskClass}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xl">
          <p className="text-slate-500 text-xs font-bold uppercase">Total Scans</p>
          <p className="text-3xl font-extrabold text-slate-800">{patientScans.length}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xl">
          <p className="text-slate-500 text-xs font-bold uppercase">Ulcer Rate</p>
          <p className="text-3xl font-extrabold text-slate-800">{ulcerRate}%</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-xl">
          <p className="text-slate-500 text-xs font-bold uppercase">Last Scan</p>
          <p className="text-lg font-bold text-slate-800">{lastScan?.dateString || 'N/A'}</p>
          <Badge type={lastScan?.status}>{lastScan?.result || 'N/A'}</Badge>
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xl">
        <h3 className="font-bold text-lg text-slate-800 mb-6">Risk Timeline</h3>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
              <RechartsTooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'}} />
              <Line type="monotone" dataKey="risk" stroke="#2563eb" strokeWidth={3} dot={{r: 4, fill: '#2563eb', strokeWidth: 2, stroke: '#fff'}} activeDot={{r: 6}} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

const PatientCumulative = ({ allScans }) => {
  // Prepare data for charts
  const patientStats = {};
  allScans.forEach(scan => {
    if (!patientStats[scan.patientName]) {
      patientStats[scan.patientName] = { name: scan.patientName, ulcer: 0, healthy: 0 };
    }
    if (scan.finalLabel === 'Ulcer') patientStats[scan.patientName].ulcer += 1;
    else patientStats[scan.patientName].healthy += 1;
  });
  const barData = Object.values(patientStats).slice(0, 10); // Top 10 for demo

  return (
    <div className="w-full max-w-6xl mx-auto py-8 space-y-8">
      <h1 className="text-2xl font-bold text-slate-900">Cumulative Analytics</h1>
      
      <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xl">
        <h3 className="font-bold text-lg text-slate-800 mb-6">Ulcer vs Healthy Scans per Patient</h3>
        <div className="h-96 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" width={100} stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
              <RechartsTooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'}} />
              <RechartsLegend />
              <Bar dataKey="ulcer" name="Ulcer Detected" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={20} />
              <Bar dataKey="healthy" name="Healthy" fill="#22c55e" radius={[0, 4, 4, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

const TestModel = () => {
  const [enabledModels, setEnabledModels] = useState({
    "foot-ulcers-szvdf/3": true,
    "foot-ulcers-szvdf/2": true,
    "foot-ulcers-szvdf/1": true
  });

  const modelMetrics = [
    { id: "foot-ulcers-szvdf/1", mAP: "92.7%", precision: "91.2%", recall: "86.1%" },
    { id: "foot-ulcers-szvdf/2", mAP: "91.4%", precision: "90.9%", recall: "85.2%" },
    { id: "foot-ulcers-szvdf/3", mAP: "90.6%", precision: "90.7%", recall: "84.3%" }
  ];

  return (
    <div className="w-full max-w-4xl mx-auto py-8 space-y-8">
      <h1 className="text-2xl font-bold text-slate-900">Model Performance Metrics</h1>
      
      {/* Model Selection */}
      <div className="bg-white p-6 rounded-2xl shadow border">
        <h3 className="font-bold mb-4">Model Selection (Ensemble)</h3>
        {Object.keys(enabledModels).map(model => (
          <label key={model} className="flex items-center gap-3 mb-2">
            <input
              type="checkbox"
              checked={enabledModels[model]}
              onChange={() =>
                setEnabledModels(prev => ({
                  ...prev,
                  [model]: !prev[model]
                }))
              }
              className="w-4 h-4 text-blue-600 rounded"
            />
            <span className="text-slate-700">{model}</span>
          </label>
        ))}
      </div>

      {/* Performance Metrics per Model */}
      {modelMetrics.map(m => (
        <div key={m.id} className={`bg-white p-6 rounded-2xl border shadow-sm ${!enabledModels[m.id] ? 'opacity-50' : ''}`}>
          <h3 className="font-bold text-lg text-slate-800 mb-4">{m.id}</h3>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-slate-500">mAP@50</p>
              <p className="text-2xl font-bold">{m.mAP}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Precision</p>
              <p className="text-2xl font-bold">{m.precision}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Recall</p>
              <p className="text-2xl font-bold">{m.recall}</p>
            </div>
          </div>
        </div>
      ))}

      <div className="bg-white p-6 rounded-2xl border shadow-sm">
        <h3 className="font-bold text-lg text-slate-800 mb-4">Ensemble Information</h3>
        <p className="text-slate-600">Platform: Roboflow</p>
        <p className="text-slate-600">Training Dataset: Custom DFU Images</p>
        <p className="text-slate-600">Architecture: YOLOv8</p>
        <p className="text-slate-600 mt-2">Ensemble Method: Weighted voting based on mAP scores</p>
      </div>
    </div>
  );
};

const ScanResultsDoctor = ({ navigate, image, result, onSave, userData }) => {
  const [notes, setNotes] = useState("");

  if (!result) return null;

  const confidence = Number(result.confidence) || 0;
  const isUlcer = result.is_ulcer;

  // Derived metrics (from ensemble)
  // API returns agreementPercentage, confidenceStdDev, models
  const agreement = Number(result.agreementPercentage || result.agreement) || 0;
  const stdDev = Number(result.confidenceStdDev || result.stdDeviation) || 0;
  const reliability = Number(result.reliabilityScore) || 0;
  const modelBreakdown = result.models || result.modelBreakdown || [];

  const getRiskLevel = () => {
    if (confidence > 85) return "High Risk";
    if (confidence > 60) return "Moderate Risk";
    return "Low Risk";
  };

  const getRiskColor = () => {
    if (confidence > 85) return "text-red-600";
    if (confidence > 60) return "text-yellow-600";
    return "text-green-600";
  };

  const handleAction = (action) => {
    const overrides = {
      doctorNotes: notes,
      verifiedBy: userData?.firstName || 'Doctor',
      verifiedAt: serverTimestamp(),
      reviewStatus: action === 'verify' ? 'verified' : action === 'false_positive' ? 'false_positive' : 'pending',
      finalLabel: action === 'verify' ? result.consensus : action === 'false_positive' ? (result.consensus === 'Ulcer' ? 'Healthy' : 'Ulcer') : result.consensus
    };
    onSave(result, overrides);
  };

  return (
    <div className="max-w-7xl mx-auto py-10 grid lg:grid-cols-2 gap-10">

      {/* LEFT SIDE */}
      <div className="space-y-6">

        {/* Image */}
        <div className="bg-white p-6 rounded-2xl shadow-md">
          {image ? (
            <img src={image} alt="Scan" className="rounded-xl w-full object-cover" />
          ) : (
            <div className="p-10 text-center text-slate-400">Image not available</div>
          )}
        </div>

        {/* AI Summary */}
        <div className="bg-white p-6 rounded-2xl shadow-md space-y-4">
          <h2 className="text-xl font-bold">AI Analysis Summary</h2>
          <div className="flex justify-between">
            <span>Prediction:</span>
            <span className={isUlcer ? "text-red-600 font-bold" : "text-green-600 font-bold"}>
              {isUlcer ? "Ulcer Detected" : "Healthy"}
            </span>
          </div>

          <div className="flex justify-between">
            <span>Confidence:</span>
            <span className="font-bold">{confidence.toFixed(2)}%</span>
          </div>

          <div className="flex justify-between">
            <span>Risk Level:</span>
            <span className={`font-bold ${getRiskColor()}`}>
              {getRiskLevel()}
            </span>
          </div>
        </div>

        {/* Ensemble Metrics */}
        <div className="bg-white p-6 rounded-2xl shadow-md space-y-4">
          <h2 className="text-lg font-bold">Ensemble Reliability Metrics</h2>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>Agreement:</div>
            <div className="font-bold">{agreement.toFixed(2)}%</div>

            <div>Confidence Deviation:</div>
            <div className="font-bold">{stdDev.toFixed(2)}</div>

            <div>Reliability Score:</div>
            <div className="font-bold">{reliability.toFixed(2)}%</div>
          </div>

          <p className="text-xs text-slate-500 mt-2">
            Higher agreement and lower deviation indicate more stable ensemble predictions.
          </p>
        </div>
      </div>

      {/* RIGHT SIDE */}
      <div className="space-y-6">

        {/* Model Breakdown */}
        <div className="bg-white p-6 rounded-2xl shadow-md">
          <h2 className="text-lg font-bold mb-4">Model Breakdown</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th>Model</th>
                <th>Prediction</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {modelBreakdown.map((m, index) => (
                <tr key={index} className="border-t">
                  <td className="py-2">{m.model}</td>
                  <td className={m.prediction === "Ulcer" ? "text-red-600" : "text-green-600"}>
                    {m.prediction}
                  </td>
                  <td>{m.confidence.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Doctor Review */}
        <div className="bg-white p-6 rounded-2xl shadow-md space-y-4">
          <h2 className="text-lg font-bold">Doctor Review</h2>

          <textarea
            placeholder="Enter clinical observations..."
            className="w-full border border-slate-200 rounded-lg p-3 text-sm"
            rows="4"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <button 
            onClick={() => handleAction('verify')}
            className="w-full bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700"
          >
            Verify AI Result
          </button>

          <button 
            onClick={() => handleAction('false_positive')}
            className="w-full bg-red-100 text-red-600 border border-red-400 py-2 rounded-lg font-semibold hover:bg-red-200"
          >
            Mark False Positive (Override)
          </button>

          <button 
            onClick={() => handleAction('pending')}
            className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700"
          >
            Save for Follow Up
          </button>
        </div>

      </div>
    </div>
  );
};