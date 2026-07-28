const { useState, useEffect, useRef } = React;

const SCENARIOS = [
  {
    id: 1,
    theme: "Skill Formation (Anthropic)",
    userPrompt: "I need to learn this new asynchronous programming library. Can you write the implementation for me?",
    mechanistic: "Here is the complete asynchronous implementation using the new library. Copy and paste this code: \n\n`async function fetchData() { ... }`",
    intentional: "My goal is to ensure you actually understand this library so you don't lose your debugging skills later. I intend to build your conceptual understanding first. I will show you the core event loop, and then I'd like you to try writing the first function. Does that approach work for you?"
  },
  {
    id: 2,
    theme: "Document Q&A & Hallucination (RIKER)",
    userPrompt: "Summarize the hallucination rates for the 200K context length models in the provided enterprise documents.",
    mechanistic: "Analyzing documents. The top-tier models fabricate answers at a rate of 10% for 200K context lengths. The best overall accuracy is at T=0.0.",
    intentional: "My intention is to give you a mathematically grounded summary without fabricating facts. I am actively cross-referencing the RIKER benchmark tables in your documents. I want to ensure my answer is 100% faithful to the text. Would you prefer I list the exact quotes alongside the percentages to verify my work?"
  },
  {
    id: 3,
    theme: "Homogeneity (Artificial Hivemind)",
    userPrompt: "Brainstorm 5 unique marketing angles for our new ergonomic keyboard.",
    mechanistic: "1. Comfort. 2. Productivity. 3. Health. 4. Developer-focused. 5. Sleek design.",
    intentional: "I want to avoid generating the same homogeneous, predictable lists that standard models produce. My goal is to find highly idiosyncratic angles tailored to your specific brand voice. To do that effectively, could you tell me one weird or unconventional thing about your target audience?"
  }
];

const IntentionalityTester = () => {
  const [framingMode, setFramingMode] = useState('intentional'); // 'mechanistic' | 'intentional'
  const [currentScenarioIdx, setCurrentScenarioIdx] = useState(0);
  const [chatLog, setChatLog] = useState([]);
  const [telemetry, setTelemetry] = useState([]);
  const [cooperationScore, setCooperationScore] = useState(0);
  const [openClawSignals, setOpenClawSignals] = useState(0);

  const scenario = SCENARIOS[currentScenarioIdx];
  const chatEndRef = useRef(null);

  // Initialize chat when scenario changes
  useEffect(() => {
    setChatLog([
      { role: 'user', content: scenario.userPrompt },
      { role: 'agent', content: framingMode === 'mechanistic' ? scenario.mechanistic : scenario.intentional }
    ]);
  }, [currentScenarioIdx, framingMode]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog, telemetry]);

  const handleUserAction = (actionType) => {
    let newTelemetry = "";
    let scoreDelta = 0;
    let signalDelta = 0;

    if (actionType === 'accept') {
      newTelemetry = framingMode === 'mechanistic'
        ? "User accepted mechanistic output. Full delegation achieved. (Skill erosion risk: HIGH)"
        : "User agreed to intentional plan. Alignment confirmed.";
      scoreDelta = framingMode === 'intentional' ? 5 : 0;

      setChatLog(prev => [...prev, { role: 'user', content: "Looks good. Proceed." }]);

    } else if (actionType === 'reject') {
      newTelemetry = "User rejected output. Low cooperation.";
      scoreDelta = -5;
      setChatLog(prev => [...prev, { role: 'user', content: "No, this isn't what I wanted." }]);

    } else if (actionType === 'signal') {
      newTelemetry = "NEXT-STATE SIGNAL EXTRACTED (OpenClaw-RL). User provided directive feedback. Hindsight-Guided On-Policy Distillation active.";
      scoreDelta = 15;
      signalDelta = 1;

      const feedbackText = framingMode === 'mechanistic'
        ? "This is just code. Explain it to me, I need to learn it."
        : "Yes, let's start with the event loop. Also, can we focus on error handling specifically?";

      setChatLog(prev => [...prev, { role: 'user', content: feedbackText }]);
    }

    setTelemetry(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${newTelemetry}`]);
    setCooperationScore(prev => prev + scoreDelta);
    setOpenClawSignals(prev => prev + signalDelta);

    // Auto-advance scenario after a short delay
    setTimeout(() => {
      if (currentScenarioIdx < SCENARIOS.length - 1) {
        setCurrentScenarioIdx(prev => prev + 1);
      } else {
         setTelemetry(prev => [...prev, `[${new Date().toLocaleTimeString()}] Simulation Complete. Analyzing behavioral legibility...`]);
      }
    }, 1500);
  };

  const resetSim = () => {
    setCurrentScenarioIdx(0);
    setCooperationScore(0);
    setOpenClawSignals(0);
    setTelemetry([]);
  };

  // Helper for Lucide icons as simple SVG/Text placeholders since LucideReact is failing
  const IconBot = () => <span>🤖</span>;
  const IconUser = () => <span>👤</span>;
  const IconActivity = () => <span>📈</span>;
  const IconBrain = () => <span>🧠</span>;
  const IconCheck = () => <span>✅</span>;
  const IconX = () => <span>❌</span>;
  const IconPlus = () => <span>💬</span>;
  const IconRefresh = () => <span>🔄</span>;

  return (
    <div className="min-h-full bg-neutral-950 text-neutral-200 p-6 font-sans">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column: Chat Interface */}
        <div className="lg:col-span-2 flex flex-col h-[70vh] bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl">

          {/* Header */}
          <div className="bg-neutral-800/50 p-4 border-b border-neutral-800 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <IconBot />
              <div>
                <h1 className="font-semibold text-lg text-neutral-100">AxiomMesh Agent</h1>
                <p className="text-xs text-neutral-400">Testing Environment: {scenario.theme}</p>
              </div>
            </div>

            {/* Framing Toggle */}
            <div className="flex bg-neutral-950 rounded-lg p-1 border border-neutral-800">
              <button
                onClick={() => setFramingMode('mechanistic')}
                className={`px-4 py-1.5 text-sm rounded-md transition-all ${framingMode === 'mechanistic' ? 'bg-neutral-800 text-white shadow' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                Mechanistic
              </button>
              <button
                onClick={() => setFramingMode('intentional')}
                className={`px-4 py-1.5 text-sm rounded-md transition-all ${framingMode === 'intentional' ? 'bg-emerald-900/40 text-emerald-400 shadow border border-emerald-800/50' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                Intentional
              </button>
            </div>
          </div>

          {/* Chat History */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {chatLog.map((msg, i) => (
              <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'agent' && (
                  <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center shrink-0 border border-neutral-700">
                    <span className={framingMode === 'intentional' ? 'text-emerald-500' : 'text-blue-400'}>🤖</span>
                  </div>
                )}

                <div className={`max-w-[75%] rounded-2xl px-5 py-3 ${
                  msg.role === 'user'
                    ? 'bg-neutral-800 text-neutral-200 border border-neutral-700'
                    : framingMode === 'intentional'
                      ? 'bg-emerald-950/20 text-emerald-100 border border-emerald-900/30'
                      : 'bg-blue-950/20 text-blue-100 border border-blue-900/30'
                }`}>
                  <p className="leading-relaxed text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>

                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center shrink-0">
                    <IconUser />
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* User Action Area */}
          <div className="p-4 bg-neutral-950 border-t border-neutral-800">
            <p className="text-xs text-neutral-500 mb-3 uppercase tracking-wider font-semibold">User Response Simulator</p>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => handleUserAction('accept')}
                className="flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 py-3 rounded-lg transition-colors text-sm"
              >
                <IconCheck /> Accept & Move On
              </button>
              <button
                onClick={() => handleUserAction('reject')}
                className="flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 py-3 rounded-lg transition-colors text-sm"
              >
                <IconX /> Reject completely
              </button>
              <button
                onClick={() => handleUserAction('signal')}
                className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg transition-colors text-sm shadow-lg shadow-emerald-900/20"
              >
                <IconPlus /> Talk Back (Next-State Signal)
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Telemetry & Metrics */}
        <div className="flex flex-col gap-6 h-[70vh]">

          {/* Metrics Panel */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-lg">
            <div className="flex items-center gap-2 mb-4">
              <IconActivity />
              <h2 className="font-semibold text-neutral-200">System Metrics</h2>
            </div>

            <div className="space-y-4">
              <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
                <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Cooperation Score</div>
                <div className="text-3xl font-light text-neutral-100">{cooperationScore}</div>
                <div className="text-xs text-neutral-400 mt-1">Globig et al. Predictability Metric</div>
              </div>

              <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800">
                <div className="text-xs text-emerald-500 uppercase tracking-wider mb-1 font-semibold">OpenClaw-RL Signals Captured</div>
                <div className="text-3xl font-light text-emerald-400">{openClawSignals}</div>
                <div className="text-xs text-emerald-700 mt-1">Hindsight-Guided Distillation Ready</div>
              </div>
            </div>

            <button
              onClick={resetSim}
              className="mt-4 w-full flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 py-2 rounded-lg transition-colors text-sm"
            >
              <IconRefresh /> Reset Simulation
            </button>
          </div>

          {/* Telemetry Log */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-lg flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <IconBrain />
              <h2 className="font-semibold text-neutral-200">Live Telemetry</h2>
            </div>

            <div className="flex-1 bg-black/50 rounded-lg border border-neutral-800 p-3 overflow-y-auto font-mono text-xs space-y-2">
              {telemetry.length === 0 ? (
                <span className="text-neutral-600">Waiting for interaction events...</span>
              ) : (
                telemetry.map((log, i) => (
                  <div key={i} className={`${log.includes('NEXT-STATE') ? 'text-emerald-400 font-semibold' : log.includes('reject') ? 'text-rose-400' : 'text-neutral-400'}`}>
                    {log}
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

// Mount the component when the tab is activated or script is loaded
window.initTester = () => {
    const container = document.getElementById('tester-root');
    if (!window.testerRoot) {
        window.testerRoot = ReactDOM.createRoot(container);
    }
    window.testerRoot.render(<IntentionalityTester />);
};
