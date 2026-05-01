import {and, desc, eq, getTableColumns, ilike, or, sql} from "drizzle-orm";
import express from "express";
import {classes, subjects, departments, enrollments} from "../db/schema/app.js";
import {db} from "../db/index.js";
import {user} from "../db/schema/auth.js";

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

// Get class details with teacher, subject, and department
router.get('/:id', async (req, res) => {
    const classId = Number(req.params.id);

    if(!Number.isFinite(classId)) return res.status(400).json({error: 'No Class found.'});

    const [classDetails] = await db
        .select({
            ...getTableColumns(classes),
            subject: {
                ...getTableColumns(subjects),
            },
            department: {
                ...getTableColumns(departments),
            },
            teacher: {
                ...getTableColumns(user),
            }
        })
        .from(classes)
        .leftJoin(subjects, eq(classes.subjectId, subjects.id))
        .leftJoin(user, eq(classes.teacherId, user.id))
        .leftJoin(departments, eq(subjects.departmentId, departments.id))
        .where(eq(classes.id, classId))

    if(!classDetails) return res.status(404).json({error: 'No Class found.'});

    res.status(200).json({data: classDetails});
})

// Get users (students) enrolled in a class
router.get("/:id/users", async (req, res) => {
    try {
        const classId = Number(req.params.id);
        const { role, page = "1", limit = "10" } = req.query;

        if (!Number.isFinite(classId)) {
            return res.status(400).json({ error: "Invalid class ID" });
        }

        const toPositiveInt = (value: unknown, fallback: number) => {
            if (Array.isArray(value)) return fallback;
            const n = Number.parseInt(String(value), 10);
            return Number.isFinite(n) && n > 0 ? n : fallback;
        };

        const MAX_LIMIT = 100;
        const currentPage = toPositiveInt(page, 1);
        const limitPerPage = Math.min(MAX_LIMIT, toPositiveInt(limit, 10));
        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [eq(enrollments.classId, classId)];

        if (role) {
            filterConditions.push(eq(user.role, role as any));
        }

        const whereClause = and(...filterConditions);

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(enrollments)
            .innerJoin(user, eq(enrollments.studentId, user.id))
            .where(whereClause);

        const totalCount = countResult[0]?.count ?? 0;

        const enrolledUsers = await db
            .select({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                image: user.image,
                emailVerified: user.emailVerified,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            })
            .from(enrollments)
            .innerJoin(user, eq(enrollments.studentId, user.id))
            .where(whereClause)
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: enrolledUsers,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            },
        });
    } catch (e) {
        console.error(`GET /classes/:id/users error: ${e}`);
        res.status(500).json({ error: "Failed to get enrolled users" });
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
