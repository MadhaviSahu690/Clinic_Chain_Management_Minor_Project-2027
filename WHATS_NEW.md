# Update v2: Verified doctor license system

## How a doctor gets a license now
1. **Doctor requests a license** at `/auth/request-license`: personal details, specialization, qualification, experience, medical registration number, council, clinic, city/state, and **3 proof documents** (registration certificate, degree certificate, government ID). Files must be PDF/JPG/PNG, max 4 MB each. All 3 are mandatory.
2. **Admin gets a notification** (bell icon + dashboard banner) and opens `/admin/requests`. The review page shows every detail and lets the admin view/download each proof, then **Approve** or **Reject** (rejection needs a reason).
3. **On approval** the system creates the doctor account, issues a **License ID** (`CCL-XXXXXX`), and sends the doctor a **notification** (in-app bell, the status page, and an optional email).
4. **Doctor logs in** at `/auth/login` with email + password. Trying to log in before approval shows "waiting for approval" (or the rejection reason).
5. Doctors can check progress at `/auth/request-status` with their email.

## For patients
- `/doctors` lists only **verified, active** doctors: name, specialization, clinic, city/state, qualification, experience and License ID.
- Filter by specialization, place (city/state/clinic) and doctor name. Specialization chips show how many doctors are in each.
- "Check a License ID" box confirms whether a License ID is real.
- Every doctor has a public profile and a **Book** button that opens the appointment form with that doctor already selected.

## For the admin
- Doctor details page (`/admin/doctor/:id`) with all details and the proof documents the doctor submitted.
- Dashboard shows pending request count and a review table. Doctors table shows license ID and location.

## Other changes
- Direct doctor sign-up and the old "Verify Doctor" whitelist page were removed (replaced by the request flow).
- Logout link fixed for all roles (`/auth/logout`).
- UI refresh: new navbar (Staff Login dropdown, notification bell), hero banners, doctor cards, status pages, upload tiles.
- New dependency: `nodemailer` (used only if `SMTP_*` is set in `.env`; otherwise email is skipped).

---

# Clinic Chain — What's New

This is your original Clinic Chain project with a full set of new features added on top. Everything below is new or rewritten.

## 1. Admin role (`/admin/login`)
- Full dashboard: doctors, patients, receptionists, appointments, and a live "Unwanted Activity" panel.
- Remove or restore doctors, remove or flag patients, add/remove receptionists.
- "Verify Doctor" page — admin whitelists a license number + specialization before a doctor can self-register.
- First-time setup: run `npm run seed:admin` to create a default admin account (`admin` / `admin123` unless you set `ADMIN_USERNAME`/`ADMIN_PASSWORD` in `.env`). Change the password after first login (there's no in-app change-password form yet — update it directly in MongoDB or extend the admin routes).

## 2. Unwanted-activity detection (`/admin/activity`)
A rule-based audit log (`models/ActivityLog.js`, `utils/activityLogger.js`), not a full fraud-detection AI — worth knowing so expectations are accurate. It automatically flags:
- 5+ failed logins for the same username within 15 minutes ("possible brute-force attempt")
- Login attempts on a removed/deactivated account
- Duplicate patient registration attempts (same Aadhar + DOB already exists)
- It also logs (without flagging) every doctor/patient/receptionist add or remove, every appointment booked, and every AI summary request, so admins have a full trail.
- Admins can mark flagged items "Resolved."

## 3. Receptionist role (`/receptionist/login`)
- Admin creates receptionist accounts from the admin dashboard.
- Receptionists can register any patient (`/receptionist/add-patient`), browse/search patients, and book appointments.

## 4. Doctor specializations
Doctors now pick a specialization at registration: General Physician, Gynecologist, Cardiologist, Neurologist, Dermatologist, Orthopedic, Pediatrician, ENT Specialist, Psychiatrist, Dentist, Ophthalmologist, Urologist, Endocrinologist, Gastroenterologist (see `models/Doctor.js` — easy to extend the list).

## 5. Appointments & calendar (`/appointment/book`, `/appointment/calendar`)
- Patients, receptionists, or doctors can book a visit: pick a specialization → doctor → date (calendar widget) → time → reason.
- Prevents double-booking the same doctor/date/time.
- `/appointment/calendar` shows a day-grouped schedule with Confirm / Complete / Cancel actions for staff.

## 6. AI Health Assistant / chatbot (`/chatbot/:patientId`)
- Lets a patient (or staff, via the patient profile page) get a plain-language summary of one or all of their medical records, in the patient's chosen language (English, Hindi, Bengali, Marathi, Telugu, Tamil, Gujarati, Urdu, Kannada, Punjabi, Malayalam), or ask follow-up questions about it.
- Uses the Anthropic API. **You must set `ANTHROPIC_API_KEY` in `.env`** (see `.env.example`) — get one at https://console.anthropic.com. Without it, the page shows a friendly "not configured" message instead of failing.
- The assistant is instructed to never invent facts not in the records and always add a reminder to consult the doctor — but it's still a summarizer, not a diagnostic tool, so keep that framing in front of end users.

## 7. Security / session fix
The original project generated a JWT on login but never stored it anywhere, so nothing was actually protected. This is now fixed:
- Sessions are stored in an `httpOnly` cookie (`cookie-parser` added).
- `middeware/auth.js` now exposes `requireAuth(...roles)` for role-based route protection, used across admin/doctor/receptionist routes.

## 8. UI refresh
- New shared design system: `public/css/app.css` (glass cards, stat tiles, tables, badges, tabs, a day-grouped calendar, and a chat UI), layered on top of your existing `style.css`/`home.css` so the look stays consistent.
- Every page now shares one role-aware top navbar (`views/partials/navbar.ejs`).
- Homepage got new feature cards (multi-specialty doctors, appointments, AI assistant, receptionist & admin mentions) and links to all three login types.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env` and fill in `MONGO_URI`, `JWT_SECRET`, and `ANTHROPIC_API_KEY` (for the chatbot).
3. `npm run seed:admin` (creates the first admin account).
4. `npm start` (or `npm run dev` with nodemon).
5. Log in at `/admin/login` → whitelist a doctor license at "Verify Doctor" → that doctor can now register at `/auth/register` → add a receptionist from the admin dashboard.

## Ideas for next steps (not built yet, but natural extensions)
- Admin "change my password" form.
- Email/SMS appointment reminders.
- Doctor-side view of "my patients" filtered by specialization.
- Rate-limiting middleware (e.g. `express-rate-limit`) in front of login routes, on top of the activity-log flagging.
