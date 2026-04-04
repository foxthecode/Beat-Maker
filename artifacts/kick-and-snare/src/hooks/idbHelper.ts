const DB_NAME='ks_audio';const STORE='blobs';const DB_V=1;
let _db:IDBDatabase|null=null;
async function db():Promise<IDBDatabase>{
  if(_db)return _db;
  return new Promise((res,rej)=>{
    const r=indexedDB.open(DB_NAME,DB_V);
    r.onupgradeneeded=e=>{(e.target as IDBOpenDBRequest).result.createObjectStore(STORE);};
    r.onsuccess=e=>{_db=(e.target as IDBOpenDBRequest).result;res(_db);};
    r.onerror=()=>rej(r.error);
  });
}
export async function idbPut(key:string,val:ArrayBuffer):Promise<void>{
  const d=await db();
  return new Promise((res,rej)=>{const tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).put(val,key);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});
}
export async function idbGet(key:string):Promise<ArrayBuffer|null>{
  const d=await db();
  return new Promise((res,rej)=>{const tx=d.transaction(STORE,'readonly');const r=tx.objectStore(STORE).get(key);r.onsuccess=()=>res(r.result??null);r.onerror=()=>rej(r.error);});
}
export async function idbDeleteKeysWithPrefix(prefix:string):Promise<void>{
  const d=await db();
  return new Promise((res,rej)=>{
    const tx=d.transaction(STORE,'readwrite');const store=tx.objectStore(STORE);
    const req=store.getAllKeys();
    req.onsuccess=()=>{
      const keys=(req.result as string[]).filter(k=>k.startsWith(prefix));
      keys.forEach(k=>store.delete(k));
      tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);
    };req.onerror=()=>rej(req.error);
  });
}
