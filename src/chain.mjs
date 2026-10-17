import fs from 'node:fs';
import path from 'node:path';
import {JsonRpcProvider,Contract,Interface,id,keccak256} from 'ethers';
import {initiateDeveloperControlledWalletsClient} from '@circle-fin/developer-controlled-wallets';
import {initiateSmartContractPlatformClient} from '@circle-fin/smart-contract-platform';
import {randomUUID} from 'node:crypto';
import {requireTestnet,writePrivate} from './config.mjs';
import {money,units,categoryId} from './policy.mjs';

const fee={type:'level',config:{feeLevel:'MEDIUM'}};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export class ArcTreasury {
  constructor(config){
    requireTestnet(config);this.config=config;
    this.wallets=JSON.parse(fs.readFileSync(config.walletsFile,'utf8'));
    if(this.wallets.blockchain!=='ARC-TESTNET')throw Error('Wallet file must target Arc testnet.');
    const params={apiKey:config.env.CIRCLE_API_KEY,entitySecret:config.env.CIRCLE_ENTITY_SECRET};
    this.circle=initiateDeveloperControlledWalletsClient(params);this.contracts=initiateSmartContractPlatformClient(params);
    this.provider=new JsonRpcProvider(config.rpc);
    this.artifact=JSON.parse(fs.readFileSync(path.join(config.root,'build/APTreasury.json')));
    this.iface=new Interface(this.artifact.abi);this.deploymentFile=path.join(config.dataDir,'deployment.json');
  }
  async network(){if(Number((await this.provider.getNetwork()).chainId)!==5042002)throw Error('RPC is not Arc testnet.');}
  async wait(id_){
    for(let n=0;n<120;n++){
      const r=await this.circle.getTransaction({id:id_});const tx=r.data.transaction;
      if(['FAILED','DENIED','CANCELLED'].includes(tx.state))throw Error(`Circle transaction ${tx.state}.`);
      if(['CONFIRMED','COMPLETE'].includes(tx.state)&&tx.txHash){
        const receipt=await this.provider.getTransactionReceipt(tx.txHash);
        if(receipt){if(receipt.status!==1)throw Error('Onchain transaction reverted.');return {txId:id_,txHash:tx.txHash,receipt};}
      }
      await sleep(1500);
    }
    throw Error('Transaction still pending; rerun to reconcile the same intent.');
  }
  async load(){
    await this.network();
    if(!fs.existsSync(this.deploymentFile))throw Error('Run prepare-testnet before payment execution.');
    this.deployment=JSON.parse(fs.readFileSync(this.deploymentFile,'utf8'));
    if(!this.deployment.address)throw Error('Contract deployment is incomplete; rerun prepare-testnet.');
    this.contract=new Contract(this.deployment.address,this.artifact.abi,this.provider);
    await this.verifyConfiguration();
  }
  async verifyConfiguration(){
    const p=this.config.policy,w=this.wallets.wallets;
    const checks=await Promise.all([this.contract.usdc(),this.contract.operator(),this.contract.owner(),this.contract.autoLimit(),this.contract.perTransactionLimit(),this.contract.totalBudget()]);
    const expected=[p.usdc,w['agent-treasury'].address,w['owner-approver'].address,units(money(p.autoLimitUSDC)),units(money(p.perTransactionLimitUSDC)),units(money(p.totalBudgetUSDC))];
    if(checks.some((v,i)=>String(v).toLowerCase()!==String(expected[i]).toLowerCase()))throw Error('Deployed treasury does not match local policy.');
    for(const v of p.vendors)if(!await this.contract.allowedVendor(w[v.wallet].address))throw Error('Vendor missing from onchain allowlist.');
    for(const [name,budget] of Object.entries(p.categories))if(await this.contract.categoryBudget(categoryId(name))!==units(money(budget)))throw Error('Category budget mismatch.');
  }
  async prepare({fund='3.00'}={}){
    await this.network();const p=this.config.policy,w=this.wallets.wallets;
    if(money(fund)>money(p.totalBudgetUSDC))throw Error('Test funding exceeds treasury budget.');
    const constructorParameters=[p.usdc,w['owner-approver'].address,w['agent-treasury'].address,p.vendors.map(v=>w[v.wallet].address),Object.keys(p.categories).map(categoryId),Object.values(p.categories).map(v=>units(money(v)).toString()),units(money(p.autoLimitUSDC)).toString(),units(money(p.perTransactionLimitUSDC)).toString(),units(money(p.totalBudgetUSDC)).toString()];
    const fingerprint=keccak256(new Interface(this.artifact.abi).encodeDeploy(constructorParameters)+this.artifact.bytecode.slice(2));
    let state=fs.existsSync(this.deploymentFile)?JSON.parse(fs.readFileSync(this.deploymentFile)): {idempotencyKey:randomUUID(),fingerprint};
    if(state.fingerprint!==fingerprint)throw Error('Deployment policy changed; use a new data directory rather than overwriting the existing treasury.');
    writePrivate(this.deploymentFile,state);
    if(!state.contractId){
      // Preserve the nested constructor arrays using the documented REST payload.
      const entitySecretCiphertext=await this.circle.generateEntitySecretCiphertext();
      const response=await fetch('https://api.circle.com/v1/w3s/contracts/deploy',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${this.config.env.CIRCLE_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({name:'Deep Skill AP Treasury',description:'Testnet AP policy',blockchain:'ARC-TESTNET',walletId:w['agent-treasury'].id,abiJson:JSON.stringify(this.artifact.abi),bytecode:this.artifact.bytecode,constructorParameters,feeLevel:'MEDIUM',idempotencyKey:state.idempotencyKey,entitySecretCiphertext})});
      if(!response.ok)throw Error(`Circle contract deployment failed (HTTP ${response.status}).`);
      const r=await response.json();state={...state,...r.data};writePrivate(this.deploymentFile,state);
    }
    if(!state.address){
      const tx=await this.wait(state.transactionId);const c=await this.contracts.getContract({id:state.contractId});
      state={...state,address:c.data.contract.contractAddress,txHash:tx.txHash,blockNumber:tx.receipt.blockNumber};
      if(!state.address)throw Error('Circle contract address is not available yet.');writePrivate(this.deploymentFile,state);
    }
    await this.load();
    const token=new Contract(p.usdc,['function balanceOf(address) view returns(uint256)'],this.provider);
    const balance=await token.balanceOf(state.address);
    if(balance===0n && money(fund)>0){
      if(!state.fundingKey){state.fundingKey=randomUUID();writePrivate(this.deploymentFile,state);}
      let txId=state.fundingTxId;
      if(!txId){const r=await this.circle.createContractExecutionTransaction({walletId:w['agent-treasury'].id,contractAddress:p.usdc,abiFunctionSignature:'transfer(address,uint256)',abiParameters:[state.address,units(money(fund)).toString()],fee,idempotencyKey:state.fundingKey});txId=r.data.id;state.fundingTxId=txId;writePrivate(this.deploymentFile,state);}
      const tx=await this.wait(txId);state.fundingTxHash=tx.txHash;writePrivate(this.deploymentFile,state);
    }
    return {address:state.address,txHash:state.txHash,balanceUSDC:(await token.balanceOf(state.address)).toString(),decimals:6};
  }
  async isPaid(key){return this.contract.paid(key);}
  async capacity(vendor,amountCents){
    const p=this.config.policy;const block=await this.provider.getBlock('latest');const period=BigInt(Math.floor(block.timestamp/(30*86400)));
    const amount=units(amountCents);
    const [spent,categorySpent,balance]=await Promise.all([this.contract.totalSpent(period),this.contract.categorySpent(period,categoryId(vendor.category)),new Contract(p.usdc,['function balanceOf(address) view returns(uint256)'],this.provider).balanceOf(this.deployment.address)]);
    if(spent+amount>units(money(p.totalBudgetUSDC)))return 'total_budget_exceeded';
    if(categorySpent+amount>units(money(p.categories[vendor.category])))return 'category_budget_exceeded';
    if(balance<amount)return 'insufficient_testnet_treasury';return null;
  }
  async pay(key,vendor,amountCents,reason,intent,onSubmitted){
    const address=this.wallets.wallets[vendor.wallet].address;
    const callData=this.iface.encodeFunctionData('pay',[key,address,units(amountCents),categoryId(vendor.category),id(reason)]);
    let txId=intent.tx_id;
    if(!txId){
      const r=await this.circle.createContractExecutionTransaction({walletId:this.wallets.wallets['agent-treasury'].id,contractAddress:this.deployment.address,callData,fee,idempotencyKey:intent.idempotency_key,refId:key.slice(2)});
      txId=r.data.id;if(!txId)throw Error('Circle returned no transaction identifier.');onSubmitted(txId);
    }
    const confirmed=await this.wait(txId);
    const payment=confirmed.receipt.logs.filter(log=>log.address.toLowerCase()===this.deployment.address.toLowerCase()).map(log=>{try{return this.iface.parseLog(log);}catch{return null;}}).find(log=>log?.name==='Payment'&&log.args.invoiceRef===key);
    if(!payment || payment.args.vendor.toLowerCase()!==address.toLowerCase() || payment.args.amount!==units(amountCents) || payment.args.category!==categoryId(vendor.category))throw Error('Onchain receipt does not match payment intent.');
    return {txId,txHash:confirmed.txHash};
  }
}
