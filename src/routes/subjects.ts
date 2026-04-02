import {and,desc, eq, getTableColumns, ilike, or, sql} from "drizzle-orm";
import express from "express";
import {departments, subjects } from "../db/schema";
import {db} from "../db";

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
            department: {...getTableColumns(departments)}
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
        res.status(500).json({ error: "Faileed to get subjects" });
    }
});

export default router;