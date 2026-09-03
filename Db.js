import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, setDoc, addDoc, deleteDoc, collection, onSnapshot,
  runTransaction, serverTimestamp, query, orderBy, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const DEFAULT_SETTINGS = { maxOrderNumber: 30, newOrderThresholdMin: 2, reminderDisplaySec: 30 };

export function getApp_() {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function getDb() {
  return getFirestore(getApp_());
}

// ---- 設定 ----
export function watchSettings(db, cb) {
  return onSnapshot(doc(db, "meta", "settings"), (snap) => {
    cb(snap.exists() ? { ...DEFAULT_SETTINGS, ...snap.data() } : DEFAULT_SETTINGS);
  });
}
export async function saveSettings(db, settings) {
  await setDoc(doc(db, "meta", "settings"), settings, { merge: true });
}

// ---- 進行中の注文(輸送/受け渡し用) ----
export function watchActiveOrders(db, cb) {
  return onSnapshot(collection(db, "activeOrders"), (snap) => {
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    list.sort((a, b) => (a.queueNumber || 0) - (b.queueNumber || 0));
    cb(list);
  });
}

// ---- 催促 ----
export function watchReminder(db, cb) {
  return onSnapshot(doc(db, "meta", "reminder"), (snap) => {
    cb(snap.exists() ? snap.data() : null);
  });
}
export async function sendReminder(db) {
  await setDoc(doc(db, "meta", "reminder"), { triggeredAt: serverTimestamp() });
}

// ---- 注文作成(トランザクションで空き番号を安全に払い出す) ----
export async function createOrder(db, { normal, spicy }, maxOrderNumber) {
  return await runTransaction(db, async (tx) => {
    const queueStateRef = doc(db, "meta", "queueState");
    const counterRef = doc(db, "meta", "counters");
    // 読み取りは先にまとめて行う(Firestoreトランザクションの制約)
    const queueStateSnap = await tx.get(queueStateRef);
    const counterSnap = await tx.get(counterRef);

    const slots = queueStateSnap.exists() ? (queueStateSnap.data().slots || []) : [];
    let assigned = -1;
    for (let i = 0; i < maxOrderNumber; i++) {
      if (!slots[i]) { assigned = i + 1; break; }
    }
    if (assigned === -1) {
      throw new Error("空いている注文番号がありません。設定(⑤)で最大注文番号を増やすか、既存の注文を捌いてください。");
    }
    const newSlots = slots.slice();
    while (newSlots.length < maxOrderNumber) newSlots.push(false);
    newSlots[assigned - 1] = true;

    const nextHistoryId = counterSnap.exists() ? (counterSnap.data().historyCounter || 0) + 1 : 1;

    const activeRef = doc(collection(db, "activeOrders"));
    const historyRef = doc(collection(db, "orderHistory"));

    tx.set(activeRef, { queueNumber: assigned, normal, spicy, createdAt: serverTimestamp() });
    tx.set(historyRef, { historyId: nextHistoryId, queueNumber: assigned, normal, spicy, createdAt: serverTimestamp() });
    tx.set(queueStateRef, { slots: newSlots }, { merge: true });
    tx.set(counterRef, { historyCounter: nextHistoryId }, { merge: true });

    return assigned;
  });
}

// ---- 受け渡し完了(番号を解放) ----
export async function completeOrder(db, orderId, queueNumber) {
  await runTransaction(db, async (tx) => {
    const queueStateRef = doc(db, "meta", "queueState");
    const activeRef = doc(db, "activeOrders", orderId);
    const queueStateSnap = await tx.get(queueStateRef);
    const slots = queueStateSnap.exists() ? (queueStateSnap.data().slots || []) : [];
    if (slots[queueNumber - 1] !== undefined) slots[queueNumber - 1] = false;
    tx.delete(activeRef);
    tx.set(queueStateRef, { slots }, { merge: true });
  });
}

// ---- 履歴(admin用、historyId昇順) ----
export async function getHistoryOnce(db) {
  const snap = await getDocs(query(collection(db, "orderHistory"), orderBy("historyId", "asc")));
  const list = [];
  snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
  return list;
}

// ---- リセット(CSV出力用データを返してから全消去) ----
export async function resetAll(db) {
  const history = await getHistoryOnce(db);
  const activeSnap = await getDocs(collection(db, "activeOrders"));
  const batch = writeBatch(db);
  history.forEach((h) => batch.delete(doc(db, "orderHistory", h.id)));
  activeSnap.forEach((d) => batch.delete(doc(db, "activeOrders", d.id)));
  batch.set(doc(db, "meta", "counters"), { historyCounter: 0 });
  batch.set(doc(db, "meta", "queueState"), { slots: [] });
  await batch.commit();
  return history;
}