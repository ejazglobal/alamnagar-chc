// State Management
let appointments = [];
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
  dashboardView.style.display = 'block';
  
  // Staff are allowed to publish news, so we do not hide the left column.

  renderAuthNav();
  await loadData();
  setupDashboardEvents();
  renderDashboard();
}

// Load Appointments & News
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
    
    isFallbackMode = false;
    adminDemoNotice.style.display = 'none';
  } catch (err) {
    console.warn('Backend server unreachable. Switching to local storage fallback mode.', err);
    isFallbackMode = true;
    adminDemoNotice.style.display = 'flex';
    appointments = JSON.parse(localStorage.getItem('chc_appointments')) || [];
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

  // News publication submit
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
        // Save locally
        const localNews = JSON.parse(localStorage.getItem('chc_news')) || [];
        const newNewsItem = {
          id: Date.now(),
          ...payload,
          date_posted: new Date().toISOString()
        };
        localNews.unshift(newNewsItem); // Add to front
        localStorage.setItem('chc_news', JSON.stringify(localNews));
        
        showNewsStatus('News announcement posted successfully (Saved locally).', 'success');
      } else {
        const token = localStorage.getItem('chc_token');
        // Post to server
        const response = await fetch('/api/news', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to post news announcement.');
        }
        
        showNewsStatus('News announcement published successfully!', 'success');
      }
      
      newsPostForm.reset();
    } catch (err) {
      console.error(err);
      showNewsStatus(err.message || 'Error occurred publishing news.', 'error');
    }
  });

  // Change password submit
  const changePasswordForm = document.getElementById('change-password-form');
  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPassword = document.getElementById('current-password').value;
      const newPassword = document.getElementById('new-password').value;

      if (newPassword.length < 6) {
        showPasswordStatus('New password must be at least 6 characters long.', 'error');
        return;
      }

      try {
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

        showPasswordStatus('Password updated successfully!', 'success');
        changePasswordForm.reset();
      } catch (err) {
        console.error(err);
        showPasswordStatus(err.message || 'Error occurred changing password.', 'error');
      }
    });
  }
}

// Render overall stats and list components
function renderDashboard() {
  calculateMetrics();
  renderTable();
}

// Stats metrics calculator
function calculateMetrics() {
  const total = appointments.length;
  const pending = appointments.filter(a => a.status === 'pending').length;
  const approved = appointments.filter(a => a.status === 'approved').length;

  statTotal.textContent = total;
  statPending.textContent = pending;
  statApproved.textContent = approved;
}

// Render table records based on filter and search queries
function renderTable() {
  apptTbody.innerHTML = '';

  // Filter and search logic
  const filtered = appointments.filter(appt => {
    // 1. Check Category Filter
    if (currentFilter !== 'all' && appt.status !== currentFilter) {
      return false;
    }
    
    // 2. Check Search Input
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
      // Offline mode local storage update
      const localAppts = JSON.parse(localStorage.getItem('chc_appointments')) || [];
      const apptIdx = localAppts.findIndex(a => a.id === id);
      if (apptIdx !== -1) {
        localAppts[apptIdx].status = newStatus;
        localStorage.setItem('chc_appointments', JSON.stringify(localAppts));
      }

      // Sync local state
      const stateIdx = appointments.findIndex(a => a.id === id);
      if (stateIdx !== -1) {
        appointments[stateIdx].status = newStatus;
      }
      
      showApptStatus(`Appointment status updated to ${newStatus.toUpperCase()} (Saved locally).`, 'success');
    } else {
      const token = localStorage.getItem('chc_token');
      // Make standard request to the Node.js database REST API
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

      // Sync state array
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

// Messaging display components
function showNewsStatus(message, type) {
  newsStatusBanner.textContent = message;
  newsStatusBanner.className = `status-banner ${type}`;
  setTimeout(() => {
    newsStatusBanner.style.display = 'none';
  }, 5000);
}

function showApptStatus(message, type) {
  apptStatusBanner.textContent = message;
  apptStatusBanner.className = `status-banner ${type}`;
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
