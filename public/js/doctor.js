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

  const validRoles = ['doctor', 'admin', 'staff'];
  if (!token || !role || !validRoles.includes(role.toLowerCase())) {
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
      if (doctorProfile) {
        if (doctorProfile.signature_url) {
          signatureBase64 = doctorProfile.signature_url;
        }
        // Populate profile modal fields
        const profName = document.getElementById('profile-name-en');
        const profSpecialty = document.getElementById('profile-specialty-en');
        const profHours = document.getElementById('profile-hours-en');
        const profSigImg = document.getElementById('profile-sig-image');
        const profSigPrompt = document.getElementById('profile-sig-prompt');
        
        if (profName) profName.value = doctorProfile.name_en || '';
        if (profSpecialty) profSpecialty.value = doctorProfile.specialty_en || '';
        if (profHours) profHours.value = doctorProfile.visiting_hours_en || '';
        
        if (signatureBase64 && profSigImg && profSigPrompt) {
          profSigImg.src = signatureBase64;
          profSigImg.style.display = 'inline-block';
          profSigPrompt.style.display = 'none';
        }
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
  setupPatientSearch();
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

function renderQueue(listToRender) {
  if (!queueList) return;
  queueList.innerHTML = '';
  
  const list = listToRender || appointments;
  const activeQueue = list.filter(a => a.status !== 'cancelled');
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

function getDosageAbbreviation(dosageForm) {
  if (!dosageForm) return '';
  const form = dosageForm.toLowerCase().trim();
  if (form.includes('tablet')) return 'Tab.';
  if (form.includes('capsule')) return 'Cap.';
  if (form.includes('syrup')) return 'Syp.';
  if (form.includes('suspension')) return 'Susp.';
  if (form.includes('injection')) return 'Inj.';
  if (form.includes('drop')) return 'Drop.';
  if (form.includes('ointment')) return 'Oint.';
  if (form.includes('cream')) return 'Cream';
  if (form.includes('gel')) return 'Gel';
  if (form.includes('inhaler')) return 'Inhaler';
  if (form.includes('suppository')) return 'Supp.';
  // Default fallback: capitalize first letter and add a period
  return dosageForm.charAt(0).toUpperCase() + dosageForm.slice(1) + '.';
}

function formatMedicineName(med) {
  const prefix = getDosageAbbreviation(med.dosage_form);
  const strength = med.strength ? ` ${med.strength}` : '';
  const brand = med.name || med.brand_name || '';
  return `${prefix ? prefix + ' ' : ''}${brand}${strength}`.trim();
}

function getUnitPrice(pkg) {
  if (!pkg) return 0;
  // Try matching Unit Price first (handles commas, e.g. 1,200.00)
  const mUnit = pkg.match(/Unit\s+Price:\s*৳?\s*([0-9.,]+)/i);
  if (mUnit) {
    return parseFloat(mUnit[1].replace(/,/g, ''));
  }
  // Try matching generic price pattern (e.g. 50 ml bottle: ৳ 45.00)
  const mGeneric = pkg.match(/৳\s*([0-9.,]+)/);
  if (mGeneric) {
    return parseFloat(mGeneric[1].replace(/,/g, ''));
  }
  return 0;
}

function isMultiDose(med) {
  if (!med) return false;
  const name = (med.name || '').toLowerCase();
  const dosageForm = (med.dosage_form || '').toLowerCase();
  const pkg = (med.package_container || '').toLowerCase();
  
  const multiDoseKeywords = [
    'syrup', 'syp.', 'suspension', 'susp.', 'oral solution',
    'ointment', 'oint.', 'cream', 'gel', 'drop', 'spray',
    'inhaler', 'lotion', 'elixir', 'emulsion', 'liniment', 'paste'
  ];
  
  const hasKeyword = multiDoseKeywords.some(keyword => 
    name.includes(keyword) || dosageForm.includes(keyword)
  );
  
  // Package container does not contain "unit price", indicating it's priced per container/pack
  const isPackPriced = pkg && !pkg.includes('unit price');
  
  return !!(hasKeyword || isPackPriced);
}

function calculateQuantity(dosage, durationStr) {
  const durationNum = parseInt(durationStr.replace(/\D/g, ''), 10) || 0;
  let multiplier = 1;
  const lowerDuration = durationStr.toLowerCase();
  if (lowerDuration.includes('week')) multiplier = 7;
  else if (lowerDuration.includes('month')) multiplier = 30;
  const totalDays = durationNum * multiplier;

  let dosesPerDay = 1;
  if (dosage.includes('-')) {
    const parts = dosage.split('-');
    dosesPerDay = parts.reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
  } else if (dosage.toLowerCase() === 'as needed') {
    dosesPerDay = 1;
  }

  return Math.ceil(totalDays * dosesPerDay);
}

async function fetchAndShowAlternatives(med) {
  const wrapper = document.getElementById('alternatives-wrapper');
  const list = document.getElementById('alternatives-list');
  if (!wrapper || !list) return;

  wrapper.style.display = 'none';
  list.innerHTML = '';

  if (!med || !med.id) return;

  try {
    const token = localStorage.getItem('chc_token');
    const response = await fetch(`/api/medicines/${med.id}/alternatives`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!response.ok) return;

    const alts = await response.json();
    if (alts.length === 0) return;

    const currentPrice = getUnitPrice(med.package_container);
    if (!currentPrice) return;

    alts.forEach(alt => {
      const altPrice = getUnitPrice(alt.package_container);
      if (!altPrice || altPrice >= currentPrice) return;

      const savingsPct = Math.round(((currentPrice - altPrice) / currentPrice) * 100);
      if (savingsPct <= 0) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.style.background = 'white';
      btn.style.border = '1px solid #bbf7d0';
      btn.style.borderRadius = '6px';
      btn.style.padding = '0.35rem 0.6rem';
      btn.style.fontSize = '0.75rem';
      btn.style.cursor = 'pointer';
      btn.style.color = '#15803d';
      btn.style.display = 'inline-flex';
      btn.style.alignItems = 'center';
      btn.style.gap = '0.25rem';
      btn.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
      btn.style.transition = 'all 0.15s ease';

      btn.innerHTML = `<strong>${escapeHTML(alt.name || alt.brand_name || '')}</strong> (৳${altPrice.toFixed(2)}) <span style="background:#dcfce7; padding:1px 4px; border-radius:4px; font-weight:bold; font-size:0.7rem; color:#15803d;">Save ${savingsPct}%</span>`;

      btn.addEventListener('mouseenter', () => {
        btn.style.borderColor = '#86efac';
        btn.style.background = '#f0fdf4';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.borderColor = '#bbf7d0';
        btn.style.background = 'white';
      });

      btn.addEventListener('click', () => {
        const searchInput = document.getElementById('med-search-input');
        const formattedAltName = formatMedicineName(alt);
        if (searchInput) searchInput.value = formattedAltName;
        selectedMedicine = {
          id: alt.id,
          name: formattedAltName,
          dosage_form: alt.dosage_form,
          strength: alt.strength,
          generic: alt.generic,
          package_container: alt.package_container,
          package_size: alt.package_size
        };
        fetchAndShowAlternatives(alt);
      });

      list.appendChild(btn);
    });

    if (list.children.length > 0) {
      wrapper.style.display = 'block';
    }
  } catch (err) {
    console.error('Error loading alternatives:', err);
  }
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
      const wrapper = document.getElementById('alternatives-wrapper');
      if (wrapper) wrapper.style.display = 'none';
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {
        let results = [];
        if (isFallbackMode) {
          const q = query.toLowerCase();
          const ranked = medicines
            .filter(m =>
              m.name.toLowerCase().includes(q) ||
              (m.generic && m.generic.toLowerCase().includes(q))
            )
            .map(m => {
              const nameLower = m.name.toLowerCase();
              let rank;
              if (nameLower.startsWith(q))           rank = 1;
              else if (nameLower.includes(q))         rank = 2;
              else                                    rank = 3;
              return { ...m, rank };
            })
            .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
            .slice(0, 60);
          results = ranked.map(({ rank, ...rest }) => rest);
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
          
          const formattedName = formatMedicineName(med);
          const genericText = med.generic ? ` (${med.generic})` : '';
          const mfgText = med.manufacturer ? ` [${med.manufacturer}]` : '';

          const pricePart = med.package_container ? med.package_container.split(',')[0].replace('Unit Price: ৳', '').trim() : '';
          const priceDisplay = pricePart ? ` <span style="float: right; font-weight: bold; color: #16a34a; background: #f0fdf4; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem;">৳ ${pricePart}</span>` : '';

          div.innerHTML = `<div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <strong>${escapeHTML(formattedName)}</strong>${escapeHTML(genericText)}
              <span style="display:block; font-size:0.75rem; color:var(--text-muted);">${escapeHTML(med.dosage_form || '')} - ${escapeHTML(mfgText)}</span>
            </div>
            ${priceDisplay}
          </div>`;
          
          div.addEventListener('click', () => {
            searchInput.value = formattedName;
            selectedMedicine = {
              id: med.id,
              name: formattedName,
              dosage_form: med.dosage_form,
              strength: med.strength,
              generic: med.generic,
              package_container: med.package_container,
              package_size: med.package_size
            };
            resultsDiv.innerHTML = '';
            resultsDiv.style.display = 'none';
            fetchAndShowAlternatives(med);
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
    }, 250);
  });

  document.addEventListener('click', (e) => {
    if (e.target !== searchInput && e.target !== resultsDiv && !resultsDiv.contains(e.target)) {
      resultsDiv.style.display = 'none';
    }
  });
}

async function selectPatient(appointment) {
  activeAppointment = appointment;
  renderQueue(); // update active styling

  // Switch details UI back to static display
  document.getElementById('patient-details-static').style.display = 'block';
  document.getElementById('patient-details-edit').style.display = 'none';

  // Load Patient Banner
  document.getElementById('patient-banner-name').textContent = appointment.patient_name;
  document.getElementById('patient-banner-phone').textContent = appointment.phone;
  document.getElementById('patient-banner-email').textContent = appointment.email || 'None';
  document.getElementById('patient-banner-date').textContent = `${appointment.appointment_date} at ${appointment.appointment_time}`;
  document.getElementById('patient-banner-notes').textContent = appointment.notes || 'None';
  
  const statusBadge = document.getElementById('patient-banner-status');
  statusBadge.textContent = appointment.status.toUpperCase();
  statusBadge.className = `badge ${appointment.status}`;

  // Load form details
  document.getElementById('obs-input').value = '';
  document.getElementById('findings-input').value = '';
  document.getElementById('diag-custom').value = '';
  document.querySelectorAll('#diag-checkboxes input[type="checkbox"]').forEach(cb => cb.checked = false);
  // Clear vitals
  ['vital-bp-sys','vital-temp','vital-pulse'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  
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

  // Enable save button (which might have been disabled during viewing history of inactive patient)
  const saveBtn = document.querySelector('button[onclick="savePrescription()"]');
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save & Complete Visit';
  }

  // Load patient history timeline
  loadPatientHistory(appointment.phone);

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
    
    // Load findings from rich_state
    const rich = prescription.rich_state || {};
    document.getElementById('findings-input').value = rich.findings || '';

    document.getElementById('vital-bp-sys').value = prescription.bp || '';
    document.getElementById('vital-temp').value = prescription.temperature || '';
    document.getElementById('vital-pulse').value = prescription.pulse || '';
    
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

function getGenericIngredients(genericStr) {
  if (!genericStr) return [];
  return genericStr
    .toLowerCase()
    .replace(/\s*(?:\+|,|\/|&|\band\b)\s*/g, '|')
    .split('|')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function getOverlappingIngredients(gen1, gen2) {
  const ing1 = getGenericIngredients(gen1);
  const ing2 = getGenericIngredients(gen2);
  return ing1.filter(i => ing2.includes(i));
}

function showDuplicateConfirmModal(message, onYes, onNo, onCancel) {
  const modal = document.getElementById('duplicate-confirm-modal');
  const msgEl = document.getElementById('duplicate-confirm-message');
  const btnYes = document.getElementById('duplicate-confirm-yes');
  const btnNo = document.getElementById('duplicate-confirm-no');
  const btnClose = document.getElementById('duplicate-confirm-close');
  
  if (!modal || !msgEl || !btnYes || !btnNo) {
    if (confirm(message)) {
      onYes();
    } else {
      onCancel();
    }
    return;
  }

  msgEl.textContent = message;
  modal.style.display = 'flex';

  const handleYes = () => {
    modal.style.display = 'none';
    cleanup();
    onYes();
  };

  const handleNo = () => {
    modal.style.display = 'none';
    cleanup();
    onNo();
  };

  const handleClose = () => {
    modal.style.display = 'none';
    cleanup();
    onCancel();
  };

  const cleanup = () => {
    btnYes.removeEventListener('click', handleYes);
    btnNo.removeEventListener('click', handleNo);
    if (btnClose) btnClose.removeEventListener('click', handleClose);
  };

  cleanup();
  btnYes.addEventListener('click', handleYes);
  btnNo.addEventListener('click', handleNo);
  if (btnClose) btnClose.addEventListener('click', handleClose);
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
    duration,
    package_container: selectedMedicine.package_container || null,
    package_size: selectedMedicine.package_size || null,
    dosage_form: selectedMedicine.dosage_form || null,
    generic: selectedMedicine.generic || null
  };

  // Check for duplicates (same brand name or overlapping generic ingredients)
  let duplicateIndex = -1;
  let dupReason = '';
  let dupName = '';

  for (let i = 0; i < prescribedMedicines.length; i++) {
    const med = prescribedMedicines[i];
    
    // Check exact brand name match
    if (med.name && rowData.name && med.name.trim().toLowerCase() === rowData.name.trim().toLowerCase()) {
      duplicateIndex = i;
      dupReason = `same brand name (${med.name})`;
      dupName = med.name;
      break;
    }
    
    // Check overlapping generic composition match (if both have generic specified)
    if (med.generic && rowData.generic) {
      const overlaps = getOverlappingIngredients(med.generic, rowData.generic);
      if (overlaps.length > 0) {
        duplicateIndex = i;
        dupReason = `overlapping generic composition (${overlaps.join(', ')})`;
        dupName = med.name;
        break;
      }
    }
  }

  const clearFields = () => {
    if (searchInput) searchInput.value = '';
    selectedMedicine = null;
    const wrapper = document.getElementById('alternatives-wrapper');
    if (wrapper) wrapper.style.display = 'none';
  };

  if (duplicateIndex !== -1) {
    showDuplicateConfirmModal(
      `Medicine "${rowData.name}" has the ${dupReason} as the already prescribed medicine "${dupName}".\n\n` +
      `Would you like to replace the existing prescription of "${dupName}" with "${rowData.name}"?`,
      () => {
        // YES clicked: replace, render, and clear
        prescribedMedicines[duplicateIndex] = rowData;
        renderMedRows();
        clearFields();
      },
      () => {
        // NO clicked (Keep Both): do not replace, but add as a new item and clear
        prescribedMedicines.push(rowData);
        renderMedRows();
        clearFields();
      },
      () => {
        // CANCEL clicked (Close button): do not replace, do not add, just clear fields
        clearFields();
      }
    );
    return;
  }

  prescribedMedicines.push(rowData);
  renderMedRows();
  clearFields();
};

function renderMedRows() {
  const tbody = document.getElementById('med-rows-tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  
  let totalCost = 0;

  if (prescribedMedicines.length === 0) {
    tbody.innerHTML = `
      <tr id="med-empty-row">
        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem 0;">No medicines prescribed yet.</td>
      </tr>
    `;
    const totalValSpan = document.getElementById('total-price-val');
    if (totalValSpan) totalValSpan.textContent = '0.00';
    return;
  }

  prescribedMedicines.forEach((med, idx) => {
    const unitPrice = getUnitPrice(med.package_container);
    const isMulti = isMultiDose(med);
    const qty = isMulti ? 1 : calculateQuantity(med.dosage, med.duration);
    const itemCost = unitPrice * qty;
    totalCost += itemCost;

    const row1 = document.createElement('tr');
    row1.style.borderBottom = 'none';
    
    let priceSubtext = '';
    if (unitPrice > 0) {
      if (isMulti) {
        priceSubtext = `<div style="font-size:0.75rem; color:#16a34a; margin-top:0.15rem;">৳${unitPrice.toFixed(2)}/pack × 1 pack = <strong>৳${itemCost.toFixed(2)}</strong></div>`;
      } else {
        priceSubtext = `<div style="font-size:0.75rem; color:#16a34a; margin-top:0.15rem;">৳${unitPrice.toFixed(2)}/unit × ${qty} units = <strong>৳${itemCost.toFixed(2)}</strong></div>`;
      }
    }

    row1.innerHTML = `
      <td>
        <strong>${escapeHTML(med.name)}</strong>
        ${priceSubtext}
      </td>
      <td>${escapeHTML(med.dosage)}</td>
      <td>${escapeHTML(med.timing)}</td>
      <td>${escapeHTML(med.duration)}</td>
      <td>
        <button type="button" class="med-remove-btn" onclick="removeMedicineRow(${idx})">Delete</button>
      </td>
    `;
    tbody.appendChild(row1);

    const row2 = document.createElement('tr');
    row2.innerHTML = `
      <td colspan="5" style="padding-top: 0; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border-color);">
        <div style="display: flex; flex-direction: column; gap: 0.25rem;">
          <textarea class="form-control" style="height: 48px; min-height: 48px; font-size: 0.8rem; background: #fafaf9; width: 100%; border: 1px solid #e7e5e4;" 
            placeholder="Custom advice / special instructions for this medicine..."
            oninput="updateMedAdvice(${idx}, this.value)">${escapeHTML(med.advice || '')}</textarea>
        </div>
      </td>
    `;
    tbody.appendChild(row2);
  });

  const totalValSpan = document.getElementById('total-price-val');
  if (totalValSpan) {
    totalValSpan.textContent = totalCost.toFixed(2);
  }
}

window.removeMedicineRow = function(idx) {
  prescribedMedicines.splice(idx, 1);
  renderMedRows();
};

window.updateMedAdvice = function(idx, val) {
  if (prescribedMedicines[idx]) {
    prescribedMedicines[idx].advice = val;
  }
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
  const findingsText = document.getElementById('findings-input').value.trim();
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

  let patient_name = '';
  let phone = '';

  if (activeAppointment.id === 'walkin') {
    patient_name = document.getElementById('walkin-patient-name').value.trim();
    phone = document.getElementById('walkin-patient-phone').value.trim();
    if (!patient_name) {
      alert('Please enter patient name.');
      return;
    }
    if (!phone || !/^\+?[0-9\s\-]{8,15}$/.test(phone)) {
      alert('Please enter a valid mobile number.');
      return;
    }
  }

  const bpVal  = document.getElementById('vital-bp-sys').value.trim();
  const temp   = document.getElementById('vital-temp').value.trim();
  const pulse  = document.getElementById('vital-pulse').value.trim();

  const payload = {
    appointment_id: activeAppointment.id,
    diagnostics,
    observations,
    medicines: prescribedMedicines,
    doctor_signature: signatureBase64,
    age,
    gender,
    weight,
    address,
    patient_name,
    phone,
    bp: bpVal || null,
    temperature: temp || null,
    pulse: pulse || null,
    rich_state: {
      diagnostics,
      observations,
      findings: findingsText,
      medicines: prescribedMedicines,
      bp: bpVal || null,
      temperature: temp || null,
      pulse: pulse || null,
      age,
      gender,
      weight,
      address
    }
  };

  try {
    if (isFallbackMode) {
      let targetId = activeAppointment.id;
      if (activeAppointment.id === 'walkin') {
        targetId = Date.now();
        const localAppts = JSON.parse(localStorage.getItem('chc_appointments')) || [];
        const newApptObj = {
          id: targetId,
          patient_name,
          phone,
          email: '',
          appointment_date: new Date().toISOString().split('T')[0],
          appointment_time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
          status: 'completed',
          age,
          gender,
          weight,
          address,
          notes: 'Walk-In Consultation'
        };
        localAppts.push(newApptObj);
        localStorage.setItem('chc_appointments', JSON.stringify(localAppts));
        appointments.push(newApptObj);
        
        activeAppointment = newApptObj;
        
        // Reset inputs view
        document.getElementById('patient-details-static').style.display = 'block';
        document.getElementById('patient-details-edit').style.display = 'none';
        
        document.getElementById('patient-banner-name').textContent = patient_name;
        document.getElementById('patient-banner-phone').textContent = phone;
        document.getElementById('patient-banner-email').textContent = 'None';
        document.getElementById('patient-banner-date').textContent = `${activeAppointment.appointment_date} at ${activeAppointment.appointment_time}`;
        document.getElementById('patient-banner-notes').textContent = 'Walk-In Consultation';
        const statusBadge = document.getElementById('patient-banner-status');
        statusBadge.textContent = 'COMPLETED';
        statusBadge.className = 'badge completed';
      }

      // Offline fallback saving
      const localPres = JSON.parse(localStorage.getItem('chc_mock_prescriptions')) || [];
      const idx = localPres.findIndex(p => p.appointment_id === targetId);
      
      const savedPres = { id: Date.now(), ...payload, appointment_id: targetId };
      if (idx !== -1) {
        localPres[idx] = savedPres;
      } else {
        localPres.push(savedPres);
      }
      localStorage.setItem('chc_mock_prescriptions', JSON.stringify(localPres));

      // Mark appointment completed locally
      if (activeAppointment.id !== 'walkin') {
        const localAppts = JSON.parse(localStorage.getItem('chc_appointments')) || [];
        const apptIdx = localAppts.findIndex(a => a.id === activeAppointment.id);
        if (apptIdx !== -1) {
          localAppts[apptIdx].status = 'completed';
          localStorage.setItem('chc_appointments', JSON.stringify(localAppts));
        }
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

      if (activeAppointment.id === 'walkin') {
        const resultData = await response.json();
        activeAppointment = {
          id: resultData.appointment_id,
          patient_name: patient_name,
          phone: phone,
          email: '',
          appointment_date: new Date().toISOString().split('T')[0],
          appointment_time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
          status: 'completed',
          age: age,
          gender: gender,
          weight: weight,
          address: address
        };
        
        // Reset details view to static
        document.getElementById('patient-details-static').style.display = 'block';
        document.getElementById('patient-details-edit').style.display = 'none';
        
        document.getElementById('patient-banner-name').textContent = patient_name;
        document.getElementById('patient-banner-phone').textContent = phone;
        document.getElementById('patient-banner-email').textContent = 'None';
        document.getElementById('patient-banner-date').textContent = `${activeAppointment.appointment_date} at ${activeAppointment.appointment_time}`;
        document.getElementById('patient-banner-notes').textContent = 'Walk-In Consultation';
        const statusBadge = document.getElementById('patient-banner-status');
        statusBadge.textContent = 'COMPLETED';
        statusBadge.className = 'badge completed';
      } else {
        activeAppointment.status = 'completed';
      }

      // Update status and reload lists
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
  const obsText = document.getElementById('obs-input').value.trim();
  document.getElementById('print-patient-obs').textContent = obsText || 'None';

  // 3a. Findings block
  const findingsText = document.getElementById('findings-input').value.trim();
  const findingsBlock = document.getElementById('print-findings-block');
  const printFindingsText = document.getElementById('print-patient-findings');
  if (findingsText) {
    printFindingsText.textContent = findingsText;
    findingsBlock.style.display = 'block';
  } else {
    printFindingsText.textContent = '';
    findingsBlock.style.display = 'none';
  }


  // 3b. Vitals block — read from dedicated fields directly
  const bpVal  = document.getElementById('vital-bp-sys').value.trim();
  const temp   = document.getElementById('vital-temp').value.trim();
  const pulse  = document.getElementById('vital-pulse').value.trim();

  const vitalsBlock = document.getElementById('print-vitals-block');
  const vitalsList = document.getElementById('print-vitals-list');
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
    vitalsList.innerHTML = items.join('');
    vitalsBlock.style.display = 'block';
  } else {
    vitalsBlock.style.display = 'none';
  }
  
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
      tr.style.borderBottom = m.advice ? 'none' : '1px solid #e2e8f0';
      tr.innerHTML = `
        <td><strong>${escapeHTML(m.name)}</strong></td>
        <td>${escapeHTML(m.dosage)}</td>
        <td>${escapeHTML(m.timing)}</td>
        <td>${escapeHTML(m.duration)}</td>
      `;
      medTbody.appendChild(tr);

      if (m.advice) {
        const trAdvice = document.createElement('tr');
        trAdvice.innerHTML = `
          <td colspan="4" style="padding-top: 0; padding-bottom: 0.5rem; color: #475569; font-size: 0.8rem; border-bottom: 1px solid #e2e8f0;">
            <span style="font-weight: 600; color: #0d9488;">Advice:</span> <em>${escapeHTML(m.advice)}</em>
          </td>
        `;
        medTbody.appendChild(trAdvice);
      }
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
    if (m.advice) {
      medsText += `  Advice: ${m.advice}\n`;
    }
  });

  const messageText = `Hello ${activeAppointment.patient_name},\n\nYour digital prescription from Alamnagar CHC has been prepared.\n\nPatient Details:\n- Age: ${age}\n- Gender: ${gender}\n- Weight: ${weight}\n\nMedicines prescribed:\n${medsText}\nObservations:\n${document.getElementById('obs-input').value.trim()}\n\nWish you a speedy recovery!`;

  // WhatsApp link
  const formattedPhone = activeAppointment.phone.replace(/[^0-9]/g, '');
  whatsapp.href = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(messageText)}`;

  // Email client link
  email.href = `mailto:${activeAppointment.email}?subject=Your%20Digital%20Prescription%20-%20Alamnagar%20CHC&body=${encodeURIComponent(messageText)}`;

  // Populate secure OTP share link
  const apptId = activeAppointment.id;
  if (apptId && apptId !== 'walkin') {
    const shareUrl = `${window.location.origin}/share.html?id=${apptId}`;
    const linkInput = document.getElementById('share-link-input');
    if (linkInput) linkInput.value = shareUrl;
  }

  modal.style.display = 'flex';
};

window.closeShareModal = function(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close')) return;
  const modal = document.getElementById('share-modal');
  if (modal) modal.style.display = 'none';
};

// Copy secure share link to clipboard
window.copyShareLink = function() {
  const input = document.getElementById('share-link-input');
  if (!input || !input.value) return;
  navigator.clipboard.writeText(input.value).then(() => {
    const btn = input.nextElementSibling;
    if (btn) {
      btn.textContent = '✓ Copied!';
      btn.style.background = '#15803d';
      setTimeout(() => { btn.textContent = 'Copy'; btn.style.background = '#16a34a'; }, 2000);
    }
  }).catch(() => {
    input.select();
    document.execCommand('copy');
  });
};

// Open PDF or image in browser viewer modal (no download needed)
window.openPdfViewer = async function(fileUrl, description) {
  const isImage = /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(fileUrl);

  if (!isImage) {
    // Standard PDFs open beautifully in a full-screen new tab using the browser's native PDF reader
    // This bypasses iframe security sandboxes and cross-origin framing restrictions.
    window.open(fileUrl, '_blank');
    return;
  }

  const modal = document.getElementById('pdf-viewer-modal');
  const iframe = document.getElementById('pdf-viewer-frame');
  const img = document.getElementById('img-viewer-frame');
  const title = document.getElementById('pdf-viewer-title');
  const dlBtn = document.getElementById('pdf-download-btn');
  if (!modal || !iframe || !img) return;

  title.textContent = description || 'Document Viewer';
  dlBtn.href = fileUrl;

  // Hide both viewers and show modal with loading state
  iframe.style.display = 'none';
  img.style.display = 'none';
  iframe.src = '';
  img.src = '';
  modal.style.display = 'flex';

  // Show a loading indicator
  const viewerBody = iframe.parentElement;
  const loadingEl = document.createElement('div');
  loadingEl.id = 'pdf-loading-msg';
  loadingEl.style.cssText = 'display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#94a3b8; gap:1rem; font-size:1rem;';
  loadingEl.innerHTML = '<svg style="width:40px;height:40px;animation:spin 1s linear infinite" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83"/></svg><span>Loading document...</span>';
  const existingMsg = document.getElementById('pdf-loading-msg');
  if (existingMsg) existingMsg.remove();
  viewerBody.appendChild(loadingEl);

  // Verify file actually exists with a HEAD request
  try {
    const token = localStorage.getItem('chc_token');
    const check = await fetch(fileUrl, { method: 'HEAD', headers: { 'Authorization': `Bearer ${token}` } });
    loadingEl.remove();

    if (!check.ok) {
      // File not found - show friendly error
      showViewerError(viewerBody, fileUrl, 'File not found on server. It may have been removed.');
      return;
    }

    const isImage = /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(fileUrl);

    if (isImage) {
      img.src = fileUrl;
      img.style.display = 'block';
      img.onerror = () => {
        img.style.display = 'none';
        showViewerError(viewerBody, fileUrl, 'Image could not be displayed.');
      };
    } else {
      // PDF or other — use standard iframe (very stable for rendering PDFs inline)
      iframe.src = fileUrl;
      iframe.style.display = 'block';
    }
  } catch (err) {
    if (loadingEl.parentElement) loadingEl.remove();
    showViewerError(viewerBody, fileUrl, 'Network error. Please check your connection.');
  }
};

function showViewerError(container, fileUrl, message) {
  const errEl = document.createElement('div');
  errEl.style.cssText = 'display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#fca5a5; gap:1rem; text-align:center; padding:2rem;';
  errEl.innerHTML = `
    <svg style="width:48px;height:48px" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>
    <span style="font-size:1rem; font-weight:600;">${message}</span>
    <a href="${fileUrl}" download style="background:#3b82f6; color:white; padding:0.5rem 1.25rem; border-radius:6px; text-decoration:none; font-weight:600; font-size:0.9rem;">⬇ Try Download Instead</a>
  `;
  container.appendChild(errEl);
}

window.closePdfViewer = function() {
  const modal = document.getElementById('pdf-viewer-modal');
  const iframe = document.getElementById('pdf-viewer-frame');
  const img = document.getElementById('img-viewer-frame');
  if (modal) {
    modal.style.display = 'none';
    // Clean up dynamic elements
    const viewerBody = iframe ? iframe.parentElement : null;
    if (viewerBody) {
      const oldEmbed = viewerBody.querySelector('embed');
      if (oldEmbed) oldEmbed.remove();
      const oldMsg = document.getElementById('pdf-loading-msg');
      if (oldMsg) oldMsg.remove();
      const errEl = viewerBody.querySelector('div[style*="fca5a5"]');
      if (errEl) errEl.remove();
    }
  }
  if (iframe) { iframe.src = ''; iframe.style.display = 'none'; }
  if (img) { img.src = ''; img.style.display = 'none'; }
};

// General logout handler
window.logoutUser = function(e) {
  if (e) e.preventDefault();
  localStorage.removeItem('chc_token');
  localStorage.removeItem('chc_user_role');
  localStorage.removeItem('chc_user_name');
  localStorage.removeItem('chc_user_email');
  localStorage.removeItem('chc_user_phone');
  localStorage.removeItem('chc_user_id');
  localStorage.removeItem('chc_user_permissions');
  localStorage.removeItem('chc_doctor_id');
  window.location.href = 'index.html';
};

// Profile modal control handlers
window.openProfileModal = function(e) {
  if (e) e.preventDefault();
  const modal = document.getElementById('profile-modal');
  if (modal) {
    // Make sure signature preview in modal is up to date with signatureBase64
    const profSigImg = document.getElementById('profile-sig-image');
    const profSigPrompt = document.getElementById('profile-sig-prompt');
    if (signatureBase64 && profSigImg && profSigPrompt) {
      profSigImg.src = signatureBase64;
      profSigImg.style.display = 'inline-block';
      profSigPrompt.style.display = 'none';
    } else if (profSigImg && profSigPrompt) {
      profSigImg.src = '';
      profSigImg.style.display = 'none';
      profSigPrompt.style.display = 'block';
    }
    modal.style.display = 'flex';
  }
};

window.closeProfileModal = function(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close')) return;
  const modal = document.getElementById('profile-modal');
  if (modal) modal.style.display = 'none';
};

window.handleProfileSignatureUpload = function(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    alert('Signature image must be less than 2MB.');
    return;
  }

  const reader = new FileReader();
  reader.onload = function(evt) {
    const profSigBase64 = evt.target.result;
    
    const preview = document.getElementById('profile-sig-image');
    const prompt = document.getElementById('profile-sig-prompt');
    if (preview && prompt) {
      preview.src = profSigBase64;
      preview.style.display = 'inline-block';
      prompt.style.display = 'none';
      preview.dataset.tempSig = profSigBase64;
    }
  };
  reader.readAsDataURL(file);
};

window.saveProfileSignature = async function() {
  const preview = document.getElementById('profile-sig-image');
  const banner = document.getElementById('profile-status-banner');
  const sigToSave = (preview && preview.dataset.tempSig) ? preview.dataset.tempSig : signatureBase64;

  if (!sigToSave) {
    alert('Please upload a signature before saving.');
    return;
  }

  try {
    const token = localStorage.getItem('chc_token');
    const response = await fetch('/api/doctor/profile/signature', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ signature_url: sigToSave })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || 'Failed to save signature.');
    }

    // Save success: update global variables and local storage
    signatureBase64 = sigToSave;
    localStorage.setItem('chc_doctor_sig', signatureBase64);
    
    // Also update prescription layout previews
    const rxPreview = document.getElementById('sig-image');
    const rxPrompt = document.getElementById('sig-prompt');
    if (rxPreview && rxPrompt) {
      rxPreview.src = signatureBase64;
      rxPreview.style.display = 'inline-block';
      rxPrompt.style.display = 'none';
    }

    showStatusBanner(banner, 'Signature saved to profile successfully.', 'success');
    
    // Auto close modal after a short delay
    setTimeout(() => {
      closeProfileModal();
    }, 1500);
  } catch (error) {
    console.error(error);
    showStatusBanner(banner, error.message || 'Error occurred saving signature.', 'error');
  }
};

// Patient Search & Database Autocomplete
function setupPatientSearch() {
  const searchInput = document.getElementById('patient-search-input');
  const resultsDiv = document.getElementById('patient-search-results');
  if (!searchInput || !resultsDiv) return;

  let debounceTimer;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    const query = e.target.value.trim();
    if (query.length < 2) {
      resultsDiv.innerHTML = '';
      resultsDiv.style.display = 'none';
      renderQueue(appointments); // Restore full queue
      return;
    }

    // Filter queue immediately
    const matched = appointments.filter(appt => 
      appt.patient_name.toLowerCase().includes(query.toLowerCase()) || 
      appt.phone.includes(query)
    );
    renderQueue(matched);

    // Fetch database candidates
    debounceTimer = setTimeout(async () => {
      try {
        let results = [];
        if (isFallbackMode) {
          results = appointments.filter(a => 
            a.patient_name.toLowerCase().includes(query.toLowerCase()) || 
            a.phone.includes(query)
          );
        } else {
          const token = localStorage.getItem('chc_token');
          const response = await fetch(`/api/doctor/search-patients?q=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (response.ok) {
            results = await response.json();
          }
        }

        resultsDiv.innerHTML = '';
        if (results.length === 0) {
          resultsDiv.innerHTML = '<div style="padding: 0.5rem 1rem; color: var(--text-muted); font-size: 0.85rem;">No matching patients found</div>';
          resultsDiv.style.display = 'block';
          return;
        }

        results.forEach(patient => {
          const div = document.createElement('div');
          div.style.padding = '0.5rem 1rem';
          div.style.cursor = 'pointer';
          div.style.fontSize = '0.85rem';
          div.style.borderBottom = '1px solid #f1f5f9';
          div.className = 'autocomplete-suggestion';
          div.innerHTML = `<strong>${escapeHTML(patient.patient_name)}</strong><span style="display:block; font-size:0.75rem; color:var(--text-muted);">Mob: ${escapeHTML(patient.phone)}</span>`;
          
          div.addEventListener('click', () => {
            searchInput.value = patient.patient_name;
            resultsDiv.innerHTML = '';
            resultsDiv.style.display = 'none';
            selectPatientFromSearch(patient);
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
        console.error('Error fetching search results:', err);
      }
    }, 300);
  });

  document.addEventListener('click', (e) => {
    if (e.target !== searchInput && e.target !== resultsDiv && !resultsDiv.contains(e.target)) {
      resultsDiv.style.display = 'none';
    }
  });
}

function selectPatientFromSearch(patient) {
  const activeAppt = appointments.find(a => a.phone === patient.phone && a.status !== 'completed' && a.status !== 'cancelled');
  if (activeAppt) {
    selectPatient(activeAppt);
  } else {
    // Show static history panel details without active visit
    activeAppointment = null;
    renderQueue(); // Clear active highlights
    
    document.getElementById('patient-banner-name').textContent = patient.patient_name;
    document.getElementById('patient-banner-phone').textContent = patient.phone;
    document.getElementById('patient-banner-email').textContent = patient.email || 'None';
    document.getElementById('patient-banner-date').textContent = 'N/A (No active visit scheduled)';
    document.getElementById('patient-banner-notes').textContent = 'Viewing Patient Visit History Console';
    
    const statusBadge = document.getElementById('patient-banner-status');
    statusBadge.textContent = 'NO ACTIVE VISIT';
    statusBadge.className = 'badge pending';
    
    document.getElementById('patient-age').value = patient.age || '';
    document.getElementById('patient-gender').value = patient.gender || 'Male';
    document.getElementById('patient-weight').value = patient.weight || '';
    document.getElementById('patient-address').value = patient.address || '';
    
    emptyState.style.display = 'none';
    activeBuilder.style.display = 'block';
    
    prescribedMedicines = [];
    renderMedRows();
    document.getElementById('obs-input').value = '';
    document.getElementById('findings-input').value = '';
    document.getElementById('diag-custom').value = '';
    document.querySelectorAll('#diag-checkboxes input[type="checkbox"]').forEach(cb => cb.checked = false);
    // Clear vitals
    ['vital-bp-sys','vital-bp-dia','vital-temp','vital-pulse','vital-weight'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    
    const saveBtn = document.querySelector('button[onclick="savePrescription()"]');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Save (No Active Visit)';
    }
    
    loadPatientHistory(patient.phone);
  }
}

// Load patient history timeline
let pastVisits = [];
let loadedReports = [];
let selectedPastVisit = null;

async function loadPatientHistory(phone) {
  const sidebar = document.getElementById('history-sidebar');
  const grid = document.querySelector('.doctor-grid');
  const timelineContainer = document.getElementById('history-timeline');
  if (!sidebar || !timelineContainer || !grid) return;
  
  if (!phone) {
    if (activeAppointment && activeAppointment.id === 'walkin') {
      grid.classList.add('has-history');
      sidebar.style.display = 'flex';
      timelineContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem 0; font-size: 0.85rem;">Type a valid mobile number in the form to load patient history timeline...</div>';
    } else {
      grid.classList.remove('has-history');
      sidebar.style.display = 'none';
      timelineContainer.innerHTML = '';
    }
    pastVisits = [];
    return;
  }
  
  const nameLabel = document.getElementById('history-patient-name');
  const phoneLabel = document.getElementById('history-patient-phone');
  
  nameLabel.textContent = activeAppointment ? activeAppointment.patient_name : document.getElementById('patient-banner-name').textContent;
  phoneLabel.textContent = `Mob: ${phone}`;
  
  try {
    let history = [];
    let reports = [];

    if (isFallbackMode) {
      const mockPrescriptions = JSON.parse(localStorage.getItem('chc_mock_prescriptions')) || [];
      const mockAppointments = JSON.parse(localStorage.getItem('chc_appointments')) || [];
      const completed = mockAppointments.filter(a => a.phone === phone && a.status === 'completed');
      
      history = completed.map(appt => {
        const pres = mockPrescriptions.find(p => p.appointment_id === appt.id) || {};
        return {
          appointment_id: appt.id,
          appointment_date: appt.appointment_date,
          appointment_time: appt.appointment_time,
          past_complaints: appt.notes,
          prescription_id: pres.id || null,
          observations: pres.observations || '',
          diagnostics: pres.diagnostics || '',
          medicines: pres.medicines || [],
          doctor_name: localStorage.getItem('chc_user_name') || 'Sarah Rahman'
        };
      });
    } else {
      const token = localStorage.getItem('chc_token');

      // Fetch visit history
      const res = await fetch(`/api/doctor/patient-history?phone=${encodeURIComponent(phone)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        history = await res.json();
      }

      // Fetch investigation reports
      const repRes = await fetch(`/api/reports/${encodeURIComponent(phone)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (repRes.ok) {
        reports = await repRes.json();
      }
    }

    // Populate pastVisits so View/Modify/Clone buttons can look up visit data
    pastVisits = history;
    loadedReports = reports;

    // Merge and sort by date descending
    let combined = [
      ...history.map(v => ({ type: 'visit', date: new Date(v.appointment_date + 'T' + v.appointment_time), data: v })),
      ...reports.map(r => ({ type: 'report', date: new Date(r.upload_date), data: r }))
    ];
    combined.sort((a, b) => b.date - a.date);

    if (combined.length === 0) {
      grid.classList.remove('has-history');
      sidebar.style.display = 'none';
      timelineContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem 0;">No history found.</div>';
      return;
    }

    grid.classList.add('has-history');
    sidebar.style.display = 'flex';

    timelineContainer.innerHTML = '';
    combined.forEach(item => {
      if (item.type === 'visit') {
        const visit = item.data;
        const formattedDate = new Date(visit.appointment_date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });

        const itemDiv = document.createElement('div');
        itemDiv.className = 'timeline-item';

        const hasPres = visit.prescription_id;
        const modifyButtonHtml = hasPres ?
          `<button class="btn-sm" onclick="modifyPrescription(${visit.appointment_id})" style="flex: 1; text-align: center; justify-content: center; font-size: 0.75rem; padding: 0.25rem 0.5rem; background: var(--secondary-color);">Modify / Suggest</button>` :
          '';
        const cloneButtonHtml = (activeAppointment && hasPres) ?
          `<button class="btn-sm approve" onclick="clonePrescription(${visit.appointment_id})" style="flex: 1; text-align: center; justify-content: center; font-size: 0.75rem; padding: 0.25rem 0.5rem;">Clone</button>` :
          '';
        const viewButtonHtml = hasPres ?
          `<button class="btn-sm cancel" onclick="openPastPrescription(${visit.appointment_id})" style="flex: 1; text-align: center; justify-content: center; font-size: 0.75rem; padding: 0.25rem 0.5rem; background: var(--accent-color); color: white;">View</button>` :
          '';

        itemDiv.innerHTML = `
          <div class="timeline-date">${formattedDate} at ${visit.appointment_time}</div>
          <div class="timeline-card">
            <div class="timeline-doc">Dr. ${escapeHTML(visit.doctor_name || 'Sarah Rahman')}</div>
            ${visit.past_complaints ? `<div style="margin-top:0.25rem;"><strong>Complaints:</strong> <em>${escapeHTML(visit.past_complaints)}</em></div>` : ''}
            ${visit.observations ? `<div style="margin-top:0.15rem;"><strong>Obs:</strong> ${escapeHTML(visit.observations)}</div>` : ''}
            ${(viewButtonHtml || cloneButtonHtml || modifyButtonHtml) ? `
            <div class="timeline-actions" style="display:flex; flex-wrap:wrap; gap:4px; margin-top:0.5rem;">
              ${viewButtonHtml}
              ${modifyButtonHtml}
              ${cloneButtonHtml}
            </div>
            ` : ''}
          </div>
        `;
        timelineContainer.appendChild(itemDiv);
      } else {
        // Report type
        const report = item.data;
        const formattedDate = new Date(report.upload_date).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        // Parse findings if any
        let findingsList = [];
        if (report.findings) {
          try {
            findingsList = typeof report.findings === 'string' ? JSON.parse(report.findings) : report.findings;
          } catch (e) {
            console.warn('Failed to parse findings:', report.findings);
          }
        }

        let findingsHtml = '';
        if (findingsList && findingsList.length > 0) {
          findingsHtml = `
            <div style="margin-top: 0.5rem; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 0.4rem 0.6rem;">
              <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-dark); text-transform: uppercase; margin-bottom: 0.25rem;">📋 Lab Findings:</div>
              <div style="display:flex; flex-direction:column; gap:0.25rem;">
                ${findingsList.map(f => {
                  const statusClass = f.status === 'High' ? 'background:#fee2e2; color:#ef4444; border:1px solid #fecaca;' :
                                      f.status === 'Low' ? 'background:#eff6ff; color:#3b82f6; border:1px solid #bfdbfe;' :
                                      'background:#f0fdf4; color:#22c55e; border:1px solid #bbf7d0;';
                  return `
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; border-bottom:1px solid #f1f5f9; padding-bottom:0.15rem;">
                      <span><strong>${escapeHTML(f.parameter)}</strong>: ${escapeHTML(f.value)} <span style="font-size:0.7rem; color:#64748b;">(${escapeHTML(f.range || 'N/A')})</span></span>
                      <span style="font-size:0.7rem; font-weight:700; padding:0.1rem 0.4rem; border-radius:4px; ${statusClass}">${escapeHTML(f.status || 'Normal')}</span>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }

        const importBtnHtml = (findingsList && findingsList.length > 0) ?
          `<button onclick="importFindingsToPrescription(${report.id})" class="btn-sm" style="border:none; cursor:pointer; text-align:center; flex:1; background-color: var(--primary-color); font-weight: 600;">📥 Import to Prescription</button>` : '';

        const itemDiv = document.createElement('div');
        itemDiv.className = 'timeline-item';
        itemDiv.innerHTML = `
          <div class="timeline-date">${formattedDate}</div>
          <div class="timeline-card" style="border-left: 3px solid var(--secondary-color);">
            <div class="timeline-doc">Uploaded by ${escapeHTML(report.uploader_role === 'doctor' ? 'Doctor' : 'Patient')}</div>
            <div style="margin-top:0.25rem;"><strong>Investigation Report</strong></div>
            ${report.description ? `<div style="margin-top:0.15rem; font-size:0.8rem;">${escapeHTML(report.description)}</div>` : ''}
            
            ${findingsHtml}

            <div class="timeline-actions" style="margin-top:0.5rem; display:flex; flex-direction:column; gap:4px;">
              <div style="display:flex; gap:4px;">
                <button onclick="openPdfViewer('${report.file_url}', '${escapeHTML(report.description || 'Investigation Report')}')" class="btn-sm approve" style="border:none; cursor:pointer; text-align:center; flex:1;">👁 View Document</button>
                <button onclick="openFindingsModal(${report.id})" class="btn-sm" style="border:none; cursor:pointer; text-align:center; flex:1; background:#0284c7; color:white;">✏️ Flag Findings</button>
              </div>
              ${importBtnHtml}
            </div>
          </div>
        `;
        timelineContainer.appendChild(itemDiv);
      }
    });

  } catch (err) {
    console.error('Error loading patient history:', err);
    // On error, gracefully hide the panel instead of leaving it in a broken state
    const grid = document.querySelector('.doctor-grid');
    const sidebar = document.getElementById('history-sidebar');
    if (grid) grid.classList.remove('has-history');
    if (sidebar) sidebar.style.display = 'none';
  }
}

// Modify logic
window.modifyPrescription = function(appointmentId) {
  const visit = pastVisits.find(v => v.appointment_id === appointmentId);
  if (!visit) return;
  
  // Set active appointment to the past visit
  activeAppointment = {
    id: visit.appointment_id,
    patient_name: document.getElementById('history-patient-name').textContent,
    phone: document.getElementById('history-patient-phone').textContent.replace('Mob: ', ''),
    status: 'completed',
    appointment_date: visit.appointment_date,
    appointment_time: visit.appointment_time
  };

  // Populate rich state if available
  let state = visit.rich_state;
  if (typeof state === 'string') state = JSON.parse(state);
  
  if (state) {
    if (state.age) document.getElementById('patient-age').value = state.age;
    if (state.gender) document.getElementById('patient-gender').value = state.gender;
    if (state.weight) document.getElementById('patient-weight').value = state.weight;
    if (state.address) document.getElementById('patient-address').value = state.address;
  }
  
  const meds = state?.medicines || (typeof visit.medicines === 'string' ? JSON.parse(visit.medicines) : visit.medicines);
  if (meds && Array.isArray(meds)) {
    prescribedMedicines = JSON.parse(JSON.stringify(meds));
    renderMedRows();
  } else {
    prescribedMedicines = [];
    renderMedRows();
  }
  
  const obs = state?.observations || visit.observations || '';
  document.getElementById('obs-input').value = obs;
  
  document.getElementById('vital-bp-sys').value = state?.bp || visit.bp || '';
  document.getElementById('vital-temp').value = state?.temperature || visit.temperature || '';
  document.getElementById('vital-pulse').value = state?.pulse || visit.pulse || '';
  
  const diags = state?.diagnostics || visit.diagnostics || '';
  if (diags) {
    const tests = diags.split(', ');
    const customTests = [];
    document.querySelectorAll('#diag-checkboxes input[type="checkbox"]').forEach(cb => cb.checked = false);
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
  
  // Reset builder state
  const prescStatus = document.getElementById('prescription-status');
  if (prescStatus) prescStatus.style.display = 'none';
  
  const bannerStatus = document.getElementById('patient-banner-status');
  if (bannerStatus) bannerStatus.className = 'badge';
  document.getElementById('prescription-active-builder').style.display = 'block';
  
  const saveBtn = document.querySelector('button[onclick="savePrescription()"]');
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Amendment';
  }
  
  alert('Loaded past prescription for modification. Click "Save Amendment" to overwrite.');
};

window.handleReportUpload = async function(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const token = localStorage.getItem('chc_token');
  const patientPhone = activeAppointment ? activeAppointment.phone : document.getElementById('history-patient-phone').textContent.replace('Mob: ', '');
  
  if (!patientPhone || patientPhone === '...') {
    alert('No patient selected or phone number unavailable.');
    return;
  }

  const formData = new FormData();
  formData.append('report_file', file);
  formData.append('patient_phone', patientPhone);
  formData.append('description', 'Doctor uploaded investigation report');
  
  const statusSpan = document.getElementById('report-upload-status');
  statusSpan.textContent = 'Uploading...';
  
  try {
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    
    if (res.ok) {
      statusSpan.textContent = 'Upload complete!';
      statusSpan.style.color = 'green';
      setTimeout(() => statusSpan.textContent = '', 3000);
      loadPatientHistory(patientPhone);
    } else {
      const err = await res.json();
      statusSpan.textContent = 'Error: ' + (err.error || 'Failed');
      statusSpan.style.color = 'red';
    }
  } catch (err) {
    statusSpan.textContent = 'Upload failed.';
    statusSpan.style.color = 'red';
    console.error(err);
  }
};

// Clone logic
window.clonePrescription = function(appointmentId) {
  const visit = pastVisits.find(v => v.appointment_id === appointmentId);
  if (!visit) return;
  
  const meds = typeof visit.medicines === 'string' ? JSON.parse(visit.medicines) : visit.medicines;
  if (meds && Array.isArray(meds)) {
    prescribedMedicines = JSON.parse(JSON.stringify(meds));
    renderMedRows();
  }
  
  const obsInput = document.getElementById('obs-input');
  if (obsInput && !obsInput.value.trim() && visit.observations) {
    obsInput.value = visit.observations;
  }
  if (visit.bp) document.getElementById('vital-bp-sys').value = visit.bp;
  if (visit.temperature) document.getElementById('vital-temp').value = visit.temperature;
  if (visit.pulse) document.getElementById('vital-pulse').value = visit.pulse;
  
  if (visit.diagnostics) {
    const tests = visit.diagnostics.split(', ');
    const customTests = [];
    tests.forEach(test => {
      const cb = document.querySelector(`#diag-checkboxes input[value="${test}"]`);
      if (cb) {
        cb.checked = true;
      } else {
        customTests.push(test);
      }
    });
    const customDiagInput = document.getElementById('diag-custom');
    if (customDiagInput && !customDiagInput.value.trim()) {
      customDiagInput.value = customTests.join(', ');
    }
  }
  
  alert('Prescription cloned successfully! Verify details before saving.');
};

// Prescription Viewer
window.openPastPrescription = function(appointmentId) {
  const visit = pastVisits.find(v => v.appointment_id === appointmentId);
  if (!visit) return;
  
  selectedPastVisit = visit;
  
  const modal = document.getElementById('past-prescription-modal');
  const body = document.getElementById('past-prescription-modal-body');
  if (!modal || !body) return;
  
  const meds = typeof visit.medicines === 'string' ? JSON.parse(visit.medicines) : visit.medicines;
  let medsListHtml = '';
  if (meds && Array.isArray(meds)) {
    meds.forEach(m => {
      medsListHtml += `
        <div style="border-bottom: 1px solid #f1f5f9; padding: 0.5rem 0;">
          <strong>${escapeHTML(m.name)}</strong> - ${escapeHTML(m.dosage)} (${escapeHTML(m.timing)}) for ${escapeHTML(m.duration)}
          ${m.advice ? `<div style="font-size: 0.8rem; color: #475569; margin-top: 0.25rem;"><em>Advice: ${escapeHTML(m.advice)}</em></div>` : ''}
        </div>
      `;
    });
  } else {
    medsListHtml = '<div>No medicines prescribed.</div>';
  }
  
  const formattedDate = new Date(visit.appointment_date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  
  let vitalsHtml = '';
  if (visit.bp || visit.temperature || visit.pulse) {
    vitalsHtml = `
      <div><strong>Physical Observations / Vitals:</strong></div>
      <div style="background: #f0fdfa; border: 1px solid #a7f3d0; border-radius: 6px; padding: 0.5rem; margin-bottom: 0.5rem; font-size: 0.85rem; color: #0f766e;">
        ${visit.bp ? `<div><strong>B.P:</strong> ${escapeHTML(visit.bp)}</div>` : ''}
        ${visit.temperature ? `<div><strong>Temperature:</strong> ${escapeHTML(visit.temperature)}</div>` : ''}
        ${visit.pulse ? `<div><strong>Pulse:</strong> ${escapeHTML(visit.pulse)}</div>` : ''}
      </div>
    `;
  }

  body.innerHTML = `
    <div style="border-bottom: 2px solid var(--primary-color); padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
      <div style="font-size: 1.1rem; font-weight: 700; color: var(--primary-hover);">Dr. ${escapeHTML(visit.doctor_name || 'Sarah Rahman')}</div>
      <div style="font-size: 0.8rem; color: var(--text-muted);">Consultation date: ${formattedDate} at ${visit.appointment_time}</div>
    </div>
    
    <div><strong>Observations / Symptoms:</strong></div>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.5rem; min-height: 40px; margin-bottom: 0.5rem;">
      ${escapeHTML(visit.observations || 'None recorded.')}
    </div>
    
    ${vitalsHtml}
    
    <div><strong>Recommended Diagnostics:</strong></div>
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0.5rem; min-height: 40px; margin-bottom: 0.5rem;">
      ${escapeHTML(visit.diagnostics || 'None recommended.')}
    </div>
    
    <div><strong>Rx (Medicines):</strong></div>
    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0 0.75rem; margin-bottom: 0.5rem;">
      ${medsListHtml}
    </div>
  `;
  
  modal.style.display = 'flex';
};

window.closePastPrescriptionModal = function(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close')) return;
  const modal = document.getElementById('past-prescription-modal');
  if (modal) modal.style.display = 'none';
};

function printPastPrescription(visit) {
  const printDocName = document.getElementById('print-doctor-name-display');
  const printDocSpecialty = document.getElementById('print-doctor-specialty-display');
  const printDocHours = document.getElementById('print-doctor-hours-display');
  
  const printPatientName = document.getElementById('print-patient-name');
  const printPatientAge = document.getElementById('print-patient-age');
  const printPatientGender = document.getElementById('print-patient-gender');
  const printPatientDate = document.getElementById('print-patient-date');
  const printPatientAddress = document.getElementById('print-patient-address');
  const printPatientWeight = document.getElementById('print-patient-weight');
  const printPatientPhone = document.getElementById('print-patient-phone');
  
  const printObs = document.getElementById('print-patient-obs');
  const printDiags = document.getElementById('print-patient-diags');
  const printMedTbody = document.getElementById('print-med-tbody');
  const printSigImg = document.getElementById('print-doctor-signature');
  const printSigName = document.getElementById('print-sig-doc-name');
  
  printDocName.textContent = `Dr. ${(visit.doctor_name || 'Sarah Rahman').replace(/^Dr\.\s+/i, '')}`;
  printDocSpecialty.textContent = doctorProfile ? doctorProfile.specialty_en : 'Clinical Specialist';
  printDocHours.textContent = doctorProfile ? doctorProfile.visiting_hours_en : 'Regular Hours';
  
  printPatientName.textContent = activeAppointment ? activeAppointment.patient_name : (document.getElementById('patient-banner-name').textContent || 'Patient');
  printPatientAge.textContent = document.getElementById('patient-age').value.trim() || 'N/A';
  printPatientGender.textContent = document.getElementById('patient-gender').value || 'Male';
  printPatientDate.textContent = new Date(visit.appointment_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  printPatientAddress.textContent = document.getElementById('patient-address').value.trim() || 'N/A';
  printPatientWeight.textContent = document.getElementById('patient-weight').value.trim() || 'N/A';
  printPatientPhone.textContent = visit.phone || (activeAppointment ? activeAppointment.phone : '');
  
  printObs.textContent = visit.observations || 'None';
  
  // Vitals block for past prescription printing
  const bpVal = visit.bp || '';
  const temp = visit.temperature || '';
  const pulse = visit.pulse || '';

  const vitalsBlock = document.getElementById('print-vitals-block');
  const vitalsList = document.getElementById('print-vitals-list');
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
    vitalsList.innerHTML = items.join('');
    vitalsBlock.style.display = 'block';
  } else {
    vitalsBlock.style.display = 'none';
  }
  
  printDiags.innerHTML = '';
  if (visit.diagnostics) {
    const tests = visit.diagnostics.split(', ');
    tests.forEach(test => {
      const li = document.createElement('li');
      li.textContent = test;
      printDiags.appendChild(li);
    });
  } else {
    printDiags.innerHTML = '<li>None recommended</li>';
  }
  
  printMedTbody.innerHTML = '';
  const meds = typeof visit.medicines === 'string' ? JSON.parse(visit.medicines) : visit.medicines;
  if (meds && Array.isArray(meds)) {
    meds.forEach(m => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = m.advice ? 'none' : '1px solid #e2e8f0';
      tr.innerHTML = `
        <td><strong>${escapeHTML(m.name)}</strong></td>
        <td>${escapeHTML(m.dosage)}</td>
        <td>${escapeHTML(m.timing)}</td>
        <td>${escapeHTML(m.duration)}</td>
      `;
      printMedTbody.appendChild(tr);
      
      if (m.advice) {
        const trAdvice = document.createElement('tr');
        trAdvice.innerHTML = `
          <td colspan="4" style="padding-top: 0; padding-bottom: 0.5rem; color: #475569; font-size: 0.8rem; border-bottom: 1px solid #e2e8f0;">
            <span style="font-weight: 600; color: #0d9488;">Advice:</span> <em>${escapeHTML(m.advice)}</em>
          </td>
        `;
        printMedTbody.appendChild(trAdvice);
      }
    });
  } else {
    printMedTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No medicines prescribed</td></tr>';
  }
  
  if (signatureBase64) {
    printSigImg.src = signatureBase64;
    printSigImg.style.display = 'block';
  } else {
    printSigImg.style.display = 'none';
  }
  printSigName.innerHTML = `<span style="text-decoration:overline; font-size: 0.8rem; color:#475569;">Dr. ${(visit.doctor_name || 'Sarah Rahman').replace(/^Dr\.\s+/i, '')}</span>`;
  
  window.print();
}

document.addEventListener('DOMContentLoaded', () => {
  const printPastBtn = document.getElementById('print-past-pres-btn');
  if (printPastBtn) {
    printPastBtn.addEventListener('click', () => {
      if (!selectedPastVisit) return;
      printPastPrescription(selectedPastVisit);
    });
  }
});

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

// --- WALK-IN PATIENT SYSTEM HANDLERS ---
window.startWalkInPrescription = function() {
  activeAppointment = {
    id: 'walkin',
    patient_name: '',
    phone: '',
    email: '',
    appointment_date: new Date().toISOString().split('T')[0],
    appointment_time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
    status: 'walkin',
    age: '',
    gender: 'Male',
    weight: '',
    address: '',
    notes: 'Walk-In Consultation'
  };

  renderQueue(); // update active styling to deselect queued patient

  // Switch details UI to editable form
  document.getElementById('patient-details-static').style.display = 'none';
  document.getElementById('patient-details-edit').style.display = 'block';

  // Clear inputs
  document.getElementById('walkin-patient-name').value = '';
  const walkinPhoneInput = document.getElementById('walkin-patient-phone');
  walkinPhoneInput.value = '';

  // Clear clinical/metrics inputs
  document.getElementById('obs-input').value = '';
  document.getElementById('findings-input').value = '';
  document.getElementById('diag-custom').value = '';
  document.querySelectorAll('#diag-checkboxes input[type="checkbox"]').forEach(cb => cb.checked = false);
  document.getElementById('patient-age').value = '';
  document.getElementById('patient-gender').value = 'Male';
  document.getElementById('patient-weight').value = '';
  document.getElementById('patient-address').value = '';
  // Clear vitals
  ['vital-bp-sys','vital-temp','vital-pulse'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });

  prescribedMedicines = [];
  renderMedRows();

  // Hide empty state & show builder
  emptyState.style.display = 'none';
  activeBuilder.style.display = 'block';

  // Enable save button
  const saveBtn = document.querySelector('button[onclick="savePrescription()"]');
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save & Complete Visit';
  }

  // Clear/load history based on empty phone
  loadPatientHistory('');
  
  // Attach keyup/input handler for loading history on the fly
  walkinPhoneInput.removeEventListener('input', onWalkInPhoneInput);
  walkinPhoneInput.addEventListener('input', onWalkInPhoneInput);
};

function onWalkInPhoneInput(e) {
  const val = e.target.value.trim();
  if (/^\+?[0-9\s\-]{8,15}$/.test(val)) {
    loadPatientHistory(val);
  } else {
    const timeline = document.getElementById('history-timeline');
    if (timeline) timeline.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem 0; font-size: 0.85rem;">Type a valid mobile number in the form to load patient history timeline...</div>';
  }
}

// ── Report Findings Management ──────────────────────────────────────────
let activeFindingsReportId = null;

window.openFindingsModal = function(reportId) {
  // Find report in loadedReports context
  const reportObj = loadedReports.find(r => r.id === reportId);
  if (!reportObj) return alert('Report details not found.');

  activeFindingsReportId = reportId;
  const tbody = document.getElementById('findings-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  let findings = [];
  if (reportObj.findings) {
    try {
      findings = typeof reportObj.findings === 'string' ? JSON.parse(reportObj.findings) : reportObj.findings;
    } catch (e) {
      console.warn('Invalid findings data', reportObj.findings);
    }
  }

  if (findings && findings.length > 0) {
    findings.forEach(f => {
      addFindingsRow(f.parameter, f.value, f.range, f.status);
    });
  } else {
    // Add one empty row to start
    addFindingsRow();
  }

  document.getElementById('report-findings-modal').style.display = 'flex';
};

window.closeFindingsModal = function(e) {
  if (e && e.target !== e.currentTarget && !e.target.classList.contains('modal-close')) return;
  const modal = document.getElementById('report-findings-modal');
  if (modal) modal.style.display = 'none';
  activeFindingsReportId = null;
};

window.addFindingsRow = function(param = '', val = '', range = '', status = 'Normal') {
  const tbody = document.getElementById('findings-table-body');
  if (!tbody) return;

  const tr = document.createElement('tr');
  tr.style.borderBottom = '1px solid #f1f5f9';
  tr.className = 'finding-row';
  tr.innerHTML = `
    <td style="padding:0.4rem 0.25rem;">
      <input type="text" class="form-control finding-param" value="${escapeHTML(param)}" placeholder="e.g. Hemoglobin" style="font-size:0.8rem; padding:0.3rem;" required>
    </td>
    <td style="padding:0.4rem 0.25rem;">
      <input type="text" class="form-control finding-val" value="${escapeHTML(val)}" placeholder="e.g. 10.5" style="font-size:0.8rem; padding:0.3rem;" required>
    </td>
    <td style="padding:0.4rem 0.25rem;">
      <input type="text" class="form-control finding-range" value="${escapeHTML(range)}" placeholder="e.g. 12-16" style="font-size:0.8rem; padding:0.3rem;">
    </td>
    <td style="padding:0.4rem 0.25rem;">
      <select class="form-control finding-status" style="font-size:0.8rem; padding:0.3rem;">
        <option value="Normal" ${status === 'Normal' ? 'selected' : ''}>Normal</option>
        <option value="High" ${status === 'High' ? 'selected' : ''}>High 🔴</option>
        <option value="Low" ${status === 'Low' ? 'selected' : ''}>Low 🔵</option>
      </select>
    </td>
    <td style="padding:0.4rem 0.25rem; text-align:center;">
      <button type="button" onclick="this.closest('tr').remove()" style="background:none; border:none; color:var(--danger); font-size:1.1rem; cursor:pointer;">&times;</button>
    </td>
  `;
  tbody.appendChild(tr);
};

window.saveReportFindings = async function() {
  if (!activeFindingsReportId) return;

  const rows = document.querySelectorAll('.finding-row');
  const findings = [];

  for (let row of rows) {
    const parameter = row.querySelector('.finding-param').value.trim();
    const value = row.querySelector('.finding-val').value.trim();
    const range = row.querySelector('.finding-range').value.trim();
    const status = row.querySelector('.finding-status').value;

    if (parameter && value) {
      findings.push({ parameter, value, range, status });
    }
  }

  try {
    const token = localStorage.getItem('chc_token');
    const res = await fetch(`/api/reports/${activeFindingsReportId}/findings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ findings })
    });

    if (res.ok) {
      alert('Findings updated successfully!');
      closeFindingsModal();
      
      // Reload history to show updated findings
      const phone = document.getElementById('patient-banner-phone') ? document.getElementById('patient-banner-phone').textContent : '';
      if (phone && phone !== '...') {
        loadPatientHistory(phone);
      }
    } else {
      const err = await res.json();
      alert(err.error || 'Failed to save findings.');
    }
  } catch (e) {
    console.error(e);
    alert('Network error while saving findings.');
  }
};

window.importFindingsToPrescription = function(reportId) {
  const reportObj = loadedReports.find(r => r.id === reportId);
  if (!reportObj) return;

  let findings = [];
  if (reportObj.findings) {
    try {
      findings = typeof reportObj.findings === 'string' ? JSON.parse(reportObj.findings) : reportObj.findings;
    } catch (e) {
      console.warn('Invalid findings data', reportObj.findings);
    }
  }

  if (!findings || findings.length === 0) return alert('No findings to import.');

  const findingsInput = document.getElementById('findings-input');
  if (!findingsInput) return;

  // Format findings text
  let findingsText = '';
  findings.forEach(f => {
    findingsText += `- ${f.parameter}: ${f.value} (${f.range || 'No ref range'}) [${f.status}]\n`;
  });

  // Append or set findings input value
  if (findingsInput.value.trim()) {
    findingsInput.value = findingsInput.value.trim() + '\n' + findingsText;
  } else {
    findingsInput.value = findingsText;
  }

  // Focus the input
  findingsInput.focus();
  alert('Report findings successfully imported into the Findings section!');
};

