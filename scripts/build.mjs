import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import solc from 'solc';
const root=fileURLToPath(new URL('../',import.meta.url));
export function compile(){
  const sources=Object.fromEntries(['APTreasury.sol','MockUSDC.sol'].map(name=>[name,{content:fs.readFileSync(path.join(root,'contracts',name),'utf8')} ]));
  const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:'paris',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}})));
  const errors=(output.errors||[]).filter(e=>e.severity==='error');if(errors.length)throw Error(errors.map(e=>e.formattedMessage).join('\n'));
  fs.mkdirSync(path.join(root,'build'),{recursive:true});
  for(const [source,contracts]of Object.entries(output.contracts))for(const [name,c]of Object.entries(contracts))if(c.evm.bytecode.object)fs.writeFileSync(path.join(root,'build',name+'.json'),JSON.stringify({contractName:name,compiler:solc.version(),abi:c.abi,bytecode:'0x'+c.evm.bytecode.object,deployedBytecode:'0x'+c.evm.deployedBytecode.object},null,2)+'\n');
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  compile();
  for(const dir of ['src','scripts'])for(const name of fs.readdirSync(path.join(root,dir)).filter(n=>n.endsWith('.mjs'))){const r=spawnSync(process.execPath,['--check',path.join(root,dir,name)],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);}
  console.log('Build passed: Solidity contracts compiled and JavaScript syntax checked.');
}
