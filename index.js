const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
require("dotenv").config();
const fs = require("fs");


// App Initialization
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());


// Firebase Admin Setup
try {
  const serviceAccount = JSON.parse(
    fs.readFileSync("./firebase-admin.json", "utf8")
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log("✅ Firebase Admin initialized (local)!");
} catch (err) {
  console.error("❌ Firebase Admin init failed:");
  console.error(err.message);
  process.exit(1);
}



// MongoDB Setup
const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.ke7g9qv.mongodb.net/?retryWrites=true&w=majority`;

let cachedClient = null; // Vercel-friendly cache for MongoDB

async function connectToMongo() {
  if (cachedClient) return cachedClient;
  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
  await client.connect();
  cachedClient = client;
  console.log("MongoDB connected");
  return client;
}


// Middleware
const verifyFirebaseToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).send({ message: "Unauthorized" });

    const token = authHeader.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(token);

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).send({ message: "Invalid token", error: error.message });
  }
};


// Routes
app.get("/", (req, res) => {
  res.send("Hello FinEase Server");
});

async function run() {
  try {
    const client = await connectToMongo();
    const db = client.db("financeDB");
    const transactionCollection = db.collection("main-data");

    // GET all transactions
    app.get("/my-transaction", verifyFirebaseToken, async (req, res) => {
      try {
        const { email } = req.query;
        if (!email) return res.status(400).send({ message: "Email required" });

        if (email !== req.user.email) return res.status(403).send({ message: "Forbidden" });

        const result = await transactionCollection.find({ email }).sort({ date: -1 }).toArray();
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch transactions" });
      }
    });

    // GET single transaction
    app.get("/my-transaction/:id", verifyFirebaseToken, async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid ID" });

        const result = await transactionCollection.findOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch transaction" });
      }
    });

    // CREATE transaction
    app.post("/my-transaction", verifyFirebaseToken, async (req, res) => {
      try {
        const data = req.body;
        data.email = req.user.email;

        const result = await transactionCollection.insertOne(data);
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to create transaction" });
      }
    });

    // UPDATE transaction
    app.put("/my-transaction/:id", verifyFirebaseToken, async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid ID" });

        const result = await transactionCollection.updateOne({ _id: new ObjectId(id) }, { $set: req.body });
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to update transaction" });
      }
    });

    // DELETE transaction
    app.delete("/my-transaction/:id", verifyFirebaseToken, async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid ID" });

        const result = await transactionCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to delete transaction" });
      }
    });

  } catch (error) {
    console.error("Server error during run():", error);
  }
}

run();


// Vercel expects this:
module.exports = app;




  // app.listen(port, ()=>{
  //   console.log(`Server Running at http://localhost:${port}`);
  // })