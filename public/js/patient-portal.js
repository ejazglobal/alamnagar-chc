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
      
      window.currentPortalPrescription = p;

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
  const p = window.currentPortalPrescription;
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

  const printWindow = window.open('', '_blank');
  printWindow.document.write(content);
  printWindow.document.close();
};
