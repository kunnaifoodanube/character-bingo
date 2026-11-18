/* ===== ตั้งค่าซิงก์เรียลไทม์ (Firebase Firestore แผนฟรี) =====
 * ปล่อยเป็น null = ปิดระบบซิงก์เรียลไทม์ (เกมยังเล่นได้ปกติ + ใช้ QR ซิงก์ได้)
 * ถ้าจะเปิด: ทำตาม docs/04-คู่มือตั้งค่าซิงก์เรียลไทม์.md แล้ววางค่าจาก Firebase แทน null
 * ตัวอย่าง:
 * window.CB_FIREBASE_CONFIG = {
 *   apiKey: "AIza...",
 *   authDomain: "xxx.firebaseapp.com",
 *   projectId: "xxx",
 *   appId: "1:123:web:abc"
 * };
 * ค่าเหล่านี้ไม่ใช่รหัสผ่าน เปิดเผยได้ ความปลอดภัยมาจาก Firestore Rules
 */
window.CB_FIREBASE_CONFIG = null;
