/**
 * Feedback Data Seeder
 *
 * Seeds 5 doctors × 10 patients = 50 feedback records into the production DB.
 * Runs the sentiment batch after seeding so analytics update immediately.
 * Data is kept permanently (no cleanup).
 *
 * Duplicate-safe: checks for existing seed emails before inserting.
 *
 * Usage:
 *   node seed_feedback_data.js
 *   node seed_feedback_data.js --dry-run   (show what would be created, no writes)
 */

'use strict';

require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');

const Doctor         = require('./models/DoctorModel');
const Patient        = require('./models/PatientModel');
const Appointment    = require('./models/DoctorAppointmentModel');
const PatientFeedback = require('./models/PatientFeedbackModel');
const DoctorFeedbackAnalysis = require('./models/DoctorFeedbackAnalysisModel');
const { runSentimentBatch } = require('./services/sentimentBatchService');

const DRY_RUN = process.argv.includes('--dry-run');

// ── colour helpers ────────────────────────────────────────────────────────────
const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', B = '\x1b[34m';
const C = '\x1b[36m', M = '\x1b[35m', DIM = '\x1b[2m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
const ok   = (m) => console.log(`  ${G}✔${RESET}  ${m}`);
const info = (m) => console.log(`  ${B}ℹ${RESET}  ${m}`);
const warn = (m) => console.log(`  ${Y}⚠${RESET}  ${m}`);
const head = (m) => console.log(`\n${BOLD}${C}━━  ${m}  ━━${RESET}`);

// ── seed prefix (used in emails only for duplicate detection) ─────────────────
const SEED_TAG = '__tabeeb_seed__';

// ── doctors ───────────────────────────────────────────────────────────────────
const DOCTORS = [
  { name: 'Dr. Sara Ahmed',     specialty: 'Cardiology',        email: `${SEED_TAG}dr.sara.ahmed@tabeeb.com` },
  { name: 'Dr. Omar Mirza',     specialty: 'Neurology',         email: `${SEED_TAG}dr.omar.mirza@tabeeb.com` },
  { name: 'Dr. Amna Khan',      specialty: 'General Physician', email: `${SEED_TAG}dr.amna.khan@tabeeb.com` },
  { name: 'Dr. Bilal Farooq',   specialty: 'Dermatology',       email: `${SEED_TAG}dr.bilal.farooq@tabeeb.com` },
  { name: 'Dr. Hira Siddiqui',  specialty: 'Pediatrics',        email: `${SEED_TAG}dr.hira.siddiqui@tabeeb.com` },
];

// ── patients ──────────────────────────────────────────────────────────────────
const PATIENTS = [
  { firstName: 'Ahmed',   lastName: 'Ali',      gender: 'Male',   Age: 34, email: `${SEED_TAG}ahmed.ali@tabeeb.com` },
  { firstName: 'Fatima',  lastName: 'Malik',    gender: 'Female', Age: 28, email: `${SEED_TAG}fatima.malik@tabeeb.com` },
  { firstName: 'Hassan',  lastName: 'Raza',     gender: 'Male',   Age: 45, email: `${SEED_TAG}hassan.raza@tabeeb.com` },
  { firstName: 'Zainab',  lastName: 'Qureshi',  gender: 'Female', Age: 22, email: `${SEED_TAG}zainab.qureshi@tabeeb.com` },
  { firstName: 'Usman',   lastName: 'Sheikh',   gender: 'Male',   Age: 55, email: `${SEED_TAG}usman.sheikh@tabeeb.com` },
  { firstName: 'Nadia',   lastName: 'Hussain',  gender: 'Female', Age: 31, email: `${SEED_TAG}nadia.hussain@tabeeb.com` },
  { firstName: 'Tariq',   lastName: 'Baig',     gender: 'Male',   Age: 42, email: `${SEED_TAG}tariq.baig@tabeeb.com` },
  { firstName: 'Sana',    lastName: 'Farooq',   gender: 'Female', Age: 38, email: `${SEED_TAG}sana.farooq@tabeeb.com` },
  { firstName: 'Kamran',  lastName: 'Ahmad',    gender: 'Male',   Age: 27, email: `${SEED_TAG}kamran.ahmad@tabeeb.com` },
  { firstName: 'Maria',   lastName: 'Iqbal',    gender: 'Female', Age: 50, email: `${SEED_TAG}maria.iqbal@tabeeb.com` },
];

// ── 50 reviews: [doctorIdx, patientIdx, rating, lang, text] ──────────────────
// Each of the 10 patients reviews each of the 5 doctors exactly once.
const REVIEWS = [
  // ── Dr. Sara Ahmed — Cardiology ───────────────────────────────────────────
  [0, 0, 5, 'en', 'Dr. Sara Ahmed is a brilliant cardiologist. She diagnosed my condition quickly and explained everything clearly. My heart health has improved dramatically since starting her treatment plan.'],
  [0, 1, 4, 'ur', 'ڈاکٹر سارہ احمد نے دل کی تکلیف کا بہت اچھا علاج کیا۔ وہ بہت پیشہ ورانہ اور مہربان ہیں۔ دوائی سے کافی فرق پڑا۔ اگلی بار بھی ان کے پاس جاؤں گی۔'],
  [0, 2, 5, 'ur', 'ڈاکٹر سارہ احمد ایک بہترین ماہر امراض قلب ہیں۔ انہوں نے میری ای سی جی رپورٹ بہت توجہ سے دیکھی اور صحیح تشخیص کی۔ میں ان کی تعریف کیے بغیر نہیں رہ سکتا۔'],
  [0, 3, 2, 'en', 'The appointment was rushed and Dr. Sara barely had time to listen to my concerns. The prescription was generic and I did not feel my case was taken seriously.'],
  [0, 4, 5, 'en', 'Outstanding cardiologist. Dr. Sara spent a full 45 minutes with me, reviewed all my past reports, and created a comprehensive treatment plan. Best cardiac care I have received.'],
  [0, 5, 4, 'ur', 'ڈاکٹر صاحبہ نے بلڈ پریشر کا مسئلہ بہت اچھے سے حل کیا۔ نئی دوائی سے پریشر کنٹرول میں ہے۔ ملاقات کا تجربہ اچھا رہا۔ مزید فالو اپ کی ضرورت ہوگی۔'],
  [0, 6, 1, 'en', 'Very disappointing experience. Dr. Sara seemed distracted throughout the consultation and gave incorrect dosage instructions. Had to visit another doctor to correct the mistake.'],
  [0, 7, 5, 'ur', 'دل کی تکلیف میں ڈاکٹر سارہ احمد نے غیر معمولی مدد کی۔ وہ بہت تجربہ کار ہیں اور مریض کو مکمل وقت دیتی ہیں۔ ان کی وجہ سے آج میں صحت مند ہوں۔ بہت شکریہ!'],
  [0, 8, 3, 'en', 'Dr. Sara is competent but the clinic is very crowded. Waited over an hour past my appointment time. The consultation itself was fine but the overall experience was average.'],
  [0, 9, 4, 'en', 'Good cardiologist with excellent knowledge. Explained my test results thoroughly and suggested lifestyle changes along with medication. Satisfied with the care received.'],

  // ── Dr. Omar Mirza — Neurology ────────────────────────────────────────────
  [1, 0, 3, 'ur', 'ڈاکٹر عمر مرزا نے سر درد کا معائنہ کیا۔ انہوں نے کچھ ٹیسٹ لکھے اور دوائی دی۔ تجربہ معمولی رہا، نہ بہت اچھا نہ بہت برا۔ امید ہے دوائی سے فائدہ ہوگا۔'],
  [1, 1, 5, 'en', 'Dr. Omar Mirza is an exceptional neurologist. After years of unexplained headaches, he finally identified the root cause and prescribed the right treatment. Life changing!'],
  [1, 2, 4, 'ur', 'ڈاکٹر عمر نے مائیگرین کا بہت اچھا علاج کیا۔ انہوں نے تفصیل سے سمجھایا کہ یہ بیماری کیوں ہوتی ہے۔ دوائی سے درد میں کمی آئی ہے۔ مجموعی تجربہ مثبت رہا۔'],
  [1, 3, 1, 'en', 'Terrible experience. Dr. Omar was dismissive of my symptoms and refused to order an MRI. Had to go to a different hospital where a serious condition was eventually found.'],
  [1, 4, 5, 'ur', 'ڈاکٹر عمر مرزا بہترین نیورولوجسٹ ہیں۔ انہوں نے میری مرگی کی بیماری کو بہت مہارت سے سنبھالا۔ دورے اب بالکل کنٹرول میں ہیں۔ ان کا بہت شکریہ ادا کرتا ہوں۔'],
  [1, 5, 4, 'en', 'Professional and knowledgeable. Dr. Omar took a detailed history and ran thorough neurological tests. Diagnosed my nerve issue correctly and the treatment is working well.'],
  [1, 6, 2, 'ur', 'ڈاکٹر عمر نے زیادہ توجہ نہیں دی۔ ملاقات بہت مختصر تھی اور سوالوں کے جواب اطمینان بخش نہیں تھے۔ دوسرے ڈاکٹر سے مشورہ لینا پڑے گا۔'],
  [1, 7, 5, 'en', 'Dr. Omar is incredibly thorough. He spent a long time reviewing my history, performed a detailed examination, and explained my diagnosis in terms I could understand. Highly recommended.'],
  [1, 8, 3, 'ur', 'ڈاکٹر صاحب نے معائنہ کیا اور ٹیسٹ لکھے۔ انتظار بہت لمبا تھا۔ علاج کے نتائج ابھی آنے باقی ہیں۔ دیکھتے ہیں آگے کیا ہوتا ہے۔'],
  [1, 9, 4, 'en', 'Solid neurologist. Identified my vertigo problem and prescribed vestibular rehabilitation. Follow-up was timely and he was reachable for questions between appointments.'],

  // ── Dr. Amna Khan — General Physician ────────────────────────────────────
  [2, 0, 4, 'en', 'Dr. Amna Khan is a wonderful family doctor. She listens carefully, never rushes the appointment, and follows up proactively. My whole family sees her and we are all very happy.'],
  [2, 1, 2, 'ur', 'ڈاکٹر آمنہ خان نے میری بات ٹھیک سے نہیں سنی اور جلدی میں نسخہ لکھ دیا۔ دوائی سے کوئی خاص فرق نہیں پڑا۔ اگلی بار کوئی اور ڈاکٹر دیکھوں گی۔'],
  [2, 2, 5, 'en', 'The best GP in the city. Dr. Amna is patient, thorough, and has excellent diagnostic skills. She caught my diabetes early during a routine checkup. Forever grateful.'],
  [2, 3, 5, 'ur', 'ڈاکٹر آمنہ خان نے بخار اور کھانسی کا بہت جلدی علاج کیا۔ وہ مریض کو آرام دہ محسوس کراتی ہیں۔ ان کی دوائی سے تین دن میں فرق پڑ گیا۔ بہت بہترین ڈاکٹر ہیں!'],
  [2, 4, 3, 'en', 'Average experience. Dr. Amna is pleasant but I felt the consultation was somewhat superficial. She prescribed standard medication without investigating the underlying cause of my recurring infections.'],
  [2, 5, 5, 'ur', 'ڈاکٹر آمنہ خان بہت ہمدرد اور قابل ڈاکٹر ہیں۔ انہوں نے میری ذیابیطس کو بہت اچھے سے مینیج کیا۔ ہر بار فالو اپ کرتی ہیں اور ہر سوال کا جواب دیتی ہیں۔'],
  [2, 6, 4, 'en', 'Dr. Amna is highly competent and very approachable. She explained my thyroid condition clearly and adjusted medication based on my blood tests. Consistent and reliable care.'],
  [2, 7, 1, 'ur', 'بہت بری ملاقات رہی۔ ڈاکٹر صاحبہ نے میری شکایات کو سنجیدگی سے نہیں لیا اور کہا کہ سب ٹھیک ہے۔ بعد میں دوسرے ڈاکٹر سے پتہ چلا کہ انفیکشن تھا۔'],
  [2, 8, 4, 'en', 'Good general physician. Dr. Amna took a complete history and ordered appropriate tests. The diagnosis was accurate and recovery was quick with her treatment plan.'],
  [2, 9, 5, 'ur', 'ڈاکٹر آمنہ خان کا علاج بہترین ہے۔ میری پرانی بیماری جو کئی ڈاکٹروں سے ٹھیک نہ ہوئی، ان کے علاج سے چند ہفتوں میں بہتر ہوگئی۔ خدا انہیں جزائے خیر دے۔'],

  // ── Dr. Bilal Farooq — Dermatology ───────────────────────────────────────
  [3, 0, 5, 'ur', 'ڈاکٹر بلال فاروق نے میری جلد کی پرانی بیماری کا بہت اچھا علاج کیا۔ انہوں نے کئی ٹیسٹ کروائے اور صحیح تشخیص کی۔ مہینوں میں جلد بالکل صاف ہوگئی۔'],
  [3, 1, 4, 'en', 'Dr. Bilal is a skilled dermatologist. He identified my eczema type correctly and the treatment regimen he prescribed has been highly effective. Very satisfied with results.'],
  [3, 2, 2, 'ur', 'کریم سے الرجی ہوگئی۔ ڈاکٹر بلال نے بغیر ٹیسٹ کے دوائی لکھ دی۔ جب ردعمل ہوا تو انہوں نے پہلے مجھے اہمیت نہیں دی۔ مایوسی ہوئی۔'],
  [3, 3, 5, 'en', 'Incredible dermatologist. Dr. Bilal diagnosed my rare skin condition after two years of wrong diagnoses by other doctors. His expertise and dedication are truly outstanding.'],
  [3, 4, 4, 'ur', 'ڈاکٹر بلال فاروق نے بالوں کے جھڑنے کا مسئلہ حل کیا۔ علاج مؤثر رہا اور انہوں نے غذائی مشورے بھی دیے۔ اگرچہ نتائج آنے میں وقت لگا لیکن بہتری آئی۔'],
  [3, 5, 3, 'en', 'Decent dermatologist but the clinic feels very transactional. Dr. Bilal is knowledgeable but I wished he had spent more time explaining aftercare. Treatment was effective though.'],
  [3, 6, 5, 'ur', 'ڈاکٹر صاحب نے مہاسوں کا بہترین علاج کیا۔ نئی دوائیوں سے جلد بالکل صاف ہوگئی۔ وہ بہت تجربہ کار ڈاکٹر ہیں اور مریض کو پوری توجہ دیتے ہیں۔ بہت شکریہ!'],
  [3, 7, 1, 'en', 'Worst dermatology visit ever. The prescribed cream caused a severe reaction and when I called the clinic the staff were unhelpful. No proper follow up was provided whatsoever.'],
  [3, 8, 4, 'en', 'Dr. Bilal successfully treated my psoriasis which had been troubling me for years. The biological treatment he recommended has been a game changer. Very professional service.'],
  [3, 9, 3, 'ur', 'ڈاکٹر بلال نے فنگل انفیکشن کا علاج کیا۔ دوائی نے کام کیا لیکن بیماری دوبارہ آگئی۔ زیادہ تفصیلی گائیڈنس کی ضرورت تھی۔ اوسط تجربہ رہا مجموعی طور پر۔'],

  // ── Dr. Hira Siddiqui — Pediatrics ───────────────────────────────────────
  [4, 0, 4, 'en', 'Dr. Hira Siddiqui is wonderful with children. My son was terrified of doctors but she made him laugh and completely at ease. Excellent paediatrician with great bedside manner.'],
  [4, 1, 5, 'ur', 'ڈاکٹر حرا صدیقی نے میری بیٹی کی بیماری کا بہت جلدی علاج کیا۔ وہ بچوں کے ساتھ بہت پیار سے پیش آتی ہیں۔ بچے کو اب ڈاکٹر سے ڈر نہیں لگتا۔ بہت شکریہ!'],
  [4, 2, 5, 'en', 'Best paediatrician we have ever visited. Dr. Hira is patient, kind, and extremely thorough. She caught my daughter\'s iron deficiency that others had missed. Forever grateful.'],
  [4, 3, 4, 'ur', 'ڈاکٹر حرا نے بچے کی خوراک اور نشوونما کے بارے میں بہت مفید مشورے دیے۔ وہ بچوں کے ساتھ بہت دوستانہ رویہ رکھتی ہیں۔ اچھا تجربہ رہا، دوبارہ جائیں گے۔'],
  [4, 4, 2, 'en', 'Disappointed with the visit. Dr. Hira seemed distracted and the examination was rushed. My child\'s fever returned two days later and we had to visit the emergency department.'],
  [4, 5, 5, 'ur', 'ڈاکٹر حرا صدیقی بچوں کی بہترین ڈاکٹر ہیں۔ میرے بچے کو سانس کی تکلیف تھی، انہوں نے فوری اور صحیح علاج کیا۔ بچہ اب بالکل ٹھیک ہے۔ اللہ انہیں سلامت رکھے۔'],
  [4, 6, 3, 'en', 'Dr. Hira is competent but the waiting time at her clinic is very long. By the time we saw her my child was exhausted. The treatment was fine but the experience was stressful.'],
  [4, 7, 5, 'ur', 'ڈاکٹر حرا نے بچے کی ویکسینیشن اور معمول کا معائنہ بہت احسن طریقے سے کیا۔ وہ بچوں کی نفسیات کو سمجھتی ہیں اور انہیں آرام دہ محسوس کراتی ہیں۔ بہترین!'],
  [4, 8, 4, 'en', 'Good paediatrician overall. Dr. Hira gave clear instructions for home care and was available for follow up questions. My son\'s condition improved faster than expected.'],
  [4, 9, 1, 'ur', 'بہت خراب تجربہ رہا۔ ڈاکٹر نے بچے کو ٹھیک سے نہیں دیکھا اور غلط دوائی لکھ دی۔ فارماسسٹ نے بتایا کہ دوائی اس عمر کے بچے کے لیے موزوں نہیں۔ بہت مایوسی ہوئی۔'],
];

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const engCount = REVIEWS.filter(r => r[3] === 'en').length;
  const urCount  = REVIEWS.filter(r => r[3] === 'ur').length;

  console.log(`\n${BOLD}${M}╔═══════════════════════════════════════════════════╗`);
  console.log(`║          Tabeeb Feedback Data Seeder             ║`);
  console.log(`╚═══════════════════════════════════════════════════╝${RESET}`);
  console.log(`${DIM}  Doctors: ${DOCTORS.length}  ·  Patients: ${PATIENTS.length}  ·  Reviews: ${REVIEWS.length} (${urCount} Urdu + ${engCount} English)${RESET}`);
  if (DRY_RUN) console.log(`\n${Y}${BOLD}  DRY RUN — no writes will be made${RESET}\n`);

  // ── connect ────────────────────────────────────────────────────────────────
  head('STEP 1 — Database Connection');
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: process.env.DATABASE_NAME || 'Tabeeb',
    serverSelectionTimeoutMS: 10000,
  });
  ok(`Connected to MongoDB (${process.env.DATABASE_NAME || 'Tabeeb'})`);

  // ── skip if already seeded ─────────────────────────────────────────────────
  head('STEP 2 — Duplicate Check');
  const existingDoctor = await Doctor.findOne({ email: DOCTORS[0].email });
  if (existingDoctor) {
    warn('Seed data already exists in this database.');
    warn('To re-seed, first remove records with emails containing "__tabeeb_seed__".');
    await mongoose.disconnect();
    return;
  }
  ok('No existing seed data found — proceeding');

  if (DRY_RUN) {
    info('Dry run complete — no changes made.');
    await mongoose.disconnect();
    return;
  }

  // ── create doctors ─────────────────────────────────────────────────────────
  head('STEP 3 — Creating 5 Doctors');
  const doctorIds = [];
  for (const d of DOCTORS) {
    const doc = await Doctor.create({
      DoctorName: d.name,
      email: d.email,
      password: 'Tabeeb@Seed2025',
      specialization: [d.specialty],
      status: 'approved',
    });
    doctorIds.push(doc._id);
    info(`${d.name}  (${d.specialty})`);
  }
  ok(`${doctorIds.length} doctors created`);

  // ── create patients ────────────────────────────────────────────────────────
  head('STEP 4 — Creating 10 Patients');
  const patientIds = [];
  for (const p of PATIENTS) {
    const pat = await Patient.create({
      firstName: p.firstName,
      lastName: p.lastName,
      emailAddress: p.email,
      gender: p.gender,
      Age: p.Age,
      isActive: true,
    });
    patientIds.push(pat._id);
    info(`${p.firstName} ${p.lastName}  (${p.gender}, ${p.Age}y)`);
  }
  ok(`${patientIds.length} patients created`);

  // ── create consultations ───────────────────────────────────────────────────
  head('STEP 5 — Creating 50 Completed Consultations');
  const apptMap = {};
  const apptDate = new Date();
  apptDate.setDate(apptDate.getDate() - 10);

  for (const [dIdx, pIdx] of REVIEWS.map(r => [r[0], r[1]])) {
    const key = `${dIdx}-${pIdx}`;
    if (apptMap[key]) continue;
    const appt = await Appointment.create({
      doctorId:        doctorIds[dIdx],
      patientId:       patientIds[pIdx],
      appointmentDate: apptDate,
      type:            'In-Person',
      status:          'completed',
      reason:          'Consultation',
    });
    apptMap[key] = appt._id;
  }
  ok(`${Object.keys(apptMap).length} consultations created`);

  // ── create feedback ────────────────────────────────────────────────────────
  head('STEP 6 — Inserting 50 Feedback Records');
  const feedbackIds = [];
  for (const [dIdx, pIdx, rating, lang, text] of REVIEWS) {
    const key    = `${dIdx}-${pIdx}`;
    const langTag = lang === 'ur' ? `${M}[UR]${RESET}` : `${C}[EN]${RESET}`;
    const fb = await PatientFeedback.create({
      patient_id:      patientIds[pIdx],
      doctor_id:       doctorIds[dIdx],
      consultation_id: apptMap[key],
      rating,
      feedback_text:   text,
      sentimentStatus: 'pending',
      patient_age:     PATIENTS[pIdx].Age,
      patient_gender:  PATIENTS[pIdx].gender,
      is_anonymous:    true,
      created_at:      new Date(),
    });
    feedbackIds.push(fb._id);
    const preview = text.length > 60 ? text.substring(0, 60) + '…' : text;
    info(`${langTag} ★${rating}  ${DOCTORS[dIdx].name} ← ${PATIENTS[pIdx].firstName}: "${DIM}${preview}${RESET}"`);
  }
  ok(`${feedbackIds.length} feedback records inserted`);

  // ── run sentiment batch ────────────────────────────────────────────────────
  head('STEP 7 — Running Sentiment Batch');
  const urReviews = REVIEWS.filter(r => r[3] === 'ur').length;
  console.log(`  ${Y}  (GPT-4o-mini called for ${urReviews} Urdu reviews — expect ~30–60 s)${RESET}`);
  const summary = await runSentimentBatch();

  console.log(`\n  ${BOLD}Batch summary:${RESET}`);
  console.log(`    total      : ${summary.total}`);
  console.log(`    processed  : ${G}${summary.processed}${RESET}`);
  console.log(`    translated : ${M}${summary.translated}${RESET}`);
  console.log(`    failed     : ${summary.failed > 0 ? R : G}${summary.failed}${RESET}`);
  console.log(`    duration   : ${summary.durationMs} ms`);

  // ── final stats ────────────────────────────────────────────────────────────
  head('STEP 8 — Final Verification');

  const analyses = await DoctorFeedbackAnalysis.find({ doctor_id: { $in: doctorIds } })
    .sort({ average_rating: -1 })
    .lean();

  const docIdxById = {};
  doctorIds.forEach((id, i) => { docIdxById[id.toString()] = i; });

  console.log(`\n  ${BOLD}Doctor rankings after seed:${RESET}`);
  console.log(`  ${'Doctor'.padEnd(22)}${'Specialty'.padEnd(22)}${'Avg★'.padEnd(7)}${'Reviews'.padEnd(10)}${'Pos'.padEnd(6)}${'Neu'.padEnd(6)}Neg`);
  console.log(`  ${DIM}${'─'.repeat(78)}${RESET}`);

  for (const a of analyses) {
    const dIdx = docIdxById[a.doctor_id.toString()];
    const d    = DOCTORS[dIdx];
    const ss   = a.sentiment_summary || {};
    console.log(
      `  ${(d?.name || '?').padEnd(22)}` +
      `${(d?.specialty || '?').padEnd(22)}` +
      `${G}${(a.average_rating || 0).toFixed(1)}${RESET}`.padEnd(13) +
      `${a.total_feedback_count || 0}`.padEnd(10) +
      `${G}${ss.positive || 0}${RESET}`.padEnd(12) +
      `${Y}${ss.neutral || 0}${RESET}`.padEnd(12) +
      `${R}${ss.negative || 0}${RESET}`
    );
  }

  console.log(`\n  ${G}${BOLD}Seeding complete! ✔${RESET}`);
  console.log(`  ${DIM}5 doctors · 10 patients · 50 reviews · all sentiment-processed${RESET}\n`);
  console.log(`  ${B}The admin dashboard will now show data for 5 doctors and 10 patients.${RESET}`);
  console.log(`  ${B}Click "Refresh" on the dashboard to update the analytics cache.${RESET}\n`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(`\n${R}${BOLD}Fatal error:${RESET}`, err);
  mongoose.disconnect().finally(() => process.exit(1));
});
