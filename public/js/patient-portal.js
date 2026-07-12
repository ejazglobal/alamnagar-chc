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
      loadMyPrescriptions();
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
      
      container.innerHTML = reports.map(r => {
        const isPdf = r.file_url && /\.pdf$/i.test(r.file_url);
        const isImage = r.file_url && /\.(png|jpg|jpeg|gif|webp)$/i.test(r.file_url);
        const viewLabel = isPdf ? '📄 View PDF' : isImage ? '🖼 View Image' : '👁 View Document';
        return `
        <div class="report-card">
          <div>
            <div style="font-weight: 600; color: var(--text-dark);">${r.description || 'Investigation Report'}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Uploaded: ${new Date(r.upload_date).toLocaleDateString()}</div>
          </div>
          <a href="${r.file_url}" target="_blank" class="btn" style="width: auto; padding: 0.5rem 1rem; text-decoration: none; font-size:0.875rem;">${viewLabel}</a>
        </div>`;
      }).join('');

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
  // Reset tabs to default
  switchPatientTab('reports');
}

// Escape HTML helper
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

// Switch between reports and prescriptions sub-tabs
window.switchPatientTab = function(tab) {
  const btnReports = document.getElementById('btn-show-reports');
  const btnPresc = document.getElementById('btn-show-prescriptions');
  const panelReports = document.getElementById('panel-reports');
  const panelPresc = document.getElementById('panel-prescriptions');
  
  if (!btnReports || !btnPresc || !panelReports || !panelPresc) return;

  if (tab === 'reports') {
    btnReports.style.background = 'var(--primary-color)';
    btnReports.style.color = 'white';
    btnPresc.style.background = '#e2e8f0';
    btnPresc.style.color = 'var(--text-dark)';
    
    panelReports.style.display = 'block';
    panelPresc.style.display = 'none';
  } else {
    btnPresc.style.background = 'var(--primary-color)';
    btnPresc.style.color = 'white';
    btnReports.style.background = '#e2e8f0';
    btnReports.style.color = 'var(--text-dark)';
    
    panelReports.style.display = 'none';
    panelPresc.style.display = 'block';
    
    loadMyPrescriptions();
  }
};

// Load patient prescriptions
async function loadMyPrescriptions() {
  const container = document.getElementById('prescriptions-list');
  if (!container) return;
  
  container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 1.5rem 0;">Loading prescriptions...</div>';

  try {
    const res = await fetch('/api/patient/prescriptions', {
      headers: { 'Authorization': `Bearer ${portalToken}` }
    });

    if (res.ok) {
      const prescriptions = await res.json();
      if (prescriptions.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 1.5rem 0;">No prescriptions in your record yet.</div>';
        return;
      }

      container.innerHTML = prescriptions.map(p => {
        const formattedDate = new Date(p.appointment_date).toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
        });
        return `
        <div class="report-card" style="border-left: 4px solid var(--primary-color);">
          <div>
            <div style="font-weight: 600; color: var(--text-dark);">Prescription by Dr. ${escapeHTML(p.doctor_name || 'Sarah Rahman')}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Consulted: ${formattedDate}</div>
            ${p.observations ? `<div style="font-size: 0.78rem; color: var(--text-dark); margin-top: 0.25rem;">Obs: <em>${escapeHTML(p.observations)}</em></div>` : ''}
          </div>
          <button onclick="viewPrescriptionDetails(${p.appointment_id})" class="btn" style="width: auto; padding: 0.5rem 1rem; font-size:0.875rem; background: var(--accent-color);">👁 View Rx</button>
        </div>`;
      }).join('');
    } else {
      container.innerHTML = '<div style="text-align: center; color: var(--danger); padding: 1.5rem 0;">Failed to fetch prescriptions.</div>';
    }
  } catch (err) {
    console.error('Failed to load prescriptions', err);
    container.innerHTML = '<div style="text-align: center; color: var(--danger); padding: 1.5rem 0;">Network error loading prescriptions.</div>';
  }
}

window.viewPrescriptionDetails = async function(appointmentId) {
  const modal = document.getElementById('prescription-modal');
  const body = document.getElementById('prescription-modal-body');
  if (!modal || !body) return;

  body.innerHTML = '<div style="text-align: center; padding: 2rem;">Loading prescription detail...</div>';
  modal.style.display = 'flex';

  try {
    const res = await fetch(`/api/prescriptions/${appointmentId}`, {
      headers: { 'Authorization': `Bearer ${portalToken}` }
    });

    if (res.ok) {
      const p = await res.json();
      
      let medsList = [];
      try {
        medsList = typeof p.medicines === 'string' ? JSON.parse(p.medicines) : p.medicines;
      } catch (e) {}

      let vitalsHtml = '';
      if (p.bp || p.temperature || p.pulse) {
        vitalsHtml = `
          <div style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 0.5rem; display: flex; gap: 1rem; font-size: 0.8rem; color: var(--text-muted);">
            ${p.bp ? `<span><strong>B.P:</strong> ${escapeHTML(p.bp)}</span>` : ''}
            ${p.temperature ? `<span><strong>Temp:</strong> ${escapeHTML(p.temperature)} °F</span>` : ''}
            ${p.pulse ? `<span><strong>Pulse:</strong> ${escapeHTML(p.pulse)} bpm</span>` : ''}
          </div>
        `;
      }

      let signatureHtml = '';
      if (p.doctor_signature) {
        signatureHtml = `
          <div style="margin-top: 1.5rem; text-align: right;">
            <img src="${p.doctor_signature}" alt="Signature" style="max-height: 40px; display: inline-block;">
          </div>
        `;
      }

      body.innerHTML = `
        <div style="border-bottom: 2px solid var(--primary-color); padding-bottom: 0.5rem; margin-bottom: 1rem;">
          <h4 style="margin:0; color: var(--primary-color); font-size: 1.15rem;">Alamnagar CHC</h4>
          <span style="font-size: 0.75rem; color: var(--text-muted);">Charitable Healthcare Centre</span>
        </div>
        
        <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem; background: var(--bg-main); padding: 0.5rem; border-radius: 6px;">
          <div><strong>Date:</strong> ${new Date(p.created_at).toLocaleDateString()}</div>
        </div>

        <div style="margin-bottom: 1rem;">
          <h5 style="margin: 0 0 0.25rem 0; font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase;">Observations</h5>
          <div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: 6px; padding: 0.5rem;">
            ${escapeHTML(p.observations || 'None')}
          </div>
        </div>

        <div style="margin-bottom: 1rem;">
          <h5 style="margin: 0 0 0.25rem 0; font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase;">Diagnostics</h5>
          <div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: 6px; padding: 0.5rem;">
            ${escapeHTML(p.diagnostics || 'None')}
          </div>
        </div>

        <div style="margin-bottom: 1rem;">
          <h5 style="margin: 0 0 0.5rem 0; font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase;">Rx (Prescribed Medicines)</h5>
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

        ${vitalsHtml}
        ${signatureHtml}
      `;
    } else {
      body.innerHTML = '<div style="text-align: center; color: var(--danger); padding: 2rem;">Failed to load prescription.</div>';
    }
  } catch (err) {
    console.error(err);
    body.innerHTML = '<div style="text-align: center; color: var(--danger); padding: 2rem;">Network error loading details.</div>';
  }
};

window.closePrescriptionModal = function(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close')) return;
  const modal = document.getElementById('prescription-modal');
  if (modal) modal.style.display = 'none';
};

window.printPortalPrescription = function() {
  const content = document.getElementById('prescription-modal-body').innerHTML;
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
      <head>
        <title>Prescription Print</title>
        <style>
          body { font-family: sans-serif; padding: 2rem; line-height: 1.5; color: #0f172a; }
          strong { color: #000; }
          table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
          th, td { border-bottom: 1px solid #cbd5e1; padding: 0.5rem; text-align: left; }
          th { text-transform: uppercase; font-size: 0.8rem; color: #475569; }
        </style>
      </head>
      <body>
        ${content}
        <script>
          window.onload = function() { window.print(); window.close(); }
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
};
