/**
 * QR gate scanner — call initHostelScanner(ids) once after DOM is ready (e.g. from admin dashboard).
 */
function initHostelScanner(ids) {
  const el = (id) => document.getElementById(id);
  const readerElId = ids.readerId;
  const resultOk = el(ids.resultOkId);
  const resultInvalid = el(ids.resultInvalidId);
  const btnStart = el(ids.btnStartId);
  const btnStop = el(ids.btnStopId);

  const fields = {
    name: el(ids.fieldNameId),
    roll: el(ids.fieldRollId),
    room: el(ids.fieldRoomId),
    status: el(ids.fieldStatusId),
    id: el(ids.fieldIdId),
  };

  if (!readerElId || !resultOk || !btnStart || !btnStop) return;

  let html5QrCode = null;
  let scanning = false;
  let lastResultSnapshot = null;

  function normalizeScannedText(text) {
    if (!text) return '';
    const t = String(text).trim();
    try {
      const j = JSON.parse(t);
      if (j && typeof j.id === 'string') return j.id.trim();
    } catch (_) {
      /* plain id */
    }
    return t;
  }

  function showResult(request) {
    resultInvalid.classList.add('hidden');
    resultOk.classList.remove('hidden');
    fields.name.textContent = request.name || '—';
    fields.roll.textContent = request.rollNumber || '—';
    fields.room.textContent = request.roomNumber || '—';
    fields.status.textContent = request.status || 'Pending';
    fields.id.textContent = request.id || '—';
    const badge = fields.status;
    badge.className = 'badge';
    const s = (request.status || '').toLowerCase();
    if (s === 'approved') badge.classList.add('badge--approved');
    else if (s === 'rejected') badge.classList.add('badge--rejected');
    else badge.classList.add('badge--pending');
  }

  function showInvalid() {
    resultOk.classList.add('hidden');
    resultInvalid.classList.remove('hidden');
  }

  function onScanSuccess(decodedText) {
    const id = normalizeScannedText(decodedText);
    if (!id) return;
    const req = HostelStorage.findById(id);
    const snapshot = req
      ? ['ok', req.id, req.status, req.name, req.rollNumber, req.roomNumber].join('|')
      : ['bad', id].join('|');
    if (snapshot === lastResultSnapshot) return;
    lastResultSnapshot = snapshot;
    if (req) showResult(req);
    else showInvalid();
  }

  async function startScan() {
    if (scanning) return;
    html5QrCode = new Html5Qrcode(readerElId);
    const config = { fps: 10, qrbox: { width: 240, height: 240 } };
    const qr = html5QrCode;
    const noop = () => {};

    try {
      const cameras = await Html5Qrcode.getCameras();
      if (cameras && cameras.length > 0) {
        const back =
          cameras.find((c) => /back|rear|environment/i.test(c.label || '')) || cameras[cameras.length - 1];
        await qr.start(back.id, config, onScanSuccess, noop);
      } else {
        await qr.start({ facingMode: 'environment' }, config, onScanSuccess, noop);
      }
      scanning = true;
      btnStart.classList.add('hidden');
      btnStop.classList.remove('hidden');
    } catch (err) {
      console.error(err);
      try {
        await qr.start({ facingMode: 'user' }, config, onScanSuccess, noop);
        scanning = true;
        btnStart.classList.add('hidden');
        btnStop.classList.remove('hidden');
      } catch (e2) {
        console.error(e2);
        alert(
          'Camera could not be started. Grant camera permission in the browser, use HTTPS or localhost, and try again.'
        );
        html5QrCode = null;
      }
    }
  }

  async function stopScan() {
    if (!html5QrCode || !scanning) return;
    try {
      await html5QrCode.stop();
      html5QrCode.clear();
    } catch (e) {
      console.warn(e);
    }
    html5QrCode = null;
    scanning = false;
    lastResultSnapshot = null;
    btnStop.classList.add('hidden');
    btnStart.classList.remove('hidden');
  }

  btnStart.addEventListener('click', function () {
    lastResultSnapshot = null;
    startScan();
  });
  btnStop.addEventListener('click', stopScan);

  window.addEventListener('beforeunload', stopScan);
}

window.initHostelScanner = initHostelScanner;
