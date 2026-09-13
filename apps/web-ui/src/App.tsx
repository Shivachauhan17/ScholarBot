import React, { useState, useEffect, useRef } from 'react';

// --- Types ---
interface Message {
  role: 'user' | 'agent';
  text: string;
  context?: string;
}

interface DocumentInfo {
  id: string;
  filename: string;
  status: string;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [persona, setPersona] = useState('academic');
  const [isTyping, setIsTyping] = useState(false);

  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Fetch uploaded documents and poll for status updates ---
  useEffect(() => {
    fetchDocuments();
    const interval = setInterval(fetchDocuments, 5000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/documents`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data);
      }
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    }
  };

  // --- Handle PDF Upload ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64String = (event.target?.result as string).split(',')[1];

      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            fileBase64: base64String
          })
        });

        if (response.ok) {
          fetchDocuments();
        } else {
          alert('Failed to upload document.');
        }
      } catch (error) {
        console.error('Upload error:', error);
        alert('An error occurred during upload.');
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const userText = inputText.trim();
    setInputText('');

    const historyToSend = messages.slice(-4).map(msg => ({
      role: msg.role,
      content: msg.text
    }));

    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setIsTyping(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userText,
          persona: persona,
          history: historyToSend
        })
      });

      if (!response.ok) throw new Error('Agent Timeout or Server Error');

      const data = await response.json();

      setMessages(prev => [
        ...prev,
        {
          role: 'agent',
          text: data.answer || data.error,
          context: data.context
        }
      ]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [
        ...prev,
        { role: 'agent', text: "The agent timed out or the server could not be reached." }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="sb-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&family=Inter:wght@400;500;600&display=swap');

        .sb-root {
          --ink: #212a37;
          --ink-soft: #3c4759;
          --indigo: #33507a;
          --indigo-dark: #253c5e;
          --brass: #a3813f;
          --moss: #5b6e4d;
          --paper: #eae5d9;
          --paper-deep: #dfd9c7;
          --card: #fbfaf5;
          --line: #d6cfba;
          --muted: #766f5c;
          --text: #24211a;

          --font-serif: 'Source Serif 4', Georgia, 'Iowan Old Style', serif;
          --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

          height: 100vh;
          width: 100%;
          background: var(--paper);
          color: var(--text);
          font-family: var(--font-sans);
          box-sizing: border-box;
        }
        .sb-root *, .sb-root *::before, .sb-root *::after {
          box-sizing: border-box;
        }
        .sb-root ::selection {
          background: var(--brass);
          color: #fff;
        }
        .sb-app {
          display: flex;
          height: 100%;
          width: 100%;
        }

        /* ---------- Sidebar ---------- */
        .sb-sidebar {
          width: 300px;
          flex-shrink: 0;
          background: linear-gradient(180deg, var(--paper) 0%, var(--paper-deep) 100%);
          border-right: 1px solid var(--line);
          display: flex;
          flex-direction: column;
        }
        .sb-masthead {
          padding: 26px 24px 20px;
          border-bottom: 1px solid var(--line);
        }
        .sb-wordmark {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 0 0 18px 0;
        }
        .sb-wordmark svg { flex-shrink: 0; }
        .sb-wordmark span {
          font-family: var(--font-serif);
          font-size: 1.35rem;
          font-weight: 600;
          letter-spacing: 0.01em;
          color: var(--ink);
        }
        .sb-upload-input { display: none; }
        .sb-upload-label {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 11px 14px;
          background: var(--indigo);
          color: #f4f1e6;
          border-radius: 3px;
          cursor: pointer;
          font-size: 0.92rem;
          font-weight: 500;
          letter-spacing: 0.01em;
          border: 1px solid var(--indigo-dark);
          transition: background-color 0.15s ease, transform 0.1s ease;
        }
        .sb-upload-label:hover { background: var(--indigo-dark); }
        .sb-upload-label:active { transform: translateY(1px); }
        .sb-upload-label:focus-within {
          outline: 2px solid var(--brass);
          outline-offset: 2px;
        }

        .sb-library {
          flex: 1;
          overflow-y: auto;
          padding: 20px 20px 24px;
        }
        .sb-library-heading {
          font-family: var(--font-serif);
          font-size: 0.95rem;
          font-weight: 500;
          color: var(--ink-soft);
          margin: 0 0 14px 2px;
        }
        .sb-empty-library {
          font-size: 0.88rem;
          color: var(--muted);
          font-style: italic;
          margin: 0;
          padding: 2px;
        }
        .sb-doc-card {
          position: relative;
          padding: 12px 14px 12px 16px;
          background: var(--card);
          border: 1px solid var(--line);
          border-left: 3px solid var(--muted);
          border-radius: 2px;
          margin-bottom: 10px;
          transition: border-left-color 0.2s ease;
        }
        .sb-doc-card.is-ready { border-left-color: var(--moss); }
        .sb-doc-card.is-processing { border-left-color: var(--brass); }
        .sb-doc-name {
          font-size: 0.88rem;
          font-weight: 500;
          color: var(--text);
          word-break: break-word;
          margin-bottom: 5px;
          line-height: 1.35;
        }
        .sb-doc-status {
          font-size: 0.78rem;
          color: var(--muted);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .sb-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--muted);
          flex-shrink: 0;
        }
        .is-ready .sb-dot { background: var(--moss); }
        .is-processing .sb-dot { background: var(--brass); }

        /* custom scrollbars */
        .sb-library::-webkit-scrollbar,
        .sb-chat-scroll::-webkit-scrollbar { width: 8px; }
        .sb-library::-webkit-scrollbar-thumb,
        .sb-chat-scroll::-webkit-scrollbar-thumb {
          background: var(--line);
          border-radius: 4px;
        }
        .sb-library::-webkit-scrollbar-track,
        .sb-chat-scroll::-webkit-scrollbar-track { background: transparent; }

        /* ---------- Main / reading room ---------- */
        .sb-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: var(--card);
          min-width: 0;
        }
        .sb-chat-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 40px 8%;
        }
        .sb-empty-state {
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          color: var(--muted);
          gap: 14px;
        }
        .sb-empty-state h2 {
          font-family: var(--font-serif);
          font-weight: 500;
          font-size: 1.5rem;
          color: var(--ink-soft);
          margin: 0;
          max-width: 22ch;
        }
        .sb-empty-state p {
          margin: 0;
          font-size: 0.92rem;
          max-width: 34ch;
        }

        .sb-msg-row {
          display: flex;
          margin-bottom: 22px;
        }
        .sb-msg-row.from-user { justify-content: flex-end; }
        .sb-msg-row.from-agent { justify-content: flex-start; }

        .sb-bubble {
          max-width: 68%;
          padding: 14px 17px;
          font-size: 0.97rem;
          line-height: 1.55;
          white-space: pre-wrap;
        }
        .from-user .sb-bubble {
          background: var(--indigo);
          color: #f5f2e6;
          border-radius: 10px 10px 2px 10px;
        }
        .from-agent .sb-bubble {
          background: var(--paper);
          color: var(--text);
          border: 1px solid var(--line);
          border-radius: 10px 10px 10px 2px;
        }

        .sb-sources {
          margin-top: 13px;
          padding-top: 11px;
          border-top: 1px solid var(--line);
        }
        .sb-sources summary {
          cursor: pointer;
          font-family: var(--font-serif);
          font-size: 0.86rem;
          font-weight: 500;
          color: var(--indigo);
          list-style: none;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .sb-sources summary::-webkit-details-marker { display: none; }
        .sb-sources summary::before {
          content: '';
          width: 0;
          height: 0;
          border-top: 4px solid transparent;
          border-bottom: 4px solid transparent;
          border-left: 5px solid var(--indigo);
          transition: transform 0.15s ease;
        }
        .sb-sources[open] summary::before { transform: rotate(90deg); }
        .sb-sources-body {
          margin-top: 9px;
          font-size: 0.84rem;
          color: var(--ink-soft);
          white-space: pre-wrap;
          max-height: 220px;
          overflow-y: auto;
          font-family: var(--font-serif);
          line-height: 1.5;
        }

        .sb-typing .sb-bubble {
          background: var(--paper);
          border: 1px solid var(--line);
          color: var(--muted);
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .sb-typing-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--muted);
          animation: sb-bounce 1.1s infinite ease-in-out;
        }
        .sb-typing-dot:nth-child(2) { animation-delay: 0.15s; }
        .sb-typing-dot:nth-child(3) { animation-delay: 0.3s; }
        @keyframes sb-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30% { transform: translateY(-3px); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .sb-typing-dot { animation: none; }
        }

        /* ---------- Input bar ---------- */
        .sb-input-bar {
          padding: 18px 8%;
          border-top: 1px solid var(--line);
          background: var(--paper);
        }
        .sb-input-form {
          display: flex;
          gap: 10px;
          max-width: 900px;
          margin: 0 auto;
        }
        .sb-input {
          flex: 1;
          padding: 13px 16px;
          border-radius: 4px;
          border: 1px solid var(--line);
          background: var(--card);
          font-size: 0.96rem;
          font-family: var(--font-sans);
          color: var(--text);
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .sb-input:focus {
          border-color: var(--indigo);
          box-shadow: 0 0 0 3px rgba(51, 80, 122, 0.15);
        }
        .sb-input::placeholder { color: var(--muted); }
        .sb-input:disabled { opacity: 0.6; }

        .sb-persona {
          flex-shrink: 0;
          padding: 13px 34px 13px 16px;
          border-radius: 4px;
          border: 1px solid var(--line);
          background-color: var(--card);
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2376705C' stroke-width='1.4' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 14px center;
          appearance: none;
          -webkit-appearance: none;
          font-size: 0.9rem;
          font-family: var(--font-sans);
          color: var(--text);
          cursor: pointer;
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .sb-persona:hover:not(:disabled) { border-color: var(--indigo); }
        .sb-persona:focus-visible {
          border-color: var(--indigo);
          box-shadow: 0 0 0 3px rgba(51, 80, 122, 0.15);
        }
        .sb-persona:disabled { opacity: 0.6; cursor: not-allowed; }

        @media (max-width: 620px) {
          .sb-input-form { flex-wrap: wrap; }
          .sb-persona { flex: 1 1 100%; order: -1; }
        }

        .sb-send-btn {
          padding: 0 26px;
          background: var(--indigo);
          color: #f4f1e6;
          border: 1px solid var(--indigo-dark);
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.95rem;
          font-weight: 500;
          font-family: var(--font-sans);
          transition: background-color 0.15s ease, transform 0.1s ease;
        }
        .sb-send-btn:hover:not(:disabled) { background: var(--indigo-dark); }
        .sb-send-btn:active:not(:disabled) { transform: translateY(1px); }
        .sb-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .sb-send-btn:focus-visible,
        .sb-input:focus-visible {
          outline: 2px solid var(--brass);
          outline-offset: 2px;
        }

        /* ---------- Responsive ---------- */
        @media (max-width: 760px) {
          .sb-app { flex-direction: column; }
          .sb-sidebar {
            width: 100%;
            max-height: 38vh;
            border-right: none;
            border-bottom: 1px solid var(--line);
          }
          .sb-chat-scroll { padding: 28px 5%; }
          .sb-input-bar { padding: 14px 5%; }
          .sb-bubble { max-width: 84%; }
        }
      `}</style>

      <div className="sb-app">
        {/* Sidebar - Document Management */}
        <div className="sb-sidebar">
          <div className="sb-masthead">
            <div className="sb-wordmark">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M3 5.5C3 4.67 3.67 4 4.5 4H10.5C11.6 4 12.5 4.9 12.5 6V19.5C12.5 18.67 11.83 18 11 18H3V5.5Z" stroke="#212a37" strokeWidth="1.3" strokeLinejoin="round" />
                <path d="M21 5.5C21 4.67 20.33 4 19.5 4H13.5C12.4 4 11.5 4.9 11.5 6V19.5C11.5 18.67 12.17 18 13 18H21V5.5Z" stroke="#212a37" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
              <span>ScholarBot</span>
            </div>

            <input
              type="file"
              accept=".pdf"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="sb-upload-input"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="sb-upload-label">
              {isUploading ? 'Uploading…' : 'Upload a PDF'}
            </label>
          </div>

          <div className="sb-library">
            <h3 className="sb-library-heading">Your library</h3>
            {documents.length === 0 ? (
              <p className="sb-empty-library">Nothing here yet. Upload a PDF to begin.</p>
            ) : (
              documents.map(doc => (
                <div
                  key={doc.id}
                  className={`sb-doc-card ${doc.status === 'ready' ? 'is-ready' : 'is-processing'}`}
                >
                  <div className="sb-doc-name">{doc.filename}</div>
                  <div className="sb-doc-status">
                    <span className="sb-dot" />
                    {doc.status === 'ready' ? 'Ready' : 'Processing'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="sb-main">
          <div className="sb-chat-scroll">
            {messages.length === 0 ? (
              <div className="sb-empty-state">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                  <path d="M3 5.5C3 4.67 3.67 4 4.5 4H10.5C11.6 4 12.5 4.9 12.5 6V19.5C12.5 18.67 11.83 18 11 18H3V5.5Z" stroke="#766f5c" strokeWidth="1.2" strokeLinejoin="round" />
                  <path d="M21 5.5C21 4.67 20.33 4 19.5 4H13.5C12.4 4 11.5 4.9 11.5 6V19.5C11.5 18.67 12.17 18 13 18H21V5.5Z" stroke="#766f5c" strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
                <h2>Ask a question grounded in your documents</h2>
                <p>Every answer traces back to a passage you uploaded — expand "Sources" under any reply to see it.</p>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div key={index} className={`sb-msg-row ${msg.role === 'user' ? 'from-user' : 'from-agent'}`}>
                  <div className="sb-bubble">
                    <div>{msg.text}</div>
                    {msg.context && (
                      <details className="sb-sources">
                        <summary>Sources</summary>
                        <div className="sb-sources-body">{msg.context}</div>
                      </details>
                    )}
                  </div>
                </div>
              ))
            )}

            {isTyping && (
              <div className="sb-msg-row from-agent sb-typing">
                <div className="sb-bubble">
                  <span className="sb-typing-dot" />
                  <span className="sb-typing-dot" />
                  <span className="sb-typing-dot" />
                </div>
              </div>
            )}
          </div>

          <div className="sb-input-bar">
            <form onSubmit={handleSendMessage} className="sb-input-form">
              <select
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                disabled={isTyping}
                className="sb-persona"
                aria-label="Answer style"
              >
                <option value="academic">Standard academic</option>
                <option value="eli5">Explain like I'm 5</option>
                <option value="bullets">Executive bullets</option>
              </select>

              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask something about your documents…"
                disabled={isTyping}
                className="sb-input"
              />
              <button
                type="submit"
                disabled={isTyping || !inputText.trim()}
                className="sb-send-btn"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}