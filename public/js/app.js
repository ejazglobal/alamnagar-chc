// State variables for Patient Portal
let currentDate = new Date();
let selectedDateStr = null;
let selectedSlotTime = null;
let appointments = [];
let newsItems = [];
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

// Initial Setup
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  renderCalendar();
  setupEventListeners();
});

// Load News and Appointments (from Backend API, falling back to LocalStorage)
async function loadData() {
  try {
    const newsResponse = await fetch('/api/news');
    if (!newsResponse.ok) throw new Error('API server unreachable');
    newsItems = await newsResponse.json();

    const apptsResponse = await fetch('/api/appointments');
    if (!apptsResponse.ok) throw new Error('API server unreachable');
    appointments = await apptsResponse.json();
    
    isFallbackMode = false;
    demoModeNotice.style.display = 'none';
  } catch (err) {
    console.warn('Backend server unreachable. Switching to offline LocalStorage fallback mode.', err);
    isFallbackMode = true;
    demoModeNotice.style.display = 'flex';
    initLocalStorageFallback();
    loadLocalStorageData();
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
        created_at: new Date().toISOString()
      }
    ];
    localStorage.setItem('chc_appointments', JSON.stringify(mockAppts));
  }
}

function loadLocalStorageData() {
  newsItems = JSON.parse(localStorage.getItem('chc_news')) || [];
  appointments = JSON.parse(localStorage.getItem('chc_appointments')) || [];
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

// Render News Items
function renderNews() {
  newsContainer.innerHTML = '';
  if (newsItems.length === 0) {
    newsContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 1rem;">No recent health updates posted.</p>';
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

    card.innerHTML = `
      <div class="news-image" style="background-image: url('${escapeHTML(item.image_url)}')">
        <span class="news-category ${categoryClass}">${escapeHTML(item.category)}</span>
      </div>
      <div class="news-body">
        <div class="news-meta">Posted on ${formattedDate}</div>
        <h3 class="news-title">${escapeHTML(item.title)}</h3>
        <p class="news-excerpt">${escapeHTML(item.content)}</p>
      </div>
    `;
    newsContainer.appendChild(card);
  });
}

// Render Interactive Calendar
function renderCalendar() {
  calendarGrid.innerHTML = '';
  
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
  // Sun(0) is index 6. Mon(1) is index 0.
  const startingOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

  // Render empty leading squares
  for (let i = 0; i < startingOffset; i++) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'calendar-day empty';
    calendarGrid.appendChild(emptyEl);
  }

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // Render month days
  for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
    const dayEl = document.createElement('div');
    dayEl.className = 'calendar-day';
    dayEl.textContent = dayNum;

    // Build standard date string YYYY-MM-DD
    const localDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    const dayOfWeek = new Date(year, month, dayNum).getDay(); // 0 = Sun, 6 = Sat

    // Check conditions
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    const isPast = localDateStr < todayStr;
    const isToday = localDateStr === todayStr;

    // Has appointment indicator
    const hasBookings = appointments.some(a => a.appointment_date === localDateStr && a.status !== 'cancelled');

    if (isWeekend || isPast) {
      dayEl.classList.add('disabled');
    } else {
      if (isToday) dayEl.classList.add('today');
      if (hasBookings) dayEl.classList.add('has-bookings');
      if (selectedDateStr === localDateStr) dayEl.classList.add('selected');

      // Click handler
      dayEl.addEventListener('click', () => selectDate(localDateStr));
    }

    calendarGrid.appendChild(dayEl);
  }
}

// Select Date and trigger slot generation
function selectDate(dateStr) {
  selectedDateStr = dateStr;
  selectedSlotTime = null; // reset slot selection
  
  // Update Calendar selection styling
  renderCalendar();

  // Show available slots UI
  slotsContainer.style.display = 'block';
  bookingForm.style.display = 'none'; // hide form until slot selected
  
  const formattedDate = new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  selectedDateDisplay.textContent = formattedDate;

  // Render time slots
  renderTimeSlots();
}

// Render Time Slots (marking already booked slots as disabled)
function renderTimeSlots() {
  timeSlotsGrid.innerHTML = '';
  
  // Find appointments already booked for the selected date
  const bookedSlots = appointments
    .filter(a => a.appointment_date === selectedDateStr && a.status !== 'cancelled')
    .map(a => a.appointment_time);

  TIME_SLOTS.forEach(time => {
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

  // Reveal booking contact form
  bookingForm.style.display = 'block';
  bookingForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Setup Event listeners
function setupEventListeners() {
  // Navigation Calendar Shifting
  prevMonthBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  });

  nextMonthBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  });

  // Submit Booking request
  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const patientName = document.getElementById('patient-name').value.trim();
    const patientEmail = document.getElementById('patient-email').value.trim();
    const patientPhone = document.getElementById('patient-phone').value.trim();
    const bookingNotes = document.getElementById('booking-notes').value.trim();

    if (!selectedDateStr || !selectedSlotTime) {
      showStatus('Please select a valid date and time slot first.', 'error');
      return;
    }

    const payload = {
      patient_name: patientName,
      email: patientEmail,
      phone: patientPhone,
      appointment_date: selectedDateStr,
      appointment_time: selectedSlotTime,
      notes: bookingNotes
    };

    try {
      if (isFallbackMode) {
        // Save in LocalStorage
        const localAppts = JSON.parse(localStorage.getItem('chc_appointments')) || [];
        const newAppt = {
          id: Date.now(),
          ...payload,
          status: 'pending',
          created_at: new Date().toISOString()
        };
        localAppts.push(newAppt);
        localStorage.setItem('chc_appointments', JSON.stringify(localAppts));
        
        // Mock successful save
        appointments.push(newAppt);
        showBookingSuccess(newAppt);
      } else {
        // Post to Node.js Backend API
        const response = await fetch('/api/appointments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to submit appointment booking.');
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
  // Clear forms and selections
  bookingForm.reset();
  slotsContainer.style.display = 'none';
  bookingForm.style.display = 'none';
  selectedDateStr = null;
  selectedSlotTime = null;
  
  // Refresh Calendar view
  renderCalendar();

  // Scroll to status panel
  statusBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Show status success message
  const msg = `Successfully booked appointment for ${appointment.patient_name} on ${appointment.appointment_date} at ${appointment.appointment_time}. Status: PENDING admin approval.`;
  showStatus(msg, 'success');
}

function showStatus(message, type) {
  statusBanner.textContent = message;
  statusBanner.className = `status-banner ${type}`;
  
  // Auto clear after 8 seconds
  setTimeout(() => {
    statusBanner.style.display = 'none';
  }, 8000);
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
