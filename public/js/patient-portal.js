let currentPhone = '';
let currentEmail = '';
let currentPortalMethod = 'phone';
let portalToken = '';
let resendTimerInterval = null;

window.setPortalMethodImpl = window.setPortalMethod = function(method) {
  currentPortalMethod = method;
  const phoneBtn = document.getElementById('portal-method-phone');
  const emailBtn = document.getElementById('portal-method-email');
  const phoneGroup = document.getElementById('portal-phone-group');
  const emailGroup = document.getElementById('portal-email-group');
  const phoneInput = document.getElementById('patient-phone');
  const emailInput = document.getElementById('patient-email');

  if (method === 'phone') {
    if (phoneBtn) {
      phoneBtn.style.backgroundColor = 'var(--primary-color)';
      phoneBtn.style.color = 'white';
    }
    if (emailBtn) {
      emailBtn.style.backgroundColor = '#f8fafc';
      emailBtn.style.color = 'var(--text-muted)';
    }
    if (phoneGroup) phoneGroup.style.display = 'block';
    if (emailGroup) emailGroup.style.display = 'none';
  } else {
    if (phoneBtn) {
      phoneBtn.style.backgroundColor = '#f8fafc';
      phoneBtn.style.color = 'var(--text-muted)';
    }
    if (emailBtn) {
      emailBtn.style.backgroundColor = 'var(--primary-color)';
      emailBtn.style.color = 'white';
    }
    if (phoneGroup) phoneGroup.style.display = 'none';
    if (emailGroup) emailGroup.style.display = 'block';
  }
};


function startResendTimer() {
  const timerText = document.getElementById('resend-timer-text');
  const timerCount = document.getElementById('resend-timer-count');
  const btnResend = document.getElementById('btn-resend-otp');

  if (resendTimerInterval) clearInterval(resendTimerInterval);

  let timeLeft = 90;
  if (timerText) timerText.style.display = 'inline';
  if (btnResend) btnResend.style.display = 'none';
  if (timerCount) timerCount.textContent = timeLeft;

  resendTimerInterval = setInterval(() => {
    timeLeft--;
    if (timerCount) timerCount.textContent = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(resendTimerInterval);
      if (timerText) timerText.style.display = 'none';
      if (btnResend) btnResend.style.display = 'inline-block';
    }
  }, 1000);
}

function normalizeDigits(phone) {
  if (!phone) return '';
  let d = phone.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('01')) return d;
  if (d.length === 13 && d.startsWith('8801')) return d.substring(2);
  return d;
}

async function resendOTP() {
  if (!currentPhone && !currentEmail) return;
  const status = document.getElementById('otp-verify-status');
  if (status) {
    status.textContent = 'Resending OTP...';
    status.style.color = '#475569';
  }

  try {
    const res = await fetch('/api/patient/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: currentPhone, email: currentEmail })
    });
    
    if (res.ok) {
      if (status) {
        status.textContent = 'OTP resent successfully!';
        status.style.color = 'green';
      }
      startResendTimer();
    } else {
      const err = await res.json();
      if (status) {
        status.textContent = err.error || 'Failed to resend OTP';
        status.style.color = 'var(--danger)';
      }
    }
  } catch (err) {
    console.error(err);
    if (status) {
      status.textContent = 'Network error. Try again.';
      status.style.color = 'var(--danger)';
    }
  }
}

window.requestOTPImpl = window.requestOTP = async function requestOTP() {

  const phoneInput = document.getElementById('patient-phone');
  const emailInput = document.getElementById('patient-email');
  const emailGroup = document.getElementById('portal-email-group');

  let phone = phoneInput ? phoneInput.value.trim() : '';
  let email = emailInput ? emailInput.value.trim().toLowerCase() : '';

  // Intelligently check visible tab or populated field
  const isEmailActive = (emailGroup && emailGroup.style.display !== 'none') || (email.length > 0 && phone.length === 0);

  if (isEmailActive) {
    if (!email) return alert('Please enter your email address.');
    phone = '';
  } else {
    if (!phone) return alert('Please enter your mobile number.');
    email = '';
  }

  const status = document.getElementById('otp-request-status');
  if (status) {
    status.textContent = 'Sending OTP...';
    status.style.color = '#475569';
  }


  try {
    const res = await fetch('/api/patient/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, email })
    });
    
    const data = await res.json();
    if (res.ok) {
      currentPhone = phone;
      currentEmail = email;
      document.getElementById('step-1').classList.remove('active');
      document.getElementById('step-2').classList.add('active');
      startResendTimer();
      if (status) status.textContent = '';
    } else {
      if (status) {
        status.textContent = data.error || 'Failed to request OTP';
        status.style.color = 'var(--danger)';
      }
    }
  } catch (err) {
    console.error(err);
    if (status) {
      status.textContent = 'Network error. Try again.';
      status.style.color = 'var(--danger)';
    }
  }
}

window.verifyOTPImpl = window.verifyOTP = async function verifyOTP() {

  const otpInput = document.getElementById('patient-otp');
  const otp = otpInput ? otpInput.value.trim() : '';
  if (!otp) return alert('Please enter the OTP.');

  const status = document.getElementById('otp-verify-status');
  if (status) {
    status.textContent = 'Verifying...';
    status.style.color = '#475569';
  }

  const sessionToken = localStorage.getItem('chc_token') || localStorage.getItem('patient_portal_token');
  const headers = { 'Content-Type': 'application/json' };
  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  }

  try {
    const res = await fetch('/api/patient/verify-otp', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ phone: currentPhone, email: currentEmail, otp })
    });
    
    if (res.ok) {
      const data = await res.json();
      portalToken = data.token;
      
      const cleanContact = currentEmail || normalizeDigits(currentPhone);
      let verifiedPhones = {};
      try {
        verifiedPhones = JSON.parse(localStorage.getItem('verified_patient_phones') || '{}');
      } catch(e) {}
      if (cleanContact) {
        verifiedPhones[cleanContact] = data.token;
        localStorage.setItem('verified_patient_phones', JSON.stringify(verifiedPhones));
      }

      localStorage.setItem('patient_portal_token', data.token);
      if (currentPhone) localStorage.setItem('patient_portal_phone', currentPhone);
      if (currentEmail) localStorage.setItem('patient_portal_email', currentEmail);
      localStorage.setItem('chc_token', data.token);
      localStorage.setItem('chc_user_role', 'Patient');

      if (resendTimerInterval) clearInterval(resendTimerInterval);
      document.getElementById('step-2').classList.remove('active');
      document.getElementById('step-3').classList.add('active');
      loadMyReports();
      loadMyPrescriptions();
    } else {
      const err = await res.json();
      if (status) {
        status.textContent = err.error || 'Invalid OTP';
        status.style.color = 'var(--danger)';
      }
    }
  } catch (err) {
    console.error(err);
    if (status) {
      status.textContent = 'Network error. Try again.';
      status.style.color = 'var(--danger)';
    }
  }
}


window.uploadReportImpl = window.uploadReport = async function uploadReport() {

  const fileInput = document.getElementById('report-file');
  const file = fileInput ? fileInput.files[0] : null;
  if (!file) return alert('Please select a file to upload.');

  const descInput = document.getElementById('report-desc');
  const desc = descInput ? descInput.value.trim() : '';
  const status = document.getElementById('upload-status');
  if (status) {
    status.textContent = 'Uploading...';
    status.style.color = '#475569';
  }

  const activeToken = portalToken || localStorage.getItem('patient_portal_token') || localStorage.getItem('chc_token');
  const activeContact = currentPhone || currentEmail || localStorage.getItem('patient_portal_phone') || localStorage.getItem('patient_portal_email') || localStorage.getItem('chc_user_phone') || localStorage.getItem('chc_user_email');

  const formData = new FormData();
  formData.append('report_file', file);
  formData.append('description', desc);
  if (activeContact) {
    formData.append('patient_phone', activeContact);
  }

  try {
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${activeToken}` },
      body: formData
    });
    
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('patient_portal_token');
      localStorage.removeItem('patient_portal_phone');
      localStorage.removeItem('patient_portal_email');
      localStorage.removeItem('chc_token');
      portalToken = '';
      document.getElementById('step-3').classList.remove('active');
      document.getElementById('step-1').classList.add('active');
      const reqStatus = document.getElementById('otp-request-status');
      if (reqStatus) {
        reqStatus.textContent = 'Session expired. Please request a fresh OTP code to log in.';
        reqStatus.style.color = 'var(--danger)';
      }
      return;
    }

    if (res.ok) {
      if (status) {
        status.textContent = 'Upload successful!';
        status.style.color = 'green';
      }
      if (fileInput) fileInput.value = '';
      if (descInput) descInput.value = '';
      loadMyReports();
      setTimeout(() => { if (status) status.textContent = ''; }, 3000);
    } else {
      const err = await res.json();
      if (status) {
        status.textContent = err.error || 'Upload failed.';
        status.style.color = 'var(--danger)';
      }
    }

  } catch (err) {
    console.error(err);
    if (status) {
      status.textContent = 'Network error during upload.';
      status.style.color = 'var(--danger)';
    }
  }
}

window.loadMyReportsImpl = window.loadMyReports = async function loadMyReports() {

  const container = document.getElementById('reports-list');
  if (!container) return;

  try {
    const activeContact = currentEmail || currentPhone || localStorage.getItem('patient_portal_email') || localStorage.getItem('patient_portal_phone') || localStorage.getItem('chc_user_email') || localStorage.getItem('chc_user_phone') || '';
    
    let contactParam = activeContact;
    if (!activeContact.includes('@') && activeContact) {
      contactParam = activeContact.replace(/\D/g, '');
      if (contactParam.startsWith('0') && contactParam.length === 11) contactParam = '88' + contactParam;
    }

    const activeToken = portalToken || localStorage.getItem('patient_portal_token') || localStorage.getItem('chc_token');

    const res = await fetch(`/api/reports/${encodeURIComponent(contactParam)}?t=${Date.now()}`, {
      headers: { 'Authorization': `Bearer ${activeToken}` }
    });
    
    if (res.ok) {
      const reports = await res.json();
      if (!reports || reports.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 1.5rem 0;">No reports uploaded yet. Select a file above and click "Upload Document" to store your report securely.</div>';
        return;
      }
      
      container.innerHTML = reports.map(r => {
        const isPdf = r.file_url && /\.pdf$/i.test(r.file_url);
        const isImage = r.file_url && /\.(png|jpg|jpeg|gif|webp)$/i.test(r.file_url);
        const viewLabel = isPdf ? '📄 View PDF' : isImage ? '🖼 View Image' : '👁 View Document';
        return `
        <div class="report-card" style="margin-bottom: 0.75rem;">
          <div>
            <div style="font-weight: 600; color: var(--text-dark);">${r.description || 'Investigation Report'}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Uploaded: ${new Date(r.upload_date).toLocaleDateString('en-GB')}</div>
          </div>
          <a href="${r.file_url}" target="_blank" rel="noopener noreferrer" class="btn" style="width: auto; padding: 0.5rem 1rem; text-decoration: none; font-size:0.875rem;">${viewLabel}</a>
        </div>`;
      }).join('');

    }
  } catch (err) {
    console.error('Failed to load reports', err);
  }
}


window.logoutImpl = window.logout = function logout() {

  portalToken = '';
  currentPhone = '';
  
  localStorage.removeItem('patient_portal_token');
  localStorage.removeItem('patient_portal_phone');
  localStorage.removeItem('chc_token');
  localStorage.removeItem('chc_user_role');
  localStorage.removeItem('chc_user_name');
  localStorage.removeItem('chc_user_email');
  localStorage.removeItem('chc_user_phone');
  localStorage.removeItem('chc_user_id');

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
window.switchPatientTab = function(tabName) {
  const btnReports = document.getElementById('btn-show-reports');
  const btnPresc = document.getElementById('btn-show-prescriptions');
  const btnAppts = document.getElementById('btn-show-appointments');
  
  const panelReports = document.getElementById('panel-reports');
  const panelPresc = document.getElementById('panel-prescriptions');
  const panelAppts = document.getElementById('panel-appointments');

  [btnReports, btnPresc, btnAppts].forEach(btn => {
    if (btn) { btn.style.background = '#e2e8f0'; btn.style.color = 'var(--text-dark)'; }
  });
  [panelReports, panelPresc, panelAppts].forEach(panel => {
    if (panel) panel.style.display = 'none';
  });

  if (tabName === 'reports') {
    if (btnReports) { btnReports.style.background = 'var(--primary-color)'; btnReports.style.color = 'white'; }
    if (panelReports) panelReports.style.display = 'block';
  } else if (tabName === 'prescriptions') {
    if (btnPresc) { btnPresc.style.background = 'var(--primary-color)'; btnPresc.style.color = 'white'; }
    if (panelPresc) panelPresc.style.display = 'block';
    loadMyPrescriptions();
  } else if (tabName === 'appointments') {
    if (btnAppts) { btnAppts.style.background = 'var(--primary-color)'; btnAppts.style.color = 'white'; }
    if (panelAppts) panelAppts.style.display = 'block';
    loadMyAppointments();
  }
};

// Load patient prescriptions
window.loadMyPrescriptionsImpl = window.loadMyPrescriptions = async function loadMyPrescriptions() {

  const container = document.getElementById('prescriptions-list');
  if (!container) return;
  
  container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 1.5rem 0;">Loading prescriptions...</div>';

  try {
    const res = await fetch(`/api/patient/prescriptions?t=${Date.now()}`, {
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
            <div style="font-weight: 600; color: var(--text-dark);">Prescription by Dr. ${escapeHTML((p.doctor_name || 'Sarah Rahman').replace(/^Dr\.\s+/i, ''))}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Consulted: ${formattedDate}</div>
            <div style="font-size: 0.8rem; color: var(--primary-color); font-weight: 600; margin-top: 0.15rem;">Patient: ${escapeHTML(p.patient_name || 'Dependent')}</div>
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

window.viewPrescriptionDetailsImpl = window.viewPrescriptionDetails = async function(appointmentId) {

  const modal = document.getElementById('prescription-modal');
  const body = document.getElementById('prescription-modal-body');
  if (!modal || !body) return;

  body.innerHTML = '<div style="text-align: center; padding: 2rem;">Loading prescription detail...</div>';
  modal.style.display = 'flex';

  try {
    const res = await fetch(`/api/prescriptions/${appointmentId}?t=${Date.now()}`, {
      headers: { 'Authorization': `Bearer ${portalToken}` }
    });

    if (res.ok) {
      const p = await res.json();
      
      window.currentPortalPrescription = p;
      const rich = typeof p.rich_state === 'string' ? JSON.parse(p.rich_state) : p.rich_state || {};
      const adviceVal = p.general_advice || rich.general_advice || '';
      const nextVisitVal = p.next_visit || rich.next_visit || '';

      let medsList = [];
      try {
        medsList = typeof p.medicines === 'string' ? JSON.parse(p.medicines) : p.medicines;
      } catch (e) {}

      const pHeight = p.height || rich.height || '';
      const pAllergies = p.allergies || rich.allergies || '';
      const pWeight = p.weight || rich.weight || '';
      let pBmi = '';
      if (pHeight && pWeight) {
        const h = parseFloat(pHeight);
        const w = parseFloat(pWeight);
        if (h > 0 && w > 0) {
          pBmi = (w / ((h / 100) * (h / 100))).toFixed(1);
        }
      }

      let vitalsHtml = '';
      const pGlucose = p.blood_glucose || rich.blood_glucose || '';
      if (p.bp || p.temperature || p.pulse || pGlucose) {
        vitalsHtml = `
          <div style="margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 0.5rem; display: flex; flex-wrap: wrap; gap: 1rem; font-size: 0.8rem; color: var(--text-muted);">
            ${p.bp ? `<span><strong>B.P:</strong> ${escapeHTML(p.bp)}</span>` : ''}
            ${p.temperature ? `<span><strong>Temp:</strong> ${escapeHTML(p.temperature)} °F</span>` : ''}
            ${p.pulse ? `<span><strong>Pulse:</strong> ${escapeHTML(p.pulse)} bpm</span>` : ''}
            ${pGlucose ? `<span><strong>Blood Glucose:</strong> ${escapeHTML(pGlucose)}</span>` : ''}
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
        
        <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem; background: var(--bg-main); padding: 0.5rem; border-radius: 6px; display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem;">
          <div><strong>Date:</strong> ${new Date(p.created_at).toLocaleDateString('en-GB')}</div>
          <div><strong>Weight:</strong> ${escapeHTML(pWeight || 'N/A')} kg</div>
          ${pHeight ? `<div><strong>Height:</strong> ${escapeHTML(pHeight)} cm</div>` : ''}
          ${pBmi ? `<div><strong>BMI:</strong> ${escapeHTML(pBmi)}</div>` : ''}
          ${pAllergies && pAllergies.toLowerCase() !== 'none' ? `<div style="grid-column: span 2; color: #dc2626; font-weight: 700;"><strong>Allergies:</strong> ${escapeHTML(pAllergies)}</div>` : ''}
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
          <div style="overflow-x: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--border-color); border-radius: 6px; padding: 0.5rem; background: white;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; min-width: 400px;">
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
        
        <!-- General Advice (সাধারন পরামর্শ) Section -->
        ${adviceVal ? `
        <div style="margin-bottom: 1rem;">
          <h5 style="margin: 0 0 0.25rem 0; font-size: 0.85rem; color: var(--text-muted); text-transform: uppercase;">সাধারন পরামর্শ (General Advice)</h5>
          <div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: 6px; padding: 0.5rem; white-space: pre-wrap; font-size: 0.9rem; color: #1e293b; text-align: left;">
            ${escapeHTML(adviceVal)}
          </div>
        </div>
        ` : ''}

        <!-- Next Visit Follow-up Section -->
        ${nextVisitVal ? `
        <div style="margin-bottom: 1rem; border-top: 1px solid var(--border-color); padding-top: 0.5rem; font-size: 0.85rem; font-weight: 600; color: #0d9488; text-align: left;">
          আবার <strong>${escapeHTML(nextVisitVal)}</strong> দিন পর দেখা করবেন । জরুরী যে কোন পরিস্থিতিতে নিকটস্থ হাসপাতালের সহায়তা নিন।
        </div>
        ` : ''}

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

window.closePrescriptionModalImpl = window.closePrescriptionModal = function(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close')) return;
  const modal = document.getElementById('prescription-modal');
  if (modal) modal.style.display = 'none';
};

window.printPortalPrescriptionImpl = window.printPortalPrescription = function() {

  if (!window.AndroidPrint && (window.Capacitor || /wv|WebView|Android.*Version\/[0-9.]+/i.test(navigator.userAgent))) {
    alert("Printing directly from this version of the Android App is not supported. Please install the updated app build, or open the portal in your phone's web browser (like Google Chrome) to print.");
    return;
  }
  const p = window.currentPortalPrescription;
  if (!p) return alert('No prescription loaded to print.');

  const rich = typeof p.rich_state === 'string' ? JSON.parse(p.rich_state) : p.rich_state || {};
  const adviceVal = p.general_advice || rich.general_advice || '';
  const nextVisitVal = p.next_visit || rich.next_visit || '';

  const baseOrigin = window.Capacitor ? (window.API_BASE_URL || 'https://ashiana.online') : window.location.origin;

  let medsList = [];
  try {
    medsList = typeof p.medicines === 'string' ? JSON.parse(p.medicines) : p.medicines;
    if (!Array.isArray(medsList)) medsList = [];
  } catch (e) {
    console.warn(e);
  }

  let printDate = new Date();
  try {
    const dateToParse = p.appointment_date || p.created_at;
    if (dateToParse) {
      if (typeof dateToParse === 'string') {
        const isoStr = dateToParse.trim().replace(/\s+/, 'T');
        printDate = new Date(isoStr);
        if (isNaN(printDate.getTime())) {
          printDate = new Date(dateToParse);
        }
      } else {
        printDate = new Date(dateToParse);
      }
    }
  } catch(err) {
    console.error(err);
  }
  const formattedDate = !isNaN(printDate.getTime()) ? printDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A';

  const obs = p.observations || 'None';
  const diags = p.diagnostics || 'None';
  
  let diagsHtml = '';
  if (diags && diags.toLowerCase() !== 'none') {
    const list = diags.split(/[\n,;]+/).map(item => item.trim()).filter(Boolean);
    diagsHtml = list.map(item => `<li>${escapeHTML(item)}</li>`).join('');
  } else {
    diagsHtml = '<li>None recommended</li>';
  }

  const pHeight = p.height || rich.height || '';
  const pAllergies = p.allergies || rich.allergies || '';
  const pGlucose = p.blood_glucose || rich.blood_glucose || '';
  const pWeight = p.weight || rich.weight || '';
  let pBmi = '';
  if (pHeight && pWeight) {
    const h = parseFloat(pHeight);
    const w = parseFloat(pWeight);
    if (h > 0 && w > 0) {
      pBmi = (w / ((h / 100) * (h / 100))).toFixed(1);
    }
  }

  let vitalsHtml = '';
  if (p.bp || p.temperature || p.pulse || pGlucose) {
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
    if (pGlucose) {
      const glucoseFormatted = pGlucose.toLowerCase().includes('mmol') || pGlucose.toLowerCase().includes('rbs') || pGlucose.toLowerCase().includes('fbs') ? pGlucose : `RBS: ${pGlucose} mmol/L`;
      items.push(`<div><strong>Blood Glucose:</strong> ${escapeHTML(glucoseFormatted)}</div>`);
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
  const docHours = p.doctor_visiting_hours || p.doctor_hours || 'Sat, Mon, Wed (03:00 PM - 07:00 PM)';

  let qrCodeDataUrl = '';
  const shareLink = `${baseOrigin}/share.html?id=${p.appointment_id}`;
  try {
    const qr = new QRious({
      value: shareLink,
      size: 150
    });
    qrCodeDataUrl = qr.toDataURL();
  } catch (e) {
    console.warn("Local QR generation failed, falling back to network API:", e);
    qrCodeDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=60x60&margin=0&data=${encodeURIComponent(shareLink)}`;
  }

  const content = `
    <html>
      <head>
        <title>Prescription Print</title>
        <link rel="icon" type="image/png" href="favicon.png">
        <style>
          @page { size: A4 portrait; margin: 10mm 12mm 10mm 12mm; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 0; margin: 0; line-height: 1.5; color: #0f172a; width: 100%; box-sizing: border-box; display: flex; flex-direction: column; min-height: 262mm; }
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
          .print-footer-section { display: flex; justify-content: flex-end; margin-top: 1.5rem; }
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
          <div><strong>Phone:</strong> ${escapeHTML(p.patient_phone || p.phone || 'N/A')}</div>
          <div>
            <strong>Weight:</strong> ${escapeHTML(pWeight || 'N/A')} kg
            ${pHeight ? ` | <strong>Height:</strong> ${escapeHTML(pHeight)} cm` : ''}
            ${pBmi ? ` | <strong>BMI:</strong> ${escapeHTML(pBmi)}` : ''}
          </div>
          ${pAllergies && pAllergies.toLowerCase() !== 'none' ? `
          <div style="grid-column: span 4; color: #dc2626; font-weight: 700; margin-top: 2px;">
            <strong>ALLERGIES:</strong> ${escapeHTML(pAllergies)}
          </div>
          ` : ''}
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

            <!-- General Advice (সাধারন পরামর্শ) Section -->
            ${adviceVal ? `
            <div style="margin-top: 1.5rem; border: 1px solid #cbd5e1; padding: 0.75rem; border-radius: 6px; page-break-inside: avoid;">
              <div style="font-weight: 700; color: #0d9488; font-size: 0.85rem; margin-bottom: 0.4rem; border-bottom: 1px solid #cbd5e1; padding-bottom: 0.25rem;">সাধারন পরামর্শ (General Advice)</div>
              <div style="font-size: 0.82rem; line-height: 1.4; color: #1e293b; white-space: pre-wrap; margin: 0; padding-left: 0.25rem;">${escapeHTML(adviceVal)}</div>
            </div>
            ` : ''}
          </div>
        </div>

        <!-- Doctor Signature Section & Next Visit -->
        <div class="print-footer-section" style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 1.5rem; page-break-inside: avoid;">
          <!-- Next Visit Instructions -->
          ${nextVisitVal ? `
          <div style="font-size: 0.85rem; color: #1e293b; max-width: 60%; line-height: 1.5; text-align: left; padding-bottom: 0.5rem;">
            আবার <strong>${escapeHTML(nextVisitVal)}</strong> দিন পর দেখা করবেন । জরুরী যে কোন পরিস্থিতিতে নিকটস্থ হাসপাতালের সহায়তা নিন।
          </div>` : ''}
          <div class="print-signature-area" style="margin-left: auto;">
            ${signatureHtml}
            <div style="border-top: 1px solid #475569; width: 200px; margin-top: 0.5rem; text-align: center; font-size: 0.85rem; font-weight: 600;">
              Dr. ${escapeHTML(docName.replace(/^Dr\.\s+/i, ''))}
            </div>
          </div>
        </div>

        <!-- Absolute Bottom Page Footer with Digital Link and QR Code -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #cbd5e1; padding-top: 0.5rem; margin-top: auto;">
          <div style="font-size: 0.72rem; color: #64748b; text-align: left; max-width: 75%; line-height: 1.4;">
            <span style="font-weight: 700; color: #0d9488; text-transform: uppercase; font-size: 0.62rem; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">Digital Prescription Link (Secure OTP Required)</span>
            To view, download, or verify this prescription online, scan the QR code on the right or visit:<br>
            <span style="color: #0f172a; font-weight: 600; word-break: break-all;">${baseOrigin}/share.html?id=${p.appointment_id}</span>
          </div>
          <div style="text-align: right;">
            <img src="${qrCodeDataUrl}" alt="QR Code" style="width: 50px; height: 50px; display: block;">
          </div>
        </div>
        <script>
          window.onload = function() { window.focus(); window.print(); }
        </script>
      </body>
    </html>
  `;

  if (window.AndroidPrint) {
    let printContainer = document.getElementById('android-print-container');
    if (!printContainer) {
      printContainer = document.createElement('div');
      printContainer.id = 'android-print-container';
      document.body.appendChild(printContainer);
    }
    printContainer.innerHTML = content;
    
    window.runAndroidPrintFlow(printContainer, () => {
      printContainer.innerHTML = '';
    });
    return;
  }

  // Use a hidden iframe for print isolation in all standard web browsers (desktop & mobile)
  let iframe = document.getElementById('print-prescription-iframe');
  if (iframe) {
    iframe.parentNode.removeChild(iframe);
  }
  
  iframe = document.createElement('iframe');
  iframe.id = 'print-prescription-iframe';
  iframe.style.position = 'fixed';
  iframe.style.width = '0px';
  iframe.style.height = '0px';
  iframe.style.border = 'none';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(content);
  doc.close();
};

document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('chc_token') || localStorage.getItem('patient_portal_token');
  const role = localStorage.getItem('chc_user_role');
  const phone = localStorage.getItem('chc_user_phone') || localStorage.getItem('patient_portal_phone');
  const email = localStorage.getItem('patient_portal_email') || localStorage.getItem('chc_user_email');
  const contact = phone || email;

  if (token && contact && contact.trim().length > 0) {
    portalToken = token;
    currentPhone = phone || '';
    currentEmail = email || '';
    
    const step1 = document.getElementById('step-1');
    const step3 = document.getElementById('step-3');
    if (step1 && step3) {
      step1.classList.remove('active');
      step3.classList.add('active');
      loadMyReports();
      loadMyPrescriptions();
    }
  } else if (token && role === 'Patient') {

      // Prompt patient to link a mobile number
      const step1Div = document.getElementById('step-1');
      if (step1Div) {
        const infoBanner = document.createElement('div');
        infoBanner.className = 'status-banner success';
        infoBanner.style.marginBottom = '1.5rem';
        infoBanner.style.padding = '0.75rem';
        infoBanner.style.borderRadius = '6px';
        infoBanner.style.fontSize = '0.85rem';
        infoBanner.style.lineHeight = '1.4';
        infoBanner.style.backgroundColor = 'var(--primary-light)';
        infoBanner.style.border = '1px solid var(--border-color)';
        infoBanner.style.color = 'var(--primary-color)';
        infoBanner.style.fontWeight = '500';
        infoBanner.innerHTML = '👋 Welcome! To access your prescriptions and upload reports, please verify and link a mobile number to your account.';
        step1Div.insertBefore(infoBanner, step1Div.firstChild);
        
        const label = document.querySelector('#step-1 .form-label');
        if (label) {
          label.textContent = 'Mobile Number to Link';
        }
      }
    }
  }
});

window.loadMyAppointments = async function() {
  const container = document.getElementById('appointments-list');
  if (!container) return;

  container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 1.5rem 0;">Loading appointments...</div>';

  try {
    const res = await fetch(`/api/patient/appointments?t=${Date.now()}`, {
      headers: { 'Authorization': `Bearer ${portalToken}` }
    });

    let appts = [];
    if (res.ok) {
      appts = await res.json();
    } else {
      const resGen = await fetch(`/api/appointments?t=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${portalToken}` }
      });
      if (resGen.ok) appts = await resGen.json();
    }

    if (appts.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 1.5rem 0;">No appointments found in your record.</div>';
      return;
    }

    container.innerHTML = appts.map(a => {
      const isApproved = a.status === 'approved';
      const isCompleted = a.status === 'completed';
      const badgeStyle = isApproved ? 'background:#e0f2fe; color:#0369a1;' : isCompleted ? 'background:#d1fae5; color:#065f46;' : 'background:#fef3c7; color:#92400e;';
      
      const videoCallBtnHtml = (isApproved || isCompleted) ? `
        <button onclick="startPatientVideoCall(${a.id}, '${escapeHTML(a.patient_name || '')}', '${a.video_room_id || ''}')" class="btn" style="width: auto; padding: 0.4rem 0.8rem; font-size: 0.85rem; background: linear-gradient(135deg, #0d9488, #059669); color: white; margin-top: 0.5rem; cursor: pointer;">🎥 Join Video Call</button>
      ` : '';

      return `
        <div class="report-card" style="border-left: 4px solid var(--primary-color); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; padding: 1rem; margin-bottom: 1rem; background: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div>
            <div style="font-weight: 700; color: var(--text-dark); font-size: 1rem;">${escapeHTML(a.patient_name)} <span style="font-size:0.75rem; padding:0.15rem 0.5rem; border-radius:4px; font-weight:600; ${badgeStyle}">${a.status.toUpperCase()}</span></div>
            <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.2rem;">Date & Time: <strong>${a.appointment_date} at ${a.appointment_time}</strong></div>
            ${a.notes ? `<div style="font-size: 0.8rem; color: var(--text-dark); margin-top: 0.2rem;">Notes: <em>${escapeHTML(a.notes)}</em></div>` : ''}
          </div>
          <div>
            ${videoCallBtnHtml}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to load appointments', err);
    container.innerHTML = '<div style="text-align: center; color: var(--danger); padding: 1.5rem 0;">Error loading appointments.</div>';
  }
};

window.startPatientVideoCall = async function(apptId, patientName, roomId) {
  const modal = document.getElementById('patient-video-modal');
  const iframe = document.getElementById('patient-video-iframe');
  const extBtn = document.getElementById('patient-video-ext-btn');

  try {
    const res = await fetch(`/api/appointments/${apptId}/video-room?t=${Date.now()}`, {
      headers: { 'Authorization': `Bearer ${portalToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      iframe.src = data.video_url;
      if (extBtn) extBtn.href = data.video_url;
    } else {
      const rId = roomId || `AlamnagarChcConsult${apptId}`;
      const url = `/video-call.html?room=${rId}&appointment_id=${apptId}&name=${encodeURIComponent(patientName)}`;
      iframe.src = url;
      if (extBtn) extBtn.href = url;
    }
  } catch (e) {
    console.error('Error fetching patient video room:', e);
    const rId = roomId || `AlamnagarChcConsult${apptId}`;
    const url = `/video-call.html?room=${rId}&appointment_id=${apptId}&name=${encodeURIComponent(patientName)}`;
    iframe.src = url;
    if (extBtn) extBtn.href = url;
  }

  if (modal) modal.style.display = 'flex';
};

window.closePatientVideoModal = function() {
  const modal = document.getElementById('patient-video-modal');
  const iframe = document.getElementById('patient-video-iframe');
  if (iframe) iframe.src = '';
  if (modal) modal.style.display = 'none';
};
