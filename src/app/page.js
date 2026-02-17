"use client";

import React, { useState, useEffect, useRef } from 'react';
import { 
  UploadCloud, Activity, FileText, User, Search, AlertCircle, 
  CheckCircle, ChevronRight, LogIn, PlusCircle, BookOpen, 
  Settings, LayoutDashboard, FileBarChart, Filter, ArrowRight 
} from 'lucide-react';

// --- NEW IMPORTS FROM YOUR IMAGE ---
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
  getDoc
} from "firebase/firestore";

// --- CONSTANT FROM YOUR IMAGE ---
const appId = "dfu-detect-app";

// --- MAIN APP COMPONENT ---
export default function App() {
  const [user, setUser] = useState(null); // Firebase Auth User
  const [userData, setUserData] = useState(null); // Firestore User Profile (Role, Name)
  const [route, setRoute] = useState('landing');
  
  // App Data State
  const [scanHistory, setScanHistory] = useState([]);
  const [allPatients, setAllPatients] = useState([]);
  const [allScans, setAllScans] = useState([]); // For Doctor View

  // Transient State (Not saved to DB)
  const [scanImage, setScanImage] = useState(null); // Holds the image blob for current session only
  const [analysisResult, setAnalysisResult] = useState(null);

  // --- 1. AUTHENTICATION ---
  useEffect(() => {
    const initAuth = async () => {
      // Check for a custom token if passed from server/environment
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
        // Fetch User Profile (Role, Name) from Firestore
        const userRef = doc(db, 'artifacts', appId, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setUserData(userSnap.data());
          // Auto-route based on role if on public pages
          if (['landing', 'login', 'signup'].includes(route)) {
            // Optional: Auto-redirect logic could go here
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
        // FIXED: Removed 'data'
        collection(db, 'artifacts', appId, 'scans'),
        where('userId', '==', user.uid)
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const scans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sort by date manually since we can't use complex queries easily in this env
        scans.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setScanHistory(scans);
      }, (error) => console.error("Error fetching history:", error));
      
      return () => unsubscribe();
    }

    // DOCTOR: Fetch all patients and scans
    if (userData.role === 'doctor') {
      // 1. Fetch Scans
      // FIXED: Removed 'data'
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
    // We don't actually sign out the anonymous auth, we just clear the "Profile" state
    // to simulate a logout in this hybrid auth environment.
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

  const handleSaveScan = async (resultData) => {
    if (!user || !userData) return;
    try {
      // FIXED: Removed 'data'
      await addDoc(collection(db, 'artifacts', appId, 'scans'), {
        userId: user.uid,
        patientName: `${userData.firstName} ${userData.lastName}`,
        result: resultData.is_ulcer ? 'Ulcer' : 'Healthy',
        diagnosis: resultData.diagnosis,
        confidence: resultData.confidence,
        status: resultData.is_ulcer ? 'red' : 'green',
        createdAt: serverTimestamp(),
        dateString: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      });
      // Navigate after save
      navigate('my-history');
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
            />
          )}
          
          {route === 'scan-results-patient' && (
            <ScanResultsPatient 
              navigate={navigate} 
              result={analysisResult} 
              image={scanImage}
              onSave={() => handleSaveScan(analysisResult)} 
            />
          )}
          
          {/* History passes empty image because we don't save images */}
          {route === 'my-history' && <MyHistoryPage navigate={navigate} history={scanHistory} />}
          {route === 'education' && <EducationHub navigate={navigate} />}
          
          {/* DOCTOR PORTAL */}
          {route === 'doctor-dashboard' && <DoctorDashboard navigate={navigate} allScans={allScans} />}
          {route === 'patient-records' && <PatientRecords navigate={navigate} allScans={allScans} />}
          {route === 'patient-cumulative' && <PatientCumulative navigate={navigate} allScans={allScans} />}
          {route === 'test-model' && <TestModel navigate={navigate} />}
          {/* Doctor Review: Uses transient image if just scanned, or placeholder if from history */}
          {route === 'scan-results-doctor' && <ScanResultsDoctor navigate={navigate} image={scanImage} result={analysisResult} />}
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
      { id: 'patient-records', label: 'Patients' },
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

// Simplified Login
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

// --- PATIENT VIEWS ---

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

const NewScanPage = ({ navigate, setAnalysisResult, setScanImage }) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  const handleAnalyze = async () => {
    if (!selectedFile) return;
    
    // Create transient preview
    const previewUrl = URL.createObjectURL(selectedFile);
    setScanImage(previewUrl);
    setAnalyzing(true);
    
    const formData = new FormData();
    formData.append('image', selectedFile);

    try {
      const response = await fetch('/api/analyze', { method: 'POST', body: formData });
      const data = await response.json();
      
      if (data.status === 'success') {
        setAnalysisResult(data);
        navigate('scan-results-patient');
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

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-8">
      <h1 className="text-2xl font-bold text-slate-900">New Foot Scan</h1>
      
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
          disabled={!selectedFile || analyzing}
          className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg disabled:opacity-50"
        >
          {analyzing ? 'Processing...' : 'Analyze Image'}
        </button>
      </div>
    </div>
  );
};

const ScanResultsPatient = ({ navigate, result, image, onSave }) => {
  const isUlcer = result?.is_ulcer ?? false;
  const statusColor = isUlcer ? "red" : "green";

  return (
    <div className="max-w-6xl mx-auto py-8">
      <div className="grid lg:grid-cols-2 gap-10 items-start">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
           {image ? <img src={image} alt="Scan" className="w-full h-full object-cover rounded-xl" /> : <div className="text-center p-10">Image Expired</div>}
        </div>

        <div className="space-y-8">
          <div className={`bg-${statusColor}-50 border-l-4 border-${statusColor}-500 text-${statusColor}-800 px-6 py-5 rounded-r-xl`}>
            <h4 className="font-extrabold text-lg">Analysis Complete</h4>
            <p className="text-sm mt-1">{isUlcer ? "Potential abnormality detected." : "No issues detected."}</p>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <h2 className="text-4xl font-extrabold text-slate-900 mb-8">{isUlcer ? "Potential Abnormality" : "Healthy"}</h2>
            <button onClick={onSave} className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 shadow-lg">
              Save Result to History
            </button>
          </div>
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

// --- DOCTOR VIEWS ---
const DoctorDashboard = ({ navigate, allScans }) => (
  <div className="w-full max-w-7xl mx-auto py-8 space-y-8">
    <h1 className="text-2xl font-bold text-slate-900">Doctor's Dashboard</h1>
    
    <div className="grid grid-cols-3 gap-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <p className="text-slate-500 font-bold uppercase">Total Scans</p>
        <p className="text-4xl font-extrabold text-slate-800">{allScans.length}</p>
      </div>
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <p className="text-slate-500 font-bold uppercase">Ulcers Detected</p>
        <p className="text-4xl font-extrabold text-red-600">{allScans.filter(s => s.result === 'Ulcer').length}</p>
      </div>
    </div>

    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-8 py-6 border-b border-slate-100 bg-slate-50">
        <h3 className="font-bold text-lg text-slate-800">Recent Activity Feed</h3>
      </div>
      <table className="w-full text-sm text-left">
        <tbody className="divide-y divide-slate-100">
          {allScans.map((scan) => (
            <tr key={scan.id} className="hover:bg-slate-50">
              <td className="px-8 py-5 font-bold text-slate-800">{scan.patientName}</td>
              <td className="px-8 py-5 text-slate-500">{scan.dateString}</td>
              <td className="px-8 py-5"><Badge type={scan.status}>{scan.result}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const Footer = () => <footer className="bg-slate-900 text-slate-400 py-12 text-center mt-auto">© 2026 DFU-Detect</footer>;
const Badge = ({ children, type }) => <span className={`px-2 py-1 rounded text-xs font-bold ${type === 'red' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{children}</span>;

// Placeholders for routes not fully implemented in this single-file version
const EducationHub = () => <div className="p-10 text-center">Education Hub Content</div>;
const PatientRecords = () => <div className="p-10 text-center">Patient Records View</div>;
const PatientCumulative = () => <div className="p-10 text-center">Cumulative History View</div>;
const TestModel = () => <div className="p-10 text-center">Test Model Playground</div>;
const ScanResultsDoctor = () => <div className="p-10 text-center">Doctor Scan Review Interface</div>;