const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

// Update inserts:
// .insertOne(exam); -> .insertOne({ ...exam, updatedAt: new Date() });
content = content.replace(/\.insertOne\((.*?)\)/g, '.insertOne({ ...$1, updatedAt: new Date() })');

// Update updateOne and updateMany to inject updatedAt into $set:
// Usually it looks like: .updateOne(filter, { $set: updates }) or { $set: { field: val } }
// If $set is explicitly written, we can regex it.
// e.g. `{ $set: { ` -> `{ $set: { updatedAt: new Date(), `
content = content.replace(/\{\s*\$set:\s*\{/g, '{ $set: { updatedAt: new Date(), ');

// Wait, what if it's `{ $set: updates }`?
// There are cases like: `await db.collection('exams').updateOne({ _id: new ObjectId(req.params.id) }, { $set: updates });`
// We should find them and modify updates object BEFORE the query.
// But we can also replace `{ $set: updates }` with `{ $set: { ...updates, updatedAt: new Date() } }`
content = content.replace(/\{\s*\$set:\s*updates\s*\}/g, '{ $set: { ...updates, updatedAt: new Date() } }');
content = content.replace(/\{\s*\$set:\s*mockUpdates\s*\}/g, '{ $set: { ...mockUpdates, updatedAt: new Date() } }');

fs.writeFileSync('server.js', content);
console.log("Done");
