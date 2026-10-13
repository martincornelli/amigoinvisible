import { collection, doc, getDocFromServer, getDocsFromServer, limit, onSnapshot, query, runTransaction, setDoc, where } from 'firebase/firestore';
import { draw } from './draw.js';

function text(value, label, optional = false) {
  const clean = String(value ?? '').trim();
  if ((!optional && !clean) || clean.length > 80) throw new Error(`${label}: ingresá entre ${optional ? 0 : 1} y 80 caracteres.`);
  return clean;
}
export function parse(snapshot) {
  if (!snapshot.exists()) throw new Error('El encuentro ya no existe. Pedile una nueva invitación al organizador.');
  const data = snapshot.data();
  return { ...data, id: snapshot.id, participants: data.memberIds.map(id => ({ id, ...data.people[id] })) };
}
export class Repository {
  constructor(db, auth) { this.db = db; this.auth = auth; }
  get uid() {
    if (!this.auth.currentUser) throw new Error('Iniciá sesión para continuar.');
    return this.auth.currentUser.uid;
  }
  ref(id) {
    if (!/^[a-f0-9]{48}$/.test(id)) throw new Error('La invitación no es válida.');
    return doc(this.db, 'exchanges', id);
  }
  async list() {
    const result = await getDocsFromServer(query(collection(this.db, 'exchanges'), where('memberIds','array-contains',this.uid), limit(100)));
    return result.docs.map(parse).sort((a,b) => a.title.localeCompare(b.title, 'es'));
  }
  async get(id) { this.uid; return parse(await getDocFromServer(this.ref(id))); }
  subscribe(id, next, error) {
    this.uid;
    return onSnapshot(this.ref(id), snapshot => {
      if (snapshot.metadata.hasPendingWrites) return;
      try { next(parse(snapshot)); } catch (e) { error(e); }
    }, error);
  }
  async create(values) {
    const uid = this.uid;
    const title = text(values.title, 'Nombre del encuentro'), name = text(values.name, 'Tu nombre');
    const capacity = Number(values.capacity), budget = text(values.budget, 'Presupuesto', true);
    if (!Number.isInteger(capacity) || capacity < 3 || capacity > 50) throw new Error('Elegí entre 3 y 50 participantes.');
    const id = [...crypto.getRandomValues(new Uint8Array(24))].map(n => n.toString(16).padStart(2,'0')).join('');
    await setDoc(this.ref(id), {title, capacity, budget, ownerId:uid, memberIds:[uid], people:{[uid]:{name,partnerId:''}},status:'open'});
    return id;
  }
  async join(id, value) {
    const uid = this.uid, name = text(value,'Tu nombre');
    await runTransaction(this.db, async tx => {
      const current = parse(await tx.get(this.ref(id)));
      if (current.memberIds.includes(uid)) return;
      if (current.status !== 'open') throw new Error('El sorteo ya está cerrado.');
      if (current.memberIds.length >= current.capacity) throw new Error('El encuentro está completo.');
      if (current.participants.some(p => p.name.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) throw new Error('Ese nombre ya está en la lista. Agregá tu apellido.');
      tx.update(this.ref(id), {memberIds:[...current.memberIds,uid],people:{...current.people,[uid]:{name,partnerId:''}}});
    });
  }
  async partner(id, personId, partnerId) {
    const uid = this.uid;
    await runTransaction(this.db, async tx => {
      const current = parse(await tx.get(this.ref(id)));
      this.editable(current,uid);
      if (!current.people[personId] || (partnerId && (!current.people[partnerId] || partnerId === personId || (current.people[partnerId].partnerId && current.people[partnerId].partnerId !== personId)))) throw new Error('Esa pareja ya no está disponible. Actualizá el encuentro.');
      const people = Object.fromEntries(current.participants.map(p => [p.id,{name:p.name,partnerId:p.id===personId ? partnerId : p.id===partnerId ? personId : p.partnerId===personId ? '' : p.partnerId}]));
      tx.update(this.ref(id),{people});
    });
  }
  editable(current,uid) {
    if (current.ownerId !== uid) throw new Error('Solo el creador puede hacer este cambio.');
    if (current.status !== 'open') throw new Error('El sorteo ya está cerrado.');
  }
  async capacity(id, value) {
    const uid = this.uid, capacity = Number(value);
    if (!Number.isInteger(capacity) || capacity < 3 || capacity > 50) throw new Error('Elegí entre 3 y 50 participantes.');
    await runTransaction(this.db, async tx => {
      const current = parse(await tx.get(this.ref(id)));
      this.editable(current,uid);
      if (capacity < current.memberIds.length) throw new Error(`Ya hay ${current.memberIds.length} personas anotadas. La cantidad no puede ser menor.`);
      tx.update(this.ref(id),{capacity});
    });
  }
  async execute(id) {
    const uid = this.uid;
    await runTransaction(this.db, async tx => {
      const current = parse(await tx.get(this.ref(id)));
      this.editable(current,uid);
      if (current.memberIds.length !== current.capacity) throw new Error('Todavía faltan participantes.');
      const results = draw(current.participants);
      if (!results) throw new Error('No existe una combinación con estas parejas. Revisá las exclusiones.');
      for (const [giver,recipientId] of Object.entries(results)) tx.set(doc(this.ref(id),'results',giver),{recipientId});
      tx.update(this.ref(id),{status:'drawn'});
    });
  }
  async remove(id) {
    const uid = this.uid;
    await runTransaction(this.db, async tx => {
      const current = parse(await tx.get(this.ref(id)));
      this.editable(current,uid); tx.delete(this.ref(id));
    });
  }
  async result(current) {
    const snapshot = await getDocFromServer(doc(this.ref(current.id),'results',this.uid));
    const recipient = current.people[snapshot.data()?.recipientId];
    if (!recipient) throw new Error('El resultado todavía no está disponible.');
    return recipient.name;
  }
}
