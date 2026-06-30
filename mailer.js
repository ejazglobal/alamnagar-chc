const fs = require('fs');
const path = require('path');

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
  return filePath;
}

module.exports = {
  sendAppointmentConfirmation
};
