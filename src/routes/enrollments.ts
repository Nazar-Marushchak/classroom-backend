import { eq, getTableColumns } from "drizzle-orm";
import express from "express";
import { db } from "../db/index.js";
import { enrollments, classes, subjects, departments, user } from "../db/schema/index.js";

const router = express.Router();

// Get enrollment details
router.get("/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

        const [enrollmentDetails] = await db
            .select({
                ...getTableColumns(enrollments),
                class: {
                    ...getTableColumns(classes),
                },
                subject: {
                    ...getTableColumns(subjects),
                },
                department: {
                    ...getTableColumns(departments),
                },
                teacher: {
                    ...getTableColumns(user),
                },
            })
            .from(enrollments)
            .innerJoin(classes, eq(enrollments.classId, classes.id))
            .innerJoin(subjects, eq(classes.subjectId, subjects.id))
            .innerJoin(departments, eq(subjects.departmentId, departments.id))
            .innerJoin(user, eq(classes.teacherId, user.id))
            .where(eq(enrollments.id, id));

        if (!enrollmentDetails) {
            return res.status(404).json({ error: "Enrollment not found" });
        }

        res.status(200).json({ data: enrollmentDetails });
    } catch (e) {
        console.error(`GET /enrollments/:id error: ${e}`);
        res.status(500).json({ error: "Failed to get enrollment details" });
    }
});

// Create a new enrollment (direct)
router.post("/", async (req, res) => {
    try {
        const { classId, studentId } = req.body;

        if (!classId || !studentId) {
            return res.status(400).json({ error: "classId and studentId are required" });
        }

        const [newEnrollment] = await db
            .insert(enrollments)
            .values({
                classId,
                studentId,
            })
            .returning();

        // Return details for the confirmation page
        const [details] = await db
            .select({
                ...getTableColumns(enrollments),
                class: {
                    ...getTableColumns(classes),
                },
                subject: {
                    ...getTableColumns(subjects),
                },
                department: {
                    ...getTableColumns(departments),
                },
                teacher: {
                    ...getTableColumns(user),
                },
            })
            .from(enrollments)
            .innerJoin(classes, eq(enrollments.classId, classes.id))
            .innerJoin(subjects, eq(classes.subjectId, subjects.id))
            .innerJoin(departments, eq(subjects.departmentId, departments.id))
            .innerJoin(user, eq(classes.teacherId, user.id))
            .where(eq(enrollments.id, newEnrollment.id));

        res.status(201).json({ data: details });
    } catch (e) {
        console.error(`POST /enrollments error: ${e}`);
        res.status(500).json({ error: "Failed to enroll" });
    }
});

// Join by invite code
router.post("/join", async (req, res) => {
    try {
        const { inviteCode, studentId } = req.body;

        if (!inviteCode || !studentId) {
            return res.status(400).json({ error: "inviteCode and studentId are required" });
        }

        // Find the class by invite code
        const [targetClass] = await db
            .select()
            .from(classes)
            .where(eq(classes.inviteCode, inviteCode))
            .limit(1);

        if (!targetClass) {
            return res.status(404).json({ error: "Invalid invite code" });
        }

        // Create the enrollment
        const [newEnrollment] = await db
            .insert(enrollments)
            .values({
                classId: targetClass.id,
                studentId,
            })
            .returning();

        // Return details for the confirmation page
        const [details] = await db
            .select({
                ...getTableColumns(enrollments),
                class: {
                    ...getTableColumns(classes),
                },
                subject: {
                    ...getTableColumns(subjects),
                },
                department: {
                    ...getTableColumns(departments),
                },
                teacher: {
                    ...getTableColumns(user),
                },
            })
            .from(enrollments)
            .innerJoin(classes, eq(enrollments.classId, classes.id))
            .innerJoin(subjects, eq(classes.subjectId, subjects.id))
            .innerJoin(departments, eq(subjects.departmentId, departments.id))
            .innerJoin(user, eq(classes.teacherId, user.id))
            .where(eq(enrollments.id, newEnrollment.id));

        res.status(201).json({ data: details });
    } catch (e) {
        console.error(`POST /enrollments/join error: ${e}`);
        res.status(500).json({ error: "Failed to join class" });
    }
});

export default router;