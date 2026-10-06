// Shared demo seed data used by both the localStorage mock API and the
// Firestore bootstrap routine.

const AV = {
  doc1: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150&auto=format&fit=crop&q=80',
  doc2: 'https://images.unsplash.com/photo-1678695972687-033fa0bdbac9?w=150&auto=format&fit=crop&q=80',
  doc3: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=150&auto=format&fit=crop&q=80',
  doc4: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=150&auto=format&fit=crop&q=80',
  doc5: 'https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=150&auto=format&fit=crop&q=80',
  doc6: 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=150&auto=format&fit=crop&q=80',
  doc7: 'https://images.unsplash.com/photo-1607990281513-2c110a25bd8c?w=150&auto=format&fit=crop&q=80',
  doc8: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=150&auto=format&fit=crop&q=80',
};

export const INITIAL_DOCTORS = [
  { id: 'd1', name: 'Dr. Sandeep Adhikari', email: 'sandeep@hospital.com', specialty: 'Cardiologist', phone: '9800000001', fee: 1200, experience: 8, available: true, avatar: AV.doc1 },
  { id: 'd2', name: 'Dr. Sushila Acharya', email: 'sushila@hospital.com', specialty: 'Pediatrician', phone: '9800000002', fee: 800, experience: 6, available: true, avatar: AV.doc2 },
  { id: 'd3', name: 'Dr. Binod Thapa', email: 'binod@hospital.com', specialty: 'Orthopedic', phone: '9800000003', fee: 1000, experience: 10, available: true, avatar: AV.doc3 },
  { id: 'd4', name: 'Dr. Anjali Mehta', email: 'anjali@hospital.com', specialty: 'Dermatologist', phone: '9800000004', fee: 900, experience: 5, available: false, avatar: AV.doc4 },
  { id: 'd5', name: 'Dr. Nisha Gurung', email: 'nisha@hospital.com', specialty: 'Gynecologist', phone: '9800000005', fee: 1100, experience: 9, available: true, avatar: AV.doc5 },
  { id: 'd6', name: 'Dr. Prakash Rai', email: 'prakash@hospital.com', specialty: 'Neurologist', phone: '9800000006', fee: 1500, experience: 12, available: true, avatar: AV.doc6 },
  { id: 'd7', name: 'Dr. Sunita Bhattarai', email: 'sunita@hospital.com', specialty: 'ENT Specialist', phone: '9800000007', fee: 850, experience: 4, available: true, avatar: AV.doc7 },
  { id: 'd8', name: 'Dr. Rajesh Pandey', email: 'rajesh@hospital.com', specialty: 'General Physician', phone: '9800000008', fee: 700, experience: 7, available: false, avatar: AV.doc8 },
];

export const INITIAL_PATIENTS = [
  { id: 'p1', name: 'Priya Sharma', email: 'priya@gmail.com', phone: '+977 98012 34567', address: 'Biratnagar, Nepal' },
  { id: 'p2', name: 'Apekshya Shrestha', email: 'apekshya@gmail.com', phone: '+977 98123 45678', address: 'Kathmandu, Nepal' },
  { id: 'p3', name: 'Ramesh Karki', email: 'ramesh@gmail.com', phone: '+977 98234 56789', address: 'Pokhara, Nepal' },
  { id: 'p4', name: 'Bishal Tamang', email: 'bishal@gmail.com', phone: '+977 98411 22334', address: 'Lalitpur, Nepal' },
  { id: 'p5', name: 'Sarita Rai', email: 'sarita@gmail.com', phone: '+977 98512 33445', address: 'Dharan, Nepal' },
  { id: 'p6', name: 'Kiran Gurung', email: 'kiran@gmail.com', phone: '+977 98613 44556', address: 'Butwal, Nepal' },
  { id: 'p7', name: 'Manisha Thapa', email: 'manisha@gmail.com', phone: '+977 98714 55667', address: 'Bhaktapur, Nepal' },
  { id: 'p8', name: 'Deepak Basnet', email: 'deepak@gmail.com', phone: '+977 98815 66778', address: 'Bharatpur, Nepal' },
];

const day = 86400000;

export const INITIAL_APPOINTMENTS = [
  { id: 'a1', patientId: 'p1', patient: { name: 'Priya Sharma', email: 'priya@gmail.com' }, doctorId: 'd1', doctor: { id: 'd1', name: 'Dr. Sandeep Adhikari', specialty: 'Cardiologist', avatar: AV.doc1 }, date: new Date(Date.now() + 2 * day).toISOString(), slot: '10:30 AM', createdAt: new Date(Date.now() - 6 * day).toISOString(), statusUpdatedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), status: 'CONFIRMED', reason: 'Routine Heart Checkup' },
  { id: 'a2', patientId: 'p3', patient: { name: 'Ramesh Karki', email: 'ramesh@gmail.com' }, doctorId: 'd2', doctor: { id: 'd2', name: 'Dr. Sushila Acharya', specialty: 'Pediatrician', avatar: AV.doc2 }, date: new Date(Date.now() + 5 * day).toISOString(), slot: '02:00 PM', createdAt: new Date(Date.now() - 9 * day).toISOString(), statusUpdatedAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(), status: 'PENDING', reason: 'Fever and cold' },
  { id: 'a3', patientId: 'p2', patient: { name: 'Apekshya Shrestha', email: 'apekshya@gmail.com' }, doctorId: 'd3', doctor: { id: 'd3', name: 'Dr. Binod Thapa', specialty: 'Orthopedic', avatar: AV.doc3 }, date: new Date(Date.now() + 1 * day).toISOString(), slot: '09:00 AM', createdAt: new Date(Date.now() - 5 * day).toISOString(), statusUpdatedAt: new Date(Date.now() - 2 * day).toISOString(), status: 'CONFIRMED', reason: 'Knee injury follow-up' },
  { id: 'a4', patientId: 'p1', patient: { name: 'Priya Sharma', email: 'priya@gmail.com' }, doctorId: 'd4', doctor: { id: 'd4', name: 'Dr. Anjali Mehta', specialty: 'Dermatologist', avatar: AV.doc4 }, date: new Date(Date.now() + 7 * day).toISOString(), slot: '04:00 PM', createdAt: new Date(Date.now() - 12 * day).toISOString(), statusUpdatedAt: new Date(Date.now() - 3 * day).toISOString(), status: 'PENDING', reason: 'Skin allergy consultation' },
  { id: 'a5', patientId: 'p4', patient: { name: 'Bishal Tamang', email: 'bishal@gmail.com' }, doctorId: 'd6', doctor: { id: 'd6', name: 'Dr. Prakash Rai', specialty: 'Neurologist', avatar: AV.doc6 }, date: new Date(Date.now() + 3 * day).toISOString(), slot: '11:00 AM', createdAt: new Date(Date.now() - 4 * day).toISOString(), statusUpdatedAt: new Date(Date.now() - 1 * day).toISOString(), status: 'CONFIRMED', reason: 'Recurring migraine' },
  { id: 'a6', patientId: 'p5', patient: { name: 'Sarita Rai', email: 'sarita@gmail.com' }, doctorId: 'd5', doctor: { id: 'd5', name: 'Dr. Nisha Gurung', specialty: 'Gynecologist', avatar: AV.doc5 }, date: new Date(Date.now() + 4 * day).toISOString(), slot: '01:30 PM', createdAt: new Date(Date.now() - 8 * day).toISOString(), statusUpdatedAt: new Date(Date.now() - 4 * day).toISOString(), status: 'CONFIRMED', reason: 'Antenatal checkup' },
  { id: 'a7', patientId: 'p6', patient: { name: 'Kiran Gurung', email: 'kiran@gmail.com' }, doctorId: 'd7', doctor: { id: 'd7', name: 'Dr. Sunita Bhattarai', specialty: 'ENT Specialist', avatar: AV.doc7 }, date: new Date(Date.now() + 2 * day).toISOString(), slot: '03:30 PM', createdAt: new Date(Date.now() - 7 * day).toISOString(), statusUpdatedAt: new Date(Date.now() - 2 * day).toISOString(), status: 'PENDING', reason: 'Ear pain and hearing loss' },
  { id: 'a8', patientId: 'p7', patient: { name: 'Manisha Thapa', email: 'manisha@gmail.com' }, doctorId: 'd1', doctor: { id: 'd1', name: 'Dr. Sandeep Adhikari', specialty: 'Cardiologist', avatar: AV.doc1 }, date: new Date(Date.now() + 6 * day).toISOString(), slot: '09:30 AM', createdAt: new Date(Date.now() - 11 * day).toISOString(), statusUpdatedAt: new Date(Date.now() - 5 * day).toISOString(), status: 'CONFIRMED', reason: 'Blood pressure review' },
  { id: 'a9', patientId: 'p8', patient: { name: 'Deepak Basnet', email: 'deepak@gmail.com' }, doctorId: 'd8', doctor: { id: 'd8', name: 'Dr. Rajesh Pandey', specialty: 'General Physician', avatar: AV.doc8 }, date: new Date(Date.now() - 1 * day).toISOString(), slot: '10:00 AM', createdAt: new Date(Date.now() - 10 * day).toISOString(), statusUpdatedAt: new Date(Date.now() - 6 * day).toISOString(), status: 'COMPLETED', reason: 'General weakness' },
  { id: 'a10', patientId: 'p2', patient: { name: 'Apekshya Shrestha', email: 'apekshya@gmail.com' }, doctorId: 'd5', doctor: { id: 'd5', name: 'Dr. Nisha Gurung', specialty: 'Gynecologist', avatar: AV.doc5 }, date: new Date(Date.now() - 6 * day).toISOString(), slot: '12:00 PM', createdAt: new Date(Date.now() - 10 * day).toISOString(), statusUpdatedAt: new Date(Date.now() - 6 * day).toISOString(), status: 'COMPLETED', reason: 'Routine screening' },
  { id: 'a11', patientId: 'p4', patient: { name: 'Bishal Tamang', email: 'bishal@gmail.com' }, doctorId: 'd3', doctor: { id: 'd3', name: 'Dr. Binod Thapa', specialty: 'Orthopedic', avatar: AV.doc3 }, date: new Date(Date.now() - 3 * day).toISOString(), slot: '02:30 PM', createdAt: new Date(Date.now() - 9 * day).toISOString(), statusUpdatedAt: new Date(Date.now() - 3 * day).toISOString(), status: 'CANCELLED', reason: 'Back pain' },
  { id: 'a12', patientId: 'p5', patient: { name: 'Sarita Rai', email: 'sarita@gmail.com' }, doctorId: 'd2', doctor: { id: 'd2', name: 'Dr. Sushila Acharya', specialty: 'Pediatrician', avatar: AV.doc2 }, date: new Date(Date.now() + 8 * day).toISOString(), slot: '11:30 AM', createdAt: new Date(Date.now() - 2 * day).toISOString(), statusUpdatedAt: new Date(Date.now() - 1 * day).toISOString(), status: 'CONFIRMED', reason: 'Child vaccination' },
];

export const INITIAL_BILLS = [
  { id: 'b1', patientId: 'p1', patient: { name: 'Priya Sharma', email: 'priya@gmail.com' }, amount: 1200, status: 'PENDING', createdAt: new Date(Date.now() - 1 * day).toISOString() },
  { id: 'b2', patientId: 'p1', patient: { name: 'Priya Sharma', email: 'priya@gmail.com' }, amount: 800, status: 'PAID', createdAt: new Date(Date.now() - 3 * day).toISOString() },
  { id: 'b3', patientId: 'p3', patient: { name: 'Ramesh Karki', email: 'ramesh@gmail.com' }, amount: 800, status: 'PAID', createdAt: new Date(Date.now() - 5 * day).toISOString() },
  { id: 'b4', patientId: 'p4', patient: { name: 'Bishal Tamang', email: 'bishal@gmail.com' }, amount: 1500, status: 'PENDING', createdAt: new Date(Date.now() - 2 * day).toISOString() },
  { id: 'b5', patientId: 'p5', patient: { name: 'Sarita Rai', email: 'sarita@gmail.com' }, amount: 1100, status: 'PAID', createdAt: new Date(Date.now() - 4 * day).toISOString() },
  { id: 'b6', patientId: 'p6', patient: { name: 'Kiran Gurung', email: 'kiran@gmail.com' }, amount: 850, status: 'PENDING', createdAt: new Date(Date.now() - 6 * day).toISOString() },
  { id: 'b7', patientId: 'p7', patient: { name: 'Manisha Thapa', email: 'manisha@gmail.com' }, amount: 1200, status: 'PAID', createdAt: new Date(Date.now() - 7 * day).toISOString() },
  { id: 'b8', patientId: 'p8', patient: { name: 'Deepak Basnet', email: 'deepak@gmail.com' }, amount: 700, status: 'PAID', createdAt: new Date(Date.now() - 9 * day).toISOString() },
  { id: 'b9', patientId: 'p2', patient: { name: 'Apekshya Shrestha', email: 'apekshya@gmail.com' }, amount: 1000, status: 'PENDING', createdAt: new Date(Date.now() - 8 * day).toISOString() },
  { id: 'b10', patientId: 'p4', patient: { name: 'Bishal Tamang', email: 'bishal@gmail.com' }, amount: 500, status: 'PAID', createdAt: new Date(Date.now() - 12 * day).toISOString() },
];

export const INITIAL_RECORDS = [
  { id: 'r1', patientId: 'p1', patient: { name: 'Priya Sharma', email: 'priya@gmail.com' }, doctor: { name: 'Dr. Sandeep Adhikari' }, title: 'Blood Sugar Report', type: 'Lab', description: 'Fasting 95 mg/dL, Post-prandial 130 mg/dL (Normal)', createdAt: new Date(Date.now() - 2 * day).toISOString() },
  { id: 'r2', patientId: 'p1', patient: { name: 'Priya Sharma', email: 'priya@gmail.com' }, doctor: { name: 'Dr. Sandeep Adhikari' }, title: 'ECG Report', type: 'Cardiology', description: 'Normal sinus rhythm, heart rate 72 bpm', createdAt: new Date(Date.now() - 10 * day).toISOString() },
  { id: 'r3', patientId: 'p2', patient: { name: 'Apekshya Shrestha', email: 'apekshya@gmail.com' }, doctor: { name: 'Dr. Binod Thapa' }, title: 'Right Knee X-Ray', type: 'Radiology', description: 'No fracture or dislocation noted', createdAt: new Date(Date.now() - 15 * day).toISOString() },
  { id: 'r4', patientId: 'p4', patient: { name: 'Bishal Tamang', email: 'bishal@gmail.com' }, doctor: { name: 'Dr. Prakash Rai' }, title: 'MRI Brain Scan', type: 'Radiology', description: 'No intracranial abnormality detected', createdAt: new Date(Date.now() - 4 * day).toISOString() },
  { id: 'r5', patientId: 'p5', patient: { name: 'Sarita Rai', email: 'sarita@gmail.com' }, doctor: { name: 'Dr. Nisha Gurung' }, title: 'Obstetric Ultrasound', type: 'Radiology', description: 'Single live fetus, growth appropriate for gestation', createdAt: new Date(Date.now() - 5 * day).toISOString() },
  { id: 'r6', patientId: 'p6', patient: { name: 'Kiran Gurung', email: 'kiran@gmail.com' }, doctor: { name: 'Dr. Sunita Bhattarai' }, title: 'Audiometry Test', type: 'Lab', description: 'Mild conductive hearing loss, left ear', createdAt: new Date(Date.now() - 6 * day).toISOString() },
  { id: 'r7', patientId: 'p7', patient: { name: 'Manisha Thapa', email: 'manisha@gmail.com' }, doctor: { name: 'Dr. Sandeep Adhikari' }, title: 'Lipid Profile', type: 'Lab', description: 'Total cholesterol 210 mg/dL — borderline high', createdAt: new Date(Date.now() - 7 * day).toISOString() },
  { id: 'r8', patientId: 'p8', patient: { name: 'Deepak Basnet', email: 'deepak@gmail.com' }, doctor: { name: 'Dr. Rajesh Pandey' }, title: 'CBC Report', type: 'Lab', description: 'Hemoglobin 11.2 g/dL — mild anemia', createdAt: new Date(Date.now() - 9 * day).toISOString() },
  { id: 'r9', patientId: 'p3', patient: { name: 'Ramesh Karki', email: 'ramesh@gmail.com' }, doctor: { name: 'Dr. Sushila Acharya' }, title: 'Chest X-Ray', type: 'Radiology', description: 'Clear lung fields, no consolidation', createdAt: new Date(Date.now() - 11 * day).toISOString() },
  { id: 'r10', patientId: 'p2', patient: { name: 'Apekshya Shrestha', email: 'apekshya@gmail.com' }, doctor: { name: 'Dr. Nisha Gurung' }, title: 'Pap Smear Report', type: 'Lab', description: 'Negative for intraepithelial lesion or malignancy', createdAt: new Date(Date.now() - 14 * day).toISOString() },
];

export const INITIAL_ACTIVITIES = [
  { id: 'act1', action: 'APPOINTMENT_CONFIRMED', detail: 'Dr. Sandeep Adhikari • Cardiology', createdAt: new Date(Date.now() - 3600000).toISOString() },
  { id: 'act2', action: 'PAYMENT_SUCCESSFUL', detail: 'NPR 800 • Pharmacy Bill', createdAt: new Date(Date.now() - 1 * day).toISOString() },
  { id: 'act3', action: 'REPORT_UPDATED', detail: 'Blood Sugar Report uploaded', createdAt: new Date(Date.now() - 2 * day).toISOString() },
  { id: 'act4', action: 'NEW_DOCTOR_ADDED', detail: 'Dr. Nisha Gurung joined the panel', createdAt: new Date(Date.now() - 3 * day).toISOString() },
  { id: 'act5', action: 'APPOINTMENT_BOOKED', detail: 'Bishal Tamang • Dr. Prakash Rai', createdAt: new Date(Date.now() - 4 * day).toISOString() },
  { id: 'act6', action: 'PAYMENT_SUCCESSFUL', detail: 'NPR 1100 • Maternity Package', createdAt: new Date(Date.now() - 4 * day).toISOString() },
  { id: 'act7', action: 'REPORT_UPDATED', detail: 'MRI Brain Scan uploaded for Bishal Tamang', createdAt: new Date(Date.now() - 4 * day).toISOString() },
  { id: 'act8', action: 'NEW_PATIENT_REGISTERED', detail: 'Sarita Rai created a portal account', createdAt: new Date(Date.now() - 6 * day).toISOString() },
];

const P1 = { id: 'p1', name: 'Priya Sharma', email: 'priya@gmail.com' };
const P3 = { id: 'p3', name: 'Ramesh Karki', email: 'ramesh@gmail.com' };
const P4 = { id: 'p4', name: 'Bishal Tamang', email: 'bishal@gmail.com' };
const P8 = { id: 'p8', name: 'Deepak Basnet', email: 'deepak@gmail.com' };

// One conversation per patient with the hospital desk. There is deliberately no
// doctor in the key: nobody logs in as a doctor, so a per-doctor thread would
// only split a patient's messages into indistinguishable conversations.
//
// Keyed on the email when there is one, because a patient who registers with a
// seeded address has a different account id from the seeded profile. Keying on
// the id alone would give that person two separate conversations.
export const threadIdFor = (patientId, email = '') =>
  `t_${(email || patientId || '').trim().toLowerCase()}`;

// Chat history between patients and the hospital desk. `sender` is 'PATIENT' or
// 'HOSPITAL' so each side can align its own bubbles to the right.
export const INITIAL_MESSAGES = [
  {
    id: 'm1', threadId: threadIdFor('p1', P1.email), patientId: 'p1', patient: P1,
    sender: 'PATIENT', text: 'Namaste. I had a chest tightness last night while climbing stairs. Should I come earlier?',
    createdAt: new Date(Date.now() - 2 * day).toISOString(),
  },
  {
    id: 'm2', threadId: threadIdFor('p1', P1.email), patientId: 'p1', patient: P1,
    sender: 'HOSPITAL', senderName: 'Hospital team', text: 'Thank you for reporting early. Please bring your ECG report and continue the medicines as prescribed. Keep a note of when it happens.',
    createdAt: new Date(Date.now() - 2 * day + 900000).toISOString(),
  },
  {
    id: 'm3', threadId: threadIdFor('p1', P1.email), patientId: 'p1', patient: P1,
    sender: 'HOSPITAL', senderName: 'Hospital team', text: 'Your appointment on ' + new Date(Date.now() + 2 * day).toDateString() + ' at 10:30 AM is confirmed.',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'm4', threadId: threadIdFor('p3', P3.email), patientId: 'p3', patient: P3,
    sender: 'PATIENT', text: 'My son has had fever since last night with a mild rash. Is it safe to give paracetamol?',
    createdAt: new Date(Date.now() - 1 * day).toISOString(),
  },
  {
    id: 'm5', threadId: threadIdFor('p3', P3.email), patientId: 'p3', patient: P3,
    sender: 'HOSPITAL', senderName: 'Hospital team', text: 'Half tablet every 6 hours is fine. Please share a photo of the rash and note the temperature. We will review during your appointment.',
    createdAt: new Date(Date.now() - 1 * day + 1800000).toISOString(),
  },
  {
    id: 'm6', threadId: threadIdFor('p4', P4.email), patientId: 'p4', patient: P4,
    sender: 'PATIENT', text: 'The migraine is back, mostly on the right side. Should I start the sumatriptan again?',
    createdAt: new Date(Date.now() - 6 * 3600000).toISOString(),
  },
  {
    id: 'm7', threadId: threadIdFor('p8', P8.email), patientId: 'p8', patient: P8,
    sender: 'HOSPITAL', senderName: 'Hospital team', text: 'Your CBC report shows mild anaemia. Please start the iron tablets and we will re-check in four weeks. Eat more greens and dates.',
    createdAt: new Date(Date.now() - 1 * day).toISOString(),
  },
];
