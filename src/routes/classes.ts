import {and, desc, eq, getTableColumns, ilike, or, sql} from "drizzle-orm";
import express from "express";
import {classes, subjects, user} from "../db/schema/index.js";
import {db} from "../db/index.js";

const router = express.Router();

// Get all classes with optional search, filtering and pagination
router.get("/", async (req, res) => {
    try {
        const { search, subject, teacher, page = "1", limit = "10" } = req.query;
        const toPositiveInt = (value: unknown, fallback: number) => {
            if (Array.isArray(value)) return fallback;
            const n = Number.parseInt(String(value), 10);
            return Number.isFinite(n) && n > 0 ? n : fallback;
        };

        const MAX_LIMIT = 100;
        const currentPage = toPositiveInt(page, 1);
        const limitPerPage = Math.min(MAX_LIMIT, toPositiveInt(limit, 10));

        const offset = (currentPage - 1) * limitPerPage;
        const filterConditions = []

        // If search query exists, filter by class name OR invite code
        if (search) {
            filterConditions.push(
                or(
                    ilike(classes.name, `%${search}%`),
                    ilike(classes.inviteCode, `%${search}%`)
                )
            );
        }

        // If subject filter exists, match subject name
        if (subject) {
            filterConditions.push(ilike(subjects.name, `%${subject}%`))
        }

        // If teacher filter exists, match teacher (user) name
        if (teacher) {
            filterConditions.push(ilike(user.name, `%${teacher}%`))
        }

        // Combine all filters using AND if any exist
        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        // Count query MUST include the joins
        const countResult = await db
            .select({count: sql<number>`count(*)`})
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(user, eq(classes.teacherId, user.id))
            .where(whereClause);

        const totalCount = countResult[0]?.count ?? 0;

        // Data query
        const classesList = await db.select({
            ...getTableColumns(classes),
            subject: {...getTableColumns(subjects)},
            teacher: {...getTableColumns(user)}
        })
        .from(classes)
        .leftJoin(subjects, eq(classes.subjectId, subjects.id))
        .leftJoin(user, eq(classes.teacherId, user.id))
        .where(whereClause)
        .orderBy(desc(classes.createdAt))
        .limit(limitPerPage)
        .offset(offset);

        res.status(200).json({
            data: classesList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage)
            }
        });
    } catch (e) {
        console.log(`GET /classes error: ${e}`);
        res.status(500).json({ error: "Failed to get classes" });
    }
});

// Create a new class
router.post("/", async (req, res) => {
    try {
        const {
            name,
            subjectId,
            teacherId,
            description,
            capacity,
            bannerUrl,
            bannerCldPubId,
            schedules
        } = req.body;

        // Basic validation
        if (!name || !subjectId || !teacherId) {
            return res.status(400).json({
                message: "Name, subject, and teacher are required."
            });
        }

        // Generate a random invite code
        const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

        const [newClass] = await db.insert(classes).values({
            name,
            subjectId,
            teacherId,
            inviteCode,
            description,
            capacity: capacity ? parseInt(capacity, 10) : 50,
            bannerUrl,
            bannerCldPubId,
            schedules: schedules || []
        }).returning();

        res.status(201).json({
            message: "Class created successfully",
            data: newClass
        });
    } catch (e) {
        console.error(`POST /classes error: ${e}`);
        res.status(500).json({
            message: "Failed to create class",
            error: e instanceof Error ? e.message : String(e)
        });
    }
});

export default router;
