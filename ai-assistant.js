const db = require('./database');
const https = require('https');

// Knowledge base defaults for Alamnagar CHC
const HOSPITAL_INFO = {
  name: "Alamnagar CHC (আলমনগর কমিউনিটি হেলথ কেয়ার)",
  location: "Alamnagar, Bangladesh (আলমনগর, বাংলাদেশ)",
  emergency_hotline: "09601018088",
  email: "info@alamnagar-chc.org",
  services: [
    { name_bn: "জেনারেল ডাক্তার পরামর্শ (General Doctor Consultation)", name_en: "General Doctor Consultation" },
    { name_bn: "অনলাইন ভিডিও কনসাল্টেশন (Online Video Call Consultation)", name_en: "Online Video Consultation" },
    { name_bn: "বিনামূল্যে রক্তচাপ ও ডায়াবেটিস পরীক্ষা", name_en: "Free Blood Pressure & Diabetes Check" },
    { name_bn: "ডিজিটাল প্রেসক্রিপশন ও ডায়াগনস্টিক সাপোর্ট", name_en: "Digital Prescriptions & Diagnostic Reports" },
    { name_bn: "বিনামূল্যে স্বাস্থ্য শিক্ষা ও টিউটরিয়াল প্রোগ্রাম", name_en: "Free Tuition & Health Education Classes" }
  ],
  donation: {
    bank_name: "Islami Bank Bangladesh PLC (ইসলামী ব্যাংক বাংলাদেশ পিএলসি)",
    branch: "Rangpur Branch",
    account_title: "Alamnagar CHC Fund",
    account_no: "20506180200127114",
    mfs_methods: "bKash / Nagad / CellFin / Bangla QR (ইসলামী ব্যাংক বাংলা কিউআর)",
    instructions_bn: "আপনি সরাসরি ইসলামী ব্যাংক একাউন্টে অথবা bKash/Nagad/CellFin দিয়ে বাংলা QR কোড স্ক্যান করে বা Send Money করে দান করতে পারেন। এরপর ওয়েবসাইটে TrxID লিখে সাবমিট করলে ভেরিফাই হবে।",
    instructions_en: "You can donate directly to our Islami Bank account or scan the Bangla QR code using bKash/Nagad/CellFin. Submit your TrxID on our site for automated verification."
  }
};

/**
 * Call Gemini REST API directly via HTTPS
 */
async function queryGeminiApi(apiKey, systemPrompt, userMessage) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: `${systemPrompt}\n\nUser Question: ${userMessage}` }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 500
      }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.candidates && json.candidates[0] && json.candidates[0].content) {
            const replyText = json.candidates[0].content.parts.map(p => p.text).join('\n');
            resolve(replyText);
          } else {
            reject(new Error(json.error?.message || 'Invalid Gemini response format'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(payload);
    req.end();
  });
}

/**
 * Smart Fallback Engine: Uses rule-based NLP intent matching if LLM API is unavailable
 */
async function processFallbackQuery(userMsg, doctorsList) {
  const cleanMsg = (userMsg || '').toLowerCase().trim();

  // 1. Doctor Schedule & List Intent
  if (cleanMsg.includes('doctor') || cleanMsg.includes('ডাক্তার') || cleanMsg.includes('সময়') || cleanMsg.includes('সময়সূচী') || cleanMsg.includes('visiting') || cleanMsg.includes('schedule')) {
    let docInfoBn = doctorsList.map(d => `• ${d.name_bn} (${d.specialty_bn}) - সময়: ${d.visiting_hours_bn}`).join('\n');
    if (!docInfoBn) {
      docInfoBn = "বর্তমানে আমাদের সম্মানিত ডাক্তারদের তালিকা প্রস্তুত করা হচ্ছে। অনুগ্রহ করে হটলাইনে যোগাযোগ করুন।";
    }
    return {
      reply: `আমাদের আলমনগর সিএইচসি-এর সম্মানিত ডাক্তারদের সময়সূচী:\n\n${docInfoBn}\n\nআপনি ওয়েবসাইটের মাধ্যমে সরাসরি অনলাইন অ্যাপয়েন্টমেন্ট বুক করতে পারেন।`,
      audioText: `আলমনগর সিএইচসি-এর ডাক্তারদের তালিকা এবং সময়সূচী স্ক্রিনে দেখানো হলো। আপনি চাইলে ওয়েবসাইট থেকে সরাসরি অ্যাপয়েন্টমেন্ট নিতে পারেন।`,
      detectedIntent: 'doctors_list',
      quickActions: [{ label: '📅 অ্যাপয়েন্টমেন্ট বুক করুন', action: 'open_appointment_modal' }]
    };
  }

  // 2. Appointment Booking Intent
  if (cleanMsg.includes('appointment') || cleanMsg.includes('book') || cleanMsg.includes('অ্যাপয়েন্টমেন্ট') || cleanMsg.includes('সিরিয়াল') || cleanMsg.includes('বুক')) {
    return {
      reply: `আলমনগর সিএইচসি-তে অ্যাপয়েন্টমেন্ট নেওয়া খুবই সহজ!\n\n১. নিচে 'অ্যাপয়েন্টমেন্ট বুক করুন' বোতামে ক্লিক করুন।\n২. আপনার নাম, মোবাইল নম্বর এবং কাঙ্ক্ষিত তারিখ নির্বাচন করুন।\n৩. ডাক্তার নির্বাচন করে বুকিং নিশ্চিত করুন।\n\nসিরিয়াল নিশ্চিত হলে আপনার মোবাইলে নিশ্চিতকরণ এসএমএস চলে যাবে।`,
      audioText: `আলমনগর সিএইচসি-তে অ্যাপয়েন্টমেন্ট নিতে নিচে বুকিং বোতামে ক্লিক করুন এবং আপনার নাম ও ফোন নম্বর দিয়ে সাবমিট করুন।`,
      detectedIntent: 'appointment_booking',
      quickActions: [{ label: '📅 অ্যাপয়েন্টমেন্ট বুক করুন', action: 'open_appointment_modal' }]
    };
  }

  // 3. Donation & Support Intent
  if (cleanMsg.includes('donate') || cleanMsg.includes('donation') || cleanMsg.includes('দান') || cleanMsg.includes('ডোনেশন') || cleanMsg.includes('bkash') || cleanMsg.includes('bank') || cleanMsg.includes('qr')) {
    return {
      reply: `🤲 আলমনগর সিএইচসি সেবা তহবিলে মুক্তহস্তে দান করুন:\n\n• ইসলামী ব্যাংক একাউন্ট নম্বর: ${HOSPITAL_INFO.donation.account_no}\n• একাউন্ট নাম: ${HOSPITAL_INFO.donation.account_title}\n• বিকাশ / নগদ / বাংলা QR: আপনি যেকোনো ব্যাংকিং অ্যাপস দিয়ে ইসলামী ব্যাংক বাংলা QR কোড স্ক্যান করে বা Send Money করতে পারেন।\n\nঅর্থ পাঠানোর পর ওয়েবসাইটে TrxID দিয়ে নিশ্চিত করুন।`,
      audioText: `আলমনগর সিএইচসি তহবিলে দান করতে আমাদের ইসলামী ব্যাংক একাউন্ট নম্বর ২০৫০৬১৮০২০০১২৭১১৪ অথবা বিকাশ নগদ বাংলা কিউআর ব্যবহার করুন।`,
      detectedIntent: 'donation',
      quickActions: [{ label: '🤲 অনলাইন দান করুন', action: 'open_donation_modal' }]
    };
  }

  // 4. Patient Portal & Prescriptions
  if (cleanMsg.includes('prescription') || cleanMsg.includes('report') || cleanMsg.includes('প্রেসক্রিপশন') || cleanMsg.includes('রিপোর্ট') || cleanMsg.includes('লগইন') || cleanMsg.includes('portal')) {
    return {
      reply: `আপনার পূর্ববর্তী ডাক্তারের প্রেসক্রিপশন ও রিপোর্ট দেখতে রোগীর পোর্টাল (Patient Portal) ব্যবহার করুন।\n\nআপনার রেজিস্টার্ড ফোন নম্বর এবং ওটিপি দিয়ে লগইন করে তাৎক্ষণিক ডিজিটাল প্রেসক্রিপশন প্রিন্ট বা ডাউনলোড করতে পারবেন।`,
      audioText: `আপনার ডিজিটাল প্রেসক্রিপশন দেখতে পেশেন্ট পোর্টাল ব্যবহার করুন। আপনার ফোন নম্বর দিয়ে সহজে লগইন করতে পারবেন।`,
      detectedIntent: 'patient_portal',
      quickActions: [{ label: '🔑 পেশেন্ট পোর্টালে যান', action: 'goto_patient_portal' }]
    };
  }

  // 5. Emergency & Location Intent
  if (cleanMsg.includes('emergency') || cleanMsg.includes('hotline') || cleanMsg.includes('location') || cleanMsg.includes('জরুরি') || cleanMsg.includes('ফোন') || cleanMsg.includes('ঠিকানা') || cleanMsg.includes('কোথায়')) {
    return {
      reply: `🏥 আলমনগর কমিউনিটি হেলথ কেয়ার (CHC)\n\n📍 ঠিকানা: ${HOSPITAL_INFO.location}\n📞 জরুরি হটলাইন: ${HOSPITAL_INFO.emergency_hotline}\n📧 ইমেইল: ${HOSPITAL_INFO.email}\n\n২৪/৭ যেকোনো জরুরি প্রয়োজনে বা সহায়তায় সরাসরি আমাদের হটলাইনে ফোন দিন।`,
      audioText: `আলমনগর সিএইচসি-এর ঠিকানা আলমনগর, বাংলাদেশ। যেকোনো জরুরি প্রয়োজনে আমাদের হটলাইন নম্বর ০৯৬০১০১৮০৮৮ এ যোগাযোগ করুন।`,
      detectedIntent: 'emergency_contact',
      quickActions: [{ label: '📞 হটলাইনে কল করুন', action: 'call_hotline' }]
    };
  }

  // 6. Greetings Intent
  if (cleanMsg.includes('hello') || cleanMsg.includes('hi') || cleanMsg.includes('হ্যালো') || cleanMsg.includes('সালাম') || cleanMsg.includes('আসসালামু')) {
    return {
      reply: `আসসালামু আলাইকুম! আমি আলমনগর সিএইচসি-এর ভার্চুয়াল এআই সহকারী।\n\nআমি আপনাকে কীভাবে সাহায্য করতে পারি? ডাক্তারদের সময়সূচী, অ্যাপয়েন্টমেন্ট বুকিং, দান করা বা যেকোনো তথ্য জানতে প্রশ্ন করুন।`,
      audioText: `আসসালামু আলাইকুম! আলমনগর সিএইচসি এআই সহকারীতে আপনাকে স্বাগতম। ডাক্তারদের সময়সূচী বা অ্যাপয়েন্টমেন্ট সম্পর্কে প্রশ্ন করুন।`,
      detectedIntent: 'greeting',
      quickActions: [
        { label: '👨‍⚕️ ডাক্তার তালিকা', action: 'ask_doctors' },
        { label: '📅 অ্যাপয়েন্টমেন্ট বুক করুন', action: 'open_appointment_modal' }
      ]
    };
  }

  // 7. General Fallback
  return {
    reply: `আমি আলমনগর কমিউনিটি হেলথ কেয়ার (CHC)-এর এআই সহকারী।\n\nআপনার প্রশ্নের উত্তর দিতে আমি প্রস্তুত। আপনি ডাক্তারদের সময়সূচী, অ্যাপয়েন্টমেন্ট প্রক্রিয়া, স্বাস্থ্য সেবা, অথবা দান করার নিয়ম সম্পর্কে যেকোনো প্রশ্ন করতে পারেন।`,
    audioText: `আলমনগর সিএইচসি ভার্চুয়াল সহকারীতে প্রশ্ন করার জন্য ধন্যবাদ। ডাক্তারদের সময়সূচী বা যেকোনো সেবার জন্য আমাদের জানান।`,
    detectedIntent: 'general',
    quickActions: [
      { label: '👨‍⚕️ ডাক্তার তালিকা', action: 'ask_doctors' },
      { label: '📞 জরুরি হটলাইন', action: 'call_hotline' }
    ]
  };
}

/**
 * Main query processor
 */
async function processQuery(userMessage, language = 'bn') {
  try {
    // Load fresh doctor list from DB
    let doctorsList = [];
    try {
      doctorsList = await db.getDoctors();
    } catch (err) {
      console.warn("AI Assistant DB Doctor Fetch Warning:", err.message);
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      // Build dynamic knowledge system prompt
      const doctorsText = doctorsList.map(d => `- ${d.name_bn} / ${d.name_en} (${d.specialty_bn}): Visiting ${d.visiting_hours_bn}`).join('\n');
      const systemPrompt = `You are the Official Automated Voice & Chat AI Virtual Assistant for ${HOSPITAL_INFO.name}.
Your job is to assist patients warmly, accurately, and clearly.

HOSPITAL CONTEXT:
- Name: ${HOSPITAL_INFO.name}
- Location: ${HOSPITAL_INFO.location}
- Emergency Hotline: ${HOSPITAL_INFO.emergency_hotline}
- Active Doctors List:\n${doctorsText || 'General Medical Officers available daily.'}
- Services: General Doctor Consultation, Telemedicine Video Calls, Free Blood Pressure/Diabetes Checks, Digital Prescriptions, Free Health Tuition.
- Donation Bank Details: Islami Bank Bangladesh PLC, A/C: 20506180200127114 (Alamnagar CHC Fund), bKash/Nagad/CellFin/Bangla QR supported.

INSTRUCTIONS:
1. Respond concisely in ${language === 'en' ? 'English' : 'Bangla (বাংলা)'}.
2. Keep the answer clear, helpful, and suitable for being read aloud over audio (Text to Speech). Avoid complicated Markdown tables or code formatting.
3. Keep the tone compassionate, polite, and professional.`;

      try {
        const geminiReply = await queryGeminiApi(apiKey, systemPrompt, userMessage);
        return {
          success: true,
          reply: geminiReply,
          audioText: geminiReply.replace(/[\*\_`#]/g, ''),
          source: 'gemini',
          quickActions: [
            { label: '📅 অ্যাপয়েন্টমেন্ট বুক করুন', action: 'open_appointment_modal' },
            { label: '📞 হটলাইন', action: 'call_hotline' }
          ]
        };
      } catch (geminiErr) {
        console.warn("Gemini API call failed, falling back to local intent engine:", geminiErr.message);
      }
    }

    // Fallback to Rule-based intent engine
    const fallbackResult = await processFallbackQuery(userMessage, doctorsList);
    return {
      success: true,
      ...fallbackResult,
      source: 'local_engine'
    };

  } catch (err) {
    console.error("AI Assistant processQuery Error:", err);
    return {
      success: false,
      reply: "দুঃখিত, বর্তমানে এআই ভার্চুয়াল সেবা সাময়িকভাবে সাড়া দিতে পারছে না। অনুগ্রহ করে আমাদের হটলাইনে সরাসরি কল করুন: 09601018088",
      audioText: "দুঃখিত, এআই সেবা সাড়া দিতে পারছে না। অনুগ্রহ করে হটলাইনে কল করুন।",
      source: 'error_fallback'
    };
  }
}

module.exports = {
  HOSPITAL_INFO,
  processQuery
};
