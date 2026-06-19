const { MongoClient } = require('mongodb');
require('dotenv').config();

async function test() {
  const uri = process.env.MONGO_ATLAS_URI;
  console.log("URI:", uri);
  try {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    console.log("Connected successfully!");
    await client.close();
  } catch (err) {
    console.error("Connection failed:", err.message);
  }
}
test();
