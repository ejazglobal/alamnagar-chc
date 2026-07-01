// State Management
let appointments = [];
let medicines = [];
let activeAppointment = null;
let prescribedMedicines = [];
let signatureBase64 = localStorage.getItem('chc_doctor_sig') || ''; // Cache doctor's signature in localStorage for convenience
let isFallbackMode = false;

// DOM Elements
const queueList = document.getElementById('queue-list');
const queueCount = document.getElementById('queue-count');
const emptyState = document.getElementById('prescription-empty-state');
const activeBuilder = document.getElementById('prescription-active-builder');
const welcomeText = document.getElementById('doc-welcome');
let selectedMedicine = null;

let doctorProfile = null;

// Auth validation
document.addEventListener('DOMContentLoaded', async () => {
  const role = localStorage.getItem('chc_user_role');
  const token = localStorage.getItem('chc_token');
  const name = localStorage.getItem('chc_user_name');

  if (!token || role !== 'Doctor') {
    // Unauthorized
    window.location.href = 'login.html';
    return;
  }

  if (welcomeText) welcomeText.textContent = `Welcome, Dr. ${name}`;

  // Fetch doctor profile to load signature from DB
  try {
    const res = await fetch('/api/doctor/profile', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      doctorProfile = await res.json();
      if (doctorProfile && doctorProfile.signature_url) {
        signatureBase64 = doctorProfile.signature_url;
      }
    }
  } catch (err) {
    console.error('Error loading doctor profile:', err);
  }
  
  // Set signature preview if already cached or loaded
  if (signatureBase64) {
    const preview = document.getElementById('sig-image');
    const prompt = document.getElementById('sig-prompt');
    if (preview && prompt) {
      preview.src = signatureBase64;
      preview.style.display = 'inline-block';
      prompt.style.display = 'none';
    }
  }

  await verifyBackendAndLoad();
});

async function verifyBackendAndLoad() {
  isFallbackMode = false;
  await loadData();
  renderQueue();
  setupMedicineAutocomplete();
}

async function loadData() {
  if (isFallbackMode) {
    // Generate mock appointments from local storage or default list
    appointments = JSON.parse(localStorage.getItem('chc_appointments')) || [];
    // Only filter appointments assigned to this doctor
    const doctorId = parseInt(localStorage.getItem('chc_doctor_id'), 10) || 1;
    appointments = appointments.filter(a => a.doctor_id === doctorId);

    medicines = [
      { id: 1, name: 'Paracetamol 500mg', dosage: '1-0-1', instructions: 'After food' },
      { id: 2, name: 'Amoxicillin 250mg', dosage: '1-1-1', instructions: 'After food' },
      { id: 3, name: 'Omeprazole 20mg', dosage: '1-0-1', instructions: 'Before food' },
      { id: 4, name: 'Metformin 500mg', dosage: '1-0-1', instructions: 'With food' },
      { id: 5, name: 'Atorvastatin 10mg', dosage: '0-0-1', instructions: 'After food' }
    ];
  } else {
    try {
      const token = localStorage.getItem('chc_token');
      // Fetch queue
      const queueRes = await fetch('/api/doctor/appointments', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (queueRes.ok) appointments = await queueRes.json();

      // Fetch medicines
      const medRes = await fetch('/api/medicines', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (medRes.ok) medicines = await medRes.json();
    } catch (e) {
      console.error('Error fetching data:', e);
    }
  }
}

function renderQueue() {
  if (!queueList) return;
  queueList.innerHTML = '';
  
  const activeQueue = appointments.filter(a => a.status !== 'cancelled');
  queueCount.textContent = activeQueue.length;

  if (activeQueue.length === 0) {
    queueList.innerHTML = '<li style="text-align: center; color: var(--text-muted); padding: 2rem 0;">No patients in queue.</li>';
    return;
  }

  activeQueue.forEach(appt => {
    const item = document.createElement('li');
    item.className = 'queue-item';
    if (activeAppointment && activeAppointment.id === appt.id) {
      item.classList.add('active');
    }

    const formattedDate = new Date(appt.appointment_date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });

    const statusBadge = appt.status === 'completed' ? 
      `<span class="badge completed" style="background:#d1fae5; color:#065f46; font-size:0.7rem; padding:0.1rem 0.4rem;">Completed</span>` : 
      appt.status === 'approved' ? 
      `<span class="badge approved" style="background:#e0f2fe; color:#0369a1; font-size:0.7rem; padding:0.1rem 0.4rem;">Approved</span>` :
      `<span class="badge pending" style="background:#fef3c7; color:#92400e; font-size:0.7rem; padding:0.1rem 0.4rem;">Pending</span>`;

    item.innerHTML = `
      <div class="queue-item-name">
        <span>${escapeHTML(appt.patient_name)}</span>
        ${statusBadge}
      </div>
      <div class="queue-item-meta">
        <span>${formattedDate} at ${appt.appointment_time}</span>
        <span style="font-weight:600; color:var(--primary-color);">#${appt.id}</span>
      </div>
    `;

    item.addEventListener('click', () => selectPatient(appt));
    queueList.appendChild(item);
  });
}

function setupMedicineAutocomplete() {
  const searchInput = document.getElementById('med-search-input');
  const resultsDiv = document.getElementById('med-search-results');
  if (!searchInput || !resultsDiv) return;

  let debounceTimer;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    const query = e.target.value.trim();
    if (query.length < 2) {
      resultsDiv.innerHTML = '';
      resultsDiv.style.display = 'none';
      selectedMedicine = null;
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        let results = [];
        if (isFallbackMode) {
          // In fallback mock mode, search local medicines array
          results = medicines.filter(m => 
            m.name.toLowerCase().includes(query.toLowerCase())
          );
        } else {
          const token = localStorage.getItem('chc_token');
          const response = await fetch(`/api/medicines?q=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (response.ok) {
            results = await response.json();
          }
        }

        resultsDiv.innerHTML = '';
        if (results.length === 0) {
          resultsDiv.innerHTML = '<div style="padding: 0.5rem 1rem; color: var(--text-muted); font-size: 0.85rem;">No medicines found</div>';
          resultsDiv.style.display = 'block';
          return;
        }

        results.forEach(med => {
          const div = document.createElement('div');
          div.style.padding = '0.5rem 1rem';
          div.style.cursor = 'pointer';
          div.style.fontSize = '0.85rem';
          div.style.borderBottom = '1px solid #f1f5f9';
          div.className = 'autocomplete-suggestion';
          
          const strengthText = med.strength ? ` - ${med.strength}` : '';
          const genericText = med.generic ? ` (${med.generic})` : '';
          const mfgText = med.manufacturer ? ` [${med.manufacturer}]` : '';
          div.innerHTML = `<strong>${escapeHTML(med.name)}</strong>${escapeHTML(strengthText)}${escapeHTML(genericText)}<span style="display:block; font-size:0.75rem; color:var(--text-muted);">${escapeHTML(med.dosage_form || 'Tablet')} - ${escapeHTML(mfgText)}</span>`;
          
          div.addEventListener('click', () => {
            searchInput.value = `${med.name}${strengthText}`;
            selectedMedicine = med;
            resultsDiv.innerHTML = '';
            resultsDiv.style.display = 'none';
          });

          div.addEventListener('mouseenter', () => {
            div.style.backgroundColor = 'var(--primary-light)';
          });
          div.addEventListener('mouseleave', () => {
            div.style.backgroundColor = 'transparent';
          });

          resultsDiv.appendChild(div);
        });

        resultsDiv.style.display = 'block';
      } catch (err) {
        console.error('Error auto-completing medicine:', err);
      }
    }, 250); // 250ms debounce
  });

  // Hide suggestions when clicking outside
  document.addEventListener('click', (e) => {
    if (e.target !== searchInput && e.target !== resultsDiv && !resultsDiv.contains(e.target)) {
      resultsDiv.style.display = 'none';
    }
  });
}

async function selectPatient(appointment) {
  activeAppointment = appointment;
  renderQueue(); // update active styling

  // Load Patient Banner
  document.getElementById('patient-banner-name').textContent = appointment.patient_name;
  document.getElementById('patient-banner-phone').textContent = appointment.phone;
  document.getElementById('patient-banner-email').textContent = appointment.email;
  document.getElementById('patient-banner-date').textContent = `${appointment.appointment_date} at ${appointment.appointment_time}`;
  document.getElementById('patient-banner-notes').textContent = appointment.notes || 'None';
  
  const statusBadge = document.getElementById('patient-banner-status');
  statusBadge.textContent = appointment.status.toUpperCase();
  statusBadge.className = `badge ${appointment.status}`;

  // Load form details
  document.getElementById('obs-input').value = '';
  document.getElementById('diag-custom').value = '';
  document.querySelectorAll('#diag-checkboxes input[type="checkbox"]').forEach(cb => cb.checked = false);
  
  // Populate demographics inputs
  document.getElementById('patient-age').value = appointment.age || '';
  document.getElementById('patient-gender').value = appointment.gender || 'Male';
  document.getElementById('patient-weight').value = appointment.weight || '';
  document.getElementById('patient-address').value = appointment.address || appointment.user_profile_address || '';

  prescribedMedicines = [];
  renderMedRows();

  // Hide empty state & show builder
  emptyState.style.display = 'none';
  activeBuilder.style.display = 'block';

  // Load existing prescription if any
  await loadPrescription(appointment.id);
}

async function loadPrescription(appointmentId) {
  let prescription = null;
  
  if (isFallbackMode) {
    const localPres = JSON.parse(localStorage.getItem('chc_mock_prescriptions')) || [];
    prescription = localPres.find(p => p.appointment_id === appointmentId);
  } else {
    try {
      const token = localStorage.getItem('chc_token');
      const res = await fetch(`/api/prescriptions/${appointmentId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        prescription = await res.json();
      }
    } catch (e) {
      console.error('Error loading prescription:', e);
    }
  }

  if (prescription) {
    document.getElementById('obs-input').value = prescription.observations || '';
    
    // Parse diagnostics
    if (prescription.diagnostics) {
      const tests = prescription.diagnostics.split(', ');
      const customTests = [];
      tests.forEach(test => {
        const cb = document.querySelector(`#diag-checkboxes input[value="${test}"]`);
        if (cb) {
          cb.checked = true;
        } else {
          customTests.push(test);
        }
      });
      document.getElementById('diag-custom').value = customTests.join(', ');
    }

    // Parse medicines
    if (prescription.medicines) {
      prescribedMedicines = Array.isArray(prescription.medicines) ? 
        prescription.medicines : JSON.parse(prescription.medicines);
      renderMedRows();
    }

    // Set signature if available
    if (prescription.doctor_signature) {
      signatureBase64 = prescription.doctor_signature;
      const preview = document.getElementById('sig-image');
      const prompt = document.getElementById('sig-prompt');
      if (preview && prompt) {
        preview.src = signatureBase64;
        preview.style.display = 'inline-block';
        prompt.style.display = 'none';
      }
    }
    
    // Show share controls
    document.getElementById('share-btn-ctrl').style.display = 'inline-block';
  } else {
    document.getElementById('share-btn-ctrl').style.display = 'none';
  }
}

window.addMedicineRow = function() {
  const searchInput = document.getElementById('med-search-input');
  if (!selectedMedicine) {
    const textVal = searchInput ? searchInput.value.trim() : '';
    if (!textVal) {
      alert('Please type or select a medicine.');
      return;
    }
    selectedMedicine = { id: null, name: textVal };
  }
  
  const dosage = document.getElementById('med-dosage').value;
  const timing = document.getElementById('med-timing').value;
  const duration = document.getElementById('med-duration').value.trim();

  if (!duration) {
    alert('Please provide a duration.');
    return;
  }

  const rowData = {
    id: selectedMedicine.id,
    name: selectedMedicine.name,
    dosage,
    timing,
    duration
  };

  prescribedMedicines.push(rowData);
  renderMedRows();

  if (searchInput) searchInput.value = '';
  selectedMedicine = null;
};

function renderMedRows() {
  const tbody = document.getElementById('med-rows-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  
  if (prescribedMedicines.length === 0) {
    tbody.innerHTML = `
      <tr id="med-empty-row">
        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem 0;">No medicines prescribed yet.</td>
      </tr>
    `;
    return;
  }

  prescribedMedicines.forEach((med, idx) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>${escapeHTML(med.name)}</strong></td>
      <td>${escapeHTML(med.dosage)}</td>
      <td>${escapeHTML(med.timing)}</td>
      <td>${escapeHTML(med.duration)}</td>
      <td>
        <button type="button" class="med-remove-btn" onclick="removeMedicineRow(${idx})">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

window.removeMedicineRow = function(idx) {
  prescribedMedicines.splice(idx, 1);
  renderMedRows();
};

// Handle Signature Upload Base64 conversion
window.handleSignatureUpload = function(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    alert('Signature image must be less than 2MB.');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(evt) {
    signatureBase64 = evt.target.result;
    
    // Save signature cache in local storage for convenience
    localStorage.setItem('chc_doctor_sig', signatureBase64);

    const preview = document.getElementById('sig-image');
    const prompt = document.getElementById('sig-prompt');
    if (preview && prompt) {
      preview.src = signatureBase64;
      preview.style.display = 'inline-block';
      prompt.style.display = 'none';
    }
  };
  reader.readAsDataURL(file);
};

// Save prescription details to backend
window.savePrescription = async function() {
  if (!activeAppointment) return;

  if (prescribedMedicines.length === 0) {
    alert('Please prescribe at least one medicine.');
    return;
  }

  if (!signatureBase64) {
    alert('Please upload your signature before saving the prescription.');
    return;
  }

  // Compile diagnostics check list
  const diagnosticsArray = [];
  document.querySelectorAll('#diag-checkboxes input[type="checkbox"]:checked').forEach(cb => {
    diagnosticsArray.push(cb.value);
  });
  
  const customDiag = document.getElementById('diag-custom').value.trim();
  if (customDiag) {
    diagnosticsArray.push(customDiag);
  }

  const observations = document.getElementById('obs-input').value.trim();
  const diagnostics = diagnosticsArray.join(', ');

  const banner = document.getElementById('prescription-status');

  const age = document.getElementById('patient-age').value.trim();
  const gender = document.getElementById('patient-gender').value;
  const weight = document.getElementById('patient-weight').value.trim();
  const address = document.getElementById('patient-address').value.trim();

  if (!age) {
    alert('Please enter patient age.');
    return;
  }

  const payload = {
    appointment_id: activeAppointment.id,
    diagnostics,
    observations,
    medicines: prescribedMedicines,
    doctor_signature: signatureBase64,
    age,
    gender,
    weight,
    address
  };

  try {
    if (isFallbackMode) {
      // Offline fallback saving
      const localPres = JSON.parse(localStorage.getItem('chc_mock_prescriptions')) || [];
      const idx = localPres.findIndex(p => p.appointment_id === activeAppointment.id);
      
      const savedPres = { id: Date.now(), ...payload };
      if (idx !== -1) {
        localPres[idx] = savedPres;
      } else {
        localPres.push(savedPres);
      }
      localStorage.setItem('chc_mock_prescriptions', JSON.stringify(localPres));

      // Mark appointment completed locally
      const localAppts = JSON.parse(localStorage.getItem('chc_appointments')) || [];
      const apptIdx = localAppts.findIndex(a => a.id === activeAppointment.id);
      if (apptIdx !== -1) {
        localAppts[apptIdx].status = 'completed';
        localStorage.setItem('chc_appointments', JSON.stringify(localAppts));
      }

      showStatusBanner(banner, 'Prescription saved successfully (Offline fallback). Visit marked COMPLETED.', 'success');
      
      // Update local state
      activeAppointment.status = 'completed';
      const stateIdx = appointments.findIndex(a => a.id === activeAppointment.id);
      if (stateIdx !== -1) appointments[stateIdx].status = 'completed';
      
      renderQueue();
      selectPatient(activeAppointment);
    } else {
      const token = localStorage.getItem('chc_token');
      const response = await fetch('/api/prescriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to save prescription.');
      }

      showStatusBanner(banner, 'Prescription saved successfully. Patient visit marked COMPLETED.', 'success');
      
      // Sync signature to database profile if it differs
      if (doctorProfile && doctorProfile.signature_url !== signatureBase64) {
        try {
          await fetch('/api/doctor/profile/signature', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ signature_url: signatureBase64 })
          });
          doctorProfile.signature_url = signatureBase64;
          console.log('Signature synced to backend.');
        } catch (sigErr) {
          console.error('Failed to sync signature to backend:', sigErr);
        }
      }

      // Update status and reload lists
      activeAppointment.status = 'completed';
      await loadData();
      renderQueue();
      selectPatient(activeAppointment);
    }
  } catch (error) {
    console.error(error);
    showStatusBanner(banner, error.message || 'Error occurred saving prescription.', 'error');
  }
};

function showStatusBanner(element, message, type) {
  if (!element) return;
  element.textContent = message;
  element.className = `status-banner ${type}`;
  element.style.display = 'block';
  element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  setTimeout(() => {
    element.style.display = 'none';
  }, 7000);
}

// Print / PDF export
window.printPrescription = function() {
  if (!activeAppointment) return;

  // 1. Populate Doctor info
  const docName = doctorProfile ? doctorProfile.name_en : 'Doctor Name';
  const docSpecialty = doctorProfile ? doctorProfile.specialty_en : 'Specialty';
  const docHours = doctorProfile ? doctorProfile.visiting_hours_en : 'Visiting Hours';
  
  document.getElementById('print-doctor-name-display').textContent = `Dr. ${docName.replace(/^Dr\.\s+/i, '')}`;
  document.getElementById('print-doctor-specialty-display').textContent = docSpecialty;
  document.getElementById('print-doctor-hours-display').textContent = docHours;

  // 2. Populate Patient Info
  const age = document.getElementById('patient-age').value.trim();
  const gender = document.getElementById('patient-gender').value;
  const weight = document.getElementById('patient-weight').value.trim() || 'N/A';
  const address = document.getElementById('patient-address').value.trim() || 'N/A';
  
  document.getElementById('print-patient-name').textContent = activeAppointment.patient_name;
  document.getElementById('print-patient-age').textContent = age;
  document.getElementById('print-patient-gender').textContent = gender;
  document.getElementById('print-patient-date').textContent = new Date(activeAppointment.appointment_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  document.getElementById('print-patient-address').textContent = address;
  document.getElementById('print-patient-weight').textContent = weight;
  document.getElementById('print-patient-phone').textContent = activeAppointment.phone;

  // 3. Observations and Diagnostics
  document.getElementById('print-patient-obs').textContent = document.getElementById('obs-input').value.trim() || 'None';
  
  const diagList = document.getElementById('print-patient-diags');
  diagList.innerHTML = '';
  document.querySelectorAll('#diag-checkboxes input[type="checkbox"]:checked').forEach(cb => {
    const li = document.createElement('li');
    li.textContent = cb.value;
    diagList.appendChild(li);
  });
  const customDiag = document.getElementById('diag-custom').value.trim();
  if (customDiag) {
    const li = document.createElement('li');
    li.textContent = customDiag;
    diagList.appendChild(li);
  }
  if (diagList.children.length === 0) {
    diagList.innerHTML = '<li>None recommended</li>';
  }

  // 4. Medicines
  const medTbody = document.getElementById('print-med-tbody');
  medTbody.innerHTML = '';
  if (prescribedMedicines.length === 0) {
    medTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No medicines prescribed</td></tr>';
  } else {
    prescribedMedicines.forEach(m => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHTML(m.name)}</strong></td>
        <td>${escapeHTML(m.dosage)}</td>
        <td>${escapeHTML(m.timing)}</td>
        <td>${escapeHTML(m.duration)}</td>
      `;
      medTbody.appendChild(tr);
    });
  }

  // 5. Signature
  const printSigImg = document.getElementById('print-doctor-signature');
  const printSigName = document.getElementById('print-sig-doc-name');
  if (signatureBase64) {
    printSigImg.src = signatureBase64;
    printSigImg.style.display = 'block';
  } else {
    printSigImg.style.display = 'none';
  }
  printSigName.innerHTML = `<span style="text-decoration:overline; font-size: 0.8rem; color:#475569;">Dr. ${docName.replace(/^Dr\.\s+/i, '')}</span>`;

  window.print();
};

// Share & messaging handles
window.openShareModal = function() {
  if (!activeAppointment) return;

  const modal = document.getElementById('share-modal');
  const whatsapp = document.getElementById('share-whatsapp');
  const email = document.getElementById('share-email');

  const age = document.getElementById('patient-age').value.trim();
  const gender = document.getElementById('patient-gender').value;
  const weight = document.getElementById('patient-weight').value.trim() || 'N/A';

  // Format observations and medicines text
  let medsText = '';
  prescribedMedicines.forEach(m => {
    medsText += `- ${m.name} (${m.dosage}, ${m.timing}, ${m.duration})\n`;
  });

  const messageText = `Hello ${activeAppointment.patient_name},\n\nYour digital prescription from Alamnagar CHC has been prepared.\n\nPatient Details:\n- Age: ${age}\n- Gender: ${gender}\n- Weight: ${weight}\n\nMedicines prescribed:\n${medsText}\nObservations:\n${document.getElementById('obs-input').value.trim()}\n\nWish you a speedy recovery!`;

  // WhatsApp link
  const formattedPhone = activeAppointment.phone.replace(/[^0-9]/g, '');
  whatsapp.href = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(messageText)}`;

  // Email client link
  email.href = `mailto:${activeAppointment.email}?subject=Your%20Digital%20Prescription%20-%20Alamnagar%20CHC&body=${encodeURIComponent(messageText)}`;

  modal.style.display = 'flex';
};

window.closeShareModal = function(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close')) return;
  const modal = document.getElementById('share-modal');
  if (modal) modal.style.display = 'none';
};

// General logout handler
window.logoutUser = function(e) {
  if (e) e.preventDefault();
  localStorage.removeItem('chc_token');
  localStorage.removeItem('chc_user_role');
  localStorage.removeItem('chc_user_name');
  localStorage.removeItem('chc_user_email');
  localStorage.removeItem('chc_user_id');
  localStorage.removeItem('chc_user_permissions');
  localStorage.removeItem('chc_doctor_id');
  window.location.href = 'index.html';
};

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
