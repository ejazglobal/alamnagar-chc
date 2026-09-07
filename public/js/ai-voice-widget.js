/**
 * Alamnagar CHC - Interactive AI Virtual Voice & Chat Assistant Widget
 * Features: Native SpeechRecognition (STT), SpeechSynthesis (TTS), Bangla/English Voice, Audio Wave Animation, Quick Action Chips.
 */

(function () {
  'use me';

  // Prevent double initialization
  if (window.__aiVoiceWidgetLoaded) return;
  window.__aiVoiceWidgetLoaded = true;

  let isListening = false;
  let isSpeaking = false;
  let ttsEnabled = true;
  let currentLang = 'bn-BD'; // 'bn-BD' or 'en-US'
  let recognition = null;
  let currentUtterance = null;

  // CSS Styles for Floating Widget & Voice Modal
  const style = document.createElement('style');
  style.id = 'ai-voice-widget-styles';
  style.textContent = `
    /* Floating AI Button */
    .ai-voice-float-btn {
      position: fixed;
      bottom: 25px;
      right: 25px;
      z-index: 9998;
      background: linear-gradient(135deg, #0d9488 0%, #0284c7 100%);
      color: white;
      border: none;
      border-radius: 50px;
      padding: 12px 20px;
      font-size: 0.95rem;
      font-weight: 700;
      box-shadow: 0 10px 25px rgba(13, 148, 136, 0.4);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      font-family: inherit;
    }
    .ai-voice-float-btn:hover {
      transform: translateY(-3px) scale(1.03);
      box-shadow: 0 15px 30px rgba(13, 148, 136, 0.5);
    }
    .ai-voice-btn-pulse {
      width: 12px;
      height: 12px;
      background: #34d399;
      border-radius: 50%;
      box-shadow: 0 0 0 rgba(52, 211, 153, 0.7);
      animation: pulse-ring 1.8s infinite;
    }
    @keyframes pulse-ring {
      0% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.7); }
      70% { box-shadow: 0 0 0 10px rgba(52, 211, 153, 0); }
      100% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0); }
    }

    /* Modal Overlay */
    .ai-voice-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.75);
      backdrop-filter: blur(8px);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 15px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease;
    }
    .ai-voice-modal-overlay.active {
      opacity: 1;
      pointer-events: auto;
    }

    /* Modal Dialog Container */
    .ai-voice-card {
      background: #ffffff;
      width: 100%;
      max-width: 480px;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
      display: flex;
      flex-direction: column;
      max-height: 85vh;
      transform: translateY(20px);
      transition: transform 0.3s ease;
      font-family: inherit;
    }
    .ai-voice-modal-overlay.active .ai-voice-card {
      transform: translateY(0);
    }

    /* Header */
    .ai-voice-header {
      background: linear-gradient(135deg, #0f766e 0%, #0369a1 100%);
      color: white;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .ai-voice-title {
      font-size: 1.05rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ai-voice-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ai-voice-icon-btn {
      background: rgba(255, 255, 255, 0.15);
      border: none;
      color: white;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.2s;
      font-size: 0.9rem;
    }
    .ai-voice-icon-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    /* Interactive Voice Stage */
    .ai-voice-stage {
      background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
      padding: 24px 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border-bottom: 1px solid #e2e8f0;
      text-align: center;
    }
    .ai-mic-trigger {
      width: 76px;
      height: 76px;
      border-radius: 50%;
      background: linear-gradient(135deg, #0d9488 0%, #0284c7 100%);
      color: white;
      border: 4px solid #ffffff;
      box-shadow: 0 10px 20px rgba(13, 148, 136, 0.3);
      font-size: 1.8rem;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.3s ease;
      position: relative;
    }
    .ai-mic-trigger:hover {
      transform: scale(1.06);
    }
    .ai-mic-trigger.listening {
      background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
      animation: mic-listening-pulse 1.2s infinite alternate;
    }
    @keyframes mic-listening-pulse {
      0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6); }
      100% { transform: scale(1.1); box-shadow: 0 0 0 18px rgba(239, 68, 68, 0); }
    }
    .ai-voice-status {
      margin-top: 12px;
      font-weight: 700;
      font-size: 0.9rem;
      color: #334155;
    }
    .ai-wave-bars {
      display: flex;
      align-items: center;
      gap: 4px;
      height: 16px;
      margin-top: 8px;
    }
    .ai-wave-bar {
      width: 4px;
      height: 6px;
      background: #0d9488;
      border-radius: 2px;
      transition: height 0.1s ease;
    }
    .ai-wave-bars.active .ai-wave-bar {
      animation: wave-anim 0.8s infinite ease-in-out alternate;
    }
    .ai-wave-bars.active .ai-wave-bar:nth-child(1) { animation-delay: 0.1s; }
    .ai-wave-bars.active .ai-wave-bar:nth-child(2) { animation-delay: 0.3s; }
    .ai-wave-bars.active .ai-wave-bar:nth-child(3) { animation-delay: 0.2s; }
    .ai-wave-bars.active .ai-wave-bar:nth-child(4) { animation-delay: 0.4s; }
    .ai-wave-bars.active .ai-wave-bar:nth-child(5) { animation-delay: 0.15s; }
    @keyframes wave-anim {
      0% { height: 4px; }
      100% { height: 22px; }
    }

    /* Chat Messages Body */
    .ai-chat-body {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 180px;
    }
    .ai-msg {
      max-width: 85%;
      padding: 10px 14px;
      border-radius: 14px;
      font-size: 0.9rem;
      line-height: 1.45;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .ai-msg.user {
      align-self: flex-end;
      background: #e0f2fe;
      color: #0369a1;
      border-bottom-right-radius: 2px;
      font-weight: 500;
    }
    .ai-msg.bot {
      align-self: flex-start;
      background: #f1f5f9;
      color: #1e293b;
      border-bottom-left-radius: 2px;
      border-left: 3px solid #0d9488;
    }

    /* Quick Action Chips */
    .ai-quick-chips {
      padding: 8px 16px;
      display: flex;
      gap: 8px;
      overflow-x: auto;
      background: #fafafa;
      border-top: 1px solid #f1f5f9;
    }
    .ai-quick-chip {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      color: #334155;
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .ai-quick-chip:hover {
      background: #0d9488;
      color: white;
      border-color: #0d9488;
    }

    /* Input Footer */
    .ai-voice-footer {
      padding: 12px 16px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      gap: 8px;
      background: #ffffff;
    }
    .ai-text-input {
      flex: 1;
      border: 1px solid #cbd5e1;
      border-radius: 20px;
      padding: 8px 16px;
      font-size: 0.9rem;
      outline: none;
      font-family: inherit;
    }
    .ai-text-input:focus {
      border-color: #0d9488;
      box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.15);
    }
    .ai-send-btn {
      background: #0d9488;
      color: white;
      border: none;
      border-radius: 50%;
      width: 38px;
      height: 38px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.2s;
    }
    .ai-send-btn:hover {
      background: #0f766e;
    }
  `;
  document.head.appendChild(style);

  // Render Floating Trigger Button
  const floatBtn = document.createElement('button');
  floatBtn.className = 'ai-voice-float-btn';
  floatBtn.innerHTML = `
    <span class="ai-voice-btn-pulse"></span>
    <span>🎙️ AI ভয়েস কল</span>
  `;
  document.body.appendChild(floatBtn);

  // Render Voice Call Modal HTML
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'ai-voice-modal-overlay';
  modalOverlay.id = 'ai-voice-modal';
  modalOverlay.innerHTML = `
    <div class="ai-voice-card">
      <div class="ai-voice-header">
        <div class="ai-voice-title">
          <span>🤖 আলমনগর সিএইচসি এআই ভয়েস কল</span>
        </div>
        <div class="ai-voice-controls">
          <button class="ai-voice-icon-btn" id="ai-toggle-lang" title="Switch Language (বাংলা / English)">🇧🇩</button>
          <button class="ai-voice-icon-btn" id="ai-toggle-tts" title="Toggle Sound / Voice Readout">🔊</button>
          <button class="ai-voice-icon-btn" id="ai-close-modal" title="Close Call">&times;</button>
        </div>
      </div>

      <div class="ai-voice-stage">
        <button class="ai-mic-trigger" id="ai-mic-button" title="কথা বলতে ক্লিক করুন">
          🎙️
        </button>
        <div class="ai-voice-status" id="ai-voice-status">মাইক্রোফোন চালু করতে স্পর্শ করুন (কথা বলুন)</div>
        <div class="ai-wave-bars" id="ai-wave-bars">
          <div class="ai-wave-bar"></div>
          <div class="ai-wave-bar"></div>
          <div class="ai-wave-bar"></div>
          <div class="ai-wave-bar"></div>
          <div class="ai-wave-bar"></div>
        </div>
      </div>

      <div class="ai-chat-body" id="ai-chat-messages">
        <div class="ai-msg bot">আসসালামু আলাইকুম! আমি আলমনগর সিএইচসি-এর ভার্চুয়াল এআই সহকারী।\n\nডাক্তারদের সময়সূচী, অ্যাপয়েন্টমেন্ট বা যেকোনো তথ্যের জন্য আমাকে বলতে পারেন।</div>
      </div>

      <div class="ai-quick-chips" id="ai-quick-chips">
        <button class="ai-quick-chip" onclick="window.sendAiQuickQuery('আজকের ডাক্তারদের সময়সূচী কত?')">👨‍⚕️ ডাক্তার সময়সূচী</button>
        <button class="ai-quick-chip" onclick="window.sendAiQuickQuery('অ্যাপয়েন্টমেন্ট কিভাবে নিব?')">📅 অ্যাপয়েন্টমেন্ট বুকিং</button>
        <button class="ai-quick-chip" onclick="window.sendAiQuickQuery('দান করার নিয়ম কি?')">🤲 দান করার উপায়</button>
        <button class="ai-quick-chip" onclick="window.sendAiQuickQuery('জরুরি হটলাইন কত?')">📞 জরুরি ফোন</button>
      </div>

      <div class="ai-voice-footer">
        <input type="text" class="ai-text-input" id="ai-text-input" placeholder="প্রশ্ন টাইপ করুন বা ভয়েস দিয়ে বলুন..." onkeydown="if(event.key==='Enter') window.sendAiTextQuery()">
        <button class="ai-send-btn" onclick="window.sendAiTextQuery()" title="পাঠান">➤</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalOverlay);

  // Initialize SpeechRecognition API
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = function () {
      isListening = true;
      updateVoiceUiState('listening', 'কথা বলুন... আমি শুনছি 👂');
    };

    recognition.onresult = function (event) {
      const transcript = event.results[0][0].transcript;
      if (transcript) {
        appendMessage('user', transcript);
        sendQueryToBackend(transcript);
      }
    };

    recognition.onerror = function (event) {
      console.warn('Speech recognition error:', event.error);
      isListening = false;
      updateVoiceUiState('idle', 'মাইক্রোফোনে পুনরায় চাপ দিন');
    };

    recognition.onend = function () {
      isListening = false;
      if (!isSpeaking) {
        updateVoiceUiState('idle', 'কথা বলতে মাইক্রোফোনে চাপ দিন');
      }
    };
  }

  // Toggle Voice Modal
  floatBtn.addEventListener('click', openAiVoiceModal);
  document.getElementById('ai-close-modal').addEventListener('click', closeAiVoiceModal);

  function openAiVoiceModal() {
    modalOverlay.classList.add('active');
  }

  function closeAiVoiceModal() {
    modalOverlay.classList.remove('active');
    stopSpeech();
    if (recognition && isListening) {
      recognition.stop();
    }
  }

  // Toggle Mic Listener
  const micBtn = document.getElementById('ai-mic-button');
  micBtn.addEventListener('click', function () {
    if (!SpeechRecognition) {
      alert('আপনার ব্রাউজার সরাসরি ভয়েস রিকগনিশন সমর্থন করে না। অনুগ্রহ করে নিচের বক্সে টেক্সট লিখুন।');
      return;
    }

    if (isListening) {
      recognition.stop();
    } else {
      stopSpeech();
      recognition.lang = currentLang;
      try {
        recognition.start();
      } catch (e) {
        console.warn('Mic start error:', e);
      }
    }
  });

  // Toggle TTS Sound Readout
  const ttsBtn = document.getElementById('ai-toggle-tts');
  ttsBtn.addEventListener('click', function () {
    ttsEnabled = !ttsEnabled;
    ttsBtn.textContent = ttsEnabled ? '🔊' : '🔇';
    if (!ttsEnabled) stopSpeech();
  });

  // Toggle Language (Bangla / English)
  const langBtn = document.getElementById('ai-toggle-lang');
  langBtn.addEventListener('click', function () {
    if (currentLang === 'bn-BD') {
      currentLang = 'en-US';
      langBtn.textContent = '🇬🇧';
    } else {
      currentLang = 'bn-BD';
      langBtn.textContent = '🇧🇩';
    }
  });

  // UI State Updater
  function updateVoiceUiState(state, textStatus) {
    const statusEl = document.getElementById('ai-voice-status');
    const waveEl = document.getElementById('ai-wave-bars');
    const micEl = document.getElementById('ai-mic-button');

    if (statusEl) statusEl.textContent = textStatus;

    if (state === 'listening') {
      micEl.classList.add('listening');
      waveEl.classList.add('active');
    } else if (state === 'speaking') {
      micEl.classList.remove('listening');
      waveEl.classList.add('active');
    } else {
      micEl.classList.remove('listening');
      waveEl.classList.remove('active');
    }
  }

  // Text-to-Speech (TTS Voice Output)
  function speakText(text) {
    if (!ttsEnabled || !('speechSynthesis' in window)) return;
    stopSpeech();

    const cleanText = text.replace(/[^\w\s\u0980-\u09FF\.\,\?\!]/gi, '');
    currentUtterance = new SpeechSynthesisUtterance(cleanText);
    currentUtterance.lang = currentLang;
    currentUtterance.rate = 1.0;
    currentUtterance.pitch = 1.0;

    currentUtterance.onstart = function () {
      isSpeaking = true;
      updateVoiceUiState('speaking', 'এআই উত্তর দিচ্ছে... 🔊');
    };

    currentUtterance.onend = function () {
      isSpeaking = false;
      updateVoiceUiState('idle', 'কথা বলতে মাইক্রোফোনে চাপ দিন');
    };

    currentUtterance.onerror = function () {
      isSpeaking = false;
      updateVoiceUiState('idle', 'কথা বলতে মাইক্রোফোনে চাপ দিন');
    };

    window.speechSynthesis.speak(currentUtterance);
  }

  function stopSpeech() {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    isSpeaking = false;
  }

  // Append Message to Chat Log
  function appendMessage(sender, text, quickActions = []) {
    const chatContainer = document.getElementById('ai-chat-messages');
    if (!chatContainer) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `ai-msg ${sender}`;
    msgDiv.textContent = text;
    chatContainer.appendChild(msgDiv);

    // If there are quick action buttons from backend
    if (quickActions && quickActions.length > 0) {
      const actionsDiv = document.createElement('div');
      actionsDiv.style.cssText = 'display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px;';
      quickActions.forEach(qa => {
        const btn = document.createElement('button');
        btn.className = 'ai-quick-chip';
        btn.style.cssText = 'background: #0d9488; color: white; border: none; margin-top: 4px;';
        btn.textContent = qa.label;
        btn.onclick = function () {
          handleQuickAction(qa.action);
        };
        actionsDiv.appendChild(btn);
      });
      msgDiv.appendChild(actionsDiv);
    }

    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  // Quick Action Handler
  function handleQuickAction(action) {
    closeAiVoiceModal();
    if (action === 'open_appointment_modal') {
      if (typeof window.openAppointmentModal === 'function') window.openAppointmentModal();
      else if (typeof window.openModal === 'function') window.openModal();
    } else if (action === 'open_donation_modal') {
      if (typeof window.openDonationModal === 'function') window.openDonationModal();
    } else if (action === 'goto_patient_portal') {
      window.location.href = '/patient-portal.html';
    } else if (action === 'call_hotline') {
      window.location.href = 'tel:09601018088';
    } else if (action === 'ask_doctors') {
      openAiVoiceModal();
      window.sendAiQuickQuery('ডাক্তারদের সময়সূচী কি?');
    }
  }

  // Backend API Communication
  async function sendQueryToBackend(userMessage) {
    updateVoiceUiState('processing', 'এআই চিন্তা করছে... ⏳');

    try {
      const response = await fetch('/api/ai-assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          language: currentLang.startsWith('en') ? 'en' : 'bn'
        })
      });

      const data = await response.json();
      if (data.reply) {
        appendMessage('bot', data.reply, data.quickActions);
        speakText(data.audioText || data.reply);
      } else {
        appendMessage('bot', 'দুঃখিত, কোনো উত্তর পাওয়া যায়নি।');
        updateVoiceUiState('idle', 'কথা বলতে মাইক্রোফোনে চাপ দিন');
      }
    } catch (err) {
      console.error('AI query backend error:', err);
      appendMessage('bot', 'দুঃখিত, সার্ভারের সাথে সংযোগে ত্রুটি দেখা দিয়েছে।');
      updateVoiceUiState('idle', 'কথা বলতে মাইক্রোফোনে চাপ দিন');
    }
  }

  // Global Helpers for Trigger Buttons
  window.sendAiTextQuery = function () {
    const input = document.getElementById('ai-text-input');
    if (!input || !input.value.trim()) return;
    const text = input.value.trim();
    input.value = '';
    appendMessage('user', text);
    sendQueryToBackend(text);
  };

  window.sendAiQuickQuery = function (queryText) {
    appendMessage('user', queryText);
    sendQueryToBackend(queryText);
  };

  window.openAiVoiceAssistant = openAiVoiceModal;

})();
