// Local QA only. Never connects to the production project.
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,terminate} from 'firebase/firestore';
import {Repository} from '../src/repository.js';
const clients=[];
try {
 for(const name of ['Ana','Bruno','Carla','Diego']){
  const app=initializeApp({projectId:'demo-entre-nosotros',apiKey:'demo-key'},name);
  const auth=getAuth(app),db=getFirestore(app);
  connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8080);
  await createUserWithEmailAndPassword(auth,`${name.toLowerCase()}@example.test`,'Solo-emulador-123');
  clients.push({app,db,auth,repo:new Repository(db,auth),name});
 }
 const id=await clients[0].repo.create({title:'Navidad en familia',name:'Ana',capacity:4,budget:'Hasta $ 1.000 UYU'});
 for(const c of clients.slice(1))await c.repo.join(id,c.name);
 await clients[0].repo.partner(id,clients[0].auth.currentUser.uid,clients[1].auth.currentUser.uid);
 await clients[0].repo.partner(id,clients[2].auth.currentUser.uid,clients[3].auth.currentUser.uid);
 console.log('Local fixture ready:',id);
} finally {for(const c of clients){await terminate(c.db);await deleteApp(c.app);}}
