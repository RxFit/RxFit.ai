import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertLeadSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post("/api/leads", async (req, res) => {
    try {
      const parsed = insertLeadSchema.parse(req.body);

      const existing = await storage.getLeadByEmail(parsed.email);
      if (existing) {
        return res.status(200).json({ message: "You're already on the list!", lead: existing });
      }

      const lead = await storage.createLead(parsed);
      return res.status(201).json({ message: "You're in! Check your email for next steps.", lead });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Please enter a valid email address.", errors: error.errors });
      }
      console.error("Error creating lead:", error);
      return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  app.get("/api/leads", async (_req, res) => {
    try {
      const allLeads = await storage.getLeads();
      return res.status(200).json(allLeads);
    } catch (error) {
      console.error("Error fetching leads:", error);
      return res.status(500).json({ message: "Something went wrong." });
    }
  });

  return httpServer;
}
