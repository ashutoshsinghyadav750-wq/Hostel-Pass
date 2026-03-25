(function () {
  const form = document.getElementById('leave-form');
  const formalLetterForm = document.getElementById('formal-letter-form');
  const errorEl = document.getElementById('form-error');
  const successEl = document.getElementById('success-section');
  const formCard = document.getElementById('form-card');
  const formalLetterCard = document.getElementById('formal-letter-card');
  const formTypeSelector = document.getElementById('form-type-selector');
  const qrContainer = document.getElementById('qr-container');
  const requestIdEl = document.getElementById('request-id-display');
  const btnAnother = document.getElementById('btn-another');
  const btnDownloadPdf = document.getElementById('btn-download-pdf');
  const btnDownloadFilledForm = document.getElementById('btn-download-filled-form');
  const rollInput = document.getElementById('rollNumber');
  const nameInput = document.getElementById('name');

  const session = typeof HostelAuth !== 'undefined' ? HostelAuth.getStudentSession() : null;
  if (session && rollInput) {
    rollInput.value = session.rollNumber;
    rollInput.readOnly = true;
    rollInput.title = 'Matches your logged-in account';
  }
  if (session && nameInput && session.name) {
    nameInput.value = session.name;
    nameInput.readOnly = true;
    nameInput.title = 'Cannot be changed after login';
  }

  // Set up formal letter form with session data
  if (session) {
    const letterNameInput = document.getElementById('letterStudentName');
    const letterRoomInput = document.getElementById('letterRoomNumber');
    const letterIdInput = document.getElementById('letterStudentId');
    const letterDateInput = document.getElementById('letterDate');

    if (letterNameInput && session.name) {
      letterNameInput.value = session.name;
      letterNameInput.readOnly = true;
    }
    if (letterRoomInput && session.roomNumber) {
      letterRoomInput.value = session.roomNumber;
    }
    if (letterIdInput && session.rollNumber) {
      letterIdInput.value = session.rollNumber;
    }
    if (letterDateInput) {
      letterDateInput.valueAsDate = new Date();
    }
  }

  // Form type selector buttons
  const btnFormalLetter = document.getElementById('btn-formal-letter');
  const btnDigitalPass = document.getElementById('btn-digital-pass');

  if (btnFormalLetter) {
    btnFormalLetter.addEventListener('click', function () {
      formTypeSelector.classList.add('hidden');
      formCard.classList.add('hidden');
      formalLetterCard.classList.remove('hidden');
      successEl.classList.add('hidden');
      clearError();
    });
  }

  if (btnDigitalPass) {
    btnDigitalPass.addEventListener('click', function () {
      formTypeSelector.classList.add('hidden');
      formalLetterCard.classList.add('hidden');
      formCard.classList.remove('hidden');
      successEl.classList.add('hidden');
      clearError();
    });
  }

  const navLogout = document.getElementById('nav-student-logout');
  if (navLogout && typeof HostelAuth !== 'undefined') {
    navLogout.addEventListener('click', function (e) {
      e.preventDefault();
      HostelAuth.studentLogout();
      window.location.href = 'student-login.html?next=' + encodeURIComponent('index.html');
    });
  }

  let lastPayload = null;
  let lastQrDataUrl = null;

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
  }

  function clearError() {
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
  }

  function isValidPhoneNumber(phone) {
    const cleaned = (phone || '').toString().replace(/\D/g, '');
    return cleaned.length === 10 && /^[6-9]/.test(cleaned);
  }

  function checkDependencies() {
    const missing = [];
    if (!window.QRCode || typeof window.QRCode.toDataURL !== 'function') missing.push('QRCode');
    if (!window.jspdf || typeof window.jspdf.jsPDF !== 'function') missing.push('jsPDF');
    if (!window.jspdf || typeof window.jspdf.autoTable !== 'function') {
      // aer needed for table but we can fallback later
      console.warn('jspdf-autotable not loaded. Using fallback text layout.');
    }
    return missing;
  }

  const missingDeps = checkDependencies();
  if (missingDeps.length) {
    showError('Library failed to load: ' + missingDeps.join(', ') + '. Check network / content-blocker settings.');
    form.querySelectorAll('input,select,button,textarea').forEach((el) => (el.disabled = true));
    return;
  }

  function buildRequestFromForm(fd) {
    return {
      id: HostelStorage.generateRequestId(),
      name: (fd.get('name') || '').toString().trim(),
      rollNumber: (fd.get('rollNumber') || '').toString().trim(),
      branch: (fd.get('branch') || '').toString().trim(),
      roomNumber: (fd.get('roomNumber') || '').toString().trim(),
      leaveType: (fd.get('leaveType') || '').toString().trim(),
      reason: (fd.get('reason') || '').toString().trim(),
      fromDate: (fd.get('fromDate') || '').toString(),
      toDate: (fd.get('toDate') || '').toString(),
      leaveTime: (fd.get('leaveTime') || '').toString(),
      address: (fd.get('address') || '').toString().trim(),
      city: (fd.get('city') || '').toString().trim(),
      state: (fd.get('state') || '').toString().trim(),
      studentPhone: (fd.get('studentPhone') || '').toString().trim(),
      studentEmail: (fd.get('studentEmail') || '').toString().trim(),
      parentPhone: (fd.get('parentPhone') || '').toString().trim(),
      declarationAccepted: fd.get('declaration') === 'on',
      status: 'Pending',
      createdAt: new Date().toISOString(),
    };
  }

  function validate(r) {
    if (session && HostelUsers.normalizeRoll(r.rollNumber) !== session.rollNumber) {
      return 'Roll number must match your logged-in account.';
    }
    if (!r.name) return 'Please enter your name.';
    if (!r.rollNumber) return 'Please enter roll number.';
    if (!r.branch) return 'Please enter branch.';
    if (!r.roomNumber) return 'Please enter room number.';
    if (!r.leaveType) return 'Please select leave type.';
    if (!r.reason) return 'Please enter reason for leave.';
    if (!r.fromDate || !r.toDate) return 'Please select from and to dates.';
    if (!r.leaveTime) return 'Please select time.';
    if (!r.address || !r.city || !r.state) return 'Please complete address details.';
    if (!r.studentPhone || !r.parentPhone) return 'Please enter both phone numbers.';
    if (!isValidPhoneNumber(r.studentPhone)) return 'Please enter a valid 10-digit student phone number.';
    if (!isValidPhoneNumber(r.parentPhone)) return 'Please enter a valid 10-digit parent/guardian phone number.';
    if (!r.studentEmail || !/^\S+@\S+\.\S+$/.test(r.studentEmail)) return 'Please enter a valid student email address.';
    if (!r.declarationAccepted) return 'You must accept the declaration to submit.';
    if (new Date(r.fromDate) > new Date(r.toDate)) return 'From date cannot be after to date.';
    return null;
  }

  async function makeQrDataUrl(text) {
    if (!window.QRCode || typeof window.QRCode.toDataURL !== 'function') {
      throw new Error('QRCode library not available');
    }

    try {
      return await QRCode.toDataURL(text, {
        width: 200,
        margin: 2,
        color: { dark: '#0f1419', light: '#ffffff' },
      });
    } catch (e) {
      console.warn('QRCode generation failed, on-screen QR only', e);
      throw e;
    }
  }

  function renderQr(container, dataUrl, id) {
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'qr-box';
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = 'Leave pass QR code';
    wrap.appendChild(img);
    const idSpan = document.createElement('span');
    idSpan.className = 'qr-box__id';
    idSpan.textContent = id;
    wrap.appendChild(idSpan);
    container.appendChild(wrap);
  }

  function validateFormalLetter(data) {
    if (!data.hostelName) return 'Please enter hostel name/block.';
    if (!data.letterDate) return 'Please select date.';
    if (!data.formalStartDate) return 'Please select from date/time.';
    if (!data.formalEndDate) return 'Please select return date/time.';
    if (!data.leaveReasonLetter) return 'Please enter reason for leave.';
    if (!data.letterStudentPhone || !data.letterParentPhone) return 'Please enter both phone numbers.';
    if (!isValidPhoneNumber(data.letterStudentPhone)) return 'Please enter a valid 10-digit phone number for yourself.';
    if (!isValidPhoneNumber(data.letterParentPhone)) return 'Please enter a valid 10-digit phone number for your parent/guardian.';
    if (!data.letterStudentName) return 'Please enter your name.';
    if (!data.letterRoomNumber) return 'Please enter room number.';
    if (!data.letterStudentId) return 'Please enter student ID.';
    if (!data.letterDeclaration) return 'You must accept the declaration.';
    if (new Date(data.formalStartDate) >= new Date(data.formalEndDate)) return 'Return date/time must be after start date/time.';
    return null;
  }

  function buildFormalLetterPdf(letterData) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('jsPDF library not loaded');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = margin;

    // Headers
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('HOSTEL LEAVE APPLICATION', pageW / 2, y, { align: 'center' });
    y += 8;

    // To: Address
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('To: The Hostel Warden', margin, y);
    y += 5;
    doc.text('Hostel Name/Block: ' + letterData.hostelName, margin, y);
    y += 7;

    // Date
    doc.text('Date: ' + letterData.letterDate, margin, y);
    y += 10;

    // Salutation
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Respected Sir/Madam,', margin, y);
    y += 8;

    // Body
    doc.setFontSize(10);
    const startDateStr = new Date(letterData.formalStartDate).toLocaleString();
    const endDateStr = new Date(letterData.formalEndDate).toLocaleString();
    
    const bodyText = `I am writing to request permission to leave the hostel premises from ${startDateStr} to ${endDateStr}.\n\nThe reason for my leave is ${letterData.leaveReasonLetter}.\n\nWhile I am away, I can be reached at my mobile number: ${letterData.letterStudentPhone}. My parents are aware of this travel and can be contacted at ${letterData.letterParentPhone} for verification if required.\n\nI will ensure that I sign the outgoing register before leaving and report back to the hostel by the specified return time.`;
    
    const splitText = doc.splitTextToSize(bodyText, pageW - 2 * margin);
    doc.text(splitText, margin, y);
    y += splitText.length * 5 + 5;

    // Closing
    doc.text('Thank you for your cooperation.', margin, y);
    y += 8;
    doc.text('Yours sincerely,', margin, y);
    y += 12;

    // Signature space and details
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('[Your Signature]', margin, y);
    y += 8;
    doc.text('Name: ' + letterData.letterStudentName, margin, y);
    y += 5;
    doc.text('Room Number: ' + letterData.letterRoomNumber, margin, y);
    y += 5;
    doc.text('Student ID: ' + letterData.letterStudentId, margin, y);

    const filename = `Hostel_Leave_Letter_${letterData.letterStudentName}_${new Date().toISOString().split('T')[0]}.pdf`;
    return { doc, fname: filename };
  }

  function buildPdf(request, qrDataUrl) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('jsPDF library not loaded');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = margin;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Hostel Leave Request', margin, y);
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Request ID: ${request.id}`, margin, y);
    doc.text(`Generated: ${new Date(request.createdAt).toLocaleString()}`, margin, y + 4);
    doc.setTextColor(0);
    y += 12;

    const tableRightGutter = 48;
    const qrX = pageW - margin - 42;
    const qrY = 20;
    try {
      doc.addImage(qrDataUrl, 'PNG', qrX, qrY, 40, 40);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('Digital pass', qrX + 20, qrY + 44, { align: 'center' });
    } catch (e) {
      console.warn('QR embed failed', e);
    }

    const tablesStartY = Math.max(y, qrY + 48);

    if (typeof doc.autoTable === 'function') {
      doc.autoTable({
        startY: tablesStartY,
        head: [['Field', 'Value']],
        body: [
          ['Name', request.name],
          ['Roll Number', request.rollNumber],
          ['Branch', request.branch],
          ['Room Number', request.roomNumber],
          ['Student Phone', request.studentPhone],
          ['Parent Phone', request.parentPhone],
          ['Address', request.address],
          ['City', request.city],
          ['State', request.state],
        ],
        theme: 'striped',
        headStyles: { fillColor: [26, 35, 50], textColor: 255 },
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 40 } },
        margin: { left: margin, right: margin + tableRightGutter },
      });

      y = doc.lastAutoTable && doc.lastAutoTable.finalY ? doc.lastAutoTable.finalY + 10 : tablesStartY + 40;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Leave details', margin, y);
      y += 6;

      doc.autoTable({
        startY: y,
        head: [['Field', 'Value']],
        body: [
          ['Type', request.leaveType],
          ['Reason', request.reason],
          ['From Date', request.fromDate],
          ['To Date', request.toDate],
          ['Time', request.leaveTime],
          ['Status', request.status],
        ],
        theme: 'striped',
        headStyles: { fillColor: [26, 35, 50], textColor: 255 },
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 40 } },
        margin: { left: margin, right: margin + tableRightGutter },
      });
    } else {
      console.warn('jspdf-autotable not available; using fall-back layout');
      let tableY = tablesStartY;
      const entries = [
        ['Name', request.name],
        ['Roll Number', request.rollNumber],
        ['Branch', request.branch],
        ['Room Number', request.roomNumber],
        ['Student Phone', request.studentPhone],
        ['Parent Phone', request.parentPhone],
        ['Address', request.address],
        ['City', request.city],
        ['State', request.state],
        ['Type', request.leaveType],
        ['Reason', request.reason],
        ['From Date', request.fromDate],
        ['To Date', request.toDate],
        ['Time', request.leaveTime],
        ['Status', request.status],
      ];
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      entries.forEach(([field, value]) => {
        if (tableY >= doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          tableY = margin;
        }
        doc.text(`${field}: ${value}`, margin, tableY);
        tableY += 6;
      });
    }

    const fname = `HostelLeave_${request.id.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
    return { doc, fname };
  }

  function buildFilledFormPdf(request) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('jsPDF library not loaded');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = margin;

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('HOSTEL LEAVE APPLICATION FORM (FILLED)', pageW / 2, y, { align: 'center' });
    y += 10;

    // Instructions
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text('Request ID: ' + request.id, margin, y);
    y += 5;
    doc.text('Submitted On: ' + new Date(request.createdAt).toLocaleString(), margin, y);
    y += 5;
    doc.setTextColor(0);
    y += 2;

    // Section 1: Student Details
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Student Details:', margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const studentFields = [
      { label: 'Full Name:', value: request.name },
      { label: 'Roll Number:', value: request.rollNumber },
      { label: 'Room Number:', value: request.roomNumber },
      { label: 'Branch:', value: request.branch },
      { label: 'Student Phone:', value: request.studentPhone },
      { label: 'Parent/Guardian Phone:', value: request.parentPhone },
      { label: 'Email:', value: request.studentEmail },
    ];

    studentFields.forEach((field) => {
      doc.text(field.label, margin, y);
      doc.text(field.value, margin + 50, y);
      y += 6;
    });

    y += 2;

    // Section 2: Leave Details
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Leave Details:', margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const leaveDetailsFields = [
      { label: 'Leave Type:', value: request.leaveType },
      { label: 'Reason:', value: request.reason },
      { label: 'From Date:', value: request.fromDate },
      { label: 'To Date:', value: request.toDate },
      { label: 'Time (Out):', value: request.leaveTime },
    ];

    leaveDetailsFields.forEach((field) => {
      const valueText = doc.splitTextToSize(field.value, 100);
      doc.text(field.label, margin, y);
      doc.text(valueText, margin + 50, y);
      y += 6;
    });

    y += 2;

    // Section 3: Address Details
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Address During Leave:', margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const addressFields = [
      { label: 'Address:', value: request.address },
      { label: 'City:', value: request.city },
      { label: 'State:', value: request.state },
    ];

    addressFields.forEach((field) => {
      doc.text(field.label, margin, y);
      doc.text(field.value, margin + 50, y);
      y += 6;
    });

    y += 2;

    // Status
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Status:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(request.status, margin + 50, y);
    y += 10;

    // Footer
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('This is a system-generated filled form. For official use only.', margin, pageW - 10);

    const filename = `Hostel_Leave_Form_${request.name.replace(/\s+/g, '_')}_${request.id}.pdf`;
    return { doc, fname: filename };
  }

  function downloadPdf(doc, filename) {
    if (!doc || !filename) {
      throw new Error('PDF document or filename missing');
    }

    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (!form) {
    console.error('leave-form not found in DOM');
    return;
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    clearError();
    console.log('leave-form submit triggered');
    const fd = new FormData(form);
    const request = buildRequestFromForm(fd);
    const err = validate(request);
    if (err) {
      showError(err);
      return;
    }

    await HostelStorage.saveRequestAsync(request);
    lastPayload = request;

    try {
      lastQrDataUrl = await makeQrDataUrl(request.id);
      renderQr(qrContainer, lastQrDataUrl, request.id);
      requestIdEl.textContent = request.id;
      formCard.classList.add('hidden');
      formTypeSelector.classList.add('hidden');
      formalLetterCard.classList.add('hidden');
      successEl.classList.remove('hidden');
      if (btnDownloadFilledForm) {
        btnDownloadFilledForm.style.display = 'inline-flex';
      }
      successEl.scrollIntoView({ behavior: 'auto', block: 'start' });

      const { doc, fname } = buildPdf(request, lastQrDataUrl);
      try {
        downloadPdf(doc, fname);
      } catch (downloadErr) {
        console.warn('Auto-download blocked or failed, user can click Download button', downloadErr);
        showError('PDF download may be blocked by browser. Click "Download PDF again" to retry.');
      }
    } catch (err) {
      console.error(err);
      showError('Saved, but QR/PDF failed. You can retry download from success screen.');
      lastQrDataUrl = await makeQrDataUrl(request.id).catch(() => null);
      if (lastQrDataUrl) renderQr(qrContainer, lastQrDataUrl, request.id);
      requestIdEl.textContent = request.id;
      formCard.classList.add('hidden');
      formalLetterCard.classList.add('hidden');
      formTypeSelector.classList.add('hidden');
      successEl.classList.remove('hidden');
      if (btnDownloadFilledForm) {
        btnDownloadFilledForm.style.display = 'inline-flex';
      }
    }
  });

  // Formal Letter Form submission
  if (formalLetterForm) {
    formalLetterForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      clearError();
      console.log('formal-letter-form submit triggered');
      const fd = new FormData(formalLetterForm);
      const letterData = {
        hostelName: fd.get('hostelName'),
        letterDate: fd.get('letterDate'),
        formalStartDate: fd.get('formalStartDate'),
        formalEndDate: fd.get('formalEndDate'),
        leaveReasonLetter: fd.get('leaveReasonLetter'),
        letterStudentPhone: fd.get('letterStudentPhone'),
        letterParentPhone: fd.get('letterParentPhone'),
        letterStudentName: fd.get('letterStudentName'),
        letterRoomNumber: fd.get('letterRoomNumber'),
        letterStudentId: fd.get('letterStudentId'),
        letterDeclaration: fd.get('letterDeclaration') === 'on',
      };

      const err = validateFormalLetter(letterData);
      if (err) {
        showError(err);
        return;
      }

      try {
        const { doc, fname } = buildFormalLetterPdf(letterData);
        downloadPdf(doc, fname);
        
        // Show success message
        requestIdEl.textContent = 'Letter generated successfully';
        formalLetterCard.classList.add('hidden');
        formTypeSelector.classList.add('hidden');
        formCard.classList.add('hidden');
        successEl.classList.remove('hidden');
        qrContainer.innerHTML = '<p style="text-align: center; color: var(--muted);">Formal letter to warden has been generated and downloaded.</p>';
        successEl.scrollIntoView({ behavior: 'auto', block: 'start' });
      } catch (err) {
        console.error(err);
        showError('Failed to generate letter: ' + (err.message || 'Unknown error'));
      }
    });
  }

  function resetFormSelection() {
    form.reset();
    if (formalLetterForm) formalLetterForm.reset();
    if (session && rollInput) {
      rollInput.value = session.rollNumber;
      rollInput.readOnly = true;
    }
    if (session && nameInput && session.name) {
      nameInput.value = session.name;
    }
    const letterNameInput = document.getElementById('letterStudentName');
    const letterDateInput = document.getElementById('letterDate');
    if (letterNameInput && session && session.name) {
      letterNameInput.value = session.name;
    }
    if (letterDateInput) {
      letterDateInput.valueAsDate = new Date();
    }
    lastPayload = null;
    lastQrDataUrl = null;
    qrContainer.innerHTML = '';
    successEl.classList.add('hidden');
    formalLetterCard.classList.add('hidden');
    formCard.classList.add('hidden');
    formTypeSelector.classList.remove('hidden');
    if (btnDownloadFilledForm) {
      btnDownloadFilledForm.style.display = 'none';
    }
    clearError();
    formTypeSelector.scrollIntoView({ behavior: 'auto', block: 'start' });
  }

  btnAnother.addEventListener('click', function () {
    resetFormSelection();
  });

  btnDownloadPdf.addEventListener('click', function () {
    clearError();
    if (!lastPayload || !lastQrDataUrl) {
      showError('No request data. Submit the form again.');
      return;
    }
    try {
      const { doc, fname } = buildPdf(lastPayload, lastQrDataUrl);
      downloadPdf(doc, fname);
    } catch (err) {
      console.error(err);
      showError('Unable to generate PDF. Please refresh and submit again.');
    }
  });

  if (btnDownloadFilledForm) {
    btnDownloadFilledForm.addEventListener('click', function () {
      clearError();
      if (!lastPayload) {
        showError('No form data. Submit the form again.');
        return;
      }
      try {
        const { doc, fname } = buildFilledFormPdf(lastPayload);
        downloadPdf(doc, fname);
      } catch (err) {
        console.error(err);
        showError('Unable to generate filled form. Please try again.');
      }
    });
  }
})();
