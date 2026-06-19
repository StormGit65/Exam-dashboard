require('dotenv').config();

const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sync = require('./sync');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_NAME = process.env.DB_NAME || 'ExamPrep';

// Database references
let db;              // Primary working database (local or atlas)
let localDb = null;   // Local MongoDB connection
let atlasDb = null;   // Atlas MongoDB connection
let localClient = null;
let atlasClient = null;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Multer config for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${base}-${Date.now()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// ─── Write-tracking middleware ──────────────────────────────
// Updates _syncMeta.lastUpdated on every successful write operation
app.use(async (req, res, next) => {
  // Only track write methods on API routes (not sync routes)
  if (['POST', 'PUT', 'DELETE'].includes(req.method) && 
      req.path.startsWith('/api/') && 
      !req.path.startsWith('/api/sync/')) {
    const originalJson = res.json.bind(res);
    res.json = function (data) {
      // After successful response, update sync timestamp
      if (res.statusCode < 400 && db) {
        sync.setLastUpdated(db).catch(() => {});
      }
      return originalJson(data);
    };
  }
  next();
});

// ─── Database connection guard ──────────────────────────────
// If no database is connected, serve error page instead of crashing
app.use((req, res, next) => {
  if (!db && req.path.startsWith('/api/') && !req.path.startsWith('/api/sync/')) {
    return res.status(503).json({ 
      error: 'Database not connected', 
      mode: sync.syncState.mode,
      message: 'No database is available. Please check your .env configuration.'
    });
  }
  next();
});

// ─── Connect to databases and sync ──────────────────────────
async function connectDB() {
  console.log('\n┌─── Kaizen — Database Connection ───┐');
  
  const localUri = process.env.MONGO_LOCAL_URI;
  const atlasUri = process.env.MONGO_ATLAS_URI;
  
  // Try connecting to both databases
  const localResult = await sync.tryConnect(localUri, DB_NAME, 'Local MongoDB');
  const atlasResult = await sync.tryConnect(atlasUri, DB_NAME, 'MongoDB Atlas');
  
  if (localResult) {
    localClient = localResult.client;
    localDb = localResult.db;
    sync.syncState.localConnected = true;
  }
  if (atlasResult) {
    atlasClient = atlasResult.client;
    atlasDb = atlasResult.db;
    sync.syncState.atlasConnected = true;
  }
  
  // Determine mode
  const mode = sync.determineMode(localResult, atlasResult);
  sync.syncState.mode = mode;
  
  if (mode === 'NONE') {
    console.log('\n  ⚠ NO DATABASE AVAILABLE — Server will start but data features are disabled');
    console.log('    Configure MONGO_LOCAL_URI or MONGO_ATLAS_URI in .env file');
    console.log('└────────────────────────────────────┘\n');
    // Don't exit — serve error page instead
    return;
  }
  
  // Set primary database
  if (mode === 'DUAL' || mode === 'LOCAL_ONLY') {
    db = localDb;
  } else {
    db = atlasDb;
  }
  
  // Run startup sync
  await sync.syncOnStartup(localDb, atlasDb, mode, localClient, atlasClient, DB_NAME);
  
  console.log(`\n  ◉ Primary database: ${mode === 'ATLAS_ONLY' ? 'Atlas' : 'Local'}`);
  console.log('└────────────────────────────────────┘\n');
}

// ─── EXAM ROUTES ────────────────────────────────────────────

// Get all exams
app.get('/api/exams', async (req, res) => {
  try {
    // Auto-archive exams whose examDate+time has passed
    const now = new Date();
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    const pastExams = await db.collection('exams').find({ deleted: { $ne: true }, isArchived: { $ne: true },
      manuallyUnarchived: { $ne: true },
      examDate: { $ne: null }
    }).toArray();

    for (const exam of pastExams) {
      const examDate = new Date(exam.examDate);
      examDate.setHours(0, 0, 0, 0);
      let shouldArchive = false;

      if (examDate < todayMidnight) {
        // Exam date is strictly in the past
        shouldArchive = true;
      } else if (examDate.getTime() === todayMidnight.getTime() && exam.examTimeRange) {
        // Exam is today — check if end time has passed
        const endMatch = exam.examTimeRange.match(/-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (endMatch) {
          let endH = parseInt(endMatch[1]);
          const endM = parseInt(endMatch[2]);
          const endP = endMatch[3].toUpperCase();
          if (endP === 'PM' && endH !== 12) endH += 12;
          if (endP === 'AM' && endH === 12) endH = 0;
          const endMinutes = endH * 60 + endM;
          const nowMinutes = now.getHours() * 60 + now.getMinutes();
          if (nowMinutes > endMinutes) shouldArchive = true;
        }
      }

      if (shouldArchive) {
        const baseName = exam.baseName || exam.name.replace(/\s*\(Session\s*\d+\)$/i, '');
        const year = exam.examYear || (exam.examDate ? new Date(exam.examDate).getFullYear().toString() : new Date().getFullYear().toString());
        const existing = await db.collection('exams').countDocuments({ isArchived: true, baseName, examYear: year });
        const batchNum = existing + 1;
        await db.collection('exams').updateOne(
          { _id: exam._id },
          { $set: { updatedAt: new Date(),  isArchived: true, baseName, examYear: year, batchLabel: `Session ${batchNum}` } }
        );
      }
    }

    const exams = await db.collection('exams').find({ deleted: { $ne: true } }).sort({ createdAt: -1 }).toArray();
    res.json(exams);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single exam
app.get('/api/exams/:id', async (req, res) => {
  try {
    const exam = await db.collection('exams').findOne({ deleted: { $ne: true }, _id: new ObjectId(req.params.id) });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    res.json(exam);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create exam
app.post('/api/exams', async (req, res) => {
  try {
    const { name, examDate, examYear, color, sections, baseName, examTimeRange } = req.body;
    if (!name) return res.status(400).json({ error: 'Exam name is required' });

    // Prevent past-date exam creation
    if (examDate) {
      const selected = new Date(examDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      selected.setHours(0, 0, 0, 0);
      if (selected < today) {
        return res.status(400).json({ error: 'Exam date cannot be in the past' });
      }
    }

    const upperName = name.toUpperCase();
    const exam = {
      name: upperName,
      baseName: (baseName || name).toUpperCase(),
      examDate: examDate ? new Date(examDate) : null,
      examYear: examYear || new Date().getFullYear().toString(),
      color: color || '#f5c518',
      examTimeRange: examTimeRange || '',
      isArchived: false,
      sections: sections || [],
      createdAt: new Date()
    };

    const result = await db.collection('exams').insertOne({ ...exam, updatedAt: new Date() });
    exam._id = result.insertedId;
    res.status(201).json(exam);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update exam
app.put('/api/exams/:id', async (req, res) => {
  try {
    const updates = {};
    if (req.body.name) updates.name = req.body.name.toUpperCase();
    if (req.body.examDate !== undefined) updates.examDate = req.body.examDate ? new Date(req.body.examDate) : null;
    if (req.body.examYear) updates.examYear = req.body.examYear;
    if (req.body.color) updates.color = req.body.color;
    if (req.body.baseName) updates.baseName = req.body.baseName.toUpperCase();
    if (req.body.sections !== undefined) {
      updates.sections = req.body.sections;
      const oldExam = await db.collection('exams').findOne({ deleted: { $ne: true }, _id: new ObjectId(req.params.id) });
      const oldSections = oldExam.sections || [];
      const newSections = req.body.sections;

      // Build old-index → new-index map using sectionId (stable), falling back to name for legacy sections
      const oldToNew = {};
      oldSections.forEach((os, oldIdx) => {
        let newIdx = -1;
        if (os.sectionId) {
          // Prefer matching by stable ID
          newIdx = newSections.findIndex(ns => ns.sectionId && ns.sectionId === os.sectionId);
        }
        if (newIdx === -1) {
          // Fallback: match by name (legacy sections without sectionId)
          newIdx = newSections.findIndex(ns => ns.name === os.name);
        }
        if (newIdx !== -1) oldToNew[oldIdx] = newIdx;
      });

      const mocks = await db.collection('mocks').find({ deleted: { $ne: true }, examId: new ObjectId(req.params.id) }).toArray();
      for (const mock of mocks) {
        if (mock.sectionScores && mock.sectionScores.length > 0) {
          const newSectionScores = [];
          let newTotalScore = 0;
          let newMaxScore = 0;

          for (let newIdx = 0; newIdx < newSections.length; newIdx++) {
            const sec = newSections[newIdx];
            const oldIdxStr = Object.keys(oldToNew).find(key => oldToNew[key] === newIdx);

            if (oldIdxStr !== undefined && mock.sectionScores[oldIdxStr]) {
              const oldScore = mock.sectionScores[oldIdxStr];
              const perC = sec.perCorrect !== undefined ? sec.perCorrect : 1;
              const perW = sec.perWrong !== undefined ? sec.perWrong : 0;
              const maxMarks = sec.maxMarks || 0;

              const newScoreObj = {
                ...oldScore,
                section: sec.name,
                sectionId: sec.sectionId || null,
                perCorrect: perC,
                perWrong: perW,
                maxMarks: maxMarks
              };
              newSectionScores[newIdx] = newScoreObj;

              if (!newScoreObj._skipped) {
                newTotalScore += (newScoreObj.correct * perC) + (newScoreObj.wrong * perW);
                newMaxScore += maxMarks;
              }
            } else {
              newSectionScores[newIdx] = {
                section: sec.name,
                sectionId: sec.sectionId || null,
                correct: 0,
                wrong: 0,
                perCorrect: sec.perCorrect !== undefined ? sec.perCorrect : 1,
                perWrong: sec.perWrong !== undefined ? sec.perWrong : 0,
                maxMarks: sec.maxMarks || 0,
                _skipped: true
              };
            }
          }

          let newSectionsAttempted = null;
          if (mock.sectionsAttempted) {
             newSectionsAttempted = [];
             for (let i = 0; i < newSections.length; i++) {
                if (!newSectionScores[i]._skipped) {
                   newSectionsAttempted.push(i);
                }
             }
          }

          await db.collection('mocks').updateOne(
            { _id: mock._id },
            { $set: { updatedAt: new Date(),  sectionScores: newSectionScores, totalScore: newTotalScore, maxScore: newMaxScore, sectionsAttempted: newSectionsAttempted } }
          );
        }
      }
    }
    if (req.body.examTimeRange !== undefined) updates.examTimeRange = req.body.examTimeRange;

    // If exam date/time updated to future, clear manuallyUnarchived flag
    if (updates.examDate || updates.examTimeRange !== undefined) {
      const futureDate = updates.examDate || (await db.collection('exams').findOne({ deleted: { $ne: true }, _id: new ObjectId(req.params.id) }))?.examDate;
      if (futureDate) {
        const fd = new Date(futureDate);
        fd.setHours(0,0,0,0);
        const td = new Date();
        td.setHours(0,0,0,0);
        if (fd >= td) {
          updates.manuallyUnarchived = false;
        }
      }
    }

    await db.collection('exams').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { ...updates, updatedAt: new Date() } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Archive exam
app.put('/api/exams/:id/archive', async (req, res) => {
  try {
    const examId = new ObjectId(req.params.id);
    const exam = await db.collection('exams').findOne({ deleted: { $ne: true }, _id: examId });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const baseName = exam.baseName || exam.name.replace(/\s*\(Session\s*\d+\)$/i, '');
    const year = exam.examYear || new Date().getFullYear().toString();

    // Count existing archives with same baseName AND year
    const existing = await db.collection('exams').countDocuments({ isArchived: true, baseName, examYear: year });
    const batchNum = existing + 1;

    await db.collection('exams').updateOne(
      { _id: examId },
      { $set: { updatedAt: new Date(),  isArchived: true, baseName, examYear: year, batchLabel: `Session ${batchNum}` } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unarchive exam — move back to active
app.put('/api/exams/:id/unarchive', async (req, res) => {
  try {
    const examId = new ObjectId(req.params.id);
    const exam = await db.collection('exams').findOne({ deleted: { $ne: true }, _id: examId });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    await db.collection('exams').updateOne(
      { _id: examId },
      { $set: { updatedAt: new Date(),  isArchived: false, manuallyUnarchived: true }, $unset: { batchLabel: '' } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update archived exam batch label
app.put('/api/exams/:id/batch-name', async (req, res) => {
  try {
    const { batchLabel } = req.body;
    if (!batchLabel) return res.status(400).json({ error: 'Batch label is required' });
    await db.collection('exams').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { updatedAt: new Date(),  batchLabel } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get distinct archived exam info for suggestions
app.get('/api/archived-exam-names', async (req, res) => {
  try {
    const archived = await db.collection('exams').find({ deleted: { $ne: true }, isArchived: true }).toArray();
    // Group by baseName, return one representative per baseName
    const nameMap = {};
    archived.forEach(ex => {
      const bn = ex.baseName || ex.name;
      if (!nameMap[bn]) {
        nameMap[bn] = { baseName: bn, color: ex.color, sections: ex.sections || [] };
      }
    });
    res.json(Object.values(nameMap));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete exam (cascade)
app.delete('/api/exams/:id', async (req, res) => {
  try {
    const examId = new ObjectId(req.params.id);
    await db.collection('mocks').updateMany({ examId }, { $set: { updatedAt: new Date(),  deleted: true, updatedAt: new Date() } });
    await db.collection('goals').updateMany({ examId }, { $set: { updatedAt: new Date(),  deleted: true, updatedAt: new Date() } });
    await db.collection('exams').updateOne({ _id: examId }, { $set: { updatedAt: new Date(),  deleted: true, updatedAt: new Date() } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MOCK ROUTES ────────────────────────────────────────────

// Get mocks for exam
app.get('/api/exams/:id/mocks', async (req, res) => {
  try {
    const mocks = await db.collection('mocks')
      .find({ deleted: { $ne: true }, examId: new ObjectId(req.params.id) })
      .sort({ mockNumber: 1 })
      .toArray();
    res.json(mocks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create mock
app.post('/api/exams/:id/mocks', async (req, res) => {
  try {
    const examId = new ObjectId(req.params.id);
    const lastMock = await db.collection('mocks')
      .find({ deleted: { $ne: true }, examId })
      .sort({ mockNumber: -1 })
      .limit(1)
      .toArray();

    const nextNumber = lastMock.length > 0 ? lastMock[0].mockNumber + 1 : 1;

    const mock = {
      examId,
      mockNumber: nextNumber,
      mockName: req.body.mockName || `Mock ${nextNumber}`,
      platform: req.body.platform || '',
      sectionsAttempted: req.body.sectionsAttempted || null, // null = all sections
      attempted: false,
      analyzeDone: false,
      reattemptDone: false,
      sectionScores: [],
      totalScore: null,
      maxScore: null,
      scheduledDate: req.body.scheduledDate || null,
      scheduledTime: req.body.scheduledTime || '',
      createdAt: new Date()
    };

    const result = await db.collection('mocks').insertOne({ ...mock, updatedAt: new Date() });
    mock._id = result.insertedId;
    res.status(201).json(mock);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update mock
app.put('/api/mocks/:id', async (req, res) => {
  try {
    const updates = {};
    if (req.body.mockName !== undefined) updates.mockName = req.body.mockName;
    if (req.body.platform !== undefined) updates.platform = req.body.platform;
    if (req.body.sectionsAttempted !== undefined) updates.sectionsAttempted = req.body.sectionsAttempted;
    if (typeof req.body.attempted === 'boolean') updates.attempted = req.body.attempted;
    if (typeof req.body.analyzeDone === 'boolean') updates.analyzeDone = req.body.analyzeDone;
    if (typeof req.body.reattemptDone === 'boolean') updates.reattemptDone = req.body.reattemptDone;
    if (req.body.scheduledDate !== undefined) updates.scheduledDate = req.body.scheduledDate;
    if (req.body.scheduledTime !== undefined) updates.scheduledTime = req.body.scheduledTime;

    // Section-based scores
    if (req.body.sectionScores !== undefined) {
      updates.sectionScores = req.body.sectionScores;
      // Calculate total from section scores — only include actually attempted sections
      let totalScore = 0;
      let maxScore = 0;
      for (const ss of req.body.sectionScores) {
        if (ss._skipped) continue; // skip non-attempted sections
        const perC = ss.perCorrect || 1;
        const perW = ss.perWrong || 0;
        totalScore += (ss.correct * perC) + (ss.wrong * perW);
        maxScore += ss.maxMarks || 0;
      }
      updates.totalScore = totalScore;
      updates.maxScore = maxScore;
    }

    // Legacy simple correct/wrong (fallback for exams without sections)
    if (req.body.correct !== undefined && req.body.sectionScores === undefined) {
      updates.correct = req.body.correct;
      updates.wrong = req.body.wrong || 0;
      const perC = req.body.perCorrect || 1;
      const perW = req.body.perWrong || 0;
      updates.totalScore = (req.body.correct * perC) + ((req.body.wrong || 0) * perW);
      updates.maxScore = req.body.maxScore || null;
    }

    await db.collection('mocks').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { ...updates, updatedAt: new Date() } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get distinct platforms used for this exam's mocks
app.get('/api/exams/:id/mock-platforms', async (req, res) => {
  try {
    const platforms = await db.collection('mocks').distinct('platform', {
      examId: new ObjectId(req.params.id),
      platform: { $ne: '' }
    });
    res.json(platforms.filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear all mocks for exam
app.delete('/api/exams/:id/mocks/all', async (req, res) => {
  try {
    await db.collection('mocks').updateMany({ examId: new ObjectId(req.params.id) }, { $set: { updatedAt: new Date(),  deleted: true, updatedAt: new Date() } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete mock
app.delete('/api/mocks/:id', async (req, res) => {
  try {
    await db.collection('mocks').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { updatedAt: new Date(),  deleted: true, updatedAt: new Date() } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GOAL ROUTES ────────────────────────────────────────────

// Get goals for exam (today by default)
app.get('/api/exams/:id/goals', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const goals = await db.collection('goals')
      .find({ deleted: { $ne: true }, examId: new ObjectId(req.params.id), date })
      .sort({ order: 1, createdAt: 1 })
      .toArray();
    res.json(goals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create goal
app.post('/api/exams/:id/goals', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Goal text is required' });

    const goal = {
      examId: new ObjectId(req.params.id),
      text,
      completed: false,
      date: new Date().toISOString().split('T')[0],
      order: Date.now(), // default order
      createdAt: new Date()
    };

    const result = await db.collection('goals').insertOne({ ...goal, updatedAt: new Date() });
    goal._id = result.insertedId;
    res.status(201).json(goal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle goal
app.put('/api/goals/:id', async (req, res) => {
  try {
    const goal = await db.collection('goals').findOne({ deleted: { $ne: true }, _id: new ObjectId(req.params.id) });
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    await db.collection('goals').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { updatedAt: new Date(),  completed: !goal.completed } }
    );
    res.json({ success: true, completed: !goal.completed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete goal
app.delete('/api/goals/:id', async (req, res) => {
  try {
    await db.collection('goals').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { updatedAt: new Date(),  deleted: true, updatedAt: new Date() } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GOALS — RANGE QUERY ────────────────────────────────────

// Get goals for a date range
app.get('/api/exams/:id/goals/range', async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end dates required' });
    const goals = await db.collection('goals')
      .find({ deleted: { $ne: true }, examId: new ObjectId(req.params.id), date: { $gte: start, $lte: end } })
      .sort({ order: 1, createdAt: 1 })
      .toArray();
    res.json(goals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update goal text or date
app.put('/api/goals/:id/update', async (req, res) => {
  try {
    const { text, date, time, endTime } = req.body;
    const updates = {};
    if (text) updates.text = text;
    if (date) updates.date = date;
    if (time !== undefined) updates.time = time;
    if (endTime !== undefined) updates.endTime = endTime;

    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No updates provided' });
    
    await db.collection('goals').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { ...updates, updatedAt: new Date() } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reorder goals
app.put('/api/exams/:id/goals/reorder', async (req, res) => {
  try {
    const { updates } = req.body; // [{ id: '...', order: 0 }, ...]
    if (!updates || !Array.isArray(updates)) return res.status(400).json({ error: 'Updates array is required' });

    await Promise.all(updates.map(u => 
      db.collection('goals').updateOne(
        { _id: new ObjectId(u.id) },
        { $set: { updatedAt: new Date(),  order: u.order } }
      )
    ));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create goal for specific date
app.post('/api/exams/:id/goals/date', async (req, res) => {
  try {
    const { text, date, time, endTime } = req.body;
    if (!text) return res.status(400).json({ error: 'Goal text is required' });
    const goal = {
      examId: new ObjectId(req.params.id),
      text,
      completed: false,
      date: date || new Date().toISOString().split('T')[0],
      time: time || null,
      endTime: endTime || null,
      order: Date.now(),
      createdAt: new Date()
    };
    const result = await db.collection('goals').insertOne({ ...goal, updatedAt: new Date() });
    goal._id = result.insertedId;
    res.status(201).json(goal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── COMPLETED ENTRIES ──────────────────────────────────────

// Get first activity date for an exam (from entries or goals)
app.get('/api/exams/:id/entries/first', async (req, res) => {
  try {
    const examId = new ObjectId(req.params.id);
    const entry = await db.collection('completedEntries')
      .findOne({ deleted: { $ne: true }, examId }, { sort: { date: 1 } });
    const goal = await db.collection('goals')
      .findOne({ deleted: { $ne: true }, examId }, { sort: { date: 1 } });

    let firstDate = null;
    if (entry && goal) {
      firstDate = entry.date < goal.date ? entry.date : goal.date;
    } else if (entry) {
      firstDate = entry.date;
    } else if (goal) {
      firstDate = goal.date;
    }

    res.json({ firstDate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get entries for a date
app.get('/api/exams/:id/entries', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const entries = await db.collection('completedEntries')
      .find({ deleted: { $ne: true }, examId: new ObjectId(req.params.id), date })
      .sort({ order: 1, createdAt: -1 })
      .toArray();
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get entries for date range
app.get('/api/exams/:id/entries/range', async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end required' });
    const entries = await db.collection('completedEntries')
      .find({ deleted: { $ne: true }, examId: new ObjectId(req.params.id), date: { $gte: start, $lte: end } })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all attachments for docs panel
app.get('/api/exams/:id/entries/attachments', async (req, res) => {
  try {
    const entries = await db.collection('completedEntries')
      .find({ deleted: { $ne: true }, examId: new ObjectId(req.params.id), 'attachments.0': { $exists: true } })
      .project({ _id: 1, date: 1, title: 1, attachments: 1 })
      .sort({ date: -1 })
      .toArray();
    // Flatten attachments with entry context
    const result = [];
    entries.forEach(entry => {
      (entry.attachments || []).forEach(att => {
        result.push({ ...att, entryId: entry._id, entryDate: entry.date, entryTitle: entry.title });
      });
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create entry
app.post('/api/exams/:id/entries', async (req, res) => {
  try {
    const { title, content, date, attachments, pageColor } = req.body;
    const entry = {
      examId: new ObjectId(req.params.id),
      date: date || new Date().toISOString().split('T')[0],
      title: title || 'Today I completed...',
      content: content || '',
      attachments: attachments || [],
      pageColor: pageColor || '',
      createdAt: new Date()
    };
    const result = await db.collection('completedEntries').insertOne({ ...entry, updatedAt: new Date() });
    entry._id = result.insertedId;
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update entry
app.put('/api/entries/:id', async (req, res) => {
  try {
    const updates = {};
    if (req.body.title !== undefined) updates.title = req.body.title;
    if (req.body.content !== undefined) updates.content = req.body.content;
    if (req.body.attachments !== undefined) updates.attachments = req.body.attachments;
    if (req.body.date !== undefined) updates.date = req.body.date;
    if (req.body.pageColor !== undefined) updates.pageColor = req.body.pageColor;
    await db.collection('completedEntries').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { ...updates, updatedAt: new Date() } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete entry
app.delete('/api/entries/:id', async (req, res) => {
  try {
    await db.collection('completedEntries').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { updatedAt: new Date(),  deleted: true, updatedAt: new Date() } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reorder entries for exam
app.put('/api/exams/:id/entries/reorder', async (req, res) => {
  try {
    const { updates } = req.body;
    if (!updates || !Array.isArray(updates)) return res.status(400).json({ error: 'Updates array is required' });

    await Promise.all(updates.map(u => 
      db.collection('completedEntries').updateOne(
        { _id: new ObjectId(u.id) },
        { $set: { updatedAt: new Date(),  order: u.order } }
      )
    ));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── FILE UPLOAD ────────────────────────────────────────────

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url, name: req.file.originalname, size: req.file.size });
});

// ─── MY DESK — PROFILES ─────────────────────────────────────

app.get('/api/desk/profiles', async (req, res) => {
  try {
    const showArchived = req.query.archived === 'true';
    const filter = showArchived ? { archived: true } : { archived: { $ne: true } };
    const profiles = await db.collection('deskProfiles').find(filter).sort({ order: 1, createdAt: 1 }).toArray();
    for (const p of profiles) {
      const pId = p._id.toString();
      const goalCount = await db.collection('goals').countDocuments({ examId: 'desk', profileId: pId });
      if (goalCount > 0) {
        p.hasData = true;
        continue;
      }
      const entryCount = await db.collection('completedEntries').countDocuments({ examId: 'desk', profileId: pId });
      if (entryCount > 0) {
        p.hasData = true;
      } else {
        p.hasData = false;
      }
    }
    res.json(profiles);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/desk/profiles', async (req, res) => {
  try {
    const { name, color } = req.body;
    const profile = { name, color: color || '#a78bfa', order: Date.now(), createdAt: new Date() };
    const result = await db.collection('deskProfiles').insertOne({ ...profile, updatedAt: new Date() });
    profile._id = result.insertedId;
    res.status(201).json(profile);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/desk/profiles/:id', async (req, res) => {
  try {
    const updates = {};
    if (req.body.name) updates.name = req.body.name;
    if (req.body.color) updates.color = req.body.color;
    await db.collection('deskProfiles').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { ...updates, updatedAt: new Date() } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/desk/profiles/action/reorder', async (req, res) => {
  try {
    const { updates } = req.body; // [{ id: '...', order: 0 }, ...]
    if (!updates || !Array.isArray(updates)) return res.status(400).json({ error: 'Updates array is required' });

    await Promise.all(updates.map(u => 
      db.collection('deskProfiles').updateOne(
        { _id: new ObjectId(u.id) },
        { $set: { updatedAt: new Date(),  order: u.order } }
      )
    ));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/desk/profiles/:id', async (req, res) => {
  try {
    const profileId = req.params.id;
    await db.collection('deskProfiles').updateOne({ _id: new ObjectId(profileId) }, { $set: { updatedAt: new Date(),  deleted: true, updatedAt: new Date() } });
    // Cascade delete tasks and entries for this profile
    await db.collection('goals').updateMany({ examId: 'desk', profileId }, { $set: { updatedAt: new Date(),  deleted: true, updatedAt: new Date() } });
    await db.collection('completedEntries').updateMany({ examId: 'desk', profileId }, { $set: { updatedAt: new Date(),  deleted: true, updatedAt: new Date() } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Archive a desk profile
app.put('/api/desk/profiles/:id/archive', async (req, res) => {
  try {
    await db.collection('deskProfiles').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { updatedAt: new Date(),  archived: true } }
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Unarchive a desk profile
app.put('/api/desk/profiles/:id/unarchive', async (req, res) => {
  try {
    await db.collection('deskProfiles').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { updatedAt: new Date(),  archived: false } }
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── MY DESK — GOALS (TASKS) ────────────────────────────────

app.get('/api/desk/goals', async (req, res) => {
  try {
    const query = { examId: 'desk' };
    if (req.query.date) query.date = req.query.date;
    if (req.query.profileId) query.profileId = req.query.profileId;

    // Exclude goals from archived desk profiles when requested
    if (req.query.excludeArchived === 'true') {
      const archivedProfiles = await db.collection('deskProfiles').find({ deleted: { $ne: true }, archived: true }).project({ _id: 1 }).toArray();
      const archivedIds = archivedProfiles.map(p => p._id.toString());
      if (archivedIds.length > 0) {
        query.profileId = { $nin: archivedIds };
      }
    }

    const goals = await db.collection('goals').find(query).sort({ order: 1, createdAt: 1 }).toArray();
    res.json(goals);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/desk/goals/range', async (req, res) => {
  try {
    const { start, end, profileId } = req.query;
    const query = { examId: 'desk', date: { $gte: start, $lte: end } };
    if (profileId) query.profileId = profileId;
    const goals = await db.collection('goals').find(query).sort({ date: 1, order: 1, createdAt: 1 }).toArray();
    res.json(goals);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/desk/goals', async (req, res) => {
  try {
    const { text, date, time, endTime, profileId } = req.body;
    const goal = {
      examId: 'desk',
      profileId: profileId || null,
      text,
      date: date || new Date().toISOString().split('T')[0],
      time: time || '',
      endTime: endTime || '',
      completed: false,
      order: Date.now(),
      createdAt: new Date()
    };
    const result = await db.collection('goals').insertOne({ ...goal, updatedAt: new Date() });
    goal._id = result.insertedId;
    res.status(201).json(goal);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/desk/goals/:id', async (req, res) => {
  try {
    const goal = await db.collection('goals').findOne({ deleted: { $ne: true }, _id: new ObjectId(req.params.id) });
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    await db.collection('goals').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { updatedAt: new Date(),  completed: !goal.completed } }
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/desk/goals/:id/update', async (req, res) => {
  try {
    const updates = {};
    if (req.body.text !== undefined) updates.text = req.body.text;
    if (req.body.date !== undefined) updates.date = req.body.date;
    if (req.body.time !== undefined) updates.time = req.body.time;
    if (req.body.endTime !== undefined) updates.endTime = req.body.endTime;
    await db.collection('goals').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { ...updates, updatedAt: new Date() } }
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/desk/goals/:id', async (req, res) => {
  try {
    await db.collection('goals').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { updatedAt: new Date(),  deleted: true, updatedAt: new Date() } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/desk/goals/action/reorder', async (req, res) => {
  try {
    const { updates } = req.body;
    if (!updates || !Array.isArray(updates)) return res.status(400).json({ error: 'Updates array is required' });

    await Promise.all(updates.map(u =>
      db.collection('goals').updateOne(
        { _id: new ObjectId(u.id) },
        { $set: { updatedAt: new Date(),  order: u.order } }
      )
    ));

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── MY DESK — JOURNAL ENTRIES ──────────────────────────────

app.get('/api/desk/entries', async (req, res) => {
  try {
    const query = { examId: 'desk' };
    if (req.query.date) query.date = req.query.date;
    if (req.query.profileId) query.profileId = req.query.profileId;
    const entries = await db.collection('completedEntries').find(query).sort({ order: 1, createdAt: -1 }).toArray();
    res.json(entries);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/desk/entries/range', async (req, res) => {
  try {
    const { start, end, profileId } = req.query;
    const query = { examId: 'desk', date: { $gte: start, $lte: end } };
    if (profileId) query.profileId = profileId;
    const entries = await db.collection('completedEntries').find(query).sort({ date: 1, createdAt: -1 }).toArray();
    res.json(entries);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/desk/entries', async (req, res) => {
  try {
    const { title, content, date, attachments, profileId, pageColor } = req.body;
    const entry = {
      examId: 'desk',
      profileId: profileId || null,
      title: title || 'Untitled',
      content: content || '',
      date: date || new Date().toISOString().split('T')[0],
      attachments: attachments || [],
      pageColor: pageColor || '',
      createdAt: new Date()
    };
    const result = await db.collection('completedEntries').insertOne({ ...entry, updatedAt: new Date() });
    entry._id = result.insertedId;
    res.status(201).json(entry);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Reorder desk entries
app.put('/api/desk/entries/reorder', async (req, res) => {
  try {
    const { updates } = req.body;
    if (!updates || !Array.isArray(updates)) return res.status(400).json({ error: 'Updates array is required' });

    await Promise.all(updates.map(u => 
      db.collection('completedEntries').updateOne(
        { _id: new ObjectId(u.id) },
        { $set: { updatedAt: new Date(),  order: u.order } }
      )
    ));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/desk/entries/:id', async (req, res) => {
  try {
    const updates = {};
    if (req.body.title !== undefined) updates.title = req.body.title;
    if (req.body.content !== undefined) updates.content = req.body.content;
    if (req.body.date !== undefined) updates.date = req.body.date;
    if (req.body.attachments !== undefined) updates.attachments = req.body.attachments;
    if (req.body.pageColor !== undefined) updates.pageColor = req.body.pageColor;
    await db.collection('completedEntries').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { ...updates, updatedAt: new Date() } }
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/desk/entries/:id', async (req, res) => {
  try {
    await db.collection('completedEntries').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { updatedAt: new Date(),  deleted: true, updatedAt: new Date() } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── SYNC API ROUTES ────────────────────────────────────────

// Get current sync status
app.get('/api/sync/status', async (req, res) => {
  try {
    const status = { ...sync.syncState };
    
    // Get live lastUpdated from primary DB
    if (db) {
      status.primaryLastUpdated = await sync.getLastUpdated(db);
    }
    
    // Get collection counts
    if (db) {
      status.collections = {};
      for (const col of sync.COLLECTIONS) {
        try {
          status.collections[col] = await db.collection(col).countDocuments();
        } catch {
          status.collections[col] = 0;
        }
      }
    }
    
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get sync ledger
app.get('/api/sync/ledger', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const ledger = await sync.getLedger(db);
    res.json(ledger);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List available snapshots
app.get('/api/sync/snapshots', async (req, res) => {
  try {
    const snapshots = [];
    
    if (localClient) {
      const localSnaps = await sync.listSnapshots(localClient, DB_NAME);
      localSnaps.forEach(s => { s.source = 'local'; });
      snapshots.push(...localSnaps);
    }
    
    if (atlasClient) {
      const atlasSnaps = await sync.listSnapshots(atlasClient, DB_NAME);
      atlasSnaps.forEach(s => { s.source = 'atlas'; });
      snapshots.push(...atlasSnaps);
    }
    
    // Sort all by date, newest first
    snapshots.sort((a, b) => b.date - a.date);
    
    res.json(snapshots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual push to Atlas
app.post('/api/sync/push', async (req, res) => {
  try {
    if (!localDb || !atlasDb) {
      return res.status(400).json({ error: 'Both local and Atlas must be connected for manual push' });
    }
    const result = await sync.manualPush(localDb, atlasDb, localClient, atlasClient, DB_NAME);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual pull from Atlas
app.post('/api/sync/pull', async (req, res) => {
  try {
    if (!localDb || !atlasDb) {
      return res.status(400).json({ error: 'Both local and Atlas must be connected for manual pull' });
    }
    const result = await sync.manualPull(localDb, atlasDb, localClient, atlasClient, DB_NAME);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Restore from a snapshot
app.post('/api/sync/restore', async (req, res) => {
  try {
    const { snapshotName, target } = req.body;
    if (!snapshotName) return res.status(400).json({ error: 'snapshotName is required' });
    
    const targetDb = (target === 'atlas' && atlasDb) ? atlasDb : (localDb || db);
    const client = (target === 'atlas' && atlasClient) ? atlasClient : (localClient || atlasClient);
    
    if (!targetDb || !client) {
      return res.status(400).json({ error: 'Target database not available' });
    }
    
    // Snapshot current state before restoring
    await sync.createSnapshot(targetDb, client, DB_NAME);
    
    // Restore
    await sync.restoreSnapshot(snapshotName, targetDb, client);
    await sync.setLastUpdated(targetDb);
    
    // Prune old snapshots
    await sync.pruneSnapshots(client, DB_NAME);
    
    res.json({ success: true, message: `Restored from ${snapshotName}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual push to Atlas
app.post('/api/sync/push', async (req, res) => {
  try {
    if (!localDb || !atlasDb) {
      return res.status(400).json({ error: 'Both local and Atlas must be connected for manual push' });
    }
    const result = await sync.manualPush(localDb, atlasDb, localClient, atlasClient, DB_NAME);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reconnect to databases
app.post('/api/sync/reconnect', async (req, res) => {
  try {
    console.log('\n  🔄 Reconnecting databases...');
    
    // Reload .env variables in case user updated the file
    require('dotenv').config({ override: true });
    
    // Close existing connections
    try { if (localClient) await localClient.close(); } catch {}
    try { if (atlasClient) await atlasClient.close(); } catch {}
    
    localDb = null;
    atlasDb = null;
    localClient = null;
    atlasClient = null;
    db = null;
    sync.syncState.localConnected = false;
    sync.syncState.atlasConnected = false;
    sync.syncState.mode = 'NONE';
    sync.syncState.errors = [];
    
    // Reconnect
    await connectDB();
    
    res.json({ 
      success: true, 
      mode: sync.syncState.mode,
      localConnected: sync.syncState.localConnected,
      atlasConnected: sync.syncState.atlasConnected
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SPA FALLBACK ───────────────────────────────────────────


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/sync', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sync.html'));
});

// ─── GRACEFUL SHUTDOWN ──────────────────────────────────────

let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`\n\n  ⏻ Received ${signal} — shutting down gracefully...`);
  
  // Push to Atlas if in DUAL mode
  if (sync.syncState.mode === 'DUAL' && localDb && atlasDb) {
    await sync.pushOnShutdown(localDb, atlasDb, localClient, atlasClient, DB_NAME);
  } else {
    console.log('  ⊘ Not in DUAL mode — skipping Atlas push');
  }
  
  // Close connections
  console.log('  Closing database connections...');
  try { if (localClient) await localClient.close(); } catch {}
  try { if (atlasClient) await atlasClient.close(); } catch {}
  
  console.log('  ✓ Kaizen shut down cleanly\n');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

// ─── START ──────────────────────────────────────────────────

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Kaizen running at http://localhost:${PORT}`);
  });
});
