const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Firebase Admin Initialization from Environment Variable
let firebaseInitialized = false;

try {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is missing!");
  }

  // Base64 decode 
  const decodedString = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf-8');
  const serviceAccount = JSON.parse(decodedString);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  firebaseInitialized = true;
  console.log("Firebase Admin initialized successfully from Base64 env variable!");
} catch (error) {
  console.error("Firebase Admin initialization failed:", error.message);
}





// MongoDB Connection (Vercel-friendly with caching)
const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.ke7g9qv.mongodb.net/?retryWrites=true&w=majority`;

let cachedClient = null;

async function connectToMongo() {
  if (cachedClient && cachedClient.topology && cachedClient.topology.isConnected()) {
    return cachedClient;
  }

  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  await client.connect();
  cachedClient = client;
  console.log("MongoDB connected successfully!");
  return client;
}

// Middleware: Verify Firebase Token
const verifyFirebaseToken = async (req, res, next) => {
  if (!firebaseInitialized) {
    return res.status(500).send({ message: "Server configuration error: Firebase not initialized" });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).send({ message: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    console.error("Token verification failed:", error.message);
    return res.status(401).send({ message: "Invalid or expired token" });
  }
};

// Basic Route
app.get("/", (req, res) => {
  res.send("Hello FinEase Server! Running on Vercel");
});

// Main Routes 
async function setupRoutes() {
  try {
    const client = await connectToMongo();
    const db = client.db("financeDB");
    const transactionCollection = db.collection("main-data");

    // GET all transactions for user
    app.get("/my-transaction", verifyFirebaseToken, async (req, res) => {
      try {
        const { email } = req.query;
        if (!email) return res.status(400).send({ message: "Email query parameter required" });
        if (email !== req.user.email) return res.status(403).send({ message: "Forbidden: Email mismatch" });

        const transactions = await transactionCollection
          .find({ email })
          .sort({ date: -1 })
          .toArray();

        res.send(transactions);
      } catch (error) {
        console.error("Error fetching transactions:", error);
        res.status(500).send({ message: "Failed to fetch transactions" });
      }
    });

    // GET single transaction by ID
    app.get("/my-transaction/:id", verifyFirebaseToken, async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid transaction ID" });

        const transaction = await transactionCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!transaction) return res.status(404).send({ message: "Transaction not found" });
        res.send(transaction);
      } catch (error) {
        console.error("Error fetching transaction:", error);
        res.status(500).send({ message: "Failed to fetch transaction" });
      }
    });

    // CREATE new transaction
    app.post("/my-transaction", verifyFirebaseToken, async (req, res) => {
      try {
        const data = req.body;
        if (!data || Object.keys(data).length === 0) {
          return res.status(400).send({ message: "Transaction data required" });
        }

        data.email = req.user.email;
        data.createdAt = new Date();

        const result = await transactionCollection.insertOne(data);
        res.send({
          acknowledged: result.acknowledged,
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Error creating transaction:", error);
        res.status(500).send({ message: "Failed to create transaction" });
      }
    });

    // UPDATE transaction
    app.put("/my-transaction/:id", verifyFirebaseToken, async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid transaction ID" });

        const updateData = req.body;
        delete updateData._id; 
        delete updateData.email; 

        const result = await transactionCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { ...updateData, updatedAt: new Date() } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "Transaction not found" });
        }

        res.send(result);
      } catch (error) {
        console.error("Error updating transaction:", error);
        res.status(500).send({ message: "Failed to update transaction" });
      }
    });

    // DELETE transaction
    app.delete("/my-transaction/:id", verifyFirebaseToken, async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid transaction ID" });

        const result = await transactionCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Transaction not found" });
        }

        res.send({ deletedCount: result.deletedCount });
      } catch (error) {
        console.error("Error deleting transaction:", error);
        res.status(500).send({ message: "Failed to delete transaction" });
      }
    });
  } catch (error) {
    console.error("Critical error during setup:", error);
  }
}

setupRoutes();

// Vercel Serverless Function Export
module.exports = app;

// app.listen(port, ()=>{
//   console.log("server is runnig ; ",port);
// })