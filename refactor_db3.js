const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

// Step 1: find
content = content.replace(/\.find\(\{\s*/g, '.find({ deleted: { $ne: true }, ');
content = content.replace(/\.findOne\(\{\s*/g, '.findOne({ deleted: { $ne: true }, ');
content = content.replace(/\.find\(\)/g, '.find({ deleted: { $ne: true } })');

// Step 2 & 3: Inserts and Updates
content = content.replace(/\.insertOne\((.*?)\)/g, '.insertOne({ ...$1, updatedAt: new Date() })');
content = content.replace(/\{\s*\$set:\s*\{/g, '{ $set: { updatedAt: new Date(), ');
content = content.replace(/\{\s*\$set:\s*updates\s*\}/g, '{ $set: { ...updates, updatedAt: new Date() } }');
content = content.replace(/\{\s*\$set:\s*mockUpdates\s*\}/g, '{ $set: { ...mockUpdates, updatedAt: new Date() } }');

fs.writeFileSync('server.js', content);
console.log("Done");
