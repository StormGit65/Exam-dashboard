const fs = require('fs');
let content = fs.readFileSync('sync.js', 'utf8');

const mergeFunc = `
/**
 * Merge all data collections between local and atlas databases.
 * Uses Document-Level Last-Write-Wins based on updatedAt.
 */
async function mergeCollections(localDb, atlasDb) {
  for (const col of COLLECTIONS) {
    const localDocs = await localDb.collection(col).find({}).toArray();
    const atlasDocs = await atlasDb.collection(col).find({}).toArray();

    const mergedDocsMap = new Map();

    for (const doc of localDocs) {
      mergedDocsMap.set(doc._id.toString(), doc);
    }

    for (const doc of atlasDocs) {
      const existing = mergedDocsMap.get(doc._id.toString());
      if (!existing) {
        mergedDocsMap.set(doc._id.toString(), doc);
      } else {
        const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
        const newTime = doc.updatedAt ? new Date(doc.updatedAt).getTime() : 0;
        if (newTime > existingTime) {
          mergedDocsMap.set(doc._id.toString(), doc);
        }
      }
    }

    const mergedDocs = Array.from(mergedDocsMap.values());

    try { await localDb.collection(col).drop(); } catch {}
    try { await atlasDb.collection(col).drop(); } catch {}
    
    if (mergedDocs.length > 0) {
      await localDb.collection(col).insertMany(mergedDocs);
      await atlasDb.collection(col).insertMany(mergedDocs);
    }
  }
}
`;

// Insert mergeCollections right after copyCollections
content = content.replace(/(async function copyCollections.*?return true;\n})/s, '$1\n' + mergeFunc);

// Replace copyCollections with mergeCollections in syncOnStartup
content = content.replace(/await copyCollections\(localDb, atlasDb\);/g, 'await mergeCollections(localDb, atlasDb);');
content = content.replace(/await copyCollections\(atlasDb, localDb\);/g, 'await mergeCollections(localDb, atlasDb);');

fs.writeFileSync('sync.js', content);
console.log("Done");
