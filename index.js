require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const sql = require('mssql');
const cron = require('node-cron');

// ─────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────
const DB_CONFIG = {
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: false,   // set true if using Azure SQL
    trustServerCertificate: true,
  },
};

const TABLE = process.env.DB_TABLE || 'dbo.SalaryPayroll';
const COMPANY = process.env.COMPANY_NAME || 'Your Company';
const SEND_DAY = parseInt(process.env.SEND_DAY) || 1;
const SEND_HOUR = parseInt(process.env.SEND_HOUR) || 9;
const SEND_MINUTE = parseInt(process.env.SEND_MINUTE) || 0;
const MSG_DELAY = parseInt(process.env.MESSAGE_DELAY_MS) || 3000;
const IS_TEST = process.argv.includes('--test');

// ─────────────────────────────────────────────
//  WHATSAPP CLIENT
// ─────────────────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'salary-bot' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

client.on('qr', (qr) => {
  console.log('\n📱 Scan this QR code with WhatsApp on your phone:\n');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
  console.log('✅ WhatsApp authenticated successfully.');
});

client.on('ready', () => {
  console.log('✅ WhatsApp client is ready.\n');

  if (IS_TEST) {
    console.log('🧪 --test flag detected. Running one-time test send...\n');
    sendSalaryMessages();
    return;
  }

  // Cron: SEND_MINUTE SEND_HOUR SEND_DAY * *
  const cronExpr = `${SEND_MINUTE} ${SEND_HOUR} ${SEND_DAY} * *`;
  console.log(`⏰ Scheduler active. Will send on day ${SEND_DAY} of every month at ${SEND_HOUR}:${String(SEND_MINUTE).padStart(2, '0')}`);
  console.log(`   Cron expression: ${cronExpr}\n`);

  cron.schedule(cronExpr, () => {
    console.log(`\n🚀 [${new Date().toLocaleString()}] Cron triggered — starting salary send...`);
    sendSalaryMessages();
  });
});

client.on('auth_failure', (msg) => {
  console.error('❌ Authentication failed:', msg);
});

client.on('disconnected', (reason) => {
  console.warn('⚠️  WhatsApp disconnected:', reason);
  console.log('   Reconnecting in 10s...');
  setTimeout(() => client.initialize(), 10000);
});

// ─────────────────────────────────────────────
//  FETCH EMPLOYEES FROM SQL SERVER
// ─────────────────────────────────────────────
async function fetchEmployees() {
  const now = new Date();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  // Use previous month if sending on 1st (salary for last month)
  const targetDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const salaryMonth = `${monthNames[targetDate.getMonth()]} ${targetDate.getFullYear()}`;

  console.log(`📅 Fetching salary data for: ${salaryMonth}`);

  let pool;
  try {
    pool = await sql.connect(DB_CONFIG);
    const result = await pool.request()
      .input('month', sql.NVarChar, salaryMonth)
      .query(`
       
       select * From ${TABLE}
      `);

    console.log(`   Found ${result.recordset.length} employee(s).\n`);
    return result.recordset;
  } catch (err) {
    console.error('❌ DB error:', err.message);
    return [];
  } finally {
    if (pool) await pool.close();
  }
}

// ─────────────────────────────────────────────
//  BUILD WHATSAPP MESSAGE
// ─────────────────────────────────────────────
function buildMessage(emp) {
  const gross = (emp.BasicSalary || 0) + (emp.HRA || 0) + (emp.SpecialAllow || 0) + (emp.OtherAllow || 0);
  const deduct = (emp.PF || 0) + (emp.TDS || 0) + (emp.ESI || 0) + (emp.OtherDed || 0);
  const net = gross - deduct;
  const fmt = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

  return [
    `🏢 *${COMPANY}*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📄 *Salary Slip — ${emp.SalaryMonth}*`,
    ``,
    `👤 *Employee Details*`,
    `Name        : ${emp.NAME}`,
    `ID          : ${emp.EMP_CODE}`,
    `ID          : ${emp.MOBILE}`,
    `ID          : ${emp.Message}`,

    ``,

    ``,
    `_This is a system-generated salary statement._`,
  ].join('\n');
}

// ─────────────────────────────────────────────
//  SEND MESSAGES
// ─────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendSalaryMessages() {
  const employees = await fetchEmployees();

  if (employees.length === 0) {
    console.log('⚠️  No records found. Nothing sent.');
    return;
  }

  let sent = 0, failed = 0, skipped = 0;

  for (const emp of employees) {
    try {
      const phone = emp.MOBILE.toString().replace(/[\s\-\+]/g, '');

      // ✅ Check if number exists on WhatsApp before sending
      const numberId = await client.getNumberId(phone);

      if (!numberId) {
        console.log(`⚠️  Skipped ${emp.NAME} (${phone}) — not on WhatsApp`);
        skipped++;
        continue;
      }

      const chatId = numberId._serialized;   // use verified ID, not manual @c.us
      const message = buildMessage(emp);

      await client.sendMessage(chatId, message);
      console.log(`✅ Sent to ${emp.NAME} (${phone})`);
      sent++;

    } catch (err) {
      console.error(`❌ Failed for ${emp.NAME}: ${err.message}`);
      failed++;
    }

    await sleep(MSG_DELAY);
  }

  console.log(`\n📊 Done — ${sent} sent, ${skipped} skipped (not on WhatsApp), ${failed} failed.\n`);
}

// ─────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────
console.log('🤖 Salary WhatsApp Bot starting...');
client.initialize();
