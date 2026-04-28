const STORAGE_KEY='ks_projects_v1';
export const NUM_SLOTS=5;

export interface ProjectState{
  pBank:any[];stVel:Record<string,any>;stNudge:Record<string,any>;
  stProb:Record<string,any>;stRatch:Record<string,any>;
  bpm:number;swing:number;tSig:any;cPat:number;
  songRows:any[];songMode:boolean;
  kitIdx:number;activeKitId:string|null;smpN:Record<string,string>;
  fx:Record<string,any>;gfx:any;fxChainOrder:string[];
  fxSendPos:Record<string,string>;trackFx:Record<string,any>;
  euclidParams:Record<string,any>;grpIdx:number;muted:Record<string,boolean>;
  customTracks:any[];act:any;
  // v2 additions
  masterVol?:number;velRange?:{min:number;max:number};speedMaster?:number;
}
export interface ProjectSlot{name:string;date:string;state:ProjectState;}

export function getSlots():(ProjectSlot|null)[]{
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw)return Array(NUM_SLOTS).fill(null);
    const parsed=JSON.parse(raw);
    if(Array.isArray(parsed)){
      while(parsed.length<NUM_SLOTS)parsed.push(null);
      return parsed.slice(0,NUM_SLOTS);
    }
    return Array(NUM_SLOTS).fill(null);
  }catch{return Array(NUM_SLOTS).fill(null);}
}

export function saveSlot(idx:number,name:string,state:ProjectState):void{
  const slots=getSlots();
  slots[idx]={name:name.trim()||`Project ${idx+1}`,date:new Date().toISOString(),state};
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(slots));}
  catch(e){console.warn('project save failed',e);} // skipcq: JS-0002
}

export function deleteSlot(idx:number):void{
  const slots=getSlots();
  slots[idx]=null;
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(slots));}
  catch(e){console.warn('project delete failed',e);} // skipcq: JS-0002
}

export function exportProject(name:string,state:ProjectState):void{
  const blob=new Blob([JSON.stringify({ks_version:1,name,...state},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  const safe=(name||'project').replace(/[^a-z0-9_-]/gi,'-').toLowerCase();
  a.download=`ks-${safe}-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function importProject(file:File):Promise<ProjectState>{
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const obj=JSON.parse(e.target?.result as string);
        if(!obj||!Array.isArray(obj.pBank))throw new Error('Invalid project file (missing pBank)');
        resolve(obj as ProjectState);
      }catch(err){reject(err);}
    };
    reader.onerror=()=>reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export function fmtDate(iso:string):string{
  try{
    const d=new Date(iso);
    return d.toLocaleDateString(undefined,{month:'short',day:'numeric'})
      +' '+d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
  }catch{return iso;}
}
