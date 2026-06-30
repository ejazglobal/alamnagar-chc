// State Management
let appointments = [];
let newsItems = [];
let doctors = [];
let editingNewsId = null;
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
}

// Load Appointments, News, Doctors
async function loadData() {
  try {
    const token = localStorage.getItem('chc_token');
    const apptsResponse = await fetch('/api/appointments', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!apptsResponse.ok) throw new Error('API server unreachable');
    appointments = await apptsResponse.json();

    const doctorsResponse = await fetch('/api/doctors');
    if (doctorsResponse.ok) {
      doctors = await doctorsResponse.json();
    }

    const newsResponse = await fetch('/api/news');
    if (newsResponse.ok) {
      newsItems = await newsResponse.json();
    }
    
    isFallbackMode = false;
    adminDemoNotice.style.display = 'none';
  } catch (err) {
    console.warn('Backend server unreachable. Switching to local storage fallback mode.', err);
    isFallbackMode = true;
    adminDemoNotice.style.display = 'flex';
    appointments = JSON.parse(localStorage.getItem('chc_appointments')) || [];
    doctors = JSON.parse(localStorage.getItem('chc_doctors')) || [];
    newsItems = JSON.parse(localStorage.getItem('chc_news')) || [];
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
