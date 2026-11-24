import * as THREE from 'three';
const d64=(s,T)=>{const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return new T(u.buffer)};
export async function loadHuman(url){
  const H=await (await fetch(url)).json();
  const pos=d64(H.pos,Float32Array),idx=d64(H.idx,Uint16Array),si=d64(H.si,Uint8Array),swb=d64(H.sw,Uint8Array);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setIndex(new THREE.BufferAttribute(idx,1));
  const sw=new Float32Array(swb.length);for(let i=0;i<sw.length;i++)sw[i]=swb[i]/255;
  g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(Uint16Array.from(si),4));g.setAttribute('skinWeight',new THREE.BufferAttribute(sw,4));
  g.computeVertexNormals();
  const col=new Float32Array(pos.length).fill(1);g.setAttribute('color',new THREE.BufferAttribute(col,3));
  const bones=H.bones.map(b=>{const o=new THREE.Bone();o.name=b.n;return o});
  H.bones.forEach((b,i)=>{const h=new THREE.Vector3(...b.h);if(b.p>=0){bones[b.p].add(bones[i]);h.sub(new THREE.Vector3(...H.bones[b.p].h))}bones[i].position.copy(h)});
  const mat=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.58,metalness:0});
  const mesh=new THREE.SkinnedMesh(g,mat);mesh.add(bones[0]);mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow=true;
  const masks={};for(const k in H.mask){const u=d64(H.mask[k],Uint8Array);masks[k]=Float32Array.from(u,v=>v/255)}
  const B={};bones.forEach(b=>B[b.name]=b);
  return {mesh,B,masks,col,g,nv:H.nv,bonesData:H.bones};
}
