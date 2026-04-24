# Salary WhatsApp Bot

Auto-sends formatted salary slips from SQL Server via WhatsApp on a fixed date every month.

---

## 1. Prerequisites

- Node.js v18+ installed  →  https://nodejs.org
- SQL Server running with salary data in a table
- WhatsApp installed on your phone (to scan QR once)
- Google Chrome installed (used by whatsapp-web.js)

---

## 2. Setup

### Step 1 — Install dependencies
```
npm install
```

### Step 2 — Configure .env
Open `.env` and fill in:
- DB_SERVER, DB_DATABASE, DB_USER, DB_PASSWORD
- DB_TABLE (your table name)
- COMPANY_NAME
- SEND_DAY (day of month, e.g. 1 = 1st)
- SEND_HOUR (24h format, e.g. 9 = 9 AM)

### Step 3 — Required SQL table columns
Your table must have these columns (exact names or edit index.js):

| Column       | Type           | Example              |
|--------------|----------------|----------------------|
| EmpID        | VARCHAR(20)    | EMP-001              |
| EmpName      | NVARCHAR(100)  | Rahul Sharma         |
| PhoneNumber  | VARCHAR(15)    | 919876543210         |
| SalaryMonth  | VARCHAR(20)    | March 2026           |
| BasicSalary  | DECIMAL(10,2)  | 30000.00             |
| HRA          | DECIMAL(10,2)  | 12000.00             |
| SpecialAllow | DECIMAL(10,2)  | 5000.00              |
| OtherAllow   | DECIMAL(10,2)  | 2000.00              |
| PF           | DECIMAL(10,2)  | 1800.00              |
| TDS          | DECIMAL(10,2)  | 2000.00              |
| ESI          | DECIMAL(10,2)  | 0.00                 |
| OtherDed     | DECIMAL(10,2)  | 0.00                 |
| WorkingDays  | INT            | 26                   |
| PresentDays  | INT            | 25                   |
| LeavesTaken  | INT            | 1                    |
| LeaveBalance | INT            | 10                   |

> PhoneNumber must include country code, no + or spaces.
> India example: 919876543210

---

## 3. Run

### First run — scan QR code
```
node index.js
```
A QR code appears in terminal. Scan it with WhatsApp on your phone
(WhatsApp > Linked Devices > Link a Device).

After scanning, session is saved locally — you won't need to scan again.

### Test send (sends immediately, doesn't wait for schedule)
```
node index.js --test
```

### Run normally (stays alive, sends on scheduled day/time)
```
node index.js
```

---

## 4. Keep it running 24/7 (optional but recommended)

Install PM2 to keep the bot running in background:
```
npm install -g pm2
pm2 start index.js --name salary-bot
pm2 save
pm2 startup     ← follow the printed command to auto-start on reboot
```

Check logs anytime:
```
pm2 logs salary-bot
```

---

## 5. How the schedule works

The bot sends salary for the PREVIOUS month.
Example: if SEND_DAY=1, on April 1st it sends "March 2026" salary slips.

Change `targetDate` logic in `fetchEmployees()` in index.js if you need
to send for the current month instead.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| QR not scanning | Make sure phone has internet, try again |
| DB connection error | Check DB_SERVER in .env, allow SQL Server port 1433 in firewall |
| Message not delivered | Check phone number format (no +, no spaces, with country code) |
| WhatsApp ban risk | Increase MESSAGE_DELAY_MS to 5000+ for large employee counts |
