import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
import express from "express";
import { departments, subjects, classes, enrollments, user } from "../db/schema/index.js";
import { db } from "../db/index.js";
const router = express.Router();
// Get all departments with optional search, filtering and pagination
router.get("/", async (req, res) => {
    try {
        const { search, name, code, page = "1", limit = "10" } = req.query;
        const toPositiveInt = (value, fallback) => {
            if (Array.isArray(value))
                return fallback;
            const n = Number.parseInt(String(value), 10);
            return Number.isFinite(n) && n > 0 ? n : fallback;
        };
        const MAX_LIMIT = 100;
        const currentPage = toPositiveInt(page, 1);
        const limitPerPage = Math.min(MAX_LIMIT, toPositiveInt(limit, 10));
        const offset = (currentPage - 1) * limitPerPage;
        const filterConditions = [];
        if (search) {
            filterConditions.push(or(ilike(departments.name, `%${search}%`), ilike(departments.code, `%${search}%`)));
        }
        if (name) {
            filterConditions.push(ilike(departments.name, `%${name}%`));
        }
        if (code) {
            filterConditions.push(ilike(departments.code, `%${code}%`));
        }
        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;
        const countResult = await db
            .select({ count: sql `count(*)` })
            .from(departments)
            .where(whereClause);
        const totalCount = countResult[0]?.count ?? 0;
        const departmentsList = await db
            .select({
            ...getTableColumns(departments),
            totalSubjects: sql `(SELECT count(*) FROM ${subjects} WHERE ${subjects.departmentId} = ${departments.id})`,
        })
            .from(departments)
            .where(whereClause)
            .orderBy(desc(departments.createdAt))
            .limit(limitPerPage)
            .offset(offset);
        res.status(200).json({
            data: departmentsList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            }
        });
    }
    catch (e) {
        console.error(`GET /departments error: ${e}`);
        res.status(500).json({ error: 'Failed to get departments' });
    }
});
// Create a new department
router.post("/", async (req, res) => {
    try {
        const { name, code, description } = req.body;
        if (!name || !code) {
            return res.status(400).json({ error: "Name and code are required" });
        }
        const newDepartment = await db.insert(departments).values({
            name,
            code,
            description,
        }).returning();
        res.status(201).json({ data: newDepartment[0] });
    }
    catch (e) {
        console.error(`POST /departments error: ${e}`);
        res.status(500).json({ error: 'Failed to create department' });
    }
});
// Get a single department by ID
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const deptId = parseInt(id, 10);
        if (isNaN(deptId)) {
            return res.status(400).json({ error: "Invalid department ID" });
        }
        const result = await db
            .select({
            ...getTableColumns(departments),
        })
            .from(departments)
            .where(eq(departments.id, deptId))
            .limit(1);
        if (result.length === 0) {
            return res.status(404).json({ error: "Department not found" });
        }
        // Get totals for DepartmentShow
        const [subjectsCount] = await db
            .select({ count: sql `count(*)` })
            .from(subjects)
            .where(eq(subjects.departmentId, deptId));
        const [classesCount] = await db
            .select({ count: sql `count(*)` })
            .from(classes)
            .innerJoin(subjects, eq(classes.subjectId, subjects.id))
            .where(eq(subjects.departmentId, deptId));
        const [studentsCount] = await db
            .select({ count: sql `count(distinct ${enrollments.studentId})` })
            .from(enrollments)
            .innerJoin(classes, eq(enrollments.classId, classes.id))
            .innerJoin(subjects, eq(classes.subjectId, subjects.id))
            .where(eq(subjects.departmentId, deptId));
        res.status(200).json({
            data: {
                department: result[0],
                totals: {
                    subjects: subjectsCount?.count ?? 0,
                    classes: classesCount?.count ?? 0,
                    enrolledStudents: studentsCount?.count ?? 0,
                }
            }
        });
    }
    catch (e) {
        console.error(`GET /departments/:id error: ${e}`);
        res.status(500).json({ error: 'Failed to get department' });
    }
});
// Get subjects of a department
router.get("/:id/subjects", async (req, res) => {
    try {
        const { id } = req.params;
        const deptId = parseInt(id, 10);
        const { page = "1", limit = "10" } = req.query;
        const currentPage = parseInt(String(page), 10) || 1;
        const limitPerPage = parseInt(String(limit), 10) || 10;
        const offset = (currentPage - 1) * limitPerPage;
        const countResult = await db
            .select({ count: sql `count(*)` })
            .from(subjects)
            .where(eq(subjects.departmentId, deptId));
        const totalCount = countResult[0]?.count ?? 0;
        const departmentSubjects = await db
            .select({
            ...getTableColumns(subjects),
        })
            .from(subjects)
            .where(eq(subjects.departmentId, deptId))
            .orderBy(desc(subjects.createdAt))
            .limit(limitPerPage)
            .offset(offset);
        res.status(200).json({
            data: departmentSubjects,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            }
        });
    }
    catch (e) {
        console.error(`GET /departments/:id/subjects error: ${e}`);
        res.status(500).json({ error: 'Failed to get department subjects' });
    }
});
// Get classes of a department
router.get("/:id/classes", async (req, res) => {
    try {
        const { id } = req.params;
        const deptId = parseInt(id, 10);
        const { page = "1", limit = "10" } = req.query;
        const currentPage = parseInt(String(page), 10) || 1;
        const limitPerPage = parseInt(String(limit), 10) || 10;
        const offset = (currentPage - 1) * limitPerPage;
        const countResult = await db
            .select({ count: sql `count(*)` })
            .from(classes)
            .innerJoin(subjects, eq(classes.subjectId, subjects.id))
            .where(eq(subjects.departmentId, deptId));
        const totalCount = countResult[0]?.count ?? 0;
        const departmentClasses = await db
            .select({
            ...getTableColumns(classes),
            subject: {
                id: subjects.id,
                name: subjects.name,
                code: subjects.code,
            },
            teacher: {
                id: user.id,
                name: user.name,
                email: user.email,
                image: user.image,
            }
        })
            .from(classes)
            .innerJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(user, eq(classes.teacherId, user.id))
            .where(eq(subjects.departmentId, deptId))
            .orderBy(desc(classes.createdAt))
            .limit(limitPerPage)
            .offset(offset);
        res.status(200).json({
            data: departmentClasses,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            }
        });
    }
    catch (e) {
        console.error(`GET /departments/:id/classes error: ${e}`);
        res.status(500).json({ error: 'Failed to get department classes' });
    }
});
// Get users of a department (teachers or students involved in any class of the department)
router.get("/:id/users", async (req, res) => {
    try {
        const { id } = req.params;
        const deptId = parseInt(id, 10);
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
                .innerJoin(subjects, eq(classes.subjectId, subjects.id))
                .where(and(eq(subjects.departmentId, deptId), eq(user.role, 'teacher')));
        }
        else if (role === 'student') {
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
                .innerJoin(subjects, eq(classes.subjectId, subjects.id))
                .where(and(eq(subjects.departmentId, deptId), eq(user.role, 'student')));
        }
        else {
            // If no role specified, we'd need a union or just return empty for now as frontend always specifies role
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
    }
    catch (e) {
        console.error(`GET /departments/:id/users error: ${e}`);
        res.status(500).json({ error: 'Failed to get department users' });
    }
});
export default router;
//# sourceMappingURL=departments.js.map