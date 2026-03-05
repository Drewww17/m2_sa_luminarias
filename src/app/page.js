"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from "next/navigation";
import { 
  UploadCloud, Activity, FileText, User, Search, AlertCircle, 
  CheckCircle, ChevronRight, LogIn, PlusCircle, BookOpen, 
  Settings, LayoutDashboard, FileBarChart, Filter, ArrowRight,
  Menu, X
} from 'lucide-react';
// Reusable logo component
/* eslint-disable @next/next/no-img-element */
const DfuLogo = ({ size = 40, className = '' }) => (
  <img 
    src="/logo.png?v=2" 
    alt="DFU-Detect" 
    width={size} 
    height={size} 
    className={`${className}`}
    style={{ width: size, height: size, objectFit: 'contain' }}
  />
);
/* eslint-enable @next/next/no-img-element */
import Webcam from "react-webcam";
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, Legend as RechartsLegend, ResponsiveContainer, Cell,
  PieChart, Pie
} from 'recharts';

import { auth, db } from "@/lib/firebase";

import {
  onAuthStateChanged,
  signOut
} from "firebase/auth";

import {
  addDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  doc,
  getDoc,
  updateDoc
} from "firebase/firestore";
import { logAuditAction } from "@/lib/auditLogs";
import { generateScanHash } from "@/utils/hashGenerator";
import { exportPatientCsv } from "@/utils/csvExporter";
import { MODEL_VERSION, SYSTEM_VERSION } from "@/constants/systemInfo";

const loadClinicalPdfGenerator = async () => {
  const pdfGeneratorModule = await import("@/utils/pdfGenerator");
  return pdfGeneratorModule.generateClinicalPdf;
};

// --- MAIN APP COMPONENT ---
export default function App() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [route, setRoute] = useState('landing');
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  // App Data State
  const [scanHistory, setScanHistory] = useState([]);
  const [allScans, setAllScans] = useState([]);
  const [doctorScansLoading, setDoctorScansLoading] = useState(true);
  const [doctorScansError, setDoctorScansError] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState(null);

 
  const [scanImage, setScanImage] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem("dfu-theme");
    if (savedTheme === "dark") {
      setIsDarkMode(true);
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
    localStorage.setItem("dfu-theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  // 1. AUTHENTICATION
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const profile = { uid: currentUser.uid, ...userSnap.data() };
          setUserData(profile);
          if (['landing', 'login', 'signup'].includes(route)) {
            if (profile.role === 'doctor') {
              setRoute('doctor-dashboard');
            } else if (profile.role === 'patient') {
              setRoute('patient-dashboard');
            }
          }
        }
      } else {
        setUserData(null);
      }
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- 2. DATA FETCHING (Real-time) ---
  useEffect(() => {
    if (!user || !userData) return;

// PATIENT: Fetch own history
    if (userData.role === 'patient') {
      const q = query(
        collection(db, 'scans'),
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
      const scansQuery = collection(db, 'scans');
      const unsubScans = onSnapshot(
        scansQuery,
        (snapshot) => {
          const scans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          scans.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
          setAllScans(scans);
          setDoctorScansError("");
          setDoctorScansLoading(false);
        },
        (error) => {
          console.error("Error fetching doctor scans:", error);
          setDoctorScansError("Failed to load patient records. Check Firestore rules and doctor approval status.");
          setDoctorScansLoading(false);
        }
      );

      return () => {
        unsubScans();
      };
    }

  }, [user, userData]);

  // --- NAVIGATION ---
  const navigate = (newRoute) => {
    if (newRoute === "login") {
      router.push("/login");
      return;
    }
    if (newRoute === "signup") {
      router.push("/register");
      return;
    }
    if (newRoute === "admin-dashboard") {
      router.push("/admin/dashboard");
      return;
    }

    window.scrollTo(0, 0);
    setRoute(newRoute);
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUserData(null);
    setScanImage(null);
    setAnalysisResult(null);
    navigate('landing');
  };

  const handleSaveScan = async (resultData, overrides = {}, options = {}) => {
    if (!user || !userData) return null;
    try {
      const navigateOnSuccess = options.navigateOnSuccess !== false;
      const diagnosis = resultData.diagnosis || resultData.consensus || (resultData.is_ulcer ? 'Ulcer' : 'Healthy');
      const confidence = Number(resultData.confidence) || 0;
      const riskLevel = resultData.severity || 'Low';
      const verificationStatus = overrides.verificationStatus
        || (overrides.reviewStatus === 'verified' ? 'verified' : overrides.reviewStatus === 'false_positive' ? 'false_positive' : 'pending');

      const scanPayload = {
        diagnosis,
        confidence,
        riskLevel,
        systemVersion: SYSTEM_VERSION,
        modelVersion: MODEL_VERSION,
      };
      const resolvedScanId = overrides.scanId || resultData.scanId || resultData.id || null;

      if (resolvedScanId) {
        await updateDoc(doc(db, 'scans', resolvedScanId), {
          finalLabel: overrides.finalLabel || (resultData.is_ulcer ? 'Ulcer' : 'Healthy'),
          riskScore: resultData.riskScore,
          severity: resultData.severity,
          is_ulcer: !!resultData.is_ulcer,
          reviewedBy: overrides.verifiedBy || null,
          verified: verificationStatus === 'verified',
          reviewStatus: overrides.reviewStatus || verificationStatus,
          verificationStatus,
          doctorNotes: overrides.doctorNotes || '',
          verifiedBy: overrides.verifiedBy || null,
          verifiedAt: overrides.verifiedAt || null,
          verificationTimestamp: overrides.verifiedAt || null,
        });
      } else {
        const scanHash = generateScanHash(scanPayload);
        const newScan = {
          userId: user.uid,
          patientName: `${userData.firstName} ${userData.lastName}`,
          result: resultData.is_ulcer ? 'Ulcer' : 'Healthy',
          finalLabel: overrides.finalLabel || (resultData.is_ulcer ? 'Ulcer' : 'Healthy'),
          ...scanPayload,
          riskScore: resultData.riskScore,
          severity: resultData.severity,
          is_ulcer: !!resultData.is_ulcer,
          reviewedBy: overrides.verifiedBy || null,
          verified: verificationStatus === 'verified',
          status: resultData.is_ulcer ? 'red' : 'green',
          createdAt: serverTimestamp(),
          dateString: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          reviewStatus: overrides.reviewStatus || verificationStatus,
          verificationStatus,
          doctorNotes: overrides.doctorNotes || '',
          verifiedBy: overrides.verifiedBy || null,
          verifiedAt: overrides.verifiedAt || null,
          verificationTimestamp: overrides.verifiedAt || null,
          scanHash,
        };

        const scanRef = await addDoc(collection(db, 'scans'), newScan);
        await updateDoc(doc(db, 'scans', scanRef.id), { scanId: scanRef.id });
        if (navigateOnSuccess) {
          navigate(userData.role === 'doctor' ? 'doctor-dashboard' : 'my-history');
        }
        return scanRef.id;
      }

      if (navigateOnSuccess) {
        navigate(userData.role === 'doctor' ? 'doctor-dashboard' : 'my-history');
      }
      return resolvedScanId;
    } catch (e) {
      console.error("Error saving scan:", e);
      alert("Failed to save record.");
      return null;
    }
  };

  const isPortalUser = userData?.role === "patient" || userData?.role === "doctor";

  const routeContent = (
    <>
      {route === 'landing' && <LandingPage navigate={navigate} />}

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
          userData={userData}
          onSave={() => handleSaveScan(analysisResult)}
        />
      )}

      {route === 'my-history' && (
        <MyHistoryPage
          navigate={navigate}
          history={userData?.role === 'doctor' ? allScans : scanHistory}
          userData={userData}
        />
      )}
      {route === 'education' && <EducationHub navigate={navigate} />}

      {(route === 'doctor-dashboard' || route === 'clinical-overview' || route === 'patient-cumulative') && (
        <DoctorDashboard navigate={navigate} allScans={allScans} />
      )}

      {route === 'patient-records' && (
        <PatientRecords
          navigate={navigate}
          allScans={allScans}
          userData={userData}
          loading={doctorScansLoading}
          error={doctorScansError}
          onSelectPatient={(id) => {
            setSelectedPatientId(id);
            navigate('patient-detail');
          }}
        />
      )}

      {route === 'patient-detail' && <PatientDetail navigate={navigate} allScans={allScans} patientId={selectedPatientId} />}
      {route === 'settings' && <SettingsPage userData={userData} onLogout={handleLogout} navigate={navigate} isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode((prev) => !prev)} />}
      {(route === 'test-model' || route === 'view-models') && <TestModel navigate={navigate} />}
      {route === 'scan-results-doctor' && (
        <ScanResultsDoctor
          navigate={navigate}
          image={scanImage}
          result={analysisResult}
          onSave={handleSaveScan}
          userData={userData}
        />
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col fade-in">
      {!isPortalUser ? <Navbar route={route} userData={userData} navigate={navigate} onLogout={handleLogout} /> : null}

      {isPortalUser ? (
        <HealthcareShell route={route} userData={userData} navigate={navigate} onLogout={handleLogout}>
          {routeContent}
        </HealthcareShell>
      ) : (
        <main className="grow flex flex-col items-center p-4 sm:p-8">
          <div className="w-full max-w-6xl">{routeContent}</div>
        </main>
      )}

      <Footer isPortalUser={isPortalUser} />
    </div>
  );
}

// --- COMPONENTS ---

const Navbar = ({ route, userData, navigate, onLogout }) => {
  const role = userData?.role || 'guest';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const activeLinks = [
    { id: 'landing', label: 'Home' },
    { id: 'login', label: 'Sign In' },
    { id: 'education', label: 'Education Hub' },
  ];

  return (
    <nav className="backdrop-blur-md bg-white/80 border-b border-slate-200 sticky top-0 z-10 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20">
          <div className="flex items-center cursor-pointer gap-3" onClick={() => navigate('landing')}>
            <DfuLogo size={40} />
            <span className="font-extrabold text-xl text-slate-900 tracking-tight hidden sm:block">DFU-Detect</span>
          </div>
          
          <div className="hidden md:flex items-center space-x-8">
            {activeLinks.map(link => (
              <button
                type="button"
                key={link.label}
                onClick={() => navigate(link.id)}
                className={`text-sm font-bold rounded-lg px-2 py-1 transition-colors ${route === link.id ? 'text-blue-600 bg-blue-50' : 'text-slate-500 hover:text-blue-600 hover:bg-slate-50'}`}
              >
                {link.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-600">
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            {role === 'guest' ? (
              <div className="flex items-center gap-4">
                <button type="button" onClick={() => navigate('login')} className="text-sm font-bold text-slate-600 hover:text-blue-600 transition-colors">Login</button>
                <button type="button" onClick={() => navigate('signup')} className="text-sm font-bold bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:bg-blue-700 active:scale-95 shadow-lg shadow-blue-600/20">Sign Up</button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-bold text-slate-800">{userData.firstName} {userData.lastName}</p>
                  <p className="text-xs text-slate-500 capitalize">{role === 'doctor' ? 'Medical Pro' : 'Patient'}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 cursor-pointer hover:bg-blue-100 transition-colors" onClick={onLogout}>
                  <User className="h-5 w-5" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile nav menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 py-2 space-y-1">
            {activeLinks.map(link => (
              <button
                type="button"
                key={link.label}
                onClick={() => { navigate(link.id); setMobileMenuOpen(false); }}
                className={`block w-full text-left text-sm font-medium rounded-lg px-3 py-2 transition-colors ${route === link.id ? 'text-blue-600 bg-blue-50' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {link.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
};

const HealthcareShell = ({ route, userData, navigate, onLogout, children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const baseItems = [
    { id: userData?.role === "doctor" ? "doctor-dashboard" : "patient-dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "new-scan", label: "New Scan", icon: UploadCloud },
    { id: "my-history", label: "Scan History", icon: FileText },
    { id: "education", label: "Education Hub", icon: BookOpen },
  ];

  const doctorItems = [
    { id: "patient-records", label: "Patient Records", icon: User },
    { id: "clinical-overview", label: "Clinical Overview", icon: Activity },
    { id: "view-models", label: "View Models", icon: FileBarChart },
  ];

  const navItems = userData?.role === "doctor" ? [...baseItems.slice(0, 2), ...doctorItems, ...baseItems.slice(2)] : baseItems;

  const handleNav = (id) => {
    navigate(id);
    setSidebarOpen(false);
  };

  return (
    <div className="flex flex-1 bg-slate-50">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-[85vw] max-w-72 bg-white border-r border-slate-200 p-4 flex flex-col transform transition-transform duration-200 ease-in-out lg:w-72 lg:max-w-none lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between px-2 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <DfuLogo size={40} className="rounded-lg" />
            <div>
              <p className="font-semibold text-slate-900">DFU-Detect</p>
              <p className="text-xs text-slate-500">AI Clinical Platform</p>
            </div>
          </div>
          <button type="button" onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 rounded-md hover:bg-slate-100 text-slate-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="mt-4 space-y-1 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = route === item.id || (item.id === "clinical-overview" && route === "doctor-dashboard");
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? "bg-blue-50 text-blue-600" : "text-slate-600 hover:bg-slate-100"}`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 pt-3 space-y-1">
          <button type="button" onClick={() => handleNav('settings')} className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <LogIn className="h-4 w-4 rotate-180" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-h-screen lg:ml-72">
        <header className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200 px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100 text-slate-600">
                <Menu className="h-5 w-5" />
              </button>
              <h1 className="text-lg font-semibold text-slate-900">DFU-Detect</h1>
            </div>
            <div className="hidden sm:block flex-1 max-w-xl relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search patients"
                className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              />
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button type="button" onClick={() => handleNav('settings')} className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 hover:bg-blue-100 transition-colors">
                <User className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="sm:hidden mt-3 relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search patients"
              className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            />
          </div>
        </header>

        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
};

const LandingPage = ({ navigate }) => (
  <div className="flex flex-col items-center text-center space-y-20 py-16">
    <div className="max-w-4xl space-y-8 flex flex-col items-center">
      <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-bold border border-blue-100 shadow-sm">
        <AlertCircle className="h-4 w-4" /> 
        <span>AI-Powered Medical Assistance</span>
      </div>
      <h1 className="text-3xl sm:text-5xl md:text-7xl font-extrabold text-slate-900 tracking-tight leading-tight">
        Early Detection of <br className="hidden md:block" />
        <span className="text-blue-600 relative inline-block mt-2">Diabetic Foot Ulcers</span>
      </h1>
      <p className="text-base sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed px-4 sm:px-0">
        Upload a photo of the affected area to receive an instant analysis powered by advanced computer vision. Early detection saves lives.
      </p>
      <div className="flex flex-col sm:flex-row justify-center gap-4 pt-6 w-full sm:w-auto">
        <button type="button" onClick={() => navigate('signup')} className="bg-blue-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-blue-700 active:scale-95 flex items-center justify-center gap-2 shadow-xl shadow-blue-600/30 text-lg w-full sm:w-auto">
          <UploadCloud className="h-5 w-5" /> Start Scan
        </button>
        <button type="button" onClick={() => navigate('education')} className="bg-white text-slate-700 border-2 border-slate-200 px-8 py-4 rounded-xl font-bold hover:bg-slate-50 hover:border-slate-300 active:scale-95 text-lg w-full sm:w-auto">
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
        Don&apos;t have an account? <span className="text-blue-600 font-bold cursor-pointer hover:underline" onClick={() => navigate('signup')}>Register now</span>
      </p>
    </div>
  );
};

// PATIENT VIEWS

const PatientDashboard = ({ navigate, history, userData }) => (
  <div className="space-y-8 sm:space-y-10 w-full max-w-5xl mx-auto py-4 sm:py-8 px-1 sm:px-0">
    <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-slate-200 pb-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Hello, {userData?.firstName || 'User'}</h1>
        <p className="text-slate-500 font-medium mt-1">Welcome to your health monitoring dashboard.</p>
      </div>
    </div>

    <div className="bg-white border border-slate-100 rounded-3xl p-6 sm:p-10 shadow-sm text-center flex flex-col items-center justify-center space-y-6 hover:shadow-md transition-shadow">
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
          <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100 text-xs uppercase tracking-wider">
              <tr><th className="px-4 sm:px-8 py-4">Date</th><th className="px-4 sm:px-8 py-4">Result</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.slice(0, 3).map((item) => (
                <tr key={item.id} className="hover:bg-blue-50/30">
                  <td className="px-4 sm:px-8 py-4 sm:py-5 text-slate-700 font-bold">{item.dateString}</td>
                  <td className="px-4 sm:px-8 py-4 sm:py-5"><Badge type={item.status}>{item.result}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
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
    <div className="max-w-3xl mx-auto py-4 sm:py-8 space-y-6 sm:space-y-8 px-1 sm:px-0">
      <h1 className="text-xl sm:text-2xl font-bold text-slate-900">New Foot Scan</h1>
      
      {/* Model Selection */}
      <div className="bg-white p-6 rounded-2xl border shadow-lg hover:shadow-xl transition-shadow duration-300">
        <h3 className="font-bold mb-4">Model Selection (AI Models)</h3>
        <div className="grid grid-cols-1 gap-3">
          {availableModels.map(model => (
            <label key={model.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-slate-50 transition-colors cursor-pointer">
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
        type="button"
        onClick={() => setUseWebcam(!useWebcam)}
        className="mb-4 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-slate-700 active:scale-95"
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
            type="button"
            onClick={() => {
              const imageSrc = webcamRef.current.getScreenshot();
              if (imageSrc) {
                analyzeWebcam(imageSrc);
              }
            }}
            disabled={analyzing || selectedModels.length === 0}
            className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {analyzing ? 'Processing...' : 'Capture & Analyze'}
          </button>
        </div>
      ) : (
        <>
          <div 
            className="bg-white border-2 border-dashed border-slate-300 rounded-3xl p-8 sm:p-16 flex flex-col items-center justify-center text-center hover:bg-slate-50 cursor-pointer"
            onClick={() => fileInputRef.current.click()}
          >
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => setSelectedFile(e.target.files[0])} />
            
            {selectedFile ? (
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
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
              className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 active:scale-95 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
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
        className={`${color} h-4 rounded-full`}
        style={{ width: `${score}%` }}
      />
    </div>
  );
};

const BoundingBoxVisualization = ({ image, predictions = [], imageMeta }) => {
  const width = Number(imageMeta?.width) || 1;
  const height = Number(imageMeta?.height) || 1;

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Bounding Box Visualization</h3>
      <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image ? <img src={image} alt="Scan" className="w-full h-full object-contain" /> : <div className="p-10 text-center text-slate-500">Image expired</div>}

        {image && predictions.map((prediction, index) => {
          const boxLeft = ((Number(prediction.x || 0) - Number(prediction.width || 0) / 2) / width) * 100;
          const boxTop = ((Number(prediction.y || 0) - Number(prediction.height || 0) / 2) / height) * 100;
          const boxWidth = (Number(prediction.width || 0) / width) * 100;
          const boxHeight = (Number(prediction.height || 0) / height) * 100;
          const label = prediction.class || "Finding";
          const isUlcer = String(label).toLowerCase().includes("ulcer");

          return (
            <div
              key={`${prediction.class}-${index}`}
              className={`absolute border-2 ${isUlcer ? "border-red-500" : "border-emerald-500"}`}
              style={{
                left: `${Math.max(0, boxLeft)}%`,
                top: `${Math.max(0, boxTop)}%`,
                width: `${Math.max(0, boxWidth)}%`,
                height: `${Math.max(0, boxHeight)}%`,
              }}
            >
              <span className={`absolute -top-6 left-0 text-xs px-2 py-1 rounded-md text-white ${isUlcer ? "bg-red-500" : "bg-emerald-500"}`}>
                {label} — {Number(prediction.confidence || 0).toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
      {predictions.length === 0 ? <p className="text-sm text-slate-500 mt-3">No localized lesion boxes were returned for this scan.</p> : null}
    </div>
  );
};

const ScanResultsPatient = ({ navigate, result, image, history, onSave, userData }) => {
  if (!result) return null;

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
    const tempScanId = result.scanId || result.id || `TEMP-${Date.now()}`;
    const generateClinicalPdf = await loadClinicalPdfGenerator();
    await generateClinicalPdf({
      scan: {
        ...result,
        scanId: tempScanId,
        diagnosis: result.diagnosis || result.consensus,
        riskLevel: result.severity,
        systemVersion: SYSTEM_VERSION,
        modelVersion: MODEL_VERSION,
      },
      patient: userData,
      doctorNotes: result.doctorNotes || "",
      containerId: "clinical-report",
    });

    const currentUid = auth.currentUser?.uid;
    if (currentUid) {
      await logAuditAction({
        action: "report_exported",
        performedBy: currentUid,
        targetUser: userData?.uid || currentUid,
      });
    }
  };

  const diagnosis = result.consensus || result.diagnosis || (result.is_ulcer ? "Ulcer Detected" : "Healthy");
  const confidence = Number(result.confidence || 0);
  const riskLevel = result.severity || "Low";
  const riskClass = riskLevel === "High" ? "text-red-500" : riskLevel === "Moderate" ? "text-amber-500" : "text-emerald-500";

  return (
    <div className="max-w-6xl mx-auto py-2 grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-3">
        <BoundingBoxVisualization image={image} predictions={result.predictions || []} imageMeta={result.imageMeta} />
      </div>

      <div id="clinical-report" className="lg:col-span-2 space-y-4">
        <div className="bg-white rounded-xl shadow-md p-6 space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">Diagnosis Card</h2>
          <p className="text-sm text-slate-500">Diagnosis</p>
          <p className={`text-lg font-semibold ${diagnosis.toLowerCase().includes("ulcer") ? "text-red-500" : "text-emerald-500"}`}>{diagnosis}</p>
          <p className="text-sm text-slate-500">Confidence Score</p>
          <p className="text-2xl font-semibold text-slate-900">{confidence.toFixed(2)}%</p>
          <p className="text-sm text-slate-500">Risk Level</p>
          <p className={`font-semibold ${riskClass}`}>{riskLevel}</p>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <p className="text-sm text-slate-500 mb-2">Scan Metadata</p>
          <div className="space-y-2 text-sm">
            <p className="text-slate-700"><span className="text-slate-500">Timestamp:</span> {new Date().toLocaleString()}</p>
            <p className="text-slate-700"><span className="text-slate-500">System:</span> {SYSTEM_VERSION}</p>
            <p className="text-slate-700"><span className="text-slate-500">Model:</span> {MODEL_VERSION}</p>
            <p className="text-slate-700"><span className="text-slate-500">Recommendation:</span> {result.recommendation || "N/A"}</p>
          </div>
          {trend ? <p className={`mt-3 text-sm font-medium ${trend.includes("worsening") ? "text-red-500" : "text-emerald-500"}`}>{trend}</p> : null}
        </div>

        <button type="button" onClick={onSave} className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700">Save Result to History</button>
        <button onClick={downloadPDF} className="w-full bg-slate-900 text-white py-3 rounded-xl font-semibold hover:bg-slate-800">Download Clinical Report (PDF)</button>
      </div>
    </div>
  );
};

const MyHistoryPage = ({ navigate, history, userData }) => {
  const [exportFilter, setExportFilter] = useState("all");
  const isDoctorView = userData?.role === "doctor";

  const handleExportCsv = () => {
    if (!userData) return;
    exportPatientCsv({
      patient: userData,
      history,
      filterMode: exportFilter,
    });
  };

  return (
    <div className="w-full max-w-6xl mx-auto py-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{isDoctorView ? "Scan History" : "My Scan History"}</h1>
        <div className="flex items-center gap-2">
          <select
            value={exportFilter}
            onChange={(event) => setExportFilter(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-slate-700 focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
          >
            <option value="all">Export all</option>
            <option value="ulcer">Export ulcer-only</option>
            <option value="last30">Export last 30 days</option>
          </select>
          <button
            type="button"
            onClick={handleExportCsv}
            className="rounded-xl px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 active:scale-95"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300">
        {history.length > 0 ? (
          <div className="overflow-x-auto">
          <table className="w-full text-sm text-left divide-y divide-slate-200">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100 text-xs uppercase">
              <tr>
                <th className="px-4 sm:px-8 py-4 sm:py-5">Date</th>
                {isDoctorView ? <th className="px-4 sm:px-8 py-4 sm:py-5">Patient</th> : null}
                <th className="px-4 sm:px-8 py-4 sm:py-5">Result</th>
                <th className="px-4 sm:px-8 py-4 sm:py-5 hidden sm:table-cell">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors duration-150">
                  <td className="px-4 sm:px-8 py-4 sm:py-5 font-bold text-slate-700">{item.dateString || "N/A"}</td>
                  {isDoctorView ? <td className="px-4 sm:px-8 py-4 sm:py-5 text-slate-700">{item.patientName || "N/A"}</td> : null}
                  <td className="px-4 sm:px-8 py-4 sm:py-5"><Badge type={item.status}>{item.result}</Badge></td>
                  <td className="px-4 sm:px-8 py-4 sm:py-5 text-slate-400 italic hidden sm:table-cell">{isDoctorView ? (item.scanId || item.id || "No scan ID") : "Image not retained (Privacy)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : <div className="p-8 text-center text-slate-500">{isDoctorView ? "No scans found yet." : "No history found."}</div>}
      </div>
    </div>
  );
};

// DOCTOR VIEWS
const KPICard = ({ title, value, icon: Icon, color }) => (
  <div className="bg-white rounded-xl shadow-md p-6">
    <div className="flex items-center justify-between mb-4">
      <p className="text-slate-500 text-sm">{title}</p>
      <Icon className={`h-5 w-5 ${color}`} />
    </div>
    <p className="text-3xl font-semibold text-slate-900">{value}</p>
  </div>
);

const DoctorDashboard = ({ allScans }) => {
  const sortedScans = useMemo(
    () =>
      [...allScans].sort(
        (a, b) =>
          (b.createdAt?.seconds || 0) -
          (a.createdAt?.seconds || 0)
      ),
    [allScans]
  );

  const metrics = useMemo(() => {
    const totalPatients = new Set(allScans.map((scan) => scan.userId).filter(Boolean)).size;
    const totalScans = allScans.length;
    const ulcersDetected = allScans.filter((scan) => (scan.finalLabel || scan.result) === "Ulcer" || scan.is_ulcer).length;
    const pendingReviews = allScans.filter((scan) => (scan.reviewStatus || "pending") === "pending").length;

    return { totalPatients, totalScans, ulcersDetected, pendingReviews };
  }, [allScans]);

  const highPriorityAlerts = useMemo(
    () => sortedScans.filter((scan) => (scan.finalLabel || scan.result) === "Ulcer" || scan.is_ulcer).slice(0, 6),
    [sortedScans]
  );

  const recentScans = useMemo(() => sortedScans.slice(0, 8), [sortedScans]);

  const riskDistribution = useMemo(() => {
    const healthy = allScans.filter((scan) => (scan.finalLabel || scan.result) === "Healthy").length;
    const ulcer = allScans.filter((scan) => (scan.finalLabel || scan.result) === "Ulcer" || scan.is_ulcer).length;
    const pending = allScans.filter((scan) => (scan.reviewStatus || "pending") === "pending").length;
    const followUp = allScans.filter((scan) => ["High", "Moderate"].includes(scan.riskLevel || scan.severity || "") && (scan.reviewStatus || "pending") !== "verified").length;

    const maxValue = Math.max(healthy, ulcer, pending, followUp, 1);

    return [
      { label: "Healthy", value: healthy, color: "bg-emerald-500" },
      { label: "Ulcer Detected", value: ulcer, color: "bg-red-500" },
      { label: "Pending Review", value: pending, color: "bg-amber-500" },
      { label: "Follow-up Required", value: followUp, color: "bg-blue-600" },
    ].map((item) => ({ ...item, width: `${(item.value / maxValue) * 100}%` }));
  }, [allScans]);

  return (
    <div className="space-y-6">
      <section className="bg-linear-to-r from-blue-600 to-blue-500 rounded-xl p-6 text-white shadow-md">
        <h1 className="text-2xl font-semibold">Clinical Overview</h1>
        <p className="text-blue-100 mt-1">Centralized monitoring for diabetic foot ulcer detection workflows.</p>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Total Patients" value={metrics.totalPatients} icon={User} color="text-blue-600" />
        <KPICard title="Total Scans" value={metrics.totalScans} icon={FileText} color="text-blue-600" />
        <KPICard title="Ulcers Detected" value={metrics.ulcersDetected} icon={AlertCircle} color="text-red-500" />
        <KPICard title="Pending Reviews" value={metrics.pendingReviews} icon={Filter} color="text-amber-500" />
      </section>

      <section className="bg-white rounded-xl shadow-md p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">High Priority Alerts</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-3 pr-4">Patient ID</th>
                <th className="py-3 pr-4">Date</th>
                <th className="py-3 pr-4">Diagnosis</th>
                <th className="py-3">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {highPriorityAlerts.length === 0 ? (
                <tr><td className="py-4 text-slate-500" colSpan={4}>No high-priority alerts.</td></tr>
              ) : (
                highPriorityAlerts.map((scan) => (
                  <tr key={scan.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 pr-4 text-slate-700">{scan.userId?.slice(0, 8) || "N/A"}</td>
                    <td className="py-3 pr-4 text-slate-600">{scan.dateString || "N/A"}</td>
                    <td className="py-3 pr-4 text-red-500 font-medium">{scan.diagnosis || scan.finalLabel || scan.result || "Ulcer"}</td>
                    <td className="py-3 text-slate-700">{Number(scan.confidence || 0).toFixed(2)}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-md p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Scan Activity</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200">
                  <th className="py-3 pr-4">Patient</th>
                  <th className="py-3 pr-4">Date</th>
                  <th className="py-3 pr-4">Diagnosis</th>
                  <th className="py-3 pr-4">Confidence</th>
                  <th className="py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentScans.map((scan) => {
                  const diagnosis = scan.finalLabel || scan.result || "N/A";
                  const statusClass = diagnosis === "Ulcer"
                    ? "bg-red-100 text-red-500"
                    : (scan.reviewStatus || "pending") === "pending"
                    ? "bg-amber-100 text-amber-500"
                    : "bg-emerald-100 text-emerald-500";
                  const statusText = (scan.reviewStatus || "pending") === "pending"
                    ? "Pending Review"
                    : diagnosis === "Ulcer"
                    ? "Ulcer Detected"
                    : "Healthy";

                  return (
                    <tr key={scan.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 pr-4 text-slate-700">{scan.patientName || "N/A"}</td>
                      <td className="py-3 pr-4 text-slate-600">{scan.dateString || "N/A"}</td>
                      <td className="py-3 pr-4 text-slate-700">{scan.diagnosis || diagnosis}</td>
                      <td className="py-3 pr-4 text-slate-700">{Number(scan.confidence || 0).toFixed(2)}%</td>
                      <td className="py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass}`}>{statusText}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Risk Distribution</h2>
          <div className="space-y-4">
            {riskDistribution.map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600">{item.label}</span>
                  <span className="text-slate-900 font-medium">{item.value}</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full ${item.color}`} style={{ width: item.width }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

const Footer = ({ isPortalUser = false }) => (
  <footer className={`bg-white border-t border-slate-200 py-6 mt-auto ${isPortalUser ? "lg:pl-72" : ""}`}>
    <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <DfuLogo size={32} className="rounded-lg" />
        <div>
          <p className="text-sm font-semibold text-slate-900">DFU-Detect</p>
          <p className="text-xs text-slate-500">AI Assisted Diabetic Foot Ulcer Detection System</p>
        </div>
      </div>
      <p className="text-xs text-slate-500">© 2026 Philip Andrew</p>
    </div>
  </footer>
);
const Badge = ({ children, type }) => {
  const badgeStyles = {
    red: "bg-red-100 text-red-700",
    green: "bg-emerald-100 text-emerald-700",
    verified: "bg-emerald-100 text-emerald-700",
    pending: "bg-amber-100 text-amber-700",
  };

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${badgeStyles[type] || "bg-slate-100 text-slate-700"}`}>
      {children}
    </span>
  );
};

const EducationHub = () => {
  const sections = [
    {
      title: "What is a Diabetic Foot Ulcer",
      description: "A diabetic foot ulcer is an open wound or sore that develops due to poor circulation, nerve damage, or prolonged pressure on the foot.",
    },
    {
      title: "Early Warning Signs",
      description: "Look for skin discoloration, persistent redness, swelling, blisters, drainage, numbness, or unusual warmth around the affected area.",
    },
    {
      title: "Risk Factors",
      description: "Uncontrolled blood glucose, peripheral neuropathy, poor circulation, smoking, ill-fitting footwear, and prior ulcer history increase risk.",
    },
    {
      title: "Prevention Tips",
      description: "Inspect feet daily, keep skin clean and moisturized, wear protective footwear, trim nails safely, and attend regular foot checks.",
    },
    {
      title: "When to See a Doctor",
      description: "Seek immediate care for non-healing wounds, signs of infection, foul odor, fever, severe pain, or rapidly worsening discoloration.",
    },
  ];

  return (
    <div className="space-y-6">
      <section className="bg-linear-to-r from-blue-600 to-blue-500 rounded-xl p-6 text-white shadow-md">
        <h2 className="text-2xl font-semibold">Education Hub</h2>
        <p className="text-blue-100 mt-1">Clinically guided diabetic foot ulcer awareness and prevention.</p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map((section) => (
          <article key={section.title} className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{section.title}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{section.description}</p>
          </article>
        ))}
      </section>

      <p className="text-xs text-slate-500 bg-slate-100 rounded-lg px-4 py-3">
        AI outputs are supportive tools and do not replace formal medical diagnosis. Consult a licensed healthcare provider for treatment decisions.
      </p>
    </div>
  );
};

const PatientRecords = ({ allScans, userData, onSelectPatient, loading = false, error = "" }) => {
  const [filter, setFilter] = useState("all");

  const handleVerify = async (scanId) => {
    try {
      await updateDoc(doc(db, 'scans', scanId), {
        reviewStatus: 'verified',
        verificationStatus: 'verified',
        reviewedBy: userData?.firstName || 'Doctor',
        verificationTimestamp: serverTimestamp(),
        verifiedBy: userData?.firstName || 'Doctor',
        verifiedAt: serverTimestamp()
      });

      const currentUid = auth.currentUser?.uid;
      if (currentUid) {
        await logAuditAction({
          action: "scan_reviewed",
          performedBy: currentUid,
          targetUser: userData?.uid || currentUid,
          scanId,
        });
      }
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
    <div className="w-full max-w-6xl mx-auto py-4 sm:py-8 space-y-6 sm:space-y-8 px-1 sm:px-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Patient Records</h1>
        <select 
          onChange={(e) => setFilter(e.target.value)}
          className="bg-white border border-slate-200 text-slate-700 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-2.5 shadow-sm"
        >
          <option value="all">All Scans</option>
          <option value="ulcer">Ulcer Only</option>
          <option value="healthy">Healthy Only</option>
        </select>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading patient records...</div>
        ) : error ? (
          <div className="p-8 text-center text-red-600 font-semibold">{error}</div>
        ) : filteredScans.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No patient records found yet.</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-160">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100 text-xs uppercase">
              <tr>
                <th className="px-4 sm:px-6 py-4">Patient</th>
                <th className="px-4 sm:px-6 py-4">Date</th>
                <th className="px-4 sm:px-6 py-4">Result</th>
                <th className="px-4 sm:px-6 py-4">Severity</th>
                <th className="px-4 sm:px-6 py-4 hidden sm:table-cell">Status</th>
                <th className="px-4 sm:px-6 py-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredScans.map((scan) => (
                <tr key={scan.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => onSelectPatient(scan.userId)}>
                  <td className="px-4 sm:px-6 py-4 font-bold text-slate-800">{scan.patientName}</td>
                  <td className="px-4 sm:px-6 py-4 text-slate-500">{scan.dateString}</td>
                  <td className="px-4 sm:px-6 py-4"><Badge type={scan.status}>{scan.result}</Badge></td>
                  <td className="px-4 sm:px-6 py-4">
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
                  <td className="px-4 sm:px-6 py-4 hidden sm:table-cell">
                    {scan.reviewStatus === 'verified' ? (
                      <span className="text-xs text-green-600 font-bold">Verified by {scan.verifiedBy}</span>
                    ) : (
                      <span className="text-xs text-yellow-600 font-bold uppercase tracking-wider">Pending</span>
                    )}
                  </td>
                  <td className="px-4 sm:px-6 py-4">
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
        )}
      </div>
    </div>
  );
};

const PatientDetail = ({ navigate, allScans, patientId }) => {
  const patientScans = allScans
    .filter((scan) => scan.userId === patientId)
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  const patientName = patientScans[0]?.patientName || "Unknown Patient";
  const lastScan = patientScans[patientScans.length - 1];
  const ulcerCount = patientScans.filter((scan) => (scan.finalLabel || scan.result) === "Ulcer" || scan.is_ulcer).length;
  const riskStatus =
    ulcerCount > 2 || ["High", "Moderate"].includes(lastScan?.riskLevel || lastScan?.severity || "")
      ? "Follow-up Required"
      : ulcerCount > 0
      ? "Monitor"
      : "Stable";

  return (
    <div className="w-full max-w-6xl mx-auto py-2 space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('patient-records')} className="p-2 rounded-full hover:bg-slate-100"><ArrowRight className="h-6 w-6 rotate-180" /></button>
        <h1 className="text-2xl font-semibold text-slate-900">Patient Record</h1>
      </div>

      <div className="bg-white rounded-xl shadow-md p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Patient Profile Card</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-slate-500">Patient ID</p>
            <p className="text-slate-900 font-medium">{patientId || "N/A"}</p>
          </div>
          <div>
            <p className="text-slate-500">Name</p>
            <p className="text-slate-900 font-medium">{patientName}</p>
          </div>
          <div>
            <p className="text-slate-500">Last Scan Date</p>
            <p className="text-slate-900 font-medium">{lastScan?.dateString || "N/A"}</p>
          </div>
          <div>
            <p className="text-slate-500">Risk Status</p>
            <p className={`font-medium ${riskStatus === "Follow-up Required" ? "text-red-500" : riskStatus === "Monitor" ? "text-amber-500" : "text-emerald-500"}`}>{riskStatus}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Scan Timeline</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-3 pr-4">Date</th>
                <th className="py-3 pr-4">Diagnosis</th>
                <th className="py-3 pr-4">Confidence</th>
                <th className="py-3">Doctor Verification</th>
              </tr>
            </thead>
            <tbody>
              {patientScans.length === 0 ? (
                <tr><td className="py-4 text-slate-500" colSpan={4}>No scan history found.</td></tr>
              ) : (
                patientScans.map((scan) => (
                  <tr key={scan.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 pr-4 text-slate-600">{scan.dateString || "N/A"}</td>
                    <td className="py-3 pr-4 text-slate-900">{scan.diagnosis || scan.finalLabel || scan.result || "N/A"}</td>
                    <td className="py-3 pr-4 text-slate-700">{Number(scan.confidence || 0).toFixed(2)}%</td>
                    <td className="py-3">
                      {(scan.reviewStatus || "pending") === "verified" ? (
                        <span className="px-2.5 py-1 rounded-full text-xs bg-emerald-100 text-emerald-600">Verified</span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs bg-amber-100 text-amber-600">Pending</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const PatientCumulative = ({ allScans }) => {
  const [exportFilter, setExportFilter] = useState("all");

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

  const handleExportAllCsv = () => {
    // Export all scans as CSV
    const filteredScans = exportFilter === 'ulcer' 
      ? allScans.filter(s => s.finalLabel === 'Ulcer' || s.is_ulcer)
      : exportFilter === 'last30'
      ? allScans.filter(s => {
          const scanDate = s.createdAt?.toDate ? s.createdAt.toDate() : new Date(s.createdAt?.seconds * 1000);
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          return scanDate >= thirtyDaysAgo;
        })
      : allScans;

    // Create CSV content
    const headers = ['Scan ID', 'Date', 'Patient ID', 'Diagnosis', 'Confidence', 'Risk Level', 'Doctor Verified', 'Notes'];
    const rows = filteredScans.map(scan => {
      const date = scan.createdAt?.toDate 
        ? scan.createdAt.toDate().toLocaleDateString() 
        : scan.dateString || 'N/A';
      return [
        scan.scanId || scan.id || 'N/A',
        date,
        scan.userId || 'N/A',
        scan.diagnosis || scan.finalLabel || scan.result || 'N/A',
        `${Number(scan.confidence || 0).toFixed(2)}%`,
        scan.riskLevel || scan.severity || 'N/A',
        scan.verified || scan.reviewStatus === 'verified' ? 'Yes' : 'No',
        scan.doctorNotes || ''
      ];
    });

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dfu-cumulative-report-${exportFilter}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-6xl mx-auto py-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Cumulative Analytics</h1>
        <div className="flex items-center gap-2">
          <select
            value={exportFilter}
            onChange={(e) => setExportFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-slate-700"
          >
            <option value="all">Export all</option>
            <option value="ulcer">Export ulcer-only</option>
            <option value="last30">Export last 30 days</option>
          </select>
          <button
            type="button"
            onClick={handleExportAllCsv}
            className="rounded-lg px-4 py-2 text-white bg-blue-600 hover:bg-blue-700"
          >
            Export CSV
          </button>
        </div>
      </div>
      
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
    <div className="w-full max-w-4xl mx-auto py-2 space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">View Models</h1>
      
      {/* Model Selection */}
      <div className="bg-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition-shadow duration-300 border">
        <h3 className="font-bold mb-4">Model Selection (AI Models)</h3>
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
          <h3 className="font-semibold text-lg text-slate-900 mb-4">YOLOv11 DFU Detector ({m.id})</h3>
          <div className="grid grid-cols-3 gap-4 sm:gap-6">
            <div>
              <p className="text-sm text-slate-500">mAP</p>
              <p className="text-xl sm:text-2xl font-bold">{m.mAP}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Precision</p>
              <p className="text-xl sm:text-2xl font-bold">{m.precision}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Recall</p>
              <p className="text-xl sm:text-2xl font-bold">{m.recall}</p>
            </div>
          </div>
        </div>
      ))}

      <div className="bg-white p-6 rounded-2xl border shadow-lg hover:shadow-xl transition-shadow duration-300">
        <h3 className="font-semibold text-lg text-slate-900 mb-4">Model Details</h3>
        <p className="text-slate-600">Model Name: YOLOv11 DFU Detector</p>
        <p className="text-slate-600">Version: {MODEL_VERSION}</p>
        <p className="text-slate-600">Precision: 91%</p>
        <p className="text-slate-600">Recall: 88%</p>
        <p className="text-slate-600">mAP: 89%</p>
        <p className="text-slate-600">Last Updated: March 2026</p>
      </div>
    </div>
  );
};

const ScanResultsDoctor = ({ navigate, image, result, onSave, userData }) => {
  const [notes, setNotes] = useState("");
  const [savedScanId, setSavedScanId] = useState(result?.scanId || result?.id || null);
  const [localVerificationStatus, setLocalVerificationStatus] = useState(
    result?.verificationStatus || result?.reviewStatus || "pending"
  );

  if (!result) return null;

  const confidence = Number(result.confidence) || 0;
  const isUlcer = result.is_ulcer;

  // Derived metrics (from model outputs)
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

  const handleAction = async (action) => {
    const currentUid = auth.currentUser?.uid;
    if (currentUid && action === 'false_positive') {
      logAuditAction({
        action: "doctor_override",
        performedBy: currentUid,
        targetUser: currentUid,
      });
    }

    const overrides = {
      doctorNotes: notes,
      verifiedBy: userData?.firstName || 'Doctor',
      verifiedAt: serverTimestamp(),
      verificationStatus: action === 'verify' ? 'verified' : action === 'false_positive' ? 'false_positive' : 'pending',
      reviewStatus: action === 'verify' ? 'verified' : action === 'false_positive' ? 'false_positive' : 'pending',
      scanId: savedScanId,
      finalLabel: action === 'verify' ? result.consensus : action === 'false_positive' ? (result.consensus === 'Ulcer' ? 'Healthy' : 'Ulcer') : result.consensus
    };

    // If scan already exists in Firestore, just update verification fields (no hash change)
    if (action === 'verify' && savedScanId) {
      await updateDoc(doc(db, 'scans', savedScanId), {
        verificationStatus: 'verified',
        reviewStatus: 'verified',
        reviewedBy: userData?.firstName || 'Doctor',
        verifiedBy: userData?.firstName || 'Doctor',
        verificationTimestamp: serverTimestamp(),
        verifiedAt: serverTimestamp(),
        doctorNotes: notes,
      });
      setLocalVerificationStatus('verified');
      return;
    }

    // Otherwise save the scan first (creates new doc with hash), then track its ID
    const newScanId = await onSave(result, overrides, { navigateOnSuccess: false });
    if (newScanId) {
      setSavedScanId(newScanId);
      if (action === 'verify') {
        setLocalVerificationStatus('verified');
      }
    }
  };

  const handleVerify = async () => {
    await handleAction('verify');
  };

  return (
    <div className="max-w-7xl mx-auto py-2 grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-3 space-y-6">
        <BoundingBoxVisualization image={image} predictions={result.predictions || []} imageMeta={result.imageMeta} />

        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Model Reliability Metrics</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <p className="text-slate-600">Model Agreement</p><p className="font-semibold text-slate-900">{agreement.toFixed(2)}%</p>
            <p className="text-slate-600">Confidence Deviation</p><p className="font-semibold text-slate-900">{stdDev.toFixed(2)}</p>
            <p className="text-slate-600">Reliability Score</p><p className="font-semibold text-slate-900">{reliability.toFixed(2)}%</p>
            <p className="text-slate-600">Scan ID</p><p className="font-semibold text-slate-900 break-all">{savedScanId || "Pending Save"}</p>
          </div>
        </div>
      </div>

      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white rounded-xl shadow-md p-6 space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Diagnosis Card</h2>
          <p className="text-sm text-slate-500">Diagnosis</p>
          <p className={`font-semibold ${isUlcer ? "text-red-500" : "text-emerald-500"}`}>{isUlcer ? "Ulcer Detected" : "Healthy"}</p>
          <p className="text-sm text-slate-500">Confidence Score</p>
          <p className="text-2xl font-semibold text-slate-900">{confidence.toFixed(2)}%</p>
          <p className="text-sm text-slate-500">Risk Level</p>
          <p className={`font-semibold ${getRiskColor()}`}>{getRiskLevel()}</p>
          <p className="text-sm text-slate-500">Scan Metadata</p>
          <p className="text-sm text-slate-700">System: {SYSTEM_VERSION} | Model: {MODEL_VERSION}</p>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Model Breakdown</h2>
          <table className="w-full text-sm divide-y divide-slate-200">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">Model</th>
                <th className="py-2">Diagnosis</th>
                <th className="py-2">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {modelBreakdown.map((model, index) => (
                <tr key={index} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="py-2 text-slate-700">{model.model}</td>
                  <td className={`py-2 ${model.prediction === "Ulcer" ? "text-red-500" : "text-emerald-500"}`}>{model.prediction}</td>
                  <td className="py-2 text-slate-700">{Number(model.confidence || 0).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-xl shadow-md p-6 space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Doctor Review</h2>
          <textarea
            placeholder="Enter clinical observations..."
            className="w-full border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            rows="4"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <button type="button" onClick={handleVerify} className="w-full bg-emerald-600 text-white py-2.5 rounded-lg font-semibold hover:bg-emerald-700">Verify AI Result</button>
          <button type="button" onClick={() => handleAction('false_positive')} className="w-full bg-red-100 text-red-600 border border-red-300 py-2.5 rounded-lg font-semibold hover:bg-red-200">Mark False Positive</button>
          <button type="button" onClick={() => handleAction('pending')} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700">Save for Follow Up</button>

          <p className="text-xs text-slate-500">
            Verification status: <span className={`px-2 py-1 rounded-full ${localVerificationStatus === 'verified' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>{localVerificationStatus === 'verified' ? 'Verified' : 'Pending'}</span>
          </p>

          <button
            type="button"
            onClick={async () => {
              if (!savedScanId) {
                alert("Please verify or save the scan first before downloading the report.");
                return;
              }
              const generateClinicalPdf = await loadClinicalPdfGenerator();
              await generateClinicalPdf({
                scan: {
                  ...result,
                  scanId: savedScanId,
                  diagnosis: result.diagnosis || result.consensus,
                  riskLevel: result.severity,
                  reliabilityScore: reliability,
                  systemVersion: SYSTEM_VERSION,
                  modelVersion: MODEL_VERSION,
                  verificationStatus: localVerificationStatus,
                  reviewedBy: localVerificationStatus === 'verified' ? (userData?.firstName || 'Doctor') : null,
                },
                patient: userData,
                doctorNotes: notes,
                containerId: null,
              });
            }}
            className="w-full bg-slate-900 text-white py-2.5 rounded-lg font-semibold hover:bg-slate-800"
          >
            Download Clinical Report (PDF)
          </button>
        </div>
      </div>
    </div>
  );
};

const SettingsPage = ({ userData, onLogout, navigate, isDarkMode, onToggleDarkMode }) => (
  <div className="max-w-4xl mx-auto py-4 sm:py-8 space-y-6">
    <section className="bg-white rounded-xl shadow-md border border-slate-200 p-5 sm:p-6">
      <h2 className="text-xl font-semibold text-slate-900">Settings</h2>
      <p className="text-sm text-slate-500 mt-1">Manage your account and quick actions.</p>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-slate-500">Name</p>
          <p className="font-medium text-slate-900 wrap-break-word">{userData?.firstName || ""} {userData?.lastName || ""}</p>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-slate-500">Role</p>
          <p className="font-medium text-slate-900 capitalize">{userData?.role || "N/A"}</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 p-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900">Dark Mode</p>
          <p className="text-xs text-slate-500">Switch between light and dark appearance.</p>
        </div>
        <button
          type="button"
          onClick={onToggleDarkMode}
          className={`min-w-24 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isDarkMode ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
        >
          {isDarkMode ? "On" : "Off"}
        </button>
      </div>

      <div className="mt-5 flex flex-col sm:flex-row gap-3">
        <button type="button" onClick={() => navigate(userData?.role === 'doctor' ? 'doctor-dashboard' : 'patient-dashboard')} className="w-full sm:w-auto rounded-xl px-4 py-2.5 bg-blue-600 text-white font-medium hover:bg-blue-700">
          Back to Dashboard
        </button>
        <button type="button" onClick={onLogout} className="w-full sm:w-auto rounded-xl px-4 py-2.5 bg-slate-900 text-white font-medium hover:bg-slate-800">
          Logout
        </button>
      </div>
    </section>
  </div>
);