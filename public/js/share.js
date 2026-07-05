const urlParams = new URLSearchParams(window.location.search);
const appointmentId = urlParams.get('id');

if (!appointmentId) {
  document.getElementById('auth-wall').innerHTML = '<h2>Invalid Link</h2><p>No prescription ID found.</p>';
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
  if (typeof state === 'string') state = JSON.parse(state);
  
  const docName = visit.doctor_name || 'Doctor Name';
  const docSpecialty = visit.doctor_specialty || 'Specialty';
  const docHours = visit.doctor_hours || 'Visiting Hours';
  
  const pName = visit.patient_name || 'Patient';
  const pAge = state?.age || visit.age || 'N/A';
  const pGender = state?.gender || visit.gender || 'N/A';
  const pWeight = state?.weight || visit.weight || 'N/A';
  const pAddress = state?.address || visit.address || 'N/A';
  const pDate = new Date(visit.appointment_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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
        <div style="font-weight: 700; font-size: 0.9rem; margin-bottom: 0.25rem;">PHYSICAL OBSERVATIONS</div>
        <div style="font-size: 0.85rem; line-height: 1.5; color: #334155;">${items.join('')}</div>
      </div>
    `;
  }
  
  let diagsHtml = '';
  const diags = state?.diagnostics || visit.diagnostics || '';
  if (diags) {
    diagsHtml = diags.split(', ').map(d => `<li>${escapeHTML(d)}</li>`).join('');
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
    `).join('');
  } else {
    medsHtml = '<tr><td colspan="4" style="text-align:center; padding: 1rem;">No medicines prescribed</td></tr>';
  }

  const sigImg = visit.doctor_signature ? `<img src="${visit.doctor_signature}" alt="Signature" style="max-height:60px; display:block; margin:0 auto;">` : '';

  container.innerHTML = `
    <!-- Header -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
      <div style="display: flex; align-items: center; gap: 1rem;">
        <img src="alchc-logo.png" style="width:50px;height:50px;border-radius:50%;">
        <div>
          <h1 style="margin: 0; font-size: 1.25rem; color: #0f172a;">Alamnagar CHC</h1>
          <p style="margin: 0; font-size: 0.8rem; color: #64748b;">Charitable Healthcare Centre</p>
          <p style="margin: 0; font-size: 0.75rem; color: #64748b;">Phone: +8801912562131 | Email: info@alamnagar-chc.org</p>
        </div>
      </div>
      <div style="text-align: right;">
        <h2 style="margin: 0; font-size: 1.1rem; color: #0f172a;">Dr. ${escapeHTML(docName.replace(/^Dr\.\s+/i, ''))}</h2>
        <p style="margin: 0; font-size: 0.85rem; color: #475569;">${escapeHTML(docSpecialty)}</p>
        <p style="margin: 0; font-size: 0.8rem; color: #64748b;">${escapeHTML(docHours)}</p>
      </div>
    </div>
    
    <div style="border-bottom: 2px solid #0d9488; margin-bottom: 1rem;"></div>
    
    <!-- Patient Info -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; font-size: 0.9rem; margin-bottom: 1rem;">
      <div><strong>Patient Name:</strong> ${escapeHTML(pName)}</div>
      <div><strong>Age:</strong> ${escapeHTML(pAge)}</div>
      <div><strong>Gender:</strong> ${escapeHTML(pGender)}</div>
      <div><strong>Date:</strong> ${escapeHTML(pDate)}</div>
      <div style="grid-column: span 2;"><strong>Address:</strong> ${escapeHTML(pAddress)}</div>
      <div><strong>Weight:</strong> ${escapeHTML(pWeight)}</div>
      <div><strong>Phone:</strong> ${escapeHTML(pPhone)}</div>
    </div>
    
    <div style="border-bottom: 1px solid #e2e8f0; margin-bottom: 1.5rem;"></div>
    
    <!-- Body -->
    <div style="display: grid; grid-template-columns: 250px 1fr; gap: 2rem;">
      <!-- Sidebar -->
      <div>
        <div style="font-weight: 700; font-size: 0.9rem; margin-bottom: 0.25rem;">OBSERVATIONS & SYMPTOMS</div>
        <p style="font-size: 0.85rem; line-height: 1.5; color: #334155; margin-top: 0;">${escapeHTML(obs)}</p>
        
        ${vitalsHtml}
        
        <div style="font-weight: 700; font-size: 0.9rem; margin-top: 1.5rem; margin-bottom: 0.25rem;">RECOMMENDED DIAGNOSTICS</div>
        <ul style="font-size: 0.85rem; line-height: 1.5; color: #334155; padding-left: 1.2rem; margin-top: 0;">
          ${diagsHtml}
        </ul>
      </div>
      
      <!-- Main -->
      <div>
        <div style="font-size: 2rem; font-weight: 700; color: #0d9488; margin-bottom: 1rem;">Rx</div>
        <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
          <thead>
            <tr style="border-bottom: 2px solid #e2e8f0;">
              <th style="padding: 0.5rem; text-align: left;">Medicine Name</th>
              <th style="padding: 0.5rem; text-align: left;">Dosage</th>
              <th style="padding: 0.5rem; text-align: left;">Instructions</th>
              <th style="padding: 0.5rem; text-align: left;">Duration</th>
            </tr>
          </thead>
          <tbody>
            ${medsHtml}
          </tbody>
        </table>
      </div>
    </div>
    
    <!-- Footer -->
    <div style="margin-top: 4rem; text-align: right;">
      ${sigImg}
      <div style="display: inline-block; border-top: 1px solid #475569; width: 200px; padding-top: 0.5rem; text-align: center; font-size: 0.85rem; font-weight: 600;">
        <span style="text-decoration:overline; font-size: 0.8rem; color:#475569;">Dr. ${escapeHTML(docName.replace(/^Dr\.\s+/i, ''))}</span>
      </div>
    </div>
  `;
}
