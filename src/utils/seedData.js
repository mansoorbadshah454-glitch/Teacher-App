import { db } from './firebase';
import { doc, setDoc, collection, addDoc } from 'firebase/firestore';

export const seedTestData = async (schoolId = "TEST_SCHOOL") => {
    try {
        console.log("Seeding test data...");

        // 1. Create a Test Teacher in global_users
        const teacherUid = "TEACHER_123";
        await setDoc(doc(db, "global_users", teacherUid), {
            uid: teacherUid,
            email: "teacher@test.com",
            role: "teacher",
            schoolId: schoolId,
            name: "Sarah Johnson"
        });

        // 2. Create the Teacher in the school's registry
        await setDoc(doc(db, `schools/${schoolId}/users`, teacherUid), {
            uid: teacherUid,
            email: "teacher@test.com",
            role: "teacher",
            name: "Sarah Johnson",
            manualPassword: "password123"
        });

        // 3. Create some Students
        const students = [
            { name: "Alice Smith", roll: "101", class: "10A" },
            { name: "Bob Martin", roll: "102", class: "10A" },
            { name: "Charlie Brown", roll: "103", class: "10A" },
            { name: "Diana Prince", roll: "104", class: "10A" },
        ];

        for (const student of students) {
            await addDoc(collection(db, `schools/${schoolId}/students`), {
                ...student,
                createdAt: new Date()
            });
        }

        console.log("Seeding complete! Login with: teacher@test.com / password123");
        alert("Success! Use teacher@test.com / password123 to login.");
    } catch (error) {
        console.error("Error seeding data:", error);
        alert("Seed failed: " + error.message);
    }
};
