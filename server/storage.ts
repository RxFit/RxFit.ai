import {
  type User,
  type InsertUser,
  type Lead,
  type InsertLead,
  type GeneratedPost,
  type InsertGeneratedPost,
  type KeywordTheme,
  type InsertKeywordTheme,
  type GscQueryStat,
  type InsertGscQueryStat,
  users,
  leads,
  generatedPosts,
  keywordThemes,
  gscQueryStats,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, and, sql } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createLead(lead: InsertLead): Promise<Lead>;
  getLeadByEmail(email: string): Promise<Lead | undefined>;
  getLeads(): Promise<Lead[]>;
  createGeneratedPost(post: InsertGeneratedPost): Promise<GeneratedPost>;
  getPublishedGeneratedPosts(): Promise<GeneratedPost[]>;
  getGeneratedPostBySlug(slug: string): Promise<GeneratedPost | undefined>;
  getLatestGeneratedPost(): Promise<GeneratedPost | undefined>;
  updateGeneratedPost(id: string, patch: Partial<InsertGeneratedPost>): Promise<GeneratedPost>;
  getLatestRefreshedPost(): Promise<GeneratedPost | undefined>;
  getGscSnapshotDates(): Promise<string[]>;
  replaceGscSnapshot(fetchDate: string, rows: InsertGscQueryStat[]): Promise<void>;
  getLatestGscSnapshot(): Promise<GscQueryStat[]>;
  pruneGscSnapshotsBefore(fetchDate: string): Promise<void>;
  listKeywordThemes(): Promise<KeywordTheme[]>;
  seedKeywordThemes(themes: InsertKeywordTheme[]): Promise<void>;
  getNextKeywordTheme(): Promise<KeywordTheme | undefined>;
  markKeywordThemeUsed(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async createLead(insertLead: InsertLead): Promise<Lead> {
    const [lead] = await db.insert(leads).values(insertLead).returning();
    return lead;
  }

  async getLeadByEmail(email: string): Promise<Lead | undefined> {
    const [lead] = await db.select().from(leads).where(eq(leads.email, email));
    return lead;
  }

  async getLeads(): Promise<Lead[]> {
    return db.select().from(leads);
  }

  async createGeneratedPost(post: InsertGeneratedPost): Promise<GeneratedPost> {
    const [created] = await db.insert(generatedPosts).values(post).returning();
    return created;
  }

  async getPublishedGeneratedPosts(): Promise<GeneratedPost[]> {
    return db
      .select()
      .from(generatedPosts)
      .where(eq(generatedPosts.status, "published"))
      .orderBy(desc(generatedPosts.date));
  }

  async getGeneratedPostBySlug(slug: string): Promise<GeneratedPost | undefined> {
    const [post] = await db
      .select()
      .from(generatedPosts)
      .where(and(eq(generatedPosts.slug, slug), eq(generatedPosts.status, "published")));
    return post;
  }

  async getLatestGeneratedPost(): Promise<GeneratedPost | undefined> {
    const [post] = await db
      .select()
      .from(generatedPosts)
      .where(eq(generatedPosts.status, "published"))
      .orderBy(desc(generatedPosts.createdAt))
      .limit(1);
    return post;
  }

  async updateGeneratedPost(id: string, patch: Partial<InsertGeneratedPost>): Promise<GeneratedPost> {
    const [updated] = await db
      .update(generatedPosts)
      .set(patch)
      .where(eq(generatedPosts.id, id))
      .returning();
    if (!updated) throw new Error(`Generated post not found: ${id}`);
    return updated;
  }

  async getLatestRefreshedPost(): Promise<GeneratedPost | undefined> {
    const [post] = await db
      .select()
      .from(generatedPosts)
      .where(sql`${generatedPosts.lastRefreshedAt} IS NOT NULL`)
      .orderBy(desc(generatedPosts.lastRefreshedAt))
      .limit(1);
    return post;
  }

  async getGscSnapshotDates(): Promise<string[]> {
    const rows = await db
      .selectDistinct({ fetchDate: gscQueryStats.fetchDate })
      .from(gscQueryStats)
      .orderBy(desc(gscQueryStats.fetchDate));
    return rows.map((r) => r.fetchDate);
  }

  async replaceGscSnapshot(fetchDate: string, rows: InsertGscQueryStat[]): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(gscQueryStats).where(eq(gscQueryStats.fetchDate, fetchDate));
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        if (chunk.length > 0) await tx.insert(gscQueryStats).values(chunk);
      }
    });
  }

  async getLatestGscSnapshot(): Promise<GscQueryStat[]> {
    const dates = await this.getGscSnapshotDates();
    if (dates.length === 0) return [];
    return db.select().from(gscQueryStats).where(eq(gscQueryStats.fetchDate, dates[0]));
  }

  async pruneGscSnapshotsBefore(fetchDate: string): Promise<void> {
    await db.delete(gscQueryStats).where(sql`${gscQueryStats.fetchDate} < ${fetchDate}`);
  }

  async listKeywordThemes(): Promise<KeywordTheme[]> {
    return db.select().from(keywordThemes).orderBy(asc(keywordThemes.position));
  }

  async seedKeywordThemes(themes: InsertKeywordTheme[]): Promise<void> {
    if (themes.length === 0) return;
    await db.insert(keywordThemes).values(themes).onConflictDoNothing();
  }

  /** Least-used active theme first, tie-broken by queue position. */
  async getNextKeywordTheme(): Promise<KeywordTheme | undefined> {
    const [theme] = await db
      .select()
      .from(keywordThemes)
      .where(eq(keywordThemes.active, true))
      .orderBy(asc(keywordThemes.timesUsed), asc(keywordThemes.position))
      .limit(1);
    return theme;
  }

  async markKeywordThemeUsed(id: string): Promise<void> {
    await db
      .update(keywordThemes)
      .set({ timesUsed: sql`${keywordThemes.timesUsed} + 1`, lastUsedAt: new Date() })
      .where(eq(keywordThemes.id, id));
  }
}

export const storage = new DatabaseStorage();
