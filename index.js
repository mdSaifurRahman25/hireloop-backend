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
}

app.get("/", (req, res) => {
  res.send("HireLoop Backend is running!");
});

app.listen(port, async () => {
  await connectToMongoDB();
  console.log(`Server is running successfully at https://localhost:${port}`);
});
