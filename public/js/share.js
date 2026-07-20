const urlParams = new URLSearchParams(window.location.search);
const appointmentId = urlParams.get('id');

if (!appointmentId) {
  document.getElementById('auth-wall').innerHTML = '<h2>Invalid Link</h2><p>No prescription ID found.</p>';
} else {
  // Check if this prescription link was already verified on this device!
  const isVerified = localStorage.getItem(`share_verified_${appointmentId}`);
  if (isVerified) {
    // Auto-fetch fresh, real-time prescription data from server DB without asking for OTP again!
    fetchPrescriptionDirect(isVerified);
  }
}

async function fetchPrescriptionDirect(tokenKey) {
  try {
    const res = await fetch(`/api/share/prescription/${appointmentId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp: tokenKey })
    });
    if (res.ok) {
      const data = await res.json();
      document.getElementById('auth-wall').style.display = 'none';
      renderPrescription(data.prescription);
      document.getElementById('prescription-view').style.display = 'block';
    } else {
      // If server rejected (e.g. invalid or data cleared), remove token so user can verify fresh
      localStorage.removeItem(`share_verified_${appointmentId}`);
    }
  } catch(e) {
    console.warn('Fetch error:', e);
  }
}

async function requestPrescriptionOTP() {
  const status = document.getElementById('req-status');
  status.textContent = 'Sending OTP...';
  status.style.color = '#475569';

  try {
    const res = await fetch(`/api/share/prescription/${appointmentId}/request-otp`, {
      method: 'POST'
    });
    
    if (res.ok) {
      const data = await res.json();
      document.getElementById('step-request').style.display = 'none';
      document.getElementById('step-verify').style.display = 'block';
      status.textContent = '';
      
      const sub = document.querySelector('.auth-subtitle');
      if (sub) sub.textContent = data.message;
    } else {
      const err = await res.json();
      status.textContent = err.error || 'Failed to send OTP';
      status.style.color = 'red';
    }
  } catch (err) {
    status.textContent = 'Network error. Try again.';
    status.style.color = 'red';
  }
}

async function verifyPrescriptionOTP() {
  const otp = document.getElementById('verify-otp-input').value.trim();
  if (!otp) return alert('Enter OTP');
  
  const status = document.getElementById('ver-status');
  status.textContent = 'Verifying...';
  status.style.color = '#475569';

  try {
    const res = await fetch(`/api/share/prescription/${appointmentId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp })
    });
    
    if (res.ok) {
      const data = await res.json();
      
      // Save verification status locally so recipient doesn't have to repeat OTP for this link
      localStorage.setItem(`share_verified_${appointmentId}`, 'verified_session');

      document.getElementById('auth-wall').style.display = 'none';
      renderPrescription(data.prescription);
      document.getElementById('prescription-view').style.display = 'block';
    } else {
      const err = await res.json();
      status.textContent = err.error || 'Invalid OTP';
      status.style.color = 'red';
    }
  } catch (err) {
    status.textContent = 'Network error.';
    status.style.color = 'red';
  }
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderPrescription(visit) {
  const container = document.getElementById('print-prescription-template');
  
  let state = visit.rich_state;
  if (typeof state === 'string') {
    try { state = JSON.parse(state); } catch(e){}
  }
  
  const docName = visit.doctor_name || 'Doctor Name';
  const docSpecialty = visit.doctor_specialty || 'Specialty';
  const docHours = visit.doctor_hours || 'Visiting Hours';
  
  const pName = visit.patient_name || 'Patient';
  const pAge = state?.age || visit.age || 'N/A';
  const pGender = state?.gender || visit.gender || 'N/A';
  const pWeight = state?.weight || visit.weight || 'N/A';
  const pAddress = state?.address || visit.address || 'N/A';
  const pDate = new Date(visit.appointment_date || visit.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const pPhone = visit.phone || '';
  
  const obs = state?.observations || visit.observations || 'None';
  
  const bpVal = state?.bp || visit.bp || '';
  const temp = state?.temperature || visit.temperature || '';
  const pulse = state?.pulse || visit.pulse || '';
  let vitalsHtml = '';
  if (bpVal || temp || pulse) {
    let items = [];
    if (bpVal) {
      const bpFormatted = bpVal.toLowerCase().includes('mmhg') ? bpVal : `${bpVal} mmHg`;
      items.push(`<div><strong>B.P:</strong> ${escapeHTML(bpFormatted)}</div>`);
    }
    if (temp) {
      const tempFormatted = temp.toLowerCase().includes('°') || temp.toLowerCase().includes('f') ? temp : `${temp} °F`;
      items.push(`<div><strong>Temperature:</strong> ${escapeHTML(tempFormatted)}</div>`);
    }
    if (pulse) {
      const pulseFormatted = pulse.toLowerCase().includes('bpm') ? pulse : `${pulse} bpm`;
      items.push(`<div><strong>Pulse:</strong> ${escapeHTML(pulseFormatted)}</div>`);
    }
    vitalsHtml = `
      <div style="margin-top: 1.2rem;">
        <div style="font-weight: 700; font-size: 0.9rem; margin-bottom: 0.25rem; color: #0d9488;">PHYSICAL OBSERVATIONS</div>
        <div style="font-size: 0.85rem; line-height: 1.5; color: #334155;">${items.join('')}</div>
      </div>
    `;
  }
  
  let diagsHtml = '';
  const diags = state?.diagnostics || visit.diagnostics || '';
  if (diags && diags.toLowerCase() !== 'none') {
    const list = diags.split(/[\n,;]+/).map(item => item.trim()).filter(Boolean);
    diagsHtml = list.map(item => `<li>${escapeHTML(item)}</li>`).join('');
  } else {
    diagsHtml = '<li>None recommended</li>';
  }
  
  let medsHtml = '';
  const meds = state?.medicines || (typeof visit.medicines === 'string' ? JSON.parse(visit.medicines) : visit.medicines);
  if (meds && Array.isArray(meds) && meds.length > 0) {
    medsHtml = meds.map(m => `
      <tr style="${m.advice ? 'border-bottom: none;' : 'border-bottom: 1px solid #e2e8f0;'}">
        <td style="padding: 0.5rem; text-align: left;"><strong>${escapeHTML(m.name)}</strong></td>
        <td style="padding: 0.5rem; text-align: left;">${escapeHTML(m.dosage)}</td>
        <td style="padding: 0.5rem; text-align: left;">${escapeHTML(m.timing)}</td>
        <td style="padding: 0.5rem; text-align: left;">${escapeHTML(m.duration)}</td>
      </tr>
      ${m.advice ? `
      <tr>
        <td colspan="4" style="padding: 0 0.5rem 0.5rem 0.5rem; color: #475569; font-size: 0.8rem; border-bottom: 1px solid #e2e8f0;">
          <span style="font-weight: 600; color: #0d9488;">Advice:</span> <em>${escapeHTML(m.advice)}</em>
        </td>
      </tr>` : ''}
    `.join('') ;
  } else {
    medsHtml = '<tr><td colspan="4" style="text-align:center; padding: 1rem; color: #64748b;">No medicines prescribed</td></tr>';
  }

  const sigImg = visit.doctor_signature ? `<img src="${visit.doctor_signature}" alt="Signature" style="max-height: 50px; display: block; margin-bottom: 0.5rem;">` : '';

  container.innerHTML = `
    <!-- Header -->
    <div class="prescription-header" style="display: flex; justify-content: space-between; border-bottom: 2px solid #0d9488; padding-bottom: 0.75rem; margin-bottom: 0.75rem;">
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <img src="alchc-logo.png" style="width:50px;height:50px;border-radius:50%;">
        <div>
          <h1 style="margin: 0; font-size: 1.5rem; font-weight: 800; color: #0d9488;">Alamnagar CHC</h1>
          <p style="margin: 0; font-size: 0.8rem; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Charitable Healthcare Centre</p>
          <p style="margin: 2px 0 0 0; font-size: 0.75rem; color: #64748b;">Phone: +8801912562131 | Email: info@alamnagar-chc.org</p>
        </div>
      </div>
      <div style="text-align: right;">
        <h2 style="margin: 0 0 2px 0; font-size: 1.2rem; font-weight: 700; color: #1e293b;">Dr. ${escapeHTML(docName.replace(/^Dr\.\s+/i, ''))}</h2>
        <p style="margin: 0 0 2px 0; font-size: 0.85rem; color: #0d9488; font-weight: 600;">${escapeHTML(docSpecialty)}</p>
        <p style="margin: 0; font-size: 0.75rem; color: #64748b;">${escapeHTML(docHours)}</p>
      </div>
    </div>
    
    <!-- Patient Info -->
    <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1.5fr; gap: 0.5rem; font-size: 0.85rem; color: #1e293b; background: #f8fafc; padding: 0.75rem; border-radius: 6px; border: 1px solid #cbd5e1; margin-top: 10px; margin-bottom: 1.5rem;">
      <div><strong>Patient Name:</strong> ${escapeHTML(pName)}</div>
      <div><strong>Age:</strong> ${escapeHTML(pAge)}</div>
      <div><strong>Gender:</strong> ${escapeHTML(pGender)}</div>
      <div><strong>Date:</strong> ${pDate}</div>
      <div style="grid-column: span 2;"><strong>Address:</strong> ${escapeHTML(pAddress)}</div>
      <div><strong>Weight:</strong> ${escapeHTML(pWeight)}</div>
      <div><strong>Phone:</strong> ${escapeHTML(pPhone)}</div>
    </div>

    <!-- Body Layout -->
    <div style="display: grid; grid-template-columns: 200px 1fr; gap: 1.5rem; min-height: 400px;">
      <!-- Sidebar -->
      <div style="border-right: 1.5px solid #cbd5e1; padding-right: 1rem;">
        <div style="font-size: 0.75rem; font-weight: 700; color: #0d9488; letter-spacing: 0.5px; margin-bottom: 0.5rem; text-transform: uppercase;">OBSERVATIONS & SYMPTOMS</div>
        <p style="font-size: 0.85rem; line-height: 1.4; color: #334155; white-space: pre-line; margin: 0 0 1rem 0;">${escapeHTML(obs)}</p>

        <div style="margin-top: 1.2rem;">
          <div style="font-size: 0.75rem; font-weight: 700; color: #0d9488; letter-spacing: 0.5px; margin-bottom: 0.5rem; text-transform: uppercase;">INVESTIGATION FINDINGS</div>
          <p style="font-size: 0.85rem; color: #334155; margin: 0;">${escapeHTML(visit.findings || 'None')}</p>
        </div>

        ${vitalsHtml}

        <div style="font-size: 0.75rem; font-weight: 700; color: #0d9488; letter-spacing: 0.5px; margin-top: 1.5rem; margin-bottom: 0.5rem; text-transform: uppercase;">RECOMMENDED DIAGNOSTICS</div>
        <ul style="padding-left: 1.25rem; font-size: 0.85rem; color: #334155; margin: 0;">
          ${diagsHtml}
        </ul>
      </div>

      <!-- Main Column -->
      <div>
        <div style="font-size: 1.8rem; font-weight: 800; font-style: italic; color: #0d9488; margin-bottom: 0.5rem;">Rx</div>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 1px solid #e2e8f0; text-align: left; font-size: 0.75rem; color: #64748b; text-transform: uppercase;">
              <th style="padding: 0.5rem;">Medicine Name</th>
              <th style="padding: 0.5rem;">Dosage</th>
              <th style="padding: 0.5rem;">Instructions</th>
              <th style="padding: 0.5rem;">Duration</th>
            </tr>
          </thead>
          <tbody>
            ${medsHtml}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Footer -->
    <div style="display: flex; justify-content: flex-end; margin-top: 2rem;">
      <div style="display: flex; flex-direction: column; align-items: center;">
        ${sigImg}
        <div style="border-top: 1px solid #475569; width: 200px; margin-top: 0.5rem; text-align: center; font-size: 0.85rem; font-weight: 600;">
          Dr. ${escapeHTML(docName.replace(/^Dr\.\s+/i, ''))}
        </div>
      </div>
    </div>
  `;
}
