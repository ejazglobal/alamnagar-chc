// State variables for Patient Portal
let currentDate = new Date();
let selectedDateStr = null;
let selectedSlotTime = null;
let appointments = [];
let newsItems = [];
let doctors = [];
let galleryItems = [];
let selectedDoctorId = null;
let selectedDoctor = null;
let currentLanguage = localStorage.getItem('chc_lang') || 'en';
let isFallbackMode = false;

const TIME_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', 
  '12:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00'
];

// DOM elements
const calendarMonthYear = document.getElementById('calendar-month-year');
const calendarGrid = document.getElementById('calendar-grid');
const prevMonthBtn = document.getElementById('prev-month-btn');
const nextMonthBtn = document.getElementById('next-month-btn');
const slotsContainer = document.getElementById('slots-container');
const selectedDateDisplay = document.getElementById('selected-date-display');
const timeSlotsGrid = document.getElementById('time-slots-grid');
const bookingForm = document.getElementById('booking-form');
const statusBanner = document.getElementById('status-banner');
const demoModeNotice = document.getElementById('demo-mode-notice');
const newsContainer = document.getElementById('news-container');

// Translations dictionary
const TRANSLATIONS = {
  en: {
    "title": "Alamnagar Charitable Healthcare Centre - Booking Portal",
    "logo": "Alamnagar CHC",
    "nav-home": "Home",
    "nav-book": "Book Appointment",
    "nav-news": "News & Events",
    "nav-login": "Login / Register",
    "nav-admin": "Admin Portal",
    "nav-logout": "Logout",
    "hero-title": "Caring for Our Community",
    "hero-desc": "Alamnagar Charitable Healthcare Centre provides free, high-quality, and accessible medical services. Book your appointment online to consult with our medical professionals.",
    "hero-btn": "Book an Appointment Now",
    "news-title": "News & Health Announcements",
    "news-loading": "Loading health centre updates...",
    "appt-title": "Schedule Consultation",
    "booking-select-doctor": "Select Consultation Doctor *",
    "booking-select-prompt": "-- Choose a Doctor --",
    "booking-slots-title": "Available Time Slots for",
    "booking-details-title": "Patient Contact Details",
    "booking-name": "Full Name *",
    "booking-email": "Email Address *",
    "booking-phone": "Phone Number *",
    "booking-notes": "Medical Notes / Symptoms (Optional)",
    "booking-confirm-btn": "Confirm Appointment Booking",
    "history-title": "Your Appointment History",
    "history-col-date": "Date & Time",
    "history-col-status": "Status",
    "history-col-notes": "Symptoms / Notes",
    "history-empty": "No appointments booked yet.",
    "gallery-title": "Photo Gallery",
    "gallery-loading": "Loading gallery images...",
    "footer-brand": "Alamnagar Charitable Healthcare Centre",
    "footer-desc": "Serving Alamnagar and surrounding communities with dedication and dignity.",
    "footer-copy": "© 2026 Alamnagar CHC. All rights reserved. Open-source local healthcare project.",
    "modal-close": "Close",
    "demo-notice": "Running in Offline Demo Mode. All scheduling logs and news will be saved in your local web browser storage."
  },
  bn: {
    "title": "আলমনগর দাতব্য চিকিৎসাকেন্দ্র - বুকিং পোর্টাল",
    "logo": "আলমনগর সিএইচসি",
    "nav-home": "হোম",
    "nav-book": "অ্যাপয়েন্টমেন্ট বুকিং",
    "nav-news": "খবর ও ইভেন্ট",
    "nav-login": "লগইন / রেজিস্টার",
    "nav-admin": "অ্যাডমিন পোর্টাল",
    "nav-logout": "লগআউট",
    "hero-title": "আমাদের সম্প্রদায়ের সেবা করা",
    "hero-desc": "আলমনগর দাতব্য চিকিৎসাকেন্দ্র বিনামূল্যে, উচ্চ-মানের এবং অ্যাক্সেসযোগ্য চিকিৎসা সেবা প্রদান করে। আমাদের চিকিৎসা পেশাদারদের সাথে পরামর্শ করতে অনলাইনে আপনার অ্যাপয়েন্টমেন্ট বুক করুন।",
    "hero-btn": "এখনই অ্যাপয়েন্টমেন্ট বুক করুন",
    "news-title": "খবর ও স্বাস্থ্য ঘোষণা",
    "news-loading": "চিকিৎসাকেন্দ্রের আপডেট লোড হচ্ছে...",
    "appt-title": "পরামর্শ নির্ধারণ করুন",
    "booking-select-doctor": "পরামর্শের জন্য ডাক্তার নির্বাচন করুন *",
    "booking-select-prompt": "-- ডাক্তার নির্বাচন করুন --",
    "booking-slots-title": "খালি সময়সূচী",
    "booking-details-title": "রোগীর যোগাযোগের বিবরণ",
    "booking-name": "সম্পূর্ণ নাম *",
    "booking-email": "ইমেল ঠিকানা *",
    "booking-phone": "ফোন নম্বর *",
    "booking-notes": "চিকিৎসা সংক্রান্ত নোট / লক্ষণ (ঐচ্ছিক)",
    "booking-confirm-btn": "অ্যাপয়েন্টমেন্ট বুকিং নিশ্চিত করুন",
    "history-title": "আপনার অ্যাপয়েন্টমেন্টের ইতিহাস",
    "history-col-date": "তারিখ ও সময়",
    "history-col-status": "অবস্থা",
    "history-col-notes": "লক্ষণ / নোট",
    "history-empty": "এখনও কোনো অ্যাপয়েন্টমেন্ট বুক করা হয়নি।",
    "gallery-title": "ফটো গ্যালারি",
    "gallery-loading": "গ্যালারি ছবি লোড হচ্ছে...",
    "footer-brand": "আলমনগর দাতব্য চিকিৎসাকেন্দ্র",
    "footer-desc": "উৎসর্গ এবং মর্যাদার সাথে আলমনগর এবং আশেপাশের সম্প্রদায়ের সেবা করা।",
    "footer-copy": "© ২০২৬ আলমনগর সিএইচসি। সর্বস্বত্ব সংরক্ষিত। ওপেন-সোর্স স্থানীয় স্বাস্থ্যসেবা প্রকল্প।",
    "modal-close": "বন্ধ করুন",
    "demo-notice": "অফলাইন ডেমো মোডে চলছে। সমস্ত সময়সূচী লগ এবং সংবাদ আপনার স্থানীয় ওয়েব ব্রাউজার স্টোরেজে সংরক্ষণ করা হবে।"
  }
};

// Initial Setup
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  translateUI();
  updateLanguageToggles();
  renderDoctorsDropdown();
  renderGallery();
  renderAuthNav();
  renderCalendar();
  renderPatientHistory();
  setupEventListeners();
});

// Translation Engine
window.setLanguage = function(lang) {
  currentLanguage = lang;
  localStorage.setItem('chc_lang', lang);
  updateLanguageToggles();
  translateUI();
  
  // Re-render dynamic text components
  renderNews();
  renderDoctorsDropdown();
  renderSelectedDoctorProfile();
  renderCalendar();
  renderPatientHistory();
  renderGallery();
};

function updateLanguageToggles() {
  const btnEn = document.getElementById('lang-en');
  const btnBn = document.getElementById('lang-bn');
  if (btnEn && btnBn) {
    if (currentLanguage === 'en') {
      btnEn.classList.add('active');
      btnBn.classList.remove('active');
    } else {
      btnBn.classList.add('active');
      btnEn.classList.remove('active');
    }
  }
}

function translateUI() {
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translation = TRANSLATIONS[currentLanguage][key];
    if (translation) {
      if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'email' || el.type === 'tel' || el.type === 'password')) {
        el.placeholder = translation;
      } else if (el.tagName === 'TITLE') {
        document.title = translation;
      } else {
        el.innerText = translation;
      }
    }
  });
}

// Load News, Appointments, Doctors & Gallery from Backend API
async function loadData() {
  isFallbackMode = false;
  if (demoModeNotice) demoModeNotice.style.display = 'none';

  try {
    const newsResponse = await fetch('/api/news');
    if (newsResponse.ok) {
      newsItems = await newsResponse.json();
    } else {
      console.error('Failed to fetch news from backend API');
    }

    const doctorsResponse = await fetch('/api/doctors');
    if (doctorsResponse.ok) {
      doctors = await doctorsResponse.json();
    } else {
      console.error('Failed to fetch doctors from backend API');
    }

    const galleryResponse = await fetch('/api/gallery');
    if (galleryResponse.ok) {
      galleryItems = await galleryResponse.json();
    } else {
      console.error('Failed to fetch gallery from backend API');
    }

    const token = localStorage.getItem('chc_token');
    if (token) {
      const apptsResponse = await fetch('/api/appointments', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (apptsResponse.ok) {
        appointments = await apptsResponse.json();
      } else {
        console.error('Failed to fetch appointments from backend API');
        if (apptsResponse.status === 401 || apptsResponse.status === 403) {
          localStorage.removeItem('chc_token');
          localStorage.removeItem('chc_user_role');
        }
      }
    } else {
      appointments = [];
    }
  } catch (err) {
    console.error('Error fetching data from API server:', err);
  }

  renderNews();
}

// Initial mockup data for local storage testing
function initLocalStorageFallback() {
  if (!localStorage.getItem('chc_news')) {
    const mockNews = [
      {
        id: 1,
        title: "Free Medical Health Camp Next Saturday",
        content: "Alamnagar Charitable Healthcare Centre is organizing a free health check-up camp next Saturday. General physicians, pediatricians, and cardiologists will be available for consultations from 9:00 AM to 3:00 PM. Free medicine distribution is also arranged.",
        image_url: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=600&q=80",
        category: "Event",
        date_posted: new Date(Date.now() - 86400000).toISOString()
      },
      {
        id: 2,
        title: "New Pediatric Specialist Joins Our Team",
        content: "We are pleased to welcome Dr. Sarah Rahman, MD in Pediatrics, to our medical team. She will be available for consultations every Monday and Wednesday starting next week. Book your appointments online.",
        image_url: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=600&q=80",
        category: "News",
        date_posted: new Date(Date.now() - 172800000).toISOString()
      },
      {
        id: 3,
        title: "COVID-19 Booster Dose Guidelines",
        content: "We are offering booster doses of COVID-19 vaccines for senior citizens and high-risk patients. Walk-ins are welcome from 10:00 AM to 2:00 PM on weekdays. Please bring your previous vaccination records.",
        image_url: "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=600&q=80",
        category: "Alert",
        date_posted: new Date(Date.now() - 259200000).toISOString()
      }
    ];
    localStorage.setItem('chc_news', JSON.stringify(mockNews));
  }

  if (!localStorage.getItem('chc_appointments')) {
    const mockAppts = [
      {
        id: 1,
        patient_name: "Rahul Amin",
        email: "rahul@example.com",
        phone: "01712345678",
        appointment_date: getFutureWeekdayDateStr(1), // Tomorrow or next weekday
        appointment_time: "10:30",
        status: "approved",
        notes: "Regular diabetic review consultation.",
        doctor_id: 3,
        created_at: new Date().toISOString()
      },
      {
        id: 2,
        patient_name: "Kamal Hasan",
        email: "kamal@example.com",
        phone: "01812345678",
        appointment_date: getFutureWeekdayDateStr(2),
        appointment_time: "14:00",
        status: "pending",
        notes: "Persistent cough for 3 days.",
        doctor_id: 1,
        created_at: new Date().toISOString()
      }
    ];
    localStorage.setItem('chc_appointments', JSON.stringify(mockAppts));
  }

  if (!localStorage.getItem('chc_doctors')) {
    const mockDoctors = [
      {
        id: 1,
        name_en: "Dr. Sarah Rahman",
        name_bn: "ডাঃ সারাহ রহমান",
        specialty_en: "Pediatric Specialist",
        specialty_bn: "শিশু বিশেষজ্ঞ",
        info_en: "MD in Pediatrics, 8+ years of clinical experience in child healthcare.",
        info_bn: "শিশুরোগবিদ্যায় এমডি, শিশু স্বাস্থ্যসেবায় ৮+ বছরের ক্লিনিকাল অভিজ্ঞতা।",
        visiting_hours_en: "Mon, Wed (09:00 AM - 01:00 PM)",
        visiting_hours_bn: "সোম, বুধ (সকাল ০৯:০০ - দুপুর ০১:০০)",
        image_url: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=600&q=80",
        visiting_days: "1,3"
      },
      {
        id: 2,
        name_en: "Dr. Azam Khan",
        name_bn: "ডাঃ আজম খান",
        specialty_en: "Cardiologist",
        specialty_bn: "হৃদরোগ বিশেষজ্ঞ",
        info_en: "FACS, clinical specialist in preventive and curative cardiology.",
        info_bn: "এফএসিএস, প্রতিরোধমূলক এবং নিরাময়মূলক কার্ডিওলজির ক্লিনিকাল বিশেষজ্ঞ।",
        visiting_hours_en: "Tue, Thu (10:00 AM - 02:00 PM)",
        visiting_hours_bn: "মঙ্গল, বৃহস্পতি (সকাল ১০:০০ - দুপুর ০২:০০)",
        image_url: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=600&q=80",
        visiting_days: "2,4"
      },
      {
        id: 3,
        name_en: "Dr. Rahat Kabir",
        name_bn: "ডাঃ রাহাত কবির",
        specialty_en: "General Physician",
        specialty_bn: "সাধারণ চিকিৎসক",
        info_en: "MBBS, providing comprehensive primary care and medical consults.",
        info_bn: "এমবিবিএস, ব্যাপক প্রাথমিক চিকিৎসা এবং পরামর্শ প্রদানকারী।",
        visiting_hours_en: "Mon, Tue, Wed, Thu, Fri (09:00 AM - 04:00 PM)",
        visiting_hours_bn: "সোম, মঙ্গল, বুধ, বৃহস্পতি, শুক্র (সকাল ০৯:০০ - বিকেল ০৪:০০)",
        image_url: "https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&w=600&q=80",
        visiting_days: "1,2,3,4,5"
      }
    ];
    localStorage.setItem('chc_doctors', JSON.stringify(mockDoctors));
  }

  if (!localStorage.getItem('chc_gallery')) {
    const mockGallery = [
      {
        id: 1,
        title_en: "Medical Checkup Camp",
        title_bn: "বিনামূল্যে চিকিৎসা ক্যাম্প",
        image_url: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=600&q=80"
      },
      {
        id: 2,
        title_en: "Our Clinic Facilities",
        title_bn: "আমাদের ক্লিনিক ভবন ও সুবিধা",
        image_url: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=600&q=80"
      },
      {
        id: 3,
        title_en: "Doctors Consultation Room",
        title_bn: "ডাক্তারদের পরামর্শ কক্ষ",
        image_url: "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=600&q=80"
      }
    ];
    localStorage.setItem('chc_gallery', JSON.stringify(mockGallery));
  }
}

function loadLocalStorageData() {
  newsItems = JSON.parse(localStorage.getItem('chc_news')) || [];
  appointments = JSON.parse(localStorage.getItem('chc_appointments')) || [];
  doctors = JSON.parse(localStorage.getItem('chc_doctors')) || [];
  galleryItems = JSON.parse(localStorage.getItem('chc_gallery')) || [];
}

// Utility to get a future date string skipping weekends
function getFutureWeekdayDateStr(offsetDays) {
  let dateObj = new Date();
  let added = 0;
  while (added < offsetDays) {
    dateObj.setDate(dateObj.getDate() + 1);
    const day = dateObj.getDay();
    if (day !== 0 && day !== 6) {
      added++;
    }
  }
  return dateObj.toISOString().split('T')[0];
}

// Render News Items with Read More modal hooks
function renderNews() {
  newsContainer.innerHTML = '';
  if (newsItems.length === 0) {
    newsContainer.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 1rem;">${TRANSLATIONS[currentLanguage]["news-loading"]}</p>`;
    return;
  }

  newsItems.forEach(item => {
    const card = document.createElement('div');
    card.className = 'news-card';
    
    const formattedDate = new Date(item.date_posted).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    const categoryClass = item.category ? item.category.toLowerCase() : 'news';
    
    const isLong = item.content.length > 150;
    const contentDisplay = isLong ? item.content.substring(0, 150) + '...' : item.content;

    card.innerHTML = `
      <div class="news-image" style="background-image: url('${escapeHTML(item.image_url)}')">
        <span class="news-category ${categoryClass}">${escapeHTML(item.category)}</span>
      </div>
      <div class="news-body">
        <div class="news-meta">Posted on ${formattedDate}</div>
        <h3 class="news-title">${escapeHTML(item.title)}</h3>
        <p class="news-excerpt">${escapeHTML(contentDisplay)}</p>
        ${isLong ? `<a href="#" class="read-more-link" onclick="openNewsModal(event, ${item.id})" style="color: var(--primary-color); font-weight:600; font-size:0.85rem; margin-top: auto; display: inline-block;">${currentLanguage === 'bn' ? 'আরও পড়ুন' : 'Read More'} &rarr;</a>` : ''}
      </div>
    `;
    newsContainer.appendChild(card);
  });
}

// Render Interactive Calendar (taking doctor visiting days into account)
function renderCalendar() {
  calendarGrid.innerHTML = '';
  if (!selectedDoctor) return;
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  calendarMonthYear.textContent = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Render Weekday names
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  weekdays.forEach(day => {
    const dayNameEl = document.createElement('div');
    dayNameEl.className = 'calendar-day-name';
    dayNameEl.textContent = day;
    calendarGrid.appendChild(dayNameEl);
  });

  // Calculate first day and total days in month
  const firstDayIndex = new Date(year, month, 1).getDay(); // Sun = 0, Mon = 1...
  const totalDays = new Date(year, month + 1, 0).getDate();

  // Offset first day to match Mon-Sun layout
  const startingOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

  // Render empty leading squares
  for (let i = 0; i < startingOffset; i++) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'calendar-day empty';
    calendarGrid.appendChild(emptyEl);
  }

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // Allowed doctor visiting days array
  const allowedDays = selectedDoctor.visiting_days ? selectedDoctor.visiting_days.split(',').map(Number) : [1,2,3,4,5];

  // Render month days
  for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
    const dayEl = document.createElement('div');
    dayEl.className = 'calendar-day';
    dayEl.textContent = dayNum;

    const localDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    const dayOfWeek = new Date(year, month, dayNum).getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat

    // Check conditions
    const isPast = localDateStr < todayStr;
    const isToday = localDateStr === todayStr;
    const isDocVisiting = allowedDays.includes(dayOfWeek);

    // Has appointment indicator
    const hasBookings = appointments.some(a => a.appointment_date === localDateStr && a.status !== 'cancelled' && a.doctor_id === selectedDoctorId);

    if (isPast || !isDocVisiting) {
      dayEl.classList.add('disabled');
    } else {
      if (isToday) dayEl.classList.add('today');
      if (hasBookings) dayEl.classList.add('has-bookings');
      if (selectedDateStr === localDateStr) dayEl.classList.add('selected');

      dayEl.addEventListener('click', () => selectDate(localDateStr));
    }

    calendarGrid.appendChild(dayEl);
  }
}

// Select Date and trigger slot generation
function selectDate(dateStr) {
  selectedDateStr = dateStr;
  selectedSlotTime = null; // reset slot selection
  
  renderCalendar();

  slotsContainer.style.display = 'block';
  bookingForm.style.display = 'none'; // hide form until slot selected
  
  const formattedDate = new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  selectedDateDisplay.textContent = formattedDate;

  renderTimeSlots();
}

// Helper to extract time range in minutes from a string like "09:00 AM - 01:00 PM"
function getDoctorTimeRange(hoursStr) {
  if (!hoursStr) return null;
  const regex = /(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i;
  const match = hoursStr.match(regex);
  if (!match) return null;
  
  let startHour = parseInt(match[1], 10);
  const startMin = parseInt(match[2], 10);
  const startAmPm = match[3].toUpperCase();
  
  let endHour = parseInt(match[4], 10);
  const endMin = parseInt(match[5], 10);
  const endAmPm = match[6].toUpperCase();
  
  if (startAmPm === 'PM' && startHour < 12) startHour += 12;
  if (startAmPm === 'AM' && startHour === 12) startHour = 0;
  
  if (endAmPm === 'PM' && endHour < 12) endHour += 12;
  if (endAmPm === 'AM' && endHour === 12) endHour = 0;
  
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  
  return { start: startMinutes, end: endMinutes };
}

// Render Time Slots (marking already booked slots for this doctor as disabled)
function renderTimeSlots() {
  timeSlotsGrid.innerHTML = '';
  if (!selectedDoctor) return;
  
  // Find appointments already booked for the selected date for this specific doctor
  const bookedSlots = appointments
    .filter(a => a.appointment_date === selectedDateStr && a.status !== 'cancelled' && a.doctor_id === selectedDoctorId)
    .map(a => a.appointment_time);

  // Parse doctor's visiting hour boundary
  const range = getDoctorTimeRange(selectedDoctor.visiting_hours_en);

  TIME_SLOTS.forEach(time => {
    // Check if slot falls within doctor's visiting hour boundary
    if (range) {
      const [h, m] = time.split(':').map(Number);
      const slotMinutes = h * 60 + m;
      if (slotMinutes < range.start || slotMinutes > range.end) {
        return; // Skip rendering this slot
      }
    }

    const slotEl = document.createElement('div');
    slotEl.className = 'slot-btn';
    slotEl.textContent = time;

    const isBooked = bookedSlots.includes(time);
    
    if (isBooked) {
      slotEl.classList.add('disabled');
      slotEl.title = 'This slot is already booked';
    } else {
      if (selectedSlotTime === time) slotEl.classList.add('selected');
      slotEl.addEventListener('click', () => selectSlot(time));
    }

    timeSlotsGrid.appendChild(slotEl);
  });
}

// Select Time Slot and open patient contact form
function selectSlot(time) {
  selectedSlotTime = time;
  renderTimeSlots();

  bookingForm.style.display = 'block';
  bookingForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Render Doctors Dropdown list
function renderDoctorsDropdown() {
  const select = document.getElementById('doctor-select');
  if (!select) return;
  
  select.innerHTML = `<option value="" data-i18n="booking-select-prompt">${TRANSLATIONS[currentLanguage]["booking-select-prompt"]}</option>`;
  
  doctors.forEach(doc => {
    const option = document.createElement('option');
    option.value = doc.id;
    const name = currentLanguage === 'bn' ? doc.name_bn : doc.name_en;
    const specialty = currentLanguage === 'bn' ? doc.specialty_bn : doc.specialty_en;
    option.textContent = `${name} (${specialty})`;
    select.appendChild(option);
  });
  
  select.removeEventListener('change', handleDoctorChange);
  select.addEventListener('change', handleDoctorChange);
}

function handleDoctorChange(e) {
  const docId = parseInt(e.target.value, 10);
  const calendarWrapper = document.getElementById('calendar-booking-wrapper');
  
  if (isNaN(docId)) {
    selectedDoctorId = null;
    selectedDoctor = null;
    if (calendarWrapper) calendarWrapper.style.display = 'none';
    document.getElementById('selected-doctor-profile').style.display = 'none';
    slotsContainer.style.display = 'none';
    bookingForm.style.display = 'none';
    return;
  }
  
  selectedDoctorId = docId;
  selectedDoctor = doctors.find(d => d.id === docId);
  
  renderSelectedDoctorProfile();
  
  selectedDateStr = null;
  selectedSlotTime = null;
  if (calendarWrapper) calendarWrapper.style.display = 'block';
  slotsContainer.style.display = 'none';
  bookingForm.style.display = 'none';
  
  renderCalendar();
}

function renderSelectedDoctorProfile() {
  const profileDiv = document.getElementById('selected-doctor-profile');
  if (!profileDiv || !selectedDoctor) return;
  
  const name = currentLanguage === 'bn' ? selectedDoctor.name_bn : selectedDoctor.name_en;
  const specialty = currentLanguage === 'bn' ? selectedDoctor.specialty_bn : selectedDoctor.specialty_en;
  const info = currentLanguage === 'bn' ? selectedDoctor.info_bn : selectedDoctor.info_en;
  const hours = currentLanguage === 'bn' ? selectedDoctor.visiting_hours_bn : selectedDoctor.visiting_hours_en;
  
  profileDiv.innerHTML = `
    <div class="doctor-details-box">
      <div class="doctor-avatar" style="background-image: url('${selectedDoctor.image_url}')"></div>
      <div class="doctor-info-text">
        <h4>${name}</h4>
        <p style="font-weight:600; color:var(--primary-color);">${specialty}</p>
        <p>${info}</p>
        <p class="hours"><strong>${currentLanguage === 'bn' ? 'ক্লিনিক সময়' : 'Clinic Hours'}:</strong> ${hours}</p>
      </div>
    </div>
  `;
  profileDiv.style.display = 'flex';
}

// Render Gallery image grid
function renderGallery() {
  const container = document.getElementById('gallery-container');
  if (!container) return;
  
  container.innerHTML = '';
  if (galleryItems.length === 0) {
    container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 1.5rem 0;" data-i18n="gallery-loading">${TRANSLATIONS[currentLanguage]["gallery-loading"]}</p>`;
    return;
  }
  
  galleryItems.forEach(item => {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    const title = currentLanguage === 'bn' ? item.title_bn : item.title_en;
    
    card.innerHTML = `
      <div class="gallery-img" onclick="openLightbox('${escapeHTML(item.image_url)}', '${escapeHTML(title)}')" style="overflow: hidden; cursor: pointer;">
        <img src="${escapeHTML(item.image_url)}" alt="${escapeHTML(title)}" style="width: 100%; height: 100%; object-fit: cover; transition: var(--transition-smooth);" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
      </div>
      <div class="gallery-title">${escapeHTML(title)}</div>
    `;
    container.appendChild(card);
  });
}

// News Expansion Modal handlers
window.openNewsModal = function(e, id) {
  if (e) e.preventDefault();
  const item = newsItems.find(n => n.id === id);
  if (!item) return;
  
  const modal = document.getElementById('news-modal');
  const title = document.getElementById('news-modal-title');
  const body = document.getElementById('news-modal-body');
  
  title.textContent = item.title;
  
  const formattedDate = new Date(item.date_posted).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  body.innerHTML = `
    <div class="modal-news-img" style="background-image: url('${escapeHTML(item.image_url)}')"></div>
    <div class="modal-news-meta">
      <span><strong>Category:</strong> ${escapeHTML(item.category)}</span>
      <span><strong>Posted on:</strong> ${formattedDate}</span>
    </div>
    <div class="modal-news-content">${escapeHTML(item.content)}</div>
  `;
  
  modal.style.display = 'flex';
};

window.closeNewsModal = function(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close')) return;
  const modal = document.getElementById('news-modal');
  if (modal) modal.style.display = 'none';
};

// Lightbox Zoom handlers
window.openLightbox = function(url, title) {
  const lightbox = document.getElementById('lightbox-modal');
  const img = document.getElementById('lightbox-img');
  const caption = document.getElementById('lightbox-caption');
  
  if (lightbox && img && caption) {
    img.src = url;
    caption.textContent = title || '';
    lightbox.style.display = 'flex';
  }
};

window.closeLightbox = function() {
  const lightbox = document.getElementById('lightbox-modal');
  if (lightbox) lightbox.style.display = 'none';
};

// Setup Event listeners
function setupEventListeners() {
  // Calendar Shifting
  prevMonthBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  });

  nextMonthBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  });

  // Submit Booking request
  let pendingBookingPayload = null;

  window.closeOtpModal = function(e) {
    if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close')) return;
    document.getElementById('otp-modal').style.display = 'none';
    pendingBookingPayload = null;
    clearInterval(resendTimer);
  };

  let resendTimer = null;
  let resendSecondsRemaining = 0;

  window.resendBookingOtp = async function() {
    if (resendSecondsRemaining > 0) return;
    
    const patientPhone = document.getElementById('patient-phone').value.trim();
    const statusBannerOtp = document.getElementById('otp-status-banner');
    
    try {
      statusBannerOtp.textContent = 'Sending new OTP...';
      statusBannerOtp.className = 'status-banner warning';
      statusBannerOtp.style.display = 'block';

      const response = await fetch('/api/appointments/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: '', phone: patientPhone })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to request new OTP.');
      }

      statusBannerOtp.textContent = 'A new OTP has been sent!';
      statusBannerOtp.className = 'status-banner success';
      statusBannerOtp.style.display = 'block';
      document.getElementById('otp-input').value = '';
      
      startResendTimer(60);
    } catch (error) {
      console.error(error);
      statusBannerOtp.textContent = error.message || 'Failed to resend OTP.';
      statusBannerOtp.className = 'status-banner error';
      statusBannerOtp.style.display = 'block';
    }
  };

  function startResendTimer(seconds) {
    const resendBtn = document.getElementById('otp-resend-btn');
    if (!resendBtn) return;
    
    resendSecondsRemaining = seconds;
    resendBtn.disabled = true;
    resendBtn.style.opacity = '0.5';
    resendBtn.style.cursor = 'not-allowed';
    
    clearInterval(resendTimer);
    resendTimer = setInterval(() => {
      resendSecondsRemaining--;
      if (resendSecondsRemaining <= 0) {
        clearInterval(resendTimer);
        resendBtn.disabled = false;
        resendBtn.textContent = 'Resend OTP';
        resendBtn.style.opacity = '1';
        resendBtn.style.cursor = 'pointer';
      } else {
        resendBtn.textContent = `Resend in ${resendSecondsRemaining}s`;
      }
    }, 1000);
  }

  window.verifyBookingOtp = async function() {
    const otpInput = document.getElementById('otp-input').value.trim();
    const statusBannerOtp = document.getElementById('otp-status-banner');
    
    if (otpInput.length !== 6 || isNaN(otpInput)) {
      statusBannerOtp.textContent = 'Please enter a valid 6-digit OTP code.';
      statusBannerOtp.className = 'status-banner error';
      statusBannerOtp.style.display = 'block';
      return;
    }

    try {
      const headers = { 'Content-Type': 'application/json' };
      const token = localStorage.getItem('chc_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      statusBannerOtp.textContent = 'Verifying...';
      statusBannerOtp.className = 'status-banner warning';
      statusBannerOtp.style.display = 'block';

      const response = await fetch('/api/appointments/confirm-with-otp', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          otp: otpInput,
          appointment: pendingBookingPayload
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to verify OTP code.');
      }

      const newAppt = await response.json();
      appointments.push(newAppt);
      
      document.getElementById('otp-modal').style.display = 'none';
      showBookingSuccess(newAppt);
    } catch (error) {
      console.error(error);
      statusBannerOtp.textContent = error.message || 'OTP verification failed.';
      statusBannerOtp.className = 'status-banner error';
      statusBannerOtp.style.display = 'block';
    }
  };

  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const patientName = document.getElementById('patient-name').value.trim();
    const patientPhone = document.getElementById('patient-phone').value.trim();
    const bookingNotes = document.getElementById('booking-notes').value.trim();

    if (!selectedDateStr || !selectedSlotTime || !selectedDoctorId) {
      showStatus('Please select doctor, date, and slot first.', 'error');
      return;
    }

    const payload = {
      patient_name: patientName,
      email: '',
      phone: patientPhone,
      appointment_date: selectedDateStr,
      appointment_time: selectedSlotTime,
      notes: bookingNotes,
      doctor_id: selectedDoctorId
    };

    try {
      if (isFallbackMode) {
        // Save in LocalStorage fallback (skips OTP verification in fallback demo mode)
        const localAppts = JSON.parse(localStorage.getItem('chc_appointments')) || [];
        const activeUserId = localStorage.getItem('chc_user_id');
        const newAppt = {
          id: Date.now(),
          user_id: activeUserId ? parseInt(activeUserId, 10) : null,
          ...payload,
          status: 'pending',
          created_at: new Date().toISOString()
        };
        localAppts.push(newAppt);
        localStorage.setItem('chc_appointments', JSON.stringify(localAppts));
        
        appointments.push(newAppt);
        showBookingSuccess(newAppt);
      } else {
        // Direct appointment booking without showing OTP modal (temporarily bypassed)
        const response = await fetch('/api/appointments/confirm-with-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            otp: 'bypass',
            appointment: payload
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to confirm booking.');
        }

        const newAppt = await response.json();
        appointments.push(newAppt);
        showBookingSuccess(newAppt);
      }
    } catch (error) {
      console.error(error);
      showStatus(error.message || 'An error occurred. Please try again.', 'error');
    }
  });
}

function showBookingSuccess(appointment) {
  bookingForm.reset();
  slotsContainer.style.display = 'none';
  bookingForm.style.display = 'none';
  selectedDateStr = null;
  selectedSlotTime = null;
  selectedDoctorId = null;
  selectedDoctor = null;
  
  const select = document.getElementById('doctor-select');
  if (select) select.value = '';
  document.getElementById('selected-doctor-profile').style.display = 'none';
  document.getElementById('calendar-booking-wrapper').style.display = 'none';
  
  renderCalendar();
  renderPatientHistory();

  statusBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const msg = currentLanguage === 'bn' ? 
    `ডাক্তার অ্যাপয়েন্টমেন্ট সফলভাবে বুক করা হয়েছে! রোগ নাম: ${appointment.patient_name}, তারিখ: ${appointment.appointment_date}, সময়: ${appointment.appointment_time}। অবস্থা: অ্যাডমিন অনুমোদনের জন্য অপেক্ষমান।` : 
    `Successfully booked appointment for ${appointment.patient_name} on ${appointment.appointment_date} at ${appointment.appointment_time}. Status: PENDING admin approval.`;
  
  showStatus(msg, 'success');
}

function showStatus(message, type) {
  statusBanner.textContent = message;
  statusBanner.className = `status-banner ${type}`;
  statusBanner.style.display = 'block';
  
  setTimeout(() => {
    statusBanner.style.display = 'none';
  }, 8000);
}

// Render dynamic authentication UI elements in navigation
function renderAuthNav() {
  const navMenu = document.getElementById('nav-menu');
  if (!navMenu) return;

  const role = localStorage.getItem('chc_user_role');
  const name = localStorage.getItem('chc_user_name');

  if (role) {
    let portalLink = '';
    if (role === 'Admin' || role === 'Staff') {
      portalLink = `<a href="admin.html" class="nav-link btn-admin" id="link-admin" data-i18n="nav-admin">${TRANSLATIONS[currentLanguage]["nav-admin"]}</a>`;
    } else {
      portalLink = `<span class="nav-link" style="color: var(--primary-color); font-weight:600;">${currentLanguage === 'bn' ? 'স্বাগতম, ' : 'Welcome, '}${escapeHTML(name)}</span>`;
    }

    navMenu.innerHTML = `
      <a href="index.html" class="nav-link active" id="link-home" data-i18n="nav-home">${TRANSLATIONS[currentLanguage]["nav-home"]}</a>
      <a href="#appointments" class="nav-link" id="link-book" data-i18n="nav-book">${TRANSLATIONS[currentLanguage]["nav-book"]}</a>
      <a href="#news" class="nav-link" id="link-news" data-i18n="nav-news">${TRANSLATIONS[currentLanguage]["nav-news"]}</a>
      ${portalLink}
      <a href="#" class="nav-link" id="link-logout" onclick="logoutUser(event)" style="font-weight:600; color:var(--danger);" data-i18n="nav-logout">${TRANSLATIONS[currentLanguage]["nav-logout"]}</a>
    `;

    // Pre-populate patient details if form is loaded
    const nameField = document.getElementById('patient-name');
    if (nameField && !nameField.value) {
      nameField.value = name || '';
    }
  } else {
    navMenu.innerHTML = `
      <a href="index.html" class="nav-link active" id="link-home" data-i18n="nav-home">${TRANSLATIONS[currentLanguage]["nav-home"]}</a>
      <a href="#appointments" class="nav-link" id="link-book" data-i18n="nav-book">${TRANSLATIONS[currentLanguage]["nav-book"]}</a>
      <a href="#news" class="nav-link" id="link-news" data-i18n="nav-news">${TRANSLATIONS[currentLanguage]["nav-news"]}</a>
      <a href="login.html" class="nav-link btn-admin" id="link-auth-btn" data-i18n="nav-login">${TRANSLATIONS[currentLanguage]["nav-login"]}</a>
    `;
  }
}

window.logoutUser = function(e) {
  if (e) e.preventDefault();
  localStorage.removeItem('chc_token');
  localStorage.removeItem('chc_user_role');
  localStorage.removeItem('chc_user_name');
  localStorage.removeItem('chc_user_email');
  localStorage.removeItem('chc_user_phone');
  localStorage.removeItem('chc_user_id');
  window.location.reload();
};

function renderPatientHistory() {
  const historySection = document.getElementById('patient-history');
  const tbody = document.getElementById('patient-history-tbody');
  const role = localStorage.getItem('chc_user_role');
  const activeUserId = localStorage.getItem('chc_user_id');

  if (role === 'Patient') {
    historySection.style.display = 'block';
    tbody.innerHTML = '';

    const myAppts = appointments.filter(a => {
      if (isFallbackMode) {
        const userEmail = localStorage.getItem('chc_user_email');
        const userPhone = localStorage.getItem('chc_user_phone');
        return String(a.user_id) === String(activeUserId) || 
               (userEmail && a.email === userEmail) ||
               (userPhone && a.phone === userPhone);
      }
      return a.patient_name !== 'Reserved Slot';
    });

    if (myAppts.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 1.5rem 0;" data-i18n="history-empty">
            ${TRANSLATIONS[currentLanguage]["history-empty"]}
          </td>
        </tr>
      `;
      return;
    }

    myAppts.forEach(appt => {
      const row = document.createElement('tr');
      const formattedDate = new Date(appt.appointment_date).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

      let docNameEn = appt.doctor_name_en;
      let docNameBn = appt.doctor_name_bn;
      if (!docNameEn && appt.doctor_id) {
        const d = doctors.find(doc => doc.id === appt.doctor_id);
        if (d) {
          docNameEn = d.name_en;
          docNameBn = d.name_bn;
        }
      }
      const docName = currentLanguage === 'bn' ? 
        (docNameBn || 'যে কোনো চিকিৎসক') : 
        (docNameEn || 'Any Available Doctor');

      row.innerHTML = `
        <td>
          <strong>${formattedDate}</strong>
          <div style="color: var(--primary-color); font-size: 0.8rem; font-weight:600; margin-top:0.15rem;">${appt.appointment_time}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Doctor: <strong>${escapeHTML(docName)}</strong></div>
        </td>
        <td>
          <span class="badge ${appt.status}">${appt.status}</span>
        </td>
        <td style="color: var(--text-muted); font-size: 0.85rem;">
          ${escapeHTML(appt.notes) || '<em>No notes</em>'}
        </td>
      `;
      tbody.appendChild(row);
    });
  } else {
    historySection.style.display = 'none';
  }
}

// XSS Sanitizer Helper
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
