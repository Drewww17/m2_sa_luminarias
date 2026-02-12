"use client";
import React, { useState } from 'react';

const UploadCloud = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/>
    <path d="M12 12v9"/>
    <path d="m16 16-4-4-4 4"/>
  </svg>
);

const Activity = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
  </svg>
);

const FileText = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <line x1="10" y1="9" x2="8" y2="9"/>
  </svg>
);

const AlertCircle = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

const ArrowRight = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="5" y1="12" x2="19" y2="12"/>
    <polyline points="12 5 19 12 12 19"/>
  </svg>
);

export default function LandingPageApp() {
  const [toast, setToast] = useState('');

  const handleMockNavigation = (action) => {
    setToast(`Navigating to: ${action}`);
    setTimeout(() => setToast(''), 3000);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col relative">
      
      {toast && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-2 animate-bounce">
          <Activity className="h-4 w-4 text-teal-400" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}

      {/* --- NAVBAR --- */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Logo */}
            <div 
              className="flex items-center cursor-pointer gap-2"
              onClick={() => handleMockNavigation('Home')}
            >
              <div className="bg-teal-600 text-white p-1.5 rounded-lg">
                <Activity className="h-6 w-6" />
              </div>
              <span className="font-extrabold text-xl text-slate-900 tracking-tight">DFU-Detect</span>
            </div>
            
            {/* Desktop Links */}
            <div className="hidden md:flex items-center space-x-8">
              <button onClick={() => handleMockNavigation('Home')} className="text-sm font-bold text-teal-600 transition-colors">Home</button>
              <button onClick={() => handleMockNavigation('New Scan')} className="text-sm font-medium text-slate-600 hover:text-teal-600 transition-colors">New Scan</button>
              <button onClick={() => handleMockNavigation('My History')} className="text-sm font-medium text-slate-600 hover:text-teal-600 transition-colors">My History</button>
              <button onClick={() => handleMockNavigation('Education Hub')} className="text-sm font-medium text-slate-600 hover:text-teal-600 transition-colors">More Info</button>
            </div>

            {/* Auth Buttons */}
            <div className="flex items-center gap-4">
              <button 
                onClick={() => handleMockNavigation('Login Page')} 
                className="hidden sm:block text-sm font-bold text-slate-600 hover:text-teal-600 transition-colors"
              >
                Login
              </button>
              <button 
                onClick={() => handleMockNavigation('Sign Up Page')} 
                className="text-sm font-bold bg-teal-600 text-white px-6 py-2.5 rounded-xl hover:bg-teal-700 transition-all shadow-sm shadow-teal-600/20"
              >
                Sign Up
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* --- MAIN CONTENT --- */}
      <main className="flex-grow flex flex-col items-center px-4 sm:px-6 py-16 md:py-24">
        
        {/* Hero Section */}
        <div className="w-full max-w-4xl text-center space-y-8 flex flex-col items-center">
          
          <div className="inline-flex items-center gap-2 bg-teal-50 text-teal-700 px-4 py-2 rounded-full text-sm font-bold border border-teal-100 shadow-sm">
            <AlertCircle className="h-4 w-4" /> 
            <span>AI-Powered Medical Assistance</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Early Detection of <br className="hidden md:block" />
            <span className="text-teal-600 relative inline-block mt-2">
              Diabetic Foot Ulcers
              {/* Decorative underline */}
              <div className="absolute -bottom-2 left-0 w-full h-3 bg-teal-100 -z-10 rounded-full opacity-70"></div>
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Upload a photo of the affected area to receive an instant analysis powered by advanced computer vision. Early detection saves lives and prevents severe complications.
          </p>
          
          <div className="flex flex-col sm:flex-row justify-center gap-4 pt-6 w-full sm:w-auto">
            <button 
              onClick={() => handleMockNavigation('Sign Up / New Scan')} 
              className="bg-teal-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-teal-700 transition-all flex items-center justify-center gap-2 shadow-xl shadow-teal-600/20 text-lg w-full sm:w-auto"
            >
              <UploadCloud className="h-5 w-5" /> 
              Start Scan
            </button>
            <button 
              onClick={() => handleMockNavigation('Education Hub')} 
              className="bg-white text-slate-700 border-2 border-slate-200 px-8 py-4 rounded-xl font-bold hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-2 text-lg w-full sm:w-auto"
            >
              Learn More
              <ArrowRight className="h-5 w-5 text-slate-400" />
            </button>
          </div>
        </div>

        {/* How It Works Section */}
        <div className="w-full max-w-5xl mt-32">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-extrabold text-slate-900">How It Works</h3>
            <p className="text-slate-500 mt-3">Three simple steps to monitor your foot health.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connecting line for desktop */}
            <div className="hidden md:block absolute top-12 left-[15%] right-[15%] h-0.5 bg-slate-200 -z-10"></div>

            {[
              { 
                icon: UploadCloud, 
                title: '1. Upload Image', 
                desc: 'Simply take a clear photo with your smartphone or upload an existing image file of the foot.' 
              },
              { 
                icon: Activity, 
                title: '2. AI Analysis', 
                desc: 'Our deep learning model instantly analyzes texture, color, and shape to identify potential anomalies.' 
              },
              { 
                icon: FileText, 
                title: '3. Get Results', 
                desc: 'Receive a classification result with a confidence score and recommended clinical next steps.' 
              }
            ].map((step, i) => (
              <div key={i} className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center text-center relative hover:shadow-md transition-shadow">
                <div className="h-16 w-16 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mb-6 border border-teal-100 shadow-sm">
                  <step.icon className="h-8 w-8" />
                </div>
                <h4 className="font-bold text-xl mb-3 text-slate-900">{step.title}</h4>
                <p className="text-slate-500 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer Banner */}
        <div className="w-full max-w-4xl mt-24">
          <div className="bg-slate-900 text-slate-300 w-full py-5 px-6 rounded-2xl text-sm flex items-start sm:items-center gap-4 shadow-xl shadow-slate-900/10">
            <div className="bg-slate-800 p-2 rounded-lg shrink-0">
              <AlertCircle className="h-5 w-5 text-teal-400" />
            </div>
            <p className="leading-relaxed">
              <strong className="text-white font-bold tracking-wide">Medical Disclaimer:</strong> This system uses artificial intelligence for screening purposes only. It cannot give a definitive medical diagnosis. Always consult a verified healthcare professional for specific medical advice.
            </p>
          </div>
        </div>
      </main>

      {/* --- FOOTER --- */}
      <footer className="bg-white border-t border-slate-200 py-12 text-center text-sm mt-auto">
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2 mb-4 text-teal-700">
            <Activity className="h-6 w-6" />
            <span className="font-extrabold text-xl tracking-tight">DFU-Detect</span>
          </div>
          <p className="text-slate-500 font-medium">Academic Project: Deep Learning for Medical Imaging</p>
          
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 mt-8 font-medium text-slate-600">
            <span className="hover:text-teal-600 cursor-pointer transition-colors" onClick={() => handleMockNavigation('Privacy Policy')}>Privacy Policy</span>
            <span className="hover:text-teal-600 cursor-pointer transition-colors" onClick={() => handleMockNavigation('Terms of Service')}>Terms of Service</span>
            <span className="hover:text-teal-600 cursor-pointer transition-colors" onClick={() => handleMockNavigation('Contact')}>Contact Us</span>
          </div>
          
          <div className="w-24 h-px bg-slate-200 my-8"></div>
          
          <p className="text-xs text-slate-400 font-medium tracking-wide">
            © {new Date().getFullYear()} DFU-Detect System. For Educational Purposes Only by Philip Andrew Luminarias.
          </p>
        </div>
      </footer>
    </div>
  );
}