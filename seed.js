const { MongoClient } = require('mongodb');

const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'ExamPrep';

async function seed() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  console.log('Seeding ExamPrep database...');

  // Clear existing data
  await db.collection('exams').deleteMany({});
  await db.collection('mocks').deleteMany({});
  await db.collection('goals').deleteMany({});

  // Create BITSAT exam
  const examResult = await db.collection('exams').insertOne({
    name: 'BITSAT',
    examDate: new Date('2026-06-20T00:00:00Z'),
    color: '#f5c518',
    subjects: ['Physics', 'Chemistry', 'Mathematics', 'English & LR'],
    createdAt: new Date()
  });

  const examId = examResult.insertedId;

  // Create 8 mocks
  const mocks = [];
  for (let i = 1; i <= 8; i++) {
    mocks.push({
      examId,
      mockNumber: i,
      attempted: false,
      analyzeDone: false,
      reattemptDone: false,
      isAllIndia: i >= 7,
      scores: [],
      totalScore: null,
      createdAt: new Date()
    });
  }
  await db.collection('mocks').insertMany(mocks);

  // Create sample goals
  const today = new Date().toISOString().split('T')[0];
  await db.collection('goals').insertMany([
    { examId, text: 'Revise Organic Chemistry', completed: false, date: today, createdAt: new Date() },
    { examId, text: 'Solve 20 Math problems', completed: false, date: today, createdAt: new Date() },
    { examId, text: 'Physics — Electrostatics notes', completed: false, date: today, createdAt: new Date() }
  ]);

  console.log('Seeded: 1 exam (BITSAT), 8 mocks, 3 goals');
  await client.close();
}

seed().catch(console.error);
