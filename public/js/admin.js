// State Management
let appointments = [];
let newsItems = [];
let doctors = [];
let editingNewsId = null;
let editingDoctorId = null;
let editingDoctorImage = '';
let currentFilter = 'all';
let searchQuery = '';
let isFallbackMode = false;

// DOM Elements
const authLoading = document.getElementById('auth-loading');
const dashboardView = document.getElementById('admin-dashboard-view');

const statTotal = document.getElementById('stat-total');
const statPending = document.getElementById('stat-pending');
const statApproved = document.getElementById('stat-approved');

const apptTbody = document.getElementById('appointments-tbody');
const apptSearch = document.getElementById('appt-search');
const filterGroup = document.getElementById('filter-group');
const adminDemoNotice = document.getElementById('admin-demo-mode-notice');
const apptStatusBanner = document.getElementById('appt-status-banner');

const newsPostForm = document.getElementById('news-post-form');
const newsStatusBanner = document.getElementById('news-status-banner');

// Check authentication on startup
document.addEventListener('DOMContentLoaded', () => {
  const role = localStorage.getItem('chc_user_role');
  const token = localStorage.getItem('chc_token');

  if (!token || (role !== 'Admin' && role !== 'Staff')) {
    // Access denied: redirect to login
    window.location.href = 'login.html';
  } else {
    unlockDashboard(role);
  }
});

async function unlockDashboard(role) {
  if (authLoading) authLoading.style.display = 'none';
  if (dashboardView) dashboardView.style.display = 'block';
  
  renderAuthNav();
  await loadData();
  setupDashboardEvents();
  renderDashboard();
  renderNewsManageTable();
  renderDoctorsManageTable();
  
  if (role === 'Admin') {
    const staffSec = document.getElementById('admin-staff-section');
    if (staffSec) staffSec.style.display = 'block';
    setupStaffDashboardEvents();
    await loadStaffAndRender();
  }
  applyStaffPermissionsFilter();
}

// Load Appointments, News, Doctors
async function loadData() {
  isFallbackMode = false;
  if (adminDemoNotice) adminDemoNotice.style.display = 'none';

  try {
    const token = localStorage.getItem('chc_token');
    const apptsResponse = await fetch('/api/appointments', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (apptsResponse.ok) {
      appointments = await apptsResponse.json();
    } else {
      console.error('Failed to fetch appointments from backend API');
    }

    const doctorsResponse = await fetch('/api/doctors');
    if (doctorsResponse.ok) {
      doctors = await doctorsResponse.json();
    } else {
      console.error('Failed to fetch doctors from backend API');
    }

    const newsResponse = await fetch('/api/news');
    if (newsResponse.ok) {
      newsItems = await newsResponse.json();
    } else {
      console.error('Failed to fetch news from backend API');
    }
  } catch (err) {
    console.error('Error fetching data from API server:', err);
  }
}

// Render dynamic authentication UI elements in navigation
function renderAuthNav() {
  const navMenu = document.getElementById('nav-menu');
  if (!navMenu) return;

  const role = localStorage.getItem('chc_user_role');
  const name = localStorage.getItem('chc_user_name');

  navMenu.innerHTML = `
    <a href="index.html" class="nav-link" id="link-home">Home</a>
    <a href="admin.html" class="nav-link active" id="link-admin">Admin Dashboard</a>
    <span class="nav-link" style="color: var(--primary-color); font-weight:600;">Welcome, ${escapeHTML(name)} (${role})</span>
    <a href="#" class="nav-link" onclick="logoutUser(event)" style="font-weight:600; color:var(--danger);">Logout</a>
  `;
}

window.logoutUser = function(e) {
  if (e) e.preventDefault();
  localStorage.removeItem('chc_token');
  localStorage.removeItem('chc_user_role');
  localStorage.removeItem('chc_user_name');
  localStorage.removeItem('chc_user_email');
  localStorage.removeItem('chc_user_id');
  window.location.href = 'index.html';
};

// Setup Event listeners for Dashboard controls
function setupDashboardEvents() {
  // Filtering clicks
  filterGroup.addEventListener('click', (e) => {
    if (e.target.classList.contains('filter-btn')) {
      // Toggle active styling
      document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
      
      currentFilter = e.target.getAttribute('data-filter');
      renderTable();
    }
  });

  // Searching input
  apptSearch.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderTable();
  });

  // News publication submit (Handles both POST and PATCH based on editingNewsId)
  newsPostForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('news-title').value.trim();
    const category = document.getElementById('news-category').value;
    let image_url = document.getElementById('news-image').value.trim();
    const image_file_input = document.getElementById('news-image-file');
    const content = document.getElementById('news-content').value.trim();

    // If file is selected, read it as base64 and override image_url
    if (image_file_input && image_file_input.files && image_file_input.files[0]) {
      try {
        const file = image_file_input.files[0];
        // Validate file size (e.g. 5MB)
        if (file.size > 5 * 1024 * 1024) {
          showNewsStatus('Image file must be less than 5MB.', 'error');
          return;
        }
        image_url = await fileToBase64(file);
      } catch (fileErr) {
        console.error('Error reading image file:', fileErr);
        showNewsStatus('Error reading image file.', 'error');
        return;
      }
    }

    const payload = { title, category, image_url, content };

    try {
      if (isFallbackMode) {
        const localNews = JSON.parse(localStorage.getItem('chc_news')) || [];
        if (editingNewsId) {
          const idx = localNews.findIndex(n => n.id === editingNewsId);
          if (idx !== -1) {
            localNews[idx] = {
              ...localNews[idx],
              title,
              category,
              image_url: image_url || localNews[idx].image_url,
              content
            };
          }
          localStorage.setItem('chc_news', JSON.stringify(localNews));
          newsItems = localNews;
          showNewsStatus('News item updated (Offline fallback).', 'success');
          cancelNewsEdit();
        } else {
          const newNewsItem = {
            id: Date.now(),
            title,
            category,
            image_url: image_url || 'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=600&q=80',
            content,
            date_posted: new Date().toISOString()
          };
          localNews.push(newNewsItem);
          localStorage.setItem('chc_news', JSON.stringify(localNews));
          newsItems.push(newNewsItem);
          showNewsStatus('News announcement posted (Offline fallback).', 'success');
          newsPostForm.reset();
        }
        renderNewsManageTable();
      } else {
        const token = localStorage.getItem('chc_token');
        const url = editingNewsId ? `/api/news/${editingNewsId}` : '/api/news';
        const method = editingNewsId ? 'PATCH' : 'POST';
        
        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to publish news item.');
        }

        if (editingNewsId) {
          showNewsStatus('News item updated successfully.', 'success');
          cancelNewsEdit();
        } else {
          showNewsStatus('News announcement published successfully.', 'success');
          newsPostForm.reset();
        }
        
        // Reload news list
        const newsResponse = await fetch('/api/news');
        if (newsResponse.ok) {
          newsItems = await newsResponse.json();
        }
        renderNewsManageTable();
      }
    } catch (error) {
      console.error(error);
      showNewsStatus(error.message || 'An error occurred.', 'error');
    }
  });

  // Gallery Form submit handler
  const galleryPostForm = document.getElementById('gallery-post-form');
  if (galleryPostForm) {
    galleryPostForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const titleEn = document.getElementById('gallery-title-en').value.trim();
      const titleBn = document.getElementById('gallery-title-bn').value.trim();
      const imageFileInput = document.getElementById('gallery-image-file');
      const banner = document.getElementById('gallery-status-banner');
      
      if (!imageFileInput.files || !imageFileInput.files[0]) {
        showBanner(banner, 'Please select an image file to upload.', 'error');
        return;
      }
      
      try {
        const file = imageFileInput.files[0];
        if (file.size > 5 * 1024 * 1024) {
          showBanner(banner, 'Image file must be less than 5MB.', 'error');
          return;
        }
        
        const base64Str = await fileToBase64(file);
        const payload = {
          title_en: titleEn,
          title_bn: titleBn,
          image_url: base64Str
        };
        
        if (isFallbackMode) {
          const localGallery = JSON.parse(localStorage.getItem('chc_gallery')) || [];
          const newItem = {
            id: Date.now(),
            ...payload,
            image_url: base64Str
          };
          localGallery.push(newItem);
          localStorage.setItem('chc_gallery', JSON.stringify(localGallery));
          
          showBanner(banner, 'Photo added to gallery (Offline fallback).', 'success');
          galleryPostForm.reset();
        } else {
          const token = localStorage.getItem('chc_token');
          const response = await fetch('/api/gallery', {
            method: 'POST',
            headers: {
               'Content-Type': 'application/json',
               'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
          });
          
          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Failed to submit gallery item.');
          }
          
          showBanner(banner, 'Photo added to gallery successfully.', 'success');
          galleryPostForm.reset();
        }
      } catch (err) {
        console.error(err);
        showBanner(banner, err.message || 'An error occurred.', 'error');
      }
    });
  }

  // Doctor form submit listener (Handles both POST and PATCH)
  const doctorPostForm = document.getElementById('doctor-post-form');
  if (doctorPostForm) {
    doctorPostForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameEn = document.getElementById('doctor-name-en').value.trim();
      const nameBn = document.getElementById('doctor-name-bn').value.trim();
      const specialtyEn = document.getElementById('doctor-specialty-en').value.trim();
      const specialtyBn = document.getElementById('doctor-specialty-bn').value.trim();
      const infoEn = document.getElementById('doctor-info-en').value.trim();
      const infoBn = document.getElementById('doctor-info-bn').value.trim();
      const hoursEn = document.getElementById('doctor-hours-en').value.trim();
      const hoursBn = document.getElementById('doctor-hours-bn').value.trim();
      const imageFileInput = document.getElementById('doctor-image-file');
      const banner = document.getElementById('doctor-status-banner');

      // Weekday checkboxes selection
      const checkedBoxes = document.querySelectorAll('input[name="visiting-weekday"]:checked');
      if (checkedBoxes.length === 0) {
        showBanner(banner, 'Please select at least one visiting weekday.', 'error');
        return;
      }
      const visitingDays = Array.from(checkedBoxes).map(cb => cb.value).join(',');

      let image_url = editingDoctorId ? editingDoctorImage : '';
      if (imageFileInput.files && imageFileInput.files[0]) {
        try {
          const file = imageFileInput.files[0];
          if (file.size > 5 * 1024 * 1024) {
            showBanner(banner, 'Image file must be less than 5MB.', 'error');
            return;
          }
          image_url = await fileToBase64(file);
        } catch (fileErr) {
          console.error(fileErr);
          showBanner(banner, 'Error reading image file.', 'error');
          return;
        }
      }

      const payload = {
        name_en: nameEn,
        name_bn: nameBn,
        specialty_en: specialtyEn,
        specialty_bn: specialtyBn,
        info_en: infoEn,
        info_bn: infoBn,
        visiting_hours_en: hoursEn,
        visiting_hours_bn: hoursBn,
        image_url,
        visiting_days: visitingDays
      };

      try {
        if (isFallbackMode) {
          const localDocs = JSON.parse(localStorage.getItem('chc_doctors')) || [];
          if (editingDoctorId) {
            const idx = localDocs.findIndex(d => d.id === editingDoctorId);
            if (idx !== -1) {
              localDocs[idx] = {
                ...localDocs[idx],
                ...payload,
                image_url: image_url || localDocs[idx].image_url
              };
            }
            localStorage.setItem('chc_doctors', JSON.stringify(localDocs));
            doctors = localDocs;
            showBanner(banner, 'Doctor record updated (Offline fallback).', 'success');
            cancelDoctorEdit();
          } else {
            const newDoc = {
              id: Date.now(),
              ...payload,
              image_url: image_url || 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=600&q=80'
            };
            localDocs.push(newDoc);
            localStorage.setItem('chc_doctors', JSON.stringify(localDocs));
            doctors.push(newDoc);
            showBanner(banner, 'Doctor added successfully (Offline fallback).', 'success');
            doctorPostForm.reset();
          }
          renderDoctorsManageTable();
        } else {
          const token = localStorage.getItem('chc_token');
          const url = editingDoctorId ? `/api/doctors/${editingDoctorId}` : '/api/doctors';
          const method = editingDoctorId ? 'PATCH' : 'POST';

          const response = await fetch(url, {
            method,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Failed to save doctor record.');
          }

          if (editingDoctorId) {
            showBanner(banner, 'Doctor record updated successfully.', 'success');
            cancelDoctorEdit();
          } else {
            showBanner(banner, 'Doctor added successfully.', 'success');
            doctorPostForm.reset();
          }

          // Reload doctor list
          const docsResponse = await fetch('/api/doctors');
          if (docsResponse.ok) {
            doctors = await docsResponse.json();
          }
          renderDoctorsManageTable();
        }
      } catch (err) {
        console.error(err);
        showBanner(banner, err.message || 'An error occurred.', 'error');
      }
    });
  }

  // Change Password submit
  const changePasswordForm = document.getElementById('change-password-form');
  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPassword = document.getElementById('current-password').value;
      const newPassword = document.getElementById('new-password').value;

      try {
        if (isFallbackMode) {
          showPasswordStatus('Change Password endpoint unavailable in offline fallback mode.', 'error');
        } else {
          const token = localStorage.getItem('chc_token');
          const response = await fetch('/api/auth/change-password', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ currentPassword, newPassword })
          });

          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Failed to change password.');
          }

          showPasswordStatus('Password updated successfully.', 'success');
          changePasswordForm.reset();
        }
      } catch (error) {
        console.error(error);
        showPasswordStatus(error.message || 'An error occurred.', 'error');
      }
    });
  }
}

function showBanner(element, message, type) {
  if (!element) return;
  element.textContent = message;
  element.className = `status-banner ${type}`;
  element.style.display = 'block';
  setTimeout(() => {
    element.style.display = 'none';
  }, 6000);
}

// Render metrics panels & run table populate
function renderDashboard() {
  const total = appointments.length;
  const pending = appointments.filter(a => a.status === 'pending').length;
  const approved = appointments.filter(a => a.status === 'approved').length;

  statTotal.textContent = total;
  statPending.textContent = pending;
  statApproved.textContent = approved;

  renderTable();
}

// Render table records based on filter and search queries
function renderTable() {
  apptTbody.innerHTML = '';

  // Filter and search logic
  const filtered = appointments.filter(appt => {
    if (currentFilter !== 'all' && appt.status !== currentFilter) {
      return false;
    }
    
    if (searchQuery !== '') {
      const nameMatch = appt.patient_name.toLowerCase().includes(searchQuery);
      const phoneMatch = appt.phone.includes(searchQuery);
      return nameMatch || phoneMatch;
    }
    
    return true;
  });

  if (filtered.length === 0) {
    apptTbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem 0;">
          No matching appointments found.
        </td>
      </tr>
    `;
    return;
  }

  // Populate row items
  filtered.forEach(appt => {
    const row = document.createElement('tr');

    const formattedDate = new Date(appt.appointment_date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    const isPending = appt.status === 'pending';
    const isApproved = appt.status === 'approved';
    const isCancelled = appt.status === 'cancelled';

    let docName = 'Any Available Doctor';
    if (appt.doctor_name_en) {
      docName = appt.doctor_name_en;
    } else if (appt.doctor_id) {
      const d = doctors.find(doc => doc.id === appt.doctor_id);
      if (d) docName = d.name_en;
    }

    row.innerHTML = `
      <td>
        <strong style="font-size: 0.9rem; color: var(--text-dark);">${escapeHTML(appt.patient_name)}</strong>
        ${appt.notes ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Note: <em>${escapeHTML(appt.notes)}</em></div>` : ''}
      </td>
      <td>
        <div>${escapeHTML(appt.email)}</div>
        <div style="color: var(--text-muted); font-size: 0.8rem; margin-top: 0.15rem;">${escapeHTML(appt.phone)}</div>
      </td>
      <td>
        <div>${formattedDate}</div>
        <div style="font-weight: 600; color: var(--primary-color); font-size: 0.8rem; margin-top: 0.15rem;">${appt.appointment_time}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">Doctor: <strong>${escapeHTML(docName)}</strong></div>
      </td>
      <td>
        <span class="badge ${appt.status}">${appt.status}</span>
      </td>
      <td>
        <div class="action-btns">
          <button class="btn-sm approve" onclick="updateStatus(${appt.id}, 'approved')" ${isApproved ? 'disabled' : ''}>Approve</button>
          <button class="btn-sm cancel" onclick="updateStatus(${appt.id}, 'cancelled')" ${isCancelled ? 'disabled' : ''}>Cancel</button>
        </div>
      </td>
    `;

    apptTbody.appendChild(row);
  });
}

// Update Appointment status action
window.updateStatus = async function(id, newStatus) {
  try {
    if (isFallbackMode) {
      const localAppts = JSON.parse(localStorage.getItem('chc_appointments')) || [];
      const apptIdx = localAppts.findIndex(a => a.id === id);
      if (apptIdx !== -1) {
        localAppts[apptIdx].status = newStatus;
        localStorage.setItem('chc_appointments', JSON.stringify(localAppts));
      }

      const stateIdx = appointments.findIndex(a => a.id === id);
      if (stateIdx !== -1) {
        appointments[stateIdx].status = newStatus;
      }
      
      showApptStatus(`Appointment status updated to ${newStatus.toUpperCase()} (Saved locally).`, 'success');
    } else {
      const token = localStorage.getItem('chc_token');
      const response = await fetch(`/api/appointments/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to update status.');
      }

      const stateIdx = appointments.findIndex(a => a.id === id);
      if (stateIdx !== -1) {
        appointments[stateIdx].status = newStatus;
      }

      showApptStatus(`Appointment status updated to ${newStatus.toUpperCase()} successfully.`, 'success');
    }

    renderDashboard();
  } catch (err) {
    console.error(err);
    showApptStatus(err.message || 'Error occurred updating appointment status.', 'error');
  }
};

// Render News Management table
function renderNewsManageTable() {
  const tbody = document.getElementById('news-manage-tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  if (newsItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 1rem 0;">No news items published.</td>
      </tr>
    `;
    return;
  }
  
  newsItems.forEach(item => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <strong style="color: var(--text-dark);">${escapeHTML(item.title)}</strong>
      </td>
      <td>
        <span class="badge ${item.category.toLowerCase()}">${escapeHTML(item.category)}</span>
      </td>
      <td>
        <button class="news-action-btn edit" onclick="editNews(${item.id})">Edit</button>
        <button class="news-action-btn delete" onclick="deleteNews(${item.id})">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// News Edit Actions
window.editNews = function(id) {
  const item = newsItems.find(n => n.id === id);
  if (!item) return;
  
  editingNewsId = id;
  document.getElementById('news-title').value = item.title;
  document.getElementById('news-category').value = item.category;
  document.getElementById('news-image').value = item.image_url.startsWith('data:') ? '' : item.image_url;
  document.getElementById('news-content').value = item.content;
  
  document.getElementById('news-submit-btn').textContent = 'Update Announcement';
  document.getElementById('news-cancel-edit-btn').style.display = 'inline-block';
  
  newsPostForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

window.cancelNewsEdit = function() {
  editingNewsId = null;
  newsPostForm.reset();
  document.getElementById('news-submit-btn').textContent = 'Publish Announcement';
  document.getElementById('news-cancel-edit-btn').style.display = 'none';
};

// News Delete Actions
window.deleteNews = async function(id) {
  if (!confirm('Are you sure you want to delete this news item?')) return;
  
  try {
    if (isFallbackMode) {
      newsItems = newsItems.filter(n => n.id !== id);
      localStorage.setItem('chc_news', JSON.stringify(newsItems));
      showNewsStatus('News item deleted (Offline fallback).', 'success');
      renderNewsManageTable();
    } else {
      const token = localStorage.getItem('chc_token');
      const response = await fetch(`/api/news/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to delete news item');
      }
      
      newsItems = newsItems.filter(n => n.id !== id);
      showNewsStatus('News item deleted successfully.', 'success');
      renderNewsManageTable();
    }
  } catch (err) {
    console.error(err);
    showNewsStatus(err.message || 'Error deleting news item.', 'error');
  }
};

// Render Doctors Management table
function renderDoctorsManageTable() {
  const tbody = document.getElementById('doctors-manage-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (doctors.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 1rem 0;">No doctors registered.</td>
      </tr>
    `;
    return;
  }

  doctors.forEach(doc => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <strong style="color: var(--text-dark);">${escapeHTML(doc.name_en)}</strong>
        <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHTML(doc.name_bn)}</div>
      </td>
      <td>
        <div>${escapeHTML(doc.specialty_en)}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHTML(doc.specialty_bn)}</div>
      </td>
      <td>
        <button class="news-action-btn edit" onclick="editDoctor(${doc.id})">Edit</button>
        <button class="news-action-btn delete" onclick="deleteDoctor(${doc.id})">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// Doctor Edit Actions
window.editDoctor = function(id) {
  const doc = doctors.find(d => d.id === id);
  if (!doc) return;

  editingDoctorId = id;
  editingDoctorImage = doc.image_url;
  document.getElementById('doctor-name-en').value = doc.name_en;
  document.getElementById('doctor-name-bn').value = doc.name_bn;
  document.getElementById('doctor-specialty-en').value = doc.specialty_en;
  document.getElementById('doctor-specialty-bn').value = doc.specialty_bn;
  document.getElementById('doctor-info-en').value = doc.info_en || '';
  document.getElementById('doctor-info-bn').value = doc.info_bn || '';
  document.getElementById('doctor-hours-en').value = doc.visiting_hours_en;
  document.getElementById('doctor-hours-bn').value = doc.visiting_hours_bn;

  // Reset and select checkboxes
  document.querySelectorAll('input[name="visiting-weekday"]').forEach(cb => cb.checked = false);
  if (doc.visiting_days) {
    const days = doc.visiting_days.split(',');
    days.forEach(day => {
      const cb = document.querySelector(`input[name="visiting-weekday"][value="${day}"]`);
      if (cb) cb.checked = true;
    });
  }

  document.getElementById('doctor-submit-btn').textContent = 'Update Doctor';
  document.getElementById('doctor-cancel-edit-btn').style.display = 'inline-block';

  document.getElementById('doctor-post-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

window.cancelDoctorEdit = function() {
  editingDoctorId = null;
  editingDoctorImage = '';
  document.getElementById('doctor-post-form').reset();
  document.querySelectorAll('input[name="visiting-weekday"]').forEach(cb => cb.checked = false);
  document.getElementById('doctor-submit-btn').textContent = 'Add Doctor';
  document.getElementById('doctor-cancel-edit-btn').style.display = 'none';
};

// Doctor Delete Actions
window.deleteDoctor = async function(id) {
  if (!confirm('Are you sure you want to delete this doctor? All appointments associated with them will lose connection.')) return;

  try {
    if (isFallbackMode) {
      doctors = doctors.filter(d => d.id !== id);
      localStorage.setItem('chc_doctors', JSON.stringify(doctors));
      showBanner(document.getElementById('doctor-status-banner'), 'Doctor deleted (Offline fallback).', 'success');
      renderDoctorsManageTable();
    } else {
      const token = localStorage.getItem('chc_token');
      const response = await fetch(`/api/doctors/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to delete doctor record.');
      }

      doctors = doctors.filter(d => d.id !== id);
      showBanner(document.getElementById('doctor-status-banner'), 'Doctor deleted successfully.', 'success');
      renderDoctorsManageTable();
    }
  } catch (err) {
    console.error(err);
    showBanner(document.getElementById('doctor-status-banner'), err.message || 'Error deleting doctor.', 'error');
  }
};

// Messaging display components
function showNewsStatus(message, type) {
  newsStatusBanner.textContent = message;
  newsStatusBanner.className = `status-banner ${type}`;
  newsStatusBanner.style.display = 'block';
  setTimeout(() => {
    newsStatusBanner.style.display = 'none';
  }, 5000);
}

function showApptStatus(message, type) {
  apptStatusBanner.textContent = message;
  apptStatusBanner.className = `status-banner ${type}`;
  apptStatusBanner.style.display = 'block';
  setTimeout(() => {
    apptStatusBanner.style.display = 'none';
  }, 5000);
}

function showPasswordStatus(message, type) {
  const passwordStatusBanner = document.getElementById('password-status-banner');
  if (passwordStatusBanner) {
    passwordStatusBanner.textContent = message;
    passwordStatusBanner.className = `status-banner ${type}`;
    passwordStatusBanner.style.display = 'block';
    setTimeout(() => {
      passwordStatusBanner.style.display = 'none';
    }, 5000);
  }
}

// File to Base64 Promise Helper
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
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

// --- STAFF MANAGEMENT FUNCTIONS ---
let staffMembers = [];

async function loadStaffAndRender() {
  const tbody = document.getElementById('staff-manage-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1rem 0;">Loading staff accounts...</td></tr>';
  
  try {
    if (isFallbackMode) {
      staffMembers = JSON.parse(localStorage.getItem('chc_staff_members')) || [];
    } else {
      const token = localStorage.getItem('chc_token');
      const response = await fetch('/api/admin/staff', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        staffMembers = await response.json();
      } else {
        throw new Error('Failed to fetch staff registry.');
      }
    }
    renderStaffTable();
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--danger); padding: 1rem 0;">Failed to load staff list.</td></tr>';
  }
}

function renderStaffTable() {
  const tbody = document.getElementById('staff-manage-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  if (staffMembers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1rem 0;">No staff members registered.</td></tr>';
    return;
  }
  
  staffMembers.forEach(member => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong style="color: var(--text-dark);">${escapeHTML(member.username)}</strong></td>
      <td>${escapeHTML(member.email)}</td>
      <td><span class="badge" style="background: var(--primary-light); color: var(--primary-color);">${escapeHTML(member.permissions)}</span></td>
      <td>
        <button class="news-action-btn delete" onclick="deleteStaff(${member.id})">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function setupStaffDashboardEvents() {
  const form = document.getElementById('staff-create-form');
  if (!form) return;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('staff-username').value.trim();
    const email = document.getElementById('staff-email').value.trim().toLowerCase();
    const password = document.getElementById('staff-password').value;
    const permissions = document.getElementById('staff-permissions').value;
    
    const banner = document.getElementById('staff-status-banner');
    
    try {
      if (isFallbackMode) {
        const newStaff = { id: Date.now(), username, email, permissions };
        staffMembers.push(newStaff);
        localStorage.setItem('chc_staff_members', JSON.stringify(staffMembers));
        showBanner(banner, 'Staff member added (Offline fallback).', 'success');
        form.reset();
        renderStaffTable();
      } else {
        const token = localStorage.getItem('chc_token');
        const response = await fetch('/api/admin/staff', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ username, email, password, permissions })
        });
        
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to add staff member.');
        }
        
        showBanner(banner, 'Staff member registered successfully.', 'success');
        form.reset();
        await loadStaffAndRender();
      }
    } catch (err) {
      console.error(err);
      showBanner(banner, err.message || 'Error registering staff.', 'error');
    }
  });
}

window.deleteStaff = async function(id) {
  if (!confirm('Are you sure you want to delete this staff member?')) return;
  const banner = document.getElementById('staff-status-banner');
  
  try {
    if (isFallbackMode) {
      staffMembers = staffMembers.filter(s => s.id !== id);
      localStorage.setItem('chc_staff_members', JSON.stringify(staffMembers));
      showBanner(banner, 'Staff member deleted (Offline fallback).', 'success');
      renderStaffTable();
    } else {
      const token = localStorage.getItem('chc_token');
      const response = await fetch(`/api/admin/staff/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to delete staff member.');
      }
      
      showBanner(banner, 'Staff member deleted successfully.', 'success');
      await loadStaffAndRender();
    }
  } catch (err) {
    console.error(err);
    showBanner(banner, err.message || 'Error deleting staff member.', 'error');
  }
};

function applyStaffPermissionsFilter() {
  const role = localStorage.getItem('chc_user_role');
  const permissions = localStorage.getItem('chc_user_permissions');
  if (role === 'Staff') {
    if (permissions === 'news') {
      const docForm = document.getElementById('doctor-post-form');
      if (docForm) {
        const panel = docForm.closest('.panel');
        if (panel) panel.style.display = 'none';
      }
      const docTable = document.getElementById('doctors-manage-tbody');
      if (docTable) {
        const panel = docTable.closest('.panel');
        if (panel) panel.style.display = 'none';
      }
    } else if (permissions === 'doctors') {
      const newsForm = document.getElementById('news-post-form');
      if (newsForm) {
        const panel = newsForm.closest('.panel');
        if (panel) panel.style.display = 'none';
      }
      const newsTable = document.getElementById('news-manage-tbody');
      if (newsTable) {
        const panel = newsTable.closest('.panel');
        if (panel) panel.style.display = 'none';
      }
      const galleryForm = document.getElementById('gallery-post-form');
      if (galleryForm) {
        const panel = galleryForm.closest('.panel');
        if (panel) panel.style.display = 'none';
      }
    }
  }
}
