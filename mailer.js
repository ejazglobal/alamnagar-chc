const fs = require('fs');
const path = require('path');
const https = require('https');
const querystring = require('querystring');

// Normalize Bangladeshi phone numbers to the 8801XXXXXXXXX format
function normalizeBDPhoneNumber(phone) {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('880') && digits.length === 13) {
    return digits;
  }
  if (digits.startsWith('0') && digits.length === 11) {
    return '88' + digits;
  }
  if (digits.startsWith('1') && digits.length === 10) {
    return '880' + digits;
  }
  if (digits.length === 11 && !digits.startsWith('88')) {
    return '88' + digits;
  }
  return digits;
}

// Helper to send real SMS via Shiram System API or MiMSMS API V2
function sendSMS(to, message) {
  const normalizedPhone = normalizeBDPhoneNumber(to);
  const smsProvider = (process.env.SMS_PROVIDER || 'shiram').toLowerCase();

  if (smsProvider === 'mimsms') {
    const userName = process.env.SMS_USER || 'ejaz.cacts@gmail.com';
    const apiKey   = process.env.SMS_API_KEY || 'Mim@G1Q8Q0QX0AFEYNX';
    const senderName = process.env.SMS_MASK || 'Non-Masking';

    if (!userName.trim() || !apiKey.trim()) {
      console.log(`[SIMULATED MiMSMS] No credentials — Phone: ${normalizedPhone}, Msg: "${message}"`);
      return;
    }

    const postData = JSON.stringify({
      apiKey: apiKey,
      userName: userName,
      senderName: senderName,
      transactionType: 'T',
      mobileNumber: normalizedPhone,
      message: message
    });

    console.log(`[SMS DISPATCH] MiMSMS POST → api.mimsms.com/api/V2/SMS`);
    console.log(`[SMS DISPATCH] To: ${normalizedPhone} | Sender: ${senderName}`);
    console.log(`[SMS DISPATCH] Msg: "${message}"`);

    try {
      const options = {
        hostname: 'api.mimsms.com',
        port: 443,
        path: '/api/V2/SMS',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          const body = data.trim();
          console.log(`[SMS DISPATCH] MiMSMS response — HTTP ${res.statusCode}: ${body}`);
          try {
            const json = JSON.parse(body);
            if (json.statusCode === 200 || json.status === true || json.success === true) {
              console.log(`[SMS DISPATCH] ✅ MiMSMS sent successfully!`);
            } else {
              console.error(`MiMSMS Gateway Error Details: ${body}`);
            }
          } catch {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              console.log(`[SMS DISPATCH] MiMSMS response (non-JSON): ${body}`);
            } else {
              console.error(`MiMSMS Gateway Error Details: HTTP ${res.statusCode} — ${body}`);
            }
          }
        });
      });

      req.on('error', (e) => {
        console.error('MiMSMS Gateway Request Error:', e.message);
      });

      req.write(postData);
      req.end();
    } catch (err) {
      console.error('MiMSMS Gateway Exception:', err.message);
    }
  } else {
    const smsUrl      = 'https://smsapi.shiramsystem.com/user_api/';
    const smsEmail    = process.env.SMS_USER || 'inforcmc@gmail.com';
    const smsPassword = process.env.SMS_PASS || '14142135';
    const smsMask     = process.env.SMS_MASK || 'HEALTH CITY';

    if (!smsEmail.trim() || !smsPassword.trim()) {
      console.log(`[SIMULATED SMS] No credentials — Phone: ${normalizedPhone}, Msg: "${message}"`);
      return;
    }

    const postBody = querystring.stringify({
      email:    smsEmail,
      password: smsPassword,
      method:   'send_sms',
      mask:     smsMask,
      message:  message
    }) + `&mobile%5B%5D=${encodeURIComponent(normalizedPhone)}`;

    console.log(`[SMS DISPATCH] POST → ${smsUrl}`);
    console.log(`[SMS DISPATCH] To: ${normalizedPhone} | Mask: ${smsMask}`);
    console.log(`[SMS DISPATCH] Msg: "${message}"`);

    try {
      const parsedUrl = new URL(smsUrl);
      const httpLib   = parsedUrl.protocol === 'http:' ? require('http') : https;

      const options = {
        hostname:           parsedUrl.hostname,
        port:               443,
        path:               parsedUrl.pathname,
        method:             'POST',
        rejectUnauthorized: false,
        headers: {
          'Content-Type':   'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postBody)
        }
      };

      const req = httpLib.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end',  () => {
          const body = data.trim();
          console.log(`[SMS DISPATCH] Shiram response — HTTP ${res.statusCode}: ${body}`);
          try {
            const json = JSON.parse(body);
            if (json.status === true && json.error_code === 0) {
              console.log(`[SMS DISPATCH] ✅ SMS sent successfully! Cost: ${json.cost}, Count: ${json.sms_count}`);
            } else {
              console.error(`SMS Gateway Error Details: error_code=${json.error_code} — ${json.message}`);
            }
          } catch {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              console.log(`[SMS DISPATCH] Gateway response (non-JSON): ${body}`);
            } else {
              console.error(`SMS Gateway Error Details: HTTP ${res.statusCode} — ${body}`);
            }
          }
        });
      });

      req.on('error', (e) => {
        console.error('SMS Gateway Error Details:', e.message);
      });

      req.write(postBody);
      req.end();
    } catch (err) {
      console.error('SMS Gateway Error Details:', err.message);
    }
  }
}

// Helper to send real Email via SendGrid API (no npm module required)
function sendEmail(to, subject, htmlContent) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@alamnagar-chc.org';

  if (!apiKey) {
    console.log(`[SIMULATED EMAIL] Skipping real email to ${to} (no SendGrid credentials).`);
    return;
  }

  const postData = JSON.stringify({
    personalizations: [{ to: [{ email: to }] }],
    from: { email: fromEmail, name: 'Alamnagar CHC' },
    subject: subject,
    content: [{ type: 'text/html', value: htmlContent }]
  });

  const options = {
    hostname: 'api.sendgrid.com',
    port: 443,
    path: '/v3/mail/send',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Content-Length': postData.length
    }
  };

  const req = https.request(options, (res) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log(`[SENDGRID EMAIL] Real email sent successfully to ${to}`);
    } else {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.error(`[SENDGRID EMAIL] Failed with status ${res.statusCode}: ${data}`);
      });
    }
  });

  req.on('error', (e) => {
    console.error(`[SENDGRID EMAIL] Request error: ${e.message}`);
  });

  req.write(postData);
  req.end();
}

/**
 * Sends a confirmation email by saving it as a beautifully styled HTML file.
 * This acts as a reliable development mailer.
 * 
 * @param {Object} appointment - The appointment details
 */
function sendAppointmentConfirmation(appointment) {
  const { id, patient_name, email, phone, appointment_date, appointment_time, status, notes } = appointment;
  
  const emailDir = path.join(__dirname, 'sent_emails');
  if (!fs.existsSync(emailDir)) {
    fs.mkdirSync(emailDir, { recursive: true });
  }

  const formattedDate = new Date(appointment_date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const emailHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Appointment Booking Confirmation - Alamnagar CHC</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333333;
      background-color: #f4f4f5;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      background: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
      border: 1px solid #e4e4e7;
    }
    .header {
      background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
      color: #ffffff;
      padding: 30px 20px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
    }
    .header p {
      margin: 5px 0 0 0;
      font-size: 14px;
      opacity: 0.9;
    }
    .content {
      padding: 30px 20px;
    }
    .content h2 {
      color: #0f172a;
      font-size: 18px;
      margin-top: 0;
      border-bottom: 2px solid #f4f4f5;
      padding-bottom: 10px;
    }
    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    .details-table th, .details-table td {
      padding: 12px 10px;
      text-align: left;
      border-bottom: 1px solid #f4f4f5;
    }
    .details-table th {
      color: #64748b;
      font-weight: 600;
      width: 35%;
    }
    .details-table td {
      color: #0f172a;
      font-weight: 500;
    }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .status-pending {
      background-color: #fef3c7;
      color: #d97706;
    }
    .status-approved {
      background-color: #d1fae5;
      color: #059669;
    }
    .status-cancelled {
      background-color: #fee2e2;
      color: #dc2626;
    }
    .notice {
      background-color: #f0fdfa;
      border-left: 4px solid #0d9488;
      padding: 15px;
      border-radius: 4px;
      margin-top: 20px;
      font-size: 14px;
      color: #0f766e;
    }
    .footer {
      background-color: #f8fafc;
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #64748b;
      border-top: 1px solid #e4e4e7;
    }
    .footer p {
      margin: 5px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Alamnagar CHC</h1>
      <p>Charitable Healthcare Centre Booking Confirmation</p>
    </div>
    <div class="content">
      <h2>Appointment Confirmed!</h2>
      <p>Dear <strong>${patient_name}</strong>,</p>
      <p>Thank you for scheduling a consultation at Alamnagar Charitable Healthcare Centre. Your appointment request has been successfully registered. Below are the details:</p>
      
      <table class="details-table">
        <tr>
          <th>Appointment ID</th>
          <td>#${id || 'N/A'}</td>
        </tr>
        <tr>
          <th>Date</th>
          <td>${formattedDate}</td>
        </tr>
        <tr>
          <th>Time</th>
          <td>${appointment_time}</td>
        </tr>
        <tr>
          <th>Status</th>
          <td>
            <span class="status-badge status-${status}">${status.toUpperCase()}</span>
          </td>
        </tr>
        <tr>
          <th>Contact Email</th>
          <td>${email}</td>
        </tr>
        <tr>
          <th>Contact Phone</th>
          <td>${phone}</td>
        </tr>
        ${notes ? `<tr>
          <th>Notes / Symptoms</th>
          <td>${notes}</td>
        </tr>` : ''}
      </table>
      
      <div class="notice">
        <strong>Important Information:</strong><br>
        Please arrive 10 minutes prior to your scheduled slot. If you need to cancel or reschedule, please contact our support staff immediately.
      </div>
    </div>
    <div class="footer">
      <p><strong>Alamnagar Charitable Healthcare Centre</strong></p>
      <p>Serving our community with dedication and dignity.</p>
      <p>&copy; 2026 Alamnagar CHC. Confidential healthcare communication.</p>
    </div>
  </div>
</body>
</html>`;

  const fileName = `booking_${id || Date.now()}_${new Date().toISOString().replace(/[:.]/g, '-')}.html`;
  const filePath = path.join(emailDir, fileName);
  
  fs.writeFileSync(filePath, emailHtml, 'utf8');
  console.log(`[MAILER] Confirmation email successfully written for ${patient_name} (${email}) -> ${filePath}`);
  
  // Real delivery
  sendEmail(email, "Appointment Booking Confirmation - Alamnagar CHC", emailHtml);
  sendSMS(phone, `[আলমনগর সিএইচসি] প্রিয় ${patient_name}, আপনার অ্যাপয়েন্টমেন্ট বুকিং সফলভাবে নিবন্ধিত হয়েছে। অনুমোদনের পর আপনাকে এসএমএস জানানো হবে।`);
  
  return filePath;
}

function sendBookingOTP(email, phone, otp) {
  const subject = "Appointment Booking OTP Verification";
  const emailHtml = `<!DOCTYPE html>
  <html>
  <head><style>body { font-family: sans-serif; line-height: 1.5; color: #333; }</style></head>
  <body>
    <div style="max-width: 500px; margin: 20px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
      <h2 style="color: #0d9488;">Appointment Booking OTP Verification</h2>
      <p>You have initiated an appointment booking. Please use the following One-Time Password (OTP) to confirm your request:</p>
      <div style="font-size: 24px; font-weight: bold; background: #f0fdfa; color: #0d9488; text-align: center; padding: 15px; letter-spacing: 5px; border-radius: 6px; margin: 20px 0;">
        ${otp}
      </div>
      <p>This code will expire in 10 minutes. If you did not make this request, please ignore this email.</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="font-size: 12px; color: #999;">Alamnagar Charitable Healthcare Centre</p>
    </div>
  </body>
  </html>`;

  const emailDir = path.join(__dirname, 'sent_emails');
  if (!fs.existsSync(emailDir)) {
    fs.mkdirSync(emailDir, { recursive: true });
  }
  const filePath = path.join(emailDir, `otp_${email.trim().replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.html`);
  
  fs.writeFileSync(filePath, emailHtml);
  console.log(`[MAILER] OTP email successfully written for ${email} -> ${filePath}`);
  console.log(`[MAILER] *** OTP CODE IS: ${otp} (for ${email} / ${phone}) ***`);

  // Real delivery
  sendEmail(email, subject, emailHtml);
  sendSMS(phone, `[আলমনগর সিএইচসি] আপনার অ্যাপয়েন্টমেন্ট বুকিংয়ের ওটিপি (OTP) হলো: ${otp}। এটি ১০ মিনিটের জন্য বৈধ।`);
}

function sendPrescriptionLinkSMS(phone, link) {
  sendSMS(phone, `[আলমনগর সিএইচসি] আপনার ডিজিটাল প্রেসক্রিপশন প্রস্তুত হয়েছে। দেখতে এখানে ক্লিক করুন: ${link}`);
}

module.exports = {
  sendAppointmentConfirmation,
  sendBookingOTP,
  sendSMS,
  sendPrescriptionLinkSMS
};
