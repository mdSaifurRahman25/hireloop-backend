import express from "express";
import cors from "cors";
import 'dotenv/config'; 

import { MongoClient } from "mongodb";

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());



const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}; 

const connectedClient = await connectToMongoDB();
const database = connectedClient.db('hireloop'); 
const users = database.collection('user'); 
const jobs = database.collection('jobs'); 


// API 
// GET API
app.get("/", (req, res) => {
  res.send("HireLoop Backend is running!");
});

app.get('/users', async (req, res) => {
    const cursor = users.find({}); 
    const results = await cursor.toArray(); 
    res.send(results); 
}); 

app.listen(port, async () => {
  console.log(`Server is running successfully at https://localhost:${port}`);
});
