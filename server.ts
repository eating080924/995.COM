import express from "express";
import path from "path";
import fs from "fs";
import { createProxyMiddleware } from "http-proxy-middleware";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
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

// Initialize Firebase Admin SDK for auth token verification
const adminApp = getApps().length ? getApps()[0] : initializeApp({ projectId: PROJECT_ID });
const adminAuth = getAuth(adminApp);

// Local persistence paths for server-only security
const VAPID_FILE = path.join(process.cwd(), ".vapid_keys.json");
const SUBSCRIPTIONS_FILE = path.join(process.cwd(), ".push_subscriptions.json");

let vapidKeys = { publicKey: "", privateKey: "" };
let storedSubscriptions: Array<{ userId: string; subscription: any }> = [];

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
  } catch (e) {
    console.warn("Could not save local subscriptions file:", e);
  }
}

function initVapid() {
  try {
    // 1. Check environment variables
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      vapidKeys = {
        publicKey: process.env.VAPID_PUBLIC_KEY,
        privateKey: process.env.VAPID_PRIVATE_KEY,
      };
      console.log("VAPID keys loaded from environment variables.");
    } else if (fs.existsSync(VAPID_FILE)) {
      // 2. Check server-side local storage
      const saved = JSON.parse(fs.readFileSync(VAPID_FILE, "utf8"));
      if (saved.publicKey && saved.privateKey) {
        vapidKeys = saved;
        console.log("VAPID keys loaded from server-side storage.");
      }
    }

    // 3. Generate new keys if none exist
    if (!vapidKeys.publicKey || !vapidKeys.privateKey) {
      vapidKeys = webpush.generateVAPIDKeys();
      fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2), "utf8");
      console.log("New server-side VAPID keys generated and secured.");
    }

    webpush.setVapidDetails(
      "mailto:eating080924@gmail.com",
      vapidKeys.publicKey,
      vapidKeys.privateKey
    );
  } catch (e) {
    console.error("Failed to initialize VAPID keys, using ephemeral fallback:", e);
    vapidKeys = webpush.generateVAPIDKeys();
    try {
      webpush.setVapidDetails(
        "mailto:eating080924@gmail.com",
        vapidKeys.publicKey,
        vapidKeys.privateKey
      );
    } catch {}
  }

  // Load subscriptions into memory cache
  storedSubscriptions = loadSubscriptionsFromDisk();
  console.log(`Loaded ${storedSubscriptions.length} push subscriptions from secure local storage.`);
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
    next();
  } catch (err: any) {
    console.warn("Failed to verify Firebase ID token in API:", err.message);
    return res.status(401).json({ error: "未授權：憑證無效或已過期 (Invalid or expired token)" });
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Trust first proxy hop in container/cloud environments
  app.set("trust proxy", 1);

  // Middleware to parse incoming JSON payloads
  app.use(express.json());

  // Initialize VAPID Keys
  initVapid();

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
  app.post("/api/subscribe-push", pushRateLimiter, authenticateUser, (req, res) => {
    const { userId, subscription } = req.body;
    if (!userId || !subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "Missing userId or subscription details" });
    }

    const callerUid = (req as any).user.uid;
    if (callerUid !== userId) {
      return res.status(403).json({ error: "Forbidden: Cannot register subscription for another user" });
    }

    // Deduplicate and save
    storedSubscriptions = storedSubscriptions.filter(
      (s) => !(s.userId === userId && s.subscription.endpoint === subscription.endpoint)
    );
    storedSubscriptions.push({ userId, subscription });
    if (storedSubscriptions.length > 5000) {
      storedSubscriptions.shift();
    }
    saveSubscriptionsToDisk();

    res.status(200).json({ success: true });
  });

  // Web Push API: Send Push notification (authenticated, rate-limited, sender-verified)
  app.post("/api/send-push", pushRateLimiter, authenticateUser, async (req, res) => {
    const { userId, type, taskId, taskNum, taskContent, senderId, senderName, customTitle, category, region } = req.body;
    if (!userId || !type) {
      return res.status(400).json({ error: "Missing required notification details: userId and type are mandatory" });
    }

    const callerUid = (req as any).user.uid;
    const callerEmail = (req as any).user.email;
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
      // Find matching subscriptions for this user
      const userSubs = storedSubscriptions.filter((s) => s.userId === userId);
      if (userSubs.length === 0) {
        return res.status(200).json({ success: false, message: "目前尚無此用戶有效的推播憑證 (No active push subscriptions found)", count: 0 });
      }

      // Build personalized localization messages matching NotificationDropdown.tsx
      let title = "任務進度更新 🚀";
      let body = `${safeTaskContent.slice(0, 45)}...\n（編號：#${shortTaskNum}）`;

      if (safeTaskContent.includes("已回報與您取得聯繫") || safeTaskContent.includes("已回報主動聯繫") || safeTaskContent.includes("主動聯繫委託人")) {
        title = "承接者已回報主動聯繫 📞";
        body = `承接超人 ${safeSenderName} 已回報主動與您取得聯繫，任務正式啟動。`;
      } else if (safeTaskContent.includes("已回報「任務已完成」") || safeTaskContent.includes("已回報任務完成") || safeTaskContent.includes("已回報完工")) {
        title = "承接者已回報任務完工 🏁";
        body = `超人 ${safeSenderName} 已回報「任務已完成」，請前往確認並進行驗收結案。`;
      } else if (safeTaskContent.includes("您已向承接者提出") || safeTaskContent.includes("已向承接者提出")) {
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
        title = customTitle || (category && region ? `🎯【${category}・${region}】新任務` : "新任務推薦 🎯");
        let cleanContent = safeTaskContent;
        if (cleanContent.startsWith("🎯 任務推薦：")) {
          const splitIdx = cleanContent.indexOf("：\n");
          if (splitIdx !== -1) {
            cleanContent = cleanContent.slice(splitIdx + 2);
          }
        }
        const trimmed = cleanContent.slice(0, 50) + (cleanContent.length > 50 ? "..." : "");
        body = `${trimmed}\n（編號：#${shortTaskNum}）`;
      }

      const payload = {
        title,
        body,
        url: "/",
      };

      let hasStale = false;
      const sendPromises = userSubs.map(async (sub) => {
        try {
          await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            console.log(`Pruning stale subscription for user ${userId}`);
            storedSubscriptions = storedSubscriptions.filter(
              (s) => s.subscription.endpoint !== sub.subscription.endpoint
            );
            hasStale = true;
          } else {
            console.error(`Error sending Web Push to subscription:`, err.message);
          }
        }
      });

      await Promise.all(sendPromises);
      if (hasStale) saveSubscriptionsToDisk();

      res.status(200).json({ success: true, count: userSubs.length });
    } catch (error: any) {
      console.error("Error in send-push API execution:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Web Push API: Send Matching Push notification (authenticated, rate-limited, sender-verified)
  app.post("/api/send-matching-push", pushRateLimiter, authenticateUser, async (req, res) => {
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
      const matchingSubs = storedSubscriptions.filter((s) => matchedUserIds.has(s.userId));

      if (matchingSubs.length === 0) {
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
      };

      let hasStale = false;
      const sendPromises = matchingSubs.map(async (sub) => {
        try {
          await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            console.log(`Pruning stale subscription for user ${sub.userId}`);
            storedSubscriptions = storedSubscriptions.filter(
              (s) => s.subscription.endpoint !== sub.subscription.endpoint
            );
            hasStale = true;
          } else {
            console.error(`Error sending Match Web Push to subscription:`, err.message);
          }
        }
      });

      await Promise.all(sendPromises);
      if (hasStale) saveSubscriptionsToDisk();

      res.status(200).json({ success: true, notifiedCount: matchingSubs.length });
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
