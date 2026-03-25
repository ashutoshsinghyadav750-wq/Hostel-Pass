(function () {
  const form = document.getElementById('leave-form');
  const errorEl = document.getElementById('form-error');
  const successEl = document.getElementById('success-section');
  const formCard = document.getElementById('form-card');
  const qrContainer = document.getElementById('qr-container');
  const requestIdEl = document.getElementById('request-id-display');
  const btnAnother = document.getElementById('btn-another');
  const btnDownloadPdf = document.getElementById('btn-download-pdf');
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
      successEl.classList.remove('hidden');
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
      successEl.classList.remove('hidden');
    }
  });

  btnAnother.addEventListener('click', function () {
    form.reset();
    if (session && rollInput) {
      rollInput.value = session.rollNumber;
      rollInput.readOnly = true;
    }
    if (session && nameInput && session.name) nameInput.value = session.name;
    lastPayload = null;
    lastQrDataUrl = null;
    qrContainer.innerHTML = '';
    successEl.classList.add('hidden');
    formCard.classList.remove('hidden');
    clearError();
    form.scrollIntoView({ behavior: 'auto', block: 'start' });
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
})();
