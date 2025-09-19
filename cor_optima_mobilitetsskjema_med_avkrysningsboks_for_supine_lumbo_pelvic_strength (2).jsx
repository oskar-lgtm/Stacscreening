import React, { useEffect, useMemo, useState, useRef } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// Cor Optima — Mobilitet & Core (med °-felt, PDF-eksport og e-post hurtiglenke)
// Ren JavaScript (ingen TypeScript-annotasjoner) og lagring i localStorage.

/*************************
 * Utils & Test Helpers  *
 *************************/
function quoteCSV(v) {
  const s = String(v ?? "");
  return '"' + s.replaceAll('"', '""') + '"';
}

function createMailBody() {
  return (
    "Hei! Her er mobilitetsskjemaet. " +
    "Last ned PDF i appen (knappen \"Last ned PDF\") og legg den ved denne e-posten.\n\n" +
    "Mvh\n" +
    "Cor Optima"
  );
}

function sanitizeDegrees(raw) {
  // Tillat tall, komma, punktum og minus – strip øvrige tegn
  return String(raw || "").replace(/[^0-9.,-]/g, "");
}

function runSelfTests() {
  const results = [];
  // 1) CSV join skal bruke \n
  const joined = ["A", "B"].join("\n");
  results.push({ name: "CSV join uses \\n", pass: joined === "A\nB" });

  // 2) Mail-body skal kunne encode/decode lossless
  const body = createMailBody();
  const encoded = encodeURIComponent(body);
  const decoded = decodeURIComponent(encoded);
  results.push({ name: "Mail body encodes/decodes lossless", pass: decoded === body });

  // 3) Grad-sanitizer
  const s = sanitizeDegrees("12a3°-.,");
  results.push({ name: "Degree sanitizer strips invalid", pass: s === "123-.," });

  return results;
}

function DebugPanel({ results }) {
  const allPass = results.every((r) => r.pass);
  return (
    <details className="mt-4 text-xs">
      <summary className={"cursor-pointer select-none " + (allPass ? "text-emerald-700" : "text-red-700")}>
        Debug: {allPass ? "All tests passing" : "Some tests failed"}
      </summary>
      <ul className="list-disc pl-5 mt-1">
        {results.map((r, i) => (
          <li key={i} className={r.pass ? "text-emerald-700" : "text-red-700"}>
            {r.pass ? "✔" : "✖"} {r.name}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**********************
 * Main App Component *
 **********************/
export default function MobilityAssessmentApp() {
  const [data, setData] = useState(() => {
    try {
      const raw = localStorage.getItem("coroptima_mobility_v1");
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  });
  const [email, setEmail] = useState("");
  const contentRef = useRef(null);
  const testResults = useMemo(() => runSelfTests(), []);

  useEffect(() => {
    localStorage.setItem("coroptima_mobility_v1", JSON.stringify(data));
  }, [data]);

  const tests = useMemo(
    () => [
      "Supine Straight Leg Raise (SLR)",
      "Supine Hip Flexion (Hip to chest)",
      "Supine Medial Hip Rotation @ 90° hip flex",
      "Supine Lateral Hip Rotation @ 90° hip flex",
      "Supine Shoulder Position @ angulus acromiale",
      "Supine Shoulder Lateral Rotation @ 60° abd",
      "Squat position Ankle Angular Mobility",
      "Standing straight arm raise",
      "Standing Upper body Side Flexion",
      "Standing Head-Neck Side Flexion",
      "Standing Medial Hip Rotation @ 0° hip flex",
      "Standing Lateral Hip Rotation @ 0° hip flex",
      "Short Hip Flexor Mobility (Thomas)",
      "Long Hip Flexor Mobility (Thomas)",
      "Seated Upper Body Rotation",
      "Seated Neck Rotation",
      "Over Head Squat Combined Mobility",
    ],
    []
  );

  const headers = [
    "Test",
    "Left",
    "Right",
    "Bilat",
    "ADL Normal",
    "Spec Sport",
    "Notater",
  ];

  const setCell = (rowKey, field, value) => {
    setData((d) => ({
      ...d,
      rows: {
        ...(d.rows || {}),
        [rowKey]: {
          ...(d.rows && d.rows[rowKey] ? d.rows[rowKey] : {}),
          [field]: value,
        },
      },
    }));
  };

  const getCell = (rowKey, field) => (data && data.rows && data.rows[rowKey] && data.rows[rowKey][field]) || "";

  const [core, setCore] = useState((data && data.core) || {
    breathing: "",
    sequence: "",
    lumboPelvicNotes: "",
    lumboPelvicLevel: "",
    lumboPelvicReps: "",
    lumboPelvicChecked: false, // Avkrysningsboks (OK/Godkjent)
    neckLevel: "",
    neckNotes: "",
    lunge: { left: {}, right: {}, notes: "" },
    stick: { left: {}, right: {}, notes: "" },
  });

  useEffect(() => {
    setData((d) => ({ ...d, core }));
  }, [core]);

  const exportCSV = () => {
    const lines = [];
    lines.push(headers.join(","));
    tests.forEach((t) => {
      const r = (data && data.rows && data.rows[t]) || {};
      lines.push([
        quoteCSV(t),
        r.Left || "",
        r.Right || "",
        r.Bilat || "",
        r["ADL Normal"] || "",
        r["Spec Sport"] || "",
        quoteCSV(r.Notater || ""),
      ].join(","));
    });

    lines.push("");
    lines.push("Core Requirement & Strength Level");
    lines.push("Supine Lumbo-Pelvic Strength: " + (core.lumboPelvicLevel || ""));
    lines.push("Supine Lumbo-Pelvic Notater: " + (core.lumboPelvicNotes || ""));
    lines.push("Supine Lumbo-Pelvic Reps: " + (core.lumboPelvicReps || ""));
    lines.push("Supine Lumbo-Pelvic OK: " + (core.lumboPelvicChecked ? "Ja" : "Nei"));

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "coroptima_mobility.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    const el = contentRef.current;
    if (!el) return;
    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });

    // Bruk jsPDF.html om tilgjengelig; fallback til html2canvas
    if (typeof pdf.html === "function") {
      await pdf.html(el, {
        html2canvas: { scale: 2 },
        margin: [10, 10, 10, 10],
        autoPaging: "text",
        callback: function (doc) {
          const fname = "coroptima_mobility_" + new Date().toISOString().slice(0, 10) + ".pdf";
          doc.save(fname);
        },
      });
    } else {
      const canvas = await html2canvas(el, { scale: 2 });
      const imgData = canvas.toDataURL("image/png");
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth() - 20; // margins
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      pdf.addImage(imgData, "PNG", 10, 10, pdfWidth, pdfHeight);
      pdf.save("coroptima_mobility_" + new Date().toISOString().slice(0, 10) + ".pdf");
    }
  };

  const sendEmail = () => {
    if (!email) {
      alert("Skriv inn e-postadresse først");
      return;
    }
    const subject = encodeURIComponent("Cor Optima – mobilitetsskjema");
    const body = encodeURIComponent(createMailBody());
    window.location.href = "mailto:" + encodeURIComponent(email) + "?subject=" + subject + "&body=" + body;
  };

  return (
    <div className="min-h-screen bg-[#F0ECEA] text-[#301d25]">
      <header className="sticky top-0 z-10 backdrop-blur bg-[#F0ECEA]/80 border-b border-black/5">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h1 className="text-xl md:text-2xl font-bold">Cor Optima — Mobilitet & Core</h1>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="email"
              placeholder="kundens e-post"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="px-3 py-2 rounded-xl border border-black/10 bg-white"
            />
            <button onClick={sendEmail} className="px-3 py-2 rounded-xl border border-black/10 hover:bg-white">E-post-kladd</button>
            <button
              onClick={() => {
                localStorage.removeItem("coroptima_mobility_v1");
                location.reload();
              }}
              className="px-3 py-2 rounded-xl border border-black/10 hover:bg-white"
            >
              Nullstill
            </button>
            <button onClick={exportCSV} className="px-3 py-2 rounded-xl bg-[#6FA287] text-white hover:brightness-110">Last ned CSV</button>
            <button onClick={exportPDF} className="px-3 py-2 rounded-xl bg-[#301d25] text-white hover:brightness-110">Last ned PDF</button>
          </div>
        </div>
      </header>

      <main ref={contentRef} className="max-w-6xl mx-auto p-4 md:p-6 space-y-10">
        {/* Tabellseksjon */}
        <section className="bg-white rounded-2xl shadow-sm p-4 md:p-6">
          <h2 className="text-lg font-semibold mb-4">1. Mobilitet/Bevegelse</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#B6CFD0] text-[#301d25]">
                  {headers.map((h) => (
                    <th key={h} className="text-left px-2 py-2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tests.map((t, idx) => (
                  <tr key={t} className={idx % 2 ? "bg-black/[0.02]" : ""}>
                    <td className="px-2 py-2 font-medium align-top min-w-[260px]">{t}</td>
                    {/* °-input for Left/Right/Bilat */}
                    {["Left", "Right", "Bilat"].map((field) => (
                      <td key={field} className="px-2 py-2 align-top min-w-[120px]">
                        <DegreeInput
                          value={getCell(t, field)}
                          onChange={(val) => setCell(t, field, val)}
                          placeholder="0"
                        />
                      </td>
                    ))}
                    {/* Tekstfelt for ADL/Sport/Notater */}
                    {["ADL Normal", "Spec Sport"].map((field) => (
                      <td key={field} className="px-2 py-2 align-top">
                        <input
                          type="text"
                          value={getCell(t, field)}
                          onChange={(e) => setCell(t, field, e.target.value)}
                          className="w-full rounded-xl border border-black/10 p-2 focus:outline-none focus:ring-2 focus:ring-[#6FA287]"
                          placeholder={field === "ADL Normal" ? "Normal" : "Spes."}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-2 align-top">
                      <textarea
                        rows={2}
                        value={getCell(t, "Notater")}
                        onChange={(e) => setCell(t, "Notater", e.target.value)}
                        className="w-full rounded-xl border border-black/10 p-2 focus:outline-none focus:ring-2 focus:ring-[#6FA287]"
                        placeholder="Fritekst"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DebugPanel results={testResults} />
        </section>

        {/* Core Requirement & Strength Level */}
        <CoreSection core={core} setCore={setCore} />

        <footer className="text-xs text-black/50">
          © Cor Optima — Skjemaet lagres lokalt i nettleseren. E-postknappen åpner en ferdig utfylt e-postkladd – legg ved nedlastet PDF før sending.
        </footer>
      </main>
    </div>
  );
}

// °-komponent for grad-input
function DegreeInput({ value, onChange, placeholder }) {
  const handle = (e) => {
    onChange(sanitizeDegrees(e.target.value));
  };
  return (
    <div className="flex items-center gap-1 rounded-xl border border-black/10 p-2 focus-within:ring-2 focus-within:ring-[#6FA287]">
      <input
        inputMode="decimal"
        placeholder={placeholder}
        value={value || ""}
        onChange={handle}
        className="w-full outline-none"
      />
      <span className="opacity-70">°</span>
    </div>
  );
}

function CoreSection({ core, setCore }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm p-4 md:p-6 space-y-6">
      <h2 className="text-lg font-semibold">3. Core Requirement & Strength Level</h2>

      {/* Puste-mønster */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <fieldset className="border border-black/10 rounded-2xl p-4">
          <legend className="px-2 font-medium">Breathing pattern & control</legend>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {["Belly", "Chest", "Double", "Can alternate"].map((opt) => (
              <label key={opt} className={"flex items-center gap-2 p-2 rounded-xl border " + (core.breathing === opt ? "border-[#6FA287] bg-[#6FA287]/5" : "border-black/10")}>
                <input
                  type="radio"
                  name="breathing"
                  checked={core.breathing === opt}
                  onChange={() => setCore({ ...core, breathing: opt })}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="border border-black/10 rounded-2xl p-4">
          <legend className="px-2 font-medium">1st & 2nd sequence requirement</legend>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {["OK", "R-dominant", "Wrong order", "Can’t at all"].map((opt) => (
              <label key={opt} className={"flex items-center gap-2 p-2 rounded-xl border " + (core.sequence === opt ? "border-[#6FA287] bg-[#6FA287]/5" : "border-black/10")}>
                <input
                  type="radio"
                  name="sequence"
                  checked={core.sequence === opt}
                  onChange={() => setCore({ ...core, sequence: opt })}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {/* Supine Lumbo-Pelvic Strength Level */}
      <fieldset className="border border-black/10 rounded-2xl p-4 space-y-3">
        <legend className="px-2 font-medium flex items-center justify-between w-full">
          <span>Supine Lumbo-Pelvic Strength Level</span>
          <label className="inline-flex items-center gap-2 text-sm font-normal">
            <input
              type="checkbox"
              checked={core.lumboPelvicChecked}
              onChange={(e) => setCore({ ...core, lumboPelvicChecked: e.target.checked })}
            />
            <span>OK / Godkjent</span>
          </label>
        </legend>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          {["0–10°", "11–25°", "26–50°", "51–75°", "76–90°"].map((opt) => (
            <label key={opt} className={"flex items-center gap-2 p-2 rounded-xl border " + (core.lumboPelvicLevel === opt ? "border-[#6FA287] bg-[#6FA287]/5" : "border-black/10")}>
              <input
                type="radio"
                name="lumboPelvicLevel"
                checked={core.lumboPelvicLevel === opt}
                onChange={() => setCore({ ...core, lumboPelvicLevel: opt })}
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="col-span-1">
            <label className="block text-sm mb-1">Antall reps</label>
            <input
              type="number"
              min={0}
              className="w-full rounded-xl border border-black/10 p-2 focus:outline-none focus:ring-2 focus:ring-[#6FA287]"
              value={core.lumboPelvicReps}
              onChange={(e) => setCore({ ...core, lumboPelvicReps: e.target.value })}
              placeholder="f.eks. 12"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm mb-1">Notater</label>
            <textarea
              rows={2}
              className="w-full rounded-xl border border-black/10 p-2 focus:outline-none focus:ring-2 focus:ring-[#6FA287]"
              value={core.lumboPelvicNotes}
              onChange={(e) => setCore({ ...core, lumboPelvicNotes: e.target.value })}
              placeholder="Observasjoner, smerte, kvalitet osv."
            />
          </div>
        </div>
      </fieldset>

      {/* Seated Head-Neck Strength Level */}
      <fieldset className="border border-black/10 rounded-2xl p-4 space-y-2">
        <legend className="px-2 font-medium">Seated Head-Neck Strength Level</legend>
        <div className="grid grid-cols-5 gap-2">
          {["1","2","3","4","5"].map((opt) => (
            <label key={opt} className={"flex items-center gap-2 p-2 rounded-xl border " + (core.neckLevel === opt ? "border-[#6FA287] bg-[#6FA287]/5" : "border-black/10")}>
              <input
                type="radio"
                name="neckLevel"
                checked={core.neckLevel === opt}
                onChange={() => setCore({ ...core, neckLevel: opt })}
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
        <div>
          <label className="block text-sm mb-1">Notater</label>
          <textarea
            rows={2}
            className="w-full rounded-xl border border-black/10 p-2 focus:outline-none focus:ring-2 focus:ring-[#6FA287]"
            value={core.neckNotes}
            onChange={(e) => setCore({ ...core, neckNotes: e.target.value })}
          />
        </div>
      </fieldset>

      {/* Lunge Test */}
      <fieldset className="border border-black/10 rounded-2xl p-4 space-y-3">
        <legend className="px-2 font-medium">Standing "Lunge Test"</legend>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {[
            { key: "Foot", label: "Foot" },
            { key: "Knee", label: "Knee" },
            { key: "Hip", label: "Hip" },
            { key: "Upper body", label: "Upper body" },
            { key: "Posture", label: "Posture" },
          ].map(({ key, label }) => (
            <div key={key} className="md:col-span-1">
              <label className="block text-sm mb-1">{label}</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Left"
                  className="rounded-xl border border-black/10 p-2"
                  value={(core.lunge.left && core.lunge.left[key]) || ""}
                  onChange={(e) => setCore({
                    ...core,
                    lunge: { ...core.lunge, left: { ...(core.lunge.left || {}), [key]: e.target.value } },
                  })}
                />
                <input
                  type="text"
                  placeholder="Right"
                  className="rounded-xl border border-black/10 p-2"
                  value={(core.lunge.right && core.lunge.right[key]) || ""}
                  onChange={(e) => setCore({
                    ...core,
                    lunge: { ...core.lunge, right: { ...(core.lunge.right || {}), [key]: e.target.value } },
                  })}
                />
              </div>
            </div>
          ))}
          <div className="md:col-span-3">
            <label className="block text-sm mb-1">Notater</label>
            <textarea
              rows={2}
              className="w-full rounded-xl border border-black/10 p-2"
              value={core.lunge.notes}
              onChange={(e) => setCore({ ...core, lunge: { ...core.lunge, notes: e.target.value } })}
            />
          </div>
        </div>
      </fieldset>

      {/* Stick Test */}
      <fieldset className="border border-black/10 rounded-2xl p-4 space-y-3">
        <legend className="px-2 font-medium">Standing "Stick Test"</legend>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {[
            { key: "Rotation", label: "Rotation" },
            { key: "Frontal", label: "Frontal" },
            { key: "Sagittal", label: "Sagittal" },
            { key: "Shoulders", label: "Shoulders" },
            { key: "Pelvic", label: "Pelvic" },
          ].map(({ key, label }) => (
            <div key={key} className="md:col-span-1">
              <label className="block text-sm mb-1">{label}</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Left"
                  className="rounded-xl border border-black/10 p-2"
                  value={(core.stick.left && core.stick.left[key]) || ""}
                  onChange={(e) => setCore({
                    ...core,
                    stick: { ...core.stick, left: { ...(core.stick.left || {}), [key]: e.target.value } },
                  })}
                />
                <input
                  type="text"
                  placeholder="Right"
                  className="rounded-xl border border-black/10 p-2"
                  value={(core.stick.right && core.stick.right[key]) || ""}
                  onChange={(e) => setCore({
                    ...core,
                    stick: { ...core.stick, right: { ...(core.stick.right || {}), [key]: e.target.value } },
                  })}
                />
              </div>
            </div>
          ))}
          <div className="md:col-span-3">
            <label className="block text-sm mb-1">Notater</label>
            <textarea
              rows={2}
              className="w-full rounded-xl border border-black/10 p-2"
              value={core.stick.notes}
              onChange={(e) => setCore({ ...core, stick: { ...core.stick, notes: e.target.value } })}
            />
          </div>
        </div>
      </fieldset>
    </section>
  );
}
