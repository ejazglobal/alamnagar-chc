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
    { name_bn: "বিনামূল্যে স্বাস্থ্য শিক্ষা ও সামাজিক টিউশন প্রোগ্রাম (Free Community Tuition)", name_en: "Free Tuition & Education Classes" }
  ],
  tuition_program: {
    title_bn: "আলমনগর সিএইচসি সামাজিক টিউশন ও শিক্ষা প্রোগ্রাম",
    title_en: "Alamnagar CHC Community Tuition & Education Program",
    description_bn: "আমাদের এখানে ১ম শ্রেণি থেকে ১২ম শ্রেণি (SSC/HSC) পর্যন্ত সকল ছাত্র-ছাত্রীদের জন্য বিনামূল্যে ও স্বাস্থ্যাশ্রয়ী টিউশন এবং অনলাইন ভার্চুয়াল ক্লাসরুমের সুবিধা রয়েছে।",
    description_en: "We offer free and community tuition classes from Class 1 to Class 12 (SSC/HSC) with both on-premises and live virtual online video classrooms.",
    portal_link: "/tuition.html"
  },
  donation: {
    bank_name: "Islami Bank Bangladesh PLC (اسلامী ব্যাংক বাংলাদেশ পিএলসি)",
    branch: "Rangpur Branch",
    account_title: "Alamnagar CHC Fund",
    account_no: "20506180200127114",
    mfs_methods: "bKash / Nagad / CellFin / Bangla QR (اسلامী ব্যাংক বাংলা কিউআর)",
    instructions_bn: "আপনি সরাসরি ইসলামী ব্যাংক একাউন্টে অথবা bKash/Nagad/CellFin দিয়ে বাংলা QR কোড স্ক্যান করে বা Send Money করে দান করতে পারেন। এরপর ওয়েবসাইটে TrxID লিখে সাবমিট করলে ভেরিফাই হবে।",
    instructions_en: "You can donate directly to our Islami Bank account or scan the Bangla QR code using bKash/Nagad/CellFin. Submit your TrxID on our site for automated verification."
  }
};

// Default fallback doctors list if database table is unseeded
const DEFAULT_DOCTORS = [
  {
    name_bn: "ডাঃ সারাহ রহমান",
    name_en: "Dr. Sarah Rahman",
    specialty_bn: "শিশু বিশেষজ্ঞ (Pediatric Specialist)",
    specialty_en: "Pediatric Specialist",
    visiting_hours_bn: "সোম, বুধ (সকাল ০৯:০০ - দুপুর ০১:০০)",
    visiting_hours_en: "Mon, Wed (09:00 AM - 01:00 PM)"
  },
  {
    name_bn: "ডাঃ আজম খান",
    name_en: "Dr. Azam Khan",
    specialty_bn: "হৃদরোগ বিশেষজ্ঞ (Cardiologist)",
    specialty_en: "Cardiologist",
    visiting_hours_bn: "মঙ্গল, বৃহস্পতি (সকাল ১০:০০ - দুপুর ০২:০০)",
    visiting_hours_en: "Tue, Thu (10:00 AM - 02:00 PM)"
  },
  {
    name_bn: "ডাঃ রাহাত কবির",
    name_en: "Dr. Rahat Kabir",
    specialty_bn: "সাধারণ চিকিৎসক (General Physician)",
    specialty_en: "General Physician",
    visiting_hours_bn: "সোম থেকে শুক্র (সকাল ০৯:০০ - বিকেল ০৪:০০)",
    visiting_hours_en: "Mon to Fri (09:00 AM - 04:00 PM)"
  }
];

/**
 * Single HTTPS POST request helper for Gemini models
 */
function makeGeminiHttpRequest(modelName, apiKey, payload) {
  return new Promise((resolve, reject) => {
    const cleanKey = apiKey.trim();
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${modelName}:generateContent?key=${cleanKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': cleanKey,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode === 200 && json.candidates && json.candidates[0] && json.candidates[0].content) {
            const replyText = json.candidates[0].content.parts.map(p => p.text).join('\n');
            resolve(replyText);
          } else {
            const errMsg = json.error ? `[${json.error.code}] ${json.error.message}` : `HTTP ${res.statusCode}: ${data}`;
            reject(new Error(errMsg));
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
 * Robust Multi-Model Gemini Query Function
 * Uses gemini-3.6-flash (recommended by Google API) with fallback models
 */
async function queryGeminiApi(apiKey, systemPrompt, userMessage) {
  const payload = JSON.stringify({
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    contents: [
      {
        role: "user",
        parts: [{ text: userMessage }]
      }
    ],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 600
    }
  });

  const modelsToTry = [
    'gemini-3.6-flash',
    'gemini-2.5-flash',
    'gemini-2.0-flash-exp',
    'gemini-1.5-flash-latest',
    'gemini-pro'
  ];
  let lastError = null;

  for (const model of modelsToTry) {
    try {
      console.log(`[AI Assistant] Attempting Gemini API call with model: ${model}`);
      const reply = await makeGeminiHttpRequest(model, apiKey, payload);
      console.log(`[AI Assistant] Gemini API Success with model: ${model}`);
      return reply;
    } catch (err) {
      console.warn(`[AI Assistant] Gemini model ${model} failed: ${err.message}`);
      lastError = err;
    }
  }

  throw lastError || new Error("All Gemini models failed");
}

/**
 * Smart Fallback Engine: Uses rule-based NLP intent matching if LLM API is unavailable
 */
async function processFallbackQuery(userMsg, doctorsList) {
  const cleanMsg = (userMsg || '').toLowerCase().trim();
  const activeDoctors = (doctorsList && doctorsList.length > 0) ? doctorsList : DEFAULT_DOCTORS;

  const docInfoBn = activeDoctors.map((d, idx) => `${idx + 1}. ${d.name_bn} (${d.specialty_bn}) - সময়সূচী: ${d.visiting_hours_bn}`).join('\n');

  // 1. Medicine & Pharmacy Queries (e.g. Napa, remedies, cold/flu, medicines database)
  if (cleanMsg.includes('napa') || cleanMsg.includes('medicine') || cleanMsg.includes('ঔষধ') || cleanMsg.includes('মেডিসিন') || cleanMsg.includes('ড্রাগ') || cleanMsg.includes('ফার্মেসি') || cleanMsg.includes('ঠান্ডা') || cleanMsg.includes('সর্দি') || cleanMsg.includes('প্রতিকার') || cleanMsg.includes('cold') || cleanMsg.includes('remedy') || cleanMsg.includes('fever')) {
    return {
      reply: `💊 স্বাস্থ্য ও ঔষধ নির্দেশিকা:\n\n• ঠান্ডা, সর্দি ও সামান্য জ্বরের জন্য প্রচুর কুসুম গরম পানি পান করুন, আদা-লেবুর চা খান এবং পর্যাপ্ত বিশ্রাম নিন।\n• নাপা (Napa 500mg/Paracetamol) সাধারণত জ্বর ও ব্যথানাশক হিসেবে ব্যবহৃত হয়।\n• আমাদের আলমনগর সিএইচসি-তে রেজিস্টার্ড ডিজিটাল ফার্মেসি ও জেনারেল ফিজিশিয়ান সেবা রয়েছে।\n\n⚠️ লক্ষণ ৩ দিনের বেশি স্থায়ী হলে আমাদের ডাক্তারের পরামর্শ নিন।`,
      audioText: `ঠান্ডা ও সর্দির জন্য গরম পানি, আদা চা এবং বিশ্রাম নিন। প্রয়োজনে আমাদের ডাক্তারের পরামর্শ গ্রহণ করুন।`,
      detectedIntent: 'medicine_info',
      quickActions: [{ label: '📅 ডাক্তারের পরামর্শ নিন', action: 'open_appointment_modal' }]
    };
  }

  // 2. Gynecology & Female Specialist Queries
  if (cleanMsg.includes('gynecology') || cleanMsg.includes('gynae') || cleanMsg.includes('গাইনি') || cleanMsg.includes('নারী') || cleanMsg.includes('স্ত্রী')) {
    return {
      reply: `👩‍⚕️ মা ও নারী স্বাস্থ্য (গাইনিকোলজি):\n\nআমাদের আলমনগর সিএইচসি-তে অভিজ্ঞ নারী ও শিশু রোগ বিশেষজ্ঞ নিয়মিত রোগী দেখেন।\n• ডাঃ সারাহ রহমান (শিশু ও নারী স্বাস্থ্য বিশেষজ্ঞ) - সময়: সোম ও বুধ (সকাল ০৯:০০ - দুপুর ০১:০০)।\n\nঅনলাইনে সরাসরি সিরিয়াল বুক করুন।`,
      audioText: `গাইনিকোলজি ও নারী স্বাস্থ্যের জন্য আমাদের শিশু ও নারী বিশেষজ্ঞ ডাঃ সারাহ রহমান সোম ও বুধবারে সেবা প্রদান করেন।`,
      detectedIntent: 'gynecology_info',
      quickActions: [{ label: '📅 অ্যাপয়েন্টমেন্ট বুক করুন', action: 'open_appointment_modal' }]
    };
  }

  // 3. Tuition & Student Education Program Intent
  if (cleanMsg.includes('ছাত্র') || cleanMsg.includes('পড়াও') || cleanMsg.includes('পড়ানো') || cleanMsg.includes('পড়াশোনা') || cleanMsg.includes('টিউশন') || cleanMsg.includes('ক্লাস') || cleanMsg.includes('শিক্ষক') || cleanMsg.includes('শিক্ষার্থী') || cleanMsg.includes('tuition') || cleanMsg.includes('study') || cleanMsg.includes('class') || cleanMsg.includes('student') || cleanMsg.includes('tutor') || cleanMsg.includes('education') || cleanMsg.includes('পড়ালেখা')) {
    return {
      reply: `হ্যাঁ! আলমনগর সিএইচসি-তে বিনামূল্যে ও সামাজিক টিউশন সেবা প্রদান করা হয় 📚\n\nআমাদের শিক্ষা প্রোগ্রামের বৈশিষ্ট্যসমূহ:\n• ১ম শ্রেণি থেকে ১২ম শ্রেণি (SSC/HSC) পর্যন্ত ছাত্র-ছাত্রীদের পাঠদান করা হয়।\n• সরাসরি ক্লাসরুমের পাশাপাশি অনলাইন লাইভ ভার্চুয়াল ভিডিও ক্লাসের ব্যবস্থা রয়েছে।\n• গণিত, ইংরেজি, বিজ্ঞানসহ বিভিন্ন বিষয়ের জন্য দক্ষ টিউটর রয়েছেন।\n\nশিক্ষার্থী হিসেবে ভর্তি হতে বা টিউটর হিসেবে যোগ দিতে আমাদের টিউশন পোর্টালে যান।`,
      audioText: `হ্যাঁ, আলমনগর সিএইচসি-তে ১ম থেকে ১২ম শ্রেণির ছাত্র-ছাত্রীদের বিনামূল্যে ও কম খরচে পড়ানো হয়। বিস্তারিত জানতে টিউশন পোর্টালে যান।`,
      detectedIntent: 'tuition_program',
      quickActions: [{ label: '📚 টিউশন পোর্টালে যান', action: 'goto_tuition_portal' }]
    };
  }

  // 4. Doctor Schedule & List Intent
  if (cleanMsg.includes('doctor') || cleanMsg.includes('ডাক্তার') || cleanMsg.includes('সময়') || cleanMsg.includes('সময়সূচী') || cleanMsg.includes('visiting') || cleanMsg.includes('schedule') || cleanMsg.includes('তালিকা') || cleanMsg.includes('তিনজন') || cleanMsg.includes('3জন') || cleanMsg.includes('তিন জন')) {
    return {
      reply: `আলমনগর সিএইচসি-তে বর্তমানে ৩ জন সম্মানিত চিকিৎসক স্বাস্থ্যসেবা প্রদান করছেন:\n\n${docInfoBn}\n\nআপনি ওয়েবসাইটের মাধ্যমে যেকোনো সময় সরাসরি তাদের অনলাইন অ্যাপয়েন্টমেন্ট বুক করতে পারেন।`,
      audioText: `আলমনগর সিএইচসিতে তিনজন সম্মানিত ডাক্তার রয়েছেন: ডাঃ সারাহ রহমান, ডাঃ আজম খান, এবং ডাঃ রাহাত কবির। তাদের সময়সূচী স্ক্রিনে দেখানো হয়েছে।`,
      detectedIntent: 'doctors_list',
      quickActions: [{ label: '📅 অ্যাপয়েন্টমেন্ট বুক করুন', action: 'open_appointment_modal' }]
    };
  }

  // 5. Appointment Booking Intent
  if (cleanMsg.includes('appointment') || cleanMsg.includes('book') || cleanMsg.includes('অ্যাপয়েন্টমেন্ট') || cleanMsg.includes('সিরিয়াল') || cleanMsg.includes('বুক')) {
    return {
      reply: `আলমনগর সিএইচসি-তে অ্যাপয়েন্টমেন্ট নেওয়া খুবই সহজ!\n\n১. নিচে 'অ্যাপয়েন্টমেন্ট বুক করুন' বোতামে ক্লিক করুন।\n২. আপনার নাম, মোবাইল নম্বর এবং কাঙ্ক্ষিত তারিখ নির্বাচন করুন।\n৩. কাঙ্ক্ষিত ডাক্তার নির্বাচন করে বুকিং সম্পন্ন করুন।\n\nসিরিয়াল নিশ্চিত হলে আপনার মোবাইলে কনফার্মেশন এসএমএস পাঠানো হবে।`,
      audioText: `আলমনগর সিএইচসি-তে অ্যাপয়েন্টমেন্ট নিতে নিচে বুকিং বোতামে ক্লিক করুন এবং আপনার নাম ও ফোন নম্বর দিয়ে সাবমিট করুন।`,
      detectedIntent: 'appointment_booking',
      quickActions: [{ label: '📅 অ্যাপয়েন্টমেন্ট বুক করুন', action: 'open_appointment_modal' }]
    };
  }

  // 6. Donation & Support Intent
  if (cleanMsg.includes('donate') || cleanMsg.includes('donation') || cleanMsg.includes('দান') || cleanMsg.includes('ডোনেশন') || cleanMsg.includes('bkash') || cleanMsg.includes('bank') || cleanMsg.includes('qr')) {
    return {
      reply: `🤲 আলমনগর সিএইচসি সেবা তহবিলে সাহায্য করুন:\n\n• ইসলামী ব্যাংক একাউন্ট নম্বর: ${HOSPITAL_INFO.donation.account_no}\n• একাউন্ট নাম: ${HOSPITAL_INFO.donation.account_title}\n• বিকাশ / নগদ / বাংলা QR: আপনি যেকোনো ব্যাংকিং অ্যাপস দিয়ে ইসলামী ব্যাংক বাংলা QR কোড স্ক্যান করে বা Send Money করতে পারেন।\n\nঅর্থ পাঠানোর পর ওয়েবসাইটে TrxID দিয়ে নিশ্চিত করুন।`,
      audioText: `আলমনগর সিএইচসি তহবিলে দান করতে আমাদের ইসলামী ব্যাংক একাউন্ট নম্বর ২০৫০৬১৮০২০০১২৭১১৪ অথবা বিকাশ নগদ বাংলা কিউআর ব্যবহার করুন।`,
      detectedIntent: 'donation',
      quickActions: [{ label: '🤲 অনলাইন দান করুন', action: 'open_donation_modal' }]
    };
  }

  // 7. Patient Portal & Prescriptions
  if (cleanMsg.includes('prescription') || cleanMsg.includes('report') || cleanMsg.includes('প্রেসক্রিপশন') || cleanMsg.includes('রিপোর্ট') || cleanMsg.includes('লগইন') || cleanMsg.includes('portal')) {
    return {
      reply: `আপনার ডাক্তারের প্রেসক্রিপশন ও মেডিকেল রিপোর্ট দেখতে রোগীর পোর্টাল (Patient Portal) ব্যবহার করুন।\n\nআপনার রেজিস্টার্ড ফোন নম্বর দিয়ে লগইন করে তাৎক্ষণিক ডিজিটাল প্রেসক্রিপশন প্রিন্ট বা ডাউনলোড করতে পারবেন।`,
      audioText: `আপনার ডিজিটাল প্রেসক্রিপশন দেখতে পেশেন্ট পোর্টাল ব্যবহার করুন। আপনার ফোন নম্বর দিয়ে সহজে লগইন করতে পারবেন।`,
      detectedIntent: 'patient_portal',
      quickActions: [{ label: '🔑 পেশেন্ট পোর্টালে যান', action: 'goto_patient_portal' }]
    };
  }

  // 8. Emergency & Location Intent
  if (cleanMsg.includes('emergency') || cleanMsg.includes('hotline') || cleanMsg.includes('location') || cleanMsg.includes('জরুরি') || cleanMsg.includes('ফোন') || cleanMsg.includes('ঠিকানা') || cleanMsg.includes('কোথায়')) {
    return {
      reply: `🏥 আলমনগর কমিউনিটি হেলথ কেয়ার (CHC)\n\n📍 ঠিকানা: ${HOSPITAL_INFO.location}\n📞 জরুরি হটলাইন: ${HOSPITAL_INFO.emergency_hotline}\n📧 ইমেইল: ${HOSPITAL_INFO.email}\n\n২৪/৭ যেকোনো জরুরি প্রয়োজনে বা সহায়তায় সরাসরি আমাদের হটলাইনে ফোন দিন।`,
      audioText: `আলমনগর সিএইচসি-এর ঠিকানা আলমনগর, বাংলাদেশ। যেকোনো জরুরি প্রয়োজনে আমাদের হটলাইন নম্বর ০৯৬০১০১৮০৮৮ এ যোগাযোগ করুন।`,
      detectedIntent: 'emergency_contact',
      quickActions: [{ label: '📞 হটলাইনে কল করুন', action: 'call_hotline' }]
    };
  }

  // 9. Greetings Intent
  if (cleanMsg.includes('hello') || cleanMsg.includes('hi') || cleanMsg.includes('হ্যালো') || cleanMsg.includes('সালাম') || cleanMsg.includes('আসসালামু')) {
    return {
      reply: `আসসালামু আলাইকুম! আমি আলমনগর সিএইচসি-এর ভার্চুয়াল এআই সহকারী।\n\nআমি আপনাকে কীভাবে সাহায্য করতে পারি? ডাক্তারদের সময়সূচী, অ্যাপয়েন্টমেন্ট, টিউটোরিয়াল ক্লাস বা দান করার তথ্য জানতে প্রশ্ন করুন।`,
      audioText: `আসসালামু আলাইকুম! আলমনগর সিএইচসি এআই সহকারীতে আপনাকে স্বাগতম। ডাক্তারদের সময়সূচী, টিউশন ক্লাস বা অ্যাপয়েন্টমেন্ট সম্পর্কে প্রশ্ন করুন।`,
      detectedIntent: 'greeting',
      quickActions: [
        { label: '👨‍⚕️ ডাক্তার তালিকা', action: 'ask_doctors' },
        { label: '📚 টিউশন পোর্টাল', action: 'goto_tuition_portal' },
        { label: '📅 অ্যাপয়েন্টমেন্ট বুক করুন', action: 'open_appointment_modal' }
      ]
    };
  }

  // 10. General Fallback
  return {
    reply: `আমি আলমনগর কমিউনিটি হেলথ কেয়ার (CHC)-এর এআই ভার্চুয়াল সহকারী।\n\nআমাদের চিকিৎসকদের সময়সূচী, বিনামূল্যে টিউশন প্রোগ্রাম (ছাত্র পড়ানো), অনলাইন ভিডিও কল, অথবা অ্যাপয়েন্টমেন্ট সম্পর্কে প্রশ্ন করতে পারেন।`,
    audioText: `আলমনগর সিএইচসি ভার্চুয়াল সহকারীতে প্রশ্ন করার জন্য ধন্যবাদ। ডাক্তারদের সময়সূচী, টিউশন সেবা বা যেকোনো তথ্যের জন্য আমাদের জানান।`,
    detectedIntent: 'general',
    quickActions: [
      { label: '👨‍⚕️ ডাক্তার তালিকা', action: 'ask_doctors' },
      { label: '📚 টিউশন পোর্টাল', action: 'goto_tuition_portal' },
      { label: '📞 জরুরি হটলাইন', action: 'call_hotline' }
    ]
  };
}

/**
 * Main query processor
 */
async function processQuery(userMessage, language = 'bn') {
  try {
    let doctorsList = [];
    try {
      if (typeof db.getAllDoctors === 'function') {
        doctorsList = await db.getAllDoctors();
      }
    } catch (err) {
      console.warn("AI Assistant DB Doctor Fetch Warning:", err.message);
    }

    if (!doctorsList || doctorsList.length === 0) {
      doctorsList = DEFAULT_DOCTORS;
    }

    const apiKey = (process.env.GEMINI_API_KEY || '').trim();

    if (apiKey) {
      const doctorsText = doctorsList.map(d => `- ${d.name_bn} / ${d.name_en} (${d.specialty_bn}): Visiting ${d.visiting_hours_bn}`).join('\n');
      const systemPrompt = `You are the Official Automated Voice & Chat AI Virtual Assistant for ${HOSPITAL_INFO.name}.
Your job is to assist patients and students warmly, accurately, and clearly.

HOSPITAL & EDUCATION CONTEXT:
- Name: ${HOSPITAL_INFO.name}
- Location: ${HOSPITAL_INFO.location}
- Emergency Hotline: ${HOSPITAL_INFO.emergency_hotline}
- Active Doctors List:\n${doctorsText}
- Services: General Doctor Consultation, Telemedicine Video Calls, Free Blood Pressure/Diabetes Checks, Digital Prescriptions.
- COMMUNITY TUITION & EDUCATION PROGRAM: ${HOSPITAL_INFO.tuition_program.description_bn} (Classes 1 to 12 / SSC / HSC, live online virtual video classrooms, tutors & student enrollment at ${HOSPITAL_INFO.tuition_program.portal_link}).
- Donation Bank Details: Islami Bank Bangladesh PLC, A/C: 20506180200127114 (Alamnagar CHC Fund), bKash/Nagad/CellFin/Bangla QR supported.

INSTRUCTIONS:
1. Respond concisely in ${language === 'en' ? 'English' : 'Bangla (বাংলা)'}.
2. Keep the answer clear, helpful, and suitable for being read aloud over audio (Text to Speech). Avoid Markdown tables or code blocks.
3. Keep the tone compassionate, polite, and professional.
4. Answer general medical inquiries (e.g. remedies for cold, medicines like Napa, specialist doctors like Gynecology/Pediatrics) with helpful general guidance while reminding the patient to consult a registered doctor.`;

      try {
        const geminiReply = await queryGeminiApi(apiKey, systemPrompt, userMessage);
        return {
          success: true,
          reply: geminiReply,
          audioText: geminiReply.replace(/[\*\_`#]/g, ''),
          source: 'gemini',
          quickActions: [
            { label: '📚 টিউশন পোর্টালে যান', action: 'goto_tuition_portal' },
            { label: '📅 অ্যাপয়েন্টমেন্ট বুক করুন', action: 'open_appointment_modal' }
          ]
        };
      } catch (geminiErr) {
        console.warn("[AI Assistant] Gemini API call failed, falling back to local intent engine:", geminiErr.message);
      }
    }

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
      reply: "দুঃখিত, বর্তমানে এআই ভার্চুয়াল সেবা সাড়া দিতে পারছে না। অনুগ্রহ করে আমাদের হটলাইনে কল করুন: 09601018088",
      audioText: "দুঃখিত, সমস্যা হয়েছে। হটলাইনে কল করুন।",
      source: 'error_fallback'
    };
  }
}

module.exports = {
  HOSPITAL_INFO,
  DEFAULT_DOCTORS,
  processQuery
};
