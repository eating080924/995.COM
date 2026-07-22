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

let vapidKeys = { publicKey: "", privateKey: "" };
let localSubscriptionsFallback: Array<{ userId: string; subscription: any }> = [];

const PROJECT_ID = firebaseConfig?.projectId || "com-515d4";
const DATABASE_ID = firebaseConfig?.firestoreDatabaseId || "db995com";
const FIREBASE_API_KEY = firebaseConfig?.apiKey || "AIzaSyClrfh8Z4TE98tmBmMKCj_HkV-Pf_NOzFE";

// Convert flat JS object to Firestore REST fields helper
function toFirestoreFields(obj: any): any {
  const fields: any = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined) continue;
    if (typeof val === "string") {
      fields[key] = { stringValue: val };
    } else if (typeof val === "number") {
      fields[key] = { doubleValue: val };
    } else if (typeof val === "boolean") {
      fields[key] = { booleanValue: val };
    } else if (val && typeof val === "object") {
      if (Array.isArray(val)) {
        fields[key] = {
          arrayValue: {
            values: val.map(item => {
              if (typeof item === "string") return { stringValue: item };
              if (typeof item === "number") return { doubleValue: item };
              if (typeof item === "boolean") return { booleanValue: item };
              return { mapValue: { fields: toFirestoreFields(item) } };
            })
          }
        };
      } else {
        fields[key] = { mapValue: { fields: toFirestoreFields(val) } };
      }
    }
  }
  return fields;
}

// Convert Firestore REST fields helper to flat JS object
function fromFirestoreFields(fields: any): any {
  if (!fields) return {};
  const obj: any = {};
  for (const [key, valueObj] of Object.entries(fields)) {
    const vo = valueObj as any;
    if (vo === null || vo === undefined) continue;
    if ("stringValue" in vo) {
      obj[key] = vo.stringValue;
    } else if ("doubleValue" in vo) {
      obj[key] = Number(vo.doubleValue);
    } else if ("integerValue" in vo) {
      obj[key] = Number(vo.integerValue);
    } else if ("booleanValue" in vo) {
      obj[key] = vo.booleanValue;
    } else if ("mapValue" in vo) {
      obj[key] = fromFirestoreFields(vo.mapValue.fields);
    } else if ("arrayValue" in vo) {
      const vals = vo.arrayValue.values || [];
      obj[key] = vals.map((v: any) => {
        if ("stringValue" in v) return v.stringValue;
        if ("doubleValue" in v) return Number(v.doubleValue);
        if ("integerValue" in v) return Number(v.integerValue);
        if ("booleanValue" in v) return v.booleanValue;
        if ("mapValue" in v) return fromFirestoreFields(v.mapValue.fields);
        return v;
      });
    }
  }
  return obj;
}

async function fetchFromFirestore(collection: string, docId: string) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/${collection}/${docId}?key=${FIREBASE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Firestore REST API returned ${res.status}: ${await res.text()}`);
  }
  return await res.json();
}

async function writeToFirestore(collection: string, docId: string, fields: any) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/${collection}/${docId}?key=${FIREBASE_API_KEY}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    throw new Error(`Firestore REST API write returned ${res.status}: ${await res.text()}`);
  }
  return await res.json();
}

async function initVapid() {
  try {
    const docData = await fetchFromFirestore("config", "vapid");
    if (docData && docData.fields) {
      const flat = fromFirestoreFields(docData.fields);
      if (flat.publicKey && flat.privateKey) {
        vapidKeys = {
          publicKey: flat.publicKey,
          privateKey: flat.privateKey,
        };
        console.log("VAPID keys loaded from Firestore via REST API.");
      }
    } else {
      // Generate new VAPID keys
      const keys = webpush.generateVAPIDKeys();
      await writeToFirestore("config", "vapid", toFirestoreFields({
        publicKey: keys.publicKey,
        privateKey: keys.privateKey,
        createdAt: new Date().toISOString(),
      }));
      vapidKeys = keys;
      console.log("New VAPID keys generated and stored in Firestore via REST API.");
    }
  } catch (e) {
    console.error("Failed to load/store VAPID keys in Firestore via REST, using memory fallback:", e);
    vapidKeys = webpush.generateVAPIDKeys();
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

    const saveToMemoryFallback = () => {
      localSubscriptionsFallback = localSubscriptionsFallback.filter(
        (s) => !(s.userId === userId && s.subscription.endpoint === subscription.endpoint)
      );
      localSubscriptionsFallback.push({ userId, subscription });
      if (localSubscriptionsFallback.length > 200) {
        localSubscriptionsFallback.shift(); // Prevent memory unbounded growth
      }
    };

    try {
      // Create a unique document ID by hashing the endpoint URL to prevent duplicate records
      const endpointHash = Buffer.from(subscription.endpoint).toString("base64url").slice(-100);
      const docId = `${userId}_${endpointHash}`;

      await writeToFirestore("push_subscriptions", docId, toFirestoreFields({
        userId,
        subscription,
        updatedAt: new Date().toISOString(),
      }));

      res.status(200).json({ success: true });
    } catch (error: any) {
      console.warn("Error saving push subscription via REST, falling back to memory:", error);
      saveToMemoryFallback();
      res.status(200).json({ success: true, message: "Subscription registered in in-memory fallback cache" });
    }
  });

  app.post("/api/send-push", async (req, res) => {
    const { userId, type, taskId, taskNum, taskContent, senderId, senderName } = req.body;
    if (!userId || !type) {
      return res.status(400).json({ error: "Missing required notification details: userId and type are mandatory" });
    }

    const safeTaskNum = taskNum || "N/A";
    const safeTaskContent = taskContent || "";
    const safeSenderName = senderName || "平台用戶";

    try {
      let subscriptions: Array<{ id: string; subscription: any; delete: () => Promise<void> }> = [];

      try {
        const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents:runQuery?key=${FIREBASE_API_KEY}`;
        const queryBody = {
          structuredQuery: {
            from: [{ collectionId: "push_subscriptions" }],
            where: {
              fieldFilter: {
                field: { fieldPath: "userId" },
                op: "EQUAL",
                value: { stringValue: userId }
              }
            }
          }
        };

        const queryRes = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(queryBody),
        });

        if (queryRes.ok) {
          const results = await queryRes.json();
          for (const r of results) {
            if (r.document && r.document.fields) {
              const flat = fromFirestoreFields(r.document.fields);
              const docPath = r.document.name;
              const docId = docPath.substring(docPath.lastIndexOf("/") + 1);

              subscriptions.push({
                id: docId,
                subscription: flat.subscription,
                delete: async () => {
                  try {
                    const delUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/push_subscriptions/${docId}?key=${FIREBASE_API_KEY}`;
                    await fetch(delUrl, { method: "DELETE" });
                  } catch (delErr) {
                    console.warn(`Could not delete stale subscription via REST API:`, delErr);
                  }
                }
              });
            }
          }
        } else {
          console.warn("Firestore REST query failed, trying memory fallback:", await queryRes.text());
        }
      } catch (restErr) {
        console.warn("Firestore REST connection error, trying memory fallback:", restErr);
      }

      // Add subscriptions from local fallback cache if we have them
      const localMatches = localSubscriptionsFallback.filter((s) => s.userId === userId);
      for (let i = 0; i < localMatches.length; i++) {
        const s = localMatches[i];
        if (!subscriptions.some(existing => existing.subscription.endpoint === s.subscription.endpoint)) {
          subscriptions.push({
            id: `local_${i}`,
            subscription: s.subscription,
            delete: async () => {
              localSubscriptionsFallback = localSubscriptionsFallback.filter(
                (item) => item.subscription.endpoint !== s.subscription.endpoint
              );
            }
          });
        }
      }

      if (subscriptions.length === 0) {
        return res.status(200).json({ success: true, message: "No active push subscriptions found" });
      }

      // Build personalized localization messages matching NotificationDropdown.tsx
      let title = "任務進度更新 🚀";
      let body = `任務 [${safeTaskNum}] ${safeTaskContent.slice(0, 30)}... \n異動者: ${safeSenderName}`;

      if (safeTaskContent.includes("已回報與您取得聯繫") || safeTaskContent.includes("已回報主動聯繫") || safeTaskContent.includes("主動聯繫委託人")) {
        title = "承接者已回報主動聯繫 📞";
        body = `承接超人 ${safeSenderName} 已回報主動與您取得聯繫，任務正式啟動。`;
      } else if (safeTaskContent.includes("已回報「任務已完成」") || safeTaskContent.includes("已回報任務完成") || safeTaskContent.includes("已回報完工")) {
        title = "承接者已回報任務完工 🏁";
        body = `超人 ${safeSenderName} 已回報「任務已完成」，請前往確認並進行驗收結案。`;
      } else if (safeTaskContent.includes("您已向承接者提出") || safeTaskContent.includes("已向承接者提出")) {
        title = "已向承接者提出「完工異議」 ⚖️";
        body = `您已對任務 [${safeTaskNum}] 提出【完工異議】，請與承接者保持聯繫、友好協商。`;
      } else if (safeTaskContent.includes("完工異議") || safeTaskContent.includes("提出異議")) {
        title = "委託者已提出「完工異議」 ⚠️";
        body = `委託人 ${safeSenderName} 對任務 [${safeTaskNum}] 提出【完工異議】，請主動聯繫委託人進行協商。`;
      } else if (type === "task_accepted") {
        title = "任務被承接 🚀";
        body = `您的委託任務 [${safeTaskNum}] 已被 ${safeSenderName} 承接，請留意後續進度。`;
      } else if (type === "task_unaccepted") {
        title = "任務取消承接 ⚠️";
        body = `承接人 ${safeSenderName} 取消承接您的委託任務 [${safeTaskNum}]，任務已重新開放。`;
      } else if (type === "task_completed") {
        title = "委託完成結案 🎉";
        body = `您承接的委託任務 [${safeTaskNum}] 已由委託人 ${safeSenderName} 審核完成並結案！`;
      } else if (type === "agent_invite") {
        title = "任務委託邀請 💌";
        body = `案主 ${safeSenderName} 向您發出了專屬委託邀請！請點擊查看。`;
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

  app.post("/api/send-matching-push", async (req, res) => {
    const { userIds, category, region, taskNum, taskContent, senderId, senderName } = req.body;
    if (!category || !region || !taskNum) {
      return res.status(400).json({ error: "Missing required details: category, region, and taskNum are mandatory" });
    }

    const safeTaskContent = taskContent || "";
    const safeSenderName = senderName || "平台用戶";

    const userIdsArray = Array.isArray(userIds) ? userIds : [];
    if (userIdsArray.length === 0) {
      return res.status(200).json({ success: true, message: "No matched users found" });
    }

    try {
      const matchedUserIds = new Set<string>(userIdsArray);
      const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents:runQuery?key=${FIREBASE_API_KEY}`;

      // Fetch push subscriptions for all matched users
      const uidsArray = Array.from(matchedUserIds);
      const chunkSize = 30;
      const fetchSubscriptionPromises = [];

      for (let i = 0; i < uidsArray.length; i += chunkSize) {
        const chunk = uidsArray.slice(i, i + chunkSize);
        const querySubBody = {
          structuredQuery: {
            from: [{ collectionId: "push_subscriptions" }],
            where: {
              fieldFilter: {
                field: { fieldPath: "userId" },
                op: "IN",
                value: {
                  arrayValue: {
                    values: chunk.map(uid => ({ stringValue: uid }))
                  }
                }
              }
            }
          }
        };

        fetchSubscriptionPromises.push(
          fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(querySubBody),
          }).then(r => r.ok ? r.json() : [])
        );
      }

      const subResultsArray = await Promise.all(fetchSubscriptionPromises);

      const subscriptions: Array<{ id: string; subscription: any; delete: () => Promise<void> }> = [];
      for (const results of subResultsArray) {
        if (Array.isArray(results)) {
          for (const r of results) {
            if (r.document && r.document.fields) {
              const flat = fromFirestoreFields(r.document.fields);
              const docPath = r.document.name;
              const docId = docPath.substring(docPath.lastIndexOf("/") + 1);

              // Avoid duplicate subscriptions
              if (!subscriptions.some(existing => existing.subscription.endpoint === flat.subscription.endpoint)) {
                subscriptions.push({
                  id: docId,
                  subscription: flat.subscription,
                  delete: async () => {
                    try {
                      const delUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/push_subscriptions/${docId}?key=${FIREBASE_API_KEY}`;
                      await fetch(delUrl, { method: "DELETE" });
                    } catch (delErr) {
                      console.warn(`Could not delete stale subscription via REST API:`, delErr);
                    }
                  }
                });
              }
            }
          }
        }
      }

      // Add subscriptions from local fallback cache if we have them
      const localMatches = localSubscriptionsFallback.filter((s) => matchedUserIds.has(s.userId));
      for (let i = 0; i < localMatches.length; i++) {
        const s = localMatches[i];
        if (!subscriptions.some(existing => existing.subscription.endpoint === s.subscription.endpoint)) {
          subscriptions.push({
            id: `local_${i}`,
            subscription: s.subscription,
            delete: async () => {
              localSubscriptionsFallback = localSubscriptionsFallback.filter(
                (item) => item.subscription.endpoint !== s.subscription.endpoint
              );
            }
          });
        }
      }

      if (subscriptions.length === 0) {
        return res.status(200).json({ success: true, message: "Matched users found, but they have no push subscriptions" });
      }

      // Send the match notifications
      const title = "任務推薦 🎯 符合您的偏好設定！";
      const body = `「${category}」於「${region}」有新發布任務：\n${safeTaskContent.slice(0, 30)}${safeTaskContent.length > 30 ? "..." : ""}\n發布人: ${safeSenderName}`;

      const payload = {
        title,
        body,
        url: "/",
      };

      const sendPromises = subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            console.log(`Deleting stale subscription: ${sub.id}`);
            await sub.delete();
          } else {
            console.error(`Error sending Match Web Push to subscription ${sub.id}:`, err);
          }
        }
      });

      await Promise.all(sendPromises);
      res.status(200).json({ success: true, matchedCount: matchedUserIds.size, notifiedCount: subscriptions.length });
    } catch (error: any) {
      console.error("Error in send-matching-push API execution:", error);
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
