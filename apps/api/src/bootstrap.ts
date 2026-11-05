import { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";

export function configureApp(app: INestApplication) {
  const origins = (process.env.WEB_ORIGINS ?? "http://localhost:3300").split(",").map((s) => s.trim()).filter(Boolean);
  app.setGlobalPrefix("v1");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  // Writes must come from our own site. SameSite cookies do most of this; the check covers older browsers.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (req.method !== "GET" && req.method !== "HEAD" && origin && !origins.includes(origin)) {
      res.status(403).json({ message: "Cross-site request refused." });
      return;
    }
    next();
  });
}
