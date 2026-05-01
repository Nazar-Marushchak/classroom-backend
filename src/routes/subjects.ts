import {and, desc, eq, getTableColumns, ilike, or, sql} from "drizzle-orm";
import express from "express";
import {departments, subjects, classes, enrollments, user} from "../db/schema/index.js";
import {db} from "../db/index.js";

const router = express.Router();

//Get all subjects with optional search, filtering and pagination
router.get("/", async (req, res) => {
    try {
        const { search, department, page = "1", limit = "10" } = req.query;
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

        // If search query exists, filter by subject name OR subject code
        if (search) {
            filterConditions.push(
                or(
                    ilike(subjects.name, `%${search}%`),
                    ilike(subjects.code, `%${search}%`)
                )
            );
        }

        //If department filter exists, match department name
        if( department ) {
            filterConditions.push(ilike(departments.name, `%${department}%`))
        }

        // Combine all filters using AND if any exist
        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        // Const query MUST include the join
        const countResult = await db
            .select({count: sql<number>`count(*)`})
            .from(subjects)
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .where(whereClause);

        const totalCount = countResult[0]?.count ?? 0;

        // Data query
        const subjectsList = await db.select({
            ...getTableColumns(subjects),
            department: { ...getTableColumns(departments) },
            totalClasses: sql<number>`(SELECT count(*) FROM ${classes} WHERE ${classes.subjectId} = ${subjects.id})`,
        })
        .from(subjects)
        .leftJoin(departments, eq(subjects.departmentId, departments.id))
        .where(whereClause)
        .orderBy(desc(subjects.createdAt))
        .limit(limitPerPage)
        .offset(offset);

        res.status(200).json({
            data: subjectsList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage)
            }
        });
    } catch (e) {
        console.log(`GET /subjects error: ${e}`);
        res.status(500).json({ error: "Failed to get subjects" });
    }
});

// Get a single subject by ID
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const subjectId = parseInt(id, 10);
        if (isNaN(subjectId)) {
            return res.status(400).json({ error: "Invalid subject ID" });
        }

        const result = await db
            .select({
                ...getTableColumns(subjects),
                department: { ...getTableColumns(departments) }
            })
            .from(subjects)
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .where(eq(subjects.id, subjectId))
            .limit(1);

        if (result.length === 0) {
            return res.status(404).json({ error: "Subject not found" });
        }

        // Get totals for SubjectsShow
        const [classesCount] = await db
            .select({ count: sql<number>`count(*)` })
            .from(classes)
            .where(eq(classes.subjectId, subjectId));

        res.status(200).json({
            data: {
                subject: result[0],
                totals: {
                    classes: classesCount?.count ?? 0,
                }
            }
        });
    } catch (e) {
        console.error(`GET /subjects/:id error: ${e}`);
        res.status(500).json({ error: 'Failed to get subject' });
    }
});

// Get classes of a subject
router.get("/:id/classes", async (req, res) => {
    try {
        const { id } = req.params;
        const subjectId = parseInt(id, 10);
        const { page = "1", limit = "10" } = req.query;

        const currentPage = parseInt(String(page), 10) || 1;
        const limitPerPage = parseInt(String(limit), 10) || 10;
        const offset = (currentPage - 1) * limitPerPage;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(classes)
            .where(eq(classes.subjectId, subjectId));

        const totalCount = countResult[0]?.count ?? 0;

        const subjectClasses = await db
            .select({
                ...getTableColumns(classes),
                teacher: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    image: user.image,
                }
            })
            .from(classes)
            .leftJoin(user, eq(classes.teacherId, user.id))
            .where(eq(classes.subjectId, subjectId))
            .orderBy(desc(classes.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: subjectClasses,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            }
        });
    } catch (e) {
        console.error(`GET /subjects/:id/classes error: ${e}`);
        res.status(500).json({ error: 'Failed to get subject classes' });
    }
});

// Get users of a subject (teachers or students involved in any class of the subject)
router.get("/:id/users", async (req, res) => {
    try {
        const { id } = req.params;
        const subjectId = parseInt(id, 10);
        const { role, page = "1", limit = "10" } = req.query;

        const currentPage = parseInt(String(page), 10) || 1;
        const limitPerPage = parseInt(String(limit), 10) || 10;
        const offset = (currentPage - 1) * limitPerPage;

        let baseQuery;
        if (role === 'teacher') {
            baseQuery = db
                .selectDistinct({
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    image: user.image,
                })
                .from(user)
                .innerJoin(classes, eq(classes.teacherId, user.id))
                .where(and(eq(classes.subjectId, subjectId), eq(user.role, 'teacher')));
        } else if (role === 'student') {
            baseQuery = db
                .selectDistinct({
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    image: user.image,
                })
                .from(user)
                .innerJoin(enrollments, eq(enrollments.studentId, user.id))
                .innerJoin(classes, eq(enrollments.classId, classes.id))
                .where(and(eq(classes.subjectId, subjectId), eq(user.role, 'student')));
        } else {
             return res.status(200).json({ data: [], pagination: { page: currentPage, limit: limitPerPage, total: 0, totalPages: 0 } });
        }

        const allResults = await baseQuery;
        const totalCount = allResults.length;
        const paginatedResults = allResults.slice(offset, offset + limitPerPage);

        res.status(200).json({
            data: paginatedResults,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            }
        });
    } catch (e) {
        console.error(`GET /subjects/:id/users error: ${e}`);
        res.status(500).json({ error: 'Failed to get subject users' });
    }
});

// Create a new subject
router.post("/", async (req, res) => {
    try {
        const { name, code, description, departmentId } = req.body;
        if (!name || !code || !departmentId) {
            return res.status(400).json({ error: "Name, code, and departmentId are required" });
        }

        const [newSubject] = await db.insert(subjects).values({
            name,
            code,
            description,
            departmentId: parseInt(departmentId, 10),
        }).returning();

        res.status(201).json({ data: newSubject });
    } catch (e) {
        console.error(`POST /subjects error: ${e}`);
        res.status(500).json({ error: 'Failed to create subject' });
    }
});

export default router;