const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── جلب قائمة الطابعات المتصلة بالجهاز ──────────────────
async function getSystemPrinters() {
  return new Promise((resolve) => {
    const platform = os.platform();

    if (platform === 'win32') {
      // Windows
      exec(
        'wmic printer get name,status /format:csv 2>nul',
        (err, stdout) => {
          if (err) { resolve([]); return; }
          const lines = stdout.trim().split('\n').slice(1);
          const printers = lines
            .map(l => {
              const parts = l.trim().split(',');
              return { name: parts[2]?.trim(), status: parts[3]?.trim() }
            })
            .filter(p => p.name);
          resolve(printers);
        }
      );
    } else if (platform === 'darwin') {
      // macOS
      exec('lpstat -p 2>/dev/null', (err, stdout) => {
        if (err) { resolve([]); return; }
        const printers = stdout.split('\n')
          .filter(l => l.startsWith('printer'))
          .map(l => ({ name: l.split(' ')[1], status: 'ready' }));
        resolve(printers);
      });
    } else {
      // Linux
      exec('lpstat -p 2>/dev/null || echo ""', (err, stdout) => {
        if (err) { resolve([]); return; }
        const printers = stdout.split('\n')
          .filter(l => l.startsWith('printer'))
          .map(l => ({ name: l.split(' ')[1], status: 'ready' }));
        resolve(printers);
      });
    }
  });
}

// ── طباعة HTML على طابعة محددة (Windows فقط) ─────────────
async function printHtmlToFile(html, printerName) {
  return new Promise((resolve, reject) => {
    const platform = os.platform();
    const tmpFile = path.join(os.tmpdir(), `fixpro_print_${Date.now()}.html`);

    fs.writeFileSync(tmpFile, html, 'utf8');

    if (platform === 'win32') {
      // فتح الملف في المتصفح الافتراضي مع تحديد الطابعة
      // لا يمكن تحديد الطابعة برمجياً في المتصفح
      // لكن يمكن الطباعة باستخدام mshta أو rundll32
      const cmd = `rundll32 mshtml.dll,PrintHTML "${tmpFile}"`;
      exec(cmd, (err) => {
        fs.unlinkSync(tmpFile);
        if (err) reject(err);
        else resolve({ success: true });
      });
    } else {
      // macOS/Linux - استخدام cups
      exec(`lpr -P "${printerName}" "${tmpFile}"`, (err) => {
        fs.unlinkSync(tmpFile);
        if (err) reject(err);
        else resolve({ success: true });
      });
    }
  });
}

module.exports = { getSystemPrinters, printHtmlToFile };
