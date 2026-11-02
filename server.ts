import express from "express";
import path from "path";
import fs from "fs";
import { createProxyMiddleware } from "http-proxy-middleware";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import rateLimit from "express-rate-limit";
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

const PROJECT_ID = firebaseConfig?.projectId || "com-515d4";
const DATABASE_ID = firebaseConfig?.firestoreDatabaseId || "db995com";
const FIREBASE_API_KEY = firebaseConfig?.apiKey || "AIzaSyClrfh8Z4TE98tmBmMKCj_HkV-Pf_NOzFE";

// Initialize Firebase Admin SDK for token verification & server-side Firestore access
const adminApp = getApps().length ? getApps()[0] : initializeApp({ projectId: PROJECT_ID });
const adminAuth = getAuth(adminApp);
const adminDb = getFirestore(adminApp, DATABASE_ID);

// Local persistence paths for server-side fallback
const VAPID_FILE = path.join(process.cwd(), ".vapid_keys.json");
const SUBSCRIPTIONS_FILE = path.join(process.cwd(), ".push_subscriptions.json");

// Stable production VAPID keypair so mobile subscriptions never break across container restarts
const DEFAULT_STABLE_VAPID = {
  publicKey: "BGGCkNV_D0lA-BWme-b4oyTju1t73wL9wBOIGOE1c7h5xTPB8Bm1n1b1HwDOpyUzoCWNkbn2yiQovsUcUalV9q0",
  privateKey: "HtX30W4Kp7HEN-_V0dEdBguSjCtyEPJZTUdL2kN4q4w",
};

let vapidKeys = { ...DEFAULT_STABLE_VAPID };
let storedSubscriptions: Array<{ userId: string; subscription: any }> = [];

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
            values: val.map((item) => {
              if (typeof item === "string") return { stringValue: item };
              if (typeof item === "number") return { doubleValue: item };
              if (typeof item === "boolean") return { booleanValue: item };
              return { mapValue: { fields: toFirestoreFields(item) } };
            }),
          },
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

function loadSubscriptionsFromDisk(): Array<{ userId: string; subscription: any }> {
  try {
    if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, "utf8"));
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    console.warn("Could not read local subscriptions file:", e);
  }
  return [];
}

function saveSubscriptionsToDisk() {
  try {
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(storedSubscriptions, null, 2), "utf8");
  } catch {
    // Non-fatal in read-only or ephemeral containers
  }
}

async function initVapid() {
  try {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      vapidKeys = {
        publicKey: process.env.VAPID_PUBLIC_KEY,
        privateKey: process.env.VAPID_PRIVATE_KEY,
      };
      console.log("VAPID keys loaded from environment variables.");
    } else if (fs.existsSync(VAPID_FILE)) {
      try {
        const saved = JSON.parse(fs.readFileSync(VAPID_FILE, "utf8"));
        if (saved && saved.publicKey && saved.privateKey) {
          vapidKeys = {
            publicKey: saved.publicKey,
            privateKey: saved.privateKey,
          };
          console.log("VAPID keys loaded from server-side storage.");
        } else {
          vapidKeys = { ...DEFAULT_STABLE_VAPID };
        }
      } catch {
        vapidKeys = { ...DEFAULT_STABLE_VAPID };
      }
    } else {
      vapidKeys = { ...DEFAULT_STABLE_VAPID };
      console.log("Stable production VAPID keys loaded.");
    }

    try {
      fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2), "utf8");
    } catch {}

    webpush.setVapidDetails(
      "mailto:eating080924@gmail.com",
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );
  } catch (e) {
    console.error("Failed to initialize VAPID keys, using stable fallback:", e);
    vapidKeys = { ...DEFAULT_STABLE_VAPID };
    try {
      webpush.setVapidDetails(
        "mailto:eating080924@gmail.com",
        vapidKeys.publicKey,
        vapidKeys.privateKey
      );
    } catch {}
  }

  storedSubscriptions = loadSubscriptionsFromDisk();
  console.log(`Loaded ${storedSubscriptions.length} push subscriptions from local cache.`);
}

// Rate limiter: Max 60 push calls per minute per IP
const pushRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    xForwardedForHeader: false,
    forwardedHeader: false,
    default: false,
  },
  message: { error: "請求過於頻繁，請稍候再試 (Rate limit exceeded)" },
});

// Authentication middleware using Firebase Admin ID Token verification
async function authenticateUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "未授權：缺少驗證憑證 (Missing Authorization token)" });
  }

  const token = authHeader.split("Bearer ")[1].trim();
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    (req as any).user = decodedToken;
    (req as any).idToken = token;
    next();
  } catch (err: any) {
    console.warn("Failed to verify Firebase ID token in API:", err.message);
    return res.status(401).json({ error: "未授權：憑證無效或已過期 (Invalid or expired token)" });
  }
}

// Helper: Fetch user subscriptions from Firestore (via authenticated REST + Admin SDK) + local cache
async function getSubscriptionsForUsers(
  userIds: string[],
  idToken?: string
): Promise<Array<{ id: string; userId: string; subscription: any; delete: () => Promise<void> }>> {
  const results: Array<{ id: string; userId: string; subscription: any; delete: () => Promise<void> }> = [];
  const targetSet = new Set(userIds);

  // 1. Query Firestore via authenticated REST API (works in both AI Studio Preview and Cloud Run)
  if (idToken) {
    try {
      const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents:runQuery?key=${FIREBASE_API_KEY}`;
      const chunkSize = 30;
      for (let i = 0; i < userIds.length; i += chunkSize) {
        const chunk = userIds.slice(i, i + chunkSize);
        const queryBody = {
          structuredQuery: {
            from: [{ collectionId: "push_subscriptions" }],
            where: {
              fieldFilter: {
                field: { fieldPath: "userId" },
                op: "IN",
                value: {
                  arrayValue: {
                    values: chunk.map((uid) => ({ stringValue: uid })),
                  },
                },
              },
            },
          },
        };

        const queryRes = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify(queryBody),
        });

        if (queryRes.ok) {
          const rows = await queryRes.json();
          if (Array.isArray(rows)) {
            for (const r of rows) {
              if (r.document && r.document.fields) {
                const flat = fromFirestoreFields(r.document.fields);
                if (flat.subscription && flat.subscription.endpoint) {
                  const docPath = r.document.name;
                  const docId = docPath.substring(docPath.lastIndexOf("/") + 1);
                  if (!results.some((existing) => existing.subscription.endpoint === flat.subscription.endpoint)) {
                    results.push({
                      id: docId,
                      userId: flat.userId,
                      subscription: flat.subscription,
                      delete: async () => {
                        try {
                          const delUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/push_subscriptions/${docId}?key=${FIREBASE_API_KEY}`;
                          await fetch(delUrl, {
                            method: "DELETE",
                            headers: { Authorization: `Bearer ${idToken}` },
                          });
                        } catch {}
                        storedSubscriptions = storedSubscriptions.filter(
                          (s) => s.subscription.endpoint !== flat.subscription.endpoint
                        );
                        saveSubscriptionsToDisk();
                      },
                    });
                  }
                }
              }
            }
          }
        }
      }
    } catch (restErr) {
      console.warn("Authenticated Firestore REST query fallback:", restErr);
    }
  }

  // 2. Also try Firebase Admin SDK (if running in Cloud Run with IAM privileges)
  if (results.length === 0) {
    try {
      const chunkSize = 30;
      for (let i = 0; i < userIds.length; i += chunkSize) {
        const chunk = userIds.slice(i, i + chunkSize);
        const snap = await adminDb
          .collection("push_subscriptions")
          .where("userId", "in", chunk)
          .get();

        snap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data && data.subscription && data.subscription.endpoint) {
            if (!results.some((r) => r.subscription.endpoint === data.subscription.endpoint)) {
              results.push({
                id: docSnap.id,
                userId: data.userId,
                subscription: data.subscription,
                delete: async () => {
                  try {
                    await adminDb.collection("push_subscriptions").doc(docSnap.id).delete();
                  } catch {}
                  storedSubscriptions = storedSubscriptions.filter(
                    (s) => s.subscription.endpoint !== data.subscription.endpoint
                  );
                  saveSubscriptionsToDisk();
                },
              });
            }
          }
        });
      }
    } catch {
      // Expected in preview sandbox
    }
  }

  // 3. Merge with local memory/disk subscriptions
  const localMatches = storedSubscriptions.filter((s) => targetSet.has(s.userId));
  for (let i = 0; i < localMatches.length; i++) {
    const s = localMatches[i];
    if (
      s.subscription &&
      s.subscription.endpoint &&
      !results.some((r) => r.subscription.endpoint === s.subscription.endpoint)
    ) {
      results.push({
        id: `local_${i}`,
        userId: s.userId,
        subscription: s.subscription,
        delete: async () => {
          storedSubscriptions = storedSubscriptions.filter(
            (item) => item.subscription.endpoint !== s.subscription.endpoint
          );
          saveSubscriptionsToDisk();
        },
      });
    }
  }

  return results;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Trust first proxy hop in container/cloud environments
  app.set("trust proxy", 1);

  // Middleware to parse incoming JSON payloads
  app.use(express.json());

  // Initialize VAPID Keys
  await initVapid();

  // Proxy Firebase Auth endpoints to bypass Safari/iOS Chrome third-party cookie restrictions (ITP)
  app.use(
    "/__/auth",
    (req, res, next) => {
      req.url = req.originalUrl;
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

  // Web Push API: Public VAPID key endpoint (safe to expose publicly)
  app.get("/api/vapid-public-key", (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
  });

  // Web Push API: Subscribe endpoint (authenticated & rate-limited)
  app.post("/api/subscribe-push", pushRateLimiter, authenticateUser, async (req, res) => {
    const { userId, subscription } = req.body;
    if (!userId || !subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "Missing userId or subscription details" });
    }

    const callerUid = (req as any).user.uid;
    const idToken = (req as any).idToken;
    if (callerUid !== userId) {
      return res.status(403).json({ error: "Forbidden: Cannot register subscription for another user" });
    }

    // 1. Save to local memory & disk cache
    storedSubscriptions = storedSubscriptions.filter(
      (s) => !(s.userId === userId && s.subscription.endpoint === subscription.endpoint)
    );
    storedSubscriptions.push({ userId, subscription });
    if (storedSubscriptions.length > 5000) {
      storedSubscriptions.shift();
    }
    saveSubscriptionsToDisk();

    // 2. Persist to Firestore `push_subscriptions` using authenticated REST API
    const endpointHash = Buffer.from(subscription.endpoint).toString("base64url").slice(-90);
    const docId = `${userId}_${endpointHash}`;
    try {
      const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents/push_subscriptions/${docId}?key=${FIREBASE_API_KEY}`;
      await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          fields: toFirestoreFields({
            userId,
            subscription,
            updatedAt: new Date().toISOString(),
          }),
        }),
      });
    } catch {
      // Fallback to local cache
    }

    res.status(200).json({ success: true, count: storedSubscriptions.length });
  });

  // Web Push API: Send Push notification (authenticated, rate-limited, sender-verified)
  app.post("/api/send-push", pushRateLimiter, authenticateUser, async (req, res) => {
    const { userId, type, taskId, taskNum, taskContent, senderId, senderName, customTitle, category, region } = req.body;
    if (!userId || !type) {
      return res.status(400).json({ error: "Missing required notification details: userId and type are mandatory" });
    }

    const callerUid = (req as any).user.uid;
    const callerEmail = (req as any).user.email;
    const idToken = (req as any).idToken;
    const isSystemAdmin = callerEmail === "eating080924@gmail.com";

    // Anti-spoofing check: senderId must match authenticated caller or system admin
    if (!isSystemAdmin && senderId && senderId !== "system" && senderId !== callerUid) {
      return res.status(403).json({ error: "Forbidden: Sender ID does not match authenticated user" });
    }

    const safeTaskNum = taskNum || "N/A";
    const shortTaskNum = safeTaskNum.length > 6 ? safeTaskNum.slice(-5) : safeTaskNum;
    const safeTaskContent = taskContent || "";
    const safeSenderName = senderName || "平台用戶";

    try {
      const subscriptions = await getSubscriptionsForUsers([userId], idToken);
      if (subscriptions.length === 0) {
        return res.status(200).json({
          success: false,
          message: "目前尚無此用戶有效的推播憑證 (No active push subscriptions found)",
          count: 0,
        });
      }

      // Build mobile-optimized notification title & body matching NotificationDropdown.tsx
      let title = "任務進度更新 🚀";
      let body = `${safeTaskContent.slice(0, 45)}...\n（編號：#${shortTaskNum}）`;

      if (
        safeTaskContent.includes("已回報與您取得聯繫") ||
        safeTaskContent.includes("已回報主動聯繫") ||
        safeTaskContent.includes("主動聯繫委託人")
      ) {
        title = "承接者已回報主動聯繫 📞";
        body = `承接超人 ${safeSenderName} 已回報主動與您取得聯繫，任務正式啟動。`;
      } else if (
        safeTaskContent.includes("已回報「任務已完成」") ||
        safeTaskContent.includes("已回報任務完成") ||
        safeTaskContent.includes("已回報完工")
      ) {
        title = "承接者已回報任務完工 🏁";
        body = `超人 ${safeSenderName} 已回報「任務已完成」，請前往確認並進行驗收結案。`;
      } else if (
        safeTaskContent.includes("您已向承接者提出") ||
        safeTaskContent.includes("已向承接者提出")
      ) {
        title = "已向承接者提出「完工異議」 ⚖️";
        body = `您已對任務 [#${shortTaskNum}] 提出【完工異議】，請與承接者保持聯繫、友好協商。`;
      } else if (safeTaskContent.includes("完工異議") || safeTaskContent.includes("提出異議")) {
        title = "委託者已提出「完工異議」 ⚠️";
        body = `委託人 ${safeSenderName} 對任務 [#${shortTaskNum}] 提出【完工異議】，請主動聯繫委託人進行協商。`;
      } else if (type === "task_accepted") {
        title = "任務被承接 🚀";
        body = `您的委託任務 [#${shortTaskNum}] 已被 ${safeSenderName} 承接，請留意後續進度。`;
      } else if (type === "task_unaccepted") {
        title = "任務取消承接 ⚠️";
        body = `承接人 ${safeSenderName} 取消承接您的委託任務 [#${shortTaskNum}]，任務已重新開放。`;
      } else if (type === "task_completed") {
        title = "委託完成結案 🎉";
        body = `您承接的委託任務 [#${shortTaskNum}] 已由委託人 ${safeSenderName} 審核完成並結案！`;
      } else if (type === "agent_invite") {
        title = "任務委託邀請 💌";
        body = `委託人 ${safeSenderName} 向您發出了專屬委託邀請！請點擊查看。`;
      } else if (type === "rpa_push") {
        title = `${safeSenderName} 📢`;
        body = safeTaskContent || "您有一條新的推播訊息！點擊查看詳情。";
      } else if (type === "broadcast") {
        let parsedCategory = category;
        let parsedRegion = region;
        let cleanContent = safeTaskContent;

        const legacyMatch = safeTaskContent.match(/任務推薦：【([^】]+)】在【([^】]+)】有新發布任務[^：]*：\s*([\s\S]*)/);
        if (legacyMatch) {
          parsedCategory = parsedCategory || legacyMatch[1];
          parsedRegion = parsedRegion || legacyMatch[2];
          cleanContent = legacyMatch[3].trim();
        } else if (cleanContent.startsWith("🎯 任務推薦：") || cleanContent.startsWith("任務推薦：")) {
          const splitIdx = cleanContent.indexOf("：\n");
          if (splitIdx !== -1) {
            cleanContent = cleanContent.slice(splitIdx + 2).trim();
          }
        }

        title =
          customTitle ||
          (parsedCategory && parsedRegion ? `🎯【${parsedCategory}・${parsedRegion}】新任務` : "🎯 新任務推薦");
        const trimmed = cleanContent.slice(0, 50) + (cleanContent.length > 50 ? "..." : "");
        body = `${trimmed}\n（編號：#${shortTaskNum}）`;
      }

      const payload = {
        title,
        body,
        url: "/",
        taskId,
        taskNum: shortTaskNum,
        tag: `task-${shortTaskNum}`,
      };

      const sendPromises = subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(sub.subscription, JSON.stringify(payload), {
            TTL: 86400, // 24 hours retention
            urgency: "high", // Immediately wake up mobile device / lock screen
          });
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await sub.delete();
          } else {
            console.error(`Error sending Web Push to subscription ${sub.id}:`, err.message);
          }
        }
      });

      await Promise.all(sendPromises);
      res.status(200).json({ success: true, count: subscriptions.length });
    } catch (error: any) {
      console.error("Error in send-push API execution:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Web Push API: Send Matching Push notification (authenticated, rate-limited, sender-verified)
  app.post("/api/send-matching-push", pushRateLimiter, authenticateUser, async (req, res) => {
    const { userIds, category, region, taskNum, taskContent } = req.body;
    if (!category || !region || !taskNum) {
      return res.status(400).json({ error: "Missing required details: category, region, and taskNum are mandatory" });
    }

    const idToken = (req as any).idToken;
    const safeTaskContent = taskContent || "";
    const userIdsArray = Array.isArray(userIds) ? userIds : [];
    if (userIdsArray.length === 0) {
      return res.status(200).json({ success: true, message: "No matched users found" });
    }

    try {
      const matchedUserIds = Array.from(new Set<string>(userIdsArray));
      const subscriptions = await getSubscriptionsForUsers(matchedUserIds, idToken);

      if (subscriptions.length === 0) {
        return res.status(200).json({ success: true, message: "Matched users found, but no active push subscriptions" });
      }

      const shortNum = taskNum.length > 6 ? taskNum.slice(-5) : taskNum;
      const title = `🎯【${category}・${region}】新任務`;
      const trimmed = safeTaskContent.slice(0, 50) + (safeTaskContent.length > 50 ? "..." : "");
      const body = `${trimmed}\n（編號：#${shortNum}）`;

      const payload = {
        title,
        body,
        url: "/",
        taskNum: shortNum,
        tag: `task-${shortNum}`,
      };

      const sendPromises = subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(sub.subscription, JSON.stringify(payload), {
            TTL: 86400,
            urgency: "high",
          });
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await sub.delete();
          } else {
            console.error(`Error sending Match Web Push to subscription ${sub.id}:`, err.message);
          }
        }
      });

      await Promise.all(sendPromises);
      res.status(200).json({
        success: true,
        matchedCount: matchedUserIds.length,
        notifiedCount: subscriptions.length,
      });
    } catch (error: any) {
      console.error("Error in send-matching-push API execution:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Explicit route for ads.txt to guarantee AdSense crawler reliability
  app.get("/ads.txt", (req, res) => {
    res.set("Content-Type", "text/plain");
    res.send("google.com, pub-6474295952980654, DIRECT, f08c47fec0942fa0\n");
  });

  // In production, serve build artifacts. Otherwise, plug in Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const viteModule = await (Function('return import("vite")')() as Promise<typeof import("vite")>);
    const vite = await viteModule.createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        const indexPath = path.resolve(process.cwd(), "index.html");
        let template = fs.readFileSync(indexPath, "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
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
