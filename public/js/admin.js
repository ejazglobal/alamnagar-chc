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
let galleryItems = [];
let editingGalleryId = null;

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

  if (!token || (role !== 'Admin' && role !== 'Staff' && role !== 'Observer')) {
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
  renderGalleryManageTable();
  
  if (role === 'Admin') {
    const staffSec = document.getElementById('admin-staff-section');
    if (staffSec) staffSec.style.display = 'block';
    setupStaffDashboardEvents();
    await loadStaffAndRender();
  }
  applyStaffPermissionsFilter();
}

// Load Appointments, News, Doctors, Gallery
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

    const galleryResponse = await fetch('/api/gallery');
    if (galleryResponse.ok) {
      galleryItems = await galleryResponse.json();
    } else {
      console.error('Failed to fetch gallery items from backend API');
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
  localStorage.removeItem('chc_user_phone');
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

  // Gallery Form submit handler (handles both Add and Edit)
  const galleryUploadForm = document.getElementById('gallery-upload-form');
  if (galleryUploadForm) {
    galleryUploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const titleEn = document.getElementById('gallery-title-en').value.trim();
      const titleBn = document.getElementById('gallery-title-bn').value.trim();
      const imageFileInput = document.getElementById('gallery-image-file');
      const banner = document.getElementById('gallery-status-banner');
      
      let image_url = '';
      
      // If we are editing, we can keep the old image if no new file is uploaded
      if (editingGalleryId) {
        const currentItem = galleryItems.find(g => g.id === editingGalleryId);
        if (currentItem) {
          image_url = currentItem.image_url;
        }
      }

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

      if (!image_url) {
        showBanner(banner, 'Please select an image file to upload.', 'error');
        return;
      }

      const payload = {
        title_en: titleEn,
        title_bn: titleBn,
        image_url
      };

      try {
        const token = localStorage.getItem('chc_token');
        const url = editingGalleryId ? `/api/gallery/${editingGalleryId}` : '/api/gallery';
        const method = editingGalleryId ? 'PATCH' : 'POST';

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
          throw new Error(errData.error || 'Failed to save gallery item.');
        }

        showBanner(banner, editingGalleryId ? 'Gallery item updated successfully.' : 'Photo added to gallery successfully.', 'success');
        
        cancelGalleryEdit();

        // Reload gallery list
        const galleryResponse = await fetch('/api/gallery');
        if (galleryResponse.ok) {
          galleryItems = await galleryResponse.json();
        }
        renderGalleryManageTable();
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

      const usernameInput = document.getElementById('doctor-username');
      const passwordInput = document.getElementById('doctor-password');
      const loginUsername = usernameInput ? usernameInput.value.trim() : '';
      const loginPassword = passwordInput ? passwordInput.value : '';

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
        visiting_days: visitingDays,
        login_username: loginUsername,
        login_password: loginPassword
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

  const role = localStorage.getItem('chc_user_role');
  const isObserver = role === 'Observer';

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
        <div>${escapeHTML(appt.email || '')}</div>
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
        <div class="action-btns" style="display: flex; flex-direction: column; gap: 0.4rem;">
          ${!isObserver ? `
          <div style="display: flex; gap: 0.2rem; width: 100%;">
            <button class="btn-sm approve" style="flex: 1;" onclick="updateStatus(${appt.id}, 'approved')" ${isApproved || isCancelled || appt.status === 'completed' ? 'disabled' : ''}>Approve</button>
            <button class="btn-sm cancel" style="flex: 1;" onclick="updateStatus(${appt.id}, 'cancelled')" ${isCancelled || appt.status === 'completed' ? 'disabled' : ''}>Cancel</button>
          </div>
          ` : ''}
          <div style="display: flex; gap: 0.2rem; width: 100%;">
            <button class="btn-sm" style="flex: 1; background: var(--accent-color); color: white;" onclick="viewPatientReports('${appt.phone}', '${escapeHTML(appt.patient_name)}')">📂 Reports</button>
            <button class="btn-sm" style="flex: 1; background: var(--primary-color); color: white;" onclick="viewPrescription(${appt.id})" ${appt.status !== 'completed' ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>👁 Rx</button>
          </div>
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

  // Hide login fields when editing
  const authFields = document.getElementById('doctor-auth-fields');
  if (authFields) authFields.style.display = 'none';

  document.getElementById('doctor-post-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

window.cancelDoctorEdit = function() {
  editingDoctorId = null;
  editingDoctorImage = '';
  document.getElementById('doctor-post-form').reset();
  document.querySelectorAll('input[name="visiting-weekday"]').forEach(cb => cb.checked = false);
  document.getElementById('doctor-submit-btn').textContent = 'Add Doctor';
  document.getElementById('doctor-cancel-edit-btn').style.display = 'none';
  
  // Show login fields when adding new
  const authFields = document.getElementById('doctor-auth-fields');
  if (authFields) authFields.style.display = 'block';
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
  if (role === 'Observer') {
    const panelsToHide = [
      'news-post-form',
      'news-manage-tbody',
      'doctor-post-form',
      'doctors-manage-tbody',
      'gallery-upload-form',
      'gallery-manage-tbody',
      'admin-staff-section',
      'change-password-form'
    ];
    panelsToHide.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        const panel = el.closest('.panel') || el.closest('section');
        if (panel) panel.style.display = 'none';
      }
    });
    const heroP = document.querySelector('.hero-content p');
    if (heroP) heroP.textContent = 'Browse patient appointments, view clinical prescriptions, and read investigation reports.';
    const heroH1 = document.querySelector('.hero-content h1');
    if (heroH1) heroH1.textContent = 'Healthcare Observer Console';
  } else if (role === 'Staff') {
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

// General status banner display helper
function showBanner(banner, message, type) {
  if (!banner) return;
  banner.textContent = message;
  banner.className = `status-banner ${type}`;
  banner.style.display = 'block';
  setTimeout(() => {
    banner.style.display = 'none';
  }, 5000);
}

// Render Gallery Management table
function renderGalleryManageTable() {
  const tbody = document.getElementById('gallery-manage-tbody');
  if (!tbody) return;

  if (galleryItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 1.5rem 0;">No gallery items found.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = galleryItems.map(item => `
    <tr>
      <td>
        <img src="${escapeHTML(item.image_url)}" style="width: 60px; height: 45px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border-color);" alt="Preview">
      </td>
      <td>
        <div style="font-weight: 600; color: var(--text-dark);">${escapeHTML(item.title_en || 'Untitled (EN)')}</div>
        <div style="font-size: 0.85rem; color: var(--text-muted);">${escapeHTML(item.title_bn || 'Untitled (BN)')}</div>
      </td>
      <td>
        <button class="news-action-btn edit" onclick="editGalleryItem(${item.id})">Edit</button>
        <button class="news-action-btn delete" onclick="deleteGalleryItem(${item.id})">Delete</button>
      </td>
    </tr>
  `).join('');
}

window.editGalleryItem = function(id) {
  const item = galleryItems.find(g => g.id === id);
  if (!item) return;

  editingGalleryId = id;
  document.getElementById('gallery-edit-id').value = id;
  document.getElementById('gallery-title-en').value = item.title_en || '';
  document.getElementById('gallery-title-bn').value = item.title_bn || '';
  
  // Update UI buttons
  document.getElementById('gallery-submit-btn').textContent = 'Update Gallery Item';
  document.getElementById('gallery-cancel-edit-btn').style.display = 'inline-block';
  
  // Image is optional when editing
  document.getElementById('gallery-image-label').textContent = 'Update Image File (Optional)';
  document.getElementById('gallery-image-help').textContent = 'Leave empty to keep the existing image.';
  
  // Scroll to form
  document.getElementById('gallery-upload-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

window.cancelGalleryEdit = function() {
  editingGalleryId = null;
  document.getElementById('gallery-edit-id').value = '';
  document.getElementById('gallery-upload-form').reset();
  
  document.getElementById('gallery-submit-btn').textContent = 'Upload to Gallery';
  document.getElementById('gallery-cancel-edit-btn').style.display = 'none';
  
  document.getElementById('gallery-image-label').textContent = 'Image File *';
  document.getElementById('gallery-image-help').textContent = 'Select local image file to upload.';
};

window.deleteGalleryItem = async function(id) {
  if (!confirm('Are you sure you want to delete this gallery image?')) return;
  const banner = document.getElementById('gallery-status-banner');
  
  try {
    const token = localStorage.getItem('chc_token');
    const response = await fetch(`/api/gallery/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || 'Failed to delete gallery item.');
    }

    showBanner(banner, 'Gallery item deleted successfully.', 'success');
    
    // Reload gallery items
    const galleryResponse = await fetch('/api/gallery');
    if (galleryResponse.ok) {
      galleryItems = await galleryResponse.json();
    }
    renderGalleryManageTable();
  } catch (err) {
    console.error(err);
    showBanner(banner, err.message || 'Error deleting gallery item.', 'error');
  }
};

// --- VIEW PATIENT REPORTS & PRESCRIPTIONS MODALS ---
window.viewPatientReports = async function(phone, patientName) {
  const modal = document.getElementById('admin-reports-modal');
  const container = document.getElementById('admin-reports-list');
  if (!modal || !container) return;

  container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">Loading patient reports...</div>';
  modal.style.display = 'flex';

  try {
    const token = localStorage.getItem('chc_token');
    const res = await fetch(`/api/reports/${encodeURIComponent(phone)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      const reports = await res.json();
      if (reports.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No investigation reports uploaded for ${escapeHTML(patientName)} (Mob: ${escapeHTML(phone)}).</div>`;
        return;
      }

      container.innerHTML = reports.map(r => {
        const isPdf = r.file_url && /\.pdf$/i.test(r.file_url);
        const isImage = r.file_url && /\.(png|jpg|jpeg|gif|webp)$/i.test(r.file_url);
        const viewLabel = isPdf ? '📄 View PDF' : isImage ? '🖼 View Image' : '👁 View Document';
        
        let findingsHtml = '';
        if (r.findings) {
          try {
            const list = typeof r.findings === 'string' ? JSON.parse(r.findings) : r.findings;
            if (list && list.length > 0) {
              findingsHtml = `
                <div style="margin-top: 0.5rem; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 0.5rem; font-size: 0.8rem;">
                  <div style="font-weight: 700; color: var(--text-dark); text-transform: uppercase; font-size: 0.7rem; margin-bottom: 0.25rem;">Lab Findings:</div>
                  ${list.map(f => `
                    <div style="display:flex; justify-content:space-between; margin-bottom: 0.15rem;">
                      <span><strong>${escapeHTML(f.parameter)}</strong>: ${escapeHTML(f.value)}</span>
                      <span style="font-weight: 700; color: ${f.status === 'High' ? 'var(--danger)' : f.status === 'Low' ? 'var(--accent-color)' : 'var(--success)'};">${escapeHTML(f.status || 'Normal')}</span>
                    </div>
                  `).join('')}
                </div>
              `;
            }
          } catch(e) {
            console.warn(e);
          }
        }

        return `
          <div style="border: 1px solid var(--border-color); border-radius: var(--radius); padding: 1.15rem; margin-bottom: 1rem; background: #f8fafc; display: flex; flex-direction: column; gap: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 600; color: var(--text-dark);">${escapeHTML(r.description || 'Investigation Report')}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">Uploaded: ${new Date(r.upload_date).toLocaleDateString()} by ${escapeHTML(r.uploader_role)}</div>
              </div>
              <a href="${r.file_url}" target="_blank" class="btn" style="width: auto; padding: 0.4rem 0.8rem; text-decoration: none; font-size: 0.75rem;">${viewLabel}</a>
            </div>
            ${findingsHtml}
          </div>
        `;
      }).join('');
    } else {
      container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--danger);">Failed to load patient reports.</div>';
    }
  } catch (err) {
    console.error(err);
    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--danger);">Network error loading reports.</div>';
  }
};

window.closeAdminReportsModal = function(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close')) return;
  const modal = document.getElementById('admin-reports-modal');
  if (modal) modal.style.display = 'none';
};

window.viewPrescription = async function(appointmentId) {
  const modal = document.getElementById('admin-prescription-modal');
  const container = document.getElementById('admin-prescription-details');
  if (!modal || !container) return;

  container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">Loading prescription details...</div>';
  modal.style.display = 'flex';

  try {
    const token = localStorage.getItem('chc_token');
    
    // Fetch full appointment & prescription details
    const res = await fetch(`/api/share/prescription/${appointmentId}/verify`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` 
      },
      body: JSON.stringify({ otp: 'bypass' }) // Admin/Staff bypass verification OTP
    });

    if (res.ok) {
      const data = await res.json();
      const visit = data.prescription;

      if (!visit || !visit.prescription_id) {
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No prescription saved for this appointment.</div>';
        return;
      }

      window.currentAdminPrescription = visit;

      // Render prescription nicely
      let medsList = [];
      try {
        medsList = typeof visit.medicines === 'string' ? JSON.parse(visit.medicines) : visit.medicines;
      } catch (e) {
        console.warn(e);
      }

      let vitalsHtml = '';
      if (visit.bp || visit.temperature || visit.pulse) {
        vitalsHtml = `
          <div style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 0.5rem; display: flex; gap: 1rem; font-size: 0.8rem; color: var(--text-muted);">
            ${visit.bp ? `<span><strong>B.P:</strong> ${escapeHTML(visit.bp)}</span>` : ''}
            ${visit.temperature ? `<span><strong>Temp:</strong> ${escapeHTML(visit.temperature)} °F</span>` : ''}
            ${visit.pulse ? `<span><strong>Pulse:</strong> ${escapeHTML(visit.pulse)} bpm</span>` : ''}
          </div>
        `;
      }

      let signatureHtml = '';
      if (visit.doctor_signature) {
        signatureHtml = `
          <div style="margin-top: 1.5rem; text-align: right;">
            <img src="${visit.doctor_signature}" alt="Doctor Signature" style="max-height: 50px; display: inline-block;">
            <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">Dr. ${escapeHTML((visit.doctor_name || '').replace(/^Dr\.\s+/i, ''))}</div>
          </div>
        `;
      }

      container.innerHTML = `
        <div style="display: flex; justify-content: space-between; border-bottom: 2px solid var(--primary-color); padding-bottom: 0.5rem; margin-bottom: 1rem;">
          <div>
            <h4 style="margin: 0; color: var(--primary-hover); font-size: 1.1rem;">Alamnagar CHC</h4>
            <span style="font-size: 0.75rem; color: var(--text-muted);">Charitable Healthcare Centre</span>
          </div>
          <div style="text-align: right; font-size: 0.8rem; color: var(--text-muted);">
            <div><strong>Date:</strong> ${new Date(visit.appointment_date).toLocaleDateString()}</div>
            <div><strong>Doctor:</strong> Dr. ${escapeHTML((visit.doctor_name || 'Sarah Rahman').replace(/^Dr\.\s+/i, ''))}</div>
          </div>
        </div>

        <div style="background: #f8fafc; padding: 0.75rem; border-radius: 6px; font-size: 0.85rem; margin-bottom: 1rem; border: 1px solid var(--border-color); display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 0.5rem;">
          <div><strong>Patient:</strong> ${escapeHTML(visit.patient_name)}</div>
          <div><strong>Age:</strong> ${escapeHTML(visit.age || 'N/A')}</div>
          <div><strong>Gender:</strong> ${escapeHTML(visit.gender || 'N/A')}</div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 1.5rem;">
          <div style="border-right: 1px solid var(--border-color); padding-right: 1rem;">
            <h5 style="margin: 0 0 0.5rem 0; color: var(--primary-hover); font-size: 0.85rem; text-transform: uppercase;">Observations</h5>
            <p style="font-size: 0.85rem; color: var(--text-dark); margin: 0 0 1rem 0;">${escapeHTML(visit.observations || 'None')}</p>

            <h5 style="margin: 0 0 0.5rem 0; color: var(--primary-hover); font-size: 0.85rem; text-transform: uppercase;">Diagnostics</h5>
            <p style="font-size: 0.85rem; color: var(--text-dark); margin: 0;">${escapeHTML(visit.diagnostics || 'None')}</p>
          </div>
          <div>
            <h5 style="margin: 0 0 0.5rem 0; color: var(--primary-hover); font-size: 0.85rem; text-transform: uppercase;">Rx (Medicines)</h5>
            <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
              <thead>
                <tr style="border-bottom: 2px solid var(--border-color); text-align: left; color: var(--text-muted);">
                  <th style="padding: 0.25rem 0;">Name</th>
                  <th style="padding: 0.25rem 0;">Dosage</th>
                  <th style="padding: 0.25rem 0;">Timing</th>
                  <th style="padding: 0.25rem 0;">Duration</th>
                </tr>
              </thead>
              <tbody>
                ${medsList.map(m => `
                  <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 0.4rem 0;"><strong>${escapeHTML(m.name)}</strong></td>
                    <td style="padding: 0.4rem 0;">${escapeHTML(m.dosage)}</td>
                    <td style="padding: 0.4rem 0;">${escapeHTML(m.timing)}</td>
                    <td style="padding: 0.4rem 0;">${escapeHTML(m.duration)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        ${vitalsHtml}
        ${signatureHtml}
      `;
    } else {
      container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--danger);">Failed to load prescription details.</div>';
    }
  } catch (err) {
    console.error(err);
    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--danger);">Network error loading prescription.</div>';
  }
};

window.closeAdminPrescriptionModal = function(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close')) return;
  const modal = document.getElementById('admin-prescription-modal');
  if (modal) modal.style.display = 'none';
};

window.printAdminPrescription = function() {
  if (!window.AndroidPrint && (window.Capacitor || /wv|WebView|Android.*Version\/[0-9.]+/i.test(navigator.userAgent))) {
    alert("Printing directly from this version of the Android App is not supported. Please install the updated app build, or open the portal in your phone's web browser (like Google Chrome) to print.");
    return;
  }
  const p = window.currentAdminPrescription;
  if (!p) return alert('No prescription loaded to print.');

  let medsList = [];
  try {
    medsList = typeof p.medicines === 'string' ? JSON.parse(p.medicines) : p.medicines;
    if (!Array.isArray(medsList)) medsList = [];
  } catch (e) {
    console.warn(e);
  }

  const formattedDate = new Date(p.appointment_date || p.created_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric'
  });

  const obs = p.observations || 'None';
  const diags = p.diagnostics || 'None';
  
  let diagsHtml = '';
  if (diags && diags.toLowerCase() !== 'none') {
    const list = diags.split(/[\n,;]+/).map(item => item.trim()).filter(Boolean);
    diagsHtml = list.map(item => `<li>${escapeHTML(item)}</li>`).join('');
  } else {
    diagsHtml = '<li>None recommended</li>';
  }

  let vitalsHtml = '';
  if (p.bp || p.temperature || p.pulse) {
    let items = [];
    if (p.bp) {
      const bpFormatted = p.bp.toLowerCase().includes('mmhg') ? p.bp : `${p.bp} mmHg`;
      items.push(`<div><strong>B.P:</strong> ${escapeHTML(bpFormatted)}</div>`);
    }
    if (p.temperature) {
      const tempFormatted = p.temperature.toLowerCase().includes('°') || p.temperature.toLowerCase().includes('f') ? p.temperature : `${p.temperature} °F`;
      items.push(`<div><strong>Temperature:</strong> ${escapeHTML(tempFormatted)}</div>`);
    }
    if (p.pulse) {
      const pulseFormatted = p.pulse.toLowerCase().includes('bpm') ? p.pulse : `${p.pulse} bpm`;
      items.push(`<div><strong>Pulse:</strong> ${escapeHTML(pulseFormatted)}</div>`);
    }
    vitalsHtml = `
      <div style="margin-top: 1.2rem;">
        <div style="font-size: 0.75rem; font-weight: 700; color: #0d9488; letter-spacing: 0.5px; margin-bottom: 0.5rem; text-transform: uppercase;">PHYSICAL OBSERVATIONS</div>
        <div style="font-size: 0.85rem; line-height: 1.5; color: #334155; margin-top: 0.25rem;">
          ${items.join('')}
        </div>
      </div>
    `;
  }

  let signatureHtml = '';
  if (p.doctor_signature) {
    signatureHtml = `<img src="${p.doctor_signature}" alt="Signature" style="max-height: 50px; display: inline-block;">`;
  }

  const docName = p.doctor_name || 'Sarah Rahman';
  const docSpecialty = p.doctor_specialty || 'General Physician';
  const docHours = p.doctor_visiting_hours || 'Sat, Mon, Wed (03:00 PM - 07:00 PM)';

  const content = `
    <html>
      <head>
        <title>Prescription Print</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 2.5rem; line-height: 1.5; color: #0f172a; }
          .print-header { display: flex; justify-content: space-between; border-bottom: 2px solid #0d9488; padding-bottom: 0.75rem; margin-bottom: 0.75rem; }
          .print-logo-section { display: flex; align-items: center; gap: 0.75rem; }
          .print-clinic-meta { display: flex; flex-direction: column; }
          .print-clinic-title { font-size: 1.5rem; font-weight: 800; color: #0d9488; margin: 0; }
          .print-clinic-sub { font-size: 0.8rem; color: #64748b; margin: 0; text-transform: uppercase; letter-spacing: 1px; }
          .print-clinic-contact { font-size: 0.75rem; color: #64748b; margin: 2px 0 0 0; }
          .print-doctor-section { text-align: right; }
          .print-doctor-name { font-size: 1.2rem; font-weight: 700; margin: 0 0 2px 0; color: #1e293b; }
          .print-doctor-specialty { font-size: 0.85rem; color: #0d9488; margin: 0 0 2px 0; font-weight: 600; }
          .print-doctor-hours { font-size: 0.75rem; color: #64748b; margin: 0; }
          .print-patient-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1.5fr; gap: 0.5rem; font-size: 0.85rem; color: #1e293b; background: #f8fafc; padding: 0.75rem; border-radius: 6px; border: 1px solid #cbd5e1; margin-top: 10px; margin-bottom: 1.5rem; }
          .print-body-layout { display: grid; grid-template-columns: 200px 1fr; gap: 1.5rem; min-height: 400px; }
          .print-sidebar-col { border-right: 1.5px solid #cbd5e1; padding-right: 1rem; }
          .print-section-title { font-size: 0.75rem; font-weight: 700; color: #0d9488; letter-spacing: 0.5px; margin-bottom: 0.5rem; text-transform: uppercase; }
          .print-obs-text { font-size: 0.85rem; line-height: 1.4; color: #334155; white-space: pre-line; margin: 0 0 1rem 0; }
          .print-diag-list { padding-left: 1.25rem; font-size: 0.85rem; color: #334155; margin: 0; }
          .print-rx-label { font-size: 1.8rem; font-weight: 800; font-style: italic; color: #0d9488; margin-bottom: 0.5rem; }
          .print-med-table { width: 100%; border-collapse: collapse; }
          .print-med-table th, .print-med-table td { border-bottom: 1px solid #e2e8f0; padding: 0.5rem; text-align: left; font-size: 0.85rem; }
          .print-med-table th { color: #64748b; text-transform: uppercase; font-size: 0.75rem; font-weight: 600; }
          .print-footer-section { display: flex; justify-content: flex-end; margin-top: 2rem; }
          .print-signature-area { display: flex; flex-direction: column; align-items: center; }
        </style>
      </head>
      <body>
        <div class="print-header">
          <div class="print-logo-section">
            <img src="alchc-logo.png" alt="Logo" style="width:50px;height:50px;border-radius:50%;">
            <div class="print-clinic-meta">
              <h1 class="print-clinic-title">Alamnagar CHC</h1>
              <p class="print-clinic-sub">Charitable Healthcare Centre</p>
              <p class="print-clinic-contact">Phone: +8801912562131 | Email: info@alamnagar-chc.org</p>
            </div>
          </div>
          <div class="print-doctor-section">
            <h2 class="print-doctor-name">Dr. ${escapeHTML(docName.replace(/^Dr\.\s+/i, ''))}</h2>
            <p class="print-doctor-specialty">${escapeHTML(docSpecialty)}</p>
            <p class="print-doctor-hours">${escapeHTML(docHours)}</p>
          </div>
        </div>

        <div class="print-patient-grid">
          <div><strong>Patient Name:</strong> ${escapeHTML(p.patient_name)}</div>
          <div><strong>Age:</strong> ${escapeHTML(p.age || 'N/A')}</div>
          <div><strong>Gender:</strong> ${escapeHTML(p.gender || 'N/A')}</div>
          <div><strong>Date:</strong> ${formattedDate}</div>
          <div style="grid-column: span 2;"><strong>Address:</strong> ${escapeHTML(p.address || 'N/A')}</div>
          <div><strong>Weight:</strong> ${escapeHTML(p.weight || 'N/A')}</div>
          <div><strong>Phone:</strong> ${escapeHTML(p.patient_phone || p.phone || 'N/A')}</div>
        </div>

        <div class="print-body-layout">
          <div class="print-sidebar-col">
            <div class="print-section-title">OBSERVATIONS & SYMPTOMS</div>
            <p class="print-obs-text">${escapeHTML(obs)}</p>

            <div style="margin-top: 1.2rem;">
              <div class="print-section-title">INVESTIGATION FINDINGS</div>
              <p class="print-obs-text" style="font-size: 0.85rem; color: #334155;">${escapeHTML(p.findings || 'None')}</p>
            </div>

            ${vitalsHtml}

            <div class="print-section-title" style="margin-top: 1.5rem;">RECOMMENDED DIAGNOSTICS</div>
            <ul class="print-diag-list">
              ${diagsHtml}
            </ul>
          </div>

          <div class="print-main-col">
            <div class="print-rx-label">Rx</div>
            <table class="print-med-table">
              <thead>
                <tr>
                  <th>Medicine Name</th>
                  <th>Dosage</th>
                  <th>Instructions</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                ${medsList.map(m => `
                  <tr style="border-bottom: ${m.advice ? 'none' : '1px solid #e2e8f0'};">
                    <td><strong>${escapeHTML(m.name)}</strong></td>
                    <td>${escapeHTML(m.dosage)}</td>
                    <td>${escapeHTML(m.timing)}</td>
                    <td>${escapeHTML(m.duration)}</td>
                  </tr>
                  ${m.advice ? `
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td colspan="4" style="font-size: 0.75rem; color: #64748b; padding-top: 0; padding-bottom: 0.5rem; font-style: italic;">
                      Advice: ${escapeHTML(m.advice)}
                    </td>
                  </tr>
                  ` : ''}
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="print-footer-section">
          <div class="print-signature-area">
            ${signatureHtml}
            <div style="border-top: 1px solid #475569; width: 200px; margin-top: 0.5rem; text-align: center; font-size: 0.85rem; font-weight: 600;">
              Dr. ${escapeHTML(docName.replace(/^Dr\.\s+/i, ''))}
            </div>
          </div>
        </div>
        <script>
          window.onload = function() { window.print(); window.close(); }
        </script>
      </body>
    </html>
  `;

  if (window.AndroidPrint) {
    document.body.innerHTML = content;
    setTimeout(() => {
      window.AndroidPrint.printPage();
      setTimeout(() => {
        location.reload();
      }, 1000);
    }, 500);
    return;
  }

  const printWindow = window.open('', '_blank');
  printWindow.document.write(content);
  printWindow.document.close();
};
