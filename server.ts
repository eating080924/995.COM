import express from "express";
import path from "path";
import fs from "fs";
import { createProxyMiddleware } from "http-proxy-middleware";
import admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import webpush from "web-push";

// Load Firebase configuration safely
let firebaseConfig: any = null;
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } else {
    console.warn("firebase-applet-config.json not found at", configPath);
  }
} catch (err) {
  console.error("Failed to parse firebase-applet-config.json:", err);
}

let db: any = null;
let vapidKeys = { publicKey: "", privateKey: "" };
let localSubscriptionsFallback: Array<{ userId: string; subscription: any }> = [];

try {
  if (firebaseConfig && firebaseConfig.projectId) {
    admin.initializeApp({
      projectId: firebaseConfig.projectId,
    });
  } else {
    // Fallback: Cloud Run environments provide Application Default Credentials and project environment context
    admin.initializeApp();
  }
  db = getFirestore("db995com");
  console.log("Firebase Admin initialized successfully with database db995com.");
} catch (error) {
  console.warn("Firebase Admin initialization failed or credentials not found. Using local in-memory fallback for push notifications:", error);
}

async function initVapid() {
  if (db) {
    try {
      const docRef = db.collection("config").doc("vapid");
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        const data = docSnap.data();
        if (data && data.publicKey && data.privateKey) {
          vapidKeys = {
            publicKey: data.publicKey,
            privateKey: data.privateKey,
          };
          console.log("VAPID keys loaded from Firestore.");
        } else {
          throw new Error("VAPID document lacks key fields");
        }
      } else {
        const keys = webpush.generateVAPIDKeys();
        await docRef.set({
          publicKey: keys.publicKey,
          privateKey: keys.privateKey,
          createdAt: FieldValue.serverTimestamp(),
        });
        vapidKeys = keys;
        console.log("New VAPID keys generated and stored in Firestore.");
      }
    } catch (e) {
      console.error("Failed to load/store VAPID keys in Firestore, using memory fallback:", e);
      vapidKeys = webpush.generateVAPIDKeys();
    }
  } else {
    vapidKeys = webpush.generateVAPIDKeys();
    console.log("Using generated transient VAPID keys (in-memory only).");
  }

  try {
    webpush.setVapidDetails(
      "mailto:eating080924@gmail.com",
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );
  } catch (e) {
    console.error("Failed to set VAPID details for web-push:", e);
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Middleware to parse incoming JSON payloads
  app.use(express.json());

  // Initialize VAPID Keys
  await initVapid();

  // Proxy Firebase Auth endpoints to bypass Safari/iOS Chrome third-party cookie restrictions (ITP)
  app.use(
    "/__/auth",
    (req, res, next) => {
      // Restore the /__/auth prefix because Express app.use("/__/auth") stripped it,
      // but http-proxy-middleware needs the full path to forward correctly.
      req.url = req.originalUrl;

      // Strip headers that confuse Firebase Hosting routing
      delete req.headers["x-forwarded-host"];
      delete req.headers["x-forwarded-proto"];
      delete req.headers["x-forwarded-for"];
      delete req.headers["forwarded"];
      delete req.headers["via"];
      next();
    },
    createProxyMiddleware({
      target: "https://com-515d4.firebaseapp.com",
      changeOrigin: true,
      xfwd: false,
    })
  );

  // Web Push API Endpoints
  app.get("/api/vapid-public-key", (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
  });

  app.post("/api/subscribe-push", async (req, res) => {
    const { userId, subscription } = req.body;
    if (!userId || !subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "Missing userId or subscription details" });
    }

    if (!db) {
      // Resilient fallback to local in-memory storage if Firebase Admin lacks credentials in local dev
      // Remove any duplicate endpoints for this user first
      localSubscriptionsFallback = localSubscriptionsFallback.filter(
        (s) => !(s.userId === userId && s.subscription.endpoint === subscription.endpoint)
      );
      localSubscriptionsFallback.push({ userId, subscription });
      if (localSubscriptionsFallback.length > 200) {
        localSubscriptionsFallback.shift(); // Prevent memory unbounded growth
      }
      return res.status(200).json({ success: true, message: "Subscription registered in fallback memory cache" });
    }

    try {
      // Create a unique document ID by hashing the endpoint URL to prevent duplicate records
      const endpointHash = Buffer.from(subscription.endpoint).toString("base64url").slice(-100);
      const docId = `${userId}_${endpointHash}`;

      await db.collection("push_subscriptions").doc(docId).set({
        userId,
        subscription,
        updatedAt: FieldValue.serverTimestamp(),
      });

      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error("Error saving push subscription:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/send-push", async (req, res) => {
    const { userId, type, taskId, taskNum, taskContent, senderId, senderName } = req.body;
    if (!userId || !type || !taskNum || !taskContent || !senderName) {
      return res.status(400).json({ error: "Missing required notification details" });
    }

    try {
      let subscriptions: Array<{ id: string; subscription: any; delete: () => Promise<void> }> = [];

      if (db) {
        const subsSnap = await db
          .collection("push_subscriptions")
          .where("userId", "==", userId)
          .get();

        subscriptions = subsSnap.docs.map((doc) => ({
          id: doc.id,
          subscription: doc.data().subscription,
          delete: async () => {
            await doc.ref.delete();
          },
        }));
      } else {
        // Retrieve from in-memory fallback list
        subscriptions = localSubscriptionsFallback
          .filter((s) => s.userId === userId)
          .map((s, index) => ({
            id: `local_${index}`,
            subscription: s.subscription,
            delete: async () => {
              localSubscriptionsFallback = localSubscriptionsFallback.filter(
                (item) => item.subscription.endpoint !== s.subscription.endpoint
              );
            },
          }));
      }

      if (subscriptions.length === 0) {
        return res.status(200).json({ success: true, message: "No active push subscriptions found" });
      }

      // Build personalized localization messages
      let title = "任務進度更新 🚀";
      let body = `任務 [${taskNum}] ${taskContent.slice(0, 30)}... \n異動者: ${senderName}`;

      if (type === "task_accepted") {
        title = "任務已被承接 🚀";
        body = `您的委託任務 [${taskNum}] 已被 ${senderName} 承接，請留意後續進度。`;
      } else if (type === "task_unaccepted") {
        title = "任務取消承接 ⚠️";
        body = `承接人 ${senderName} 取消承接您的委託任務 [${taskNum}]，任務已重新開放。`;
      } else if (type === "task_completed") {
        title = "委託完成結案 🎉";
        body = `您承接的委託任務 [${taskNum}] 已由委託人 ${senderName} 審核完成並結案！`;
      }

      const payload = {
        title,
        body,
        url: "/",
      };

      const sendPromises = subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
        } catch (err: any) {
          // If the push service returns 404 or 410, the device's subscription is stale/expired, delete it!
          if (err.statusCode === 410 || err.statusCode === 404) {
            console.log(`Deleting stale subscription: ${sub.id}`);
            await sub.delete();
          } else {
            console.error(`Error sending Web Push to subscription ${sub.id}:`, err);
          }
        }
      });

      await Promise.all(sendPromises);
      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error("Error in send-push API execution:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Explicit route for ads.txt to guarantee AdSense crawler reliability and bypass cold start static resolution quirks
  app.get("/ads.txt", (req, res) => {
    res.set("Content-Type", "text/plain");
    res.send("google.com, pub-6474295952980654, DIRECT, f08c47fec0942fa0\n");
  });

  // In production, serve build artifacts. Otherwise, plug in Vite middleware
  if (process.env.NODE_ENV !== "production") {
    // Dynamically import Vite to avoid loading it in production (where it might trigger ERR_REQUIRE_ESM)
    const viteModule = await (Function("return import(\"vite\")")() as Promise<typeof import("vite")>);
    const vite = await viteModule.createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
