let currentPhone = '';
let portalToken = '';

async function requestOTP() {
  const phone = document.getElementById('patient-phone').value.trim();
  if (!phone) return alert('Please enter your mobile number.');
  
  const status = document.getElementById('otp-request-status');
  status.textContent = 'Requesting OTP...';
  status.style.color = '#475569';

  try {
    const res = await fetch('/api/patient/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    
    if (res.ok) {
      currentPhone = phone;
      document.getElementById('step-1').classList.remove('active');
      document.getElementById('step-2').classList.add('active');
    } else {
      const err = await res.json();
      status.textContent = err.error || 'Failed to request OTP';
      status.style.color = 'var(--danger)';
    }
  } catch (err) {
    console.error(err);
    status.textContent = 'Network error. Try again.';
    status.style.color = 'var(--danger)';
  }
}

async function verifyOTP() {
  const otp = document.getElementById('patient-otp').value.trim();
  if (!otp) return alert('Please enter the OTP.');

  const status = document.getElementById('otp-verify-status');
  status.textContent = 'Verifying...';
  status.style.color = '#475569';

  try {
    const res = await fetch('/api/patient/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: currentPhone, otp })
    });
    
    if (res.ok) {
      const data = await res.json();
      portalToken = data.token;
      document.getElementById('step-2').classList.remove('active');
      document.getElementById('step-3').classList.add('active');
      loadMyReports();
    } else {
      const err = await res.json();
      status.textContent = err.error || 'Invalid OTP';
      status.style.color = 'var(--danger)';
    }
  } catch (err) {
    console.error(err);
    status.textContent = 'Network error. Try again.';
    status.style.color = 'var(--danger)';
  }
}

async function uploadReport() {
  const fileInput = document.getElementById('report-file');
  const file = fileInput.files[0];
  if (!file) return alert('Please select a file to upload.');

  const desc = document.getElementById('report-desc').value.trim();
  const status = document.getElementById('upload-status');
  status.textContent = 'Uploading...';
  status.style.color = '#475569';

  const formData = new FormData();
  formData.append('report_file', file);
  formData.append('description', desc);

  try {
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${portalToken}` },
      body: formData
    });
    
    if (res.ok) {
      status.textContent = 'Upload successful!';
      status.style.color = 'green';
      fileInput.value = '';
      document.getElementById('report-desc').value = '';
      loadMyReports();
      setTimeout(() => status.textContent = '', 3000);
    } else {
      const err = await res.json();
      status.textContent = err.error || 'Upload failed.';
      status.style.color = 'var(--danger)';
    }
  } catch (err) {
    console.error(err);
    status.textContent = 'Network error during upload.';
    status.style.color = 'var(--danger)';
  }
}

async function loadMyReports() {
  const container = document.getElementById('reports-list');
  try {
    // Determine digits (to fetch) - using exact returned token format or just currentPhone mapping format
    let digits = currentPhone.replace(/\D/g, '');
    if (digits.startsWith('0') && digits.length === 11) digits = '88' + digits;

    const res = await fetch(`/api/reports/${digits}`, {
      headers: { 'Authorization': `Bearer ${portalToken}` }
    });
    
    if (res.ok) {
      const reports = await res.json();
      if (reports.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted);">No reports uploaded yet.</div>';
        return;
      }
      
      container.innerHTML = reports.map(r => `
        <div class="report-card">
          <div>
            <div style="font-weight: 600; color: var(--text-dark);">${r.description || 'Investigation Report'}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Uploaded: ${new Date(r.upload_date).toLocaleDateString()}</div>
          </div>
          <a href="${r.file_url}" target="_blank" class="btn" style="width: auto; padding: 0.5rem 1rem; text-decoration: none;">View</a>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Failed to load reports', err);
  }
}

function logout() {
  portalToken = '';
  currentPhone = '';
  document.getElementById('step-3').classList.remove('active');
  document.getElementById('step-1').classList.add('active');
  document.getElementById('patient-phone').value = '';
  document.getElementById('otp-request-status').textContent = '';
  document.getElementById('patient-otp').value = '';
  document.getElementById('otp-verify-status').textContent = '';
}
