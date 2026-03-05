export default function EducationPage() {
  const sections = [
    {
      title: "What is a Diabetic Foot Ulcer",
      description:
        "A diabetic foot ulcer is an open wound or sore caused by pressure, poor circulation, and nerve damage associated with diabetes.",
    },
    {
      title: "Early Warning Signs",
      description:
        "Watch for redness, swelling, skin breakdown, drainage, warmth, foul odor, or delayed wound healing.",
    },
    {
      title: "Risk Factors",
      description:
        "Neuropathy, poor blood sugar control, smoking, reduced blood flow, and previous ulcer history increase risk.",
    },
    {
      title: "Prevention Tips",
      description:
        "Inspect feet daily, wear protective footwear, keep skin clean and dry, and schedule routine diabetic foot checks.",
    },
    {
      title: "When to See a Doctor",
      description:
        "Seek urgent care for worsening wounds, signs of infection, severe pain, fever, or tissue discoloration.",
    },
  ];

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <section className="max-w-6xl mx-auto space-y-6">
        <header className="bg-linear-to-r from-blue-600 to-blue-500 rounded-xl p-6 text-white shadow-md">
          <h1 className="text-2xl font-semibold">Education Hub</h1>
          <p className="text-blue-100 mt-1">Patient guidance for early recognition and prevention of diabetic foot ulcers.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sections.map((section) => (
            <article key={section.title} className="bg-white rounded-xl shadow-md p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-2">{section.title}</h2>
              <p className="text-sm text-slate-600">{section.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
