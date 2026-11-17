# Turihamwe Management System — Pandora Networks Uganda SMS Gateway Guide
**Institution**: Nyamuyanja SACCO Ltd, Isingiro District, Uganda  

---

## 1. Exclusive Provider Specification

The official and exclusive SMS delivery partner for Nyamuyanja SACCO Ltd is **Pandora Networks**.

- **API Documentation**: `https://sms.thepandoranetworks.com/api`
- **Send SMS Endpoint**: `https://www.sms.thepandoranetworks.com/API/send_sms/`
- **Balance Inquiry Endpoint**: `https://www.sms.thepandoranetworks.com/API/balance_inquiry.php`
- **Alpha Sender ID**: `NYAMUYANJA` (Registered with Uganda Communications Commission, max 11 alphanumeric chars)

---

## 2. Environment Configuration

### Development / Staging Mode (.env)
```bash
SMS_PROVIDER=PANDORA
SMS_ENABLED=true
PANDORA_SMS_API_URL=https://www.sms.thepandoranetworks.com/API/send_sms/
PANDORA_SMS_BALANCE_URL=https://www.sms.thepandoranetworks.com/API/balance_inquiry.php
PANDORA_SMS_PHONE_NUMBER=256701000000
PANDORA_SMS_PASSWORD=your_pandora_password_here
PANDORA_SMS_SENDER_ID=NYAMUYANJA
```

### Production Mode (.env)
```bash
SMS_PROVIDER=PANDORA
SMS_ENABLED=true
PANDORA_SMS_API_URL=https://www.sms.thepandoranetworks.com/API/send_sms/
PANDORA_SMS_BALANCE_URL=https://www.sms.thepandoranetworks.com/API/balance_inquiry.php
PANDORA_SMS_PHONE_NUMBER=256XXXXXXXXX
PANDORA_SMS_PASSWORD=your_production_pandora_password
PANDORA_SMS_SENDER_ID=NYAMUYANJA
```

---

## 3. Supported Notification Events & Cadence

1. **Exact-Date Policy Expiry Notification (`EXPIRY_DATE_NOTICE`)**:
   - Sent **once** strictly on the exact maturity/expiry date at `09:00 Africa/Kampala` (`UTC+03:00`) using the approved Runyankore text.
   - Advance spam reminders (30/14/7 days prior) and non-expiry templates are permanently deactivated.

---

## 4. E.164 Phone Number Formatting

The SMS engine strictly validates and normalizes all recipient phone numbers to Ugandan format:
- `0772 123 456` $\rightarrow$ `256772123456` / `+256772123456`
- `256701234567` $\rightarrow$ `256701234567`
- `+256782000000` $\rightarrow$ `256782000000`

---

## 5. Duplicate Suppression Guarantee

The SMS service tracks `eventReferenceKey` and recipient/message deduplication keys within a 24-hour window. Even if a synchronization retry or scheduler cycle runs repeatedly, the system suppresses duplicate SMS dispatches.
