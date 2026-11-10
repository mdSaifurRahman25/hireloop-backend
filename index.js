import express from "express";
import cors from "cors";
import 'dotenv/config'; 

import { MongoClient, ObjectId } from "mongodb";

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
    console.error("MongoDB connection failed:", err);
    throw err;
  }
}; 

const connectedClient = await connectToMongoDB();
const database = connectedClient.db('hireloop'); 
const users = database.collection('user'); 
const jobs = database.collection('jobs'); 


// API 
// User Related API
app.get("/", (req, res) => {
  res.send("HireLoop Backend is running!");
});

app.get('/users', async (req, res) => {
    const cursor = users.find({}); 
    const results = await cursor.toArray(); 
    res.send(results); 
}); 

// Job Related API

//GET JOB API 
app.get('/jobs', async (req, res) => {
  const cursor = jobs.find(); 
  const result = await cursor.toArray(); 
  res.send(result); 
})

// POST API
const REQUIRED_JOB_FIELDS = [
  "title",
  "companyName",
  "category",
  "jobType",
  "location",
  "responsibilities",
  "qualifications",
];

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

app.post('/new', async (req, res) => {
  try {
    const body = req.body ?? {};

    const missingFields = REQUIRED_JOB_FIELDS.filter((field) => {
      const value = body[field];
      return typeof value !== "string" || value.trim() === "";
    });

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: `Missing required fields: ${missingFields.join(", ")}`,
        fields: missingFields,
      });
    }

    const deadline = body.deadline ? new Date(body.deadline) : null;
    if (deadline && Number.isNaN(deadline.getTime())) {
      return res.status(400).json({ message: "Invalid application deadline." });
    }

    const job = {
      title: body.title.trim(),
      companyName: body.companyName.trim(),
      category: body.category,
      jobType: body.jobType,
      isRemote: body.isRemote === true || body.isRemote === "true",
      location: body.location.trim(),
      deadline,
      minSalary: toNumberOrNull(body.minSalary),
      maxSalary: toNumberOrNull(body.maxSalary),
      frequency: body.frequency ?? null,
      responsibilities: body.responsibilities.trim(),
      qualifications: body.qualifications.trim(),
      createdAt: new Date(),
    };

    const result = await jobs.insertOne(job);
    console.log(result, 'from new job post backend api');

    res.status(201).json({
      message: "Job published successfully.",
      insertedId: result.insertedId,
      job,
    });
  } catch (error) {
    console.error("POST /new failed:", error);
    res.status(500).json({ message: "Could not publish the job." });
  }
}); 

//JOB DELETE API 
app.delete('/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params; 
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid job ID." });
    }
    const query = { _id: new ObjectId(id) }; 
    const result = await jobs.deleteOne(query); 
    res.json(result); 
  } catch (error) {
    console.error("DELETE /jobs/:id failed:", error);
    res.status(500).json({ message: "Could not delete the job." });
  }
}); 

app.listen(port, async () => {
  console.log(`Server is running successfully at http://localhost:${port}`);
});
