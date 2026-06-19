const fs = require('fs');

let content = fs.readFileSync('server.js', 'utf8');

// 1. find(...) and findOne(...)
// Needs to inject `deleted: { $ne: true }` into the filter object.
// We'll replace `.find({` with `.find({ deleted: { $ne: true }, `
content = content.replace(/\.find\(\{\s*/g, '.find({ deleted: { $ne: true }, ');
content = content.replace(/\.findOne\(\{\s*/g, '.findOne({ deleted: { $ne: true }, ');
// Handle empty find() -> find({ deleted: { $ne: true } })
content = content.replace(/\.find\(\)/g, '.find({ deleted: { $ne: true } })');

// 2. insertOne(obj)
// We need to add updatedAt to the object before insert. But the obj is a variable.
// e.g. `const result = await db.collection('exams').insertOne(exam);`
// We can just replace `.insertOne(` with `.insertOne({ ...` ? No, `.insertOne({ ...exam, updatedAt: new Date() })`
// Let's do it manually for inserts as there are only ~6 of them.

// 3. updateOne and updateMany
// Needs to inject `updatedAt: new Date()` into `$set`.
// `updateOne(filter, { $set: { ... } })`
// We'll manually replace these.

// 4. deleteOne and deleteMany
// `deleteOne({ _id: ... })` -> `updateOne({ _id: ... }, { $set: { deleted: true, updatedAt: new Date() } })`
content = content.replace(/\.deleteOne\((.*?)\)/g, '.updateOne($1, { $set: { deleted: true, updatedAt: new Date() } })');
content = content.replace(/\.deleteMany\((.*?)\)/g, '.updateMany($1, { $set: { deleted: true, updatedAt: new Date() } })');

fs.writeFileSync('server.js.tmp', content);
console.log("Done");
