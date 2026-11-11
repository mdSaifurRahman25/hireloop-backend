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

// GET JOB API (supports search, filtering, sorting, pagination, and dynamic counts)
app.get('/jobs', async (req, res) => {
  try {
    const {
      q,
      type,
      category,
      minSalary,
      maxSalary,
      salaryRange,
      sort,
      page,
      limit,
      format,
    } = req.query;

    const hasFiltersOrPagination = Boolean(
      q || type || category || salaryRange || minSalary || maxSalary || sort || page || limit
    );

    // If no query parameters at all and no format=paginated, return full array for backwards compatibility
    if (!hasFiltersOrPagination && format !== 'paginated') {
      const allJobs = await jobs.find({}).sort({ createdAt: -1, _id: -1 }).toArray();
      return res.json(allJobs);
    }

    // Build filter query
    const filter = {};

    // 1. Text Search Query `q`
    if (q && typeof q === 'string' && q.trim()) {
      const searchRegex = new RegExp(q.trim(), 'i');
      filter.$or = [
        { title: searchRegex },
        { jobTitle: searchRegex },
        { companyName: searchRegex },
        { location: searchRegex },
        { category: searchRegex },
        { responsibilities: searchRegex },
        { qualifications: searchRegex },
      ];
    }

    // 2. Job Type filter (Single select / Radio button support)
    if (type && type !== 'All' && type !== 'all') {
      filter.jobType = { $regex: new RegExp(`^${type.trim()}$`, 'i') };
    }

    // 3. Category / Industry filter
    if (category && category !== 'All' && category !== 'all') {
      filter.category = { $regex: new RegExp(`^${category.trim()}$`, 'i') };
    }

    // 4. Salary Filter
    if (salaryRange && salaryRange !== 'All' && salaryRange !== 'all') {
      filter.$and = filter.$and || [];
      if (salaryRange === '0-50' || salaryRange === 'under-50k') {
        filter.$and.push({
          $or: [
            { minSalary: { $lte: 50000, $gt: 0 } },
            { maxSalary: { $lte: 50000, $gt: 0 } },
          ],
        });
      } else if (salaryRange === '50-100' || salaryRange === '50k-100k') {
        filter.$and.push({
          $or: [
            { maxSalary: { $gte: 50000, $lte: 100000 } },
            { minSalary: { $gte: 50000, $lte: 100000 } },
          ],
        });
      } else if (salaryRange === '100-150' || salaryRange === '100k-150k') {
        filter.$and.push({
          $or: [
            { maxSalary: { $gte: 100000, $lte: 150000 } },
            { minSalary: { $gte: 100000, $lte: 150000 } },
          ],
        });
      } else if (salaryRange === '150+' || salaryRange === '150k+') {
        filter.$and.push({
          $or: [
            { maxSalary: { $gte: 150000 } },
            { minSalary: { $gte: 150000 } },
          ],
        });
      }
    } else {
      if (minSalary && !isNaN(Number(minSalary))) {
        filter.$and = filter.$and || [];
        filter.$and.push({
          $or: [
            { maxSalary: { $gte: Number(minSalary) } },
            { minSalary: { $gte: Number(minSalary) } },
          ],
        });
      }
      if (maxSalary && !isNaN(Number(maxSalary))) {
        filter.$and = filter.$and || [];
        filter.$and.push({
          $or: [
            { minSalary: { $lte: Number(maxSalary) } },
            { maxSalary: { $lte: Number(maxSalary) } },
          ],
        });
      }
    }

    // 5. Sorting
    let sortObj = { createdAt: -1, _id: -1 };
    if (sort === 'Highest Salary') {
      sortObj = { maxSalary: -1, minSalary: -1, createdAt: -1 };
    } else if (sort === 'Full-time First') {
      sortObj = { jobType: 1, createdAt: -1 };
    } else {
      sortObj = { createdAt: -1, _id: -1 };
    }

    // Count matching documents
    const total = await jobs.countDocuments(filter);

    // Pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = parseInt(limit, 10) > 0 ? parseInt(limit, 10) : 10;
    const skip = (pageNum - 1) * limitNum;

    const matchedJobs = await jobs
      .find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .toArray();

    // Aggregations for filter breakdown counts
    const typeCountsRaw = await jobs
      .aggregate([{ $group: { _id: "$jobType", count: { $sum: 1 } } }])
      .toArray();

    const categoryCountsRaw = await jobs
      .aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }])
      .toArray();

    const typeCounts = {};
    typeCountsRaw.forEach((item) => {
      if (item._id) typeCounts[item._id] = item.count;
    });

    const categoryCounts = {};
    categoryCountsRaw.forEach((item) => {
      if (item._id) categoryCounts[item._id] = item.count;
    });

    res.json({
      jobs: matchedJobs,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.max(1, Math.ceil(total / limitNum)),
      typeCounts,
      categoryCounts,
    });
  } catch (error) {
    console.error("GET /jobs failed:", error);
    res.status(500).json({ message: "Could not fetch jobs." });
  }
});

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

// GET SINGLE JOB API
app.get('/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid job ID." });
    }
    const job = await jobs.findOne({ _id: new ObjectId(id) });
    if (!job) {
      return res.status(404).json({ message: "Job not found." });
    }
    res.json(job);
  } catch (error) {
    console.error("GET /jobs/:id failed:", error);
    res.status(500).json({ message: "Could not fetch the job." });
  }
});

// UPDATE JOB API
app.put('/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid job ID." });
    }

    const body = req.body ?? {};
    const deadline = body.deadline ? new Date(body.deadline) : null;
    if (deadline && Number.isNaN(deadline.getTime())) {
      return res.status(400).json({ message: "Invalid application deadline." });
    }

    const updatedJob = {
      ...(body.title && { title: body.title.trim() }),
      ...(body.companyName && { companyName: body.companyName.trim() }),
      ...(body.category && { category: body.category }),
      ...(body.jobType && { jobType: body.jobType }),
      isRemote: body.isRemote === true || body.isRemote === "true",
      ...(body.location && { location: body.location.trim() }),
      deadline,
      minSalary: toNumberOrNull(body.minSalary),
      maxSalary: toNumberOrNull(body.maxSalary),
      frequency: body.frequency ?? null,
      ...(body.responsibilities && { responsibilities: body.responsibilities.trim() }),
      ...(body.qualifications && { qualifications: body.qualifications.trim() }),
      updatedAt: new Date(),
    };

    const result = await jobs.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedJob }
    );

    res.json({
      message: "Job updated successfully.",
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      job: updatedJob,
    });
  } catch (error) {
    console.error("PUT /jobs/:id failed:", error);
    res.status(500).json({ message: "Could not update the job." });
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
