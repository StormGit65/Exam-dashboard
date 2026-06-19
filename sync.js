/**
 * sync.js — Kaizen Database Sync Engine
 * 
 * Handles bi-directional sync between local MongoDB and MongoDB Atlas.
 * Supports three operating modes: DUAL, LOCAL_ONLY, ATLAS_ONLY.
 * Maintains a sync ledger and pre-sync snapshots for recovery.
 */

const { MongoClient } = require('mongodb');

const COLLECTIONS = ['exams', 'mocks', 'goals', 'completedEntries', 'deskProfiles'];
const MAX_SNAPSHOTS = 5;

// Current sync state — exported for API access
const syncState = {
  mode: 'NONE',             // DUAL, LOCAL_ONLY, ATLAS_ONLY, NONE
  localConnected: false,
  atlasConnected: false,
  lastSyncTime: null,
  startupAction: null,      // PULL_FROM_ATLAS, PUSH_TO_ATLAS, IN_SYNC, NONE
  sessionId: null,
  errors: []
};

/**
 * Try to connect to a MongoDB instance with a timeout.
 * Returns { client, db } on success, null on failure.
 */
async function tryConnect(uri, dbName, label = 'MongoDB') {
  if (!uri || uri.trim() === '') {
    console.log(`  ⊘ ${label}: No URI configured — skipped`);
    return null;
  }

  try {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    await client.connect();
    // Ping to verify connectivity
    await client.db(dbName).command({ ping: 1 });
    console.log(`  ✓ ${label}: Connected`);
    return { client, db: client.db(dbName) };
  } catch (err) {
    console.log(`  ✗ ${label}: Failed — ${err.message}`);
    return null;
  }
}

/**
 * Determine the operating mode based on available connections.
 */
function determineMode(localResult, atlasResult) {
  if (localResult && atlasResult) return 'DUAL';
  if (localResult && !atlasResult) return 'LOCAL_ONLY';
  if (!localResult && atlasResult) return 'ATLAS_ONLY';
  return 'NONE';
}

/**
 * Read the lastUpdated timestamp from _syncMeta collection.
 */
async function getLastUpdated(db) {
  try {
    const meta = await db.collection('_syncMeta').findOne({ _id: 'sync' });
    return meta ? meta.lastUpdated : null;
  } catch {
    return null;
  }
}

/**
 * Set the lastUpdated timestamp in _syncMeta collection.
 */
async function setLastUpdated(db) {
  const now = new Date();
  await db.collection('_syncMeta').updateOne(
    { _id: 'sync' },
    { $set: { lastUpdated: now } },
    { upsert: true }
  );
  return now;
}

/**
 * Copy all data collections from source to target database.
 * Drops existing data in target before copying.
 */
async function copyCollections(sourceDb, targetDb) {
  for (const col of COLLECTIONS) {
    const docs = await sourceDb.collection(col).find({}).toArray();
    
    // Drop target collection if it exists
    try {
      await targetDb.collection(col).drop();
    } catch {
      // Collection might not exist — that's fine
    }
    
    if (docs.length > 0) {
      await targetDb.collection(col).insertMany(docs);
    }
  }
}

/**
 * Create a snapshot of the database before destructive sync.
 * Snapshots are stored as separate databases: ExamPrep_snap_<timestamp>
 * Returns the snapshot database name.
 */
async function createSnapshot(sourceDb, client, dbName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const snapName = `${dbName}_snap_${timestamp}`;
  const snapDb = client.db(snapName);

  let hasData = false;
  for (const col of COLLECTIONS) {
    const docs = await sourceDb.collection(col).find({}).toArray();
    if (docs.length > 0) {
      await snapDb.collection(col).insertMany(docs);
      hasData = true;
    }
  }

  // Copy sync meta too
  const meta = await sourceDb.collection('_syncMeta').findOne({ _id: 'sync' });
  if (meta) {
    await snapDb.collection('_syncMeta').insertOne(meta);
    hasData = true;
  }

  if (!hasData) {
    // Drop empty snapshot
    try { await snapDb.dropDatabase(); } catch {}
    return null;
  }

  console.log(`  📸 Snapshot created: ${snapName}`);
  return snapName;
}

/**
 * Prune old snapshots, keeping only the most recent MAX_SNAPSHOTS.
 */
async function pruneSnapshots(client, dbName) {
  const snapshots = await listSnapshots(client, dbName);
  if (snapshots.length > MAX_SNAPSHOTS) {
    const toDelete = snapshots.slice(MAX_SNAPSHOTS); // sorted newest-first, so slice from end
    for (const snap of toDelete) {
      try {
        await client.db(snap.name).dropDatabase();
        console.log(`  🗑️  Pruned old snapshot: ${snap.name}`);
      } catch {}
    }
  }
}

/**
 * List all snapshot databases sorted newest-first.
 */
async function listSnapshots(client, dbName) {
  try {
    const adminDb = client.db('admin');
    const result = await adminDb.admin().listDatabases();
    const prefix = `${dbName}_snap_`;
    
    const snapshots = result.databases
      .filter(d => d.name.startsWith(prefix))
      .map(d => {
        // Parse timestamp from name: ExamPrep_snap_2026-06-19_11-30-00
        const tsStr = d.name.replace(prefix, '');
        const ts = tsStr.replace(/_/g, 'T').replace(/-/g, (m, offset) => {
          // First 2 dashes are date separators, rest are time separators
          return offset <= 7 ? '-' : ':';
        });
        return {
          name: d.name,
          timestamp: tsStr,
          sizeOnDisk: d.sizeOnDisk || 0,
          date: new Date(ts) || new Date()
        };
      })
      .sort((a, b) => b.date - a.date); // newest first
    
    return snapshots;
  } catch {
    return [];
  }
}

/**
 * Restore a snapshot to the target database.
 */
async function restoreSnapshot(snapshotName, targetDb, client) {
  const snapDb = client.db(snapshotName);
  
  // Verify snapshot has data
  const collections = await snapDb.listCollections().toArray();
  if (collections.length === 0) {
    throw new Error(`Snapshot "${snapshotName}" is empty or does not exist`);
  }

  // Copy all data from snapshot to target
  for (const col of COLLECTIONS) {
    const docs = await snapDb.collection(col).find({}).toArray();
    try { await targetDb.collection(col).drop(); } catch {}
    if (docs.length > 0) {
      await targetDb.collection(col).insertMany(docs);
    }
  }

  // Restore sync meta
  const meta = await snapDb.collection('_syncMeta').findOne({ _id: 'sync' });
  if (meta) {
    await targetDb.collection('_syncMeta').updateOne(
      { _id: 'sync' },
      { $set: { lastUpdated: meta.lastUpdated } },
      { upsert: true }
    );
  }

  return true;
}

/**
 * Check if a database has any data in the synced collections.
 */
async function hasData(db) {
  for (const col of COLLECTIONS) {
    const count = await db.collection(col).countDocuments();
    if (count > 0) return true;
  }
  return false;
}

/**
 * Log a sync event to the ledger and prune old entries.
 */
async function logToLedger(db, entry) {
  try {
    await db.collection('_syncLedger').insertOne(entry);
    
    // Keep only the most recent 50 entries to prevent infinite growth
    const cursor = db.collection('_syncLedger').find({}).sort({ sessionStart: -1 }).skip(50);
    const oldEntries = await cursor.toArray();
    if (oldEntries.length > 0) {
      const oldIds = oldEntries.map(e => e._id);
      await db.collection('_syncLedger').deleteMany({ _id: { $in: oldIds } });
    }
  } catch (err) {
    console.error('  ⚠ Failed to write sync ledger:', err.message);
  }
}

/**
 * Get sync ledger entries (newest first).
 */
async function getLedger(db, limit = 50) {
  try {
    return await db.collection('_syncLedger')
      .find({})
      .sort({ sessionStart: -1 })
      .limit(limit)
      .toArray();
  } catch {
    return [];
  }
}

/**
 * Main startup sync routine.
 * Compares timestamps and syncs accordingly.
 */
async function syncOnStartup(localDb, atlasDb, mode, localClient, atlasClient, dbName) {
  const sessionId = `session_${Date.now()}`;
  syncState.sessionId = sessionId;
  
  const ledgerEntry = {
    _id: sessionId,
    sessionStart: new Date(),
    sessionEnd: null,
    mode,
    localAvailable: !!localDb,
    atlasAvailable: !!atlasDb,
    startupAction: 'NONE',
    shutdownAction: null,
    snapshotsBefore: [],
    collectionsSynced: COLLECTIONS,
    errors: []
  };

  if (mode === 'LOCAL_ONLY') {
    console.log('\n  ⚡ Mode: LOCAL-ONLY — Atlas not available, working offline');
    ledgerEntry.startupAction = 'LOCAL_ONLY';
    syncState.startupAction = 'LOCAL_ONLY';
    await logToLedger(localDb, ledgerEntry);
    return;
  }

  if (mode === 'ATLAS_ONLY') {
    console.log('\n  ☁️  Mode: ATLAS-ONLY — Local DB not available, using Atlas directly');
    ledgerEntry.startupAction = 'ATLAS_ONLY';
    syncState.startupAction = 'ATLAS_ONLY';
    await logToLedger(atlasDb, ledgerEntry);
    return;
  }

  // DUAL mode — compare timestamps
  console.log('\n  🔄 Mode: DUAL — Comparing databases...');
  
  const localUpdated = await getLastUpdated(localDb);
  const atlasUpdated = await getLastUpdated(atlasDb);
  const localHasData = await hasData(localDb);
  const atlasHasData = await hasData(atlasDb);

  console.log(`     Local  lastUpdated: ${localUpdated ? localUpdated.toISOString() : '(none)'} ${localHasData ? '(has data)' : '(empty)'}`);
  console.log(`     Atlas  lastUpdated: ${atlasUpdated ? atlasUpdated.toISOString() : '(none)'} ${atlasHasData ? '(has data)' : '(empty)'}`);

  // Case 1: Both empty — nothing to sync
  if (!localHasData && !atlasHasData) {
    console.log('     ✓ Both databases are empty — nothing to sync');
    ledgerEntry.startupAction = 'BOTH_EMPTY';
    syncState.startupAction = 'BOTH_EMPTY';
    await logToLedger(localDb, ledgerEntry);
    return;
  }

  // Case 2: Only local has data — push to Atlas (first time setup)
  if (localHasData && !atlasHasData) {
    console.log('     → Atlas is empty — pushing local data to Atlas (first-time setup)');
    try {
      await copyCollections(localDb, atlasDb);
      const now = await setLastUpdated(localDb);
      await atlasDb.collection('_syncMeta').updateOne(
        { _id: 'sync' },
        { $set: { lastUpdated: now } },
        { upsert: true }
      );
      ledgerEntry.startupAction = 'INITIAL_PUSH_TO_ATLAS';
      syncState.startupAction = 'INITIAL_PUSH_TO_ATLAS';
      syncState.lastSyncTime = now;
      console.log('     ✓ Initial push to Atlas complete');
    } catch (err) {
      console.error('     ✗ Failed to push to Atlas:', err.message);
      ledgerEntry.errors.push(err.message);
      syncState.errors.push(err.message);
    }
    await logToLedger(localDb, ledgerEntry);
    return;
  }

  // Case 3: Only Atlas has data — pull to local (new device)
  if (!localHasData && atlasHasData) {
    console.log('     → Local is empty — pulling Atlas data to local (new device setup)');
    try {
      await copyCollections(atlasDb, localDb);
      const now = await setLastUpdated(localDb);
      await atlasDb.collection('_syncMeta').updateOne(
        { _id: 'sync' },
        { $set: { lastUpdated: now } },
        { upsert: true }
      );
      ledgerEntry.startupAction = 'INITIAL_PULL_FROM_ATLAS';
      syncState.startupAction = 'INITIAL_PULL_FROM_ATLAS';
      syncState.lastSyncTime = now;
      console.log('     ✓ Initial pull from Atlas complete');
    } catch (err) {
      console.error('     ✗ Failed to pull from Atlas:', err.message);
      ledgerEntry.errors.push(err.message);
      syncState.errors.push(err.message);
    }
    await logToLedger(localDb, ledgerEntry);
    return;
  }

  // Case 4: Both have data — compare timestamps
  if (!localUpdated && !atlasUpdated) {
    // Both have data but no timestamps — set timestamps and treat as in-sync
    console.log('     → Both have data but no sync timestamps — initializing timestamps');
    const now = await setLastUpdated(localDb);
    await atlasDb.collection('_syncMeta').updateOne(
      { _id: 'sync' },
      { $set: { lastUpdated: now } },
      { upsert: true }
    );
    // Push local to Atlas as initial source of truth
    try {
      await copyCollections(localDb, atlasDb);
      console.log('     ✓ Local data pushed to Atlas as initial sync');
    } catch (err) {
      console.error('     ✗ Initial sync failed:', err.message);
      ledgerEntry.errors.push(err.message);
    }
    ledgerEntry.startupAction = 'INITIAL_SYNC';
    syncState.startupAction = 'INITIAL_SYNC';
    syncState.lastSyncTime = now;
    await logToLedger(localDb, ledgerEntry);
    return;
  }

  const localTime = localUpdated ? localUpdated.getTime() : 0;
  const atlasTime = atlasUpdated ? atlasUpdated.getTime() : 0;

  if (atlasTime > localTime) {
    // Atlas is newer — pull from Atlas
    console.log('     → Atlas is AHEAD — pulling to local...');
    try {
      // Snapshot local before overwriting
      const snapName = await createSnapshot(localDb, localClient, dbName);
      if (snapName) ledgerEntry.snapshotsBefore.push(snapName);
      
      await copyCollections(atlasDb, localDb);
      const now = atlasUpdated;
      await localDb.collection('_syncMeta').updateOne(
        { _id: 'sync' },
        { $set: { lastUpdated: now } },
        { upsert: true }
      );
      ledgerEntry.startupAction = 'PULL_FROM_ATLAS';
      syncState.startupAction = 'PULL_FROM_ATLAS';
      syncState.lastSyncTime = now;
      console.log('     ✓ Pulled latest data from Atlas');
      
      await pruneSnapshots(localClient, dbName);
    } catch (err) {
      console.error('     ✗ Pull from Atlas failed:', err.message);
      ledgerEntry.errors.push(err.message);
      syncState.errors.push(err.message);
    }
  } else if (localTime > atlasTime) {
    // Local is newer — will push on shutdown
    console.log('     → Local is AHEAD — will push to Atlas on shutdown');
    ledgerEntry.startupAction = 'LOCAL_AHEAD';
    syncState.startupAction = 'LOCAL_AHEAD';
    syncState.lastSyncTime = localUpdated;
  } else {
    // Same timestamp — in sync
    console.log('     ✓ Databases are in sync');
    ledgerEntry.startupAction = 'IN_SYNC';
    syncState.startupAction = 'IN_SYNC';
    syncState.lastSyncTime = localUpdated;
  }

  await logToLedger(localDb, ledgerEntry);
}

/**
 * Push local database to Atlas on shutdown.
 */
async function pushOnShutdown(localDb, atlasDb, localClient, atlasClient, dbName) {
  if (!localDb || !atlasDb) {
    console.log('  ⊘ Skipping push — not in DUAL mode');
    return;
  }

  console.log('\n  ☁️  Pushing local data to Atlas...');
  
  try {
    // Snapshot Atlas before overwriting
    const snapName = await createSnapshot(atlasDb, atlasClient, dbName);
    
    // Copy local → Atlas
    await copyCollections(localDb, atlasDb);
    
    // Sync the timestamp
    const localMeta = await getLastUpdated(localDb);
    const ts = localMeta || new Date();
    await atlasDb.collection('_syncMeta').updateOne(
      { _id: 'sync' },
      { $set: { lastUpdated: ts } },
      { upsert: true }
    );

    // Update ledger
    if (syncState.sessionId) {
      try {
        await localDb.collection('_syncLedger').updateOne(
          { _id: syncState.sessionId },
          { $set: { shutdownAction: 'PUSH_TO_ATLAS', sessionEnd: new Date() } }
        );
      } catch {}
    }

    // Prune old Atlas snapshots
    await pruneSnapshots(atlasClient, dbName);

    console.log('  ✓ Push to Atlas complete');
  } catch (err) {
    console.error('  ✗ Push to Atlas failed:', err.message);
    syncState.errors.push(err.message);
  }
}

/**
 * Manual push from local to Atlas.
 */
async function manualPush(localDb, atlasDb, localClient, atlasClient, dbName) {
  if (!localDb || !atlasDb) {
    throw new Error('Both local and Atlas databases must be connected for manual push');
  }

  // Snapshot Atlas before overwriting
  const snapName = await createSnapshot(atlasDb, atlasClient, dbName);

  // Copy local → Atlas
  await copyCollections(localDb, atlasDb);

  // Sync timestamps
  const now = await setLastUpdated(localDb);
  await atlasDb.collection('_syncMeta').updateOne(
    { _id: 'sync' },
    { $set: { lastUpdated: now } },
    { upsert: true }
  );

  syncState.lastSyncTime = now;

  // Log to ledger
  await logToLedger(localDb, {
    _id: `manual_push_${Date.now()}`,
    sessionStart: new Date(),
    sessionEnd: new Date(),
    mode: 'DUAL',
    localAvailable: true,
    atlasAvailable: true,
    startupAction: 'MANUAL_PUSH',
    shutdownAction: null,
    snapshotsBefore: snapName ? [snapName] : [],
    collectionsSynced: COLLECTIONS,
    errors: []
  });

  // Prune old snapshots
  await pruneSnapshots(atlasClient, dbName);

  return { success: true, timestamp: now, snapshot: snapName };
}

/**
 * Manual pull from Atlas to local.
 */
async function manualPull(localDb, atlasDb, localClient, atlasClient, dbName) {
  if (!localDb || !atlasDb) {
    throw new Error('Both local and Atlas databases must be connected for manual pull');
  }

  // Snapshot local before overwriting
  const snapName = await createSnapshot(localDb, localClient, dbName);

  // Copy Atlas → local
  await copyCollections(atlasDb, localDb);

  // Sync timestamps
  const atlasMeta = await getLastUpdated(atlasDb);
  const now = atlasMeta || new Date();
  await localDb.collection('_syncMeta').updateOne(
    { _id: 'sync' },
    { $set: { lastUpdated: now } },
    { upsert: true }
  );

  syncState.lastSyncTime = now;

  // Log to ledger
  await logToLedger(localDb, {
    _id: `manual_pull_${Date.now()}`,
    sessionStart: new Date(),
    sessionEnd: new Date(),
    mode: 'DUAL',
    localAvailable: true,
    atlasAvailable: true,
    startupAction: 'MANUAL_PULL',
    shutdownAction: null,
    snapshotsBefore: snapName ? [snapName] : [],
    collectionsSynced: COLLECTIONS,
    errors: []
  });

  // Prune old snapshots
  await pruneSnapshots(localClient, dbName);

  return { success: true, timestamp: now, snapshot: snapName };
}

module.exports = {
  syncState,
  tryConnect,
  determineMode,
  syncOnStartup,
  pushOnShutdown,
  manualPush,
  manualPull,
  setLastUpdated,
  getLastUpdated,
  listSnapshots,
  restoreSnapshot,
  getLedger,
  createSnapshot,
  pruneSnapshots,
  COLLECTIONS
};
